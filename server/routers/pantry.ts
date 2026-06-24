import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cabinets, distributorSkus, pantryBundles } from "../../drizzle/schema";

// ─── Split Pantry pairing ──────────────────────────────────────────────────────
// Faircrest (Clark & Son) tall pantries are sold as TWO pieces: a 54"H bottom
// (UCB24/30/3654) plus a same-width top wall cabinet (W..24, heights 30/36/42)
// that together reach 84"/90"/96". When a user adds a split-pantry bottom, the
// order UI auto-adds the matching top in the SAME door style (never mixed).
//
// 18" pantries are single-piece tall utility cabinets and are intentionally not
// part of this pairing (there is no 18" top), so they are excluded by data.

const SUB_CATEGORY = "Split Pantry";

export type SplitPantryTop = {
  cabinetId: number;
  masterCode: string;
  description: string;
  width: number;
  topHeight: number;
  totalHeight: number;
  unitPrice: number | null;
  platformSku: string | null;
  styleId: number;
};

export const pantryRouter = router({
  // List the master codes that are split-pantry BOTTOMS, so the client can
  // recognize when a line item requires an auto-added top.
  listBottoms: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as { cabinetId: number; masterCode: string; width: number }[];
    const rows = await db
      .select({
        cabinetId: cabinets.id,
        masterCode: cabinets.masterCode,
        width: cabinets.width,
      })
      .from(cabinets)
      .where(and(eq(cabinets.subCategory, SUB_CATEGORY), eq(cabinets.isActive, true)));
    return rows
      .filter((r) => /^UCB\d+54$/.test(r.masterCode)) // bottoms only (…54 = 54"H)
      .map((r) => ({
        cabinetId: r.cabinetId,
        masterCode: r.masterCode,
        width: Math.round(Number(r.width ?? 0)),
      }));
  }),

  // Return true if a given cabinetId is a split-pantry bottom.
  isBottom: publicProcedure
    .input(z.object({ cabinetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { isBottom: false, width: 0 };
      const rows = await db
        .select({ masterCode: cabinets.masterCode, width: cabinets.width, sub: cabinets.subCategory })
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      const r = rows[0];
      const isBottom = !!r && r.sub === SUB_CATEGORY && /^UCB\d+54$/.test(r.masterCode);
      return { isBottom, width: isBottom ? Math.round(Number(r!.width ?? 0)) : 0 };
    }),

  // Given a split-pantry bottom (by cabinetId), a desired total height, and a
  // door style, return the matching TOP cabinet + its price in that style.
  // Falls back to the bundle table for authoritative pairing.
  pairForBottom: publicProcedure
    .input(
      z.object({
        bottomCabinetId: z.number().int().positive(),
        totalHeight: z.union([z.literal(84), z.literal(90), z.literal(96)]).default(84),
        styleId: z.number().int().positive(),
      })
    )
    .query(async ({ input }): Promise<SplitPantryTop | null> => {
      const db = await getDb();
      if (!db) return null;

      // Resolve the bottom's width.
      const bRows = await db
        .select({ masterCode: cabinets.masterCode, width: cabinets.width, sub: cabinets.subCategory })
        .from(cabinets)
        .where(eq(cabinets.id, input.bottomCabinetId))
        .limit(1);
      const bottom = bRows[0];
      if (!bottom || bottom.sub !== SUB_CATEGORY || !/^UCB\d+54$/.test(bottom.masterCode)) {
        return null; // not a split-pantry bottom
      }
      const width = Math.round(Number(bottom.width ?? 0));

      // Find the authoritative bundle for this width + height + style.
      const bundleRows = await db
        .select({
          topSku: pantryBundles.topSku,
          topListPrice: pantryBundles.topListPrice,
          width: pantryBundles.width,
          totalHeight: pantryBundles.totalHeight,
        })
        .from(pantryBundles)
        .where(
          and(
            eq(pantryBundles.width, width),
            eq(pantryBundles.totalHeight, input.totalHeight),
            eq(pantryBundles.styleId, input.styleId)
          )
        )
        .limit(1);
      const bundle = bundleRows[0];
      if (!bundle) return null; // finish not available at this size (e.g. N/A)

      // Resolve the top cabinet record + its per-style SKU.
      const topRows = await db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          width: cabinets.width,
          height: cabinets.height,
        })
        .from(cabinets)
        .where(eq(cabinets.masterCode, bundle.topSku))
        .limit(1);
      const top = topRows[0];
      if (!top) return null;

      const skuRows = await db
        .select({ unitPrice: distributorSkus.listPrice, platformSku: distributorSkus.platformSku })
        .from(distributorSkus)
        .where(
          and(
            eq(distributorSkus.cabinetId, top.cabinetId),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        )
        .limit(1);
      const sku = skuRows[0];

      return {
        cabinetId: top.cabinetId,
        masterCode: top.masterCode,
        description: top.description,
        width: Math.round(Number(top.width ?? 0)),
        topHeight: Math.round(Number(top.height ?? 0)),
        totalHeight: bundle.totalHeight,
        unitPrice: sku?.unitPrice != null ? Number(sku.unitPrice) : Number(bundle.topListPrice ?? 0),
        platformSku: sku?.platformSku ?? null,
        styleId: input.styleId,
      };
    }),
});
