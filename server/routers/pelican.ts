import { z } from "zod";
import { and, eq, sql, asc, desc, like, or } from "drizzle-orm";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { pelicanProducts } from "../../drizzle/schema";

// The Pelican International product line: surfaces & fixtures imported from the
// price list. Visible categories appear in the storefront catalog + designer;
// "Samples" and "Marketing & Merchandise" are back-office (admin) only.
//
// price-list price is the MSRP; listPrice mirrors it as the displayed price.
// yourCost / markupPercent are left blank until pricing is finalized.

const CategoryEnum = z.enum([
  "Quartz Slabs (Countertops)",
  "Flooring",
  "Tile & Mosaic",
  "Sinks & Faucets",
  "Toilets & Bidets",
  "Shower & Bath",
  "Samples",
  "Marketing & Merchandise",
]);

export const pelicanRouter = router({
  categories: publicProcedure
    .input(
      z
        .object({ scope: z.enum(["designer", "catalog", "all"]).default("catalog") })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as { category: string; count: number; popular: number }[];
      const scope = input?.scope ?? "catalog";
      const where =
        scope === "designer"
          ? and(eq(pelicanProducts.isActive, true), eq(pelicanProducts.showInDesigner, true))
          : scope === "catalog"
          ? and(eq(pelicanProducts.isActive, true), eq(pelicanProducts.showInCatalog, true))
          : undefined;
      const rows = await db
        .select({
          category: pelicanProducts.category,
          count: sql<number>`count(*)`,
          popular: sql<number>`sum(case when ${pelicanProducts.isPopular} then 1 else 0 end)`,
        })
        .from(pelicanProducts)
        .where(where as any)
        .groupBy(pelicanProducts.category)
        .orderBy(desc(sql`count(*)`));
      return rows.map(r => ({
        category: r.category,
        count: Number(r.count),
        popular: Number(r.popular),
      }));
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
      const conds = [eq(pelicanProducts.category, input.category), eq(pelicanProducts.isActive, true)];
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

      const suggested =
        input.search || input.subCategory || input.offset > 0
          ? []
          : await db
              .select()
              .from(pelicanProducts)
              .where(and(where, eq(pelicanProducts.isPopular, true)))
              .orderBy(asc(pelicanProducts.popularRank))
              .limit(12);

      const items = await db
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
        suggested,
        items,
        total: Number(total),
        subCategories: subs.map(s => s.subCategory).filter(Boolean) as string[],
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
      return row ?? null;
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
});
