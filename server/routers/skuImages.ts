import { z } from "zod";
import { updateCabinetLogged } from "../lib/cabinetConfigHistory";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cabinets, distributors, doorStyles, distributorSkus } from "../../drizzle/schema";
import { storagePut } from "../storage";

// ─── SKU-level image management (admin) ─────────────────────────────────────────
// Images live at the SKU level (cabinet + door style). The storefront resolves an
// image as: SKU image -> door-style image -> drawing fallback (handled client-side).
//
// Editing is self-paced: open any product, replace/crop the photo, save. A default
// "Apply to all <cabinet>" checkbox cascades the same image to every SKU that shares
// the cabinet's masterCode (across every door style + distributor).

function normalizeToken(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const skuImagesRouter = router({
  /**
   * Paged, searchable list of SKUs for the image manager. Grouped door-first on
   * the client; here we just return the rows with the joined names + resolved image.
   */
  list: adminProcedure
    .input(
      z.object({
        styleId: z.number().optional(),
        category: z.string().optional(),
        search: z.string().optional(),
        onlyMissing: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(60),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conds = [];
      if (input.styleId) conds.push(eq(distributorSkus.styleId, input.styleId));
      if (input.category) conds.push(eq(cabinets.category, input.category));
      if (input.onlyMissing) conds.push(sql`${distributorSkus.imageUrl} IS NULL`);
      if (input.search) {
        const s = `%${input.search}%`;
        conds.push(
          or(
            like(distributorSkus.platformSku, s),
            like(cabinets.masterCode, s),
            like(cabinets.description, s),
            like(doorStyles.ourName, s)
          )!
        );
      }
      const whereExpr = conds.length ? and(...conds) : undefined;

      const baseSelect = {
        skuId: distributorSkus.id,
        platformSku: distributorSkus.platformSku,
        imageUrl: distributorSkus.imageUrl,
        cabinetId: cabinets.id,
        masterCode: cabinets.masterCode,
        cabinetDescription: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        styleId: doorStyles.id,
        styleName: doorStyles.ourName,
        styleCode: doorStyles.styleCode,
        doorImageUrl: doorStyles.doorSampleImageUrl,
        roomImageUrl: doorStyles.roomSceneImageUrl,
      };

      const rowsQ = db
        .select(baseSelect)
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .orderBy(
          doorStyles.ourName,
          cabinets.category,
          cabinets.subCategory,
          // Wall cabinets: sort height-first (15", 18", 24", 30", 36", 42")
          // Base/Tall/Vanity: sort width-first
          sql`CASE WHEN ${cabinets.category} = 'Wall' THEN CAST(${cabinets.height} AS DECIMAL) ELSE CAST(${cabinets.width} AS DECIMAL) END`,
          sql`CASE WHEN ${cabinets.category} = 'Wall' THEN CAST(${cabinets.width} AS DECIMAL) ELSE CAST(${cabinets.height} AS DECIMAL) END`,
          cabinets.masterCode
        )
        .limit(input.limit)
        .offset(input.offset);

      const countQ = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id));

      const [items, countRes] = await Promise.all([
        whereExpr ? rowsQ.where(whereExpr) : rowsQ,
        whereExpr ? countQ.where(whereExpr) : countQ,
      ]);

      return { items, total: Number(countRes[0]?.count ?? 0) };
    }),

  /**
   * Upload an edited/cropped image (base64 data URL or raw base64) and return its
   * stored URL. The client crops/rotates in-browser and sends the final bytes.
   */
  upload: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        dataBase64: z.string().min(1), // may be a data: URL or bare base64
        contentType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const raw = input.dataBase64.includes(",")
        ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1)
        : input.dataBase64;
      const buf = Buffer.from(raw, "base64");
      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { url } = await storagePut(`sku-images/${Date.now()}_${safe}`, buf, input.contentType);
      return { url };
    }),

  /**
   * Assign an image to a SKU. If applyToAllCabinet is true (the default in the UI),
   * the same image is applied to EVERY SKU that shares this SKU's masterCode, across
   * all door styles + distributors. Returns how many rows were updated.
   */
  setImage: adminProcedure
    .input(
      z.object({
        skuId: z.number(),
        imageUrl: z.string().min(1),
        applyToAllCabinet: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: 0 };

      const target = await db
        .select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, input.skuId))
        .limit(1);
      if (!target[0]) return { updated: 0 };

      if (!input.applyToAllCabinet) {
        await db
          .update(distributorSkus)
          .set({ imageUrl: input.imageUrl })
          .where(eq(distributorSkus.id, input.skuId));
        return { updated: 1 };
      }

      // All SKUs sharing the same master cabinet receive the image together.
      // An unmatched pending SKU has no sibling cabinet group, so keep the
      // requested image scoped to that SKU rather than dereferencing null.
      if (target[0].cabinetId == null) {
        await db
          .update(distributorSkus)
          .set({ imageUrl: input.imageUrl })
          .where(eq(distributorSkus.id, input.skuId));
        return { updated: 1 };
      }
      const siblings = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(eq(distributorSkus.cabinetId, target[0].cabinetId));
      const ids = siblings.map((s) => s.id);
      if (ids.length) {
        await db
          .update(distributorSkus)
          .set({ imageUrl: input.imageUrl })
          .where(inArray(distributorSkus.id, ids));
      }
      return { updated: ids.length };
    }),

  /**
   * Master-code-level list: one row per cabinet, showing the shared image (if any),
   * category, description, and how many distributor SKUs reference it.
   * This is the primary view for the Product Images admin tab.
   */
  masterList: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        onlyMissing: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(60),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conds: ReturnType<typeof eq>[] = [];
      if (input.onlyMissing) conds.push(sql`c.catalogImageUrl IS NULL` as any);
      if (input.category) conds.push(eq(cabinets.category, input.category) as any);
      if (input.search) {
        const s = `%${input.search}%`;
        conds.push(
          or(
            like(cabinets.masterCode, s),
            like(cabinets.description, s),
            like(cabinets.category, s)
          )! as any
        );
      }
      const whereExpr = conds.length ? and(...conds) : undefined;

      const baseQ = db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          imageUrl: cabinets.catalogImageUrl,
          skuCount: sql<number>`COUNT(DISTINCT ds.id)`,
        })
        .from(cabinets)
        .leftJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .groupBy(cabinets.id)
        .orderBy(cabinets.category, cabinets.masterCode);

      const countQ = db
        .select({ count: sql<number>`COUNT(DISTINCT c.id)` })
        .from(cabinets);

      const [items, countRes] = await Promise.all([
        whereExpr ? (baseQ.where(whereExpr) as any).limit(input.limit).offset(input.offset) : baseQ.limit(input.limit).offset(input.offset),
        whereExpr ? (countQ.where(whereExpr) as any) : countQ,
      ]);

      return { items, total: Number((countRes as any)[0]?.count ?? 0) };
    }),

  /**
   * Set image on ALL distributor_skus that share a cabinetId (master code level).
   * Also updates cabinets.catalogImageUrl for the master record.
   */
  setMasterImage: adminProcedure
    .input(
      z.object({
        cabinetId: z.number(),
        imageUrl: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { updated: 0 };

      // Update the master cabinets record
      await updateCabinetLogged(db, {
        cabinetId: input.cabinetId,
        patch: { catalogImageUrl: input.imageUrl },
        actor: { id: ctx.user?.id ?? null, name: ctx.user?.name ?? null },
      });

      // Propagate to all distributor SKUs
      const siblings = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(eq(distributorSkus.cabinetId, input.cabinetId));
      const ids = siblings.map((s) => s.id);
      if (ids.length) {
        await db
          .update(distributorSkus)
          .set({ imageUrl: input.imageUrl })
          .where(inArray(distributorSkus.id, ids));
      }
      return { updated: ids.length + 1 };
    }),

  /** Count how many SKUs an "apply to all cabinet" action would touch (for the confirm dialog). */
  cabinetSiblingCount: adminProcedure
    .input(z.object({ skuId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { count: 0, masterCode: "" };
      const t = await db
        .select({ cabinetId: distributorSkus.cabinetId, masterCode: cabinets.masterCode })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(eq(distributorSkus.id, input.skuId))
        .limit(1);
      if (!t[0]) return { count: 0, masterCode: "" };
      if (t[0].cabinetId == null) return { count: 1, masterCode: "Unmapped supplier SKU" };
      const c = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(distributorSkus)
        .where(eq(distributorSkus.cabinetId, t[0].cabinetId));
      return { count: Number(c[0]?.count ?? 0), masterCode: t[0].masterCode };
    }),

  /**
   * Batch auto-match: given a list of uploaded file names, resolve each to the SKU
   * it belongs to by matching (a) a color/style token and (b) a cabinet token found
   * anywhere in the (punctuation/space/case-insensitive) file name. Accepts the SKU
   * code, the style code/name, and the cabinet master code / aliases.
   * Returns the matches; the client then calls setImage per matched file.
   */
  matchFilenames: adminProcedure
    .input(z.object({ filenames: z.array(z.string().min(1)).max(2000) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { matches: [], unmatched: input.filenames };

      // Build lookup dictionaries once.
      const skuRows = await db
        .select({
          skuId: distributorSkus.id,
          platformSku: distributorSkus.platformSku,
          masterCode: cabinets.masterCode,
          styleName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id));

      // exact full-SKU index
      const bySku = new Map<string, number>();
      // (styleToken, cabinetToken) -> skuId
      const byStyleCab = new Map<string, number>();
      const styleTokens = new Set<string>();
      const cabTokens = new Set<string>();
      for (const r of skuRows) {
        bySku.set(normalizeToken(r.platformSku), r.skuId);
        const sTokens = [r.styleCode, r.styleName].map(normalizeToken).filter(Boolean);
        const cTok = normalizeToken(r.masterCode);
        cabTokens.add(cTok);
        for (const st of sTokens) {
          styleTokens.add(st);
          byStyleCab.set(`${st}|${cTok}`, r.skuId);
        }
      }

      const matches: { filename: string; skuId: number; how: string }[] = [];
      const unmatched: string[] = [];
      for (const fn of input.filenames) {
        const stem = fn.replace(/\.[a-z0-9]+$/i, "");
        const norm = normalizeToken(stem);
        // 1) exact full SKU contained
        let hit: number | undefined;
        let how = "";
        for (const [sku, id] of Array.from(bySku.entries())) {
          if (sku && norm.includes(sku)) {
            hit = id;
            how = "sku";
            break;
          }
        }
        // 2) style token + cabinet token both present
        if (hit === undefined) {
          let foundStyle = "";
          for (const st of Array.from(styleTokens)) {
            if (st.length >= 2 && norm.includes(st)) {
              foundStyle = st;
              break;
            }
          }
          let foundCab = "";
          // prefer the longest cabinet token match to avoid B1 matching inside B12
          for (const ct of Array.from(cabTokens)) {
            if (ct.length >= 2 && norm.includes(ct) && ct.length > foundCab.length) {
              foundCab = ct;
            }
          }
          if (foundStyle && foundCab) {
            const id = byStyleCab.get(`${foundStyle}|${foundCab}`);
            if (id !== undefined) {
              hit = id;
              how = "style+cabinet";
            }
          }
        }
        if (hit !== undefined) matches.push({ filename: fn, skuId: hit, how });
        else unmatched.push(fn);
      }
      return { matches, unmatched };
    }),
});
