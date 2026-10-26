import { z } from "zod";
import { randomBytes } from "node:crypto";
import { eq, desc, or, and, inArray, sql, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import { TRPCError } from "@trpc/server";
import {
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  router,
} from "../_core/trpc";
import { getDb } from "../db";
import { affiliates, affiliateTestimonials, orderRequests, affiliateStyleBranding, affiliateDistributorSelections, affiliateFeaturedDistributorEvents, doorStyles, distributors, distributorSkus, affiliatePayouts, affiliateBannerSchedules, affiliatePromoDiscounts, designConsultations, designLeads, affiliateTeamMembers, emailSettings, affiliateHardwareCommissionSnapshots, users } from "../../drizzle/schema";
import { emailSettingsReady, sendEmailViaSettings } from "../email";
import { buildSalesDemoInvite, deliverInviteThenGrant, SALES_DEMO_AFFILIATE_SLUG, SALES_DEMO_TEAM_ACCESS } from "../salesDemoInvite";
import { buildAffiliateSetupInvite } from "../affiliateSetupInvite";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { computeEarning, dollarsToCents, groupByWeek, isoWeekKey, isoWeekStart } from "@shared/earnings";
import {
  normalizeReferralCode,
  slugify,
  deriveReferralCode,
  sumCommission,
} from "@shared/affiliate";
import { EMBED_CODE_MAX_LENGTH, embedCodeHasErrors } from "@shared/embedCode";
import { reavesWayAffiliateDefaults } from "@shared/affiliateBlueprint";
import { affiliateNonCompeteEnforcementNote } from "@shared/affiliateNonCompete";
import { AFFILIATE_STOREFRONT_TEMPLATE_IDS, type AffiliateStorefrontTemplate } from "@shared/affiliateStorefrontTemplates";
import { importAffiliateWebsiteDraft } from "../lib/affiliateWebsiteImport";
import { assertAffiliateSocialEditor } from "../lib/affiliateSocialAccess";
import { legacySocialColumns, mergeLegacySocialColumns, publicSocialLinks } from "@shared/affiliateSocialLinks";

type HardwareCommissionSnapshotFact = {
  hardwareMerchandiseCents: number;
  commissionCents: number;
};

/** Existing affiliate rate applies to non-hardware merchandise; paid hardware uses its immutable 25% snapshot. */
function orderCommissionCents(
  orderTotalCents: number,
  commissionRate: number,
  hardwareSnapshot?: HardwareCommissionSnapshotFact,
): number {
  const nonHardwareCents = Math.max(0, orderTotalCents - (hardwareSnapshot?.hardwareMerchandiseCents ?? 0));
  return computeEarning({ customerTotalCents: nonHardwareCents, commissionRate }).commissionCents
    + (hardwareSnapshot?.commissionCents ?? 0);
}

/** Cabinet supply lines that are currently active and have a published SKU.
 * Affiliates may curate only these lines, never a dormant or unpriced source. */
async function availableStorefrontDistributors(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const rows = await db
    .selectDistinct({
      id: distributors.id,
      name: distributors.name,
      initials: distributors.initials,
      brandName: distributors.brandName,
      brandInitials: distributors.brandInitials,
      displayMode: distributors.displayMode,
      seriesName: distributors.seriesName,
      styleId: doorStyles.id,
    })
    .from(distributors)
    .innerJoin(doorStyles, eq(doorStyles.distributorId, distributors.id))
    .innerJoin(distributorSkus, eq(distributorSkus.styleId, doorStyles.id))
    .where(and(
      eq(distributors.isActive, true),
      eq(doorStyles.isActive, true),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.isPublished, true),
    ))
    .orderBy(distributors.name);
  const lines = new Map<number, {
    id: number;
    name: string;
    initials: string;
    brandName: string | null;
    brandInitials: string | null;
    displayMode: "neutral" | "branded" | "series";
    seriesName: string | null;
    styleIds: Set<number>;
  }>();
  for (const row of rows) {
    const line = lines.get(row.id) ?? {
      id: row.id,
      name: row.name,
      initials: row.initials,
      brandName: row.brandName,
      brandInitials: row.brandInitials,
      displayMode: row.displayMode,
      seriesName: row.seriesName,
      styleIds: new Set<number>(),
    };
    line.styleIds.add(row.styleId);
    lines.set(row.id, line);
  }
  return Array.from(lines.values()).map(({ styleIds, ...line }) => {
    const styleCount = styleIds.size;
    const publicName = line.displayMode === "series" && line.seriesName?.trim()
      ? line.seriesName.trim()
      : line.displayMode === "branded" && line.brandName?.trim()
        ? line.brandName.trim()
        : line.name;
    return {
      ...line,
      publicName,
      lineMark: line.displayMode === "branded" && line.brandInitials?.trim()
        ? line.brandInitials.trim()
        : line.initials,
      styleCount,
      description: `${styleCount} active cabinet ${styleCount === 1 ? "style" : "styles"} available for this line.`,
    };
  });
}

async function storefrontCurationForAffiliate(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  affiliateId: number,
) {
  const [distributorsForStore, selections] = await Promise.all([
    availableStorefrontDistributors(db),
    db.select().from(affiliateDistributorSelections)
      .where(eq(affiliateDistributorSelections.affiliateId, affiliateId)),
  ]);
  const selectionByDistributor = new Map(selections.map((selection) => [selection.distributorId, selection]));
  return {
    distributorSelections: distributorsForStore.map((distributor) => ({
      ...distributor,
      selected: selectionByDistributor.has(distributor.id),
      featured: selectionByDistributor.get(distributor.id)?.featured ?? false,
      sortOrder: selectionByDistributor.get(distributor.id)?.sortOrder ?? 0,
    })),
  };
}

const storefrontDistributorSelectionsInput = z.object({
  selections: z.array(z.object({
    distributorId: z.number().int().positive(),
    featured: z.boolean().default(false),
  })).max(100),
});

async function saveStorefrontDistributorSelections(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  affiliateId: number,
  selections: Array<{ distributorId: number; featured: boolean }>,
) {
  const selectedIds = selections.map((selection) => selection.distributorId);
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Each distributor can be selected only once." });
  }
  const available = await availableStorefrontDistributors(db);
  const availableIds = new Set(available.map((distributor) => distributor.id));
  if (selectedIds.some((id) => !availableIds.has(id))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected cabinet lines are not currently available." });
  }

  await db.transaction(async (tx) => {
    await tx.delete(affiliateDistributorSelections)
      .where(eq(affiliateDistributorSelections.affiliateId, affiliateId));
    if (selections.length > 0) {
      await tx.insert(affiliateDistributorSelections).values(
        selections.map((selection, sortOrder) => ({
          affiliateId,
          distributorId: selection.distributorId,
          featured: selection.featured,
          sortOrder,
        })),
      );
    }
  });
  return storefrontCurationForAffiliate(db, affiliateId);
}

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
    publicEmail: a.publicEmail,
    publicPhone: a.publicPhone,
    publicAddress: a.publicAddress,
    heroImageUrl: a.heroImageUrl,
    tagline: a.tagline,
    taglineEs: a.taglineEs,
    aboutText: a.aboutText,
    aboutTextEs: a.aboutTextEs,
    serviceArea: a.serviceArea,
    yearsInBusiness: a.yearsInBusiness,
    facebookUrl: a.facebookUrl,
    instagramUrl: a.instagramUrl,
    socialLinks: publicSocialLinks(a.socialLinks, { facebookUrl: a.facebookUrl, instagramUrl: a.instagramUrl }),
    storefrontEnabled: a.storefrontEnabled,
  template: a.template,
  fontFamily: a.fontFamily,
  headingFont: a.headingFont,
  buttonRadius: a.buttonRadius,
  // Only the PUBLISHED snippet is exposed publicly, and only when enabled.
  // The draft is intentionally never sent to storefront visitors so an
  // in-progress or broken snippet can't affect a live store.
  embedCode: a.embedEnabled ? a.embedCode : null,
  embedEnabled: a.embedEnabled,
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
  // A linked userId is authoritative. Never fall back to an email match when
  // this login is already linked to another affiliate, and never guess when
  // duplicate legacy email rows exist.
  const linked = rows.find((r) => r.userId === ctx.user.id);
  const emailMatches = email.length > 0
    ? rows.filter((r) => (r.email ?? "").toLowerCase() === email)
    : [];
  const mine = linked ?? (emailMatches.length === 1 ? emailMatches[0] : undefined);
  if (mine) return mine;

  // Check if user is a team member of an affiliate
  const teamRows = await db.select().from(affiliateTeamMembers)
    .where(and(
      eq(affiliateTeamMembers.isActive, true),
      or(
        eq(affiliateTeamMembers.userId, ctx.user.id),
        ...(email.length > 0 ? [eq(affiliateTeamMembers.email, email)] : [])
      )
    ));
  if (teamRows.length > 0) {
    const parentAffiliate = rows.find((r) => r.id === teamRows[0].affiliateId);
    return parentAffiliate ?? null;
  }

  // Admin users: resolve to the first active affiliate so admin can use affiliate panels
  if (ctx.user.role === "admin" && rows.length > 0) {
    return rows[0];
  }

  return null;
}

/**
 * Resolve which affiliate a mutation should write to.
 *
 * Admins may pass an explicit affiliateId so they edit the store they are
 * actually looking at. Without this, resolveMyAffiliate falls back to "the first
 * affiliate in the table" for admins, which silently wrote one store's changes
 * onto another. Partners always resolve to their own affiliate and cannot
 * target anyone else, even if they send an affiliateId.
 */
async function requireAffiliateOwner(ctx: { user: { id: number; email: string | null; role: string } }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  if (ctx.user.role === "admin") {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account." });
    return mine;
  }
  const access = await resolveAffiliateAccess(db, ctx.user);
  if (!access?.isOwner) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the affiliate owner can manage team members." });
  }
  const rows = await db.select().from(affiliates).where(eq(affiliates.id, access.affiliateId)).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate account not found." });
  return rows[0];
}

async function resolveTargetAffiliateId(
  ctx: { user: { id: number; role: string; email?: string | null } },
  affiliateId?: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  if (affiliateId !== undefined && ctx.user.role === "admin") {
    const rows = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.id, affiliateId))
      .limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
    return rows[0].id;
  }
  const mine = await resolveMyAffiliate(ctx as Parameters<typeof resolveMyAffiliate>[0]);
  if (!mine)
    throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
  return mine.id;
}

const brandingInput = z.object({
  // (see resolveTargetAffiliateId above for how admin targeting works)
  logoUrl: z.string().max(512).nullable().optional(),
  watermarkEnabled: z.boolean().optional(),
  watermarkPosition: z.literal("bottom-right").optional(),
  watermarkOpacityBps: z.number().int().min(3500).max(9000).optional(),
  primaryColor: z.string().max(16).nullable().optional(),
  accentColor: z.string().max(16).nullable().optional(),
  publicEmail: z.string().email().max(320).nullable().optional(),
  publicPhone: z.string().max(32).nullable().optional(),
  publicAddress: z.string().max(256).nullable().optional(),
  heroImageUrl: z.string().max(512).nullable().optional(),
  tagline: z.string().max(256).nullable().optional(),
  taglineEs: z.string().max(256).nullable().optional(),
  aboutText: z.string().max(4000).nullable().optional(),
  aboutTextEs: z.string().max(4000).nullable().optional(),
  serviceArea: z.string().max(256).nullable().optional(),
  yearsInBusiness: z.number().int().min(0).max(200).nullable().optional(),
  facebookUrl: z.string().max(512).nullable().optional(),
  instagramUrl: z.string().max(512).nullable().optional(),
  template: z.enum(AFFILIATE_STOREFRONT_TEMPLATE_IDS).optional(),
  fontFamily: z.string().max(64).nullable().optional(),
  headingFont: z.string().max(64).nullable().optional(),
  buttonRadius: z.string().max(16).nullable().optional(),
  // Draft snippet only. Publishing is a separate, explicit action so that
  // saving your work never changes what customers see.
  embedCodeDraft: z.string().max(EMBED_CODE_MAX_LENGTH).nullable().optional(),
});

export const affiliatesRouter = router({
  // ─── Affiliate Team Management ────────────────────────────────────────────
  myTeam: partnerProcedure.query(async ({ ctx }) => {
    const mine = await requireAffiliateOwner(ctx);
    if (!mine) return [];
    const db = await getDb();
    if (!db) return [];
    return db.select().from(affiliateTeamMembers)
      .where(eq(affiliateTeamMembers.affiliateId, mine.id))
      .orderBy(desc(affiliateTeamMembers.createdAt));
  }),

  addTeamMember: partnerProcedure
    .input(z.object({
      email: z.string().email().max(320),
      name: z.string().max(256).optional(),
      role: z.enum(["salesperson", "designer"]),
      accessCrm: z.boolean().optional(),
      accessDesigner: z.boolean().optional(),
      accessMarketing: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await requireAffiliateOwner(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(affiliateTeamMembers).values({
        affiliateId: mine.id,
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        role: input.role,
        accessCrm: input.accessCrm ?? true,
        accessDesigner: input.accessDesigner ?? true,
        accessMarketing: input.accessMarketing ?? false,
      });
      return { success: true };
    }),

  updateTeamMemberAccess: partnerProcedure
    .input(z.object({
      id: z.number().int(),
      accessMarketing: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await requireAffiliateOwner(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.update(affiliateTeamMembers)
        .set({ accessMarketing: input.accessMarketing })
        .where(and(eq(affiliateTeamMembers.id, input.id), eq(affiliateTeamMembers.affiliateId, mine.id)));
      return { success: true };
    }),

  removeTeamMember: partnerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const mine = await requireAffiliateOwner(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(affiliateTeamMembers)
        .set({ isActive: false })
        .where(and(eq(affiliateTeamMembers.id, input.id), eq(affiliateTeamMembers.affiliateId, mine.id)));
      return { success: true };
    }),

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
      const testimonials = await db
        .select({ id: affiliateTestimonials.id, quote: affiliateTestimonials.quote, author: affiliateTestimonials.author, sourceUrl: affiliateTestimonials.sourceUrl })
        .from(affiliateTestimonials)
        .where(and(eq(affiliateTestimonials.affiliateId, a.id), eq(affiliateTestimonials.isPublished, true)))
        .orderBy(desc(affiliateTestimonials.createdAt))
        .limit(6);
      return { ...toPublicStorefront(a), testimonials };
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
      return { id: a.id, storeName: a.storeName, slug: a.slug, referralCode: a.referralCode, logoUrl: a.logoUrl ?? null };
    }),

  // ─── Public: template preview — returns mock storefront data for a given template ──
  previewTemplate: publicProcedure
    .input(z.object({ template: z.enum(AFFILIATE_STOREFRONT_TEMPLATE_IDS) }))
    .query(({ input }) => {
      // Returns a fully-populated mock affiliate so the Storefront page can
      // render a live preview without a real database row.
      const names: Record<AffiliateStorefrontTemplate, string> = {
        classic: "Premier Kitchen & Bath",
        showcase: "Showcase Cabinetry Co.",
        minimal: "Studio Cabinet Design",
        craftsman: "Craftsman Cabinet Works",
        coastal: "Coastal Kitchen Studio",
        gallery: "Gallery Cabinet Collective",
        studio: "Studio Cabinet Design",
        heritage: "Heritage Kitchen Works",
      };
      const taglines: Record<AffiliateStorefrontTemplate, string> = {
        classic: "Beautiful Kitchens, Built Around You.",
        showcase: "Your Dream Kitchen Starts Here.",
        minimal: "Clean Lines. Lasting Quality.",
        craftsman: "Crafted for the Way You Live.",
        coastal: "A Brighter Way to Build Your Kitchen.",
        gallery: "Design With Distinction.",
        studio: "Modern Kitchens, Made Personal.",
        heritage: "Built With Care. Designed To Last.",
      };
      return {
        id: 0,
        storeName: names[input.template] ?? "Example Cabinets",
        slug: `preview-${input.template}`,
        contactName: "Demo Contact",
        email: "demo@cabinetdealz.com",
        phone: "(555) 000-0000",
        website: null,
        location: "Sarasota, FL",
        referralCode: "DEMO",
        status: "active" as const,
        logoUrl: null,
        primaryColor: null,
        accentColor: null,
        publicEmail: "hello@example.com",
        publicPhone: "(555) 000-0000",
        publicAddress: "Sarasota, FL",
        heroImageUrl: null,
        tagline: taglines[input.template] ?? "Quality Cabinets at Trade Prices.",
        taglineEs: null,
        aboutText: "This is a live preview of the storefront template. Your store name, logo, colors, and contact info will appear here after setup.",
        aboutTextEs: null,
        serviceArea: "Sarasota & Manatee Counties",
        yearsInBusiness: null,
        facebookUrl: null,
        instagramUrl: null,
        socialLinks: [],
        storefrontEnabled: true,
      template: input.template,
      fontFamily: null,
      headingFont: null,
      buttonRadius: null,
      // Template previews never run third-party embeds.
        embedCode: null,
        embedEnabled: false,
        testimonials: [],
      };
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

  // ─── Admin: minimal affiliate list for the dashboard store switcher ────────
  // adminList returns whole rows (heavy, includes internal notes). The switcher
  // only needs enough to label an option, so keep this small and cacheable.
  adminSwitcherList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: affiliates.id,
        storeName: affiliates.storeName,
        slug: affiliates.slug,
        status: affiliates.status,
      })
      .from(affiliates)
      .orderBy(affiliates.storeName);
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

      const blueprint = reavesWayAffiliateDefaults();
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
        primaryColor: input.primaryColor ?? blueprint.primaryColor,
        accentColor: input.accentColor ?? blueprint.accentColor,
        heroImageUrl: input.heroImageUrl ?? null,
        tagline: input.tagline ?? null,
        taglineEs: input.taglineEs ?? null,
        aboutText: input.aboutText ?? null,
        aboutTextEs: input.aboutTextEs ?? null,
        serviceArea: input.serviceArea ?? null,
        yearsInBusiness: input.yearsInBusiness ?? null,
        facebookUrl: input.facebookUrl ?? null,
        instagramUrl: input.instagramUrl ?? null,
        template: input.template ?? blueprint.template,
        buttonRadius: blueprint.buttonRadius,
        defaultMarkupBps: blueprint.defaultMarkupBps,
        notes: input.notes ?? null,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { id: insertId, slug, referralCode };
    }),

  // ─── Admin: invite a representative or candidate to the isolated Sales Demo ──
  adminInviteSalesDemo: adminProcedure
    .input(z.object({
      email: z.string().email().max(320),
      name: z.string().max(256).optional(),
      audience: z.enum(["sales_representative", "affiliate_candidate"]).default("sales_representative"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [salesDemo] = await db.select().from(affiliates).where(eq(affiliates.slug, SALES_DEMO_AFFILIATE_SLUG)).limit(1);
      if (!salesDemo) throw new TRPCError({ code: "NOT_FOUND", message: "Sales Demo affiliate has not been configured." });

      const email = input.email.trim().toLowerCase();
      const origin = "https://www.cabinetdealz.com";
      const invite = buildSalesDemoInvite({ recipientName: input.name, audience: input.audience, origin });
      const [emailConfig] = await db.select().from(emailSettings).limit(1);
      if (!emailSettingsReady(emailConfig)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Email sending is not configured. Enable SMTP in Admin → Email Settings before sending Sales Demo invitations.",
        });
      }
      const sent = await deliverInviteThenGrant({
        deliver: () => sendEmailViaSettings(emailConfig, {
          to: email,
          subject: invite.subject,
          text: invite.text,
          html: invite.html,
        }),
        grant: async () => {
          const [existing] = await db.select().from(affiliateTeamMembers)
            .where(and(eq(affiliateTeamMembers.affiliateId, salesDemo.id), eq(affiliateTeamMembers.email, email)))
            .limit(1);
          if (existing) {
            await db.update(affiliateTeamMembers).set({
              name: input.name?.trim() || existing.name,
              ...SALES_DEMO_TEAM_ACCESS,
            }).where(eq(affiliateTeamMembers.id, existing.id));
          } else {
            await db.insert(affiliateTeamMembers).values({
              affiliateId: salesDemo.id,
              email,
              name: input.name?.trim() || null,
              ...SALES_DEMO_TEAM_ACCESS,
            });
          }
        },
      });
      if (!sent.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: sent.error ?? "Unable to send the Sales Demo invitation." });
      return { success: true, email, ...invite };
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
      if (typeof set.email === "string") {
        const email = set.email.trim();
        const emailLower = email.toLowerCase();
        const [affiliate] = await db.select({ userId: affiliates.userId }).from(affiliates).where(eq(affiliates.id, id)).limit(1);
        if (affiliate?.userId != null) {
          const duplicate = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.emailLower, emailLower), sql`${users.id} <> ${affiliate.userId}`)).limit(1);
          if (duplicate[0]) throw new TRPCError({ code: "CONFLICT", message: "That email is already used by another login." });
          await db.update(users).set({ email, emailLower }).where(eq(users.id, affiliate.userId));
        }
        set.email = email;
      }
      // Remove undefined keys so we only update provided fields.
      Object.keys(set).forEach((k) => set[k] === undefined && delete set[k]);
      if (Object.keys(set).length === 0) return { id };
      await db.update(affiliates).set(set).where(eq(affiliates.id, id));
      return { id };
    }),
  // ─── Admin: manage the affiliate's sign-in identity ───────────────────────
  // This intentionally creates/updates a normal user account, never an admin
  // account. Affiliate portal access is relationship-scoped; cabinet catalog
  // configuration remains protected by adminProcedure.
  adminManageCredentials: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      email: z.string().email().max(320).optional(),
      password: z.string().min(8).max(128).optional(),
    }).refine((value) => value.email !== undefined || value.password !== undefined, {
      message: "Enter a new email, a new password, or both.",
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, input.id)).limit(1);
      if (!affiliate) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });

      const email = input.email?.trim();
      const emailLower = email?.toLowerCase();
      let userId = affiliate.userId;
      let user = userId == null ? undefined : (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];

      if (emailLower) {
        const duplicateWhere = userId == null
          ? eq(users.emailLower, emailLower)
          : and(eq(users.emailLower, emailLower), sql`${users.id} <> ${userId}`);
        const duplicate = await db.select({ id: users.id, role: users.role }).from(users).where(duplicateWhere).limit(1);
        if (duplicate[0]) throw new TRPCError({ code: "CONFLICT", message: "That email is already used by another login." });
      }

      if (!user) {
        const accountEmail = email ?? affiliate.email?.trim();
        if (!accountEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "An email is required to create the affiliate login." });
        const accountEmailLower = accountEmail.toLowerCase();
        const existing = await db.select().from(users).where(eq(users.emailLower, accountEmailLower)).limit(1);
        if (existing[0]) {
          if (existing[0].role === "admin") throw new TRPCError({ code: "CONFLICT", message: "An administrator account cannot be reassigned to an affiliate." });
          user = existing[0];
          userId = existing[0].id;
        } else {
          const result = await db.insert(users).values({
            openId: `affiliate_${crypto.randomUUID()}`,
            name: affiliate.contactName ?? affiliate.storeName,
            email: accountEmail,
            emailLower: accountEmailLower,
            passwordHash: input.password ? await bcrypt.hash(input.password, 12) : null,
            loginMethod: "password",
            role: "user",
            companyName: affiliate.storeName,
          });
          userId = Number((result as unknown as [{ insertId: number }])[0].insertId);
        }
      }

      if (userId != null && user) {
        const updates: Record<string, unknown> = {};
        if (email) { updates.email = email; updates.emailLower = emailLower; }
        if (input.password) {
          updates.passwordHash = await bcrypt.hash(input.password, 12);
          updates.failedLoginAttempts = 0;
          updates.lockedUntil = null;
          updates.loginMethod = "password";
        }
        // Never elevate an affiliate while repairing credentials.
        if (user.role === "admin") throw new TRPCError({ code: "CONFLICT", message: "An administrator account cannot be used as an affiliate login." });
        if (Object.keys(updates).length) await db.update(users).set(updates).where(eq(users.id, userId));
      }

      const affiliateUpdates: Record<string, unknown> = {};
      if (email) affiliateUpdates.email = email;
      if (userId != null && affiliate.userId !== userId) affiliateUpdates.userId = userId;
      if (Object.keys(affiliateUpdates).length) await db.update(affiliates).set(affiliateUpdates).where(eq(affiliates.id, input.id));
      return { id: input.id, email: email ?? affiliate.email, linkedUserId: userId };
    }),

  // ─── Admin: email a one-time password setup link ─────────────────────────
  // Never send or generate a password on behalf of the affiliate. The token is
  // stored only after SMTP delivery succeeds and is cleared on first use.
  adminSendSetupInvite: adminProcedure
    .input(z.object({ id: z.number().int().positive(), email: z.string().email().max(320) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, input.id)).limit(1);
      if (!affiliate) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });

      const email = input.email.trim();
      const emailLower = email.toLowerCase();
      let userId = affiliate.userId;
      const user = userId == null ? undefined : (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
      if (user?.role === "admin") {
        throw new TRPCError({ code: "CONFLICT", message: "An administrator account cannot be used as an affiliate login." });
      }

      const duplicateWhere = userId == null
        ? eq(users.emailLower, emailLower)
        : and(eq(users.emailLower, emailLower), sql`${users.id} <> ${userId}`);
      const duplicate = await db.select({ id: users.id }).from(users).where(duplicateWhere).limit(1);
      if (duplicate[0]) throw new TRPCError({ code: "CONFLICT", message: "That email is already used by another login. Use a unique affiliate email." });

      const [emailConfig] = await db.select().from(emailSettings).limit(1);
      if (!emailSettingsReady(emailConfig)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email sending is not configured. Enable SMTP in Admin → Email Settings before sending an affiliate setup invitation." });
      }

      const token = randomBytes(48).toString("hex");
      const origin = ctx.req.headers.origin ?? `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const invite = buildAffiliateSetupInvite({ affiliateName: affiliate.storeName, setupToken: token, origin });
      const delivery = await sendEmailViaSettings(emailConfig, { to: email, subject: invite.subject, text: invite.text });
      if (!delivery.success) throw new TRPCError({ code: "BAD_GATEWAY", message: delivery.error ?? "Unable to send the affiliate setup invitation." });

      if (userId == null) {
        const result = await db.insert(users).values({
          openId: `affiliate_${randomBytes(16).toString("hex")}`,
          name: affiliate.contactName ?? affiliate.storeName,
          email,
          emailLower,
          passwordHash: null,
          loginMethod: "password",
          role: "user",
          companyName: affiliate.storeName,
        });
        userId = Number((result as unknown as [{ insertId: number }])[0].insertId);
      } else {
        await db.update(users).set({ email, emailLower, passwordHash: null, loginMethod: "password", failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
      }
      await db.update(affiliates).set({ email, userId, setupToken: token, setupTokenCreatedAt: new Date() }).where(eq(affiliates.id, affiliate.id));
      return { success: true, sentTo: email } as const;
    }),

  // ─── Public: inspect a still-valid affiliate setup link ───────────────────
  getSetupDetails: publicProcedure
    .input(z.object({ token: z.string().length(96) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [affiliate] = await db.select({ id: affiliates.id, storeName: affiliates.storeName, email: affiliates.email, setupTokenCreatedAt: affiliates.setupTokenCreatedAt })
        .from(affiliates).where(eq(affiliates.setupToken, input.token)).limit(1);
      if (!affiliate || !affiliate.setupTokenCreatedAt || Date.now() - affiliate.setupTokenCreatedAt.getTime() > 24 * 60 * 60 * 1000) return null;
      return { id: affiliate.id, storeName: affiliate.storeName, email: affiliate.email };
    }),

  // ─── Public: consume the one-time setup link and set the password ─────────
  completeSetup: publicProcedure
    .input(z.object({ token: z.string().length(96), password: z.string().min(8).max(128) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.setupToken, input.token)).limit(1);
      if (!affiliate || !affiliate.setupTokenCreatedAt || Date.now() - affiliate.setupTokenCreatedAt.getTime() > 24 * 60 * 60 * 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This setup link is invalid or expired. Ask the administrator to send a new invitation." });
      }
      if (!affiliate.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "This affiliate login is not ready yet. Ask the administrator to resend the invitation." });
      await db.update(users).set({ passwordHash: await bcrypt.hash(input.password, 12), loginMethod: "password", failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, affiliate.userId));
      await db.update(affiliates).set({ setupToken: null, setupTokenCreatedAt: null }).where(and(eq(affiliates.id, affiliate.id), eq(affiliates.setupToken, input.token)));
      return { success: true, email: affiliate.email } as const;
    }),

  // A restrictive-covenant allegation must never independently deactivate a site.
  // An administrator explicitly confirms a documented violation before this action
  // writes an inactive status and disables the storefront.
  adminEnforceNonCompeteViolation: adminProcedure
    .input(z.object({
      affiliateId: z.number().int().positive(),
      violationSummary: z.string().trim().min(20).max(2000),
      confirmedViolation: z.literal(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1);
      if (!affiliate) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found" });
      const enforcementNote = affiliateNonCompeteEnforcementNote({ at: new Date(), violationSummary: input.violationSummary });
      const notes = [affiliate.notes?.trim(), enforcementNote].filter(Boolean).join("\n\n");
      await db.update(affiliates).set({ status: "inactive", storefrontEnabled: false, notes }).where(eq(affiliates.id, affiliate.id));
      return { id: affiliate.id, status: "inactive" as const, storefrontEnabled: false, enforcementNote };
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

  myAccess: partnerProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const access = await resolveAffiliateAccess(db, ctx.user);
    if (access) return access;
    if (ctx.user.role === "admin") {
      return { affiliateId: null, isOwner: true, accessCrm: true, accessDesigner: true, accessMarketing: true, teamMemberId: null };
    }
    return null;
  }),

  // ─── Partner: update my storefront branding ────────────────────────────────
  updateMyStorefront: partnerProcedure
    .input(
      brandingInput.merge(
        z.object({
          storefrontEnabled: z.boolean().optional(),
          storeName: z.string().min(1).max(256).optional(),
          // Admins may target a specific affiliate explicitly. Ignored for partners.
          affiliateId: z.number().int().positive().optional(),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { affiliateId, ...fields } = input;
      // Admins can pass an explicit affiliateId so they edit the affiliate they
      // are actually viewing instead of falling back to the first row.
      const targetId = await resolveTargetAffiliateId(ctx, affiliateId);
      const set: Record<string, unknown> = { ...fields };
      Object.keys(set).forEach((k) => set[k] === undefined && delete set[k]);
      if ("facebookUrl" in fields || "instagramUrl" in fields) {
        const [current] = await db
          .select({
            facebookUrl: affiliates.facebookUrl,
            instagramUrl: affiliates.instagramUrl,
            socialLinks: affiliates.socialLinks,
          })
          .from(affiliates)
          .where(eq(affiliates.id, targetId))
          .limit(1);
        const nextFacebook = fields.facebookUrl === undefined ? current?.facebookUrl ?? null : fields.facebookUrl;
        const nextInstagram = fields.instagramUrl === undefined ? current?.instagramUrl ?? null : fields.instagramUrl;
        const changed = (nextFacebook ?? null) !== (current?.facebookUrl ?? null)
          || (nextInstagram ?? null) !== (current?.instagramUrl ?? null);
        if (!changed) {
          delete set.facebookUrl;
          delete set.instagramUrl;
        } else {
          await assertAffiliateSocialEditor(db, ctx.user, targetId);
          const links = mergeLegacySocialColumns(current?.socialLinks, {
            facebookUrl: nextFacebook,
            instagramUrl: nextInstagram,
          }, {
            facebookUrl: current?.facebookUrl,
            instagramUrl: current?.instagramUrl,
          });
          const mirrored = legacySocialColumns(links);
          set.socialLinks = links;
          set.facebookUrl = mirrored.facebookUrl;
          set.instagramUrl = mirrored.instagramUrl;
        }
      }
      if (Object.keys(set).length > 0) {
        await db.update(affiliates).set(set).where(eq(affiliates.id, targetId));
      }
      return { id: targetId };
    }),

  // The provided site is read server-side as a bounded, public HTML document.
  // Nothing is saved by this step: the dashboard shows a draft for the
  // affiliate to explicitly review and apply.
  importWebsiteBrand: partnerProcedure
    .input(z.object({ websiteUrl: z.string().min(3).max(512), affiliateId: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      await resolveTargetAffiliateId(ctx, input.affiliateId);
      try {
        return await importAffiliateWebsiteDraft(input.websiteUrl);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Could not read that public website.",
        });
      }
    }),

  // Applying a website draft is intentionally explicit. Only the values chosen
  // by the affiliate are persisted; testimonials are published records only
  // after selection, never merely because they appeared in imported markup.
  applyWebsiteBrandImport: partnerProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().optional(),
      website: z.string().url().max(512).nullable().optional(),
      storeName: z.string().min(1).max(256).optional(),
      logoUrl: z.string().url().max(512).nullable().optional(),
      primaryColor: z.string().regex(/^#[0-9a-f]{3,8}$/i).nullable().optional(),
      publicEmail: z.string().email().max(320).nullable().optional(),
      publicPhone: z.string().max(32).nullable().optional(),
      publicAddress: z.string().max(256).nullable().optional(),
      aboutText: z.string().max(4000).nullable().optional(),
      facebookUrl: z.string().url().max(512).nullable().optional(),
      instagramUrl: z.string().url().max(512).nullable().optional(),
      testimonials: z.array(z.object({
        quote: z.string().min(12).max(1000),
        author: z.string().max(160).nullable(),
        sourceUrl: z.string().url().max(512),
      })).max(6).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { affiliateId, testimonials, ...fields } = input;
      const targetId = await resolveTargetAffiliateId(ctx, affiliateId);
      const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
      if (Object.keys(patch).length > 0) await db.update(affiliates).set(patch).where(eq(affiliates.id, targetId));

      const existing = await db.select({ quote: affiliateTestimonials.quote, sourceUrl: affiliateTestimonials.sourceUrl })
        .from(affiliateTestimonials)
        .where(eq(affiliateTestimonials.affiliateId, targetId));
      const known = new Set(existing.map((item) => `${item.sourceUrl}\n${item.quote}`));
      const approved = testimonials.filter((item) => !known.has(`${item.sourceUrl}\n${item.quote}`));
      if (approved.length > 0) {
        await db.insert(affiliateTestimonials).values(approved.map((item) => ({
          affiliateId: targetId,
          quote: item.quote,
          author: item.author,
          sourceUrl: item.sourceUrl,
          isPublished: true,
        })));
      }
      return { id: targetId, testimonialsPublished: approved.length };
    }),

  // ─── Partner: publish / unpublish the third-party widget embed ──────────────
  // Publishing is deliberately separate from saving. The affiliate edits and
  // previews `embedCodeDraft` as much as they like; only this call copies the
  // draft into the live `embedCode` column that storefront visitors receive.
  publishEmbedCode: partnerProcedure
    .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const targetId = await resolveTargetAffiliateId(ctx, input?.affiliateId);
      const rows = await db
        .select({ draft: affiliates.embedCodeDraft })
        .from(affiliates)
        .where(eq(affiliates.id, targetId))
        .limit(1);
      const draft = (rows[0]?.draft ?? "").trim();
      if (!draft) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "There is no draft snippet to publish. Paste your widget code and save first.",
        });
      }
      // Re-validate server-side: the client check is a convenience, not a gate.
      if (embedCodeHasErrors(draft)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This snippet failed validation and cannot be published. Fix the errors shown in the editor.",
        });
      }
      await db
        .update(affiliates)
        .set({ embedCode: draft, embedEnabled: true })
        .where(eq(affiliates.id, targetId));
      return { id: targetId, published: true };
    }),

  unpublishEmbedCode: partnerProcedure
    .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const targetId = await resolveTargetAffiliateId(ctx, input?.affiliateId);
      // Keep the draft so the affiliate can re-publish later; just take it live-off.
      await db
        .update(affiliates)
        .set({ embedEnabled: false })
        .where(eq(affiliates.id, targetId));
      return { id: targetId, published: false };
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

  // Engagement is intentionally limited to lines the affiliate explicitly
  // features. Views are anonymous first-party sessions; leads are attributed
  // only after the Designer verifies its incoming featured style.
  myFeaturedDistributorAnalytics: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return [];
    const db = await getDb();
    if (!db) return [];
    const featured = await db
      .select({ id: distributors.id, name: distributors.name, initials: distributors.initials, displayMode: distributors.displayMode, seriesName: distributors.seriesName, brandName: distributors.brandName })
      .from(affiliateDistributorSelections)
      .innerJoin(distributors, eq(distributors.id, affiliateDistributorSelections.distributorId))
      .where(and(eq(affiliateDistributorSelections.affiliateId, mine.id), eq(affiliateDistributorSelections.featured, true)))
      .orderBy(affiliateDistributorSelections.sortOrder, distributors.name);
    if (featured.length === 0) return [];
    const ids = featured.map((line) => line.id);
    const [viewRows, leadRows] = await Promise.all([
      db.select({ distributorId: affiliateFeaturedDistributorEvents.distributorId, count: sql<number>`count(*)` })
        .from(affiliateFeaturedDistributorEvents)
        .where(and(eq(affiliateFeaturedDistributorEvents.affiliateId, mine.id), isNull(affiliateFeaturedDistributorEvents.styleId), inArray(affiliateFeaturedDistributorEvents.distributorId, ids)))
        .groupBy(affiliateFeaturedDistributorEvents.distributorId),
      db.select({ distributorId: designLeads.featuredDistributorId, count: sql<number>`count(*)` })
        .from(designLeads)
        .where(and(eq(designLeads.affiliateId, mine.id), inArray(designLeads.featuredDistributorId, ids)))
        .groupBy(designLeads.featuredDistributorId),
    ]);
    const views = new Map(viewRows.map((row) => [row.distributorId, Number(row.count) || 0]));
    const leads = new Map(leadRows.map((row) => [row.distributorId, Number(row.count) || 0]));
    return featured.map((line) => ({
      distributorId: line.id,
      name: line.displayMode === "series" && line.seriesName?.trim()
        ? line.seriesName.trim()
        : line.displayMode === "branded" && line.brandName?.trim()
          ? line.brandName.trim()
          : line.name,
      lineMark: line.initials,
      views: views.get(line.id) ?? 0,
      leads: leads.get(line.id) ?? 0,
    }));
  }),

  myFeaturedStyleAnalytics: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return [];
    const db = await getDb();
    if (!db) return [];
    const featured = await db
      .select({ styleId: affiliateStyleBranding.styleId, brandName: affiliateStyleBranding.brandName, sortOrder: affiliateStyleBranding.sortOrder, ourName: doorStyles.ourName, styleCode: doorStyles.styleCode, distributorName: distributors.name })
      .from(affiliateStyleBranding)
      .innerJoin(doorStyles, eq(doorStyles.id, affiliateStyleBranding.styleId))
      .innerJoin(distributors, eq(distributors.id, doorStyles.distributorId))
      .where(and(eq(affiliateStyleBranding.affiliateId, mine.id), eq(affiliateStyleBranding.featured, true)))
      .orderBy(affiliateStyleBranding.sortOrder, doorStyles.ourName);
    if (featured.length === 0) return [];
    const ids = featured.map((style) => style.styleId);
    const [viewRows, leadRows] = await Promise.all([
      db.select({ styleId: affiliateFeaturedDistributorEvents.styleId, count: sql<number>`count(*)` })
        .from(affiliateFeaturedDistributorEvents)
        .where(and(eq(affiliateFeaturedDistributorEvents.affiliateId, mine.id), inArray(affiliateFeaturedDistributorEvents.styleId, ids)))
        .groupBy(affiliateFeaturedDistributorEvents.styleId),
      db.select({ styleId: designLeads.featuredStyleId, count: sql<number>`count(*)` })
        .from(designLeads)
        .where(and(eq(designLeads.affiliateId, mine.id), inArray(designLeads.featuredStyleId, ids)))
        .groupBy(designLeads.featuredStyleId),
    ]);
    const views = new Map(viewRows.map((row) => [row.styleId, Number(row.count) || 0]));
    const leads = new Map(leadRows.map((row) => [row.styleId, Number(row.count) || 0]));
    return featured.map((style) => ({
      styleId: style.styleId,
      name: style.brandName?.trim() || style.ourName || style.styleCode || "Unnamed door style",
      distributorName: style.distributorName,
      sortOrder: style.sortOrder,
      views: views.get(style.styleId) ?? 0,
      leads: leads.get(style.styleId) ?? 0,
    }));
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
      .select({ id: doorStyles.id, distributorId: doorStyles.distributorId, ourName: doorStyles.ourName, styleCode: doorStyles.styleCode, doorStyle: doorStyles.doorStyle, color: doorStyles.color, thumbnailImageUrl: doorStyles.thumbnailImageUrl, roomSceneImageUrl: doorStyles.roomSceneImageUrl, doorSampleImageUrl: doorStyles.doorSampleImageUrl })
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
    const curation = await storefrontCurationForAffiliate(db, mine.id);
    return {
      affiliateId: mine.id,
      defaultMarkupBps: mine.defaultMarkupBps,
      hardwareMarkupBps: mine.hardwareMarkupBps,
      categoryMarkup,
      ...curation,
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
      // No business cap on markup per requirement — an affiliate sets whatever
      // margin they want. We keep a large sanity bound (1,000,000 bps = 10,000%)
      // only to prevent integer overflow / nonsense input.
      defaultMarkupBps: z.number().int().min(0).max(1000000).optional(),
      categoryMarkup: z.record(z.string(), z.number().int().min(0).max(1000000)).optional(),
      hardwareMarkupBps: z.number().int().min(0).max(1000000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const set: Record<string, unknown> = {};
      if (input.defaultMarkupBps !== undefined) set.defaultMarkupBps = input.defaultMarkupBps;
      if (input.categoryMarkup !== undefined) set.categoryMarkupJson = JSON.stringify(input.categoryMarkup);
      if (input.hardwareMarkupBps !== undefined) set.hardwareMarkupBps = input.hardwareMarkupBps;
      if (Object.keys(set).length > 0) {
        await db.update(affiliates).set(set).where(eq(affiliates.id, mine.id));
      }
      return { id: mine.id };
    }),

  // Once an affiliate saves at least one selection, their storefront becomes an
  // explicit cabinet-line assortment. Clearing the selections returns to the
  // historical all-active-lines behavior.
  updateMyStorefrontDistributors: partnerProcedure
    .input(storefrontDistributorSelectionsInput)
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return saveStorefrontDistributorSelections(db, mine.id, input.selections);
    }),

  // Upsert (or clear) one per-style override. Pass brandName=null & markupBps=null
  // to reset a style back to central name + default markup.
  upsertStyleBranding: partnerProcedure
    .input(z.object({
      styleId: z.number().int(),
      brandName: z.string().max(256).nullable().optional(),
      // No business cap on per-style markup (blank/null = fall back to default).
      markupBps: z.number().int().min(0).max(1000000).nullable().optional(),
      featured: z.boolean().optional(),
      isEnabled: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
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
      const featured = input.featured === undefined ? (row?.featured ?? false) : input.featured;
      if (featured && !row?.featured) {
        const featuredRows = await db.select({ id: affiliateStyleBranding.id })
          .from(affiliateStyleBranding)
          .where(and(eq(affiliateStyleBranding.affiliateId, mine.id), eq(affiliateStyleBranding.featured, true)));
        if (featuredRows.length >= 6) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You can feature up to 6 door styles. Turn one off before adding another." });
        }
      }
      const isEnabled = input.isEnabled === undefined ? (row?.isEnabled ?? true) : input.isEnabled;
      const sortOrder = input.sortOrder === undefined ? (row?.sortOrder ?? 0) : input.sortOrder;
      if (row) {
        await db.update(affiliateStyleBranding)
          .set({ brandName, markupBps, featured, isEnabled, sortOrder })
          .where(eq(affiliateStyleBranding.id, row.id));
      } else {
        await db.insert(affiliateStyleBranding).values({
          affiliateId: mine.id, styleId: input.styleId, brandName, markupBps, featured, isEnabled, sortOrder,
        });
      }
      return { styleId: input.styleId, brandName, markupBps, featured, isEnabled, sortOrder };
    }),

  reorderFeaturedStyles: partnerProcedure
    .input(z.object({
      styles: z.array(z.object({ styleId: z.number().int().positive(), sortOrder: z.number().int().min(0) })).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const ids = input.styles.map((style) => style.styleId);
      if (new Set(ids).size !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Each featured door style can appear only once." });
      if (ids.length === 0) return { updated: 0 };
      const rows = await db.select({ id: affiliateStyleBranding.id, styleId: affiliateStyleBranding.styleId })
        .from(affiliateStyleBranding)
        .where(and(eq(affiliateStyleBranding.affiliateId, mine.id), eq(affiliateStyleBranding.featured, true), inArray(affiliateStyleBranding.styleId, ids)));
      if (rows.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Only currently featured door styles can be reordered." });
      await db.transaction(async (tx) => {
        for (const style of input.styles) {
          const row = rows.find((candidate) => candidate.styleId === style.styleId);
          if (row) await tx.update(affiliateStyleBranding).set({ sortOrder: style.sortOrder }).where(eq(affiliateStyleBranding.id, row.id));
        }
      });
      return { updated: rows.length };
    }),

  // Upload a room scene photo for a specific door style on this affiliate's storefront
  uploadStyleRoomScene: partnerProcedure
    .input(z.object({
      styleId: z.number().int(),
      fileBase64: z.string(),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `affiliate-room-scenes/${mine.id}/${input.styleId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const existing = await db
        .select()
        .from(affiliateStyleBranding)
        .where(and(eq(affiliateStyleBranding.affiliateId, mine.id), eq(affiliateStyleBranding.styleId, input.styleId)));
      if (existing.length > 0) {
        await db.update(affiliateStyleBranding)
          .set({ roomSceneUrl: url })
          .where(eq(affiliateStyleBranding.id, existing[0].id));
      } else {
        await db.insert(affiliateStyleBranding).values({
          affiliateId: mine.id, styleId: input.styleId, roomSceneUrl: url, featured: false, sortOrder: 0,
        });
      }
      return { url };
    }),

  // ─── Admin: branding + markup for one affiliate ─────────────────────────────
  adminBranding: adminProcedure
    .input(z.object({ affiliateId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1);
      const a = rows[0];
      if (!a) return null;
      const styles = await db
      .select({ id: doorStyles.id, distributorId: doorStyles.distributorId, ourName: doorStyles.ourName, styleCode: doorStyles.styleCode, doorStyle: doorStyles.doorStyle, color: doorStyles.color, thumbnailImageUrl: doorStyles.thumbnailImageUrl, roomSceneImageUrl: doorStyles.roomSceneImageUrl, doorSampleImageUrl: doorStyles.doorSampleImageUrl })
        .from(doorStyles)
        .where(eq(doorStyles.isActive, true));
      const overrides = await db
        .select()
        .from(affiliateStyleBranding)
        .where(eq(affiliateStyleBranding.affiliateId, a.id));
      const byStyle = new Map(overrides.map((o) => [o.styleId, o]));
      let categoryMarkup: Record<string, number> = {};
      try { if (a.categoryMarkupJson) categoryMarkup = JSON.parse(a.categoryMarkupJson); } catch { categoryMarkup = {}; }
      const curation = await storefrontCurationForAffiliate(db, a.id);
      return {
        affiliateId: a.id,
        defaultMarkupBps: a.defaultMarkupBps,
        hardwareMarkupBps: a.hardwareMarkupBps,
        categoryMarkup,
        ...curation,
        styles: styles.map((s) => ({ ...s, override: byStyle.get(s.id) ?? null })).sort((a, b) => (a.ourName || "").localeCompare(b.ourName || "")),
      };
    }),

  adminUpdateMarkup: adminProcedure
    .input(z.object({
      affiliateId: z.number().int(),
      defaultMarkupBps: z.number().int().min(0).max(1000000).optional(),
      categoryMarkup: z.record(z.string(), z.number().int().min(0).max(1000000)).optional(),
      hardwareMarkupBps: z.number().int().min(0).max(1000000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const set: Record<string, unknown> = {};
      if (input.defaultMarkupBps !== undefined) set.defaultMarkupBps = input.defaultMarkupBps;
      if (input.categoryMarkup !== undefined) set.categoryMarkupJson = JSON.stringify(input.categoryMarkup);
      if (input.hardwareMarkupBps !== undefined) set.hardwareMarkupBps = input.hardwareMarkupBps;
      if (Object.keys(set).length > 0) await db.update(affiliates).set(set).where(eq(affiliates.id, input.affiliateId));
      return { id: input.affiliateId };
    }),

  adminUpdateStorefrontDistributors: adminProcedure
    .input(storefrontDistributorSelectionsInput.extend({ affiliateId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [affiliate] = await db.select({ id: affiliates.id }).from(affiliates)
        .where(eq(affiliates.id, input.affiliateId)).limit(1);
      if (!affiliate) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
      return saveStorefrontDistributorSelections(db, affiliate.id, input.selections);
    }),

  adminUpsertStyleBranding: adminProcedure
    .input(z.object({
      affiliateId: z.number().int(),
      styleId: z.number().int(),
      brandName: z.string().max(256).nullable().optional(),
      markupBps: z.number().int().min(0).max(1000000).nullable().optional(),
      featured: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const existing = await db
        .select()
        .from(affiliateStyleBranding)
        .where(and(eq(affiliateStyleBranding.affiliateId, input.affiliateId), eq(affiliateStyleBranding.styleId, input.styleId)))
        .limit(1);
      const row = existing[0];
      const brandName = input.brandName === undefined ? (row?.brandName ?? null) : (input.brandName?.trim() || null);
      const markupBps = input.markupBps === undefined ? (row?.markupBps ?? null) : input.markupBps;
      const featured = input.featured === undefined ? (row?.featured ?? false) : input.featured;
      if (featured && !row?.featured) {
        const featuredRows = await db.select({ id: affiliateStyleBranding.id })
          .from(affiliateStyleBranding)
          .where(and(eq(affiliateStyleBranding.affiliateId, input.affiliateId), eq(affiliateStyleBranding.featured, true)));
        if (featuredRows.length >= 6) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You can feature up to 6 door styles. Turn one off before adding another." });
        }
      }
      if (row) {
        await db.update(affiliateStyleBranding).set({ brandName, markupBps, featured }).where(eq(affiliateStyleBranding.id, row.id));
      } else {
        await db.insert(affiliateStyleBranding).values({ affiliateId: input.affiliateId, styleId: input.styleId, brandName, markupBps, featured, sortOrder: 0 });
      }
      return { styleId: input.styleId, brandName, markupBps, featured };
    }),

  // ─── Admin: earnings for one affiliate (weekly breakdown) ───────────────────
  adminEarnings: adminProcedure
    .input(z.object({ affiliateId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1);
      const a = rows[0];
      if (!a) return null;
      const rate = Number(a.commissionRate);
      const orders = await db
        .select()
        .from(orderRequests)
        .where(and(eq(orderRequests.affiliateId, a.id), eq(orderRequests.status, "confirmed")))
        .orderBy(desc(orderRequests.confirmedAt));
      const hardwareSnapshotRows = await db
        .select({ orderRequestId: affiliateHardwareCommissionSnapshots.orderRequestId, hardwareMerchandiseCents: affiliateHardwareCommissionSnapshots.hardwareMerchandiseCents, commissionCents: affiliateHardwareCommissionSnapshots.commissionCents })
        .from(affiliateHardwareCommissionSnapshots)
        .where(eq(affiliateHardwareCommissionSnapshots.affiliateId, a.id));
      const hardwareSnapshots = new Map(hardwareSnapshotRows.map((snapshot) => [snapshot.orderRequestId, snapshot]));
      const items = orders.map((o) => {
        const at = o.confirmedAt ?? o.updatedAt ?? o.createdAt;
        const customerTotalCents = dollarsToCents(o.totalAmount);
        return { at, commissionCents: orderCommissionCents(customerTotalCents, rate, hardwareSnapshots.get(o.id)) };
      });
      const weeks = groupByWeek(items);
      const payoutRows = await db
        .select()
        .from(affiliatePayouts)
        .where(eq(affiliatePayouts.affiliateId, a.id));
      const payoutByWeek = new Map(payoutRows.map((p) => [p.weekKey, p]));
      const thisWeekKey = isoWeekKey(new Date());
      const lifetimeCents = weeks.reduce((s, w) => s + w.totalCommissionCents, 0);
      const thisWeekCents = weeks.find((w) => w.weekKey === thisWeekKey)?.totalCommissionCents ?? 0;
      const paidCents = payoutRows.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0);
      return {
        affiliateId: a.id,
        commissionRate: rate,
        thisWeekKey,
        thisWeekCents,
        lifetimeCents,
        paidCents,
        pendingCents: Math.max(0, lifetimeCents - paidCents),
        weeks: weeks.map((w) => ({ ...w, payout: payoutByWeek.get(w.weekKey) ?? null })),
      };
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

  // ─── Partner: my earnings, grouped by ISO week ─────────────────────────────
  // A confirmed order request is "earned". We group earned commission by week,
  // surface the current week's running total, and attach any payout rows so the
  // partner can see issued/paid status.
  myEarnings: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return null;
    const db = await getDb();
    if (!db) return null;
    const rate = Number(mine.commissionRate);
    const orders = await db
      .select()
      .from(orderRequests)
      .where(and(eq(orderRequests.affiliateId, mine.id), eq(orderRequests.status, "confirmed")))
      .orderBy(desc(orderRequests.confirmedAt));
    const hardwareSnapshotRows = await db
      .select({ orderRequestId: affiliateHardwareCommissionSnapshots.orderRequestId, hardwareMerchandiseCents: affiliateHardwareCommissionSnapshots.hardwareMerchandiseCents, commissionCents: affiliateHardwareCommissionSnapshots.commissionCents })
      .from(affiliateHardwareCommissionSnapshots)
      .where(eq(affiliateHardwareCommissionSnapshots.affiliateId, mine.id));
    const hardwareSnapshots = new Map(hardwareSnapshotRows.map((snapshot) => [snapshot.orderRequestId, snapshot]));
    const items = orders.map((o) => {
      const at = o.confirmedAt ?? o.updatedAt ?? o.createdAt;
      const customerTotalCents = dollarsToCents(o.totalAmount);
      return { at, commissionCents: orderCommissionCents(customerTotalCents, rate, hardwareSnapshots.get(o.id)) };
    });
    const weeks = groupByWeek(items);
    const payoutRows = await db
      .select()
      .from(affiliatePayouts)
      .where(eq(affiliatePayouts.affiliateId, mine.id));
    const payoutByWeek = new Map(payoutRows.map((p) => [p.weekKey, p]));
    const thisWeekKey = isoWeekKey(new Date());
    const lifetimeCents = weeks.reduce((s, w) => s + w.totalCommissionCents, 0);
    const thisWeekCents = weeks.find((w) => w.weekKey === thisWeekKey)?.totalCommissionCents ?? 0;
    const paidCents = payoutRows
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + p.amountCents, 0);
    return {
      affiliateId: mine.id,
      commissionRate: rate,
      thisWeekKey,
      thisWeekCents,
      lifetimeCents,
      paidCents,
      pendingCents: Math.max(0, lifetimeCents - paidCents),
      weeks: weeks.map((w) => ({ ...w, payout: payoutByWeek.get(w.weekKey) ?? null })),
      w9Status: mine.w9Status ?? "not_submitted",
    };
  }),

  // ─── Admin: weekly payout report across all affiliates ─────────────────────
  // Builds per-affiliate, per-week commission buckets from confirmed orders and
  // merges them with persisted payout rows so settled weeks show their status.
  adminWeeklyPayouts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { weeks: [] as unknown[] };
    const affRows = await db.select().from(affiliates);
    const affById = new Map(affRows.map((a) => [a.id, a]));
    const orders = await db
      .select()
      .from(orderRequests)
      .where(eq(orderRequests.status, "confirmed"));
    const hardwareSnapshotRows = await db
      .select({ orderRequestId: affiliateHardwareCommissionSnapshots.orderRequestId, hardwareMerchandiseCents: affiliateHardwareCommissionSnapshots.hardwareMerchandiseCents, commissionCents: affiliateHardwareCommissionSnapshots.commissionCents })
      .from(affiliateHardwareCommissionSnapshots);
    const hardwareSnapshots = new Map(hardwareSnapshotRows.map((snapshot) => [snapshot.orderRequestId, snapshot]));
    const payoutRows = await db.select().from(affiliatePayouts);
    const payoutByKey = new Map(payoutRows.map((p) => [`${p.affiliateId}::${p.weekKey}`, p]));
    // bucket key = affiliateId::weekKey
    type Bucket = { affiliateId: number; weekKey: string; weekStart: Date; orderCount: number; amountCents: number };
    const buckets = new Map<string, Bucket>();
    for (const o of orders) {
      if (!o.affiliateId) continue;
      const aff = affById.get(o.affiliateId);
      if (!aff) continue;
      const at = o.confirmedAt ?? o.updatedAt ?? o.createdAt;
      const weekKey = isoWeekKey(at);
      const commissionCents = orderCommissionCents(
        dollarsToCents(o.totalAmount),
        Number(aff.commissionRate),
        hardwareSnapshots.get(o.id),
      );
      const key = `${o.affiliateId}::${weekKey}`;
      const b = buckets.get(key);
      if (b) {
        b.orderCount += 1;
        b.amountCents += commissionCents;
      } else {
        buckets.set(key, { affiliateId: o.affiliateId, weekKey, weekStart: isoWeekStart(at), orderCount: 1, amountCents: commissionCents });
      }
    }
    const rows = Array.from(buckets.values()).map((b) => {
      const aff = affById.get(b.affiliateId);
      const payout = payoutByKey.get(`${b.affiliateId}::${b.weekKey}`) ?? null;
      return {
        affiliateId: b.affiliateId,
        affiliateName: aff?.storeName ?? `#${b.affiliateId}`,
        weekKey: b.weekKey,
        weekStart: b.weekStart,
        orderCount: b.orderCount,
        amountCents: b.amountCents,
        status: payout?.status ?? "pending",
        method: payout?.method ?? null,
        reference: payout?.reference ?? null,
        paidAt: payout?.paidAt ?? null,
        issuedAt: payout?.issuedAt ?? null,
      };
    });
    rows.sort((a, b) => (a.weekKey < b.weekKey ? 1 : a.weekKey > b.weekKey ? -1 : a.affiliateName.localeCompare(b.affiliateName)));
    return { weeks: rows };
  }),

  // ─── Admin: mark a (affiliate, week) payout issued / paid ───────────────────
  adminMarkPayout: adminProcedure
    .input(z.object({
      affiliateId: z.number().int(),
      weekKey: z.string().regex(/^\d{4}-W\d{2}$/),
      amountCents: z.number().int().min(0),
      orderCount: z.number().int().min(0).default(0),
      status: z.enum(["pending", "issued", "paid"]),
      method: z.string().max(32).optional(),
      reference: z.string().max(128).optional(),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const aff = (await db.select().from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1))[0];
      if (!aff) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found" });
      // Compute the Monday of the actual ISO week from the key (year + week number).
      const wkYear = Number(input.weekKey.slice(0, 4));
      const wkNum = Number(input.weekKey.slice(6));
      // Jan 4th is always in ISO week 1; step forward (wkNum-1) weeks, then snap to Monday.
      const jan4 = new Date(Date.UTC(wkYear, 0, 4));
      const approx = new Date(jan4.getTime() + (wkNum - 1) * 7 * 86400000);
      const weekStart = isoWeekStart(approx);
      const existing = (await db.select().from(affiliatePayouts)
        .where(and(eq(affiliatePayouts.affiliateId, input.affiliateId), eq(affiliatePayouts.weekKey, input.weekKey)))
        .limit(1))[0];
      const now = new Date();
      const issuedAt = input.status === "issued" || input.status === "paid" ? (existing?.issuedAt ?? now) : null;
      const paidAt = input.status === "paid" ? (existing?.paidAt ?? now) : null;
      if (existing) {
        await db.update(affiliatePayouts).set({
          amountCents: input.amountCents,
          orderCount: input.orderCount,
          status: input.status,
          method: input.method ?? existing.method,
          reference: input.reference ?? existing.reference,
          note: input.note ?? existing.note,
          issuedAt,
          paidAt,
        }).where(eq(affiliatePayouts.id, existing.id));
        return { id: existing.id, status: input.status };
      }
      const inserted = await db.insert(affiliatePayouts).values({
        affiliateId: input.affiliateId,
        weekKey: input.weekKey,
        weekStart,
        amountCents: input.amountCents,
        orderCount: input.orderCount,
        status: input.status,
        method: input.method ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        issuedAt,
        paidAt,
      });
      return { id: (inserted as unknown as { insertId?: number }).insertId ?? null, status: input.status };
    }),

  // ─── Admin: send credentials email to an affiliate ──────────────────────────
  // Notifies the owner to send credentials to the affiliate (no direct email
  // sending — owner follows up). Also returns the credentials for copy-paste.
  adminSendCredentials: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [a] = await db.select().from(affiliates).where(eq(affiliates.id, input.id)).limit(1);
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found" });
      const origin = "https://www.cabinetdealz.com";
      const storeUrl = `${origin}/store/${a.slug}`;
      const refLink = `${storeUrl}/order?ref=${a.referralCode}`;
      const loginUrl = `${origin}/affiliate`;
      const welcomeGuideUrl = `${origin}/manus-storage/Cabinet-Dealz-Affiliate-Welcome-Guide_f17152cc.pdf`;
      await notifyOwner({
        title: `Send Credentials to ${a.storeName}`,
        content: [
          `Affiliate: ${a.storeName}`,
          `Contact: ${a.contactName ?? "—"} <${a.email}>`,
          ``,
          `Storefront URL: ${storeUrl}`,
          `Referral Link: ${refLink}`,
          `Referral Code: ${a.referralCode}`,
          `Login Portal: ${loginUrl}`,
          ``,
          `Welcome Guide PDF: ${welcomeGuideUrl}`,
          ``,
          `Please send the above credentials and welcome guide to the affiliate.`,
        ].join("\n"),
      });
      return { ok: true, storeUrl, refLink, referralCode: a.referralCode, loginUrl, email: a.email, welcomeGuideUrl };
    }),

  // ─── Partner: upload custom hero image ────────────────────────────────────────
  uploadHeroImage: partnerProcedure
    .input(z.object({
      imageBase64: z.string().min(1),
      contentType: z.string().regex(/^image\/(jpeg|png|webp|gif)$/).default("image/jpeg"),
      fileName: z.string().max(256).default("hero.jpg"),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const buf = Buffer.from(input.imageBase64, "base64");
      const ext = input.contentType.split("/")[1] ?? "jpg";
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const { url } = await storagePut(
        `affiliate-hero/${mine.slug}_${Date.now()}_${safeName}.${ext}`,
        buf,
        input.contentType,
      );
      await db.update(affiliates).set({ heroImageUrl: url }).where(eq(affiliates.id, mine.id));
      return { url };
    }),

  // ─── Partner: upload store logo ────────────────────────────────────────────
  // Mirrors uploadHeroImage but writes logoUrl, and honours admin targeting so
  // an admin editing a specific store uploads to THAT store.
  uploadLogo: partnerProcedure
    .input(z.object({
      imageBase64: z.string().min(1),
      contentType: z.string().regex(/^image\/(jpeg|png|webp|gif|svg\+xml)$/).default("image/png"),
      fileName: z.string().max(256).default("logo.png"),
      affiliateId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const targetId = await resolveTargetAffiliateId(ctx, input.affiliateId);
      const rows = await db
        .select({ slug: affiliates.slug })
        .from(affiliates)
        .where(eq(affiliates.id, targetId))
        .limit(1);
      const slug = rows[0]?.slug ?? String(targetId);
      const buf = Buffer.from(input.imageBase64, "base64");
      // Guard against oversized uploads reaching storage (base64 inflates ~33%).
      if (buf.byteLength > 5 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Logo must be 5MB or smaller." });
      }
      const ext = input.contentType === "image/svg+xml" ? "svg" : (input.contentType.split("/")[1] ?? "png");
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const { url } = await storagePut(
        `affiliate-logo/${slug}_${Date.now()}_${safeName}.${ext}`,
        buf,
        input.contentType,
      );
      await db.update(affiliates).set({ logoUrl: url }).where(eq(affiliates.id, targetId));
      return { url };
    }),

  // ─── Partner: request AI Concierge service ($100/hr front-page editing) ───────
  // The affiliate describes what they want; we notify the owner who will follow up.
  requestAiConcierge: partnerProcedure
    .input(z.object({
      description: z.string().min(10).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      await notifyOwner({
        title: `AI Concierge Request — ${mine.storeName}`,
        content: `Affiliate: ${mine.storeName} (${mine.email})\nSlug: ${mine.slug}\n\n${input.description}`,
      });
      return { ok: true };
    }),

  // ─── Partner: get W-9 / tax compliance status ────────────────────────────────────────────────────
  getW9Status: partnerProcedure
    .query(async ({ ctx }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      return {
        w9Status: mine.w9Status,
        w9LegalName: mine.w9LegalName,
        w9BusinessName: mine.w9BusinessName,
        w9EntityType: mine.w9EntityType,
        w9TaxIdType: mine.w9TaxIdType,
        // Return masked tax ID for display (last 4 digits only)
        w9TaxIdMasked: mine.w9TaxId ? `***-**-${mine.w9TaxId.slice(-4)}` : null,
        w9Address: mine.w9Address,
        w9City: mine.w9City,
        w9State: mine.w9State,
        w9Zip: mine.w9Zip,
        w9IdDocumentUrl: mine.w9IdDocumentUrl,
        w9SubmittedAt: mine.w9SubmittedAt,
        w9VerifiedAt: mine.w9VerifiedAt,
      };
    }),

  // ─── Partner: save W-9 legal information ───────────────────────────────────────────────────────────────
  saveW9Info: partnerProcedure
    .input(z.object({
      legalName: z.string().min(2).max(256),
      businessName: z.string().max(256).optional(),
      entityType: z.enum(["individual", "sole_proprietor", "llc_single", "llc_partnership", "llc_corp", "c_corp", "s_corp", "partnership", "trust", "other"]),
      taxId: z.string().min(9).max(64), // SSN (9 digits) or EIN (9 digits)
      taxIdType: z.enum(["ssn", "ein"]),
      address: z.string().min(5).max(256),
      city: z.string().min(2).max(128),
      state: z.string().length(2),
      zip: z.string().min(5).max(16),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // Only allow editing if not yet verified
      if (mine.w9Status === "verified") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your W-9 has already been verified and cannot be changed. Contact support if you need to update your information." });
      }
      await db.update(affiliates).set({
        w9LegalName: input.legalName,
        w9BusinessName: input.businessName ?? null,
        w9EntityType: input.entityType,
        w9TaxId: input.taxId.replace(/[^0-9]/g, ""), // strip formatting, store digits only
        w9TaxIdType: input.taxIdType,
        w9Address: input.address,
        w9City: input.city,
        w9State: input.state.toUpperCase(),
        w9Zip: input.zip,
      }).where(eq(affiliates.id, mine.id));
      return { ok: true };
    }),

  // ─── Partner: upload government ID document ───────────────────────────────────────────────────────────
  uploadIdDocument: partnerProcedure
    .input(z.object({
      fileBase64: z.string().min(1),
      contentType: z.string().regex(/^(image\/(jpeg|png|webp)|application\/pdf)$/),
      fileName: z.string().max(256).default("id-document.jpg"),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      if (mine.w9Status === "verified") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your W-9 has already been verified." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const buf = Buffer.from(input.fileBase64, "base64");
      const ext = input.contentType === "application/pdf" ? "pdf" : input.contentType.split("/")[1] ?? "jpg";
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const { url } = await storagePut(
        `affiliate-w9-id/${mine.slug}_${Date.now()}_${safeName}.${ext}`,
        buf,
        input.contentType,
      );
      await db.update(affiliates).set({ w9IdDocumentUrl: url }).where(eq(affiliates.id, mine.id));
      return { url };
    }),

  // ─── Partner: submit W-9 for review (marks as submitted) ─────────────────────────────────────────
  submitW9: partnerProcedure
    .mutation(async ({ ctx }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      if (mine.w9Status === "verified") return { ok: true, status: "verified" as const };
      if (!mine.w9LegalName || !mine.w9TaxId || !mine.w9EntityType || !mine.w9Address || !mine.w9IdDocumentUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please complete all required fields and upload your ID before submitting." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.update(affiliates).set({
        w9Status: "submitted",
        w9SubmittedAt: new Date(),
      }).where(eq(affiliates.id, mine.id));
      await notifyOwner({
        title: `W-9 Submitted — ${mine.storeName}`,
        content: [
          `Affiliate: ${mine.storeName} (${mine.email})`,
          `Legal Name: ${mine.w9LegalName}`,
          `Entity Type: ${mine.w9EntityType}`,
          `Tax ID Type: ${mine.w9TaxIdType?.toUpperCase() ?? "—"}`,
          `Address: ${mine.w9Address}, ${mine.w9City}, ${mine.w9State} ${mine.w9Zip}`,
          `ID Document: ${mine.w9IdDocumentUrl}`,
          ``,
          `Please review and verify in the Affiliates admin panel.`,
        ].join("\n"),
      });
      return { ok: true, status: "submitted" as const };
    }),

  // ─── Admin: verify or reject a W-9 submission ──────────────────────────────────────────────────────────────
  adminVerifyW9: adminProcedure
    .input(z.object({
      affiliateId: z.number().int().positive(),
      action: z.enum(["verify", "reject"]),
      adminNotes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [a] = await db.select().from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1);
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found" });
      if (input.action === "verify") {
        await db.update(affiliates).set({
          w9Status: "verified",
          w9VerifiedAt: new Date(),
          w9AdminNotes: input.adminNotes ?? null,
        }).where(eq(affiliates.id, input.affiliateId));
      } else {
        // Reject: reset to pending so they can re-submit
        await db.update(affiliates).set({
          w9Status: "pending",
          w9SubmittedAt: null,
          w9AdminNotes: input.adminNotes ?? null,
        }).where(eq(affiliates.id, input.affiliateId));
      }
      return { ok: true };
    }),

  // ─── Banner Schedules ────────────────────────────────────────────────────────
  listBannerSchedules: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return [];
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(affiliateBannerSchedules)
      .where(eq(affiliateBannerSchedules.affiliateId, mine.id))
      .orderBy(desc(affiliateBannerSchedules.createdAt));
  }),
  createBannerSchedule: partnerProcedure
    .input(z.object({ message: z.string().min(1).max(512), holidayKey: z.string().max(64).optional(), startDate: z.string().length(10), endDate: z.string().length(10) }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const result = await db.insert(affiliateBannerSchedules).values({
        affiliateId: mine.id,
        message: input.message,
        holidayKey: input.holidayKey ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { id: insertId, ok: true };
    }),
  updateBannerSchedule: partnerProcedure
    .input(z.object({ id: z.number(), message: z.string().max(512).optional(), holidayKey: z.string().max(64).nullable().optional(), startDate: z.string().length(10).optional(), endDate: z.string().length(10).optional() }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { id, ...rest } = input;
      const set: Record<string, unknown> = {};
      if (rest.message !== undefined) set.message = rest.message;
      if (rest.holidayKey !== undefined) set.holidayKey = rest.holidayKey;
      if (rest.startDate !== undefined) set.startDate = rest.startDate;
      if (rest.endDate !== undefined) set.endDate = rest.endDate;
      if (Object.keys(set).length > 0) {
        await db.update(affiliateBannerSchedules).set(set)
          .where(and(eq(affiliateBannerSchedules.id, id), eq(affiliateBannerSchedules.affiliateId, mine.id)));
      }
      return { ok: true };
    }),
  deleteBannerSchedule: partnerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.delete(affiliateBannerSchedules)
        .where(and(eq(affiliateBannerSchedules.id, input.id), eq(affiliateBannerSchedules.affiliateId, mine.id)));
      return { ok: true };
    }),

  // ─── Promo Discounts (sale badges on door styles) ─────────────────────────
  listPromoDiscounts: partnerProcedure.query(async ({ ctx }) => {
    const mine = await resolveMyAffiliate(ctx);
    if (!mine) return [];
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(affiliatePromoDiscounts)
      .where(eq(affiliatePromoDiscounts.affiliateId, mine.id))
      .orderBy(desc(affiliatePromoDiscounts.createdAt));
  }),
  upsertPromoDiscount: partnerProcedure
    .input(z.object({
      id: z.number().optional(),
      label: z.string().min(1).max(128),
      targetType: z.enum(["style", "category", "all"]).default("style"),
      targetId: z.number().nullable().optional(),
      discountBps: z.number().int().min(0).max(10000).default(0),
      startsAt: z.number().nullable().optional(),
      endsAt: z.number().nullable().optional(),
      active: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const values = {
        affiliateId: mine.id,
        label: input.label,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        discountBps: input.discountBps,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        active: input.active,
      };
      if (input.id) {
        await db.update(affiliatePromoDiscounts).set(values)
          .where(and(eq(affiliatePromoDiscounts.id, input.id), eq(affiliatePromoDiscounts.affiliateId, mine.id)));
        return { id: input.id, ok: true };
      }
      const result = await db.insert(affiliatePromoDiscounts).values(values);
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { id: insertId, ok: true };
    }),
  deletePromoDiscount: partnerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const mine = await resolveMyAffiliate(ctx);
      if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.delete(affiliatePromoDiscounts)
        .where(and(eq(affiliatePromoDiscounts.id, input.id), eq(affiliatePromoDiscounts.affiliateId, mine.id)));
      return { ok: true };
    }),

  // ─── Public: active banner for a storefront ──────────────────────────────
  getActiveBanner: publicProcedure
    .input(z.object({ affiliateId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db
        .select()
        .from(affiliateBannerSchedules)
        .where(eq(affiliateBannerSchedules.affiliateId, input.affiliateId));
      const active = rows.find((r) => r.startDate <= today && r.endDate >= today);
      return active ?? null;
    }),

  // ─── Public: active promo discounts for a storefront ─────────────────────
  getActivePromos: publicProcedure
    .input(z.object({ affiliateId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      const rows = await db
        .select()
        .from(affiliatePromoDiscounts)
        .where(and(eq(affiliatePromoDiscounts.affiliateId, input.affiliateId), eq(affiliatePromoDiscounts.active, true)));
      return rows.filter((r) => {
        if (r.startsAt && r.startsAt > now) return false;
        if (r.endsAt && r.endsAt < now) return false;
        return true;
      });
    }),

  // ─── Partner: view design consultations booked through their storefront ────────
  myConsultations: partnerProcedure
    .input(z.object({ status: z.enum(["requested", "confirmed", "completed", "cancelled", "all"]).default("all") }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [] as Array<typeof designConsultations.$inferSelect>;
      const status = input?.status ?? "all";
      const conds = [];
      if (status !== "all") conds.push(eq(designConsultations.status, status));
      const rows = await db.select().from(designConsultations)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(designConsultations.startAt)).limit(200);
      return rows;
    }),
  // ─── Payout Setup (stub — full implementation pending) ─────────────────────
  savePayoutBankInfo: partnerProcedure
    .input(z.object({
      bankName: z.string(),
      bankRoutingNumber: z.string(),
      bankAccountNumber: z.string(),
      bankAccountType: z.enum(["checking", "savings"]),
    }))
    .mutation(async () => ({ ok: true, maskedAccount: "****0000" })),
  uploadPayoutIdDoc: partnerProcedure
    .input(z.object({ docType: z.string(), fileBase64: z.string(), mimeType: z.string() }))
    .mutation(async () => ({ ok: true, url: "" })),
  signPayoutConsent: partnerProcedure
    .input(z.object({ legalName: z.string() }))
    .mutation(async () => ({ ok: true })),
  getPayoutSetupStatus: partnerProcedure.query(async () => ({
    bankInfoSaved: false,
    idDocUploaded: false,
    consentSigned: false,
    isComplete: false,
    payoutReady: false,
    w9Done: false,
    bankDone: false,
    idDone: false,
    // Bank details
    bankName: null as string | null,
    maskedAccountNumber: null as string | null,
    bankAccountType: null as string | null,
    // ID doc upload status
    ssnCardUploaded: false,
    dlFrontUploaded: false,
    dlBackUploaded: false,
    // Consent
    payoutConsentName: null as string | null,
    payoutConsentSignedAt: null as number | null,
  })),

  // ─── Payout Verification (admin stub) ──────────────────────────────────────
  listForPayoutVerification: adminProcedure.query(async () => {
    return [] as Array<{
      id: number; storeName: string; email: string;
      legalName: string | null; businessName: string | null;
      taxEntityType: string | null; taxId: string | null;
      taxAddress: string | null; taxCity: string | null;
      taxState: string | null; taxZip: string | null;
      bankName: string | null; bankAccountType: string | null;
      bankAccountLast4: string | null; bankRoutingLast4: string | null;
      ssnCardUrl: string | null; dlFrontUrl: string | null; dlBackUrl: string | null;
      payoutVerificationStatus: string | null; payoutVerificationNotes: string | null;
      payoutEsignedAt: number | null; payoutSetupCompletedAt: number | null;
    }>;
  }),
  updatePayoutVerification: adminProcedure
    .input(z.object({ affiliateId: z.number(), status: z.string(), notes: z.string().optional() }))
    .mutation(async () => ({ ok: true })),
});
