import { z } from "zod";
import { eq, desc, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  router,
} from "../_core/trpc";
import { getDb } from "../db";
import { affiliates, orderRequests, affiliateStyleBranding, doorStyles } from "../../drizzle/schema";
import {
  normalizeReferralCode,
  slugify,
  deriveReferralCode,
  sumCommission,
} from "@shared/affiliate";

// Public-safe projection of an affiliate (no internal notes / commission rate).
function toPublicStorefront(a: typeof affiliates.$inferSelect) {
  return {
    id: a.id,
    storeName: a.storeName,
    slug: a.slug,
    contactName: a.contactName,
    email: a.email,
    phone: a.phone,
    website: a.website,
    location: a.location,
    referralCode: a.referralCode,
    status: a.status,
    logoUrl: a.logoUrl,
    primaryColor: a.primaryColor,
    accentColor: a.accentColor,
    heroImageUrl: a.heroImageUrl,
    tagline: a.tagline,
    aboutText: a.aboutText,
    serviceArea: a.serviceArea,
    yearsInBusiness: a.yearsInBusiness,
    facebookUrl: a.facebookUrl,
    instagramUrl: a.instagramUrl,
    storefrontEnabled: a.storefrontEnabled,
    template: a.template,
  };
}

export type StorefrontAffiliate = ReturnType<typeof toPublicStorefront>;

// partnerProcedure: a logged-in user who is the owner (by email) of, or linked
// to, at least one affiliate — or an admin. We resolve the affiliate inside the
// procedure rather than gating purely on role so a freshly-signed-in partner
// (whose account hasn't been linked yet) still gets access by matching email.
const partnerProcedure = protectedProcedure;

async function resolveMyAffiliate(ctx: { user: { id: number; email: string | null; role: string } }) {
  const db = await getDb();
  if (!db) return null;
  const email = (ctx.user.email ?? "").toLowerCase();
  const rows = await db.select().from(affiliates);
  // Match by linked userId first, then by email (case-insensitive).
  const mine =
    rows.find((r) => r.userId === ctx.user.id) ??
    rows.find((r) => (r.email ?? "").toLowerCase() === email && email.length > 0);
  return mine ?? null;
}

const brandingInput = z.object({
  logoUrl: z.string().max(512).nullable().optional(),
  primaryColor: z.string().max(16).nullable().optional(),
  accentColor: z.string().max(16).nullable().optional(),
  heroImageUrl: z.string().max(512).nullable().optional(),
  tagline: z.string().max(256).nullable().optional(),
  aboutText: z.string().max(4000).nullable().optional(),
  serviceArea: z.string().max(256).nullable().optional(),
  yearsInBusiness: z.number().int().min(0).max(200).nullable().optional(),
  facebookUrl: z.string().max(512).nullable().optional(),
  instagramUrl: z.string().max(512).nullable().optional(),
  template: z.enum(["classic", "showcase", "minimal", "craftsman"]).optional(),
});

export const affiliatesRouter = router({
  // ─── Public: storefront by slug ────────────────────────────────────────────
  bySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.slug, input.slug.toLowerCase()))
        .limit(1);
      const a = rows[0];
      if (!a || !a.storefrontEnabled || a.status === "inactive") return null;
      return toPublicStorefront(a);
    }),

  // ─── Public: resolve a referral code (for attribution / validation) ────────
  byCode: publicProcedure
    .input(z.object({ code: z.string().min(1).max(32) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const code = normalizeReferralCode(input.code);
      if (!code) return null;
      const rows = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.referralCode, code))
        .limit(1);
      const a = rows[0];
      if (!a || a.status !== "active") return null;
      return { id: a.id, storeName: a.storeName, slug: a.slug, referralCode: a.referralCode };
    }),

  // ─── Public: list active storefronts (directory) ───────────────────────────
  listActive: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(affiliates)
      .where(eq(affiliates.status, "active"))
      .orderBy(desc(affiliates.createdAt));
    return rows.filter((r) => r.storefrontEnabled).map(toPublicStorefront);
  }),

  // ─── Admin: full list ──────────────────────────────────────────────────────
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(affiliates).orderBy(desc(affiliates.createdAt));
  }),

  adminGet: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(affiliates).where(eq(affiliates.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  // ─── Admin: create an affiliate ────────────────────────────────────────────
  adminCreate: adminProcedure
    .input(
      z
        .object({
          storeName: z.string().min(1).max(256),
          contactName: z.string().max(256).optional(),
          email: z.string().email().max(320),
          phone: z.string().max(32).optional(),
          website: z.string().max(512).optional(),
          location: z.string().max(256).optional(),
          slug: z.string().max(64).optional(),
          referralCode: z.string().max(32).optional(),
          commissionRate: z.number().min(0).max(1).optional(), // fraction, e.g. 0.05
          status: z.enum(["active", "paused", "inactive"]).default("active"),
          notes: z.string().max(2000).optional(),
        })
        .merge(brandingInput)
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const slug = slugify(input.slug || input.storeName);
      const referralCode = normalizeReferralCode(input.referralCode || deriveReferralCode(input.storeName));
      if (!slug)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not derive a storefront slug from the name." });

      // Ensure slug + code are unique.
      const existing = await db
        .select()
        .from(affiliates)
        .where(or(eq(affiliates.slug, slug), eq(affiliates.referralCode, referralCode)));
      if (existing.some((e) => e.slug === slug))
        throw new TRPCError({ code: "CONFLICT", message: `Storefront slug "${slug}" is already taken.` });
      if (existing.some((e) => e.referralCode === referralCode))
        throw new TRPCError({ code: "CONFLICT", message: `Referral code "${referralCode}" is already in use.` });

      const result = await db.insert(affiliates).values({
        storeName: input.storeName,
        slug,
        contactName: input.contactName ?? null,
        email: input.email,
        phone: input.phone ?? null,
        website: input.website ?? null,
        location: input.location ?? null,
        referralCode,
        commissionRate: (input.commissionRate ?? 0.05).toFixed(4),
        status: input.status,
        logoUrl: input.logoUrl ?? null,
        primaryColor: input.primaryColor ?? null,
        accentColor: input.accentColor ?? null,
        heroImageUrl: input.heroImageUrl ?? null,
        tagline: input.tagline ?? null,
        aboutText: input.aboutText ?? null,
        serviceArea: input.serviceArea ?? null,
        yearsInBusiness: input.yearsInBusiness ?? null,
        facebookUrl: input.facebookUrl ?? null,
        instagramUrl: input.instagramUrl ?? null,
        template: input.template ?? "classic",
        notes: input.notes ?? null,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { id: insertId, slug, referralCode };
    }),

  // ─── Admin: update an affiliate ────────────────────────────────────────────
  adminUpdate: adminProcedure
    .input(
      z
        .object({
          id: z.number(),
          storeName: z.string().min(1).max(256).optional(),
          contactName: z.string().max(256).nullable().optional(),
          email: z.string().email().max(320).optional(),
          phone: z.string().max(32).nullable().optional(),
          website: z.string().max(512).nullable().optional(),
          location: z.string().max(256).nullable().optional(),
          commissionRate: z.number().min(0).max(1).optional(),
          status: z.enum(["active", "paused", "inactive"]).optional(),
          storefrontEnabled: z.boolean().optional(),
          notes: z.string().max(2000).nullable().optional(),
        })
        .merge(brandingInput)
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { id, commissionRate, ...rest } = input;
      const set: Record<string, unknown> = { ...rest };
      if (commissionRate !== undefined) set.commissionRate = commissionRate.toFixed(4);
      // Remove undefined keys so we only update provided fields.
      Object.keys(set).forEach((k) => set[k] === undefined && delete set[k]);
      if (Object.keys(set).length === 0) return { id };
      await db.update(affiliates).set(set).where(eq(affiliates.id, id));
      return { id };
    }),

  // ─── Partner: my affiliate profile ─────────────────────────────────────────
  myAffiliate: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return null;
    // Auto-link the account on first visit so future lookups are by userId.
    if (mine.userId !== ctx.user.id) {
      const db = await getDb();
      if (db) {
        await db.update(affiliates).set({ userId: ctx.user.id }).where(eq(affiliates.id, mine.id));
      }
    }
    return mine;
  }),

  // ─── Partner: update my storefront branding ────────────────────────────────
  updateMyStorefront: partnerProcedure
    .input(brandingInput.merge(z.object({ storefrontEnabled: z.boolean().optional() })))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const set: Record<string, unknown> = { ...input };
      Object.keys(set).forEach((k) => set[k] === undefined && delete set[k]);
      if (Object.keys(set).length > 0) {
        await db.update(affiliates).set(set).where(eq(affiliates.id, mine.id));
      }
      return { id: mine.id };
    }),

  // ─── Partner: my referrals + commission summary ────────────────────────────
  myReferrals: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return null;
    const db = await getDb();
    if (!db) return null;
    const orders = await db
      .select()
      .from(orderRequests)
      .where(eq(orderRequests.affiliateId, mine.id))
      .orderBy(desc(orderRequests.createdAt));
    const rate = Number(mine.commissionRate);
    const summary = sumCommission(
      orders.map((o) => ({ totalAmount: o.totalAmount === null ? null : Number(o.totalAmount), status: o.status })),
      rate
    );
    return {
      affiliate: mine,
      orders,
      summary,
      commissionRate: rate,
    };
  }),

  // ─── Partner: white-label branding + markup ────────────────────────────────
  // Returns the affiliate's markup config + their per-style overrides joined to
  // the central active door styles (so the UI can show "central name → my name").
  myBranding: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return null;
    const db = await getDb();
    if (!db) return null;
    const styles = await db
      .select({ id: doorStyles.id, ourName: doorStyles.ourName, styleCode: doorStyles.styleCode, doorStyle: doorStyles.doorStyle, color: doorStyles.color, thumbnailImageUrl: doorStyles.thumbnailImageUrl })
      .from(doorStyles)
      .where(eq(doorStyles.isActive, true));
    const overrides = await db
      .select()
      .from(affiliateStyleBranding)
      .where(eq(affiliateStyleBranding.affiliateId, mine.id));
    const byStyle = new Map(overrides.map((o) => [o.styleId, o]));
    let categoryMarkup: Record<string, number> = {};
    try {
      if (mine.categoryMarkupJson) categoryMarkup = JSON.parse(mine.categoryMarkupJson);
    } catch { categoryMarkup = {}; }
    return {
      affiliateId: mine.id,
      defaultMarkupBps: mine.defaultMarkupBps,
      categoryMarkup,
      styles: styles
        .map((s) => ({
          ...s,
          override: byStyle.get(s.id) ?? null,
        }))
        .sort((a, b) => (a.ourName || "").localeCompare(b.ourName || "")),
    };
  }),

  updateMyMarkup: partnerProcedure
    .input(z.object({
      defaultMarkupBps: z.number().int().min(0).max(50000).optional(),
      categoryMarkup: z.record(z.string(), z.number().int().min(0).max(50000)).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const set: Record<string, unknown> = {};
      if (input.defaultMarkupBps !== undefined) set.defaultMarkupBps = input.defaultMarkupBps;
      if (input.categoryMarkup !== undefined) set.categoryMarkupJson = JSON.stringify(input.categoryMarkup);
      if (Object.keys(set).length > 0) {
        await db.update(affiliates).set(set).where(eq(affiliates.id, mine.id));
      }
      return { id: mine.id };
    }),

  // Upsert (or clear) one per-style override. Pass brandName=null & markupBps=null
  // to reset a style back to central name + default markup.
  upsertStyleBranding: partnerProcedure
    .input(z.object({
      styleId: z.number().int(),
      brandName: z.string().max(256).nullable().optional(),
      markupBps: z.number().int().min(0).max(50000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const existing = await db
        .select()
        .from(affiliateStyleBranding)
        .where(eq(affiliateStyleBranding.affiliateId, mine.id));
      const row = existing.find((r) => r.styleId === input.styleId);
      const brandName = input.brandName === undefined ? row?.brandName ?? null : (input.brandName?.trim() || null);
      const markupBps = input.markupBps === undefined ? row?.markupBps ?? null : input.markupBps;
      if (row) {
        await db.update(affiliateStyleBranding)
          .set({ brandName, markupBps })
          .where(eq(affiliateStyleBranding.id, row.id));
      } else {
        await db.insert(affiliateStyleBranding).values({
          affiliateId: mine.id, styleId: input.styleId, brandName, markupBps,
        });
      }
      return { styleId: input.styleId, brandName, markupBps };
    }),

  // ─── Admin: referrals for one affiliate ────────────────────────────────────
  adminReferrals: adminProcedure
    .input(z.object({ affiliateId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1);
      const a = rows[0];
      if (!a) return null;
      const orders = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.affiliateId, a.id))
        .orderBy(desc(orderRequests.createdAt));
      const rate = Number(a.commissionRate);
      const summary = sumCommission(
        orders.map((o) => ({ totalAmount: o.totalAmount === null ? null : Number(o.totalAmount), status: o.status })),
        rate
      );
      return { affiliate: a, orders, summary, commissionRate: rate };
    }),
});
