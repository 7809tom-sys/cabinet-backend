import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { customerPreferredProducts, pelicanCategoryMarkups } from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { normalizeStorefrontSlug } from "./favorites";

const MAX_PREFERRED_PER_CATEGORY = 6;
const preferredCategorySchema = z.enum(["flooring", "countertop", "backsplash", "faucet", "sink"]);
type PreferredCategory = z.infer<typeof preferredCategorySchema>;

function preferredCategoryForProduct(product: { category: string; subCategory: string | null }): PreferredCategory | null {
  if (product.category === "Flooring") return "flooring";
  if (product.category === "Quartz Slabs (Countertops)") return "countertop";
  if (product.category === "Tile & Mosaic") return "backsplash";
  if (product.category !== "Sinks & Faucets") return null;
  const details = `${product.subCategory ?? ""}`.toLowerCase();
  if (details.includes("faucet")) return "faucet";
  if (details.includes("sink")) return "sink";
  return null;
}

function preferredSellPrice(product: { listPrice: string | null; yourCost: string | null; category: string }, markupBpsByCategory: Record<string, number>): number | null {
  const value = Number(product.yourCost ?? product.listPrice);
  if (!Number.isFinite(value) || value <= 0) return null;
  const defaultBps = product.category === "Flooring" ? 6500
    : product.category === "Tile & Mosaic" ? 5500
    : product.category === "Sinks & Faucets" ? 3800
    : product.category === "Quartz Slabs (Countertops)" ? 1800
    : 0;
  const bps = markupBpsByCategory[product.category] ?? defaultBps;
  return Math.round(value * (1 + bps / 10000) * 100) / 100;
}

const storefrontSlugInput = z.string().trim().min(1).max(160).optional();

export const preferredProductsRouter = router({
  list: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const storefrontSlug = normalizeStorefrontSlug(input?.storefrontSlug);
      if (!db) return { storefrontSlug, products: [], maxPerCategory: MAX_PREFERRED_PER_CATEGORY };
      const preferences = await db
        .select({ productId: customerPreferredProducts.productId, category: customerPreferredProducts.category, createdAt: customerPreferredProducts.createdAt })
        .from(customerPreferredProducts)
        .where(and(eq(customerPreferredProducts.userId, ctx.user.id), eq(customerPreferredProducts.storefrontSlug, storefrontSlug)))
        .orderBy(asc(customerPreferredProducts.createdAt));
      if (!preferences.length) return { storefrontSlug, products: [], maxPerCategory: MAX_PREFERRED_PER_CATEGORY };
      const ids = preferences.map((item) => item.productId);
      const products = await db.select().from(pelicanProducts).where(and(inArray(pelicanProducts.id, ids), eq(pelicanProducts.isActive, true)));
      const markupRows = await db.select({ category: pelicanCategoryMarkups.category, markupBps: pelicanCategoryMarkups.markupBps }).from(pelicanCategoryMarkups);
      const markupBpsByCategory = Object.fromEntries(markupRows.map((row) => [row.category, row.markupBps]));
      const byId = new Map(products.map((product) => [product.id, product]));
      return {
        storefrontSlug,
        maxPerCategory: MAX_PREFERRED_PER_CATEGORY,
        products: preferences.flatMap((preference) => {
          const product = byId.get(preference.productId);
          if (!product) return [];
          return [{
            id: product.id,
            slug: product.slug,
            name: product.name,
            category: preference.category,
            productCategory: product.category,
            subCategory: product.subCategory,
            size: product.size,
            imageUrl: product.imageUrl,
            materialImageUrl: product.materialImageUrl,
            sellPrice: preferredSellPrice(product, markupBpsByCategory),
            coverageSqFt: product.coverageSqFt == null ? null : Number(product.coverageSqFt),
            unsupportedOverhangLimitIn: product.unsupportedOverhangLimitIn == null ? null : Number(product.unsupportedOverhangLimitIn),
          }];
        }),
      };
    }),

  add: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput, productId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Preferred products are temporarily unavailable." });
      const storefrontSlug = normalizeStorefrontSlug(input.storefrontSlug);
      const [product] = await db.select().from(pelicanProducts).where(and(eq(pelicanProducts.id, input.productId), eq(pelicanProducts.isActive, true), eq(pelicanProducts.showInCatalog, true))).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "This catalog product is no longer available." });
      const category = preferredCategoryForProduct(product);
      if (!category) throw new TRPCError({ code: "BAD_REQUEST", message: "Only flooring, countertops, backsplashes, faucets, and sinks can be added to Preferred." });
      const [alreadySaved] = await db.select({ id: customerPreferredProducts.id }).from(customerPreferredProducts).where(and(eq(customerPreferredProducts.userId, ctx.user.id), eq(customerPreferredProducts.storefrontSlug, storefrontSlug), eq(customerPreferredProducts.productId, product.id))).limit(1);
      if (!alreadySaved) {
        const count = await db.select({ id: customerPreferredProducts.id }).from(customerPreferredProducts).where(and(eq(customerPreferredProducts.userId, ctx.user.id), eq(customerPreferredProducts.storefrontSlug, storefrontSlug), eq(customerPreferredProducts.category, category)));
        if (count.length >= MAX_PREFERRED_PER_CATEGORY) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `You can save up to ${MAX_PREFERRED_PER_CATEGORY} preferred ${category} products. Remove one before adding another.` });
        }
        await db.insert(customerPreferredProducts).values({ userId: ctx.user.id, storefrontSlug, productId: product.id, category });
      }
      return { success: true, category, productId: product.id, maxPerCategory: MAX_PREFERRED_PER_CATEGORY };
    }),

  remove: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput, productId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Preferred products are temporarily unavailable." });
      await db.delete(customerPreferredProducts).where(and(eq(customerPreferredProducts.userId, ctx.user.id), eq(customerPreferredProducts.storefrontSlug, normalizeStorefrontSlug(input.storefrontSlug)), eq(customerPreferredProducts.productId, input.productId)));
      return { success: true, productId: input.productId };
    }),
});

export { MAX_PREFERRED_PER_CATEGORY, preferredCategoryForProduct };
