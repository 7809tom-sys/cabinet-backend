import { z } from "zod";
import { and, asc, desc, eq, gt, like, or, sql } from "drizzle-orm";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { pelicanCategoryMarkups } from "../../drizzle/schema";

const CategoryEnum = z.enum([
  "Sinks & Faucets",
  "Flooring",
  "Shower & Bath",
  "Toilets & Bidets",
  "Tile & Mosaic",
  "Quartz Slabs (Countertops)",
  "Samples",
  "Marketing & Merchandise",
]);

const DEFAULT_MARKUP_BPS: Record<string, number> = {
  Flooring: 6500,
  "Tile & Mosaic": 5500,
  "Sinks & Faucets": 3800,
  "Toilets & Bidets": 3500,
  "Shower & Bath": 2200,
  "Quartz Slabs (Countertops)": 1800,
};

type MarkupMap = Record<string, number>;

async function loadMarkupMap(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<MarkupMap> {
  const rows = await db
    .select({ category: pelicanCategoryMarkups.category, markupBps: pelicanCategoryMarkups.markupBps })
    .from(pelicanCategoryMarkups);
  const map: MarkupMap = {};
  for (const r of rows) map[r.category] = r.markupBps;
  return map;
}

function markupBpsFor(map: MarkupMap, category: string): number {
  if (map[category] !== undefined) return map[category];
  return DEFAULT_MARKUP_BPS[category] ?? 0;
}

function computeSellPrice(
  product: { listPrice: string | null; yourCost: string | null; category: string },
  map: MarkupMap
): number | null {
  const costStr = product.yourCost ?? product.listPrice;
  if (costStr == null) return null;
  const cost = Number(costStr);
  if (!Number.isFinite(cost)) return null;
  const bps = markupBpsFor(map, product.category);
  return Math.round(cost * (1 + bps / 10000) * 100) / 100;
}

function withPricing<T extends { listPrice: string | null; yourCost: string | null; category: string }>(
  product: T,
  map: MarkupMap
): T & { sellPrice: number | null; markupBps: number } {
  return {
    ...product,
    sellPrice: computeSellPrice(product, map),
    markupBps: markupBpsFor(map, product.category),
  };
}

/**
 * SQL condition: product has a positive cost (yourCost > 0 OR listPrice > 0).
 * Products with NULL/zero cost would compute to a $0 sell price and must not
 * appear on public-facing pages.
 */
function hasPriceData() {
  return or(
    gt(pelicanProducts.yourCost, "0"),
    gt(pelicanProducts.listPrice, "0")
  );
}

export const pelicanRouter = router({
  categories: publicProcedure
    .input(z.object({ scope: z.enum(["designer", "catalog", "all"]).default("catalog") }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as { category: string; count: number }[];
      const scope = input?.scope ?? "catalog";
      const conds = [eq(pelicanProducts.isActive, true), hasPriceData() as any];
      if (scope === "designer") conds.push(eq(pelicanProducts.showInDesigner, true));
      if (scope === "catalog") conds.push(eq(pelicanProducts.showInCatalog, true));
      const rows = await db
        .select({ category: pelicanProducts.category, count: sql<number>`count(*)` })
        .from(pelicanProducts)
        .where(and(...conds))
        .groupBy(pelicanProducts.category)
        .orderBy(desc(sql`count(*)`));
      return rows.map((r) => ({ category: r.category, count: Number(r.count) }));
    }),
  byCategory: publicProcedure
    .input(
      z.object({
        category: CategoryEnum,
        scope: z.enum(["designer", "catalog", "all"]).default("catalog"),
        search: z.string().trim().optional(),
        subCategory: z.string().trim().optional(),
        limit: z.number().min(1).max(200).default(60),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { suggested: [], items: [], total: 0, subCategories: [] as string[] };
      const markupMap = await loadMarkupMap(db);
      const conds = [eq(pelicanProducts.category, input.category), eq(pelicanProducts.isActive, true), hasPriceData() as any];
      if (input.scope === "designer") conds.push(eq(pelicanProducts.showInDesigner, true));
      if (input.scope === "catalog") conds.push(eq(pelicanProducts.showInCatalog, true));
      if (input.subCategory) conds.push(eq(pelicanProducts.subCategory, input.subCategory));
      if (input.search) {
        const q = `%${input.search}%`;
        conds.push(
          or(
            like(pelicanProducts.name, q),
            like(pelicanProducts.description, q),
            like(pelicanProducts.pelicanCode, q)
          ) as any
        );
      }
      const where = and(...conds);
      const suggestedRows =
        input.search || input.subCategory || input.offset > 0
          ? []
          : await db
              .select()
              .from(pelicanProducts)
              .where(and(where, eq(pelicanProducts.isPopular, true)))
              .orderBy(asc(pelicanProducts.popularRank))
              .limit(12);
      const itemRows = await db
        .select()
        .from(pelicanProducts)
        .where(where)
        .orderBy(desc(pelicanProducts.isPopular), asc(pelicanProducts.popularRank), asc(pelicanProducts.name))
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(pelicanProducts)
        .where(where);
      const subs = await db
        .selectDistinct({ subCategory: pelicanProducts.subCategory })
        .from(pelicanProducts)
        .where(and(eq(pelicanProducts.category, input.category), eq(pelicanProducts.isActive, true)));
      return {
        suggested: suggestedRows.map((r) => withPricing(r, markupMap)),
        items: itemRows.map((r) => withPricing(r, markupMap)),
        total: Number(total),
        subCategories: subs.map((s) => s.subCategory).filter(Boolean) as string[],
      };
    }),
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(pelicanProducts)
        .where(eq(pelicanProducts.slug, input.slug))
        .limit(1);
      if (!row) return null;
      const markupMap = await loadMarkupMap(db);
      const priced = withPricing(row, markupMap);
      // Hide product detail if it has no valid sell price
      if (!priced.sellPrice || priced.sellPrice <= 0) return null;
      return priced;
    }),
  adminList: adminProcedure
    .input(
      z.object({
        category: CategoryEnum.optional(),
        search: z.string().trim().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const markupMap = await loadMarkupMap(db);
      const conds = [] as any[];
      if (input.category) conds.push(eq(pelicanProducts.category, input.category));
      if (input.search) {
        const q = `%${input.search}%`;
        conds.push(
          or(
            like(pelicanProducts.name, q),
            like(pelicanProducts.description, q),
            like(pelicanProducts.pelicanCode, q)
          ) as any
        );
      }
      const where = conds.length ? and(...conds) : undefined;
      const items = await db
        .select()
        .from(pelicanProducts)
        .where(where)
        .orderBy(asc(pelicanProducts.category), asc(pelicanProducts.name))
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(pelicanProducts)
        .where(where);
      return { items: items.map((r) => withPricing(r, markupMap)), total: Number(total) };
    }),

  getMarkups: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db)
      return [] as {
        category: string;
        markupBps: number;
        isDefault: boolean;
        productCount: number;
        avgCost: number | null;
      }[];
    const markupMap = await loadMarkupMap(db);
    const stats = await db
      .select({
        category: pelicanProducts.category,
        productCount: sql<number>`count(*)`,
        avgCost: sql<number>`avg(coalesce(${pelicanProducts.yourCost}, ${pelicanProducts.listPrice}))`,
      })
      .from(pelicanProducts)
      .where(eq(pelicanProducts.isActive, true))
      .groupBy(pelicanProducts.category)
      .orderBy(desc(sql`count(*)`));
    return stats.map((s) => ({
      category: s.category,
      markupBps: markupBpsFor(markupMap, s.category),
      isDefault: markupMap[s.category] === undefined,
      productCount: Number(s.productCount),
      avgCost: s.avgCost == null ? null : Number(s.avgCost),
    }));
  }),
  setMarkup: adminProcedure
    .input(z.object({ category: z.string().min(1), markupBps: z.number().int().min(0).max(100000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await db
        .insert(pelicanCategoryMarkups)
        .values({ category: input.category, markupBps: input.markupBps, updatedByOpenId: ctx.user.openId })
        .onDuplicateKeyUpdate({ set: { markupBps: input.markupBps, updatedByOpenId: ctx.user.openId } });
      return { success: true } as const;
    }),

  setPopular: adminProcedure
    .input(z.object({ id: z.number(), isPopular: z.boolean(), popularRank: z.number().min(0).default(0) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await db
        .update(pelicanProducts)
        .set({ isPopular: input.isPopular, popularRank: input.popularRank })
        .where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
  setVisibility: adminProcedure
    .input(
      z.object({
        id: z.number(),
        showInCatalog: z.boolean().optional(),
        showInDesigner: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      const patch: Record<string, boolean> = {};
      if (input.showInCatalog !== undefined) patch.showInCatalog = input.showInCatalog;
      if (input.showInDesigner !== undefined) patch.showInDesigner = input.showInDesigner;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (Object.keys(patch).length) {
        await db.update(pelicanProducts).set(patch).where(eq(pelicanProducts.id, input.id));
      }
      return { success: true } as const;
    }),
  setPricing: adminProcedure
    .input(
      z.object({
        id: z.number(),
        listPrice: z.number().nonnegative().optional(),
        yourCost: z.number().nonnegative().optional(),
        markupPercent: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      const patch: Record<string, string> = {};
      if (input.listPrice !== undefined) patch.listPrice = String(input.listPrice);
      if (input.yourCost !== undefined) patch.yourCost = String(input.yourCost);
      if (input.markupPercent !== undefined) patch.markupPercent = String(input.markupPercent);
      if (Object.keys(patch).length) {
        await db.update(pelicanProducts).set(patch).where(eq(pelicanProducts.id, input.id));
      }
      return { success: true } as const;
    }),
  /** Set the box coverage (sq ft per box) for tile/flooring products. */
  setCoverage: adminProcedure
    .input(
      z.object({
        id: z.number(),
        coverageSqFt: z.number().positive().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await db
        .update(pelicanProducts)
        .set({ coverageSqFt: input.coverageSqFt != null ? String(input.coverageSqFt) : null })
        .where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
});
