import { z } from "zod";
import { and, eq, desc, isNull, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  crmDeals,
  crmActivities,
  crmDealDesigns,
  crmEmailLog,
  emailSettings,
  kitchenDesigns,
  affiliates,
  orderRequests,
  proApplications,
  salesCommissions,
  users,
} from "../../drizzle/schema";
import nodemailer from "nodemailer";
import {
  CRM_STAGES,
  CRM_PRIORITIES,
  CRM_ACTIVITY_KINDS,
  CRM_LANGUAGES,
  isClosedStage,
  crmEmailBlockedReason,
  crmEmailBodyToHtml,
  type CrmStage,
} from "@shared/crm";
import {
  SALES_REP_COMMISSION_CENTS,
  shouldCreateCommission,
} from "@shared/salesPrograms";

/**
 * Record a flat $400 commission when a deal owned by a sales rep transitions to
 * "won". Idempotent: the sales_commissions.dealId unique constraint guarantees
 * at most one commission per deal even under races / repeated transitions.
 * Only the deal's owner earns it, and only if that owner is a sales_rep.
 */
async function recordSalesCommissionOnWon(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  deal: typeof crmDeals.$inferSelect,
): Promise<void> {
  if (!deal.ownerUserId) return;
  // Already recorded for this deal?
  const existing = await db
    .select({ id: salesCommissions.id })
    .from(salesCommissions)
    .where(eq(salesCommissions.dealId, deal.id))
    .limit(1);
  // Owner must be a sales rep, and the shared rule must approve creation.
  const ownerRows = await db.select().from(users).where(eq(users.id, deal.ownerUserId)).limit(1);
  const owner = ownerRows[0];
  if (!owner) return;
  const ok = shouldCreateCommission({
    ownerRole: owner.role,
    nextStage: "won",
    previousStage: null,
    commissionAlreadyExists: !!existing[0],
  });
  if (!ok) return;
  try {
    await db.insert(salesCommissions).values({
      dealId: deal.id,
      repUserId: owner.id,
      repName: owner.name ?? owner.email ?? "Sales Rep",
      amountCents: SALES_REP_COMMISSION_CENTS,
      status: "pending",
      dealTitle: deal.title,
      wonAt: new Date(),
    });
  } catch {
    // Unique violation under a race — another path already recorded it. Safe to ignore.
  }
}

// ─── Scope resolution ──────────────────────────────────────────────────────────
// Admin (role === "admin") sees the HOUSE board: deals where affiliateId IS NULL.
// A partner/affiliate user sees ONLY their own affiliate's deals.
// We resolve the caller's affiliate by linked userId first, then by email.

type Ctx = { user: { id: number; email: string | null; role: string } };

async function resolveMyAffiliateId(ctx: Ctx): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const email = (ctx.user.email ?? "").toLowerCase();
  const rows = await db.select().from(affiliates);
  const mine =
    rows.find((r) => r.userId === ctx.user.id) ??
    rows.find((r) => (r.email ?? "").toLowerCase() === email && email.length > 0);
  return mine?.id ?? null;
}

/**
 * Returns the scope for the caller:
 *  - admin or designer → { kind: "house" } (affiliateId IS NULL deals)
 *    (designer = internal sales staff with CRM-only admin access)
 *  - partner with an affiliate → { kind: "affiliate", affiliateId }
 * Throws FORBIDDEN if a non-house caller has no affiliate.
 */
async function resolveScope(
  ctx: Ctx,
): Promise<{ kind: "house" } | { kind: "affiliate"; affiliateId: number }> {
  if (ctx.user.role === "admin" || ctx.user.role === "designer" || ctx.user.role === "sales_rep")
    return { kind: "house" };
  const affiliateId = await resolveMyAffiliateId(ctx);
  if (affiliateId == null) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No affiliate account is linked to your login.",
    });
  }
  return { kind: "affiliate", affiliateId };
}

function scopeWhere(scope: { kind: "house" } | { kind: "affiliate"; affiliateId: number }) {
  return scope.kind === "house"
    ? isNull(crmDeals.affiliateId)
    : eq(crmDeals.affiliateId, scope.affiliateId);
}

// Verify a deal belongs to the caller's scope; returns the deal or throws.
async function getOwnedDeal(
  ctx: Ctx,
  dealId: number,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const scope = await resolveScope(ctx);
  const rows = await db
    .select()
    .from(crmDeals)
    .where(and(eq(crmDeals.id, dealId), scopeWhere(scope)));
  const deal = rows[0];
  if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found in your pipeline." });
  return { db, scope, deal };
}

const dealCoreInput = {
  title: z.string().min(1).max(256),
  stage: z.enum(CRM_STAGES).optional(),
  priority: z.enum(CRM_PRIORITIES).optional(),
  contactName: z.string().max(256).nullable().optional(),
  contactEmail: z.string().max(320).nullable().optional(),
  contactPhone: z.string().max(32).nullable().optional(),
  company: z.string().max(256).nullable().optional(),
  location: z.string().max(256).nullable().optional(),
  language: z.enum(CRM_LANGUAGES).optional(),
  estimatedValue: z.number().min(0).nullable().optional(),
  nextFollowUpAt: z.number().int().nullable().optional(), // epoch ms
  notes: z.string().max(8000).nullable().optional(),
};

export const crmRouter = router({
  // ── Board: all deals grouped by stage for the caller's scope ────────────────
  board: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      return {
        scope: "house" as "house" | "affiliate",
        affiliateId: null as number | null,
        deals: [] as (typeof crmDeals.$inferSelect)[],
      };
    }
    const scope = await resolveScope(ctx);
    const deals = await db
      .select()
      .from(crmDeals)
      .where(scopeWhere(scope))
      .orderBy(crmDeals.boardOrder, desc(crmDeals.updatedAt));
    return {
      scope: scope.kind as "house" | "affiliate",
      affiliateId: (scope.kind === "affiliate" ? scope.affiliateId : null) as number | null,
      deals,
    };
  }),

  // ── Deal detail + its activity timeline ─────────────────────────────────────
  deal: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      const activities = await db
        .select()
        .from(crmActivities)
        .where(eq(crmActivities.dealId, deal.id))
        .orderBy(desc(crmActivities.createdAt));
      const linkedDesigns = await db
        .select()
        .from(crmDealDesigns)
        .where(eq(crmDealDesigns.dealId, deal.id))
        .orderBy(desc(crmDealDesigns.createdAt));
      const emails = await db
        .select()
        .from(crmEmailLog)
        .where(eq(crmEmailLog.dealId, deal.id))
        .orderBy(desc(crmEmailLog.sentAt));
      return { deal, activities, linkedDesigns, emails };
    }),

  // ── Saved designs the caller can attach (their own, by name) ────────────────
  linkableDesigns: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: kitchenDesigns.id,
        name: kitchenDesigns.name,
        updatedAt: kitchenDesigns.updatedAt,
      })
      .from(kitchenDesigns)
      .where(eq(kitchenDesigns.userId, ctx.user.id))
      .orderBy(desc(kitchenDesigns.updatedAt));
    return rows;
  }),

  // ── Attach a saved design to a deal (snapshots the name) ────────────────────
  linkDesign: protectedProcedure
    .input(z.object({ dealId: z.number().int(), designId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      // The design must belong to the caller.
      const dRows = await db
        .select()
        .from(kitchenDesigns)
        .where(
          and(
            eq(kitchenDesigns.id, input.designId),
            eq(kitchenDesigns.userId, ctx.user.id)
          )
        )
        .limit(1);
      const design = dRows[0];
      if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
      // Avoid duplicate links.
      const existing = await db
        .select()
        .from(crmDealDesigns)
        .where(
          and(
            eq(crmDealDesigns.dealId, deal.id),
            eq(crmDealDesigns.designId, design.id)
          )
        )
        .limit(1);
      if (existing[0]) return { ok: true, alreadyLinked: true };
      await db.insert(crmDealDesigns).values({
        dealId: deal.id,
        designId: design.id,
        designName: design.name,
        linkedByUserId: ctx.user.id,
      });
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
      return { ok: true };
    }),

  // ── Detach a linked design from a deal ──────────────────────────────────────
  unlinkDesign: protectedProcedure
    .input(z.object({ dealId: z.number().int(), linkId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      await db
        .delete(crmDealDesigns)
        .where(
          and(
            eq(crmDealDesigns.id, input.linkId),
            eq(crmDealDesigns.dealId, deal.id)
          )
        );
      return { ok: true };
    }),

  // ── Create a deal in the caller's scope ─────────────────────────────────────
  create: protectedProcedure
    .input(z.object(dealCoreInput))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      const stage = (input.stage ?? "new") as CrmStage;
      const res = await db.insert(crmDeals).values({
        affiliateId: scope.kind === "affiliate" ? scope.affiliateId : null,
        ownerUserId: ctx.user.id,
        title: input.title,
        stage,
        priority: input.priority ?? "medium",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        company: input.company ?? null,
        location: input.location ?? null,
        language: input.language ?? "en",
        estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
        source: "manual",
        nextFollowUpAt: input.nextFollowUpAt != null ? new Date(input.nextFollowUpAt) : null,
        notes: input.notes ?? null,
        closedAt: isClosedStage(stage) ? new Date() : null,
      });
      const insertId = (res as unknown as [{ insertId: number }])[0].insertId;
      return { id: insertId };
    }),

  // ── Update deal fields ──────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({ id: z.number().int(), ...dealCoreInput, title: z.string().min(1).max(256).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.contactName !== undefined) patch.contactName = input.contactName;
      if (input.contactEmail !== undefined) patch.contactEmail = input.contactEmail;
      if (input.contactPhone !== undefined) patch.contactPhone = input.contactPhone;
      if (input.company !== undefined) patch.company = input.company;
      if (input.location !== undefined) patch.location = input.location;
      if (input.language !== undefined) patch.language = input.language;
      if (input.estimatedValue !== undefined)
        patch.estimatedValue = input.estimatedValue != null ? String(input.estimatedValue) : null;
      if (input.nextFollowUpAt !== undefined)
        patch.nextFollowUpAt = input.nextFollowUpAt != null ? new Date(input.nextFollowUpAt) : null;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.stage !== undefined && input.stage !== deal.stage) {
        patch.stage = input.stage;
        patch.closedAt = isClosedStage(input.stage as CrmStage) ? new Date() : null;
      }
      if (Object.keys(patch).length > 0) {
        await db.update(crmDeals).set(patch).where(eq(crmDeals.id, deal.id));
      }
      // Newly won → record the sales-rep commission (idempotent, sales reps only).
      if (input.stage === "won" && deal.stage !== "won") {
        await recordSalesCommissionOnWon(db, deal);
      }
      return { ok: true };
    }),

  // ── Move a deal to a new stage (board drag) ─────────────────────────────────
  moveStage: protectedProcedure
    .input(z.object({ id: z.number().int(), stage: z.enum(CRM_STAGES), boardOrder: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      const changed = input.stage !== deal.stage;
      await db
        .update(crmDeals)
        .set({
          stage: input.stage,
          boardOrder: input.boardOrder ?? deal.boardOrder,
          closedAt: isClosedStage(input.stage) ? new Date() : null,
        })
        .where(eq(crmDeals.id, deal.id));
      if (changed) {
        await db.insert(crmActivities).values({
          dealId: deal.id,
          authorUserId: ctx.user.id,
          kind: "stage_change",
          body: `Stage changed from ${deal.stage} to ${input.stage}`,
        });
      }
      // Newly won → record the sales-rep commission (idempotent, sales reps only).
      if (input.stage === "won" && deal.stage !== "won") {
        await recordSalesCommissionOnWon(db, deal);
      }
      return { ok: true };
    }),

  // ── Add an activity / note / task to a deal ─────────────────────────────────
  addActivity: protectedProcedure
    .input(
      z.object({
        dealId: z.number().int(),
        kind: z.enum(CRM_ACTIVITY_KINDS).optional(),
        body: z.string().min(1).max(8000),
        dueAt: z.number().int().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      await db.insert(crmActivities).values({
        dealId: deal.id,
        authorUserId: ctx.user.id,
        kind: input.kind ?? "note",
        body: input.body,
        dueAt: input.dueAt != null ? new Date(input.dueAt) : null,
      });
      // touch the deal so it sorts to the top of its column
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
      return { ok: true };
    }),

  // ── Sent-email history for a deal ────────────────────────────────────────────
  emailLog: protectedProcedure
    .input(z.object({ dealId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);
      return db
        .select()
        .from(crmEmailLog)
        .where(eq(crmEmailLog.dealId, deal.id))
        .orderBy(desc(crmEmailLog.sentAt));
    }),

  // ── SMTP readiness for the composer (no secrets returned) ────────────────────
  emailReadiness: protectedProcedure.query(async ({ ctx }) => {
    // Any CRM-scoped caller may check; scope is enforced on send.
    await resolveScope(ctx);
    const db = await getDb();
    if (!db) return { configured: false, enabled: false, from: "" };
    const rows = await db.select().from(emailSettings).limit(1);
    const s = rows[0];
    const configured = !!(s?.smtpHost && s?.smtpUser && s?.smtpPass);
    return {
      configured,
      enabled: s?.enabled ?? false,
      from: s?.smtpFrom || s?.smtpUser || "",
    };
  }),

  // ── Send an email to the deal contact via the site's saved SMTP ──────────────
  // Sends from the saved smtpFrom (e.g. sales@cabinetdealz.com), logs the email
  // on the deal (crm_email_log) and drops an "email" activity on the timeline.
  // Blocks with a helpful reason when SMTP is not configured or disabled.
  sendEmail: protectedProcedure
    .input(
      z.object({
        dealId: z.number().int(),
        to: z.string().email(),
        subject: z.string().min(1).max(512),
        body: z.string().min(1).max(20000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.dealId);

      // Load SMTP settings + evaluate readiness (shared, unit-tested guard).
      const rows = await db.select().from(emailSettings).limit(1);
      const s = rows[0];
      const configured = !!(s?.smtpHost && s?.smtpUser && s?.smtpPass);
      const blocked = crmEmailBlockedReason({ configured, enabled: s?.enabled ?? false });
      if (blocked) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: blocked, // "not_configured" | "disabled" — client maps to a friendly message
        });
      }

      const from = (s!.smtpFrom || s!.smtpUser).trim();
      const senderName = ctx.user.email ?? String(ctx.user.id);

      // Send via nodemailer using the saved transport.
      try {
        const transport = nodemailer.createTransport({
          host: s!.smtpHost,
          port: s!.smtpPort,
          secure: s!.smtpPort === 465,
          auth: { user: s!.smtpUser, pass: s!.smtpPass },
        });
        await transport.sendMail({
          from,
          to: input.to,
          subject: input.subject,
          text: input.body,
          html: crmEmailBodyToHtml(input.body),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Send failed: ${msg}` });
      }

      // Persist a durable log row + timeline activity.
      await db.insert(crmEmailLog).values({
        dealId: deal.id,
        toEmail: input.to,
        fromEmail: from,
        subject: input.subject,
        body: input.body,
        sentByUserId: ctx.user.id,
        sentByName: senderName,
      });
      await db.insert(crmActivities).values({
        dealId: deal.id,
        authorUserId: ctx.user.id,
        kind: "email",
        body: `Email sent to ${input.to} — ${input.subject}`,
      });
      await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
      return { ok: true };
    }),

  // ── Toggle a task activity done/undone ──────────────────────────────────────
  toggleTask: protectedProcedure
    .input(z.object({ activityId: z.number().int(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(crmActivities).where(eq(crmActivities.id, input.activityId));
      const act = rows[0];
      if (!act) throw new TRPCError({ code: "NOT_FOUND" });
      // ownership check via the parent deal
      await getOwnedDeal(ctx, act.dealId);
      await db.update(crmActivities).set({ done: input.done }).where(eq(crmActivities.id, act.id));
      return { ok: true };
    }),

  // ── Delete a deal (and its activities) ──────────────────────────────────────
  remove: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { db, deal } = await getOwnedDeal(ctx, input.id);
      await db.delete(crmActivities).where(eq(crmActivities.dealId, deal.id));
      await db.delete(crmDeals).where(eq(crmDeals.id, deal.id));
      return { ok: true };
    }),

  // ── Importable leads: platform activity not yet a deal in this scope ─────────
  // Admin: pro applications + house (unattributed) order requests.
  // Affiliate: their own referred order requests.
  importableLeads: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { orderRequests: [], proApplications: [] };
    const scope = await resolveScope(ctx);

    // already-imported source ids in this scope
    const existing = await db.select().from(crmDeals).where(scopeWhere(scope));
    const usedOrderReqIds = new Set(existing.map((d) => d.orderRequestId).filter(Boolean) as number[]);
    const usedProAppIds = new Set(existing.map((d) => d.proApplicationId).filter(Boolean) as number[]);

    if (scope.kind === "affiliate") {
      const reqs = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.affiliateId, scope.affiliateId))
        .orderBy(desc(orderRequests.createdAt));
      return {
        orderRequests: reqs.filter((r) => !usedOrderReqIds.has(r.id)).slice(0, 50),
        proApplications: [],
      };
    }

    // house/admin
    const reqs = await db
      .select()
      .from(orderRequests)
      .where(isNull(orderRequests.affiliateId))
      .orderBy(desc(orderRequests.createdAt));
    const apps = await db
      .select()
      .from(proApplications)
      .orderBy(desc(proApplications.createdAt));
    return {
      orderRequests: reqs.filter((r) => !usedOrderReqIds.has(r.id)).slice(0, 50),
      proApplications: apps.filter((a) => !usedProAppIds.has(a.id)).slice(0, 50),
    };
  }),

  // ── Import a platform lead into the pipeline as a new deal ───────────────────
  importLead: protectedProcedure
    .input(
      z.object({
        type: z.enum(["order_request", "pro_application"]),
        id: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const scope = await resolveScope(ctx);
      const affiliateId = scope.kind === "affiliate" ? scope.affiliateId : null;

      if (input.type === "order_request") {
        const rows = await db.select().from(orderRequests).where(eq(orderRequests.id, input.id));
        const r = rows[0];
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        // affiliate scope can only import their own referred requests
        if (scope.kind === "affiliate" && r.affiliateId !== scope.affiliateId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const res = await db.insert(crmDeals).values({
          affiliateId,
          ownerUserId: ctx.user.id,
          title: `Order ${r.requestNumber}${r.originatorName ? ` — ${r.originatorName}` : ""}`,
          stage: "qualified",
          priority: "medium",
          contactName: r.originatorName ?? null,
          contactEmail: r.originatorEmail ?? null,
          contactPhone: r.originatorPhone ?? null,
          location: r.zip ?? null,
          estimatedValue: r.totalAmount ?? null,
          source: "order_request",
          orderRequestId: r.id,
          referralCode: r.referralCode ?? null,
        });
        return { id: (res as unknown as [{ insertId: number }])[0].insertId };
      }

      // pro_application (admin-only source)
      if (scope.kind === "affiliate") throw new TRPCError({ code: "FORBIDDEN" });
      const rows = await db.select().from(proApplications).where(eq(proApplications.id, input.id));
      const a = rows[0];
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      const res = await db.insert(crmDeals).values({
        affiliateId: null,
        ownerUserId: ctx.user.id,
        title: `Pro — ${a.companyName}`,
        stage: "new",
        priority: "medium",
        contactName: a.contactName,
        contactEmail: a.email,
        contactPhone: a.phone ?? null,
        company: a.companyName,
        location: a.baseZip ?? null,
        source: "pro_application",
        proApplicationId: a.id,
      });
      return { id: (res as unknown as [{ insertId: number }])[0].insertId };
    }),

  // ── Request a quote from a saved design (member-facing) ──────────────────────
  // Creates a HOUSE deal (affiliateId NULL) so the Cabinet Dealz sales team picks
  // it up, then links the saved design. Usable by ANY logged-in member regardless
  // of affiliate scope (does NOT call resolveScope). Idempotent-ish: if the design
  // is already linked to an open house deal, it reuses that deal.
  requestQuoteFromDesign: protectedProcedure
    .input(
      z.object({
        designId: z.number().int(),
        contactName: z.string().max(256).nullable().optional(),
        contactEmail: z.string().max(320).nullable().optional(),
        contactPhone: z.string().max(32).nullable().optional(),
        estimatedValue: z.number().min(0).nullable().optional(),
        notes: z.string().max(8000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // The design must belong to the caller.
      const dRows = await db
        .select()
        .from(kitchenDesigns)
        .where(and(eq(kitchenDesigns.id, input.designId), eq(kitchenDesigns.userId, ctx.user.id)))
        .limit(1);
      const design = dRows[0];
      if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });

      // If this design is already linked to a house deal, reuse it.
      const links = await db
        .select()
        .from(crmDealDesigns)
        .where(eq(crmDealDesigns.designId, design.id));
      for (const link of links) {
        const existingDeal = await db
          .select()
          .from(crmDeals)
          .where(and(eq(crmDeals.id, link.dealId), isNull(crmDeals.affiliateId)))
          .limit(1);
        if (existingDeal[0]) {
          await db
            .update(crmDeals)
            .set({ updatedAt: new Date() })
            .where(eq(crmDeals.id, existingDeal[0].id));
          return { id: existingDeal[0].id, reused: true };
        }
      }

      // Build a sensible title from the project/room/design name.
      const job = design.projectName?.trim();
      const room = design.roomLabel?.trim();
      const who = (input.contactName ?? "").trim();
      const baseLabel = job
        ? `${job}${room ? ` — ${room}` : ""}`
        : design.name;
      const title = who ? `${baseLabel} — ${who}` : baseLabel;

      const res = await db.insert(crmDeals).values({
        affiliateId: null, // house deal
        ownerUserId: ctx.user.id,
        title: title.slice(0, 256),
        stage: "new",
        priority: "medium",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? ctx.user.email ?? null,
        contactPhone: input.contactPhone ?? null,
        company: design.projectName ?? null,
        estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
        source: "storefront",
        notes:
          input.notes ??
          `Quote requested from the Design Tool. Room type: ${design.roomType ?? "kitchen"}.`,
      });
      const dealId = (res as unknown as [{ insertId: number }])[0].insertId;

      await db.insert(crmDealDesigns).values({
        dealId,
        designId: design.id,
        designName: design.name,
        linkedByUserId: ctx.user.id,
      });

            return { id: dealId, reused: false };
    }),

  // ── Sales-rep commissions: list (admin) ────────────────────────────────────
  // Admin sees all commissions; a sales rep sees only their own.
  listCommissions: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "paid", "void", "all"]).default("all") }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [] as (typeof salesCommissions.$inferSelect)[];
      const isStaff = ["admin"].includes(ctx.user.role);
      const conds = [];
      if (!isStaff) {
        if (ctx.user.role !== "sales_rep") return [];
        conds.push(eq(salesCommissions.repUserId, ctx.user.id));
      }
      const status = input?.status ?? "all";
      if (status !== "all") conds.push(eq(salesCommissions.status, status));
      return db
        .select()
        .from(salesCommissions)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(salesCommissions.wonAt))
        .limit(500);
    }),

  // ── Sales-rep commissions: mark paid / void (admin only) ────────────────────
  setCommissionStatus: adminProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["pending", "paid", "void"]), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const patch: Partial<typeof salesCommissions.$inferInsert> = { status: input.status };
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.status === "paid") {
        patch.paidAt = new Date();
        patch.paidByUserId = ctx.user.id;
      } else {
        patch.paidAt = null;
        patch.paidByUserId = null;
      }
      await db.update(salesCommissions).set(patch).where(eq(salesCommissions.id, input.id));
      return { ok: true };
    }),
});
// (exported helpers kept internal; inArray imported for potential batch ops)
void inArray;
