/**
 * Generic Cabinets Admin Router
 * Procedures for managing the master cabinet catalog:
 * - Browse all master codes with aliases, stain color, construction method, dimensions, photo
 * - Inline-edit any field
 * - Upload catalog photo
 * - Sync aliases from the Generic tab spreadsheet
 * - View distributor coverage (which distributors carry each cabinet, with zip codes)
 * - Manage warehouse zip codes per distributor
 */
import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { cabinets, distributors, distributorSkus } from "../../drizzle/schema";
import { storagePut } from "../storage";

export const genericCabinetsRouter = router({
  /**
   * List all cabinets with alias columns, stain color, construction method.
   * Supports search by code/description/alias and filter by category.
   */
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        conflictOnly: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0, categories: [], subCategories: [] };

      const conditions = [];

      if (input.search) {
        const like_ = `%${input.search}%`;
        conditions.push(
          or(
            like(cabinets.masterCode, like_),
            like(cabinets.description, like_),
            like(cabinets.sku, like_),
            like(cabinets.vendorSku, like_),
            like(cabinets.altSku1, like_),
            like(cabinets.altSku2, like_),
            like(cabinets.altSku3, like_)
          )
        );
      }

      if (input.category) {
        conditions.push(eq(cabinets.category, input.category));
      }

      if (input.subCategory) {
        conditions.push(eq(cabinets.subCategory, input.subCategory));
      }

      if (input.conflictOnly) {
        conditions.push(eq(cabinets.conflictStatus, "conflict"));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, countResult, catResult] = await Promise.all([
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
            weight: cabinets.weight,
            catalogImageUrl: cabinets.catalogImageUrl,
            sku: cabinets.sku,
            vendorSku: cabinets.vendorSku,
            altSku1: cabinets.altSku1,
            altSku2: cabinets.altSku2,
            altSku3: cabinets.altSku3,
            pkgLength: cabinets.pkgLength,
            pkgWidth: cabinets.pkgWidth,
            pkgHeight: cabinets.pkgHeight,
            pkgWeight: cabinets.pkgWeight,
            stainColor: cabinets.stainColor,
            constructionMethod: cabinets.constructionMethod,
            conflictStatus: cabinets.conflictStatus,
            showInDesigner: cabinets.showInDesigner,
            showInCatalog: cabinets.showInCatalog,
            isActive: cabinets.isActive,
          })
          .from(cabinets)
          .where(where)
          .orderBy(asc(cabinets.category), asc(cabinets.masterCode))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(cabinets).where(where),
        db
          .select({ category: cabinets.category, subCategory: cabinets.subCategory })
          .from(cabinets)
          .groupBy(cabinets.category, cabinets.subCategory)
          .orderBy(asc(cabinets.category), asc(cabinets.subCategory)),
      ]);

      const categories = Array.from(
        new Set(catResult.map((r) => r.category).filter(Boolean))
      ) as string[];
      const subCategories = Array.from(
        new Set(catResult.map((r) => r.subCategory).filter(Boolean))
      ) as string[];

      return {
        rows: rows.map((r) => ({
          ...r,
          width: r.width?.toString() ?? null,
          height: r.height?.toString() ?? null,
          depth: r.depth?.toString() ?? null,
          weight: r.weight?.toString() ?? null,
          pkgLength: r.pkgLength?.toString() ?? null,
          pkgWidth: r.pkgWidth?.toString() ?? null,
          pkgHeight: r.pkgHeight?.toString() ?? null,
          pkgWeight: r.pkgWeight?.toString() ?? null,
        })),
        total: countResult[0]?.count ?? 0,
        categories,
        subCategories,
      };
    }),

  /**
   * Get distributor coverage for a single cabinet (which distributors carry it, with zip codes).
   */
  distributorCoverage: adminProcedure
    .input(z.object({ cabinetId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Find all distributors that have at least one SKU for this cabinet
      const rows = await db
        .selectDistinct({
          distributorId: distributors.id,
          distributorName: distributors.name,
          brandName: distributors.brandName,
          warehouseZips: distributors.warehouseZips,
          skuCount: sql<number>`COUNT(${distributorSkus.id})`,
        })
        .from(distributorSkus)
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .where(
          and(
            eq(distributorSkus.cabinetId, input.cabinetId),
            eq(distributorSkus.isPublished, true)
          )
        )
        .groupBy(distributors.id, distributors.name, distributors.brandName, distributors.warehouseZips);

      return rows.map((r) => ({
        distributorId: r.distributorId,
        name: r.brandName || r.distributorName,
        warehouseZips: (r.warehouseZips as string[] | null) ?? [],
        skuCount: r.skuCount,
      }));
    }),

  /**
   * List all distributors with their warehouse zip codes (for the zip manager).
   */
  distributorZips: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        id: distributors.id,
        name: distributors.name,
        brandName: distributors.brandName,
        code: distributors.code,
        warehouseZips: distributors.warehouseZips,
      })
      .from(distributors)
      .orderBy(asc(distributors.name));

    return rows.map((r) => ({
      id: r.id,
      name: r.brandName || r.name,
      code: r.code,
      warehouseZips: (r.warehouseZips as string[] | null) ?? [],
    }));
  }),

  /**
   * Update warehouse zip codes for a distributor.
   */
  updateDistributorZips: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        warehouseZips: z.array(z.string().min(5).max(10)),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      await db
        .update(distributors)
        .set({ warehouseZips: input.warehouseZips })
        .where(eq(distributors.id, input.distributorId));

      return { ok: true };
    }),

  /**
   * Update a single cabinet's editable fields.
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().optional(),
        category: z.string().optional(),
        subCategory: z.string().nullable().optional(),
        width: z.string().nullable().optional(),
        height: z.string().nullable().optional(),
        depth: z.string().nullable().optional(),
        weight: z.string().nullable().optional(),
        sku: z.string().nullable().optional(),
        vendorSku: z.string().nullable().optional(),
        altSku1: z.string().nullable().optional(),
        altSku2: z.string().nullable().optional(),
        altSku3: z.string().nullable().optional(),
        pkgLength: z.string().nullable().optional(),
        pkgWidth: z.string().nullable().optional(),
        pkgHeight: z.string().nullable().optional(),
        pkgWeight: z.string().nullable().optional(),
        stainColor: z.string().nullable().optional(),
        constructionMethod: z.string().nullable().optional(),
        catalogImageUrl: z.string().nullable().optional(),
        conflictStatus: z.enum(["none", "conflict"]).optional(),
        showInDesigner: z.boolean().optional(),
        showInCatalog: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const { id, ...fields } = input;

      const update: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        if (["width", "height", "depth", "weight", "pkgLength", "pkgWidth", "pkgHeight", "pkgWeight"].includes(k)) {
          update[k] = v === null || v === "" ? null : parseFloat(v as string);
        } else {
          update[k] = v;
        }
      }

      if (Object.keys(update).length === 0) return { ok: true };
      await db.update(cabinets).set(update).where(eq(cabinets.id, id));
      // Aliases are purely informational cross-references.
      // Visibility is controlled exclusively by admin via showInCatalog/showInDesigner toggles.
      return { ok: true };
    }),

  /**
   * Bulk-update aliases + dimensions for multiple cabinets at once.
   */
  bulkUpdateAliases: adminProcedure
    .input(
      z.array(
        z.object({
          masterCode: z.string(),
          sku: z.string().nullable(),
          vendorSku: z.string().nullable(),
          altSku1: z.string().nullable(),
          altSku2: z.string().nullable(),
          altSku3: z.string().nullable(),
          description: z.string().nullable(),
          category: z.string().nullable(),
          subCategory: z.string().nullable(),
          width: z.number().nullable(),
          height: z.number().nullable(),
          depth: z.number().nullable(),
          weight: z.number().nullable(),
          stainColor: z.string().nullable().optional(),
          constructionMethod: z.string().nullable().optional(),
        })
      )
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      let updated = 0;
      let notFound = 0;

      for (const row of input) {
        const existing = await db
          .select({ id: cabinets.id })
          .from(cabinets)
          .where(eq(cabinets.masterCode, row.masterCode))
          .limit(1);

        if (existing.length === 0) {
          notFound++;
          continue;
        }

        const update: Record<string, unknown> = {};
        if (row.sku !== undefined) update.sku = row.sku;
        if (row.vendorSku !== undefined) update.vendorSku = row.vendorSku;
        if (row.altSku1 !== undefined) update.altSku1 = row.altSku1;
        if (row.altSku2 !== undefined) update.altSku2 = row.altSku2;
        if (row.altSku3 !== undefined) update.altSku3 = row.altSku3;
        if (row.description) update.description = row.description;
        if (row.category) update.category = row.category;
        if (row.subCategory) update.subCategory = row.subCategory;
        if (row.width !== null) update.width = row.width;
        if (row.height !== null) update.height = row.height;
        if (row.depth !== null) update.depth = row.depth;
        if (row.weight !== null) update.weight = row.weight;
        if (row.stainColor !== undefined) update.stainColor = row.stainColor;
        if (row.constructionMethod !== undefined) update.constructionMethod = row.constructionMethod;

        // Aliases are purely informational cross-references.
        // Visibility is controlled exclusively by admin via showInCatalog/showInDesigner toggles.
        await db.update(cabinets).set(update).where(eq(cabinets.id, existing[0].id));
        updated++;
      }

      return { updated, notFound };
    }),

  /**
   * Upload a catalog illustration image for a cabinet.
   * Accepts a base64-encoded file and stores it in S3.
   */
  uploadCatalogImage: adminProcedure
    .input(
      z.object({
        cabinetId: z.number(),
        fileBase64: z.string(),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `cabinet-catalog-images/${input.cabinetId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      await db
        .update(cabinets)
        .set({ catalogImageUrl: url })
        .where(eq(cabinets.id, input.cabinetId));

      return { url };
    }),

  /**
   * Fast cabinet search for the import match dropdown.
   * Returns up to 20 cabinets matching the query string against masterCode, description, and all alias fields.
   */
  searchForMatch: adminProcedure
    .input(z.object({ q: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const like_ = `%${input.q.trim()}%`;
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          sku: cabinets.sku,
          vendorSku: cabinets.vendorSku,
          altSku1: cabinets.altSku1,
          altSku2: cabinets.altSku2,
          altSku3: cabinets.altSku3,
        })
        .from(cabinets)
        .where(
          or(
            like(cabinets.masterCode, like_),
            like(cabinets.description, like_),
            like(cabinets.sku, like_),
            like(cabinets.vendorSku, like_),
            like(cabinets.altSku1, like_),
            like(cabinets.altSku2, like_),
            like(cabinets.altSku3, like_)
          )
        )
        .orderBy(asc(cabinets.masterCode))
        .limit(20);
      return rows.map((r) => ({
        id: r.id,
        masterCode: r.masterCode,
        description: r.description ?? null,
        category: r.category ?? null,
        aliases: [r.sku, r.vendorSku, r.altSku1, r.altSku2, r.altSku3].filter(Boolean) as string[],
      }));
    }),

  /**
   * Detect cabinets with overlapping / similar SKU codes that may be duplicates.
   * Returns pairs where one cabinet's code appears in another's alias fields,
   * OR where codes differ only by a hyphen/space (e.g. B12 vs B-12, OC30 vs OC-30).
   * Each suggestion has a unique key so admins can dismiss it permanently.
   */
  potentialMerges: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    // Load all cabinets with their alias fields
    const rows = await db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        sku: cabinets.sku,
        vendorSku: cabinets.vendorSku,
        altSku1: cabinets.altSku1,
        altSku2: cabinets.altSku2,
        altSku3: cabinets.altSku3,
        showInCatalog: cabinets.showInCatalog,
        showInDesigner: cabinets.showInDesigner,
      })
      .from(cabinets)
      .orderBy(asc(cabinets.masterCode));

    // Build a map: normalizedCode -> cabinet
    // Normalize = uppercase, remove hyphens and spaces
    const normalize = (s: string) => s.toUpperCase().replace(/[-\s]/g, "");

    const byNorm = new Map<string, typeof rows[0][]>();
    for (const row of rows) {
      const norm = normalize(row.masterCode);
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm)!.push(row);
    }

    // Also build a map of all alias values -> cabinet that owns them
    const aliasOwner = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      for (const alias of [row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3]) {
        if (alias) aliasOwner.set(alias.toUpperCase(), row);
      }
    }

    type MergeCandidate = {
      key: string;
      cabinetA: { id: number; masterCode: string; description: string | null; category: string | null };
      cabinetB: { id: number; masterCode: string; description: string | null; category: string | null };
      reason: string;
    };

    const seen = new Set<string>();
    const candidates: MergeCandidate[] = [];

    const addCandidate = (a: typeof rows[0], b: typeof rows[0], reason: string) => {
      // Skip if either is already hidden (already merged/aliased)
      if (!a.showInCatalog && !a.showInDesigner) return;
      if (!b.showInCatalog && !b.showInDesigner) return;
      // Skip if one already has the other as an alias
      const aAliases = [a.sku, a.vendorSku, a.altSku1, a.altSku2, a.altSku3].filter(Boolean);
      const bAliases = [b.sku, b.vendorSku, b.altSku1, b.altSku2, b.altSku3].filter(Boolean);
      if (aAliases.includes(b.masterCode) || bAliases.includes(a.masterCode)) return;
      // Dedup: always use smaller id first
      const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
      const key = `${lo.id}:${hi.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        key,
        cabinetA: { id: lo.id, masterCode: lo.masterCode, description: lo.description ?? null, category: lo.category ?? null },
        cabinetB: { id: hi.id, masterCode: hi.masterCode, description: hi.description ?? null, category: hi.category ?? null },
        reason,
      });
    };

    // 1. Normalized code collision (e.g. B12 vs B-12, OC30 vs OC-30)
    for (const group of Array.from(byNorm.values())) {
      if (group.length > 1) {
        for (let i = 0; i < group.length - 1; i++) {
          for (let j = i + 1; j < group.length; j++) {
            addCandidate(group[i], group[j], "Codes match when hyphens/spaces are removed");
          }
        }
      }
    }

    // 2. One cabinet's masterCode appears in another's alias fields
    for (const row of rows) {
      const owner = aliasOwner.get(row.masterCode.toUpperCase());
      if (owner && owner.id !== row.id) {
        addCandidate(row, owner, `"${row.masterCode}" is listed as an alias on ${owner.masterCode}`);
      }
    }

    return candidates.slice(0, 200); // cap at 200 suggestions
  }),

  /**
   * Dismiss a potential merge suggestion so it no longer appears.
   * Stores a dismissal record in a JSON column on one of the cabinets (using a
   * lightweight approach: we store dismissed pair keys in a server-side in-memory
   * set for the session, and persist them via a dedicated DB table in a future
   * sprint). For now we use a simple approach: mark both cabinets with a
   * dismissedMergeKeys field. Since the schema doesn't have that yet, we use
   * the conflictReason field as a temporary store prefixed with DISMISS:.
   */
  dismissMerge: adminProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // key format: "lowerId:higherId"
      const [aId, bId] = input.key.split(":").map(Number);
      if (!aId || !bId) throw new Error("Invalid key");

      // Store dismissal marker on both cabinets using conflictReason prefix
      const marker = `DISMISS_MERGE:${input.key}`;
      for (const id of [aId, bId]) {
        const [existing] = await db
          .select({ conflictReason: cabinets.conflictReason })
          .from(cabinets)
          .where(eq(cabinets.id, id))
          .limit(1);
        if (!existing) continue;
        const current = existing.conflictReason ?? "";
        if (!current.includes(marker)) {
          await db
            .update(cabinets)
            .set({ conflictReason: current ? `${current}\n${marker}` : marker })
            .where(eq(cabinets.id, id));
        }
      }
      return { ok: true };
    }),

  /**
   * Accept a merge: set cabinetB's masterCode as an alias on cabinetA,
   * then hide cabinetB. cabinetA becomes the canonical listing.
   */
  acceptMerge: adminProcedure
    .input(z.object({ canonicalId: z.number(), duplicateId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [canonical] = await db
        .select({ altSku1: cabinets.altSku1, altSku2: cabinets.altSku2, altSku3: cabinets.altSku3 })
        .from(cabinets)
        .where(eq(cabinets.id, input.canonicalId))
        .limit(1);

      const [duplicate] = await db
        .select({ masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.id, input.duplicateId))
        .limit(1);

      if (!canonical || !duplicate) throw new Error("Cabinet not found");

      // Find an empty alias slot on the canonical cabinet
      const aliasUpdate: Record<string, string> = {};
      if (!canonical.altSku1) aliasUpdate.altSku1 = duplicate.masterCode;
      else if (!canonical.altSku2) aliasUpdate.altSku2 = duplicate.masterCode;
      else if (!canonical.altSku3) aliasUpdate.altSku3 = duplicate.masterCode;
      else throw new Error("All alias slots are full on the canonical cabinet");

      await db.update(cabinets).set(aliasUpdate).where(eq(cabinets.id, input.canonicalId));

      // Hide the duplicate
      await db
        .update(cabinets)
        .set({ showInCatalog: false, showInDesigner: false })
        .where(eq(cabinets.id, input.duplicateId));

      return { ok: true };
    }),

  /**
   * Get distinct categories and sub-categories for filter dropdowns.
   */
    /** Bulk move selected cabinets to a different category (and optionally sub-category). */
  bulkMoveCategory: adminProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1),
        category: z.string().min(1).max(64),
        subCategory: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const update: Record<string, unknown> = { category: input.category };
      if (input.subCategory !== undefined) {
        update.subCategory = input.subCategory;
      }
      await db
        .update(cabinets)
        .set(update)
        .where(inArray(cabinets.id, input.ids));
      return { ok: true, count: input.ids.length };
    }),

  categories: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { categories: [], subCategories: [] };
    const rows = await db
      .select({ category: cabinets.category, subCategory: cabinets.subCategory })
      .from(cabinets)
      .groupBy(cabinets.category, cabinets.subCategory)
      .orderBy(asc(cabinets.category), asc(cabinets.subCategory));
    const categories = Array.from(
      new Set(rows.map((r) => r.category).filter(Boolean))
    ) as string[];
    const subCategories = Array.from(
      new Set(rows.map((r) => r.subCategory).filter(Boolean))
    ) as string[];
    return { categories, subCategories };
  }),
});
