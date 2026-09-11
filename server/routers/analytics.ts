import { z } from "zod";
import { publicProcedure, distributorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { distributorSkus, doorStyles, kitchenDesigns, productViews } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

type SavedPlanForecastPlacement = {
  cabinetId?: unknown;
  styleId?: unknown;
  quantity?: unknown;
};

type SavedPlanForecastPlan = {
  id: number;
  selectedStyleId: number | null;
  placedCabinets: object[] | null;
  updatedAt: Date;
};

type SavedPlanForecastSku = {
  cabinetId: number;
  styleId: number;
  distributorSku: string;
  platformSku: string;
};

type SavedPlanForecastStyle = {
  id: number;
  ourName: string;
  aliasName: string | null;
  distributorName: string;
};

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function positiveQuantity(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function forecastPlacements(value: object[] | null): SavedPlanForecastPlacement[] {
  return Array.isArray(value) ? value.filter((item): item is SavedPlanForecastPlacement => typeof item === "object" && item !== null) : [];
}

/**
 * Deterministically summarizes a vendor's own saved plans. It deliberately
 * does not read submitted orders, quotes, carts, prices, or customer identity.
 */
export function summarizeSavedPlanDemand(
  plans: SavedPlanForecastPlan[],
  skus: SavedPlanForecastSku[],
  styles: SavedPlanForecastStyle[],
) {
  const skuByCabinetAndStyle = new Map(skus.map((sku) => [`${sku.cabinetId}:${sku.styleId}`, sku]));
  const styleById = new Map(styles.map((style) => [style.id, style]));
  const skuTotals = new Map<string, { sku: SavedPlanForecastSku; units: number; planIds: Set<number> }>();
  const styleTotals = new Map<number, { units: number; planIds: Set<number> }>();
  const activityByDay = new Map<string, number>();
  let unresolvedCabinetQty = 0;

  for (const plan of plans) {
    const day = plan.updatedAt.toISOString().slice(0, 10);
    activityByDay.set(day, (activityByDay.get(day) ?? 0) + 1);

    for (const placement of forecastPlacements(plan.placedCabinets)) {
      const cabinetId = positiveInteger(placement.cabinetId);
      const styleId = positiveInteger(placement.styleId) ?? positiveInteger(plan.selectedStyleId);
      const quantity = positiveQuantity(placement.quantity);
      if (!cabinetId || !styleId) {
        unresolvedCabinetQty += quantity;
        continue;
      }

      const sku = skuByCabinetAndStyle.get(`${cabinetId}:${styleId}`);
      if (!sku) {
        unresolvedCabinetQty += quantity;
        continue;
      }

      const skuKey = `${sku.cabinetId}:${sku.styleId}`;
      const skuTotal = skuTotals.get(skuKey) ?? { sku, units: 0, planIds: new Set<number>() };
      skuTotal.units += quantity;
      skuTotal.planIds.add(plan.id);
      skuTotals.set(skuKey, skuTotal);

      const styleTotal = styleTotals.get(styleId) ?? { units: 0, planIds: new Set<number>() };
      styleTotal.units += quantity;
      styleTotal.planIds.add(plan.id);
      styleTotals.set(styleId, styleTotal);
    }
  }

  const topSkus = Array.from(skuTotals.values())
    .map(({ sku, units, planIds }) => ({
      sku: sku.distributorSku,
      platformSku: sku.platformSku,
      styleId: sku.styleId,
      style: styleById.get(sku.styleId)?.aliasName || styleById.get(sku.styleId)?.ourName || styleById.get(sku.styleId)?.distributorName || "Unlabeled style",
      units,
      planCount: planIds.size,
    }))
    .sort((a, b) => b.units - a.units || b.planCount - a.planCount || a.sku.localeCompare(b.sku))
    .slice(0, 12);

  const topStyles = Array.from(styleTotals.entries())
    .map(([styleId, total]) => ({
      styleId,
      style: styleById.get(styleId)?.aliasName || styleById.get(styleId)?.ourName || styleById.get(styleId)?.distributorName || "Unlabeled style",
      units: total.units,
      planCount: total.planIds.size,
    }))
    .sort((a, b) => b.units - a.units || b.planCount - a.planCount || a.style.localeCompare(b.style))
    .slice(0, 8);

  const activity = Array.from(activityByDay.entries())
    .map(([day, planCount]) => ({ day, planCount }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    savedPlanCount: plans.length,
    projectedCabinetQty: Array.from(skuTotals.values()).reduce((total, row) => total + row.units, 0),
    unresolvedCabinetQty,
    latestSavedAt: plans[0]?.updatedAt ?? null,
    topSkus,
    topStyles,
    activity,
  };
}

export const analyticsRouter = router({
  // Public: track a product view (called from storefront pages)
  trackView: publicProcedure
    .input(
      z.object({
        distributorId: z.number(),
        cabinetId: z.number().optional(),
        skuId: z.number().optional(),
        pelicanProductId: z.number().optional(),
        pageSlug: z.string(),
        referrer: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userAgent = (ctx as any).req?.headers?.["user-agent"] ?? null;
      await db.insert(productViews).values({
        distributorId: input.distributorId,
        cabinetId: input.cabinetId ?? null,
        skuId: input.skuId ?? null,
        pelicanProductId: input.pelicanProductId ?? null,
        pageSlug: input.pageSlug,
        referrer: input.referrer ?? null,
        userAgent: userAgent ?? null,
      });
      return { ok: true };
    }),

  // Vendor: get their analytics summary
  summary: distributorProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
        distributorId: z.number().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // Admin must pass distributorId; distributor uses their own
      let distId: number;
      if (ctx.isAdmin) {
        if (!input?.distributorId) return { totalViews: 0, uniqueProducts: 0, topProducts: [], dailyViews: [] };
        distId = input.distributorId;
      } else {
        distId = ctx.distributorId!;
      }

      // Total views
      const [totalResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(productViews)
        .where(
          and(
            eq(productViews.distributorId, distId),
            gte(productViews.viewedAt, since)
          )
        );

      // Views by day (last N days)
      const dailyViews = await db
        .select({
          day: sql<string>`DATE(viewedAt)`.as("day"),
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(productViews)
        .where(
          and(
            eq(productViews.distributorId, distId),
            gte(productViews.viewedAt, since)
          )
        )
        .groupBy(sql`DATE(viewedAt)`)
        .orderBy(sql`DATE(viewedAt)`);

      // Top products (by views)
      const topProducts = await db
        .select({
          pageSlug: productViews.pageSlug,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(productViews)
        .where(
          and(
            eq(productViews.distributorId, distId),
            gte(productViews.viewedAt, since)
          )
        )
        .groupBy(productViews.pageSlug)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(20);

      // Top referrers
      const topReferrers = await db
        .select({
          referrer: productViews.referrer,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(productViews)
        .where(
          and(
            eq(productViews.distributorId, distId),
            gte(productViews.viewedAt, since),
            sql`${productViews.referrer} IS NOT NULL AND ${productViews.referrer} != ''`
          )
        )
        .groupBy(productViews.referrer)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(10);

      return {
        totalViews: totalResult?.count ?? 0,
        dailyViews,
        topProducts,
        topReferrers,
      };
    }),

  // Vendor: projected demand from saved plans only. This never reads submitted
  // orders, so vendors see a current design pipeline rather than a sales ledger.
  savedPlanForecast: distributorProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(60),
        distributorId: z.number().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const days = input?.days ?? 60;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      let distId: number;
      if (ctx.isAdmin) {
        if (!input?.distributorId) {
          return summarizeSavedPlanDemand([], [], []);
        }
        distId = input.distributorId;
      } else {
        distId = ctx.distributorId!;
      }

      const [plans, skus, styles] = await Promise.all([
        db.select({
          id: kitchenDesigns.id,
          selectedStyleId: kitchenDesigns.selectedStyleId,
          placedCabinets: kitchenDesigns.placedCabinets,
          updatedAt: kitchenDesigns.updatedAt,
        })
          .from(kitchenDesigns)
          .where(and(
            eq(kitchenDesigns.selectedDistributorId, distId),
            gte(kitchenDesigns.updatedAt, since),
          ))
          .orderBy(desc(kitchenDesigns.updatedAt)),
        db.select({
          cabinetId: distributorSkus.cabinetId,
          styleId: distributorSkus.styleId,
          distributorSku: distributorSkus.distributorSku,
          platformSku: distributorSkus.platformSku,
        })
          .from(distributorSkus)
          .where(eq(distributorSkus.distributorId, distId)),
        db.select({
          id: doorStyles.id,
          ourName: doorStyles.ourName,
          aliasName: doorStyles.aliasName,
          distributorName: doorStyles.distributorName,
        })
          .from(doorStyles)
          .where(eq(doorStyles.distributorId, distId)),
      ]);

      return summarizeSavedPlanDemand(plans, skus, styles);
    }),
});
