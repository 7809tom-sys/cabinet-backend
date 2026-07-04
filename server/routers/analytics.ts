import { z } from "zod";
import { publicProcedure, distributorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { productViews } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

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
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const distId = ctx.distributorId!;

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
});
