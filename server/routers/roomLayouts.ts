import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb, notInConflict } from "../db";
import {
  cabinets,
  distributors,
  distributorSkus,
  doorStyles,
  layoutPresetZones,
  layoutPresets,
  roomShapePresets,
} from "../../drizzle/schema";

const catalogInput = z.object({
  layoutPresetId: z.string().min(1).max(64),
  distributorId: z.number().int().positive(),
  styleId: z.number().int().positive(),
});

function asNumber(value: unknown) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Returns only products that are real, orderable distributor SKUs for the
 * selected style/supply line. Layout-zone rules are then applied in memory so
 * nullable zone requirements remain straightforward and explainable.
 */
export const roomLayoutsRouter = router({
  presets: publicProcedure
    .input(z.object({ roomType: z.string().max(32).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { roomShapes: [], layouts: [], zones: [] };

      const roomConditions = [eq(roomShapePresets.isActive, true)];
      if (input?.roomType) roomConditions.push(eq(roomShapePresets.roomType, input.roomType));

      const roomShapes = await db
        .select()
        .from(roomShapePresets)
        .where(and(...roomConditions))
        .orderBy(asc(roomShapePresets.sortOrder), asc(roomShapePresets.name));

      const activeShapeIds = roomShapes.map((shape) => shape.id);
      if (!activeShapeIds.length) return { roomShapes, layouts: [], zones: [] };

      const layouts = await db
        .select()
        .from(layoutPresets)
        .where(and(eq(layoutPresets.isActive, true), inArray(layoutPresets.roomShapePresetId, activeShapeIds)))
        .orderBy(asc(layoutPresets.sortOrder), asc(layoutPresets.name));

      const activeLayoutIds = layouts.map((layout) => layout.id);
      const zones = activeLayoutIds.length
        ? await db
          .select()
          .from(layoutPresetZones)
          .where(inArray(layoutPresetZones.layoutPresetId, activeLayoutIds))
          .orderBy(asc(layoutPresetZones.layoutPresetId), asc(layoutPresetZones.sequence))
        : [];

      return { roomShapes, layouts, zones };
    }),

  eligibleCatalog: publicProcedure
    .input(catalogInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { layoutPresetId: input.layoutPresetId, zones: [], candidatesByZone: {} };

      const zones = await db
        .select()
        .from(layoutPresetZones)
        .where(eq(layoutPresetZones.layoutPresetId, input.layoutPresetId))
        .orderBy(asc(layoutPresetZones.sequence));
      if (!zones.length) return { layoutPresetId: input.layoutPresetId, zones: [], candidatesByZone: {} };

      const categories = Array.from(new Set(zones.map((zone) => zone.requiredCategory).filter((value): value is string => Boolean(value))));
      const itemRows = await db
        .select({
          distributorSkuId: distributorSkus.id,
          distributorSku: distributorSkus.distributorSku,
          platformSku: distributorSkus.platformSku,
          homeownerPrice: distributorSkus.homeownerPrice,
          imageUrl: distributorSkus.imageUrl,
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          productType: cabinets.productType,
          cornerType: cabinets.cornerType,
          placementType: cabinets.placementType,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          catalogImageUrl: cabinets.catalogImageUrl,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(
          eq(distributorSkus.distributorId, input.distributorId),
          eq(distributorSkus.styleId, input.styleId),
          eq(distributorSkus.isPublished, true),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.status, "approved"),
          eq(distributors.isActive, true),
          eq(doorStyles.isActive, true),
          eq(cabinets.isActive, true),
          eq(cabinets.showInDesigner, true),
          notInConflict(),
          inArray(cabinets.category, categories),
        ));

      const candidatesByZone = Object.fromEntries(zones.map((zone) => {
        const candidates = itemRows
          .filter((item) => {
            const width = asNumber(item.width);
            if (zone.requiredSubCategory && item.subCategory !== zone.requiredSubCategory) return false;
            if (zone.requiredProductType && item.productType !== zone.requiredProductType) return false;
            if (zone.requiredCornerType && item.cornerType !== zone.requiredCornerType) return false;
            if (zone.minWidth != null && width != null && width < Number(zone.minWidth)) return false;
            if (zone.maxWidth != null && width != null && width > Number(zone.maxWidth)) return false;
            return true;
          })
          .sort((left, right) => {
            const target = Number(zone.targetWidth ?? 0);
            const leftDistance = Math.abs((asNumber(left.width) ?? target) - target);
            const rightDistance = Math.abs((asNumber(right.width) ?? target) - target);
            return leftDistance - rightDistance || left.masterCode.localeCompare(right.masterCode);
          })
          .slice(0, 4);
        return [zone.zoneKey, candidates];
      }));

      return { layoutPresetId: input.layoutPresetId, zones, candidatesByZone };
    }),
});
