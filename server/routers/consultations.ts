import { z } from "zod";
import { randomBytes } from "crypto";
import { and, eq, gt, gte, desc, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  publicProcedure,
  protectedProcedure,
  designerProcedure,
  router,
} from "../_core/trpc";
import { getDb } from "../db";
import {
  designerAvailability,
  designConsultations,
  crmDeals,
  crmActivities,
  users,
  kitchenDesigns,
  affiliates,
} from "../../drizzle/schema";
import { affiliateSlugFromHostCandidates } from "../lib/affiliateSubdomain";
import {
  CONSULTATION_AFFILIATE_SLUG_COOKIE,
  CONSULTATION_REFERRAL_COOKIE,
  ConsultationAttributionError,
  readRequestCookie,
  resolveBookedConsultationAffiliate,
} from "../lib/consultationAffiliate";

const MODES = ["video", "phone", "in_person"] as const;

function fmtWhen(d: Date): string {
  // Compact UTC-ish label for CRM notes; the UI shows local time separately.
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const consultationsRouter = router({
  // ── Public: list bookable open slots in the future (next 30 days) ───────────
  // Optionally filter by a specific designer. Only "open" slots that start in
  // the future are returned, soonest first.
  openSlots: publicProcedure
    .input(
      z
        .object({
          designerUserId: z.number().int().optional(),
          mode: z.enum(MODES).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as Array<typeof designerAvailability.$inferSelect>;
      const now = new Date();
      const conds = [eq(designerAvailability.status, "open"), gt(designerAvailability.startAt, now)];
      if (input?.designerUserId) conds.push(eq(designerAvailability.designerUserId, input.designerUserId));
      if (input?.mode) conds.push(eq(designerAvailability.mode, input.mode));
      const rows = await db
        .select()
        .from(designerAvailability)
        .where(and(...conds))
        .orderBy(asc(designerAvailability.startAt))
        .limit(200);
      return rows;
    }),

  // ── Public: which designers currently have open future slots ────────────────
  availableDesigners: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as Array<{ designerUserId: number; designerName: string | null; openCount: number }>;
    const now = new Date();
    const rows = await db
      .select()
      .from(designerAvailability)
      .where(and(eq(designerAvailability.status, "open"), gt(designerAvailability.startAt, now)));
    const byDesigner = new Map<number, { designerUserId: number; designerName: string | null; openCount: number }>();
    for (const r of rows) {
      const cur = byDesigner.get(r.designerUserId) ?? {
        designerUserId: r.designerUserId,
        designerName: r.designerName,
        openCount: 0,
      };
      cur.openCount += 1;
      byDesigner.set(r.designerUserId, cur);
    }
    return Array.from(byDesigner.values()).sort((a, b) => b.openCount - a.openCount);
  }),

  // ── Public/visitor: book an open slot ───────────────────────────────────────
  // Anyone (guest or logged in) may book. We claim the slot transactionally
  // (guarding against double-booking), snapshot the time, create the
  // consultation, and spawn a CRM deal in the referring store (or the house
  // pipeline when no store resolves) plus a meeting activity.
  book: publicProcedure
    .input(
      z.object({
        slotId: z.number().int(),
        customerName: z.string().min(1).max(256),
        customerEmail: z.string().email().max(320),
        customerPhone: z.string().max(32).optional(),
        topic: z.string().max(1000).optional(),
        designId: z.number().int().optional(),
        designName: z.string().max(256).optional(),
        // Storefront path (/store/:slug) and the persisted referral code.
        // Both are looked up server-side. A numeric affiliate id is not accepted.
        affiliateSlug: z.string().trim().max(255).optional(),
        referralCode: z.string().trim().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const slotRows = await db
        .select()
        .from(designerAvailability)
        .where(eq(designerAvailability.id, input.slotId))
        .limit(1);
      const slot = slotRows[0];
      if (!slot) throw new TRPCError({ code: "NOT_FOUND", message: "That time slot no longer exists." });
      if (slot.status !== "open") {
        throw new TRPCError({ code: "CONFLICT", message: "Sorry, that time was just booked. Please pick another." });
      }
      if (new Date(slot.startAt).getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That time has already passed." });
      }

      const hostSlug = affiliateSlugFromHostCandidates([
        ctx.req.headers["x-original-host"],
        ctx.req.headers["x-forwarded-host"],
        ctx.req.headers["x-host"],
        ctx.req.hostname,
        ctx.req.headers.host,
      ]);
      const cookieHeader = ctx.req.headers.cookie;
      let affiliateId: number | null = null;
      try {
        affiliateId = await resolveBookedConsultationAffiliate(
          {
            findBySlug: async (slug) => {
              const rows = await db
                .select({
                  id: affiliates.id,
                  status: affiliates.status,
                  storefrontEnabled: affiliates.storefrontEnabled,
                  referralCode: affiliates.referralCode,
                })
                .from(affiliates)
                .where(eq(affiliates.slug, slug))
                .limit(1);
              return rows[0] ?? null;
            },
            findByReferralCode: async (code) => {
              const rows = await db
                .select({
                  id: affiliates.id,
                  status: affiliates.status,
                  referralCode: affiliates.referralCode,
                })
                .from(affiliates)
                .where(eq(affiliates.referralCode, code))
                .limit(1);
              return rows[0] ?? null;
            },
          },
          {
            affiliateSlug: input.affiliateSlug,
            referralCode: input.referralCode,
            hostSlug,
            cookieSlug: readRequestCookie(cookieHeader, CONSULTATION_AFFILIATE_SLUG_COOKIE),
            cookieReferralCode: readRequestCookie(cookieHeader, CONSULTATION_REFERRAL_COOKIE),
          },
        );
      } catch (error) {
        if (error instanceof ConsultationAttributionError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }

      if (input.designId) {
        const designRows = await db
          .select({ affiliateId: kitchenDesigns.affiliateId })
          .from(kitchenDesigns)
          .where(eq(kitchenDesigns.id, input.designId))
          .limit(1);
        const design = designRows[0];
        if (design && (design.affiliateId ?? null) !== affiliateId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This saved plan and referral belong to different stores.",
          });
        }
      }

      // Claim the slot; the WHERE status='open' guard makes this idempotent under
      // a race — only one booking can flip it.
      const claim = await db
        .update(designerAvailability)
        .set({ status: "booked" })
        .where(and(eq(designerAvailability.id, slot.id), eq(designerAvailability.status, "open")));
      const claimed = (claim as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
      if (!claimed) {
        throw new TRPCError({ code: "CONFLICT", message: "Sorry, that time was just booked. Please pick another." });
      }

      // Spawn the CRM deal in the store that referred this booking.
      const dealRes = await db.insert(crmDeals).values({
        affiliateId,
        ownerUserId: slot.designerUserId,
        title: `Design consult — ${input.customerName}`,
        stage: "new",
        priority: "high",
        contactName: input.customerName,
        contactEmail: input.customerEmail,
        contactPhone: input.customerPhone ?? null,
        source: "manual",
        nextFollowUpAt: slot.startAt,
        notes: input.topic ? `Consultation topic: ${input.topic}` : null,
      });
      const dealId = (dealRes as unknown as [{ insertId: number }])[0].insertId;

      // Record the consultation.
      const consRes = await db.insert(designConsultations).values({
        slotId: slot.id,
        designerUserId: slot.designerUserId,
        designerName: slot.designerName ?? null,
        customerUserId: ctx.user?.id ?? null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone ?? null,
        designId: input.designId ?? null,
        designName: input.designName ?? null,
        startAt: slot.startAt,
        endAt: slot.endAt,
        mode: slot.mode,
        topic: input.topic ?? null,
        status: "requested",
        dealId,
        affiliateId,
      });
      const consultationId = (consRes as unknown as [{ insertId: number }])[0].insertId;

      // Meeting activity on the deal timeline.
      await db.insert(crmActivities).values({
        dealId,
        authorUserId: slot.designerUserId,
        kind: "meeting",
        body:
          `Professional design consultation booked for ${fmtWhen(slot.startAt)} (${slot.mode}). ` +
          `Customer: ${input.customerName} <${input.customerEmail}>` +
          (input.customerPhone ? `, ${input.customerPhone}` : "") +
          (input.designName ? `. Design: ${input.designName}` : "") +
          (input.topic ? `. Topic: ${input.topic}` : ""),
        dueAt: slot.startAt,
      });

      return { ok: true, consultationId, dealId };
    }),

  // ── Designer: my availability (future + recent), newest window first ─────────
  myAvailability: designerProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [] as Array<typeof designerAvailability.$inferSelect>;
    const scopeAll = ctx.user.role === "admin";
    const rows = await db
      .select()
      .from(designerAvailability)
      .where(scopeAll ? undefined : eq(designerAvailability.designerUserId, ctx.user.id))
      .orderBy(asc(designerAvailability.startAt))
      .limit(500);
    return rows;
  }),

  // ── Designer: add a bookable slot ───────────────────────────────────────────
  addSlot: designerProcedure
    .input(
      z.object({
        startAt: z.number().int(), // epoch ms (UTC)
        endAt: z.number().int(),
        mode: z.enum(MODES).default("video"),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.endAt <= input.startAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End time must be after start time." });
      }
      // Resolve a display name for the designer.
      const me = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const designerName = me[0]?.name ?? me[0]?.email ?? "Designer";
      const res = await db.insert(designerAvailability).values({
        designerUserId: ctx.user.id,
        designerName,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        mode: input.mode,
        status: "open",
        notes: input.notes ?? null,
      });
      const id = (res as unknown as [{ insertId: number }])[0].insertId;
      return { id };
    }),

  // ── Designer: remove / block a slot (only if not booked) ────────────────────
  removeSlot: designerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(designerAvailability).where(eq(designerAvailability.id, input.id)).limit(1);
      const slot = rows[0];
      if (!slot) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && slot.designerUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your slot." });
      }
      if (slot.status === "booked") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This slot is booked. Cancel the consultation first." });
      }
      await db.delete(designerAvailability).where(eq(designerAvailability.id, slot.id));
      return { ok: true };
    }),

  // ── Designer: list consultations booked against my slots ────────────────────
  // Designer or admin only. A designer sees rows assigned to them. An admin sees
  // every designer booking (the internal Consultations screen). This is not the
  // affiliate Appointments feed; that query is affiliates.myConsultations.
  myConsultations: designerProcedure
    .input(z.object({ status: z.enum(["requested", "confirmed", "completed", "cancelled", "all"]).default("all") }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [] as Array<typeof designConsultations.$inferSelect>;
      const scopeAll = ctx.user.role === "admin";
      const conds = [];
      if (!scopeAll) conds.push(eq(designConsultations.designerUserId, ctx.user.id));
      const status = input?.status ?? "all";
      if (status !== "all") conds.push(eq(designConsultations.status, status));
      const rows = await db
        .select()
        .from(designConsultations)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(designConsultations.startAt))
        .limit(500);
      return rows;
    }),

  // ── Designer: update a consultation's status ────────────────────────────────
  setConsultationStatus: designerProcedure
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["requested", "confirmed", "completed", "cancelled"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(designConsultations).where(eq(designConsultations.id, input.id)).limit(1);
      const cons = rows[0];
      if (!cons) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && cons.designerUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your consultation." });
      }
      await db.update(designConsultations).set({ status: input.status }).where(eq(designConsultations.id, cons.id));
      // If cancelled, re-open the slot so it can be booked again.
      if (input.status === "cancelled") {
        await db
          .update(designerAvailability)
          .set({ status: "open" })
          .where(eq(designerAvailability.id, cons.slotId));
      }
      // Log to the CRM deal timeline.
      if (cons.dealId) {
        await db.insert(crmActivities).values({
          dealId: cons.dealId,
          authorUserId: ctx.user.id,
          kind: "note",
          body: `Consultation marked ${input.status}.`,
        });
      }
      return { ok: true };
    }),

  // ── Designer: set the voice meeting URL + ensure a share token exists ────────
  // Generates the read-only "share live with customer" follow link (shareToken)
  // on first use, and stores the Meet/Zoom/phone link for the voice side.
  updateMeeting: designerProcedure
    .input(
      z.object({
        id: z.number().int(),
        meetingUrl: z.string().max(1000).optional(),
        ensureShare: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(designConsultations).where(eq(designConsultations.id, input.id)).limit(1);
      const cons = rows[0];
      if (!cons) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && cons.designerUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your consultation." });
      }
      const patch: Partial<typeof designConsultations.$inferInsert> = {};
      if (input.meetingUrl !== undefined) patch.meetingUrl = input.meetingUrl.trim() || null;
      let shareToken = cons.shareToken ?? null;
      if (input.ensureShare && !shareToken) {
        shareToken = randomBytes(16).toString("hex");
        patch.shareToken = shareToken;
      }
      if (Object.keys(patch).length) {
        await db.update(designConsultations).set(patch).where(eq(designConsultations.id, cons.id));
      }
      return { ok: true, shareToken };
    }),

  // ── Public: read-only "follow" session for the customer ─────────────────────
  // The customer opens /design/session/:token and sees the latest snapshot of
  // the attached saved design (the designer drives from the Design Tool; this
  // page polls for updates). No login, no editing — view only.
  sharedSession: publicProcedure
    .input(z.object({ token: z.string().min(8).max(40) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db
        .select()
        .from(designConsultations)
        .where(eq(designConsultations.shareToken, input.token))
        .limit(1);
      const cons = rows[0];
      if (!cons) throw new TRPCError({ code: "NOT_FOUND", message: "This session link is not valid." });

      let design: { id: number; name: string; roomData: unknown; placedCabinets: unknown; selectedStyleId: number | null; roomType: string | null; updatedAt: Date | null } | null = null;
      if (cons.designId) {
        const dRows = await db
          .select({
            id: kitchenDesigns.id,
            name: kitchenDesigns.name,
            roomData: kitchenDesigns.roomData,
            placedCabinets: kitchenDesigns.placedCabinets,
            selectedStyleId: kitchenDesigns.selectedStyleId,
            roomType: kitchenDesigns.roomType,
            updatedAt: kitchenDesigns.updatedAt,
          })
          .from(kitchenDesigns)
          .where(eq(kitchenDesigns.id, cons.designId))
          .limit(1);
        design = dRows[0] ?? null;
      }

      return {
        consultation: {
          designerName: cons.designerName,
          customerName: cons.customerName,
          startAt: cons.startAt,
          endAt: cons.endAt,
          mode: cons.mode,
          status: cons.status,
          meetingUrl: cons.meetingUrl,
          designName: cons.designName,
        },
        design,
      };
    }),

  // ── Logged-in customer: my own saved designs (to attach when booking) ───────
  myDesigns: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [] as Array<{ id: number; name: string }>;
    const rows = await db
      .select({ id: kitchenDesigns.id, name: kitchenDesigns.name })
      .from(kitchenDesigns)
      .where(eq(kitchenDesigns.userId, ctx.user.id))
      .orderBy(desc(kitchenDesigns.updatedAt))
      .limit(50);
    return rows;
  }),
});
