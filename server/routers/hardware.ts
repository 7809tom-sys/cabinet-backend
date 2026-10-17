import { z } from "zod";
import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { distributors, vendorProducts } from "../../drizzle/schema";

const HARDWARE_LINE_CODE = "HRDW";

const listInput = z.object({
  category: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
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

/**
 * Decorative hardware is intentionally browse-only until its exact consolidated
 * shipment profile is configured. The response deliberately excludes `yourCost`,
 * package fields, and all internal supplier settings.
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

  list: publicProcedure.input(listInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };
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
    return { items, total: Number(totals[0]?.count ?? 0) };
  }),
});
