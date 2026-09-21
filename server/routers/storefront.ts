import { z } from "zod";
import { eq, and, sql, inArray, gte, lte, isNull, ne, or } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb, notInConflict, getPricingSettings } from "../db";
import { sellPriceForTier } from "@shared/margins";
import {
  cabinets,
  distributors,
  doorStyles,
  distributorSkus,
  affiliates,
  affiliateStyleBranding,
  affiliateBannerSchedules,
  affiliatePromoDiscounts,
  skuMasterAliases,
} from "../../drizzle/schema";
import { normalizeCode } from "../../shared/cabinetCodeMatch";
import { resolveCanonicalCatalogSources } from "../lib/canonicalCatalogSources";

// ─── Family-locked storefront browsing ─────────────────────────────────────────
// RULE: a shopping/quote session is locked to ONE distributor + ONE cabinet
// family (door style/finish). This keeps every order inside a single supply line
// so it ships from one warehouse (avoiding multi-distributor freight cost).
//
// A "family" === a door_styles row. door_styles already belongs to exactly one
// distributor (door_styles.distributorId), so locking to a styleId automatically
// locks the distributor too. We never expose the underlying supplier identity.

/** The customer-facing shape of a cabinet family (door style). */
function toFamily(row: {
  id: number;
  styleCode: string;
  ourName: string;
  featuredLabel?: string | null;
  doorStyle: string | null;
  woodSpecies: string | null;
  finish: string | null;
  color: string | null;
  boxConstruction: string | null;
  drawerConstruction: string | null;
  hardware: string | null;
  frameSize: string | null;
  overlayType: string | null;
  doorPanelType: string | null;
  distributorId: number;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
  thumbnailImageUrl: string | null;
}) {
  return {
    styleId: row.id,
    styleCode: row.styleCode,
    // Use white-label name when set; fall back to internal name.
    name: row.featuredLabel || row.ourName,
    ourName: row.ourName,
    doorStyle: row.doorStyle,
    woodSpecies: row.woodSpecies,
    finish: row.finish,
    color: row.color,
    boxConstruction: row.boxConstruction,
    drawerConstruction: row.drawerConstruction,
    hardware: row.hardware,
    frameSize: row.frameSize,
    overlayType: row.overlayType,
    doorPanelType: row.doorPanelType,
    // distributorId is kept so the client can persist the locked supply line,
    // but NO supplier name/brand is ever returned.
    distributorId: row.distributorId,
    doorSampleImageUrl: row.doorSampleImageUrl,
    roomSceneImageUrl: row.roomSceneImageUrl,
    thumbnailImageUrl: row.thumbnailImageUrl,
  };
}

// Collapse the many fine-grained Accessory subCategories into THREE clean
// storefront display groups so a locked family never shows a sprawl of micro
// labels. The detailed subCategory is kept in the DB for data/quoting; this is
// purely a presentation grouping used by the Accessory tab.
export const ACCESSORY_GROUPS = {
  TRIM: "Trim & Molding",
  GLASS: "Glass Doors",
  GENERAL: "Accessories",
} as const;
export type AccessoryGroup =
  (typeof ACCESSORY_GROUPS)[keyof typeof ACCESSORY_GROUPS];

/** Map a cabinet (category + subCategory + description) to one of the three
 *  Accessory display groups. Non-accessory rows return null. */
export function accessoryGroupFor(row: {
  category: string | null;
  subCategory: string | null;
  description: string | null;
}): AccessoryGroup | null {
  if (row.category !== "Accessory") return null;
  const sub = (row.subCategory ?? "").toLowerCase();
  const desc = (row.description ?? "").toLowerCase();
  // Glass door fronts / inserts (sold separately) — identified by description.
  if (desc.includes("glass") || sub.includes("glass")) return ACCESSORY_GROUPS.GLASS;
  // Trim & molding: any molding, filler, toe kick, valance, scribe, light rail.
  const trimHints = [
    "molding", "moulding", "filler", "toe kick", "valance", "scribe",
    "light rail", "cove", "shoe", "trim", "batten",
  ];
  if (
    sub === "trim & molding" ||
    trimHints.some((h) => sub.includes(h) || desc.includes(h))
  ) {
    return ACCESSORY_GROUPS.TRIM;
  }
  // Everything else (roll-out trays, waste bins, wood trays, touch-up kit, legs,
  // floating shelves, skin panels, decorative end panels, mini cabinet, etc.).
  return ACCESSORY_GROUPS.GENERAL;
}

export const storefrontRouter = router({
  // List the cabinet families a customer can lock into. Only families that have
  // at least one published+available SKU are returned, so a locked family always
  // has buyable cabinets. Optionally narrow to a single distributor/supply line.
  families: publicProcedure
    .input(
      z
        .object({
          distributorId: z.number().optional(),
          doorStyle: z.string().optional(),
          slug: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      let disabledStyleIds = new Set<number>();
      let featuredStyleIds = new Set<number>();
      const brandNameMap = new Map<number, string>();
      const roomSceneMap = new Map<number, string>();

      if (input?.slug) {
        const aRows = await db
          .select()
          .from(affiliates)
          .where(eq(affiliates.slug, input.slug.toLowerCase()))
          .limit(1);
        const a = aRows[0];
        if (a) {
          const brandRows = await db
            .select()
            .from(affiliateStyleBranding)
            .where(eq(affiliateStyleBranding.affiliateId, a.id));
          for (const r of brandRows) {
            if (r.isEnabled === false) disabledStyleIds.add(r.styleId);
            if (r.featured) featuredStyleIds.add(r.styleId);
            if (r.brandName?.trim()) brandNameMap.set(r.styleId, r.brandName.trim());
            if (r.roomSceneUrl?.trim()) roomSceneMap.set(r.styleId, r.roomSceneUrl.trim());
          }
        }
      }

      const conditions = [
        eq(doorStyles.isActive, true),
        eq(distributors.isActive, true),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input?.distributorId) {
        conditions.push(eq(doorStyles.distributorId, input.distributorId));
      }
      if (input?.doorStyle) {
        conditions.push(eq(doorStyles.doorStyle, input.doorStyle));
      }

      // Distinct families that actually have buyable cabinets.
      const rows = await db
        .selectDistinct({
          id: doorStyles.id,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          featuredLabel: doorStyles.featuredLabel,
          doorStyle: doorStyles.doorStyle,
          woodSpecies: doorStyles.woodSpecies,
          finish: doorStyles.finish,
          color: doorStyles.color,
          boxConstruction: doorStyles.boxConstruction,
          drawerConstruction: doorStyles.drawerConstruction,
          hardware: doorStyles.hardware,
          frameSize: doorStyles.frameSize,
          overlayType: doorStyles.overlayType,
          doorPanelType: doorStyles.doorPanelType,
          distributorId: doorStyles.distributorId,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        })
        .from(doorStyles)
        .innerJoin(distributorSkus, eq(distributorSkus.styleId, doorStyles.id))
        .innerJoin(distributors, eq(doorStyles.distributorId, distributors.id))
        .where(and(...conditions));

      const mapped = rows
        .filter((r) => !disabledStyleIds.has(r.id))
        .map((r) => {
          const fam = {
            ...toFamily(r),
            featured: featuredStyleIds.has(r.id),
          };
          if (brandNameMap.has(r.id)) {
            fam.name = brandNameMap.get(r.id)!;
          }
          if (roomSceneMap.has(r.id)) {
            fam.roomSceneImageUrl = roomSceneMap.get(r.id)!;
          }
          return fam;
        });

      return mapped.sort((a, b) => {
        const aFeatured = featuredStyleIds.has(a.styleId) ? 1 : 0;
        const bFeatured = featuredStyleIds.has(b.styleId) ? 1 : 0;
        if (aFeatured !== bFeatured) return bFeatured - aFeatured; // featured first
        return (a.name || "").localeCompare(b.name || "");
      });
    }),

  // The distinct door-style "types" (Shaker, Raised Panel, Slab, ...) available,
  // used as the top-level merchandising grouping on the storefront.
  doorStyleTypes: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ doorStyle: doorStyles.doorStyle })
      .from(doorStyles)
      .innerJoin(distributorSkus, eq(distributorSkus.styleId, doorStyles.id))
      .where(
        and(
          eq(doorStyles.isActive, true),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true)
        )
      );
    return rows.map((r) => r.doorStyle).filter((v): v is string => Boolean(v));
  }),

  // Resolve one family by styleId (for re-hydrating a locked session).
  familyById: publicProcedure
    .input(z.object({ styleId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select({
          id: doorStyles.id,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          featuredLabel: doorStyles.featuredLabel,
          doorStyle: doorStyles.doorStyle,
          woodSpecies: doorStyles.woodSpecies,
          finish: doorStyles.finish,
          color: doorStyles.color,
          boxConstruction: doorStyles.boxConstruction,
          drawerConstruction: doorStyles.drawerConstruction,
          hardware: doorStyles.hardware,
          frameSize: doorStyles.frameSize,
          overlayType: doorStyles.overlayType,
          doorPanelType: doorStyles.doorPanelType,
          distributorId: doorStyles.distributorId,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.isActive, true)))
        .limit(1);
      return rows[0] ? toFamily(rows[0]) : null;
    }),

  // Categories available WITHIN a locked family (only categories that have a
  // buyable cabinet for this styleId).
  familyCategories: publicProcedure
    .input(z.object({ styleId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .selectDistinct({ category: cabinets.category })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(
          and(
            eq(cabinets.isActive, true),
            notInConflict(),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        );
      return rows.map((r) => r.category).filter((v): v is string => Boolean(v));
    }),

  // Subcategories within a locked family + category.
  familySubCategories: publicProcedure
    .input(z.object({ styleId: z.number(), category: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // For the Accessory category we collapse the many fine-grained
      // subCategories into clean display groups so the tab never shows a sprawl.
      if (input.category === "Accessory") {
        const rows = await db
          .select({
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            description: cabinets.description,
          })
          .from(cabinets)
          .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
          .where(
            and(
              eq(cabinets.isActive, true),
              notInConflict(),
              eq(cabinets.category, "Accessory"),
              eq(distributorSkus.styleId, input.styleId),
              eq(distributorSkus.isAvailable, true),
              eq(distributorSkus.isPublished, true)
            )
          );
        const groups = new Set<string>();
        for (const r of rows) {
          const g = accessoryGroupFor(r);
          if (g) groups.add(g);
        }
        // Stable, intentional ordering.
        const order = [ACCESSORY_GROUPS.TRIM, ACCESSORY_GROUPS.GENERAL];
        return order.filter((g) => groups.has(g));
      }

      const rows = await db
        .selectDistinct({ subCategory: cabinets.subCategory })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(
          and(
            eq(cabinets.isActive, true),
            notInConflict(),
            eq(cabinets.category, input.category),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        );
      return rows
        .map((r) => r.subCategory)
        .filter((v): v is string => Boolean(v));
    }),

  // The buyable cabinets within a locked family, optionally filtered by
  // category/subcategory/search. Returns the homeowner price for the family's
  // own SKU so every line is same-distributor (single-shipment) priced.
  familyCatalog: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(60),
        offset: z.number().min(0).default(0),
        slug: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      if (input.slug) {
        const affRows = await db
          .select({ id: affiliates.id })
          .from(affiliates)
          .where(eq(affiliates.slug, input.slug.toLowerCase()))
          .limit(1);
        const a = affRows[0];
        if (a) {
          const brandRows = await db
            .select({ isEnabled: affiliateStyleBranding.isEnabled })
            .from(affiliateStyleBranding)
            .where(
              and(
                eq(affiliateStyleBranding.affiliateId, a.id),
                eq(affiliateStyleBranding.styleId, input.styleId)
              )
            )
            .limit(1);
          if (brandRows[0]?.isEnabled === false) {
            return { items: [], total: 0 };
          }
        }
      }

      const sourceConditions = [
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
        ne(cabinets.conflictStatus, "conflict"),
      ];
      // The Accessory tab uses virtual group labels ("Trim & Molding" /
      // "Accessories") rather than raw subCategory values. Resolve those to a
      // group-membership filter; all other categories use exact subCategory.
      const isAccessoryGroupLabel =
        input.category === "Accessory" &&
        (input.subCategory === ACCESSORY_GROUPS.TRIM ||
          input.subCategory === ACCESSORY_GROUPS.GENERAL);

      const sourceRows = await db
        .select({
          sourceMasterCode: cabinets.masterCode,
          platformSku: distributorSkus.platformSku,
          // This distributor overlay determines the customer-facing glass
          // disclosure while the canonical master still owns product identity.
          glassIncluded: distributors.glassIncluded,
          homeownerPrice: distributorSkus.homeownerPrice,
          listPrice: distributorSkus.listPrice,
          imageUrl: distributorSkus.imageUrl,
          catalogImageUrl: cabinets.catalogImageUrl,
          // Cost columns — the base the per-tier markup multiplies. Never shipped
          // raw to the client; only used server-side to compute the sell price.
          wholesalePrice: distributorSkus.wholesalePrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          yourCost: distributorSkus.yourCost,
          retailPriceBasis: distributors.retailPriceBasis,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
        .where(and(...sourceConditions));

      const [aliases, masters] = await Promise.all([
        db
          .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
          .from(skuMasterAliases)
          .where(eq(skuMasterAliases.conflictStatus, "ok")),
        db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            width: cabinets.width,
            height: cabinets.height,
            depth: cabinets.depth,
            graphicType: cabinets.graphicType,
            isCornerCabinet: cabinets.isCornerCabinet,
            catalogImageUrl: cabinets.catalogImageUrl,
          })
          .from(cabinets)
          .where(and(
            eq(cabinets.isActive, true),
            eq(cabinets.showInCatalog, true),
            ne(cabinets.conflictStatus, "conflict"),
          )),
      ]);

      const search = input.search?.trim() ?? "";
      const normalizedSearch = normalizeCode(search);
      const matchesFilter = (row: (typeof masters)[number] & { sourceMasterCode: string | null }) => {
        if (input.category && row.category !== input.category) return false;
        if (input.subCategory) {
          if (isAccessoryGroupLabel) {
            if (accessoryGroupFor(row) !== input.subCategory) return false;
          } else if (row.subCategory !== input.subCategory) return false;
        }
        if (!search) return true;
        return row.masterCode.includes(search)
          || (row.description ?? "").toLowerCase().includes(search.toLowerCase())
          || normalizeCode(row.masterCode).includes(normalizedSearch);
      };

      // One storefront card per canonical master, with the selected family's
      // lowest valid source price. The source SKU/image remains a style overlay.
      const resolvedRows = resolveCanonicalCatalogSources(sourceRows, aliases, masters)
        .map(({ source, master }) => ({ ...source, ...master }));
      const byCabinet = new Map<number, typeof resolvedRows[number]>();
      for (const row of resolvedRows) {
        if (!matchesFilter(row)) continue;
        const existing = byCabinet.get(row.id);
        const cost = Number(row.yourCost ?? row.wholesalePrice ?? row.listPrice ?? Infinity);
        const existingCost = existing ? Number(existing.yourCost ?? existing.wholesalePrice ?? existing.listPrice ?? Infinity) : Infinity;
        if (!existing || cost < existingCost) byCabinet.set(row.id, row);
      }
      const rows = Array.from(byCabinet.values()).sort((a, b) =>
        `${a.category ?? ""}:${a.masterCode}`.localeCompare(`${b.category ?? ""}:${b.masterCode}`, undefined, { numeric: true }),
      );

      // Resolve customer retail from the distributor's policy: cost plus the
      // homeowner markup by default, or its verified source list when selected.
      const ps = await getPricingSettings();
      const priced = rows.slice(input.offset, input.offset + input.limit).map(({ wholesalePrice, adjustedListPrice, yourCost, retailPriceBasis, ...r }) => ({
        ...r,
        // Raw cost columns stay server-side; homeowner retail follows the source
        // line's configured policy.
        homeownerPrice:
          sellPriceForTier(
            { wholesalePrice, adjustedListPrice, yourCost, listPrice: r.listPrice, retailPriceBasis },
            ps,
            "homeowner"
          )?.toFixed(2) ?? null,
      }));

      return {
        items: priced,
        total: rows.length,
      };
    }),

  // AI-style recommender input: returns the buyable cabinets in a family for a
  // given intent (e.g. "island"). Constrained to the locked family so it can
  // NEVER suggest a cross-distributor item. Keyword-mapped, no external call.
  recommendForIntent: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        intent: z.string().min(1),
        limit: z.number().min(1).max(24).default(8),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { intent: input.intent, items: [] as unknown[] };

      const intent = input.intent.toLowerCase();
      // Map a free-text intent to catalog categories/subcategories/keywords,
      // all resolved WITHIN the locked family. `fallbackCategories` is used when
      // a keyword search returns nothing, so the shopper still sees relevant
      // cabinets from their line instead of an empty result.
      const wants: {
        categories?: string[];
        keywords?: string[];
        fallbackCategories?: string[];
      } = (() => {
        // An island/peninsula is assembled from standard base cabinets — there is
        // no literal "island" product, so recommend Base cabinets for the line.
        if (/(island|peninsula|bar|seating|backside|back side)/.test(intent))
          return { categories: ["Base"] };
        if (/(sink|farm|apron|faucet|plumb)/.test(intent))
          return { keywords: ["sink", "farm", "apron"], fallbackCategories: ["Base"] };
        if (/(pantry|tall|oven|broom|utility|fridge|refriger)/.test(intent))
          return { categories: ["Tall"] };
        if (/(vanity|bath|powder|lavatory)/.test(intent))
          return { categories: ["Vanity"] };
        if (/(wall|upper|over|above|cupboard|glass)/.test(intent))
          return { categories: ["Wall"] };
        if (/(corner|lazy|susan|blind|angle)/.test(intent))
          return { keywords: ["corner", "lazy", "blind", "angle"], fallbackCategories: ["Base"] };
        if (/(drawer|pots|pans|cutlery|silverware)/.test(intent))
          return { keywords: ["drawer"], fallbackCategories: ["Base"] };
        if (/(trash|waste|recycl|garbage|bin)/.test(intent))
          return { keywords: ["trash", "waste", "recycl", "bin"], fallbackCategories: ["Base"] };
        if (/(spice)/.test(intent))
          return { keywords: ["spice"], fallbackCategories: ["Base"] };
        if (/(wine|bottle)/.test(intent))
          return { keywords: ["wine", "bottle"], fallbackCategories: ["Base"] };
        if (/(microwave|appliance)/.test(intent))
          return { keywords: ["microwave"], fallbackCategories: ["Base"] };
        if (/(base|lower|cabinet)/.test(intent))
          return { categories: ["Base"] };
        return { keywords: [intent], fallbackCategories: ["Base"] };
      })();

      const sourceConditions = [
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
        ne(cabinets.conflictStatus, "conflict"),
      ];

      const sourceRows = await db
        .select({
          sourceMasterCode: cabinets.masterCode,
          platformSku: distributorSkus.platformSku,
          homeownerPrice: distributorSkus.homeownerPrice,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          yourCost: distributorSkus.yourCost,
          retailPriceBasis: distributors.retailPriceBasis,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
        .where(and(...sourceConditions));
      const [aliases, masters] = await Promise.all([
        db
          .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
          .from(skuMasterAliases)
          .where(eq(skuMasterAliases.conflictStatus, "ok")),
        db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            width: cabinets.width,
          })
          .from(cabinets)
          .where(and(
            eq(cabinets.isActive, true),
            eq(cabinets.showInCatalog, true),
            ne(cabinets.conflictStatus, "conflict"),
          )),
      ]);
      const allRows = resolveCanonicalCatalogSources(sourceRows, aliases, masters)
        .map(({ source, master }) => ({ ...source, ...master }));
      const matchesIntent = (row: typeof allRows[number], categories?: string[], keywords?: string[]) => {
        if (categories?.length && !categories.includes(row.category ?? "")) return false;
        const description = row.description?.toLowerCase() ?? "";
        return !keywords?.length || keywords.some((keyword) => description.includes(keyword));
      };
      const canonicalRows = (rows: typeof allRows) => {
        const byId = new Map<number, typeof allRows[number]>();
        for (const row of rows) {
          const existing = byId.get(row.id);
          const cost = Number(row.yourCost ?? row.wholesalePrice ?? row.listPrice ?? Infinity);
          const existingCost = existing ? Number(existing.yourCost ?? existing.wholesalePrice ?? existing.listPrice ?? Infinity) : Infinity;
          if (!existing || cost < existingCost) byId.set(row.id, row);
        }
        return Array.from(byId.values()).sort((a, b) => a.masterCode.localeCompare(b.masterCode, undefined, { numeric: true }));
      };

      let rows = canonicalRows(allRows.filter((row) => matchesIntent(row, wants.categories, wants.keywords)));
      // If nothing matched (e.g. an unusual phrasing), fall back to the most
      // relevant category for the line so the recommender is never empty.
      if (rows.length === 0 && wants.fallbackCategories?.length) {
        rows = canonicalRows(allRows.filter((row) => matchesIntent(row, wants.fallbackCategories)));
      }

      // Resolve retail by source policy and strip raw cost columns.
      const psRec = await getPricingSettings();
      const items = rows.slice(0, input.limit).map(({ wholesalePrice, adjustedListPrice, yourCost, retailPriceBasis, ...r }) => ({
        ...r,
        homeownerPrice:
          sellPriceForTier(
            { wholesalePrice, adjustedListPrice, yourCost, listPrice: r.listPrice, retailPriceBasis },
            psRec,
            "homeowner"
          )?.toFixed(2) ?? null,
      }));

      return { intent: input.intent, items };
    }),

  // Glass-door upsell: given a solid-door WALL cabinet, return its glass-door
  // equivalent (same width/height code with a `GD` suffix) IF that glass version
  // is buyable in the locked family. Powers the "Make this a glass door?" prompt.
  // Oven/tall cabinets are intentionally excluded — glass doors are ordered
  // separately for those, never offered as a swap here.
  glassDoorUpsell: publicProcedure
    .input(z.object({ styleId: z.number(), masterCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const code = input.masterCode.toUpperCase().trim();
      // Only WALL cabinet codes get the glass swap. Wall codes start with W / AW
      // / DCW / WER / WD (diagonal/easy-reach wall families). Oven (O-/MO-) and
      // tall (U-/TS-) codes are excluded by construction.
      const isWallCode = /^(W|AW|DCW|WER|WD)[-0-9]/.test(code);
      if (!isWallCode) return null;
      // Already a glass-door cabinet — nothing to upsell.
      if (code.endsWith("GD")) return null;

      const candidate = `${code}GD`;
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          graphicType: cabinets.graphicType,
          platformSku: distributorSkus.platformSku,
          glassIncluded: distributors.glassIncluded,
          homeownerPrice: distributorSkus.homeownerPrice,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          yourCost: distributorSkus.yourCost,
          retailPriceBasis: distributors.retailPriceBasis,
        })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
        .where(
          and(
            eq(cabinets.isActive, true),
            notInConflict(),
            eq(cabinets.masterCode, candidate),
            eq(cabinets.category, "Wall"),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        )
        .limit(1);

      const g = rows[0];
      if (!g) return null;
      // Resolve retail by source policy and strip raw cost columns.
      const psG = await getPricingSettings();
      const { wholesalePrice, adjustedListPrice, yourCost, retailPriceBasis, ...rest } = g;
      return {
        ...rest,
        homeownerPrice:
          sellPriceForTier(
            { wholesalePrice, adjustedListPrice, yourCost, listPrice: rest.listPrice, retailPriceBasis },
            psG,
            "homeowner"
          )?.toFixed(2) ?? rest.homeownerPrice,
      };
    }),

  // ─── Affiliate white-label branding for a storefront ──────────────────────
  // Public read-side companion to the partner-only myBranding editor. Given a
  // storefront slug, returns the affiliate's per-door-style brand-name overrides
  // and markup config (global + per-category + per-style, all basis points) so
  // the /store/:slug catalog can render the affiliate's OWN names and marked-up
  // retail prices. Returns null when the slug has no active storefront. Never
  // exposes affiliate cost or the central supplier identity.
  brandingForSlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const aRows = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.slug, input.slug.toLowerCase()))
        .limit(1);
      const a = aRows[0];
      if (!a || !a.storefrontEnabled || a.status === "inactive") return null;

      const brandRows = await db
        .select()
        .from(affiliateStyleBranding)
        .where(eq(affiliateStyleBranding.affiliateId, a.id));

      // styleId -> brand name override (blank entries omitted)
      const styleNames: Record<number, string> = {};
      // styleId -> per-style markup bps override
      const styleMarkupBps: Record<number, number> = {};
      const styleEnabled: Record<number, boolean> = {};
      const styleFeatured: Record<number, boolean> = {};
      const styleRoomScenes: Record<number, string> = {};
      for (const r of brandRows) {
        const nm = (r.brandName ?? "").trim();
        if (nm) styleNames[r.styleId] = nm;
        if (typeof r.markupBps === "number") styleMarkupBps[r.styleId] = r.markupBps;
        styleEnabled[r.styleId] = r.isEnabled;
        styleFeatured[r.styleId] = r.featured;
        if (r.roomSceneUrl?.trim()) styleRoomScenes[r.styleId] = r.roomSceneUrl.trim();
      }

      let categoryMarkupBps: Record<string, number> = {};
      try {
        if (a.categoryMarkupJson) categoryMarkupBps = JSON.parse(a.categoryMarkupJson);
      } catch {
        categoryMarkupBps = {};
      }

      return {
        globalMarkupBps: a.defaultMarkupBps ?? 0,
        categoryMarkupBps,
        styleMarkupBps,
        styleNames,
        styleEnabled,
        styleFeatured,
        styleRoomScenes,
      };
    }),

  // ─── Active banner + promo badges for an affiliate storefront ──────────────
  activeBannerAndPromos: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { banner: null, promos: [] as typeof affiliatePromoDiscounts.$inferSelect[] };
      const [aff] = await db.select({ id: affiliates.id })
        .from(affiliates)
        .where(eq(affiliates.slug, input.slug))
        .limit(1);
      if (!aff) return { banner: null, promos: [] as typeof affiliatePromoDiscounts.$inferSelect[] };
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const [banner] = await db.select()
        .from(affiliateBannerSchedules)
        .where(and(
          eq(affiliateBannerSchedules.affiliateId, aff.id),
          lte(affiliateBannerSchedules.startDate, today),
          gte(affiliateBannerSchedules.endDate, today),
        ))
        .orderBy(affiliateBannerSchedules.createdAt)
        .limit(1);
      const now = new Date();
      const promos = await db.select()
        .from(affiliatePromoDiscounts)
        .where(and(
          eq(affiliatePromoDiscounts.affiliateId, aff.id),
          eq(affiliatePromoDiscounts.active, true),
          or(isNull(affiliatePromoDiscounts.startsAt), lte(affiliatePromoDiscounts.startsAt, now)),
          or(isNull(affiliatePromoDiscounts.endsAt), gte(affiliatePromoDiscounts.endsAt, now)),
        ));
      return { banner: banner ?? null, promos };
    }),
});
