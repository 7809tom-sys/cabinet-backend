import { z } from "zod";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  distributors,
  cabinets,
  distributorSkus,
  doorStyles,
  orderRequests,
} from "../../drizzle/schema";

/**
 * Resolve the supply line this request operates on.
 * - distributor role → their own linked line (input distributorId ignored)
 * - admin → must pass a distributorId in input (acts on behalf of that line)
 */
function resolveLineId(
  ctxDistributorId: number | null,
  isAdmin: boolean,
  inputDistributorId?: number | null
): number {
  if (!isAdmin) {
    if (ctxDistributorId == null) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No supply line linked to your account." });
    }
    return ctxDistributorId;
  }
  if (inputDistributorId == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Admins must specify a distributorId to act on a supply line.",
    });
  }
  return inputDistributorId;
}

export const distributorPortalRouter = router({
  /** The line this user manages: neutral label, counts, lead time. No real brand leaks. */
  myLine: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);

      const rows = await db
        .select({
          id: distributors.id,
          name: distributors.name, // neutral label (Line A/B/C)
          initials: distributors.initials,
          leadTimeDays: distributors.leadTimeDays,
          warehouseZips: distributors.warehouseZips,
          isActive: distributors.isActive,
        })
        .from(distributors)
        .where(eq(distributors.id, lineId))
        .limit(1);
      const line = rows[0];
      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

      // SKU counts for this line.
      const [counts] = await db
        .select({
          total: sql<number>`count(*)`,
          published: sql<number>`sum(case when ${distributorSkus.isPublished} = true then 1 else 0 end)`,
          available: sql<number>`sum(case when ${distributorSkus.isAvailable} = true then 1 else 0 end)`,
        })
        .from(distributorSkus)
        .where(eq(distributorSkus.distributorId, lineId));

      // Door styles carried by this line.
      const styles = await db
        .select({ id: doorStyles.id, ourName: doorStyles.ourName, doorStyle: doorStyles.doorStyle })
        .from(doorStyles)
        .where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isActive, true)))
        .orderBy(doorStyles.ourName);

      return {
        line,
        counts: {
          total: Number(counts?.total ?? 0),
          published: Number(counts?.published ?? 0),
          available: Number(counts?.available ?? 0),
        },
        styles,
      };
    }),

  /** This line's catalog: one row per SKU with cabinet info + visibility state. */
  catalog: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number().optional(),
        category: z.string().max(64).optional(),
        search: z.string().max(64).optional(),
        onlyHidden: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      const conds = [eq(distributorSkus.distributorId, lineId)];
      if (input.styleId) conds.push(eq(distributorSkus.styleId, input.styleId));
      if (input.onlyHidden) conds.push(eq(distributorSkus.isPublished, false));
      if (input.category) conds.push(eq(cabinets.category, input.category));
      const q = input.search?.trim();
      if (q) {
        const like = `%${q}%`;
        conds.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like})`
        );
      }

      const base = db
        .select({
          skuId: distributorSkus.id,
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          styleId: distributorSkus.styleId,
          styleName: doorStyles.ourName,
          platformSku: distributorSkus.platformSku,
          contractorPrice: distributorSkus.contractorPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          isPublished: distributorSkus.isPublished,
          isAvailable: distributorSkus.isAvailable,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(...conds));

      const rows = await base
        .orderBy(cabinets.category, cabinets.masterCode)
        .limit(input.limit)
        .offset(input.offset);

      // Total count for pagination — reflects the SAME filters (incl. search).
      const [tot] = await db
        .select({ n: sql<number>`count(*)` })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(...conds));

      return { items: rows, total: Number(tot?.n ?? 0) };
    }),

  /** Toggle a single SKU's published (visible) state. Scoped to this line. */
  setVisibility: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        isPublished: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard: the SKU must belong to this line.
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, isPublished: input.isPublished };
    }),

  /** Bulk publish/unpublish a set of SKUs in this line. */
  bulkSetVisibility: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuIds: z.array(z.number()).min(1).max(1000),
        isPublished: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Only update rows that belong to this line.
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(inArray(distributorSkus.id, input.skuIds), eq(distributorSkus.distributorId, lineId)));
      const ownedIds = owned.map((o) => o.id);
      if (ownedIds.length === 0) return { updated: 0 };

      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(inArray(distributorSkus.id, ownedIds));
      return { updated: ownedIds.length };
    }),

  /** Order requests that reference a door style carried by this line. */
  orders: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Resolve the door-style ids that belong to this line.
      const styleRows = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, lineId));
      const styleIds = styleRows.map((s) => s.id);
      if (styleIds.length === 0) return [];

      // Orders whose order-level styleId is one of this line's styles. (Line items
      // may also carry styleIds, but the family-lock rule guarantees a submitted
      // order resolves to a single style, so the order-level styleId is sufficient.)
      const rows = await db
        .select({
          id: orderRequests.id,
          requestNumber: orderRequests.requestNumber,
          status: orderRequests.status,
          styleId: orderRequests.styleId,
          styleName: orderRequests.styleName,
          tier: orderRequests.tier,
          itemCount: orderRequests.itemCount,
          totalAmount: orderRequests.totalAmount,
          source: orderRequests.source,
          createdAt: orderRequests.createdAt,
          // NOTE: originator contact intentionally omitted from the distributor view;
          // fulfillment contact is handled by the platform, not the supplier.
        })
        .from(orderRequests)
        .where(and(inArray(orderRequests.styleId, styleIds), eq(orderRequests.status, "submitted")))
        .orderBy(desc(orderRequests.createdAt))
        .limit(input.limit);
      return rows;
    }),
});
