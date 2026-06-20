import { z } from "zod";
import { eq, and, inArray, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cabinets, kitchenDesigns, distributorSkus, doorStyles, distributors, countertopQuotes } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

export const designRouter = router({
  placeableCabinets: publicProcedure
    .input(
      z.object({
        placement: z.enum(["base", "wall", "tall"]).optional(),
        search: z.string().optional(),
        // When the user has chosen a line + door style, narrow the palette to
        // only the cabinets that are actually purchasable for THAT combination.
        distributorId: z.number().optional(),
        styleId: z.number().optional(),
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

      // Availability gate: a cabinet is only offered in the designer if it has
      // at least one published + available distributor SKU. If a specific
      // line/style is selected, the SKU must match that exact combination.
      const skuConditions = [
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input?.distributorId) {
        skuConditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }
      // Door-style-first: a styleId alone is enough to gate the palette. The
      // supply line behind the style is resolved server-side and never exposed.
      if (input?.styleId) {
        skuConditions.push(eq(distributorSkus.styleId, input.styleId));
      }
      const availableSkuRows = await db
        .select({ cabinetId: distributorSkus.cabinetId })
        .from(distributorSkus)
        .where(and(...skuConditions));
      const availableCabinetIds = new Set(availableSkuRows.map((r) => r.cabinetId));
      const availableRows = rows.filter((r) => availableCabinetIds.has(r.id));

      const withPlacement = availableRows.map((r) => {
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
        distributorId: z.number().optional(),
        styleId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.cabinetIds.length === 0) return [];

      const conditions = [
        inArray(distributorSkus.cabinetId, input.cabinetIds),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
      ];
      // distributorId is optional now — door-style-first pricing resolves the
      // supply line internally. When omitted we take the cheapest contractor
      // price per cabinet across whichever lines carry the chosen style.
      if (input.distributorId) {
        conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }

      const rows = await db
        .select({
          cabinetId: distributorSkus.cabinetId,
          platformSku: distributorSkus.platformSku,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
        })
        .from(distributorSkus)
        .where(and(...conditions));

      // Collapse to one priced row per cabinet (cheapest contractor price).
      const best = new Map<number, (typeof rows)[number]>();
      for (const r of rows) {
        const cur = best.get(r.cabinetId);
        if (!cur) { best.set(r.cabinetId, r); continue; }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
        if (a < b) best.set(r.cabinetId, r);
      }
      return Array.from(best.values());
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
      // mysql2 returns a tuple: [ResultSetHeader, ...]; insertId lives on the header.
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
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

  // ─── Countertop quote requests ───────────────────────────────────────────
  // Countertops are not auto-priced. The contractor submits the design plus
  // measured square/linear footage and we (or a supplier) quote it back.
  requestCountertopQuote: publicProcedure
    .input(
      z.object({
        contactName: z.string().max(256).optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().max(32).optional(),
        zip: z.string().max(16).optional(),
        material: z.string().max(128).optional(),
        squareFeet: z.number().nonnegative(),
        linearFeet: z.number().nonnegative(),
        hasIsland: z.boolean().default(false),
        roomData: z.any().optional(),
        placedCabinets: z.any().optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const result = await db.insert(countertopQuotes).values({
        userId: ctx.user?.id ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        zip: input.zip ?? null,
        material: input.material ?? null,
        squareFeet: String(input.squareFeet),
        linearFeet: String(input.linearFeet),
        hasIsland: input.hasIsland,
        roomData: input.roomData ?? null,
        placedCabinets: input.placedCabinets ?? null,
        notes: input.notes ?? null,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // Owner email notifications are intentionally DISABLED per owner request
      // (was flooding the owner inbox). The quote is still saved to
      // countertop_quotes and is reviewable in the Admin area. To re-enable,
      // restore the notifyOwner(...) call here.
      void notifyOwner; // referenced to avoid unused-import error

      return { id: insertId };
    }),

  listCountertopQuotes: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(countertopQuotes).orderBy(desc(countertopQuotes.createdAt));
  }),

  updateCountertopQuote: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "quoted", "won", "lost"]).optional(),
        quotedPrice: z.number().nonnegative().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const patch: Record<string, unknown> = {};
      if (input.status) patch.status = input.status;
      if (input.quotedPrice !== undefined) patch.quotedPrice = String(input.quotedPrice);
      if (Object.keys(patch).length > 0) {
        await db.update(countertopQuotes).set(patch).where(eq(countertopQuotes.id, input.id));
      }
      return { id: input.id };
    }),
});
