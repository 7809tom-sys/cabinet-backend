import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cabinets, kitchenDesigns, distributorSkus, doorStyles, distributors } from "../../drizzle/schema";

export const designRouter = router({
  placeableCabinets: publicProcedure
    .input(
      z.object({
        placement: z.enum(["base", "wall", "tall"]).optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          placementType: cabinets.placementType,
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          isCornerCabinet: cabinets.isCornerCabinet,
        })
        .from(cabinets)
        .where(eq(cabinets.isActive, true));

      const withPlacement = rows.map((r) => {
        let placement = r.placementType;
        if (!placement) {
          const cat = (r.category || "").toLowerCase();
          if (cat.includes("wall")) placement = "wall";
          else if (cat.includes("tall")) placement = "tall";
          else placement = "base";
        }
        return { ...r, placement };
      });

      let filtered = withPlacement;
      if (input?.placement) {
        filtered = filtered.filter((r) => r.placement === input.placement);
      }
      if (input?.search) {
        const s = input.search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.masterCode.toLowerCase().includes(s) ||
            (r.description || "").toLowerCase().includes(s)
        );
      }

      return filtered;
    }),

  priceForCabinets: publicProcedure
    .input(
      z.object({
        cabinetIds: z.array(z.number()),
        distributorId: z.number(),
        styleId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.cabinetIds.length === 0) return [];

      return db
        .select({
          cabinetId: distributorSkus.cabinetId,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
        })
        .from(distributorSkus)
        .where(
          and(
            inArray(distributorSkus.cabinetId, input.cabinetIds),
            eq(distributorSkus.distributorId, input.distributorId),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true)
          )
        );
    }),

  save: publicProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(255),
        email: z.string().email().optional(),
        roomData: z.any(),
        placedCabinets: z.any(),
        selectedStyleId: z.number().optional(),
        selectedDistributorId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.user?.id ?? null;

      if (input.id) {
        await db
          .update(kitchenDesigns)
          .set({
            name: input.name,
            roomData: input.roomData,
            placedCabinets: input.placedCabinets,
            selectedStyleId: input.selectedStyleId,
            selectedDistributorId: input.selectedDistributorId,
          })
          .where(eq(kitchenDesigns.id, input.id));
        return { id: input.id };
      }

      const result = await db.insert(kitchenDesigns).values({
        userId,
        name: input.name,
        roomData: input.roomData,
        placedCabinets: input.placedCabinets,
        selectedStyleId: input.selectedStyleId,
        selectedDistributorId: input.selectedDistributorId,
      });
      const insertId = (result as unknown as { insertId: number }).insertId;
      return { id: insertId };
    }),

  myDesigns: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(kitchenDesigns)
      .where(eq(kitchenDesigns.userId, ctx.user.id));
  }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(kitchenDesigns)
        .where(eq(kitchenDesigns.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
});
