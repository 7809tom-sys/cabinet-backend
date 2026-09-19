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
import { getDb, isCanonicalCabinetMaster } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { cabinets, cabinetAliases, distributors, distributorSkus, distributorCabinetOverrides, doorStyles, skuMasterAliases } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { normalizeCode } from "../../shared/cabinetCodeMatch";

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

	      // A Catalog row is always the one live canonical master. Retired duplicate
	      // rows remain available for historical price/order records, but their alias
	      // search routes resolve to this canonical result instead of a second row.
	      const conditions = [isCanonicalCabinetMaster()];
	      const normalizedAlias = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinetAliases.alias}, '-', ''), ' ', ''), '_', ''))`;
	      const normalizedMasterAlias = sql`UPPER(REPLACE(REPLACE(REPLACE(${skuMasterAliases.aliasCode}, '-', ''), ' ', ''), '_', ''))`;
	      let normalizedCodeSearch = "";

	      if (input.search) {
	        const search = input.search.trim();
	        const like_ = `%${search}%`;
	        normalizedCodeSearch = normalizeCode(search);
	        const normalizedLike = `%${normalizedCodeSearch}%`;
	        conditions.push(
	          or(
            like(cabinets.masterCode, like_),
            sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', '')) LIKE ${normalizedLike}`,
            like(cabinets.description, like_),
            like(cabinets.sku, like_),
            sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.sku}, '-', ''), ' ', ''), '_', '')) LIKE ${normalizedLike}`,
            like(cabinets.vendorSku, like_),
            sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.vendorSku}, '-', ''), ' ', ''), '_', '')) LIKE ${normalizedLike}`,
            like(cabinets.altSku1, like_),
            sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.altSku1}, '-', ''), ' ', ''), '_', '')) LIKE ${normalizedLike}`,
	            like(cabinets.altSku2, like_),
	            sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.altSku2}, '-', ''), ' ', ''), '_', '')) LIKE ${normalizedLike}`,
	            like(cabinets.altSku3, like_),
	            sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.altSku3}, '-', ''), ' ', ''), '_', '')) LIKE ${normalizedLike}`,
	            sql`EXISTS (
	              SELECT 1 FROM cabinet_aliases
	              WHERE cabinet_aliases.cabinetId = ${cabinets.id}
	                AND ${normalizedAlias} LIKE ${normalizedLike}
	            )`,
	            sql`EXISTS (
	              SELECT 1 FROM sku_master_aliases
	              WHERE sku_master_aliases.masterCode = ${cabinets.masterCode}
	                AND ${normalizedMasterAlias} LIKE ${normalizedLike}
	            )`
	          )!
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

	      const matchedAliasByCabinetId = new Map<number, string>();
	      if (normalizedCodeSearch) {
	        const [directAliasMatches, masterAliasMatches] = await Promise.all([
	          db
	            .select({ cabinetId: cabinetAliases.cabinetId, alias: cabinetAliases.alias })
	            .from(cabinetAliases)
	            .where(sql`${normalizedAlias} = ${normalizedCodeSearch}`),
	          db
	            .select({ masterCode: skuMasterAliases.masterCode, alias: skuMasterAliases.aliasCode })
	            .from(skuMasterAliases)
	            .where(sql`${normalizedMasterAlias} = ${normalizedCodeSearch}`),
	        ]);
	        const visibleIds = new Set(rows.map((row) => row.id));
	        const visibleByMasterCode = new Map(rows.map((row) => [row.masterCode, row.id]));
	        for (const alias of directAliasMatches) {
	          if (visibleIds.has(alias.cabinetId)) matchedAliasByCabinetId.set(alias.cabinetId, alias.alias);
	        }
	        for (const alias of masterAliasMatches) {
	          const cabinetId = visibleByMasterCode.get(alias.masterCode);
	          if (cabinetId != null) matchedAliasByCabinetId.set(cabinetId, alias.alias);
	        }
	      }

	      return {
	        rows: rows.map((r) => ({
	          ...r,
	          matchedAlias: matchedAliasByCabinetId.get(r.id) ?? null,
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
   * Full master-cabinet detail for the unified Catalog → Add Item / Edit Item form.
   * Supplier SKU rows stay separate from the master record: the selected source row
   * controls its actual sell/cost price and public availability.
   */
  itemEditorDetail: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [item] = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          physicalWidth: cabinets.physicalWidth,
          weight: cabinets.weight,
          placementType: cabinets.placementType,
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          numberOfFixedShelves: cabinets.numberOfFixedShelves,
          numberOfAdjShelves: cabinets.numberOfAdjShelves,
          hingeSide: cabinets.hingeSide,
          toeKickHeight: cabinets.toeKickHeight,
          graphicType: cabinets.graphicType,
          isCornerCabinet: cabinets.isCornerCabinet,
          cornerSide: cabinets.cornerSide,
          cornerType: cabinets.cornerType,
          catalogImageUrl: cabinets.catalogImageUrl,
          specNotes: cabinets.specNotes,
          pkgLength: cabinets.pkgLength,
          pkgWidth: cabinets.pkgWidth,
          pkgHeight: cabinets.pkgHeight,
          pkgWeight: cabinets.pkgWeight,
          sku: cabinets.sku,
          vendorSku: cabinets.vendorSku,
          altSku1: cabinets.altSku1,
          altSku2: cabinets.altSku2,
          altSku3: cabinets.altSku3,
          isActive: cabinets.isActive,
          showInDesigner: cabinets.showInDesigner,
          showInCatalog: cabinets.showInCatalog,
        })
        .from(cabinets)
        .where(eq(cabinets.id, input.id))
        .limit(1);
      if (!item) throw new Error("Catalog item not found");

      const sources = await db
        .select({
          skuId: distributorSkus.id,
          distributorId: distributorSkus.distributorId,
          distributorName: distributors.name,
          styleId: distributorSkus.styleId,
          styleName: doorStyles.ourName,
          distributorSku: distributorSkus.distributorSku,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
          status: distributorSkus.status,
        })
        .from(distributorSkus)
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(eq(distributorSkus.cabinetId, input.id))
        .orderBy(asc(distributors.name), asc(doorStyles.ourName));

      return { item, sources };
    }),

  /**
   * Creates or edits one CabinetDealz master cabinet from the complete Catalog form.
   * A draft is intentionally hidden from catalog/designer. Publishing requires the
   * category and one source SKU with a price, so a public or Designer item can never
   * be an unpriced master record with no orderable supplier connection.
   */
  saveCatalogItem: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        mode: z.enum(["draft", "publish"]),
        masterCode: z.string().trim().min(1, "SKU is required").max(64),
        description: z.string().trim().max(4_000).default(""),
        category: z.string().trim().min(1, "Category is required").max(64),
        subCategory: z.string().trim().max(128).nullable().optional(),
        width: z.number().min(0).max(999).nullable().optional(),
        height: z.number().min(0).max(999).nullable().optional(),
        depth: z.number().min(0).max(999).nullable().optional(),
        physicalWidth: z.number().min(0).max(999).nullable().optional(),
        weight: z.number().min(0).max(10_000).nullable().optional(),
        placementType: z.string().trim().max(32).nullable().optional(),
        numberOfDoors: z.number().int().min(0).max(24).nullable().optional(),
        numberOfDrawers: z.number().int().min(0).max(24).nullable().optional(),
        numberOfFixedShelves: z.number().int().min(0).max(24).nullable().optional(),
        numberOfAdjShelves: z.number().int().min(0).max(24).nullable().optional(),
        hingeSide: z.string().trim().max(16).nullable().optional(),
        toeKickHeight: z.number().min(0).max(24).nullable().optional(),
        graphicType: z.string().trim().max(64).nullable().optional(),
        isCornerCabinet: z.boolean().default(false),
        cornerSide: z.string().trim().max(16).nullable().optional(),
        cornerType: z.string().trim().max(50).nullable().optional(),
        catalogImageUrl: z.string().trim().max(512).nullable().optional(),
        specNotes: z.string().trim().max(8_000).nullable().optional(),
        pkgLength: z.number().min(0).max(999).nullable().optional(),
        pkgWidth: z.number().min(0).max(999).nullable().optional(),
        pkgHeight: z.number().min(0).max(999).nullable().optional(),
        pkgWeight: z.number().min(0).max(10_000).nullable().optional(),
        sku: z.string().trim().max(128).nullable().optional(),
        vendorSku: z.string().trim().max(128).nullable().optional(),
        altSku1: z.string().trim().max(128).nullable().optional(),
        altSku2: z.string().trim().max(128).nullable().optional(),
        altSku3: z.string().trim().max(128).nullable().optional(),
        source: z.object({
          skuId: z.number().int().positive().optional(),
          distributorId: z.number().int().positive(),
          styleId: z.number().int().positive(),
          distributorSku: z.string().trim().min(1).max(128),
          listPrice: z.number().min(0).max(1_000_000).nullable().optional(),
          yourCost: z.number().min(0).max(1_000_000).nullable().optional(),
          isAvailable: z.boolean().default(true),
        }).nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const masterCode = input.masterCode.trim().toUpperCase();
      const publish = input.mode === "publish";
      const category = input.category.trim();
      const description = input.description.trim();
      if (publish && !description) {
        throw new Error("Product name or description is required before publishing.");
      }
      if (publish && (!input.source || input.source.listPrice == null && input.source.yourCost == null)) {
        throw new Error("Add a valid List Price or Your Cost before publishing.");
      }

      const [existing] = input.id == null ? [undefined] : await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.id, input.id))
        .limit(1);
      if (input.id && !existing) throw new Error("Catalog item not found.");
      if (existing && existing.masterCode !== masterCode) {
        throw new Error("Master SKU cannot be changed after creation. Create a new item or manage a legacy alias instead.");
      }

      // A master SKU is a platform identity, not a display-only label. Reject
      // normalized collisions with master codes and aliases before the database
      // unique constraint has a chance to issue a less useful error.
      if (!existing) {
        const [masterRows, aliasRows] = await Promise.all([
          db.select({ id: cabinets.id, masterCode: cabinets.masterCode, sku: cabinets.sku, vendorSku: cabinets.vendorSku, altSku1: cabinets.altSku1, altSku2: cabinets.altSku2, altSku3: cabinets.altSku3 }).from(cabinets),
          db.select({ cabinetId: cabinetAliases.cabinetId, alias: cabinetAliases.alias }).from(cabinetAliases),
        ]);
        const normalized = normalizeCode(masterCode);
        const codeCollision = masterRows.some((row) => [row.masterCode, row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3]
          .some((code) => code != null && normalizeCode(code) === normalized))
          || aliasRows.some((row) => normalizeCode(row.alias) === normalized);
        if (codeCollision) throw new Error("This SKU already exists or conflicts with an existing master SKU alias.");
      }

      const optionalText = (value: string | null | undefined) => value?.trim() || null;
      const decimalValue = (value: number | null | undefined) => value == null ? null : String(value);
      const values = {
        description,
        category,
        subCategory: optionalText(input.subCategory),
        width: decimalValue(input.width),
        height: decimalValue(input.height),
        depth: decimalValue(input.depth),
        physicalWidth: decimalValue(input.physicalWidth),
        weight: decimalValue(input.weight),
        placementType: optionalText(input.placementType),
        numberOfDoors: input.numberOfDoors ?? 0,
        numberOfDrawers: input.numberOfDrawers ?? 0,
        numberOfFixedShelves: input.numberOfFixedShelves ?? null,
        numberOfAdjShelves: input.numberOfAdjShelves ?? null,
        hingeSide: optionalText(input.hingeSide),
        toeKickHeight: decimalValue(input.toeKickHeight),
        graphicType: optionalText(input.graphicType),
        isCornerCabinet: input.isCornerCabinet,
        cornerSide: optionalText(input.cornerSide),
        cornerType: optionalText(input.cornerType),
        catalogImageUrl: optionalText(input.catalogImageUrl),
        specNotes: optionalText(input.specNotes),
        pkgLength: decimalValue(input.pkgLength),
        pkgWidth: decimalValue(input.pkgWidth),
        pkgHeight: decimalValue(input.pkgHeight),
        pkgWeight: decimalValue(input.pkgWeight),
        sku: optionalText(input.sku),
        vendorSku: optionalText(input.vendorSku),
        altSku1: optionalText(input.altSku1),
        altSku2: optionalText(input.altSku2),
        altSku3: optionalText(input.altSku3),
        isActive: publish,
        showInCatalog: publish,
        showInDesigner: publish,
        showIn2020: publish,
        conflictStatus: "none",
      };

      const saved = await db.transaction(async (tx) => {
        let cabinetId = existing?.id;
        if (cabinetId) {
          await tx.update(cabinets).set(values).where(eq(cabinets.id, cabinetId));
        } else {
          const [result] = await tx.insert(cabinets).values({ masterCode, ...values });
          cabinetId = Number((result as { insertId: number }).insertId);
        }

        let sourceSkuId: number | null = null;
        if (input.source) {
          const [style] = await tx
            .select({ id: doorStyles.id })
            .from(doorStyles)
            .where(and(eq(doorStyles.id, input.source.styleId), eq(doorStyles.distributorId, input.source.distributorId)))
            .limit(1);
          if (!style) throw new Error("Choose a door style that belongs to the selected supplier line.");

          const [sameSupplierSku] = await tx
            .select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId })
            .from(distributorSkus)
            .where(and(eq(distributorSkus.distributorId, input.source.distributorId), eq(distributorSkus.styleId, input.source.styleId), eq(distributorSkus.distributorSku, input.source.distributorSku)))
            .limit(1);
          if (sameSupplierSku && sameSupplierSku.id !== input.source.skuId && sameSupplierSku.cabinetId !== cabinetId) {
            throw new Error("This supplier SKU is already connected to another catalog item for the selected line and door style.");
          }

          const sourceValues = {
            distributorId: input.source.distributorId,
            styleId: input.source.styleId,
            distributorSku: input.source.distributorSku.trim(),
            listPrice: input.source.listPrice == null ? null : String(input.source.listPrice),
            yourCost: input.source.yourCost == null ? null : String(input.source.yourCost),
            isAvailable: input.source.isAvailable,
            isPublished: publish,
            status: publish ? "approved" as const : "pending" as const,
          };
          if (input.source.skuId) {
            const [owned] = await tx
              .select({ id: distributorSkus.id })
              .from(distributorSkus)
              .where(and(eq(distributorSkus.id, input.source.skuId), eq(distributorSkus.cabinetId, cabinetId)))
              .limit(1);
            if (!owned) throw new Error("The selected supplier price record does not belong to this catalog item.");
            await tx.update(distributorSkus).set(sourceValues).where(eq(distributorSkus.id, input.source.skuId));
            sourceSkuId = input.source.skuId;
          } else if (sameSupplierSku && sameSupplierSku.cabinetId === cabinetId) {
            await tx.update(distributorSkus).set(sourceValues).where(eq(distributorSkus.id, sameSupplierSku.id));
            sourceSkuId = sameSupplierSku.id;
          } else {
            const [result] = await tx.insert(distributorSkus).values({
              cabinetId,
              ...sourceValues,
              platformSku: `${masterCode}-${input.source.distributorSku.trim()}-${input.source.distributorId}-${input.source.styleId}`.toUpperCase().slice(0, 128),
            });
            sourceSkuId = Number((result as { insertId: number }).insertId);
          }
        }

        return { cabinetId: cabinetId!, sourceSkuId };
      });

      return { id: saved.cabinetId, masterCode, sourceSkuId: saved.sourceSkuId, isPublished: publish };
    }),

  /**
   * Get distributor coverage for a single cabinet (which distributors carry it, with zip codes).
   */
  distributorCoverage: adminProcedure
    .input(z.object({ cabinetId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Show every recorded supplier SKU connection, including a pending or
      // unpublished line, while an administrator is completing configuration.
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
        .where(eq(distributorSkus.cabinetId, input.cabinetId))
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
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        catalogImageUrl: cabinets.catalogImageUrl,
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
      cabinetA: { id: number; masterCode: string; description: string | null; category: string | null; catalogImageUrl: string | null; width: string | null; height: string | null; depth: string | null };
      cabinetB: { id: number; masterCode: string; description: string | null; category: string | null; catalogImageUrl: string | null; width: string | null; height: string | null; depth: string | null };
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
        cabinetA: { id: lo.id, masterCode: lo.masterCode, description: lo.description ?? null, category: lo.category ?? null, catalogImageUrl: lo.catalogImageUrl ?? null, width: lo.width ?? null, height: lo.height ?? null, depth: lo.depth ?? null },
        cabinetB: { id: hi.id, masterCode: hi.masterCode, description: hi.description ?? null, category: hi.category ?? null, catalogImageUrl: hi.catalogImageUrl ?? null, width: hi.width ?? null, height: hi.height ?? null, depth: hi.depth ?? null },
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

      // 1. Move all distributor SKUs from duplicate to canonical
      await db
        .update(distributorSkus)
        .set({ cabinetId: input.canonicalId })
        .where(eq(distributorSkus.cabinetId, input.duplicateId));

      // 2. Move overrides (ignore conflicts if canonical already has one for same distributor)
      try {
        await db
          .update(distributorCabinetOverrides)
          .set({ cabinetId: input.canonicalId })
          .where(eq(distributorCabinetOverrides.cabinetId, input.duplicateId));
      } catch {
        // If duplicate key conflict, just delete the duplicate's overrides
        await db
          .delete(distributorCabinetOverrides)
          .where(eq(distributorCabinetOverrides.cabinetId, input.duplicateId));
      }

      // 3. Find an empty alias slot on the canonical cabinet
      const aliasUpdate: Record<string, string> = {};
      if (!canonical.altSku1) aliasUpdate.altSku1 = duplicate.masterCode;
      else if (!canonical.altSku2) aliasUpdate.altSku2 = duplicate.masterCode;
      else if (!canonical.altSku3) aliasUpdate.altSku3 = duplicate.masterCode;
      // If all slots full, skip alias — the merge still proceeds

      if (Object.keys(aliasUpdate).length > 0) {
        await db.update(cabinets).set(aliasUpdate).where(eq(cabinets.id, input.canonicalId));
      }

      // 4. Deactivate and hide the duplicate
      await db
        .update(cabinets)
        .set({ isActive: false, showInCatalog: false, showInDesigner: false })
        .where(eq(cabinets.id, input.duplicateId));

      return { ok: true };
    }),

  /** Manual merge: search for a cabinet by code/description to use in merge */
  searchForMerge: adminProcedure
    .input(z.object({ search: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const term = `%${input.search}%`;
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          catalogImageUrl: cabinets.catalogImageUrl,
          isActive: cabinets.isActive,
        })
        .from(cabinets)
        .where(
          or(
            like(cabinets.masterCode, term),
            like(cabinets.description, term),
            like(cabinets.altSku1, term),
            like(cabinets.altSku2, term),
            like(cabinets.altSku3, term)
          )
        )
        .orderBy(asc(cabinets.masterCode))
        .limit(20);
      // Get SKU counts
      const results = [];
      for (const row of rows) {
        const [countRow] = await db
          .select({ cnt: sql<number>`COUNT(*)` })
          .from(distributorSkus)
          .where(eq(distributorSkus.cabinetId, row.id));
        results.push({ ...row, skuCount: Number(countRow?.cnt ?? 0) });
      }
      return results;
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
