import { z } from "zod";
import { eq, and, desc, lte, gte, isNull, or, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributorProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { vendorPromotions, doorStyles, distributorSkus, cabinets } from "../../drizzle/schema";
import { vendorDiscountError, vendorPromotionWindowError, type VendorDiscountType } from "@shared/vendorPromotions";

function resolveLineId(
  ctxDistributorId: number | null,
  isAdmin: boolean,
  inputDistributorId?: number | null
): number {
  if (!isAdmin) {
    if (ctxDistributorId == null) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No supply line linked." });
    }
    return ctxDistributorId;
  }
  if (inputDistributorId == null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Admins must specify distributorId." });
  }
  return inputDistributorId;
}

async function assertOwnPromotionScope(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  lineId: number,
  scope: { skuIds?: number[] | null; styleId?: number | null; category?: string | null },
) {
  if (scope.styleId != null) {
    const [style] = await db.select({ id: doorStyles.id }).from(doorStyles)
      .where(and(eq(doorStyles.id, scope.styleId), eq(doorStyles.distributorId, lineId))).limit(1);
    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That door style is not in your catalog." });
  }
  const skuIds = scope.skuIds ?? [];
  if (skuIds.length > 0) {
    const owned = await db.select({
      id: distributorSkus.id,
      styleId: distributorSkus.styleId,
      category: cabinets.category,
    }).from(distributorSkus)
      .leftJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .where(and(eq(distributorSkus.distributorId, lineId), inArray(distributorSkus.id, skuIds)));
    if (owned.length !== skuIds.length) {
      throw new TRPCError({ code: "FORBIDDEN", message: "A promotion can only discount items in your own catalog." });
    }
    if (scope.styleId != null && owned.some((row) => row.styleId !== scope.styleId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected item must belong to the chosen door style." });
    }
    if (scope.category && owned.some((row) => row.category !== scope.category)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected item must belong to the chosen category." });
    }
  }
  if (scope.category) {
    const [match] = await db.select({ id: distributorSkus.id }).from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .where(and(eq(distributorSkus.distributorId, lineId), eq(cabinets.category, scope.category)))
      .limit(1);
    if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "That category is not in your catalog." });
  }
}

function assertDiscount(discountType: VendorDiscountType, discountValue: number, startsAt?: string | null, endsAt?: string | null) {
  const discountError = vendorDiscountError(discountType, discountValue);
  if (discountError) throw new TRPCError({ code: "BAD_REQUEST", message: discountError });
  const windowError = vendorPromotionWindowError(startsAt, endsAt);
  if (windowError) throw new TRPCError({ code: "BAD_REQUEST", message: windowError });
}

export const promotionsRouter = router({
  /** List all promotions for this vendor's line. */
  list: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      return db
        .select()
        .from(vendorPromotions)
        .where(eq(vendorPromotions.distributorId, lineId))
        .orderBy(desc(vendorPromotions.createdAt));
    }),

  /** Create a new promotion. */
  create: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        name: z.string().min(1).max(256),
        skuIds: z.array(z.number()).optional(),
        styleId: z.number().optional(),
        category: z.string().max(128).optional(),
        discountType: z.enum(["percent", "fixed_amount", "fixed_price"]),
        discountValue: z.number(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      assertDiscount(input.discountType, input.discountValue, input.startsAt, input.endsAt);
      const skuIds = input.skuIds?.length ? Array.from(new Set(input.skuIds)) : null;
      await assertOwnPromotionScope(db, lineId, { skuIds, styleId: input.styleId ?? null, category: input.category || null });

      await db.insert(vendorPromotions).values({
        distributorId: lineId,
        name: input.name,
        skuIds,
        styleId: input.styleId ?? null,
        category: input.category || null,
        discountType: input.discountType,
        discountValue: String(input.discountValue),
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        isActive: true,
      });
      return { success: true };
    }),

  /** Update an existing promotion. */
  update: distributorProcedure
    .input(
      z.object({
        id: z.number(),
        distributorId: z.number().optional(),
        name: z.string().min(1).max(256).optional(),
        skuIds: z.array(z.number()).optional(),
        styleId: z.number().nullable().optional(),
        category: z.string().max(128).nullable().optional(),
        discountType: z.enum(["percent", "fixed_amount", "fixed_price"]).optional(),
        discountValue: z.number().optional(),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [existing] = await db.select().from(vendorPromotions)
        .where(and(eq(vendorPromotions.id, input.id), eq(vendorPromotions.distributorId, lineId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "That promotion is not on your line." });
      const discountType = input.discountType ?? existing.discountType;
      const discountValue = input.discountValue ?? Number(existing.discountValue);
      const startsAt = input.startsAt === undefined ? existing.startsAt?.toISOString() ?? null : input.startsAt;
      const endsAt = input.endsAt === undefined ? existing.endsAt?.toISOString() ?? null : input.endsAt;
      assertDiscount(discountType, discountValue, startsAt, endsAt);
      const skuIds = input.skuIds === undefined
        ? (Array.isArray(existing.skuIds) ? existing.skuIds.filter((id): id is number => typeof id === "number") : null)
        : (input.skuIds.length > 0 ? Array.from(new Set(input.skuIds)) : null);
      await assertOwnPromotionScope(db, lineId, {
        skuIds,
        styleId: input.styleId === undefined ? existing.styleId : input.styleId,
        category: input.category === undefined ? existing.category : input.category,
      });

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.skuIds !== undefined) patch.skuIds = skuIds;
      if (input.styleId !== undefined) patch.styleId = input.styleId;
      if (input.category !== undefined) patch.category = input.category;
      if (input.discountType !== undefined) patch.discountType = input.discountType;
      if (input.discountValue !== undefined) patch.discountValue = String(input.discountValue);
      if (input.startsAt !== undefined) patch.startsAt = input.startsAt ? new Date(input.startsAt) : null;
      if (input.endsAt !== undefined) patch.endsAt = input.endsAt ? new Date(input.endsAt) : null;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      if (Object.keys(patch).length === 0) return { success: true };

      await db
        .update(vendorPromotions)
        .set(patch)
        .where(and(eq(vendorPromotions.id, input.id), eq(vendorPromotions.distributorId, lineId)));
      return { success: true };
    }),

  /** Delete a promotion. */
  delete: distributorProcedure
    .input(z.object({ id: z.number(), distributorId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .delete(vendorPromotions)
        .where(and(eq(vendorPromotions.id, input.id), eq(vendorPromotions.distributorId, lineId)));
      return { success: true };
    }),

  /** Authenticated: get active promotions for a distributor. */
  active: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const now = new Date();
      const all = await db
        .select()
        .from(vendorPromotions)
        .where(and(eq(vendorPromotions.distributorId, lineId), eq(vendorPromotions.isActive, true)));
      return all.filter((p) => {
        if (p.startsAt && p.startsAt > now) return false;
        if (p.endsAt && p.endsAt < now) return false;
        return true;
      });
    }),

  /** Public: get all currently active promotions for storefront display. */
  activeForStorefront: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const now = new Date();
    const rows = await db
      .select({
        id: vendorPromotions.id,
        distributorId: vendorPromotions.distributorId,
        name: vendorPromotions.name,
        skuIds: vendorPromotions.skuIds,
        styleId: vendorPromotions.styleId,
        category: vendorPromotions.category,
        discountType: vendorPromotions.discountType,
        discountValue: vendorPromotions.discountValue,
      })
      .from(vendorPromotions)
      .where(and(
        eq(vendorPromotions.isActive, true),
        or(isNull(vendorPromotions.startsAt), lte(vendorPromotions.startsAt, now)),
        or(isNull(vendorPromotions.endsAt), gte(vendorPromotions.endsAt, now)),
      ));
    return rows;
  }),
});
