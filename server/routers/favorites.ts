import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { customerFavorites, customerFavoriteSyncs } from "../../drizzle/schema";

const storefrontSlugInput = z.string().trim().min(1).max(160).optional();

function normalizeStorefrontSlug(slug?: string): string {
  return (slug ?? "main").trim().toLowerCase() || "main";
}

async function touchFavoriteSync(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  storefrontSlug: string
) {
  const updatedAt = new Date();
  await db
    .insert(customerFavoriteSyncs)
    .values({ userId, storefrontSlug, updatedAt })
    .onDuplicateKeyUpdate({ set: { updatedAt } });
  return updatedAt;
}

export const favoritesRouter = router({
  list: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return {
          storefrontSlug: normalizeStorefrontSlug(input?.storefrontSlug),
          styleIds: [] as number[],
          lastSyncedAt: null as Date | null,
        };
      }

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
      const syncRows = await db
        .select({ updatedAt: customerFavoriteSyncs.updatedAt })
        .from(customerFavoriteSyncs)
        .where(
          and(
            eq(customerFavoriteSyncs.userId, ctx.user.id),
            eq(customerFavoriteSyncs.storefrontSlug, storefrontSlug)
          )
        )
        .limit(1);
      return {
        storefrontSlug,
        styleIds: rows.map((row) => row.styleId),
        lastSyncedAt: syncRows[0]?.updatedAt ?? null,
      };
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
      if (!db) {
        return {
          storefrontSlug: normalizeStorefrontSlug(input.storefrontSlug),
          styleIds: [] as number[],
          lastSyncedAt: null as Date | null,
        };
      }

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
      const lastSyncedAt = await touchFavoriteSync(db, ctx.user.id, storefrontSlug);
      return { storefrontSlug, styleIds: rows.map((row) => row.styleId), lastSyncedAt };
    }),

  add: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput, styleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false, lastSyncedAt: null as Date | null };

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
      const lastSyncedAt = await touchFavoriteSync(db, ctx.user.id, storefrontSlug);
      return { success: true, lastSyncedAt };
    }),

  remove: protectedProcedure
    .input(z.object({ storefrontSlug: storefrontSlugInput, styleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false, lastSyncedAt: null as Date | null };

      const storefrontSlug = normalizeStorefrontSlug(input.storefrontSlug);
      await db
        .delete(customerFavorites)
        .where(
          and(
            eq(customerFavorites.userId, ctx.user.id),
            eq(customerFavorites.storefrontSlug, storefrontSlug),
            eq(customerFavorites.styleId, input.styleId)
          )
        );
      const lastSyncedAt = await touchFavoriteSync(db, ctx.user.id, storefrontSlug);
      return { success: true, lastSyncedAt };
    }),
});

export { normalizeStorefrontSlug };
