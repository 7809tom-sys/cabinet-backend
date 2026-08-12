import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { customerFavorites } from "../../drizzle/schema";

const storefrontSlugInput = z.string().trim().min(1).max(160).optional();

function normalizeStorefrontSlug(slug?: string): string {
  return (slug ?? "main").trim().toLowerCase() || "main";
}

export const favoritesRouter = router({
  list: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { storefrontSlug: normalizeStorefrontSlug(input?.storefrontSlug), styleIds: [] as number[] };

      const storefrontSlug = normalizeStorefrontSlug(input?.storefrontSlug);
      const rows = await db
        .select({ styleId: customerFavorites.styleId })
        .from(customerFavorites)
        .where(
          and(
            eq(customerFavorites.userId, ctx.user.id),
            eq(customerFavorites.storefrontSlug, storefrontSlug)
          )
        );
      return { storefrontSlug, styleIds: rows.map((row) => row.styleId) };
    }),

  sync: protectedProcedure
    .input(
      z.object({
        storefrontSlug: storefrontSlugInput,
        styleIds: z.array(z.number().int().positive()).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { storefrontSlug: normalizeStorefrontSlug(input.storefrontSlug), styleIds: [] as number[] };

      const storefrontSlug = normalizeStorefrontSlug(input.storefrontSlug);
      const requestedIds = Array.from(new Set(input.styleIds));
      if (requestedIds.length > 0) {
        const existingRows = await db
          .select({ styleId: customerFavorites.styleId })
          .from(customerFavorites)
          .where(
            and(
              eq(customerFavorites.userId, ctx.user.id),
              eq(customerFavorites.storefrontSlug, storefrontSlug),
              inArray(customerFavorites.styleId, requestedIds)
            )
          );
        const existingIds = new Set(existingRows.map((row) => row.styleId));
        const missingIds = requestedIds.filter((styleId) => !existingIds.has(styleId));
        if (missingIds.length > 0) {
          await db.insert(customerFavorites).values(
            missingIds.map((styleId) => ({
              userId: ctx.user.id,
              storefrontSlug,
              styleId,
            }))
          );
        }
      }

      const rows = await db
        .select({ styleId: customerFavorites.styleId })
        .from(customerFavorites)
        .where(
          and(
            eq(customerFavorites.userId, ctx.user.id),
            eq(customerFavorites.storefrontSlug, storefrontSlug)
          )
        );
      return { storefrontSlug, styleIds: rows.map((row) => row.styleId) };
    }),

  add: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput, styleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };

      const storefrontSlug = normalizeStorefrontSlug(input.storefrontSlug);
      const existing = await db
        .select({ id: customerFavorites.id })
        .from(customerFavorites)
        .where(
          and(
            eq(customerFavorites.userId, ctx.user.id),
            eq(customerFavorites.storefrontSlug, storefrontSlug),
            eq(customerFavorites.styleId, input.styleId)
          )
        )
        .limit(1);
      if (existing.length === 0) {
        await db.insert(customerFavorites).values({
          userId: ctx.user.id,
          storefrontSlug,
          styleId: input.styleId,
        });
      }
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput, styleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };

      await db
        .delete(customerFavorites)
        .where(
          and(
            eq(customerFavorites.userId, ctx.user.id),
            eq(customerFavorites.storefrontSlug, normalizeStorefrontSlug(input.storefrontSlug)),
            eq(customerFavorites.styleId, input.styleId)
          )
        );
      return { success: true };
    }),
});

export { normalizeStorefrontSlug };
