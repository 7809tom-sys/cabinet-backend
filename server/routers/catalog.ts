import { z } from "zod";
import { eq, and, like, inArray, isNotNull, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  cabinets,
  distributors,
  doorStyles,
  distributorSkus,
} from "../../drizzle/schema";
import { resolvePresentation, applyMarkup } from "../lib/presentation";

// ─── Supplier-identity scrubbing ───────────────────────────────────────────────
// Cabinet Dealz never exposes the underlying supplier. These helpers strip any
// supplier-identifying columns from rows before they leave a public procedure,
// so the door-style-first UI can present purely by style.
function scrubCabinet<T extends Record<string, unknown>>(row: T): Omit<T, "descriptionSource"> {
  if (!row) return row;
  const { descriptionSource: _drop, ...rest } = row as T & { descriptionSource?: unknown };
  return rest;
}
function scrubDoorStyle<T extends Record<string, unknown>>(row: T): Omit<T, "distributorName"> {
  if (!row) return row;
  const { distributorName: _drop, ...rest } = row as T & { distributorName?: unknown };
  return rest;
}

// ─── Distributors ─────────────────────────────────────────────────────────────

export const distributorsRouter = router({
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(distributors)
      .where(eq(distributors.isActive, true));
    // Resolve the customer-facing label per line; never leak hidden supplier names.
    return rows.map((d) => {
      const p = resolvePresentation(d);
      return {
        id: d.id,
        code: d.code,
        name: p.displayName,
        initials: p.displayInitials,
        displayMode: p.displayMode,
        seriesName: d.seriesName,
        leadTimeDays: d.leadTimeDays,
        isActive: d.isActive,
      };
    });
  }),
});

// ─── Door Styles ──────────────────────────────────────────────────────────────

export const doorStylesRouter = router({
  list: publicProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      if (input?.distributorId) {
        const rows = await db
          .select()
          .from(doorStyles)
          .where(
            and(
              eq(doorStyles.distributorId, input.distributorId),
              eq(doorStyles.isActive, true)
            )
          );
        return rows.map(scrubDoorStyle);
      }
      const rows = await db.select().from(doorStyles).where(eq(doorStyles.isActive, true));
      return rows.map(scrubDoorStyle);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.id))
        .limit(1);
      return rows[0] ? scrubDoorStyle(rows[0]) : null;
    }),

  byCode: publicProcedure
    .input(z.object({ styleCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      // Style codes are not guaranteed unique across supply lines; return the
      // first active match (we collapse duplicates to one family in the UI).
      const rows = await db
        .select()
        .from(doorStyles)
        .where(
          and(
            eq(doorStyles.styleCode, input.styleCode),
            eq(doorStyles.isActive, true)
          )
        )
        .limit(1);
      return rows[0] ? scrubDoorStyle(rows[0]) : null;
    }),

  // ── Family catalog (the door-style-FAMILY-first shopping view) ──────────────
  // Given one door style, return EVERY cabinet available in that style (base,
  // wall, tall, vanity, accessory — all together) collapsed to one priced row
  // per cabinet. This powers the /family/:styleCode page so a shopper picks a
  // family first and then sees all cabinet types in that one look.
  familyCatalog: publicProcedure
    .input(z.object({ styleId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { style: null, items: [] };

      const styleRows = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.styleId))
        .limit(1);
      const style = styleRows[0];
      if (!style) return { style: null, items: [] };

      const rows = await db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          graphicType: cabinets.graphicType,
          catalogImageUrl: cabinets.catalogImageUrl,
          listPrice: distributorSkus.listPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          platformSku: distributorSkus.platformSku,
          skuImageUrl: distributorSkus.imageUrl,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(
          and(
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            eq(cabinets.isActive, true)
          )
        );

      // Collapse to one row per cabinet (a cabinet may be carried by multiple
      // supply lines in the same style). Prefer the lowest contractor price.
      const byCabinet = new Map<number, (typeof rows)[number]>();
      for (const r of rows) {
        const existing = byCabinet.get(r.cabinetId);
        if (!existing) {
          byCabinet.set(r.cabinetId, r);
          continue;
        }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(
          existing.contractorPrice ?? existing.wholesalePrice ?? Infinity
        );
        if (a < b) byCabinet.set(r.cabinetId, r);
      }

      const items = Array.from(byCabinet.values()).sort((a, b) =>
        (a.masterCode || "").localeCompare(b.masterCode || "", undefined, {
          numeric: true,
        })
      );

      return { style: scrubDoorStyle(style), items };
    }),
});

// ─── Cabinets ─────────────────────────────────────────────────────────────────

export const cabinetsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        subCategory: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [eq(cabinets.isActive, true)];
      if (input?.category) {
        conditions.push(eq(cabinets.category, input.category));
      }
      if (input?.subCategory) {
        conditions.push(eq(cabinets.subCategory, input.subCategory));
      }
      if (input?.search) {
        conditions.push(
          sql`(${cabinets.masterCode} LIKE ${`%${input.search}%`} OR ${cabinets.description} LIKE ${`%${input.search}%`})`
        );
      }

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(cabinets)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(cabinets)
          .where(and(...conditions)),
      ]);

      return {
        items: items.map(scrubCabinet),
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  categories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ category: cabinets.category })
      .from(cabinets)
      .where(eq(cabinets.isActive, true));
    return rows.map((r) => r.category).filter(Boolean);
  }),

  subCategories: publicProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .selectDistinct({ subCategory: cabinets.subCategory })
        .from(cabinets)
        .where(
          and(
            eq(cabinets.isActive, true),
            eq(cabinets.category, input.category),
            isNotNull(cabinets.subCategory)
          )
        );
      return rows.map((r) => r.subCategory).filter(Boolean);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(cabinets)
        .where(eq(cabinets.id, input.id))
        .limit(1);
      return rows[0] ? scrubCabinet(rows[0]) : null;
    }),

  byCode: publicProcedure
    .input(z.object({ masterCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(cabinets)
        .where(eq(cabinets.masterCode, input.masterCode))
        .limit(1);
      return rows[0] ? scrubCabinet(rows[0]) : null;
    }),
});

// ─── Pricing ──────────────────────────────────────────────────────────────────

export const pricingRouter = router({
  // ── Door-style-first pricing ──────────────────────────────────────────────
  // Returns ONE priced row per unique door style for a cabinet. Internally we
  // pick the best (lowest contractor price) available + published SKU per style
  // and surface ONLY style metadata + prices. No distributor name/SKU ever
  // leaves the server, so the UI can present purely by door style.
  stylesForCabinet: publicProcedure
    .input(z.object({ cabinetId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          styleId: distributorSkus.styleId,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          doorStyle: doorStyles.doorStyle,
          finish: doorStyles.finish,
          color: doorStyles.color,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
          listPrice: distributorSkus.listPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          platformSku: distributorSkus.platformSku,
          skuImageUrl: distributorSkus.imageUrl,
          leadTimeDays: distributors.leadTimeDays,
          distributorId: distributorSkus.distributorId,
        })
        .from(distributorSkus)
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .where(
          and(
            eq(distributorSkus.cabinetId, input.cabinetId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            eq(doorStyles.isActive, true),
            eq(distributors.isActive, true)
          )
        );

      // Collapse to one row per style code (some styles exist across multiple
      // supply lines). Prefer the lowest contractor price as the sourced option.
      const byStyle = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = (r.styleCode || r.ourName || String(r.styleId)).toUpperCase();
        const existing = byStyle.get(key);
        if (!existing) {
          byStyle.set(key, r);
          continue;
        }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(existing.contractorPrice ?? existing.wholesalePrice ?? Infinity);
        if (a < b) byStyle.set(key, r);
      }

      return Array.from(byStyle.values())
        .map((r) => ({
          styleId: r.styleId,
          styleCode: r.styleCode,
          name: r.ourName,
          doorStyle: r.doorStyle,
          finish: r.finish,
          color: r.color,
          doorSampleImageUrl: r.doorSampleImageUrl,
          roomSceneImageUrl: r.roomSceneImageUrl,
          thumbnailImageUrl: r.thumbnailImageUrl,
          listPrice: r.listPrice,
          adjustedListPrice: r.adjustedListPrice,
          wholesalePrice: r.wholesalePrice,
          contractorPrice: r.contractorPrice,
          platformSku: r.platformSku,
          skuImageUrl: r.skuImageUrl,
          leadTimeDays: r.leadTimeDays,
          distributorId: r.distributorId,
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }),
});
