/**
 * SKU Admin Router
 * Procedures for managing designer SKU coverage — which cabinets are available
 * in the Kitchen Designer for each distributor/style combination.
 */
import { and, asc, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { cabinets, costChangeLog, distributors, distributorSkus, doorStyles } from "../../drizzle/schema";

export const skuAdminRouter = router({
  /** Returns all active cabinets with their SKU coverage per distributor+style combo. */
  skuCoverageAudit: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db)
      return {
        distributors: [],
        styles: [],
        cabinets: [],
        coverage: {} as Record<number, string[]>,
        missingCabinets: [],
        totalCombos: 0,
      };

    // All active cabinets
    const allCabs = await db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
      })
      .from(cabinets)
      .where(eq(cabinets.isActive, true))
      .orderBy(asc(cabinets.masterCode));

    // All distributors
    const allDists = await db
      .select({ id: distributors.id, name: distributors.name })
      .from(distributors)
      .orderBy(asc(distributors.name));

    // All door styles
    const allStyles = await db
      .select({ id: doorStyles.id, ourName: doorStyles.ourName, styleCode: doorStyles.styleCode })
      .from(doorStyles)
      .orderBy(asc(doorStyles.ourName));

    // All existing SKUs (just cabinetId + distributorId + styleId)
    const allSkus = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        distributorId: distributorSkus.distributorId,
        styleId: distributorSkus.styleId,
      })
      .from(distributorSkus);

    // Build coverage map: cabinetId -> Set of "distId:styleId" strings
    const coverageMap = new Map<number, Set<string>>();
    for (const sku of allSkus) {
      if (!coverageMap.has(sku.cabinetId)) coverageMap.set(sku.cabinetId, new Set());
      coverageMap.get(sku.cabinetId)!.add(`${sku.distributorId}:${sku.styleId}`);
    }

    const totalCombos = allDists.length * allStyles.length;

    // Cabinets with zero SKUs
    const missingCabinets = allCabs.filter((c) => !coverageMap.has(c.id) || coverageMap.get(c.id)!.size === 0);

    // Convert coverage map to plain object for JSON serialization
    const coverage: Record<number, string[]> = {};
    for (const entry of Array.from(coverageMap.entries())) {
      coverage[entry[0]] = Array.from(entry[1]);
    }

    return {
      distributors: allDists,
      styles: allStyles,
      cabinets: allCabs,
      coverage,
      missingCabinets,
      totalCombos,
    };
  }),

  /**
   * Bulk-add SKUs for a cabinet across all distributor+style combos,
   * copying pricing from a template cabinet.
   */
  bulkAddSkusFromTemplate: adminProcedure
    .input(
      z.object({
        targetCabinetId: z.number().int(),
        templateCabinetId: z.number().int(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { inserted: 0 };

      // Get all template SKUs
      const templateSkus = await db
        .select()
        .from(distributorSkus)
        .where(eq(distributorSkus.cabinetId, input.templateCabinetId));

      if (templateSkus.length === 0) return { inserted: 0 };

      // Get existing SKUs for target cabinet
      const existingSkus = await db
        .select({ distributorId: distributorSkus.distributorId, styleId: distributorSkus.styleId })
        .from(distributorSkus)
        .where(eq(distributorSkus.cabinetId, input.targetCabinetId));

      const existingKeys = new Set(existingSkus.map((s) => `${s.distributorId}:${s.styleId}`));

      // Get target cabinet's masterCode for building the SKU
      const [targetCab] = await db
        .select({ masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.id, input.targetCabinetId))
        .limit(1);

      if (!targetCab) return { inserted: 0 };

      // Build new SKU rows
      const toInsert = templateSkus
        .filter((t) => !existingKeys.has(`${t.distributorId}:${t.styleId}`))
        .map((t) => ({
          cabinetId: input.targetCabinetId,
          distributorId: t.distributorId,
          styleId: t.styleId,
          distributorSku: `${targetCab.masterCode}-${t.styleId}`,
          platformSku: `${targetCab.masterCode}-${t.styleId}`,
          wholesalePrice: t.wholesalePrice,
          contractorPrice: t.contractorPrice,
          homeownerPrice: t.homeownerPrice,
          isAvailable: t.isAvailable,
          isPublished: t.isPublished,
        }));

      if (toInsert.length === 0) return { inserted: 0 };

      await db.insert(distributorSkus).values(toInsert);
      return { inserted: toInsert.length };
    }),

  /** Recent cost-change audit rows for a SKU or cabinet masterCode, newest first. */
  adminCostHistory: adminProcedure
    .input(
      z
        .object({
          skuId: z.number().int().optional(),
          masterCode: z.string().trim().max(64).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .refine((v) => v.skuId !== undefined || (v.masterCode && v.masterCode.length > 0), {
          message: "Provide skuId or masterCode",
        }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as (typeof costChangeLog.$inferSelect)[];
      const conds: ReturnType<typeof eq>[] = [];
      if (input.skuId !== undefined) conds.push(eq(costChangeLog.skuId, input.skuId));
      if (input.masterCode)
        conds.push(eq(costChangeLog.masterCode, input.masterCode.trim().toUpperCase()));
      return db
        .select()
        .from(costChangeLog)
        .where(conds.length === 1 ? conds[0] : and(...conds))
        .orderBy(desc(costChangeLog.createdAt))
        .limit(input.limit ?? 50);
    }),

  /** Toggle isAvailable for all SKUs of a cabinet under a specific distributor. */
  toggleCabinetSkuAvailability: adminProcedure
    .input(
      z.object({
        cabinetId: z.number().int(),
        distributorId: z.number().int(),
        available: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: 0 };
      const result = await db
        .update(distributorSkus)
        .set({ isAvailable: input.available })
        .where(
          and(
            eq(distributorSkus.cabinetId, input.cabinetId),
            eq(distributorSkus.distributorId, input.distributorId),
          ),
        );
      return { updated: (result as unknown as { affectedRows: number }).affectedRows ?? 0 };
    }),
});
