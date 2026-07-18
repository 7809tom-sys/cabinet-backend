import { z } from "zod";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { distributors, cabinets, distributorSkus, doorStyles } from "../../drizzle/schema";
import {
  parseDistributorCsv,
  validateImport,
  parseMoney,
  parseDimension,
  VALID_CATEGORIES,
  IMPORT_TEMPLATE_CSV,
} from "@shared/distributorImport";
import { buildCatalogCsv, type CatalogExportRow } from "@shared/catalogExport";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

/** Per-row plan describing what the commit will do (no writes during preview). */
interface PreviewRow {
  rowNumber: number;
  masterCode: string;
  /** The resolved platform master code (may differ from the raw code if alias matched). */
  resolvedMasterCode: string | null;
  /** How the code was matched: "exact" | "alias" | "none" */
  matchHow: "exact" | "alias" | "none";
  /** The door style name resolved from the styleCode column (if any). */
  resolvedStyleName: string | null;
  action: "create-info" | "update-info" | "price-only" | "error";
  description: string | null;
  category: string | null;
  fields: string[]; // which fields will change
  priceTouched: boolean;
  errors: string[];
  warnings: string[];
}

function normalizeCategory(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === raw.toLowerCase()
  );
  return match ?? null;
}

/**
 * Build an alias lookup map from the cabinets table.
 * Returns a map from upper-cased alias value → { id, masterCode, description, category }.
 * Each cabinet can appear under multiple alias keys (sku, vendorSku, altSku1/2/3, masterCode).
 */
async function buildAliasMap(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  codes: string[]
): Promise<Map<string, { id: number; masterCode: string; description: string | null; category: string | null }>> {
  if (codes.length === 0) return new Map();
  const upper = codes.map((c) => c.toUpperCase());

  // Query all cabinets whose masterCode OR any alias field matches any of the codes.
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
        inArray(sql`UPPER(${cabinets.masterCode})`, upper),
        inArray(sql`UPPER(${cabinets.sku})`, upper),
        inArray(sql`UPPER(${cabinets.vendorSku})`, upper),
        inArray(sql`UPPER(${cabinets.altSku1})`, upper),
        inArray(sql`UPPER(${cabinets.altSku2})`, upper),
        inArray(sql`UPPER(${cabinets.altSku3})`, upper)
      )
    );

  const map = new Map<string, { id: number; masterCode: string; description: string | null; category: string | null }>();
  for (const row of rows) {
    const entry = { id: row.id, masterCode: row.masterCode, description: row.description, category: row.category };
    // Register under every alias (masterCode wins over aliases for the same key).
    for (const val of [row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3]) {
      if (val) {
        const key = val.toUpperCase();
        if (!map.has(key)) map.set(key, entry);
      }
    }
    // masterCode always wins.
    map.set(row.masterCode.toUpperCase(), entry);
  }
  return map;
}

/**
 * Build a door style lookup map for a distributor.
 * Returns a map from upper-cased style name/code → { id, ourName }.
 * Matches against styleCode, ourName, and distributorName.
 */
async function buildStyleMap(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  distributorId: number
): Promise<Map<string, { id: number; ourName: string }>> {
  const styles = await db
    .select({
      id: doorStyles.id,
      styleCode: doorStyles.styleCode,
      ourName: doorStyles.ourName,
      distributorName: doorStyles.distributorName,
    })
    .from(doorStyles)
    .where(eq(doorStyles.distributorId, distributorId));

  const map = new Map<string, { id: number; ourName: string }>();
  for (const s of styles) {
    const entry = { id: s.id, ourName: s.ourName };
    if (s.styleCode) map.set(s.styleCode.toUpperCase(), entry);
    if (s.ourName) map.set(s.ourName.toUpperCase(), entry);
    if (s.distributorName) map.set(s.distributorName.toUpperCase(), entry);
  }
  return map;
}

export const distributorImportRouter = router({
  /**
   * Master catalog export: one row per cabinet with the review columns
   * (code, description, category, subCategory, dims, doors/drawers, graphicType,
   * and how many supply lines carry it). Returns a CSV string + a filename.
   */
  catalogExport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { csv: "", filename: "master-catalog.csv", count: 0 };

    const rows = await db
      .select({
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
        linesWithSku: sql<number>`count(distinct ${distributorSkus.distributorId})`,
      })
      .from(cabinets)
      .leftJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
      .groupBy(cabinets.id)
      .orderBy(cabinets.category, cabinets.masterCode);

    const csv = buildCatalogCsv(rows as CatalogExportRow[]);
    const date = new Date().toISOString().slice(0, 10);
    return { csv, filename: `cabinet-dealz-master-catalog-${date}.csv`, count: rows.length };
  }),

  /** Active distributors (lines) for the import picker + branding editor. */
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: distributors.id,
        code: distributors.code,
        name: distributors.name,
        initials: distributors.initials,
        brandName: distributors.brandName,
        brandInitials: distributors.brandInitials,
        whiteLabel: distributors.whiteLabel,
        displayMode: distributors.displayMode,
        seriesName: distributors.seriesName,
        isActive: distributors.isActive,
        leadTimeDays: distributors.leadTimeDays,
        warehouseZips: distributors.warehouseZips,
        orderEmail: distributors.orderEmail,
        ccEmails: distributors.ccEmails,
        fulfillmentMode: distributors.fulfillmentMode,
        netsuiteAccountId: distributors.netsuiteAccountId,
        pickupEnabled: distributors.pickupEnabled,
        pickupZip: distributors.pickupZip,
        pickupAddress: distributors.pickupAddress,
        pickupRadiusMiles: distributors.pickupRadiusMiles,
      })
      .from(distributors)
      .orderBy(distributors.name);
  }),

  /**
   * Update the fulfillment / order-routing + pickup settings for one supply
   * line. All fields optional so the admin form can patch a subset. Emails are
   * lightly validated; blank strings clear the field.
   */
  updateFulfillment: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        orderEmail: z.string().trim().max(320).optional(),
        ccEmails: z.string().trim().max(1024).optional(),
        fulfillmentMode: z.enum(["email", "netsuite_email", "netsuite_api"]).optional(),
        netsuiteAccountId: z.string().trim().max(64).optional(),
        pickupEnabled: z.boolean().optional(),
        pickupZip: z.string().trim().max(16).optional(),
        pickupAddress: z.string().trim().max(512).optional(),
        pickupRadiusMiles: z.number().int().min(1).max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });

      const normEmail = (v: string | undefined): string | null | undefined => {
        if (v === undefined) return undefined;
        const t = v.trim();
        return t.length ? t : null;
      };
      // Validate a plain single email when provided (non-empty).
      const oe = normEmail(input.orderEmail);
      if (typeof oe === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(oe)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order email is not a valid address." });
      }

      const patch: Partial<typeof distributors.$inferInsert> = {};
      if (oe !== undefined) patch.orderEmail = oe;
      if (input.ccEmails !== undefined) patch.ccEmails = normEmail(input.ccEmails) ?? null;
      if (input.fulfillmentMode !== undefined) patch.fulfillmentMode = input.fulfillmentMode;
      if (input.netsuiteAccountId !== undefined)
        patch.netsuiteAccountId = normEmail(input.netsuiteAccountId) ?? null;
      if (input.pickupEnabled !== undefined) patch.pickupEnabled = input.pickupEnabled;
      if (input.pickupZip !== undefined) patch.pickupZip = input.pickupZip.trim() || null;
      if (input.pickupAddress !== undefined) patch.pickupAddress = input.pickupAddress.trim() || null;
      if (input.pickupRadiusMiles !== undefined) patch.pickupRadiusMiles = input.pickupRadiusMiles;

      if (Object.keys(patch).length === 0) return { id: input.distributorId, updated: false };
      await db.update(distributors).set(patch).where(eq(distributors.id, input.distributorId));
      return { id: input.distributorId, updated: true };
    }),

  /**
   * White-label a cabinet line from the Admin panel (no direct DB edits).
   */
  setBranding: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        displayMode: z.enum(["neutral", "branded", "series"]),
        label: z.string().trim().min(1).max(128),
        initials: z.string().trim().max(8).optional(),
        seriesName: z.string().trim().max(128).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });

      const [row] = await db
        .select({ id: distributors.id, name: distributors.name })
        .from(distributors)
        .where(eq(distributors.id, input.distributorId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Line not found" });

      const initials =
        (input.initials && input.initials.trim()) ||
        input.label.trim().slice(0, 2).toUpperCase();

      const patch: Partial<typeof distributors.$inferInsert> = {
        displayMode: input.displayMode,
      };

      if (input.displayMode === "branded") {
        patch.brandName = input.label.trim();
        patch.brandInitials = initials;
        patch.whiteLabel = false;
      } else if (input.displayMode === "series") {
        patch.seriesName = input.label.trim();
        patch.whiteLabel = true;
      } else {
        patch.name = input.label.trim();
        patch.initials = initials;
        patch.whiteLabel = true;
      }

      await db.update(distributors).set(patch).where(eq(distributors.id, input.distributorId));
      return { id: input.distributorId, ...patch };
    }),

  /** Door styles for a given distributor (used to map pricing rows to a style). */
  adminStyles: adminProcedure
    .input(z.object({ distributorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: doorStyles.id,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
        })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, input.distributorId))
        .orderBy(doorStyles.ourName);
    }),

  /** The CSV template distributors fill in. */
  importTemplate: adminProcedure.query(() => ({ csv: IMPORT_TEMPLATE_CSV })),

  /**
   * Dry-run: parse the pasted CSV, validate it, and diff each row against the
   * existing catalog so the admin sees exactly what will be created/updated.
   *
   * Cabinet lookup: the row's code is matched against masterCode first, then
   * against all alias fields (sku, vendorSku, altSku1/2/3).
   *
   * Door style lookup: the row's styleCode value is matched against the
   * selected distributor's door styles (styleCode, ourName, distributorName).
   * If styleId is provided in input it overrides per-row style resolution.
   *
   * No database writes happen here.
   */
  importPreview: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        /** Override style for all rows. If omitted, each row's styleCode column is used. */
        styleId: z.number().optional(),
        csv: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const parsed = parseDistributorCsv(input.csv);
      const { fatalErrors, rowResults } = validateImport(parsed);
      const hasPricing =
        parsed.columns.includes("listPrice") ||
        parsed.columns.includes("yourCost");
      const hasStyleCol = parsed.columns.includes("styleCode");

      // If pricing is present and no style override and no styleCode column, warn.
      if (hasPricing && !input.styleId && !hasStyleCol) {
        fatalErrors.push(
          "Pricing columns detected — either add a Door Style column to the spreadsheet or choose a door style from the dropdown."
        );
      }

      // Build alias map for all codes in the file.
      const codes = parsed.rows
        .map((r) => (r.cells.masterCode ?? "").trim())
        .filter(Boolean);
      const aliasMap = await buildAliasMap(db, codes);

      // Build style map for this distributor (for per-row style resolution).
      const styleMap = await buildStyleMap(db, input.distributorId);

      const rows: PreviewRow[] = parsed.rows.map((row, i) => {
        const v = rowResults[i];
        const code = (row.cells.masterCode ?? "").trim();
        const found = aliasMap.get(code.toUpperCase());
        const matchHow: PreviewRow["matchHow"] = !found
          ? "none"
          : found.masterCode.toUpperCase() === code.toUpperCase()
          ? "exact"
          : "alias";

        // Resolve door style for this row.
        let resolvedStyleId: number | null = input.styleId ?? null;
        let resolvedStyleName: string | null = null;
        if (!resolvedStyleId && row.cells.styleCode) {
          const styleHit = styleMap.get(row.cells.styleCode.toUpperCase());
          if (styleHit) {
            resolvedStyleId = styleHit.id;
            resolvedStyleName = styleHit.ourName;
          }
        } else if (resolvedStyleId) {
          // Find the name for the override style.
          const styleEntries = Array.from(styleMap.values());
          const hit = styleEntries.find((s) => s.id === resolvedStyleId);
          if (hit) resolvedStyleName = hit.ourName;
        }

        const fields: string[] = [];
        if (row.cells.description) fields.push("description");
        if (normalizeCategory(row.cells.category)) fields.push("category");
        if (row.cells.subCategory) fields.push("subCategory");
        if (parseDimension(row.cells.width)) fields.push("width");
        if (parseDimension(row.cells.height)) fields.push("height");
        if (parseDimension(row.cells.depth)) fields.push("depth");

        const priceTouched = hasPricing && Boolean(resolvedStyleId) && Boolean(found);

        let action: PreviewRow["action"];
        if (!v.ok) action = "error";
        else if (!found) action = "create-info";
        else if (fields.length > 0) action = "update-info";
        else action = "price-only";

        // Creating a brand-new cabinet requires a description + a category.
        const errors = [...v.errors];
        if (action === "create-info") {
          if (!row.cells.description)
            errors.push("New item needs a Description to be created.");
          if (!normalizeCategory(row.cells.category))
            errors.push(
              "New item needs a valid Category (Base/Wall/Tall/ADA/Vanity/Accessory)."
            );
        }
        const warnings = [...(v.warnings ?? [])];
        if (hasPricing && !found && v.ok)
          warnings.push(
            "Pricing skipped: cabinet not found in catalog (will be created first, then prices applied on next import)."
          );
        if (hasPricing && found && !resolvedStyleId)
          warnings.push(
            row.cells.styleCode
              ? `Door style "${row.cells.styleCode}" not found for this distributor — pricing skipped.`
              : "No door style specified for this row — pricing skipped."
          );
        if (matchHow === "alias")
          warnings.push(`Matched via alias → platform code: ${found!.masterCode}`);

        return {
          rowNumber: row.rowNumber,
          masterCode: code,
          resolvedMasterCode: found?.masterCode ?? null,
          matchHow,
          resolvedStyleName,
          action: errors.length ? "error" : action,
          description: row.cells.description ?? found?.description ?? null,
          category:
            normalizeCategory(row.cells.category) ?? found?.category ?? null,
          fields,
          priceTouched,
          errors,
          warnings,
        };
      });

      const summary = {
        total: rows.length,
        toCreate: rows.filter((r) => r.action === "create-info").length,
        toUpdate: rows.filter((r) => r.action === "update-info").length,
        priceOnly: rows.filter((r) => r.action === "price-only").length,
        errors: rows.filter((r) => r.action === "error").length,
        aliasMatched: rows.filter((r) => r.matchHow === "alias").length,
      };

      return {
        columns: parsed.columns,
        unknownHeaders: parsed.unknownHeaders,
        hasPricing,
        hasStyleCol,
        fatalErrors,
        summary,
        rows,
      };
    }),

  /**
   * Commit the import: upsert cabinet info (create new / update existing) and,
   * when a style is resolvable (per-row styleCode column or styleId override),
   * upsert the per-style SKU price for the chosen distributor.
   *
   * Cabinet lookup uses alias matching (sku, vendorSku, altSku1/2/3, masterCode).
   * Door style lookup uses the row's styleCode column against the distributor's styles,
   * falling back to the styleId override if provided.
   *
   * Rows with validation errors are skipped.
   */
  importCommit: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        /** Override style for all rows. If omitted, each row's styleCode column is used. */
        styleId: z.number().optional(),
        csv: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const dist = await db
        .select({ id: distributors.id })
        .from(distributors)
        .where(eq(distributors.id, input.distributorId))
        .limit(1);
      if (dist.length === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown distributor." });

      const parsed = parseDistributorCsv(input.csv);
      const { rowResults } = validateImport(parsed);
      const hasPricing =
        parsed.columns.includes("listPrice") ||
        parsed.columns.includes("yourCost");

      // Build lookup maps once.
      const codes = parsed.rows
        .map((r) => (r.cells.masterCode ?? "").trim())
        .filter(Boolean);
      const aliasMap = await buildAliasMap(db, codes);
      const styleMap = await buildStyleMap(db, input.distributorId);

      let created = 0;
      let updated = 0;
      let priced = 0;
      let skipped = 0;

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const v = rowResults[i];
        const code = (row.cells.masterCode ?? "").trim();
        if (!v.ok || !code) {
          skipped++;
          continue;
        }

        // Resolve cabinet via alias map.
        const found = aliasMap.get(code.toUpperCase());

        // Resolve door style: per-row column first, then override.
        let resolvedStyleId: number | null = input.styleId ?? null;
        if (!resolvedStyleId && row.cells.styleCode) {
          const styleHit = styleMap.get(row.cells.styleCode.toUpperCase());
          if (styleHit) resolvedStyleId = styleHit.id;
        }

        const category = normalizeCategory(row.cells.category);
        const width = parseDimension(row.cells.width);
        const height = parseDimension(row.cells.height);
        const depth = parseDimension(row.cells.depth);

        let cabinetId: number;
        if (!found) {
          // Create requires description + category.
          if (!row.cells.description || !category) {
            skipped++;
            continue;
          }
          const res = await db.insert(cabinets).values({
            masterCode: code,
            description: row.cells.description,
            descriptionSource: "Distributor Import",
            category,
            subCategory: row.cells.subCategory ?? null,
            width: width != null ? String(width) : null,
            height: height != null ? String(height) : null,
            depth: depth != null ? String(depth) : null,
            isActive: true,
          });
          cabinetId = (res as unknown as [{ insertId: number }])[0].insertId;
          // Add to alias map so subsequent rows with the same code resolve correctly.
          aliasMap.set(code.toUpperCase(), { id: cabinetId, masterCode: code, description: row.cells.description, category });
          created++;
        } else {
          cabinetId = found.id;
          const patch: Record<string, unknown> = {};
          if (row.cells.description) patch.description = row.cells.description;
          if (category) patch.category = category;
          if (row.cells.subCategory) patch.subCategory = row.cells.subCategory;
          if (width != null) patch.width = String(width);
          if (height != null) patch.height = String(height);
          if (depth != null) patch.depth = String(depth);
          if (Object.keys(patch).length > 0) {
            await db
              .update(cabinets)
              .set(patch)
              .where(eq(cabinets.id, cabinetId));
            updated++;
          }
        }

        // Optional pricing upsert (needs a resolved style).
        if (hasPricing && resolvedStyleId) {
          const listPrice = parseMoney(row.cells.listPrice);
          const yourCost = parseMoney(row.cells.yourCost);
          if (
            (listPrice != null && !Number.isNaN(listPrice)) ||
            (yourCost != null && !Number.isNaN(yourCost))
          ) {
            const sku = await db
              .select({ id: distributorSkus.id })
              .from(distributorSkus)
              .where(
                and(
                  eq(distributorSkus.cabinetId, cabinetId),
                  eq(distributorSkus.distributorId, input.distributorId),
                  eq(distributorSkus.styleId, resolvedStyleId)
                )
              )
              .limit(1);
            const pricePatch: Record<string, unknown> = {};
            if (listPrice != null && !Number.isNaN(listPrice))
              pricePatch.listPrice = String(listPrice);
            if (yourCost != null && !Number.isNaN(yourCost))
              pricePatch.yourCost = String(yourCost);
            if (sku.length > 0) {
              await db
                .update(distributorSkus)
                .set(pricePatch)
                .where(eq(distributorSkus.id, sku[0].id));
              priced++;
            } else {
              await db.insert(distributorSkus).values({
                cabinetId,
                distributorId: input.distributorId,
                styleId: resolvedStyleId,
                platformSku: `${found?.masterCode ?? code}-S${resolvedStyleId}-D${input.distributorId}`,
                distributorSku: code,
                listPrice:
                  listPrice != null && !Number.isNaN(listPrice)
                    ? String(listPrice)
                    : null,
                yourCost:
                  yourCost != null && !Number.isNaN(yourCost)
                    ? String(yourCost)
                    : null,
                isAvailable: true,
                isPublished: false, // new prices start unpublished for review
              });
              priced++;
            }
          }
        }
      }

      return { created, updated, priced, skipped };
    }),

  // ─── Quick-create helpers ──────────────────────────────────────────────────
  addDistributor: adminProcedure
    .input(z.object({ name: z.string(), brandName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const code = input.name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
      const [result] = await db.insert(distributors).values({
        name: input.name,
        code,
        initials: code.slice(0, 2),
        brandName: input.brandName ?? input.name,
        costMultiplier: "0.30",
        baseMultiplier: "0.30",
      });
      return { id: (result as any).insertId as number, name: input.name, brandName: input.brandName ?? input.name, ok: true };
    }),

  addDoorStyle: adminProcedure
    .input(z.object({ distributorId: z.number(), ourName: z.string(), styleCode: z.string(), distributorName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(doorStyles).values({
        distributorId: input.distributorId,
        ourName: input.ourName,
        styleCode: input.styleCode,
        distributorName: input.distributorName ?? input.ourName,
        isActive: true,
      });
      return { id: (result as any).insertId as number, ourName: input.ourName, ok: true };
    }),

  // ─── XLSX column-mapping import ─────────────────────────────────────────────

  /**
   * Step 1: Parse an uploaded XLSX/CSV file and return sheet names + detected
   * column headers with auto-suggested roles.
   *
   * Role detection heuristics (case-insensitive):
   *   sku       → Item Code, SKU, Code, Part #, Model, Item
   *   category  → Category
   *   subCat    → Sub-Category, Sub Category, SubCategory
   *   description → Description, Desc, Name
   *   dimensions  → Dimensions, Dim, Size, W×H×D
   *   priceStyle  → any column whose header contains a style code fragment
   *                 (e.g. "ASP\nAspen White" → styleCode=ASP, label=Aspen White)
   *   ignore    → #, Min Price, Max Price, Available Styles, Notes
   */
  parseXlsxColumns: adminProcedure
    .input(z.object({
      fileBase64: z.string(),
      filename: z.string(),
      distributorId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Decode base64 → buffer → workbook
      const buf = Buffer.from(input.fileBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });

      // Load this distributor's door styles for style-column matching
      const distStyles = await db
        .select({ id: doorStyles.id, styleCode: doorStyles.styleCode, ourName: doorStyles.ourName, distributorName: doorStyles.distributorName })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, input.distributorId));

      // Build a set of known style codes (upper) for quick lookup
      const styleCodeSet = new Set(distStyles.map((s) => s.styleCode.toUpperCase()));

      const IGNORE_PATTERNS = /^(#|min price|max price|available styles|notes?)$/i;
      const SKU_PATTERNS = /item.?code|sku|part.?#|model|^item$|^code$|^sku$/i;
      const CAT_PATTERNS = /^category$/i;
      const SUBCAT_PATTERNS = /sub.?cat/i;
      const DESC_PATTERNS = /description|^desc$|^name$/i;
      const DIM_PATTERNS = /dimension|^dim$|^size$|w.?h.?d/i;
      const ASSEMBLE_PATTERNS = /^assemble$|^assembled$|^assembly$/i;

      const sheets = wb.SheetNames.map((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];
        if (rows.length === 0) return { name: sheetName, headers: [], columns: [] };

        const rawHeaders = rows[0].map((h) => String(h ?? ""));
        const sampleRows = rows.slice(1, 4);

        const columns = rawHeaders.map((rawHeader, colIdx) => {
          // Normalize: strip newlines, trim
          const normalized = rawHeader.replace(/\n/g, " ").trim();
          const upper = normalized.toUpperCase();

          // Detect role
          let role: string = "ignore";
          let styleId: number | null = null;
          let styleCode: string | null = null;
          let styleLabel: string | null = null;

          if (IGNORE_PATTERNS.test(normalized)) {
            role = "ignore";
          } else if (SKU_PATTERNS.test(normalized)) {
            role = "sku";
          } else if (CAT_PATTERNS.test(normalized)) {
            role = "category";
          } else if (SUBCAT_PATTERNS.test(normalized)) {
            role = "subCategory";
          } else if (DESC_PATTERNS.test(normalized)) {
            role = "description";
          } else if (DIM_PATTERNS.test(normalized)) {
            role = "dimensions";
          } else if (ASSEMBLE_PATTERNS.test(normalized)) {
            role = "assemble";
          } else {
            // Check if this header contains a known style code
            // Header format: "ASP\nAspen White" or "ASP - Aspen White" or just "ASP"
            const parts = rawHeader.split(/\n|\s*[-–]\s*/);
            const firstPart = (parts[0] ?? "").trim().toUpperCase();
            const restPart = parts.slice(1).join(" ").trim();

            if (styleCodeSet.has(firstPart)) {
              const match = distStyles.find((s) => s.styleCode.toUpperCase() === firstPart);
              if (match) {
                role = "priceStyle";
                styleId = match.id;
                styleCode = match.styleCode;
                styleLabel = match.ourName || match.distributorName;
              }
            } else {
              // Try matching against distributorName
              const nameMatch = distStyles.find(
                (s) =>
                  s.distributorName.toUpperCase() === upper ||
                  s.ourName.toUpperCase() === upper
              );
              if (nameMatch) {
                role = "priceStyle";
                styleId = nameMatch.id;
                styleCode = nameMatch.styleCode;
                styleLabel = nameMatch.ourName || nameMatch.distributorName;
              }
            }
          }

          // Sample values from first 3 data rows
          const sampleValues = sampleRows
            .map((r) => String(r[colIdx] ?? "").trim())
            .filter(Boolean)
            .slice(0, 3);

          return {
            colIdx,
            rawHeader,
            label: normalized,
            role,
            styleId,
            styleCode,
            styleLabel,
            sampleValues,
          };
        });

        return { name: sheetName, headers: rawHeaders, columns };
      });

      // Also return the list of distributor styles so the UI can let admin
      // manually assign unmatched columns to a style.
      return {
        sheets,
        distributorStyles: distStyles.map((s) => ({
          id: s.id,
          styleCode: s.styleCode,
          ourName: s.ourName,
          distributorName: s.distributorName,
        })),
      };
    }),

  /**
   * Step 2: Commit the XLSX import using the admin-confirmed column mapping.
   *
   * columnMapping is an array of { colIdx, role, styleId? } objects.
   * Roles: "sku" | "category" | "subCategory" | "description" | "dimensions" | "priceStyle" | "ignore"
   *
   * For each data row:
   *   1. Extract the SKU from the sku column.
   *   2. Resolve the cabinet via alias map (masterCode, sku, vendorSku, altSku1-3).
   *   3. If not found and description+category present → create new cabinet.
   *   4. For each priceStyle column with a non-null, non-N/A value → upsert distributor_skus row.
   *      Upsert = update if (cabinetId, distributorId, styleId) exists, else insert.
   *
   * dryRun=true returns a preview without writing to DB.
   */
  importWithMapping: adminProcedure
    .input(z.object({
      fileBase64: z.string(),
      filename: z.string(),
      sheetName: z.string(),
      distributorId: z.number(),
      columnMapping: z.array(z.object({
        colIdx: z.number(),
        role: z.enum(["sku", "category", "subCategory", "description", "dimensions", "priceStyle", "assemble", "ignore"]),
        styleId: z.number().optional(),
      })),
      dryRun: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Decode and parse XLSX
      const buf = Buffer.from(input.fileBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[input.sheetName];
      if (!ws) throw new TRPCError({ code: "BAD_REQUEST", message: `Sheet "${input.sheetName}" not found.` });

      const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null }) as (string | number | null)[][];
      const dataRows = allRows.slice(1).filter((r) => r.some((c) => c != null && String(c).trim() !== ""));

      // Load this distributor's door styles for display labels in preview rows
      const distStyles = await db
        .select({ id: doorStyles.id, styleCode: doorStyles.styleCode, ourName: doorStyles.ourName })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, input.distributorId));

      // Build column index maps
      const skuCol = input.columnMapping.find((c) => c.role === "sku")?.colIdx ?? -1;
      const catCol = input.columnMapping.find((c) => c.role === "category")?.colIdx ?? -1;
      const subCatCol = input.columnMapping.find((c) => c.role === "subCategory")?.colIdx ?? -1;
      const descCol = input.columnMapping.find((c) => c.role === "description")?.colIdx ?? -1;
      const dimCol = input.columnMapping.find((c) => c.role === "dimensions")?.colIdx ?? -1;
      const assembleCol = input.columnMapping.find((c) => c.role === "assemble")?.colIdx ?? -1;
      const priceCols = input.columnMapping.filter((c) => c.role === "priceStyle" && c.styleId != null);

      // SKU-prefix → category inference (used when no category column is present)
      function inferCategoryFromSku(sku: string): string | null {
        const u = sku.toUpperCase();
        if (u.startsWith("ADA-")) return "ADA";
        if (u.startsWith("3VDB") || u.startsWith("2VDB") || u.startsWith("VDB") || u.startsWith("VS") || u.startsWith("VSD") || u.startsWith("WD")) return "Vanity";
        if (/^(W|AW|BW|EW|OW|UW)\d/.test(u)) return "Wall";
        if (/^(T|P|U|TP)\d/.test(u) || u.startsWith("TALL") || u.startsWith("PANTRY") || u.startsWith("UTIL")) return "Tall";
        if (/^(B|DB|BBC|BEC|BES|BFH|BT|SB|SINK|CB|FB|LB|RB|OB|UB)\d/.test(u) || /^(2DB|3DB|4DB)/.test(u)) return "Base";
        return null;
      }

      // Extract dimensions embedded in description: "12"W x 34-1/2"H x 24"D"
      function parseDimsFromDesc(desc: string | null | undefined): { width: string | null; height: string | null; depth: string | null } {
        if (!desc) return { width: null, height: null, depth: null };
        // Match patterns like: 12"W x 34-1/2"H x 24"D  or  12W x 34.5H x 24D
        const m = desc.match(/(\d[\d\s\-\/\.]*?)(?:")?\s*W\s*[xX×]\s*(\d[\d\s\-\/\.]*?)(?:")?\s*H\s*[xX×]\s*(\d[\d\s\-\/\.]*?)(?:")?\s*D/i);
        if (m) return { width: m[1].trim(), height: m[2].trim(), depth: m[3].trim() };
        return { width: null, height: null, depth: null };
      }

      if (skuCol === -1) throw new TRPCError({ code: "BAD_REQUEST", message: "No SKU column mapped." });

      // Category normalisation: map distributor category names → platform categories
      const CAT_MAP: Record<string, string> = {
        "wall cabinets": "Wall",
        "wall": "Wall",
        "base cabinets": "Base",
        "base": "Base",
        "tall cabinets": "Tall",
        "tall": "Tall",
        "pantry": "Tall",
        "utility": "Tall",
        "vanity": "Vanity",
        "ada": "ADA",
        "accessory": "Accessory",
        "accessories": "Accessory",
      };
      function normalCat(raw: string | null | undefined): string | null {
        if (!raw) return null;
        return CAT_MAP[raw.toLowerCase().trim()] ?? null;
      }

      // Parse "9x30x12" or "9 x 30 x 12" → { width, height, depth }
      function parseDims(raw: string | null | undefined): { width: string | null; height: string | null; depth: string | null } {
        if (!raw) return { width: null, height: null, depth: null };
        const parts = String(raw).split(/[x×\s]+/).map((p) => p.trim()).filter(Boolean);
        return {
          width: parts[0] ?? null,
          height: parts[1] ?? null,
          depth: parts[2] ?? null,
        };
      }

      // Collect all SKU codes to build alias map
      const codes = dataRows
        .map((r) => String(r[skuCol] ?? "").trim())
        .filter(Boolean);
      const aliasMap = await buildAliasMap(db, codes);

      let created = 0;
      let updated = 0;
      let priced = 0;
      let skipped = 0;
      let aliasMatched = 0;
      const unmatchedCodes: string[] = [];
      const previewRows: Array<{
        rowNum: number;
        code: string;
        resolvedCode: string | null;
        matchHow: string;
        action: string;
        stylesPriced: number;
        warnings: string[];
        // Validation fields
        severity: "ok" | "warning" | "error";
        issues: Array<{ field: string; message: string; severity: "warning" | "error" }>;
        dimsParsed: boolean;
        missingPriceCount: number;
        invalidPriceCount: number;
        stylePrices: Array<{ styleId: number; styleCode: string; price: number | null; raw: string; valid: boolean }>;
      }> = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const code = String(row[skuCol] ?? "").trim();
        if (!code) { skipped++; continue; }

        const found = aliasMap.get(code.toUpperCase());
        const matchHow = !found ? "none" : found.masterCode.toUpperCase() === code.toUpperCase() ? "exact" : "alias";
        if (matchHow === "alias") aliasMatched++;

        const rawCat = catCol >= 0 ? String(row[catCol] ?? "").trim() : null;
        const description = descCol >= 0 ? String(row[descCol] ?? "").trim() || null : null;
        // Category: explicit column first, then SKU-prefix inference
        const category = normalCat(rawCat) ?? inferCategoryFromSku(code);
        const subCategory = subCatCol >= 0 ? String(row[subCatCol] ?? "").trim() || null : null;
        // Dimensions: explicit dim column first, then extract from description
        const dims = dimCol >= 0
          ? parseDims(String(row[dimCol] ?? ""))
          : parseDimsFromDesc(description);
        // Assemble flag
        const assembleVal = assembleCol >= 0 ? String(row[assembleCol] ?? "").trim() : null;
        const isAssembled = assembleVal === "1" || /^(yes|true|y)$/i.test(assembleVal ?? "");

        const warnings: string[] = [];
        const issues: Array<{ field: string; message: string; severity: "warning" | "error" }> = [];
        let cabinetId: number;
        let action = "price-only";

        // Validate dimensions
        const dimsParsed = !!(dims.width || dims.height || dims.depth);
        const hasDimSource = dimCol >= 0 || descCol >= 0;
        if (hasDimSource && !dimsParsed) {
          issues.push({ field: "dimensions", message: "Dimensions could not be parsed", severity: "warning" });
        }

        if (!found) {
          if (!description || !category) {
            unmatchedCodes.push(code);
            warnings.push("No match — needs Description + Category to create");
            if (!input.dryRun) { skipped++; }
            issues.push({ field: "sku", message: `SKU "${code}" not found — needs Description + Category to create new cabinet`, severity: "error" });
            previewRows.push({ rowNum: i + 2, code, resolvedCode: null, matchHow: "none", action: "error", stylesPriced: 0, warnings, severity: "error", issues, dimsParsed: false, missingPriceCount: priceCols.length, invalidPriceCount: 0, stylePrices: [] });
            continue;
          }
          action = "create";
          if (!input.dryRun) {
            const res = await db.insert(cabinets).values({
              masterCode: code,
              description,
              descriptionSource: "Distributor Import",
              category,
              subCategory,
              width: dims.width,
              height: dims.height,
              depth: dims.depth,
              isActive: true,
              ...(assembleCol >= 0 ? { isAssembled } : {}),
            });
            cabinetId = (res as unknown as [{ insertId: number }])[0].insertId;
            aliasMap.set(code.toUpperCase(), { id: cabinetId, masterCode: code, description, category });
            created++;
          } else {
            cabinetId = -1;
          }
        } else {
          cabinetId = found.id;
          const patch: Record<string, unknown> = {};
          if (description) patch.description = description;
          if (category) patch.category = category;
          if (subCategory) patch.subCategory = subCategory;
          if (dims.width) patch.width = dims.width;
          if (dims.height) patch.height = dims.height;
          if (dims.depth) patch.depth = dims.depth;
          if (assembleCol >= 0) patch.isAssembled = isAssembled;
          if (Object.keys(patch).length > 0) {
            action = "update";
            if (!input.dryRun) {
              await db.update(cabinets).set(patch).where(eq(cabinets.id, cabinetId));
              updated++;
            }
          }
        }

        // Price columns — one upsert per style column
        let stylesPriced = 0;
        let missingPriceCount = 0;
        let invalidPriceCount = 0;
        const stylePrices: Array<{ styleId: number; styleCode: string; price: number | null; raw: string; valid: boolean }> = [];
        for (const pc of priceCols) {
          const rawVal = row[pc.colIdx];
          const strVal = String(rawVal ?? "").trim();
          // Find the style code for display
          const styleEntry = distStyles.find((s) => s.id === pc.styleId);
          const styleCode = styleEntry?.styleCode ?? String(pc.styleId);
          if (!strVal || strVal.toUpperCase() === "N/A" || strVal === "-") {
            missingPriceCount++;
            stylePrices.push({ styleId: pc.styleId!, styleCode, price: null, raw: strVal, valid: false });
            continue;
          }
          const price = parseFloat(strVal);
          if (isNaN(price) || price <= 0) {
            invalidPriceCount++;
            issues.push({ field: `price:${styleCode}`, message: `Invalid price "${strVal}" for style ${styleCode}`, severity: "error" });
            stylePrices.push({ styleId: pc.styleId!, styleCode, price: null, raw: strVal, valid: false });
            continue;
          }
          stylePrices.push({ styleId: pc.styleId!, styleCode, price, raw: strVal, valid: true });

          stylesPriced++;
          if (!input.dryRun && cabinetId > 0) {
            // Check for existing row
            const existing = await db
              .select({ id: distributorSkus.id })
              .from(distributorSkus)
              .where(
                and(
                  eq(distributorSkus.cabinetId, cabinetId),
                  eq(distributorSkus.distributorId, input.distributorId),
                  eq(distributorSkus.styleId, pc.styleId!)
                )
              )
              .limit(1);

            if (existing.length > 0) {
              // Update — only update listPrice (preserve yourCost if already set)
              await db
                .update(distributorSkus)
                .set({ listPrice: String(price) })
                .where(eq(distributorSkus.id, existing[0].id));
            } else {
              // Insert new SKU row
              const platformSku = `${found?.masterCode ?? code}-S${pc.styleId}-D${input.distributorId}`;
              await db.insert(distributorSkus).values({
                cabinetId,
                distributorId: input.distributorId,
                styleId: pc.styleId!,
                platformSku,
                distributorSku: code,
                listPrice: String(price),
                isAvailable: true,
                isPublished: false, // start unpublished for review
              });
            }
            priced++;
          }
        }

        // Determine overall row severity
        const hasErrors = issues.some((i) => i.severity === "error") || matchHow === "none";
        const hasWarnings = issues.some((i) => i.severity === "warning") || missingPriceCount > 0;
        const severity: "ok" | "warning" | "error" = hasErrors ? "error" : hasWarnings ? "warning" : "ok";

        previewRows.push({
          rowNum: i + 2,
          code,
          resolvedCode: found?.masterCode ?? null,
          matchHow,
          action,
          stylesPriced,
          warnings,
          severity,
          issues,
          dimsParsed,
          missingPriceCount,
          invalidPriceCount,
          stylePrices,
        });
      }

      const errorCount = previewRows.filter((r) => r.severity === "error").length;
      const warningCount = previewRows.filter((r) => r.severity === "warning").length;

      return {
        dryRun: input.dryRun ?? false,
        created,
        updated,
        priced,
        skipped,
        aliasMatched,
        unmatchedCount: unmatchedCodes.length,
        unmatchedCodes: unmatchedCodes.slice(0, 50),
        errorCount,
        warningCount,
        previewRows: input.dryRun ? previewRows.slice(0, 200) : [],
      };
    }),

  /**
   * Convert a PDF pricing sheet (base64-encoded) to an XLSX file.
   * Uses the server/scripts/pdf_to_xlsx.py script via child_process.
   * Returns the XLSX as a base64 string plus metadata about what was extracted.
   */
  pdfToXlsx: adminProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      // Write PDF to a temp file
      const tmpDir = os.tmpdir();
      const pdfPath = path.join(tmpDir, `cabinet_pdf_${Date.now()}.pdf`);
      const xlsxPath = path.join(tmpDir, `cabinet_pdf_${Date.now()}_out.xlsx`);

      try {
        const pdfBuffer = Buffer.from(input.fileBase64, "base64");
        fs.writeFileSync(pdfPath, pdfBuffer);

        // Run the Python extraction script
        const scriptPath = path.join(__dirname, "../scripts/pdf_to_xlsx.py");
        const { stdout, stderr } = await execFileAsync("python3", [scriptPath, pdfPath, xlsxPath], {
          timeout: 60_000,
        });

        if (!fs.existsSync(xlsxPath)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `PDF conversion failed: ${stderr || stdout || "no output"}`,
          });
        }

        // Parse stdout for metadata: "Converted N rows, M style codes: [...]"
        const rowsMatch = stdout.match(/(\d+) rows/);
        const stylesMatch = stdout.match(/style codes: \[([^\]]+)\]/);
        const rowCount = rowsMatch ? parseInt(rowsMatch[1], 10) : 0;
        const styleCodes = stylesMatch
          ? stylesMatch[1].split(",").map((s) => s.trim().replace(/'/g, ""))
          : [];

        // Read the XLSX and return as base64
        const xlsxBuffer = fs.readFileSync(xlsxPath);
        const xlsxBase64 = xlsxBuffer.toString("base64");

        return {
          xlsxBase64,
          filename: input.filename.replace(/\.pdf$/i, ".xlsx"),
          rowCount,
          styleCodes,
        };
      } finally {
        // Clean up temp files
        try { fs.unlinkSync(pdfPath); } catch {}
        try { fs.unlinkSync(xlsxPath); } catch {}
      }
    }),
});
