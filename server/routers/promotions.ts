import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { vendorPromotions, doorStyles } from "../../drizzle/schema";

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
        discountType: z.enum(["percent", "fixed_price"]),
        discountValue: z.number().positive(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      await db.insert(vendorPromotions).values({
        distributorId: lineId,
        name: input.name,
        skuIds: input.skuIds && input.skuIds.length > 0 ? input.skuIds : null,
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
        discountType: z.enum(["percent", "fixed_price"]).optional(),
        discountValue: z.number().positive().optional(),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.skuIds !== undefined) patch.skuIds = input.skuIds.length > 0 ? input.skuIds : null;
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

  /** Public: get active promotions for a distributor (used by storefront). */
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
      // Filter by date range client-side for simplicity
      return all.filter((p) => {
        if (p.startsAt && p.startsAt > now) return false;
        if (p.endsAt && p.endsAt < now) return false;
        return true;
      });
    }),
});
