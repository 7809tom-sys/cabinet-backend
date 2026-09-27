import { z } from "zod";
import { and, eq, inArray, desc, gte, lte, isNotNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  distributors,
  cabinets,
  distributorSkus,
  doorStyles,
	  doorStyleRoomScenes,
  orderRequests,
  kitchenDesigns,
  aiServiceRequests,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { normalizeCode } from "../../shared/cabinetCodeMatch";
import { matchVendorCabinetBySku, hasVendorPrice, buildUnmatchedPlatformSku } from "../vendorProductSubmission";
import {
  inventoryForecastRow,
  isForecastRateBps,
  type ForecastRateBand,
} from "@shared/inventoryForecast";

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

const MAX_DESIGN_TOOL_PICKS = 8;

const monthOffset = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

function placedCabinetQuantity(value: unknown): number {
  if (!value || typeof value !== "object") return 1;
  const source = value as { quantity?: unknown; qty?: unknown };
  const qty = Number(source.quantity ?? source.qty ?? 1);
  return Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.round(qty)) : 1;
}

function formatForecastRates(line: {
  inventoryForecastCloseRateBps: number | null;
  inventoryForecastLowRateBps: number | null;
  inventoryForecastHighRateBps: number | null;
}): ForecastRateBand {
  return {
    baseRateBps: line.inventoryForecastCloseRateBps,
    lowRateBps: line.inventoryForecastLowRateBps,
    highRateBps: line.inventoryForecastHighRateBps,
  };
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
          name: distributors.name,
          initials: distributors.initials,
          leadTimeDays: distributors.leadTimeDays,
          warehouseZips: distributors.warehouseZips,
          isActive: distributors.isActive,
          designToolPicks: distributors.designToolPicks,
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
          pending: sql<number>`sum(case when ${distributorSkus.status} = 'pending' then 1 else 0 end)`,
        })
        .from(distributorSkus)
        .where(eq(distributorSkus.distributorId, lineId));

      // Door styles carried by this line — deduplicated by ourName so that
      // rows with the same display name (e.g. from a re-import) only appear once.
      const rawStyles = await db
        .select({
          id: doorStyles.id,
          ourName: doorStyles.ourName,
          doorStyle: doorStyles.doorStyle,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        })
        .from(doorStyles)
        .where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isActive, true)))
        .orderBy(doorStyles.ourName);
      // Keep only the first occurrence of each ourName (lowest id wins).
      const seenNames = new Set<string>();
      const styles = rawStyles.filter((s) => {
        if (seenNames.has(s.ourName)) return false;
        seenNames.add(s.ourName);
        return true;
      });

      return {
        line,
        counts: {
          total: Number(counts?.total ?? 0),
          published: Number(counts?.published ?? 0),
          available: Number(counts?.available ?? 0),
          pending: Number(counts?.pending ?? 0),
        },
        styles,
      };
    }),

	/**
	 * The Featured Door Styles manager is intentionally scoped to the vendor's
	 * actual cabinet line. A style must have at least one catalog row for this
	 * distributor before it appears here; a vendor can never browse another
	 * supplier's styles or cabinets through this surface. Search and category
	 * filters are applied against the vendor's cabinet records, not merely a
	 * door-style label, so a vendor can find a specific cabinet SKU.
	 */
	featuredStyles: distributorProcedure
	  .input(z.object({
	    distributorId: z.number().optional(),
	    search: z.string().trim().max(120).optional(),
	    categories: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
	  }).optional())
	  .query(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
	    const catalogRows = await db
	      .select({
	        styleId: distributorSkus.styleId,
	        cabinetId: cabinets.id,
	        masterCode: cabinets.masterCode,
	        description: cabinets.description,
	        category: cabinets.category,
	        platformSku: distributorSkus.platformSku,
	        distributorSku: distributorSkus.distributorSku,
	      })
	      .from(distributorSkus)
	      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
	      .where(and(eq(distributorSkus.distributorId, lineId), isNotNull(distributorSkus.styleId)));

	    const categoryCounts = new Map<string, Set<number>>();
	    const categoriesByStyle = new Map<number, Set<string>>();
	    for (const row of catalogRows) {
	      if (row.styleId == null) continue;
	      const category = row.category.trim();
	      if (!category) continue;
	      const cabinetIds = categoryCounts.get(category) ?? new Set<number>();
	      cabinetIds.add(row.cabinetId);
	      categoryCounts.set(category, cabinetIds);
	      const categories = categoriesByStyle.get(row.styleId) ?? new Set<string>();
	      categories.add(category);
	      categoriesByStyle.set(row.styleId, categories);
	    }
	    const categories = Array.from(categoryCounts.entries())
	      .map(([category, cabinetIds]) => ({ category, cabinetCount: cabinetIds.size }))
	      .sort((left, right) => left.category.localeCompare(right.category));

	    const requestedCategories = new Set((input?.categories ?? []).map((category) => category.trim()).filter(Boolean));
	    const term = input?.search?.trim().toLowerCase() ?? "";
	    const normalizedTerm = term.replace(/[\s_-]/g, "");
	    const matchesSearch = (row: typeof catalogRows[number]) => {
	      if (!term) return true;
	      const fields = [row.masterCode, row.description, row.platformSku ?? "", row.distributorSku ?? ""];
	      return fields.some((value) => {
	        const normalized = value.toLowerCase();
	        return normalized.includes(term) || (normalizedTerm.length > 0 && normalized.replace(/[\s_-]/g, "").includes(normalizedTerm));
	      });
	    };
	    const matchingCatalogRows = catalogRows.filter((row) =>
	      (requestedCategories.size === 0 || requestedCategories.has(row.category))
	      && matchesSearch(row),
	    );
	    const styleIds = Array.from(new Set(matchingCatalogRows
	      .map((row) => row.styleId)
	      .filter((id): id is number => id != null)));
	    if (styleIds.length === 0) return { styles: [], categories };

	    const [styles, scenes] = await Promise.all([
	      db
	        .select({
	          id: doorStyles.id,
	          distributorId: doorStyles.distributorId,
	          styleCode: doorStyles.styleCode,
	          ourName: doorStyles.ourName,
	          distributorName: doorStyles.distributorName,
	          doorStyle: doorStyles.doorStyle,
	          color: doorStyles.color,
	          finish: doorStyles.finish,
	          woodSpecies: doorStyles.woodSpecies,
	          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
	          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
	          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
	          doorSampleVerified: doorStyles.doorSampleVerified,
	          isFeatured: doorStyles.isFeatured,
	          featuredRank: doorStyles.featuredRank,
	          isActive: doorStyles.isActive,
	        })
	        .from(doorStyles)
	        .where(and(eq(doorStyles.distributorId, lineId), inArray(doorStyles.id, styleIds)))
	        .orderBy(doorStyles.featuredRank, doorStyles.ourName),
	      db
	        .select({
	          id: doorStyleRoomScenes.id,
	          styleId: doorStyleRoomScenes.styleId,
	          imageUrl: doorStyleRoomScenes.imageUrl,
	          sortOrder: doorStyleRoomScenes.sortOrder,
	          isVerified: doorStyleRoomScenes.isVerified,
	          isActive: doorStyleRoomScenes.isActive,
	        })
	        .from(doorStyleRoomScenes)
	        .where(inArray(doorStyleRoomScenes.styleId, styleIds))
	        .orderBy(doorStyleRoomScenes.sortOrder, doorStyleRoomScenes.id),
	    ]);

	    const catalogByStyle = new Map<number, typeof catalogRows>();
	    const matchingByStyle = new Map<number, typeof matchingCatalogRows>();
	    for (const row of catalogRows) {
	      if (row.styleId == null) continue;
	      const current = catalogByStyle.get(row.styleId) ?? [];
	      current.push(row);
	      catalogByStyle.set(row.styleId, current);
	    }
	    for (const row of matchingCatalogRows) {
	      if (row.styleId == null) continue;
	      const current = matchingByStyle.get(row.styleId) ?? [];
	      current.push(row);
	      matchingByStyle.set(row.styleId, current);
	    }
    return {
	      categories,
	      styles: styles.map((style) => {
	        const allCatalog = catalogByStyle.get(style.id) ?? [];
	        const matchingCatalog = matchingByStyle.get(style.id) ?? [];
	        const matchingCabinets = Array.from(new Map(matchingCatalog.map((row) => [row.cabinetId, row])).values())
	          .slice(0, 3)
	          .map((row) => ({ masterCode: row.masterCode, description: row.description, category: row.category }));
	        return {
	          ...style,
	          skuCount: allCatalog.length,
	          catalogCategories: Array.from(categoriesByStyle.get(style.id) ?? []).sort((left, right) => left.localeCompare(right)),
	          matchingCabinetCount: new Set(matchingCatalog.map((row) => row.cabinetId)).size,
	          matchingCabinets,
	          roomScenes: scenes.filter((scene) => scene.styleId === style.id),
	        };
	      }),
	    };
	  }),

	/** Toggle a featured style, with both line ownership and cabinet evidence enforced on the server. */
	setFeaturedStyle: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional(), styleId: z.number().int().positive(), featured: z.boolean() }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const [style] = await db
	      .select({ id: doorStyles.id, isActive: doorStyles.isActive, isFeatured: doorStyles.isFeatured })
	      .from(doorStyles)
	      .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
	      .limit(1);
	    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your cabinet line." });

	    if (!input.featured) {
	      await db.update(doorStyles).set({ isFeatured: false }).where(eq(doorStyles.id, input.styleId));
	      return { ok: true };
	    }
	    if (!style.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Restore this door style before featuring it." });

	    const [catalogItem] = await db
	      .select({ id: distributorSkus.id })
	      .from(distributorSkus)
	      .where(and(eq(distributorSkus.distributorId, lineId), eq(distributorSkus.styleId, input.styleId)))
	      .limit(1);
	    if (!catalogItem) throw new TRPCError({ code: "BAD_REQUEST", message: "Only styles with cabinets in your catalog can be featured." });

	    const [{ sceneCount }] = await db
	      .select({ sceneCount: sql<number>`count(*)` })
	      .from(doorStyleRoomScenes)
	      .where(and(
	        eq(doorStyleRoomScenes.styleId, input.styleId),
	        eq(doorStyleRoomScenes.isActive, true),
	        eq(doorStyleRoomScenes.isVerified, true),
	      ));
	    if (Number(sceneCount) === 0) {
	      throw new TRPCError({ code: "BAD_REQUEST", message: "Add a verified matching room scene in Door Styles before featuring this cabinet line." });
	    }

	    if (!style.isFeatured) {
	      const [{ maxRank }] = await db
	        .select({ maxRank: sql<number>`coalesce(max(${doorStyles.featuredRank}), 0)` })
	        .from(doorStyles)
	        .where(eq(doorStyles.isFeatured, true));
	      await db.update(doorStyles).set({ isFeatured: true, featuredRank: Number(maxRank) + 10 }).where(eq(doorStyles.id, input.styleId));
	    }
	    return { ok: true };
	  }),

	/** Reorder only this vendor's featured styles while preserving other vendors' rank slots. */
	reorderFeaturedStyles: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional(), orderedIds: z.array(z.number().int().positive()).min(1) }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const current = await db
	      .select({ id: doorStyles.id, featuredRank: doorStyles.featuredRank })
	      .from(doorStyles)
	      .where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isFeatured, true)))
	      .orderBy(doorStyles.featuredRank, doorStyles.id);
	    const currentIds = current.map((style) => style.id);
	    const sameMembers = input.orderedIds.length === currentIds.length
	      && new Set(input.orderedIds).size === input.orderedIds.length
	      && input.orderedIds.every((id) => currentIds.includes(id));
	    if (!sameMembers) throw new TRPCError({ code: "BAD_REQUEST", message: "Featured style order must contain every style in your cabinet line exactly once." });

	    await Promise.all(input.orderedIds.map((id, index) =>
	      db.update(doorStyles).set({ featuredRank: current[index]!.featuredRank }).where(eq(doorStyles.id, id)),
	    ));
	    return { ok: true };
	  }),

	/**
	 * Shipping readiness for one vendor line. The green coverage check is based
	 * only on durable shipping-origin assignments: it confirms that a style's
	 * cabinets use every configured warehouse origin (or inherit all of them).
	 * It deliberately does not claim live warehouse inventory, which is not a
	 * field in the current supplier feed.
	 */
	shippingOverview: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional() }).optional())
	  .query(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
	    const [line] = await db
	      .select({
	        id: distributors.id,
	        name: distributors.name,
	        warehouseName: distributors.warehouseName,
	        warehouseAddress: distributors.warehouseAddress,
	        warehouseZips: distributors.warehouseZips,
	        leadTimeDays: distributors.leadTimeDays,
	        shippingRuleMode: distributors.shippingRuleMode,
	        shippingFlatFreightFeeCents: distributors.shippingFlatFreightFeeCents,
	        shippingFreeFreightThresholdCents: distributors.shippingFreeFreightThresholdCents,
	        shippingZipRates: distributors.shippingZipRates,
	        shippingExceptions: distributors.shippingExceptions,
	        pickupEnabled: distributors.pickupEnabled,
	        pickupZip: distributors.pickupZip,
	        pickupAddress: distributors.pickupAddress,
	        pickupRadiusMiles: distributors.pickupRadiusMiles,
	      })
	      .from(distributors)
	      .where(eq(distributors.id, lineId))
	      .limit(1);
	    if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

	    const warehouses = Array.from(new Set((line.warehouseZips ?? [])
	      .filter((zip): zip is string => typeof zip === "string")
	      .map((zip) => zip.trim())
	      .filter((zip) => /^\d{5}$/.test(zip))));
	    const styleRows = await db
	      .select({
	        id: doorStyles.id,
	        ourName: doorStyles.ourName,
	        distributorName: doorStyles.distributorName,
	        doorStyle: doorStyles.doorStyle,
	        color: doorStyles.color,
	        finish: doorStyles.finish,
	        roomSceneImageUrl: doorStyles.roomSceneImageUrl,
	        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
	        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
	        warehouseZip: doorStyles.warehouseZip,
	        warehouseZips: doorStyles.warehouseZips,
	        flatFreightFeeCents: doorStyles.flatFreightFeeCents,
	        isFeatured: doorStyles.isFeatured,
	        featuredRank: doorStyles.featuredRank,
	        isActive: doorStyles.isActive,
	      })
	      .from(doorStyles)
	      .where(eq(doorStyles.distributorId, lineId))
	      .orderBy(doorStyles.featuredRank, doorStyles.ourName);
	    const styleIds = styleRows.map((style) => style.id);
	    const skuRows = styleIds.length === 0 ? [] : await db
	      .select({
	        styleId: distributorSkus.styleId,
	        catalogCount: sql<number>`count(*)`,
	        availableCount: sql<number>`sum(case when ${distributorSkus.isAvailable} = true then 1 else 0 end)`,
	        publishedCount: sql<number>`sum(case when ${distributorSkus.isPublished} = true then 1 else 0 end)`,
	      })
	      .from(distributorSkus)
	      .where(and(eq(distributorSkus.distributorId, lineId), inArray(distributorSkus.styleId, styleIds)))
	      .groupBy(distributorSkus.styleId);
	    const counts = new Map(skuRows.map((row) => [row.styleId, {
	      catalogCount: Number(row.catalogCount),
	      availableCount: Number(row.availableCount),
	      publishedCount: Number(row.publishedCount),
	    }]));

	    const styles = styleRows.map((style) => {
	      const explicitOrigins = Array.from(new Set([...(style.warehouseZips ?? []), style.warehouseZip ?? ""]
	        .filter((zip): zip is string => typeof zip === "string")
	        .map((zip) => zip.trim())
	        .filter((zip) => /^\d{5}$/.test(zip))));
	      const originZips = explicitOrigins.length > 0 ? explicitOrigins : warehouses;
	      const allWarehousesCovered = warehouses.length > 0 && warehouses.every((zip) => originZips.includes(zip));
	      return {
	        ...style,
	        originZips,
	        originMode: explicitOrigins.length > 0 ? "style" as const : "line" as const,
	        allWarehousesCovered,
	        ...(counts.get(style.id) ?? { catalogCount: 0, availableCount: 0, publishedCount: 0 }),
	      };
	    }).filter((style) => style.catalogCount > 0);
	    const allCabinetsCovered = styles.length > 0 && styles.every((style) => style.allWarehousesCovered);

	    return { line: { ...line, warehouseZips: warehouses }, styles, allCabinetsCovered };
	  }),

  /**
   * Active saved-design pipeline for a vendor line. Only 30/90/180-day views
   * capped at the six-month active window contribute demand. A linked confirmed
   * or paid order closes a design; a seven-month-old unsold design is listed
   * solely in the optional dead-design view and never affects inventory demand.
   */
  inventoryForecast: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      days: z.union([z.literal(30), z.literal(90), z.literal(180)]).default(180),
      includeDead: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const days = input?.days ?? 180;
      const sixMonthsAgo = monthOffset(6);
      const requestedSince = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const activeSince = requestedSince > sixMonthsAgo ? requestedSince : sixMonthsAgo;
      const deadBefore = monthOffset(7);

      const [line, activeDesigns, deadCandidates, skuRows] = await Promise.all([
        db.select({
          id: distributors.id,
          name: distributors.name,
          inventoryForecastCloseRateBps: distributors.inventoryForecastCloseRateBps,
          inventoryForecastLowRateBps: distributors.inventoryForecastLowRateBps,
          inventoryForecastHighRateBps: distributors.inventoryForecastHighRateBps,
        }).from(distributors).where(eq(distributors.id, lineId)).limit(1),
        db.select({
          id: kitchenDesigns.id,
          name: kitchenDesigns.name,
          affiliateId: kitchenDesigns.affiliateId,
          selectedStyleId: kitchenDesigns.selectedStyleId,
          placedCabinets: kitchenDesigns.placedCabinets,
          updatedAt: kitchenDesigns.updatedAt,
        }).from(kitchenDesigns).where(and(
          eq(kitchenDesigns.selectedDistributorId, lineId),
          gte(kitchenDesigns.updatedAt, activeSince),
        )),
        input?.includeDead
          ? db.select({
              id: kitchenDesigns.id,
              name: kitchenDesigns.name,
              affiliateId: kitchenDesigns.affiliateId,
              selectedStyleId: kitchenDesigns.selectedStyleId,
              placedCabinets: kitchenDesigns.placedCabinets,
              updatedAt: kitchenDesigns.updatedAt,
            }).from(kitchenDesigns).where(and(
              eq(kitchenDesigns.selectedDistributorId, lineId),
              lte(kitchenDesigns.updatedAt, deadBefore),
            )).orderBy(desc(kitchenDesigns.updatedAt)).limit(250)
          : Promise.resolve([]),
        db.select({
          cabinetId: distributorSkus.cabinetId,
          styleId: distributorSkus.styleId,
          distributorSku: distributorSkus.distributorSku,
          masterCode: cabinets.masterCode,
          onHandQty: distributorSkus.onHandQty,
        }).from(distributorSkus)
          .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .where(and(eq(distributorSkus.distributorId, lineId), eq(distributorSkus.isAvailable, true))),
      ]);
      const lineRow = line[0];
      if (!lineRow) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

      const allDesignIds = activeDesigns.concat(deadCandidates).map((design) => design.id);
      const closedDesignIds = new Set<number>();
      if (allDesignIds.length > 0) {
        const sales = await db.select({ kitchenDesignId: orderRequests.kitchenDesignId })
          .from(orderRequests)
          .where(and(
            inArray(orderRequests.kitchenDesignId, allDesignIds),
            or(eq(orderRequests.status, "confirmed"), isNotNull(orderRequests.paidAt)),
          ));
        sales.forEach((sale) => { if (sale.kitchenDesignId != null) closedDesignIds.add(sale.kitchenDesignId); });
      }

      const exactSku = new Map<string, typeof skuRows[number]>();
      const fallbackSku = new Map<number, typeof skuRows[number]>();
      const stockByMaster = new Map<string, { known: boolean; total: number; vendorSkus: Set<string> }>();
      for (const sku of skuRows) {
        if (sku.cabinetId == null) continue;
        exactSku.set(`${sku.cabinetId}:${sku.styleId}`, sku);
        if (!fallbackSku.has(sku.cabinetId)) fallbackSku.set(sku.cabinetId, sku);
        const stock = stockByMaster.get(sku.masterCode) ?? { known: true, total: 0, vendorSkus: new Set<string>() };
        stock.known = stock.known && sku.onHandQty != null;
        stock.total += sku.onHandQty ?? 0;
        stock.vendorSkus.add(sku.distributorSku);
        stockByMaster.set(sku.masterCode, stock);
      }

      const demand = new Map<string, { masterCode: string; vendorSkus: Set<string>; qty: number; designs: Set<number>; affiliates: Set<number> }>();
      for (const design of activeDesigns) {
        if (closedDesignIds.has(design.id)) continue;
        for (const placed of design.placedCabinets ?? []) {
          const cabinetId = Number((placed as { cabinetId?: unknown }).cabinetId);
          if (!Number.isInteger(cabinetId) || cabinetId <= 0) continue;
          const sku = design.selectedStyleId == null
            ? fallbackSku.get(cabinetId)
            : (exactSku.get(`${cabinetId}:${design.selectedStyleId}`) ?? fallbackSku.get(cabinetId));
          if (!sku) continue;
          const row = demand.get(sku.masterCode) ?? { masterCode: sku.masterCode, vendorSkus: new Set<string>(), qty: 0, designs: new Set<number>(), affiliates: new Set<number>() };
          row.vendorSkus.add(sku.distributorSku);
          row.qty += placedCabinetQuantity(placed);
          row.designs.add(design.id);
          if (design.affiliateId != null) row.affiliates.add(design.affiliateId);
          demand.set(sku.masterCode, row);
        }
      }

      const rates = formatForecastRates(lineRow);
      const rows = Array.from(demand.values()).map((demandRow) => {
        const stock = stockByMaster.get(demandRow.masterCode);
        return inventoryForecastRow({
          masterCode: demandRow.masterCode,
          vendorSku: Array.from(demandRow.vendorSkus).sort().join(" / "),
          openDesignQty: demandRow.qty,
          openDesignCount: demandRow.designs.size,
          affiliateCount: demandRow.affiliates.size,
          onHandQty: stock?.known ? stock.total : null,
        }, rates);
      }).sort((a, b) => b.openDesignQty - a.openDesignQty || a.masterCode.localeCompare(b.masterCode));

      return {
        lineName: lineRow.name,
        days,
        activeSince,
        deadBefore,
        rates,
        rateConfigured: isForecastRateBps(rates.baseRateBps),
        openDesignCount: activeDesigns.filter((design) => !closedDesignIds.has(design.id)).length,
        closedDesignCount: activeDesigns.filter((design) => closedDesignIds.has(design.id)).length,
        rows,
        deadDesigns: input?.includeDead
          ? deadCandidates.filter((design) => !closedDesignIds.has(design.id)).map((design) => ({
              id: design.id,
              name: design.name,
              affiliateId: design.affiliateId,
              lastActivityAt: design.updatedAt,
              placedCabinetCount: (design.placedCabinets ?? []).length,
            }))
          : [],
      };
    }),

  /** Admin-owned close-rate controls. Null is intentionally shown as TBD. */
  updateInventoryForecastRates: distributorProcedure
    .input(z.object({
      distributorId: z.number().positive(),
      baseRateBps: z.number().int().min(0).max(10000).nullable(),
      lowRateBps: z.number().int().min(0).max(10000).nullable(),
      highRateBps: z.number().int().min(0).max(10000).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only an administrator can set the inventory close-rate forecast." });
      if (input.baseRateBps == null && (input.lowRateBps != null || input.highRateBps != null)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Set a base close rate before using low or high forecast bands." });
      }
      if (input.baseRateBps != null && input.lowRateBps != null && input.lowRateBps > input.baseRateBps) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The low rate cannot exceed the base close rate." });
      }
      if (input.baseRateBps != null && input.highRateBps != null && input.highRateBps < input.baseRateBps) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The high rate cannot be below the base close rate." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(distributors).set({
        inventoryForecastCloseRateBps: input.baseRateBps,
        inventoryForecastLowRateBps: input.baseRateBps == null ? null : input.lowRateBps,
        inventoryForecastHighRateBps: input.baseRateBps == null ? null : input.highRateBps,
      }).where(eq(distributors.id, input.distributorId));
      return { updated: true };
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
        onlyPending: z.boolean().optional(),
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
      if (input.onlyPending) conds.push(eq(distributorSkus.status, "pending"));
      if (input.category) conds.push(eq(cabinets.category, input.category));
      const q = input.search?.trim();
      if (q) {
        const like = `%${q}%`;
        const normalizedCodeSearch = normalizeCode(q);
        const normalizedMasterCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
        const normalizedDistributorSku = sql`UPPER(REPLACE(REPLACE(REPLACE(${distributorSkus.distributorSku}, '-', ''), ' ', ''), '_', ''))`;
        const normalizedPlatformSku = sql`UPPER(REPLACE(REPLACE(REPLACE(${distributorSkus.platformSku}, '-', ''), ' ', ''), '_', ''))`;
        conds.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like} OR ${distributorSkus.distributorSku} LIKE ${like} OR ${distributorSkus.supplierCabinetName} LIKE ${like} OR ${distributorSkus.platformSku} LIKE ${like} OR ${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`} OR ${normalizedDistributorSku} LIKE ${`%${normalizedCodeSearch}%`} OR ${normalizedPlatformSku} LIKE ${`%${normalizedCodeSearch}%`})`
        );
      }

      const base = db
        .select({
          skuId: distributorSkus.id,
          cabinetId: distributorSkus.cabinetId,
          masterCode: cabinets.masterCode,
          distributorSku: distributorSkus.distributorSku,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          styleId: distributorSkus.styleId,
          styleName: doorStyles.ourName,
          platformSku: distributorSkus.platformSku,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          onHandQty: distributorSkus.onHandQty,
          isPublished: distributorSkus.isPublished,
          isAvailable: distributorSkus.isAvailable,
          imageUrl: distributorSkus.imageUrl,
          catalogImageUrl: cabinets.catalogImageUrl,
          status: distributorSkus.status,
        })
        .from(distributorSkus)
        .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
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
        .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
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

  /** Administrator product list used by the direct draft/edit/publish workspace. */
  adminProductList: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
        search: z.string().trim().max(128).optional(),
        limit: z.number().int().min(1).max(250).default(100),
        offset: z.number().int().min(0).default(0),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage supplier products." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const args = input ?? { status: "all" as const, limit: 100, offset: 0 };
      const conditions: any[] = [];
      if (args.distributorId) conditions.push(eq(distributorSkus.distributorId, args.distributorId));
      if (args.status !== "all") conditions.push(eq(distributorSkus.status, args.status));
      if (args.search) {
        const like = `%${args.search}%`;
        conditions.push(sql`(
          ${cabinets.masterCode} LIKE ${like}
          OR ${cabinets.description} LIKE ${like}
          OR ${distributorSkus.distributorSku} LIKE ${like}
          OR ${distributorSkus.supplierCabinetName} LIKE ${like}
          OR ${distributorSkus.platformSku} LIKE ${like}
        )`);
      }
      const where = conditions.length ? and(...conditions) : undefined;
      const select = {
        skuId: distributorSkus.id,
        cabinetId: distributorSkus.cabinetId,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        distributorId: distributors.id,
        distributorName: distributors.name,
        distributorBrandName: distributors.brandName,
        styleId: doorStyles.id,
        styleName: doorStyles.ourName,
        styleCode: doorStyles.styleCode,
        distributorSku: distributorSkus.distributorSku,
        platformSku: distributorSkus.platformSku,
        supplierCabinetName: distributorSkus.supplierCabinetName,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
        status: distributorSkus.status,
        imageUrl: distributorSkus.imageUrl,
        createdAt: distributorSkus.createdAt,
      };
      const [items, [totalRow]] = await Promise.all([
        db
          .select(select)
          .from(distributorSkus)
          .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .where(where)
          .orderBy(desc(distributorSkus.createdAt), distributorSkus.id)
          .limit(args.limit)
          .offset(args.offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(distributorSkus)
          .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .where(where),
      ]);
      return { items, total: Number(totalRow?.count ?? 0) };
    }),

  /** Direct administrator editor for supplier products. Master mapping is optional. */
  adminSaveProduct: distributorProcedure
    .input(
      z.object({
        skuId: z.number().int().positive().optional(),
        distributorId: z.number().int().positive(),
        styleId: z.number().int().positive(),
        distributorSku: z.string().trim().min(1).max(128),
        supplierCabinetName: z.string().trim().max(255).optional(),
        masterCode: z.string().trim().max(64).optional(),
        listPrice: z.number().min(0).nullable().optional(),
        yourCost: z.number().min(0).nullable().optional(),
        isAvailable: z.boolean().default(true),
        mode: z.enum(["draft", "publish"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can create or edit supplier products." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [style] = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, input.distributorId)))
        .limit(1);
      if (!style) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a door style that belongs to the selected supplier line." });
      if (input.mode === "publish" && !hasVendorPrice(
        input.listPrice == null ? null : String(input.listPrice),
        input.yourCost == null ? null : String(input.yourCost),
      )) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add a List Price or Your Cost before publishing." });
      }

      let resolvedCabinetId: number | null = null;
      let resolvedMasterCode: string | null = null;
      const requestedMasterCode = input.masterCode?.trim().toUpperCase();
      if (requestedMasterCode) {
        const [cabinet] = await db
          .select({ id: cabinets.id, masterCode: cabinets.masterCode })
          .from(cabinets)
          .where(eq(cabinets.masterCode, requestedMasterCode))
          .limit(1);
        if (!cabinet) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That master product code does not exist. Leave it blank to save a standalone supplier product, or create the master cabinet first." });
        }
        resolvedCabinetId = cabinet.id;
        resolvedMasterCode = cabinet.masterCode;
      } else {
        const cabinetRows = await db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            sku: cabinets.sku,
            vendorSku: cabinets.vendorSku,
            altSku1: cabinets.altSku1,
            altSku2: cabinets.altSku2,
            altSku3: cabinets.altSku3,
          })
          .from(cabinets);
        const match = matchVendorCabinetBySku(input.distributorSku, cabinetRows);
        if (match.kind === "matched") {
          resolvedCabinetId = match.cabinetId;
          resolvedMasterCode = match.masterCode;
        }
      }

      const matchingRows = await db
        .select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId, distributorSku: distributorSkus.distributorSku })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.distributorId, input.distributorId), eq(distributorSkus.styleId, input.styleId)));
      const normalizedSku = normalizeCode(input.distributorSku);
      const duplicate = matchingRows.find((row) => row.id !== input.skuId && (
        (resolvedCabinetId != null && row.cabinetId === resolvedCabinetId)
        || normalizeCode(row.distributorSku) === normalizedSku
      ));
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "A supplier product with this SKU or master connection already exists for the selected supplier line and door style." });
      }

      const status: "approved" | "pending" = input.mode === "publish" ? "approved" : "pending";
      const sharedValues = {
        distributorId: input.distributorId,
        styleId: input.styleId,
        distributorSku: input.distributorSku,
        supplierCabinetName: input.supplierCabinetName || null,
        listPrice: input.listPrice == null ? null : String(input.listPrice),
        yourCost: input.yourCost == null ? null : String(input.yourCost),
        isAvailable: input.isAvailable,
        status,
        isPublished: input.mode === "publish",
      };
      if (input.skuId) {
        const [existing] = await db
          .select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId })
          .from(distributorSkus)
          .where(eq(distributorSkus.id, input.skuId))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
        const cabinetId = resolvedCabinetId ?? existing.cabinetId;
        await db.update(distributorSkus).set({ ...sharedValues, cabinetId }).where(eq(distributorSkus.id, input.skuId));
        return { skuId: input.skuId, status, isPublished: input.mode === "publish", cabinetId };
      }

      const [result] = await db.insert(distributorSkus).values({
        ...sharedValues,
        cabinetId: resolvedCabinetId,
        platformSku: resolvedMasterCode
          ? `${resolvedMasterCode}-${input.distributorSku}-${input.distributorId}`.slice(0, 128)
          : buildUnmatchedPlatformSku(input.distributorId, input.styleId, input.distributorSku),
      });
      return { skuId: (result as { insertId: number }).insertId, status, isPublished: input.mode === "publish", cabinetId: resolvedCabinetId };
    }),

  // ─── Price Update (instant, no approval) ─────────────────────────────────────

  /** Vendor updates pricing on their own SKUs. Instant — no admin approval needed. */
  updatePrice: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        listPrice: z.string().max(16).optional(),
        wholesalePrice: z.string().max(16).optional(),
        contractorPrice: z.string().max(16).optional(),
        homeownerPrice: z.string().max(16).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      const updates: Record<string, string | null> = {};
      if (input.listPrice !== undefined) updates.listPrice = input.listPrice || null;
      if (input.wholesalePrice !== undefined) updates.wholesalePrice = input.wholesalePrice || null;
      if (input.contractorPrice !== undefined) updates.contractorPrice = input.contractorPrice || null;
      if (input.homeownerPrice !== undefined) updates.homeownerPrice = input.homeownerPrice || null;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No price fields provided." });
      }

      await db
        .update(distributorSkus)
        .set(updates as any)
        .where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, updated: Object.keys(updates) };
    }),

  /** Optional vendor-supplied stock feed for the inventory forecast. */
  updateOnHandInventory: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      skuId: z.number().positive(),
      onHandQty: z.number().int().min(0).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [owned] = await db.select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
      await db.update(distributorSkus).set({ onHandQty: input.onHandQty }).where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, onHandQty: input.onHandQty };
    }),

  // ─── Image Upload (instant) ───────────────────────────────────────────────────

  /** Vendor uploads a product image (base64 encoded). Stored in S3, URL saved on SKU. */
  updateImage: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        imageBase64: z.string().max(10_000_000), // ~7.5MB max
        contentType: z.string().max(64).default("image/jpeg"),
        fileName: z.string().max(256).default("product.jpg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      // Upload to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `vendor-products/${lineId}/${input.skuId}.${ext}`;
      const { url } = await storagePut(key, buffer, input.contentType);

      // Update SKU
      await db
        .update(distributorSkus)
        .set({ imageUrl: url })
        .where(eq(distributorSkus.id, input.skuId));

      return { skuId: input.skuId, imageUrl: url };
    }),

  // ─── New Product Submission (pending approval) ────────────────────────────────

  /** Vendor submits a new product. Goes to pending status until admin approves. */
  submitNewProduct: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        /** Optional for backwards compatibility; new submissions resolve it from the vendor SKU. */
        cabinetId: z.number().int().positive().optional(),
        styleId: z.number().int().positive(),
        distributorSku: z.string().trim().min(1).max(128),
        listPrice: z.string().max(16).optional(),
        yourCost: z.string().max(16).optional(),
        supplierCabinetName: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Cabinet ID is an internal platform identity. A vendor does not need to
      // know it, and a supplier SKU may be new to the master catalog. Resolve a
      // unique match when one exists; otherwise keep the link null for admin
      // review instead of blocking the pending submission or guessing.
      let resolvedCabinetId: number | null = input.cabinetId ?? null;
      let resolvedMasterCode: string | null = null;
      if (resolvedCabinetId != null) {
        const cab = await db
          .select({ id: cabinets.id, masterCode: cabinets.masterCode })
          .from(cabinets)
          .where(eq(cabinets.id, resolvedCabinetId))
          .limit(1);
        if (!cab[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found." });
        resolvedMasterCode = cab[0].masterCode;
      } else {
        const cabinetRows = await db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            sku: cabinets.sku,
            vendorSku: cabinets.vendorSku,
            altSku1: cabinets.altSku1,
            altSku2: cabinets.altSku2,
            altSku3: cabinets.altSku3,
          })
          .from(cabinets);
        const match = matchVendorCabinetBySku(input.distributorSku, cabinetRows);
        if (match.kind === "matched") {
          resolvedCabinetId = match.cabinetId;
          resolvedMasterCode = match.masterCode;
        }
      }

      // Verify the style belongs to this line
      const style = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });

      // A Designer Coverage gap means there is no published and available SKU;
      // it does not prove that no pending or unpublished connection exists. Do
      // not create a duplicate row when an administrator is reviewing a gap.
      const existing = resolvedCabinetId != null
        ? await db
            .select({ id: distributorSkus.id })
            .from(distributorSkus)
            .where(
              and(
                eq(distributorSkus.cabinetId, resolvedCabinetId),
                eq(distributorSkus.distributorId, lineId),
                eq(distributorSkus.styleId, input.styleId),
              ),
            )
            .limit(1)
        : (await db
            .select({ id: distributorSkus.id, distributorSku: distributorSkus.distributorSku })
            .from(distributorSkus)
            .where(
              and(
                eq(distributorSkus.distributorId, lineId),
                eq(distributorSkus.styleId, input.styleId),
              ),
            ))
            .filter((row) => normalizeCode(row.distributorSku) === normalizeCode(input.distributorSku));
      if (existing[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A connection for this cabinet, line, and style already exists. Review that existing connection instead of adding another.",
        });
      }

      if (!hasVendorPrice(input.listPrice, input.yourCost)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a List Price or Your Cost." });
      }

      // Generate a stable platform identity even when no master cabinet exists.
      const platformSku = resolvedMasterCode
        ? `${resolvedMasterCode}-${input.distributorSku}-${lineId}`
        : buildUnmatchedPlatformSku(lineId, input.styleId, input.distributorSku);

      const result = await db.insert(distributorSkus).values({
        cabinetId: resolvedCabinetId,
        distributorId: lineId,
        styleId: input.styleId,
        platformSku,
        distributorSku: input.distributorSku,
        listPrice: input.listPrice || null,
        yourCost: input.yourCost || null,
        supplierCabinetName: input.supplierCabinetName || null,
        status: "pending",
        isPublished: false,
        isAvailable: true,
      });

      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { skuId: insertId, status: "pending" as const };
    }),

  // ─── Admin Approve/Reject Product ─────────────────────────────────────────────

  /** Admin publishes, returns to draft, or rejects a supplier product. */
  adminSetProductStatus: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        status: z.enum(["approved", "pending", "rejected"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can publish, draft, or reject products." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const sku = await db
        .select({ id: distributorSkus.id, status: distributorSkus.status })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, input.skuId))
        .limit(1);
      if (!sku[0]) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found." });

      await db
        .update(distributorSkus)
        .set({
          status: input.status,
          isPublished: input.status === "approved" ? true : false,
        })
        .where(eq(distributorSkus.id, input.skuId));

      return { skuId: input.skuId, status: input.status };
    }),

  // ─── Design Tool Picks (max 8) ───────────────────────────────────────────────

  /** Get the vendor's current design tool picks. */
  getDesignToolPicks: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);

      const rows = await db
        .select({ designToolPicks: distributors.designToolPicks })
        .from(distributors)
        .where(eq(distributors.id, lineId))
        .limit(1);

      const picks: number[] = (rows[0]?.designToolPicks as number[]) || [];

      // Fetch details for the picked SKUs
      if (picks.length === 0) return { picks: [], items: [] };

      const items = await db
        .select({
          skuId: distributorSkus.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          styleName: doorStyles.ourName,
          imageUrl: distributorSkus.imageUrl,
          contractorPrice: distributorSkus.contractorPrice,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(inArray(distributorSkus.id, picks), eq(distributorSkus.distributorId, lineId)));

      return { picks, items };
    }),

  /** Vendor sets their design tool picks (max 8 SKU IDs). */
  setDesignToolPicks: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuIds: z.array(z.number()).max(MAX_DESIGN_TOOL_PICKS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      if (input.skuIds.length > MAX_DESIGN_TOOL_PICKS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum ${MAX_DESIGN_TOOL_PICKS} design tool picks allowed.`,
        });
      }

      // Verify all SKUs belong to this line
      if (input.skuIds.length > 0) {
        const owned = await db
          .select({ id: distributorSkus.id })
          .from(distributorSkus)
          .where(and(inArray(distributorSkus.id, input.skuIds), eq(distributorSkus.distributorId, lineId)));
        if (owned.length !== input.skuIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Some SKUs do not belong to your line." });
        }
      }

      await db
        .update(distributors)
        .set({ designToolPicks: input.skuIds.length > 0 ? input.skuIds : null })
        .where(eq(distributors.id, lineId));

      return { picks: input.skuIds };
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
          orderRailStatus: orderRequests.orderRailStatus,
          distributorInvoiceReference: orderRequests.distributorInvoiceReference,
          distributorInvoiceAmount: orderRequests.distributorInvoiceAmount,
          distributorInvoiceNotes: orderRequests.distributorInvoiceNotes,
          createdAt: orderRequests.createdAt,
        })
        .from(orderRequests)
        .where(and(eq(orderRequests.distributorId, lineId), eq(orderRequests.orderRailStatus, "distributor_inventory_check")))
        .orderBy(desc(orderRequests.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /** Distributor confirms inventory and returns the updated invoice to the affiliate. */
  confirmInventoryAndInvoice: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      orderId: z.number().int().positive(),
      invoiceReference: z.string().trim().min(1).max(128),
      invoiceAmount: z.number().nonnegative(),
      invoiceNotes: z.string().trim().max(4_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [order] = await db.select().from(orderRequests).where(and(eq(orderRequests.id, input.orderId), eq(orderRequests.distributorId, lineId))).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "This order is not routed to your supply line." });
      if (order.orderRailStatus !== "distributor_inventory_check") {
        throw new TRPCError({ code: "CONFLICT", message: "This order is not awaiting an inventory check." });
      }
      const now = new Date();
      await db.update(orderRequests).set({
        orderRailStatus: "affiliate_invoice_review",
        distributorInventoryConfirmedAt: now,
        distributorInvoiceReference: input.invoiceReference,
        distributorInvoiceAmount: input.invoiceAmount.toFixed(2),
        distributorInvoiceNotes: input.invoiceNotes || null,
        distributorInvoiceReceivedAt: now,
      }).where(eq(orderRequests.id, order.id));
      return { id: order.id, orderRailStatus: "affiliate_invoice_review" as const };
    }),

  // ─── Door Style Image Update (instant) ────────────────────────────────────────

  /** Vendor updates a door style image (room scene or door sample). */
  updateDoorStyleImage: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number(),
        imageType: z.enum(["doorSample", "roomScene", "thumbnail"]),
        imageBase64: z.string().max(10_000_000),
        contentType: z.string().max(64).default("image/jpeg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Verify style belongs to this line
      const style = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });

      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.contentType.split("/")[1] || "jpg";
      const key = `vendor-styles/${lineId}/${input.styleId}-${input.imageType}.${ext}`;
      const { url } = await storagePut(key, buffer, input.contentType);

      const fieldMap = {
        doorSample: "doorSampleImageUrl",
        roomScene: "roomSceneImageUrl",
        thumbnail: "thumbnailImageUrl",
      } as const;

	      await db
	        .update(doorStyles)
	        .set({ [fieldMap[input.imageType]]: url } as any)
	        .where(eq(doorStyles.id, input.styleId));

	      // A room scene uploaded by the owner of a supply line is first-party
	      // merchandising evidence. Keep the legacy style image in sync and also
	      // create/update the scene-library record used by Featured Styles.
	      if (input.imageType === "roomScene") {
	        const existingScenes = await db
	          .select({ id: doorStyleRoomScenes.id })
	          .from(doorStyleRoomScenes)
	          .where(and(
	            eq(doorStyleRoomScenes.styleId, input.styleId),
	            eq(doorStyleRoomScenes.sourceDistributorId, lineId),
	          ))
	          .orderBy(doorStyleRoomScenes.sortOrder, doorStyleRoomScenes.id)
	          .limit(1);
	        if (existingScenes[0]) {
	          await db.update(doorStyleRoomScenes).set({
	            imageUrl: url,
	            fileKey: key,
	            isActive: true,
	            isVerified: true,
	          }).where(eq(doorStyleRoomScenes.id, existingScenes[0].id));
	        } else {
	          const [{ maxRank }] = await db
	            .select({ maxRank: sql<number>`coalesce(max(${doorStyleRoomScenes.sortOrder}), 0)` })
	            .from(doorStyleRoomScenes)
	            .where(eq(doorStyleRoomScenes.styleId, input.styleId));
	          const [{ sceneCount }] = await db
	            .select({ sceneCount: sql<number>`count(*)` })
	            .from(doorStyleRoomScenes)
	            .where(eq(doorStyleRoomScenes.styleId, input.styleId));
	          if (Number(sceneCount) < 6) {
	            await db.insert(doorStyleRoomScenes).values({
	              styleId: input.styleId,
	              imageUrl: url,
	              fileKey: key,
	              sortOrder: Number(maxRank) + 10,
	              isVerified: true,
	              isActive: true,
	              sourceDistributorId: lineId,
	              sourceNote: "Vendor-provided featured room scene",
	            });
	          }
	        }
	      }

	      return { styleId: input.styleId, imageType: input.imageType, imageUrl: url };
    }),

  // ─── AI Service Requests ─────────────────────────────────────────────────────

  aiServiceHistory: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const rows = await db
        .select()
        .from(aiServiceRequests)
        .where(eq(aiServiceRequests.distributorId, lineId))
        .orderBy(desc(aiServiceRequests.createdAt))
        .limit(50);
      return rows;
    }),

  aiServiceSubmit: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        serviceType: z.string().min(1).max(100),
        fileName: z.string().max(255).optional(),
        fileKey: z.string().max(512).optional(),
        fileUrl: z.string().max(1024).optional(),
        fileSizeBytes: z.number().int().min(0).optional(),
        details: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      // Estimate: ~150 SKUs per hour based on file size heuristic
      const estimatedSkus = input.fileSizeBytes
        ? Math.max(10, Math.round(input.fileSizeBytes / 500))
        : 100;
      const estimatedHours = Math.max(0.25, Number((estimatedSkus / 150).toFixed(2)));
      const estimatedCost = Number((estimatedHours * 100).toFixed(2));
      const [result] = await db.insert(aiServiceRequests).values({
        distributorId: lineId,
        userId: ctx.user.id,
        serviceType: input.serviceType,
        fileName: input.fileName || null,
        fileKey: input.fileKey || null,
        fileUrl: input.fileUrl || null,
        fileSizeBytes: input.fileSizeBytes || null,
        details: input.details || null,
        estimatedSkus,
        estimatedHours: String(estimatedHours),
        estimatedCost: String(estimatedCost),
        status: "estimated",
      });
      return {
        id: result.insertId,
        estimatedSkus,
        estimatedHours,
        estimatedCost,
      };
    }),

  aiServiceApprove: distributorProcedure
    .input(z.object({ distributorId: z.number().optional(), requestId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .update(aiServiceRequests)
        .set({ status: "approved", approvedAt: new Date() })
        .where(
          and(
            eq(aiServiceRequests.id, input.requestId),
            eq(aiServiceRequests.distributorId, lineId),
            eq(aiServiceRequests.status, "estimated")
          )
        );
      return { success: true };
    }),

  aiServiceCancel: distributorProcedure
    .input(z.object({ distributorId: z.number().optional(), requestId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .update(aiServiceRequests)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(aiServiceRequests.id, input.requestId),
            eq(aiServiceRequests.distributorId, lineId)
          )
        );
      return { success: true };
    }),
});
