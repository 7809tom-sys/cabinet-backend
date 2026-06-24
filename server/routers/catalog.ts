import { z } from "zod";
import { eq, and, like, inArray, isNotNull, sql, desc, asc } from "drizzle-orm";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, notInConflict, getPricingSettings, updatePricingSettings, getPlatformPricingSettings, updatePlatformPricingSettings } from "../db";
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

  // Color variations within the SAME door profile (e.g. all Slim Shaker colors).
  // Powers the in-place finish picker on the Family page so a shopper can switch
  // the color without leaving the family. Returns active styles sharing this
  // style's doorStyle profile, the current one first, deduped by display name.
  siblings: publicProcedure
    .input(z.object({ styleCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const current = await db
        .select()
        .from(doorStyles)
        .where(and(eq(doorStyles.styleCode, input.styleCode), eq(doorStyles.isActive, true)))
        .limit(1);
      const cur = current[0];
      if (!cur || !cur.doorStyle) return cur ? [scrubDoorStyle(cur)] : [];
      const rows = await db
        .select()
        .from(doorStyles)
        .where(and(eq(doorStyles.doorStyle, cur.doorStyle), eq(doorStyles.isActive, true)))
        .orderBy(asc(doorStyles.ourName));
      // Dedupe by display name; keep the current style at the front.
      const seen = new Set<string>();
      const out: typeof rows = [];
      const keyOf = (r: (typeof rows)[number]) =>
        (r.ourName || r.styleCode || String(r.id)).toLowerCase();
      out.push(cur);
      seen.add(keyOf(cur));
      for (const r of rows) {
        const k = keyOf(r);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
      }
      return out.map(scrubDoorStyle);
    }),

  // ── Featured door styles (admin-curated 80/20 merchandising) ────────────────
  // Public: the curated set pushed on the storefront, ordered by rank, hard
  // capped at 30 so the affiliate/homeowner sees a focused selection.
  featured: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(doorStyles)
      .where(and(eq(doorStyles.isActive, true), eq(doorStyles.isFeatured, true)))
      .orderBy(asc(doorStyles.featuredRank), asc(doorStyles.ourName))
      .limit(30);
    return rows.map(scrubDoorStyle);
  }),

  // Admin: every active style with its featured flag/rank, for the manager UI.
  listForAdmin: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(doorStyles)
      .where(eq(doorStyles.isActive, true))
      .orderBy(asc(doorStyles.ourName));
    return rows; // admin sees full rows (incl. distributorName) intentionally
  }),

  // Admin: toggle a style's featured state. Enforces the MAX 30 cap on enable.
  setFeatured: adminProcedure
    .input(z.object({ id: z.number(), featured: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.featured) {
        const [{ cnt }] = await db
          .select({ cnt: sql<number>`count(*)` })
          .from(doorStyles)
          .where(and(eq(doorStyles.isActive, true), eq(doorStyles.isFeatured, true)));
        // Allow re-featuring an already-featured row without tripping the cap.
        const already = await db
          .select({ isFeatured: doorStyles.isFeatured })
          .from(doorStyles)
          .where(eq(doorStyles.id, input.id))
          .limit(1);
        const isAlready = already[0]?.isFeatured === true;
        if (!isAlready && Number(cnt) >= 30) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You can feature up to 30 door styles. Remove one before adding another.",
          });
        }
        // New featured items go to the end of the order by default.
        const [{ maxRank }] = await db
          .select({ maxRank: sql<number>`coalesce(max(featuredRank), 0)` })
          .from(doorStyles)
          .where(and(eq(doorStyles.isActive, true), eq(doorStyles.isFeatured, true)));
        await db
          .update(doorStyles)
          .set({ isFeatured: true, featuredRank: Number(maxRank) + 10 })
          .where(eq(doorStyles.id, input.id));
      } else {
        await db
          .update(doorStyles)
          .set({ isFeatured: false })
          .where(eq(doorStyles.id, input.id));
      }
      return { ok: true };
    }),

  // Admin: persist a new order for the featured styles (array of ids, in order).
  reorderFeatured: adminProcedure
    .input(z.object({ orderedIds: z.array(z.number()).max(30) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let rank = 10;
      for (const id of input.orderedIds) {
        await db.update(doorStyles).set({ featuredRank: rank }).where(eq(doorStyles.id, id));
        rank += 10;
      }
      return { ok: true };
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
            eq(cabinets.isActive, true),
            notInConflict()
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

      const conditions = [eq(cabinets.isActive, true), notInConflict()];
      if (input?.category) {
        conditions.push(eq(cabinets.category, input.category));
      }
      if (input?.subCategory) {
        conditions.push(eq(cabinets.subCategory, input.subCategory));
      }
      if (input?.search) {
        const raw = input.search.trim();
        // Canonical key: strip everything but alphanumerics so glued user codes
        // (e.g. "w31824", "W2736", "WDC2430R") match dashed master codes
        // ("W-318-24", "W-27-36", "WDC-24-30-R").
        const canon = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
        // SQL-side canonicalization of masterCode: remove dashes and spaces.
        const canonCol = sql`UPPER(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''))`;
        const orParts = [
          sql`${cabinets.masterCode} LIKE ${`%${raw}%`}`,
          sql`${cabinets.description} LIKE ${`%${raw}%`}`,
        ];
        if (canon) {
          orParts.push(sql`${canonCol} LIKE ${`%${canon}%`}`);
        }
        conditions.push(sql`(${sql.join(orParts, sql` OR `)})`);
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

  // Style-scoped catalog list: only returns cabinets that have a published +
  // available SKU for the SELECTED door style. This makes the storefront
  // Catalog reflect true per-door-style availability (each style carries its
  // own cabinet set), matching the Design Tool's placeableCabinets gate.
  listForStyle: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(48),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conds = [
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        eq(cabinets.isActive, true),
        notInConflict(),
      ];
      if (input.category) conds.push(eq(cabinets.category, input.category));
      if (input.subCategory) conds.push(eq(cabinets.subCategory, input.subCategory));
      if (input.search) {
        conds.push(
          sql`(${cabinets.masterCode} LIKE ${`%${input.search}%`} OR ${cabinets.description} LIKE ${`%${input.search}%`})`
        );
      }

      // Pull all matching cabinet rows for this style (a cabinet may have
      // multiple SKUs across lines in the same style) then collapse to one row
      // per cabinet before paginating, so counts/pages reflect distinct items.
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
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          graphicType: cabinets.graphicType,
          catalogImageUrl: cabinets.catalogImageUrl,
          placementType: cabinets.placementType,
          isCornerCabinet: cabinets.isCornerCabinet,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(...conds));

      const byCabinet = new Map<number, (typeof rows)[number]>();
      for (const r of rows) if (!byCabinet.has(r.id)) byCabinet.set(r.id, r);
      const distinct = Array.from(byCabinet.values()).sort((a, b) =>
        (a.masterCode || "").localeCompare(b.masterCode || "", undefined, { numeric: true })
      );

      const total = distinct.length;
      const page = distinct.slice(input.offset, input.offset + input.limit);
      return { items: page, total };
    }),

  categories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ category: cabinets.category })
      .from(cabinets)
      .where(and(eq(cabinets.isActive, true), notInConflict()));
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
            notInConflict(),
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
        .where(and(eq(cabinets.id, input.id), notInConflict()))
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
        .where(and(eq(cabinets.masterCode, input.masterCode), notInConflict()))
        .limit(1);
      return rows[0] ? scrubCabinet(rows[0]) : null;
    }),

  // ── Admin: Conflict / Needs-Review back office ───────────────────────────
  // Lists every product currently held in conflict status, together with the
  // info we DO know: distributor name(s) and door style(s) it is carried under
  // (resolved from its SKUs). Admin-only — supplier identity is allowed here.
  conflicts: adminProcedure.query(async () => {
    type ConflictItem = {
      id: number;
      masterCode: string;
      description: string;
      category: string;
      subCategory: string | null;
      width: string | null;
      height: string | null;
      depth: string | null;
      conflictReason: string | null;
      conflictedAt: Date | null;
      skuCount: number;
      distributorNames: string[];
      doorStyleNames: string[];
    };
    const db = await getDb();
    if (!db) return [] as ConflictItem[];
    const items = await db
      .select()
      .from(cabinets)
      .where(eq(cabinets.conflictStatus, "conflict"))
      .orderBy(asc(cabinets.masterCode));
    if (items.length === 0) return [];
    const ids = items.map((c) => c.id);
    // Resolve the distributor names + door styles each conflict item is
    // carried under, so the admin can identify it against the catalog book.
    const skuRows = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        distributorName: distributors.name,
        styleName: doorStyles.ourName,
        styleCode: doorStyles.styleCode,
        distributorSku: distributorSkus.distributorSku,
        platformSku: distributorSkus.platformSku,
        listPrice: distributorSkus.listPrice,
      })
      .from(distributorSkus)
      .leftJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .where(inArray(distributorSkus.cabinetId, ids));
    const byCab = new Map<number, typeof skuRows>();
    for (const r of skuRows) {
      const arr = byCab.get(r.cabinetId) ?? [];
      arr.push(r);
      byCab.set(r.cabinetId, arr);
    }
    const result: ConflictItem[] = items.map((c) => {
      const skus = byCab.get(c.id) ?? [];
      const distributorNames = Array.from(
        new Set(skus.map((s) => s.distributorName).filter((v): v is string => Boolean(v)))
      );
      const doorStyleNames = Array.from(
        new Set(
          skus
            .map((s) => (s.styleName ? `${s.styleName}${s.styleCode ? ` (${s.styleCode})` : ""}` : null))
            .filter((v): v is string => Boolean(v))
        )
      );
      return {
        id: c.id,
        masterCode: c.masterCode,
        description: c.description,
        category: c.category,
        subCategory: c.subCategory,
        width: c.width,
        height: c.height,
        depth: c.depth,
        conflictReason: c.conflictReason,
        conflictedAt: c.conflictedAt,
        skuCount: skus.length,
        distributorNames,
        doorStyleNames,
      };
    });
    return result;
  }),

  // Admin: flag a product into conflict status (hold in back office).
  setConflict: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db
        .update(cabinets)
        .set({
          conflictStatus: "conflict",
          conflictReason: input.reason ?? "Flagged for review by admin.",
          conflictedAt: new Date(),
        })
        .where(eq(cabinets.id, input.id));
      return { ok: true };
    }),

  // Admin: clear a conflict once reviewed, returning the product to live status.
  clearConflict: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db
        .update(cabinets)
        .set({ conflictStatus: "none", conflictReason: null, conflictedAt: null })
        .where(eq(cabinets.id, input.id));
      return { ok: true };
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
          homeownerPrice: distributorSkus.homeownerPrice,
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
            eq(distributors.isActive, true),
            notInConflict()
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
          homeownerPrice: r.homeownerPrice,
          platformSku: r.platformSku,
          skuImageUrl: r.skuImageUrl,
          leadTimeDays: r.leadTimeDays,
          distributorId: r.distributorId,
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }),

  // ── Margins control center (admin) ────────────────────────────────────────
  // Single source of truth for the platform-wide selling margins surfaced in
  // the "Pricing & Margins" admin tab. globalMarkupBps is guidance/default for
  // supply lines; the per-tier bps nudge a whole tier up/down. 10000 = no change.
  adminGetMargins: adminProcedure.query(async () => {
    const s = await getPricingSettings();
    const distRows = await (async () => {
      const db = await getDb();
      if (!db) return [] as { id: number; name: string | null; markupPercent: string | null; displayMode: string | null; seriesName: string | null }[];
      return db
        .select({
          id: distributors.id,
          name: distributors.name,
          markupPercent: distributors.markupPercent,
          displayMode: distributors.displayMode,
          seriesName: distributors.seriesName,
        })
        .from(distributors)
        .where(eq(distributors.isActive, true))
        .orderBy(asc(distributors.name));
    })();
    return { settings: s, distributors: distRows };
  }),

  adminUpdateMargins: adminProcedure
    .input(
      z.object({
        globalMarkupBps: z.number().int().min(0).max(110000).optional(),
        homeownerMarkupBps: z.number().int().min(0).max(110000).optional(),
        contractorMarkupBps: z.number().int().min(0).max(110000).optional(),
        wholesaleMarkupBps: z.number().int().min(0).max(110000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updatePricingSettings(input, ctx.user?.openId);
      return await getPricingSettings();
    }),

  // ─── Platform fee system (price ladder + order fee stack) ────────────────
  // Single source of truth for the Cabinet Dealz fee stack: ladder markups +
  // damage / tech / card fees. All values basis points except techFeeCapCents.
  adminGetFeeSettings: adminProcedure.query(async () => {
    return await getPlatformPricingSettings();
  }),

  adminUpdateFeeSettings: adminProcedure
    .input(
      z.object({
        wholesaleMarkupBps: z.number().int().min(0).max(1000000).optional(),
        affiliateMarkupBps: z.number().int().min(0).max(1000000).optional(),
        retailMarkupBps: z.number().int().min(0).max(1000000).optional(),
        damageFeeBps: z.number().int().min(0).max(100000).optional(),
        techFeeBps: z.number().int().min(0).max(100000).optional(),
        techFeeCapCents: z.number().int().min(0).max(100000000).optional(),
        cardFeeBps: z.number().int().min(0).max(100000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updatePlatformPricingSettings(input, ctx.user?.openId);
      return await getPlatformPricingSettings();
    }),

  // Per-distributor markup override. Reuses the distributor.markupPercent lever
  // (decimal fraction, e.g. 0.15 = +15%) so the margins tab can edit it inline.
  adminSetDistributorMarkup: adminProcedure
    .input(z.object({ distributorId: z.number().int(), markupPercent: z.number().min(0).max(10) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      await db
        .update(distributors)
        .set({ markupPercent: String(input.markupPercent) })
        .where(eq(distributors.id, input.distributorId));
      return { success: true } as const;
    }),
});
