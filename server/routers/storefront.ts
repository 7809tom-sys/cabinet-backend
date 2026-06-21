import { z } from "zod";
import { eq, and, sql, inArray } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  cabinets,
  distributors,
  doorStyles,
  distributorSkus,
} from "../../drizzle/schema";

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
  doorStyle: string | null;
  woodSpecies: string | null;
  finish: string | null;
  color: string | null;
  boxConstruction: string | null;
  distributorId: number;
  doorSampleImageUrl: string | null;
  roomSceneImageUrl: string | null;
  thumbnailImageUrl: string | null;
}) {
  return {
    styleId: row.id,
    styleCode: row.styleCode,
    name: row.ourName,
    doorStyle: row.doorStyle,
    woodSpecies: row.woodSpecies,
    finish: row.finish,
    color: row.color,
    boxConstruction: row.boxConstruction,
    // distributorId is kept so the client can persist the locked supply line,
    // but NO supplier name/brand is ever returned.
    distributorId: row.distributorId,
    doorSampleImageUrl: row.doorSampleImageUrl,
    roomSceneImageUrl: row.roomSceneImageUrl,
    thumbnailImageUrl: row.thumbnailImageUrl,
  };
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
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

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
          doorStyle: doorStyles.doorStyle,
          woodSpecies: doorStyles.woodSpecies,
          finish: doorStyles.finish,
          color: doorStyles.color,
          boxConstruction: doorStyles.boxConstruction,
          distributorId: doorStyles.distributorId,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        })
        .from(doorStyles)
        .innerJoin(distributorSkus, eq(distributorSkus.styleId, doorStyles.id))
        .innerJoin(distributors, eq(doorStyles.distributorId, distributors.id))
        .where(and(...conditions));

      return rows
        .map(toFamily)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
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
          doorStyle: doorStyles.doorStyle,
          woodSpecies: doorStyles.woodSpecies,
          finish: doorStyles.finish,
          color: doorStyles.color,
          boxConstruction: doorStyles.boxConstruction,
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
      const rows = await db
        .selectDistinct({ subCategory: cabinets.subCategory })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(
          and(
            eq(cabinets.isActive, true),
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
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [
        eq(cabinets.isActive, true),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input.category) conditions.push(eq(cabinets.category, input.category));
      if (input.subCategory) conditions.push(eq(cabinets.subCategory, input.subCategory));
      if (input.search) {
        conditions.push(
          sql`(${cabinets.masterCode} LIKE ${`%${input.search}%`} OR ${cabinets.description} LIKE ${`%${input.search}%`})`
        );
      }

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
          graphicType: cabinets.graphicType,
          isCornerCabinet: cabinets.isCornerCabinet,
          platformSku: distributorSkus.platformSku,
          homeownerPrice: distributorSkus.homeownerPrice,
          listPrice: distributorSkus.listPrice,
        })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(...conditions))
        .orderBy(cabinets.category, cabinets.masterCode)
        .limit(input.limit)
        .offset(input.offset);

      const countRows = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${cabinets.id})` })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(...conditions));

      return {
        items: rows,
        total: Number(countRows[0]?.count ?? 0),
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

      const baseConditions = [
        eq(cabinets.isActive, true),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];

      const cols = {
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        width: cabinets.width,
        platformSku: distributorSkus.platformSku,
        homeownerPrice: distributorSkus.homeownerPrice,
      };

      const runQuery = async (conds: typeof baseConditions) =>
        db
          .select(cols)
          .from(cabinets)
          .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
          .where(and(...conds))
          .orderBy(cabinets.masterCode)
          .limit(input.limit);

      const conditions = [...baseConditions];
      if (wants.categories && wants.categories.length) {
        conditions.push(inArray(cabinets.category, wants.categories));
      }
      if (wants.keywords && wants.keywords.length) {
        const ors = wants.keywords.map(
          (k) => sql`${cabinets.description} LIKE ${`%${k}%`}`
        );
        conditions.push(sql`(${sql.join(ors, sql` OR `)})`);
      }

      let rows = await runQuery(conditions);

      // If nothing matched (e.g. an unusual phrasing), fall back to the most
      // relevant category for the line so the recommender is never empty.
      if (rows.length === 0 && wants.fallbackCategories?.length) {
        rows = await runQuery([
          ...baseConditions,
          inArray(cabinets.category, wants.fallbackCategories),
        ]);
      }

      return { intent: input.intent, items: rows };
    }),
});
