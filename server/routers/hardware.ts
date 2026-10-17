import { z } from "zod";
import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { affiliates, distributors, hardwareShippingProfiles, vendorProducts } from "../../drizzle/schema";
import {
  HARDWARE_LINE_CODE,
  hardwareCheckoutEligibility,
  hardwareProfileIsComplete,
  hardwareRetailCents,
} from "@shared/hardwareCommerce";
import { groupHardwareConfigurations } from "@shared/hardwareCatalogGrouping";
import { createFreightQuoteToken } from "../_core/freightQuoteToken";

const listInput = z.object({
  category: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
  affiliateSlug: z.string().trim().min(1).max(64).optional(),
});

const configurationListInput = z.object({
  collection: z.string().trim().min(1).max(128).optional(),
  productType: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
  affiliateSlug: z.string().trim().min(1).max(64).optional(),
});

const selectedHardwareInput = z.object({
  vendorProductId: z.number().int().positive(),
  affiliateSlug: z.string().trim().min(1).max(64).optional(),
});

const hardwareLineInput = z.object({
  vendorProductId: z.number().int().positive(),
  qty: z.number().int().min(1).max(999),
});

const hardwareProfileInput = z.object({
  enabled: z.boolean(),
  originZip: z.string().trim().max(16).nullable(),
  packageLengthIn: z.number().positive().max(999).nullable(),
  packageWidthIn: z.number().positive().max(999).nullable(),
  packageHeightIn: z.number().positive().max(999).nullable(),
  packageWeightLbs: z.number().positive().max(5000).nullable(),
  maxUnitsPerPackage: z.number().int().min(1).max(9999).nullable(),
  standaloneShippingCents: z.number().int().min(0).max(10000000).nullable(),
  sourceReference: z.string().trim().max(512).nullable(),
});

function publicHardwareConditions() {
  return and(
    eq(distributors.code, HARDWARE_LINE_CODE),
    eq(distributors.isActive, true),
    eq(vendorProducts.status, "approved"),
    eq(vendorProducts.isPublished, true),
    eq(vendorProducts.isAvailable, true),
  );
}

async function hardwareLineAndProfile(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [line] = await db
    .select({ id: distributors.id })
    .from(distributors)
    .where(eq(distributors.code, HARDWARE_LINE_CODE))
    .limit(1);
  if (!line) return { lineId: null, profile: null };
  const [profile] = await db
    .select()
    .from(hardwareShippingProfiles)
    .where(eq(hardwareShippingProfiles.distributorId, line.id))
    .limit(1);
  return { lineId: line.id, profile: profile ?? null };
}

async function affiliateHardwareMarkupBps(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  affiliateSlug?: string,
): Promise<{ affiliateId: number | null; markupBps: number }> {
  const slug = affiliateSlug?.trim().toLowerCase();
  if (!slug || slug === "owner") return { affiliateId: null, markupBps: 0 };
  const [affiliate] = await db
    .select({ id: affiliates.id, hardwareMarkupBps: affiliates.hardwareMarkupBps })
    .from(affiliates)
    .where(and(
      eq(affiliates.slug, slug),
      eq(affiliates.status, "active"),
      eq(affiliates.storefrontEnabled, true),
    ))
    .limit(1);
  return affiliate
    ? { affiliateId: affiliate.id, markupBps: Math.max(0, affiliate.hardwareMarkupBps ?? 0) }
    : { affiliateId: null, markupBps: 0 };
}

/**
 * The response deliberately excludes `yourCost`, package fields, and all internal
 * supplier settings. Hardware becomes purchasable only through the profile-aware
 * checkout quote below; catalog browsing never treats missing shipping facts as a
 * reason to invent a parcel rate.
 */
export const hardwareRouter = router({
  categories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as { category: string; count: number }[];
    const rows = await db
      .select({ category: vendorProducts.category, count: count() })
      .from(vendorProducts)
      .innerJoin(distributors, eq(vendorProducts.distributorId, distributors.id))
      .where(publicHardwareConditions())
      .groupBy(vendorProducts.category)
      .orderBy(asc(vendorProducts.category));
    return rows
      .filter((row): row is { category: string; count: number } => Boolean(row.category?.trim()))
      .map((row) => ({ category: row.category, count: Number(row.count) }));
  }),

  configurationFilters: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { collections: [], productTypes: [] };
    const rows = await db
      .select({
        collection: vendorProducts.hardwareCollection,
        productType: vendorProducts.hardwareProductType,
      })
      .from(vendorProducts)
      .innerJoin(distributors, eq(vendorProducts.distributorId, distributors.id))
      .where(publicHardwareConditions());
    return {
      collections: Array.from(new Set(rows.map((row) => row.collection?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
      productTypes: Array.from(new Set(rows.map((row) => row.productType?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
    };
  }),

  /**
   * Reprice one saved Designer hardware selection at read time. The saved design
   * retains only the exact product identity and visual specification; this route
   * deliberately obtains a current public sell price rather than trusting a
   * historical browser value.
   */
  selected: publicProcedure.input(selectedHardwareInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const affiliatePricing = await affiliateHardwareMarkupBps(db, input.affiliateSlug);
    const [item] = await db
      .select({
        id: vendorProducts.id,
        sku: vendorProducts.vendorSku,
        name: vendorProducts.name,
        description: vendorProducts.description,
        collection: vendorProducts.hardwareCollection,
        productType: vendorProducts.hardwareProductType,
        finish: vendorProducts.hardwareFinish,
        configurationKey: vendorProducts.hardwareConfigurationKey,
        configurationLabel: vendorProducts.hardwareConfigurationLabel,
        listPrice: vendorProducts.listPrice,
        imageUrl: vendorProducts.imageUrl,
      })
      .from(vendorProducts)
      .innerJoin(distributors, eq(vendorProducts.distributorId, distributors.id))
      .where(and(publicHardwareConditions(), eq(vendorProducts.id, input.vendorProductId)))
      .limit(1);
    if (!item) return null;
    const unitPriceCents = hardwareRetailCents(item.listPrice, affiliatePricing.markupBps);
    if (unitPriceCents == null) return null;
    return {
      ...item,
      unitPriceCents,
      affiliateMarkupBps: affiliatePricing.markupBps,
    };
  }),

  listConfigurations: publicProcedure.input(configurationListInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { items: [], hasMore: false, affiliateMarkupBps: 0 };
    const affiliatePricing = await affiliateHardwareMarkupBps(db, input.affiliateSlug);
    const conditions = [publicHardwareConditions()];
    if (input.collection) conditions.push(eq(vendorProducts.hardwareCollection, input.collection));
    if (input.productType) conditions.push(eq(vendorProducts.hardwareProductType, input.productType));
    const rows = await db
      .select({
        id: vendorProducts.id,
        vendorSku: vendorProducts.vendorSku,
        name: vendorProducts.name,
        description: vendorProducts.description,
        collection: vendorProducts.hardwareCollection,
        productType: vendorProducts.hardwareProductType,
        finish: vendorProducts.hardwareFinish,
        configurationKey: vendorProducts.hardwareConfigurationKey,
        configurationLabel: vendorProducts.hardwareConfigurationLabel,
        listPrice: vendorProducts.listPrice,
        imageUrl: vendorProducts.imageUrl,
      })
      .from(vendorProducts)
      .innerJoin(distributors, eq(vendorProducts.distributorId, distributors.id))
      .where(and(...conditions));
    const configurations = groupHardwareConfigurations(rows.map((row) => ({
      id: row.id,
      sku: row.vendorSku,
      name: row.name,
      description: row.description,
      collection: row.collection,
      productType: row.productType,
      finish: row.finish,
      configurationKey: row.configurationKey,
      configurationLabel: row.configurationLabel,
      imageUrl: row.imageUrl,
      unitPriceCents: hardwareRetailCents(row.listPrice, affiliatePricing.markupBps),
    })), input.search);
    const items = configurations.slice(input.offset, input.offset + input.limit);
    return {
      items,
      hasMore: input.offset + items.length < configurations.length,
      affiliateMarkupBps: affiliatePricing.markupBps,
    };
  }),

  list: publicProcedure.input(listInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };
    const affiliatePricing = await affiliateHardwareMarkupBps(db, input.affiliateSlug);
    const conditions = [publicHardwareConditions()];
    if (input.category) conditions.push(eq(vendorProducts.category, input.category));
    if (input.search) {
      const term = `%${input.search}%`;
      conditions.push(or(
        like(vendorProducts.vendorSku, term),
        like(vendorProducts.name, term),
        like(vendorProducts.description, term),
        like(vendorProducts.category, term),
      ));
    }
    const where = and(...conditions);
    const [items, totals] = await Promise.all([
      db.select({
        id: vendorProducts.id,
        sku: vendorProducts.vendorSku,
        name: vendorProducts.name,
        description: vendorProducts.description,
        category: vendorProducts.category,
        listPrice: vendorProducts.listPrice,
        imageUrl: vendorProducts.imageUrl,
      })
        .from(vendorProducts)
        .innerJoin(distributors, eq(vendorProducts.distributorId, distributors.id))
        .where(where)
        .orderBy(asc(vendorProducts.category), asc(vendorProducts.name), asc(vendorProducts.vendorSku))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ count: count() })
        .from(vendorProducts)
        .innerJoin(distributors, eq(vendorProducts.distributorId, distributors.id))
        .where(where),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        unitPriceCents: hardwareRetailCents(item.listPrice, affiliatePricing.markupBps),
      })),
      total: Number(totals[0]?.count ?? 0),
      affiliateMarkupBps: affiliatePricing.markupBps,
    };
  }),

  checkoutStatus: publicProcedure
    .input(z.object({ containsKitchenMerchandise: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { checkoutEnabled: false, promotionAvailable: false };
      const { profile } = await hardwareLineAndProfile(db);
      return {
        checkoutEnabled: hardwareProfileIsComplete(profile),
        promotionAvailable: hardwareProfileIsComplete(profile) && input?.containsKitchenMerchandise === true,
      };
    }),

  quote: publicProcedure
    .input(z.object({
      items: z.array(hardwareLineInput).min(1).max(100),
      affiliateSlug: z.string().trim().min(1).max(64).optional(),
      containsKitchenMerchandise: z.boolean().default(false),
      destinationZip: z.string().regex(/^\d{5}(?:-\d{4})?$/),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { lineId, profile } = await hardwareLineAndProfile(db);
      const affiliatePricing = await affiliateHardwareMarkupBps(db, input.affiliateSlug);
      if (!lineId) return { available: false, totalCents: 0, merchandiseCents: 0, shippingCents: null, promotionApplied: false, reason: "Hardware Resources is not configured." };
      const ids = input.items.map((item) => item.vendorProductId);
      const products = await db
        .select({ id: vendorProducts.id, listPrice: vendorProducts.listPrice })
        .from(vendorProducts)
        .where(and(
          eq(vendorProducts.distributorId, lineId),
          eq(vendorProducts.status, "approved"),
          eq(vendorProducts.isPublished, true),
          eq(vendorProducts.isAvailable, true),
        ));
      const byId = new Map(products.map((product) => [product.id, product]));
      let merchandiseCents = 0;
      for (const item of input.items) {
        const product = byId.get(item.vendorProductId);
        const retailCents = product ? hardwareRetailCents(product.listPrice, affiliatePricing.markupBps) : null;
        if (retailCents == null) return { available: false, totalCents: 0, merchandiseCents: 0, shippingCents: null, promotionApplied: false, reason: "One or more selected hardware items are no longer available at a current price." };
        merchandiseCents += retailCents * item.qty;
      }
      const eligibility = hardwareCheckoutEligibility({
        profile,
        hardwareUnits: input.items.reduce((sum, item) => sum + item.qty, 0),
        containsKitchenMerchandise: input.containsKitchenMerchandise,
      });
      const shippingCents = eligibility.shippingCents ?? 0;
      const quoteToken = eligibility.eligible
        ? createFreightQuoteToken({
            totalCents: shippingCents,
            merchandiseSubtotalCents: merchandiseCents,
            destinationZip: input.destinationZip,
            residential: false,
            liftgate: false,
            profileRevision: profile?.profileRevision ?? 0,
            items: input.items.map((item) => ({ vendorProductId: item.vendorProductId, qty: item.qty })),
          })
        : null;
      return {
        available: eligibility.eligible,
        merchandiseCents,
        shippingCents: eligibility.shippingCents,
        totalCents: eligibility.eligible ? merchandiseCents + shippingCents : 0,
        promotionApplied: eligibility.promotionApplied,
        reason: eligibility.reason,
        quoteToken,
      };
    }),

  adminGetShippingProfile: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { profile: null, checkoutEnabled: false };
    const { profile } = await hardwareLineAndProfile(db);
    return { profile, checkoutEnabled: hardwareProfileIsComplete(profile) };
  }),

  adminSaveShippingProfile: adminProcedure
    .input(hardwareProfileInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { lineId, profile } = await hardwareLineAndProfile(db);
      if (!lineId) throw new Error("Hardware Resources supplier line is not configured.");
      const values = {
        ...input,
        originZip: input.originZip?.trim() || null,
        sourceReference: input.sourceReference?.trim() || null,
        packageLengthIn: input.packageLengthIn == null ? null : input.packageLengthIn.toFixed(2),
        packageWidthIn: input.packageWidthIn == null ? null : input.packageWidthIn.toFixed(2),
        packageHeightIn: input.packageHeightIn == null ? null : input.packageHeightIn.toFixed(2),
        packageWeightLbs: input.packageWeightLbs == null ? null : input.packageWeightLbs.toFixed(2),
        profileRevision: (profile?.profileRevision ?? 0) + 1,
      };
      if (input.enabled && !hardwareProfileIsComplete(values)) {
        throw new Error("Enter a valid origin ZIP, one consolidated package’s dimensions and weight, a positive one-package item limit, a standalone shipping amount, and a source reference before enabling hardware checkout.");
      }
      if (profile) await db.update(hardwareShippingProfiles).set(values).where(eq(hardwareShippingProfiles.id, profile.id));
      else await db.insert(hardwareShippingProfiles).values({ distributorId: lineId, ...values });
      return { checkoutEnabled: hardwareProfileIsComplete(values) };
    }),
});
