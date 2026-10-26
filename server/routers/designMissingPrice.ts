import { z } from "zod";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, getPricingSettings } from "../db";
import { cabinets, designMissingPriceEvents, distributorSkus, distributors, cabinetCodeEquivalences, affiliates } from "../../drizzle/schema";
import { sellPriceForTier } from "@shared/margins";
import { loadCodeEquivalenceGroups } from "../lib/codeEquivalenceLoader";
import { nomenclatureFamilyFor, rankFamilyAlternatives, type FamilyCandidate, type FamilySource } from "../../shared/nomenclatureFamily";

const tierEnum = z.enum(["homeowner", "contractor", "wholesale"]);

/**
 * Part 1 + Part 4 server side.
 * - `logMissing` records every Designer missing-price hit (idempotent upsert by
 *   code/store/line/style/design; hitCount accumulates).
 * - `adminList` / `adminResolve` back the admin "Designer Price Flags" tab.
 * - `alternatives` returns PRICED same-family cabinets on the active line,
 *   ranked by the Part 4 order. It never auto-swaps; the client needs an
 *   explicit Accept.
 */
export const designMissingPriceRouter = router({
  logMissing: publicProcedure
    .input(z.object({
      storeScope: z.string().trim().min(1).max(160).default("owner"),
      distributorId: z.number().int().nonnegative().nullable().optional(),
      styleId: z.number().int().nonnegative().nullable().optional(),
      designId: z.number().int().nonnegative().nullable().optional(),
      items: z.array(z.object({
        masterCode: z.string().trim().min(1).max(64),
        cabinetId: z.number().int().nonnegative().nullable().optional(),
        alternativeAvailable: z.boolean().nullable().optional(),
      })).min(1).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { logged: 0 };
      const equivalence = await loadCodeEquivalenceGroups(db);
      let logged = 0;
      for (const item of input.items) {
        const tried = equivalence.groupSpellings(item.masterCode).join(",");
        await db.execute(sql`
          INSERT INTO design_missing_price_events
            (masterCode, cabinetId, storeScope, distributorId, styleId, designId, userId, triedCodes, alternativeAvailable, hitCount)
          VALUES
            (${item.masterCode}, ${item.cabinetId ?? null}, ${input.storeScope}, ${input.distributorId ?? 0}, ${input.styleId ?? 0}, ${input.designId ?? 0}, ${ctx.user?.id ?? null}, ${tried}, ${item.alternativeAvailable ?? null}, 1)
          ON DUPLICATE KEY UPDATE
            hitCount = hitCount + 1,
            lastSeenAt = CURRENT_TIMESTAMP,
            resolvedAt = NULL,
            triedCodes = VALUES(triedCodes),
            alternativeAvailable = COALESCE(VALUES(alternativeAvailable), alternativeAvailable),
            userId = COALESCE(VALUES(userId), userId),
            cabinetId = COALESCE(VALUES(cabinetId), cabinetId)
        `);
        logged += 1;
      }
      return { logged };
    }),

  adminList: adminProcedure
    .input(z.object({
      includeResolved: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(200),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], openCount: 0 };
      const includeResolved = input?.includeResolved ?? false;
      const rows = await db
        .select({
          id: designMissingPriceEvents.id,
          masterCode: designMissingPriceEvents.masterCode,
          cabinetId: designMissingPriceEvents.cabinetId,
          storeScope: designMissingPriceEvents.storeScope,
          distributorId: designMissingPriceEvents.distributorId,
          distributorName: distributors.name,
          styleId: designMissingPriceEvents.styleId,
          designId: designMissingPriceEvents.designId,
          userId: designMissingPriceEvents.userId,
          triedCodes: designMissingPriceEvents.triedCodes,
          alternativeAvailable: designMissingPriceEvents.alternativeAvailable,
          hitCount: designMissingPriceEvents.hitCount,
          firstSeenAt: designMissingPriceEvents.firstSeenAt,
          lastSeenAt: designMissingPriceEvents.lastSeenAt,
          resolvedAt: designMissingPriceEvents.resolvedAt,
        })
        .from(designMissingPriceEvents)
        .leftJoin(distributors, eq(distributors.id, designMissingPriceEvents.distributorId))
        .where(includeResolved ? undefined : isNull(designMissingPriceEvents.resolvedAt))
        .orderBy(desc(designMissingPriceEvents.lastSeenAt))
        .limit(input?.limit ?? 200);
      const [openCountRow] = await db
        .select({ n: sql<number>`COUNT(*)` })
        .from(designMissingPriceEvents)
        .where(isNull(designMissingPriceEvents.resolvedAt));
      return { rows, openCount: Number(openCountRow?.n ?? 0) };
    }),

  adminResolve: adminProcedure
    .input(z.object({ id: z.number().int().positive(), resolved: z.boolean().default(true) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db
        .update(designMissingPriceEvents)
        .set(input.resolved ? { resolvedAt: new Date(), resolvedBy: ctx.user.id } : { resolvedAt: null, resolvedBy: null })
        .where(eq(designMissingPriceEvents.id, input.id));
      return { ok: true };
    }),

  adminEquivalences: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { groups: [] as string[][], explicitRows: [] as Array<{ id: number; codeA: string; codeB: string; family: string | null; isActive: boolean }> };
    const explicitRows = await db
      .select({ id: cabinetCodeEquivalences.id, codeA: cabinetCodeEquivalences.codeA, codeB: cabinetCodeEquivalences.codeB, family: cabinetCodeEquivalences.family, isActive: cabinetCodeEquivalences.isActive })
      .from(cabinetCodeEquivalences)
      .orderBy(cabinetCodeEquivalences.family, cabinetCodeEquivalences.codeA);
    const groups = (await loadCodeEquivalenceGroups(db)).allGroups();
    return { groups, explicitRows };
  }),

  /**
   * Part 4: priced same-family alternatives on the active line for one
   * flagged cabinet. Only cabinets with a published, available price row for
   * (distributorId, styleId) are returned. Ranking: same width -> same
   * height/depth -> same hinge/opening side -> same door style (already
   * filtered) -> closest function. Top 3.
   */
  alternatives: publicProcedure
    .input(z.object({
      masterCode: z.string().trim().min(1).max(64),
      cabinetId: z.number().int().nonnegative().optional(),
      styleId: z.number().int().positive(),
      distributorId: z.number().int().positive().optional(),
      tier: tierEnum.default("homeowner"),
      limit: z.number().int().min(1).max(5).default(3),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { family: null, source: null, alternatives: [] as Array<FamilyCandidate & { customerPrice: number; differences: string[]; score: number }> };
      const sourceRows = input.cabinetId
        ? await db.select({
            id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description,
            category: cabinets.category, subCategory: cabinets.subCategory, placementType: cabinets.placementType,
            width: cabinets.width, height: cabinets.height, depth: cabinets.depth,
            hingeSide: cabinets.hingeSide, numberOfDoors: cabinets.numberOfDoors, numberOfDrawers: cabinets.numberOfDrawers,
            isCornerCabinet: cabinets.isCornerCabinet, cornerType: cabinets.cornerType,
          }).from(cabinets).where(eq(cabinets.id, input.cabinetId)).limit(1)
        : await db.select({
            id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description,
            category: cabinets.category, subCategory: cabinets.subCategory, placementType: cabinets.placementType,
            width: cabinets.width, height: cabinets.height, depth: cabinets.depth,
            hingeSide: cabinets.hingeSide, numberOfDoors: cabinets.numberOfDoors, numberOfDrawers: cabinets.numberOfDrawers,
            isCornerCabinet: cabinets.isCornerCabinet, cornerType: cabinets.cornerType,
          }).from(cabinets).where(eq(cabinets.masterCode, input.masterCode)).limit(1);
      const sourceRow = sourceRows[0];
      const source: FamilySource = {
        masterCode: sourceRow?.masterCode ?? input.masterCode,
        description: sourceRow?.description ?? null,
        category: sourceRow?.category ?? null,
        subCategory: sourceRow?.subCategory ?? null,
        placementType: sourceRow?.placementType ?? null,
        width: Number(sourceRow?.width ?? 0),
        height: Number(sourceRow?.height ?? 0),
        depth: Number(sourceRow?.depth ?? 0),
        hingeSide: sourceRow?.hingeSide ?? null,
        numberOfDoors: sourceRow?.numberOfDoors ?? null,
        numberOfDrawers: sourceRow?.numberOfDrawers ?? null,
        isCornerCabinet: Boolean(sourceRow?.isCornerCabinet),
        cornerType: sourceRow?.cornerType ?? null,
      };
      const family = nomenclatureFamilyFor(source);
      const conditions = [
        eq(cabinets.isActive, true),
        ne(cabinets.conflictStatus, "conflict"),
        eq(cabinets.showInDesigner, true),
        eq(cabinets.designerEligible, true),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
      ];
      if (input.distributorId) conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      const rows = await db
        .select({
          id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description,
          category: cabinets.category, subCategory: cabinets.subCategory, placementType: cabinets.placementType,
          width: cabinets.width, height: cabinets.height, depth: cabinets.depth,
          hingeSide: cabinets.hingeSide, numberOfDoors: cabinets.numberOfDoors, numberOfDrawers: cabinets.numberOfDrawers,
          isCornerCabinet: cabinets.isCornerCabinet, cornerType: cabinets.cornerType,
          catalogImageUrl: cabinets.catalogImageUrl,
          listPrice: distributorSkus.listPrice, yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice, adjustedListPrice: distributorSkus.adjustedListPrice,
          retailPriceBasis: distributors.retailPriceBasis,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
        .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
        .where(and(...conditions));
      const ps = await getPricingSettings();
      const equivalence = await loadCodeEquivalenceGroups(db);
      const candidates: Array<FamilyCandidate & { customerPrice: number }> = [];
      const seen = new Set<number>();
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        const price = sellPriceForTier(row, ps, input.tier);
        if (price == null || !(price > 0)) continue;
        // The flagged code's own equivalence group is not an "alternative" — if it
        // were priced here the Part 2 resolver would already have used it.
        if (equivalence.sameGroup(row.masterCode, source.masterCode)) continue;
        seen.add(row.id);
        candidates.push({
          cabinetId: row.id,
          masterCode: row.masterCode,
          description: row.description ?? null,
          category: row.category ?? null,
          subCategory: row.subCategory ?? null,
          placementType: row.placementType ?? null,
          width: Number(row.width ?? 0),
          height: Number(row.height ?? 0),
          depth: Number(row.depth ?? 0),
          hingeSide: row.hingeSide ?? null,
          numberOfDoors: row.numberOfDoors ?? null,
          numberOfDrawers: row.numberOfDrawers ?? null,
          isCornerCabinet: Boolean(row.isCornerCabinet),
          cornerType: row.cornerType ?? null,
          catalogImageUrl: row.catalogImageUrl ?? null,
          customerPrice: Math.round(price * 100) / 100,
        });
      }
      const alternatives = rankFamilyAlternatives(source, candidates, input.limit);
      return { family, source, alternatives };
    }),
});
