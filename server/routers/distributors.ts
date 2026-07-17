import { z } from "zod";
import * as XLSX from "xlsx";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { distributors, cabinets, distributorSkus, doorStyles, codeAliases, importPendingSkus } from "../../drizzle/schema";
import {
  parseDistributorCsv,
  validateImport,
  parseMoney,
  parseDimension,
  VALID_CATEGORIES,
  IMPORT_TEMPLATE_CSV,
  NOT_AVAILABLE,
} from "@shared/distributorImport";
import { buildCatalogCsv, type CatalogExportRow } from "@shared/catalogExport";
import { normalizeCode } from "@shared/cabinetCodeMatch";

/** Per-row plan describing what the commit will do (no writes during preview). */
interface PreviewRow {
  rowNumber: number;
  masterCode: string;
  action: "create-info" | "update-info" | "price-only" | "error";
  matchConfidence: "exact" | "normalized" | "alias" | "none";
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

export const distributorImportRouter = router({
  /**
   * Master catalog export: one row per cabinet with the review columns
   * (code, description, category, subCategory, dims, doors/drawers, graphicType,
   * and how many supply lines carry it). Returns a CSV string + a filename.
   */
  catalogExport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { csv: "", filename: "master-catalog.csv", count: 0 };

    // Build a map of cabinetId → pipe-separated alias codes
    const aliasRows = await db
      .select({ cabinetId: codeAliases.cabinetId, rawCodeSample: codeAliases.rawCodeSample })
      .from(codeAliases);
    const aliasMap = new Map<number, string[]>();
    for (const a of aliasRows) {
      const arr = aliasMap.get(a.cabinetId) ?? [];
      arr.push(a.rawCodeSample);
      aliasMap.set(a.cabinetId, arr);
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
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        graphicType: cabinets.graphicType,
        linesWithSku: sql<number>`count(distinct ${distributorSkus.distributorId})`,
        imageUrl: cabinets.catalogImageUrl,
      })
      .from(cabinets)
      .leftJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
      .groupBy(cabinets.id)
      .orderBy(cabinets.category, cabinets.masterCode);

    const exportRows = rows.map((r) => ({
      ...r,
      aliases: (aliasMap.get(r.id) ?? []).join("|") || null,
    }));
    const csv = buildCatalogCsv(exportRows as CatalogExportRow[]);
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
   * Operator types the public-facing brand/label; we set the presentation
   * fields accordingly. displayMode drives what members actually see:
   *  - neutral : show `name`/`initials` (supplier identity hidden)
   *  - branded : show the real `brandName`/`brandInitials`
   *  - series  : show `seriesName` (e.g. "Cabinet Dealz Elegant Series")
   */
  setBranding: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        displayMode: z.enum(["neutral", "branded", "series"]),
        // The public label the operator typed (meaning depends on displayMode).
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
        // Show the real supplier identity.
        patch.brandName = input.label.trim();
        patch.brandInitials = initials;
        patch.whiteLabel = false;
      } else if (input.displayMode === "series") {
        // Show a Cabinet Dealz series name; keep supplier hidden.
        patch.seriesName = input.label.trim();
        patch.whiteLabel = true;
      } else {
        // neutral: show a plain neutral label (e.g. "Line A").
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
   * No database writes happen here.
   */
  importPreview: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        styleId: z.number().optional(), // required only if pricing columns present
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
      if (hasPricing && !input.styleId) {
        fatalErrors.push(
          "Pricing columns detected — choose which door style these prices apply to."
        );
      }

      // Build a full normalized lookup of all master cabinets + aliases for fuzzy matching.
      const allCabinets = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description, category: cabinets.category })
        .from(cabinets);
      const byNorm = new Map<string, typeof allCabinets[number]>();
      for (const c of allCabinets) {
        byNorm.set(normalizeCode(c.masterCode), c);
      }
      // Also load aliases so distributor SKU variants resolve automatically.
      const aliases = await db.select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId }).from(codeAliases);
      const aliasByCabinetId = new Map(allCabinets.map((c) => [c.id, c]));
      const byAlias = new Map<string, typeof allCabinets[number]>();
      for (const a of aliases) {
        const cab = aliasByCabinetId.get(a.cabinetId);
        if (cab) byAlias.set(a.rawCodeCanon, cab);
      }

      function findCabinet(rawCode: string): { cabinet: typeof allCabinets[number] | undefined; confidence: "exact" | "normalized" | "alias" | "none" } {
        const norm = normalizeCode(rawCode);
        const direct = byNorm.get(norm);
        if (direct) return { cabinet: direct, confidence: normalizeCode(direct.masterCode) === norm ? "exact" : "normalized" };
        const aliased = byAlias.get(norm);
        if (aliased) return { cabinet: aliased, confidence: "alias" };
        return { cabinet: undefined, confidence: "none" };
      }

      const rows: PreviewRow[] = parsed.rows.map((row, i) => {
        const v = rowResults[i];
        const code = (row.cells.masterCode ?? "").trim();
        const { cabinet: found, confidence: matchConfidence } = findCabinet(code);
        const fields: string[] = [];
        if (row.cells.description) fields.push("description");
        if (normalizeCategory(row.cells.category)) fields.push("category");
        if (row.cells.subCategory) fields.push("subCategory");
        if (parseDimension(row.cells.width)) fields.push("width");
        if (parseDimension(row.cells.height)) fields.push("height");
        if (parseDimension(row.cells.depth)) fields.push("depth");
        const priceTouched = hasPricing && Boolean(input.styleId) && Boolean(found);

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
        if (hasPricing && !found && v.ok)
          (v.warnings ||= []).push(
            "Pricing skipped: cabinet does not exist yet (create it first, then re-import prices)."
          );

        return {
          rowNumber: row.rowNumber,
          masterCode: found?.masterCode ?? code,
          action: errors.length ? "error" : action,
          matchConfidence,
          description: row.cells.description ?? found?.description ?? null,
          category:
            normalizeCategory(row.cells.category) ?? found?.category ?? null,
          fields,
          priceTouched,
          errors,
          warnings: [
            ...(v.warnings ?? []),
            ...(matchConfidence === "alias" ? [`Matched via alias: "${code}" → ${found?.masterCode}`] : []),
          ],
        };
      });

      const summary = {
        total: rows.length,
        toCreate: rows.filter((r) => r.action === "create-info").length,
        toUpdate: rows.filter((r) => r.action === "update-info").length,
        priceOnly: rows.filter((r) => r.action === "price-only").length,
        errors: rows.filter((r) => r.action === "error").length,
      };

      return {
        columns: parsed.columns,
        unknownHeaders: parsed.unknownHeaders,
        hasPricing,
        fatalErrors,
        summary,
        rows,
      };
    }),

  /**
   * Commit the import: upsert cabinet info (create new / update existing) and,
   * when a style + pricing columns are present, upsert the per-style SKU price
   * for the chosen distributor. Rows with errors are skipped.
   */
  importCommit: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        styleId: z.number().optional(),
        csv: z.string().min(1),
        // Optional per-row master code overrides: key = row index (0-based string), value = masterCode to use
        masterCodeOverrides: z.record(z.string(), z.string()).optional(),
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

      // Build fuzzy lookup for commit (same as preview).
      const allCabsCommit = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets);
      const byNormCommit = new Map<string, typeof allCabsCommit[number]>();
      for (const c of allCabsCommit) byNormCommit.set(normalizeCode(c.masterCode), c);
      const aliasesCommit = await db.select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId }).from(codeAliases);
      const aliasByCabIdCommit = new Map(allCabsCommit.map((c) => [c.id, c]));
      const byAliasCommit = new Map<string, typeof allCabsCommit[number]>();
      for (const a of aliasesCommit) {
        const cab = aliasByCabIdCommit.get(a.cabinetId);
        if (cab) byAliasCommit.set(a.rawCodeCanon, cab);
      }
      function resolveCode(rawCode: string): typeof allCabsCommit[number] | undefined {
        const norm = normalizeCode(rawCode);
        return byNormCommit.get(norm) ?? byAliasCommit.get(norm);
      }

      let created = 0;
      let updated = 0;
      let priced = 0;
      let skipped = 0;
      const newAliases: Array<{ rawCodeCanon: string; rawCodeSample: string; cabinetId: number }> = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const v = rowResults[i];
        const rawCode = (row.cells.masterCode ?? "").trim();
        if (!rawCode) { skipped++; continue; }

        // Apply per-row masterCode override if provided by the admin
        const overrideCode = input.masterCodeOverrides?.[String(i)];
        const effectiveCode = overrideCode ?? rawCode;

        // Fuzzy resolve: exact → normalized → alias (using effective code)
        const resolved = resolveCode(effectiveCode);
        const category = normalizeCategory(row.cells.category);
        const width = parseDimension(row.cells.width);
        const height = parseDimension(row.cells.height);
        const depth = parseDimension(row.cells.depth);

        let cabinetId: number;
        if (!resolved) {
          // Unknown code — only create if description + category provided
          if (!row.cells.description || !category) { skipped++; continue; }
          const res = await db.insert(cabinets).values({
            masterCode: normalizeCode(rawCode),
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
          created++;
        } else {
          cabinetId = resolved.id;
          // Save alias so future imports from this distributor resolve automatically
          const normRaw = normalizeCode(rawCode);
          if (normRaw !== normalizeCode(resolved.masterCode) && !byAliasCommit.has(normRaw)) {
            newAliases.push({ rawCodeCanon: normRaw, rawCodeSample: rawCode, cabinetId });
            byAliasCommit.set(normRaw, resolved); // prevent duplicate inserts in same batch
          }
          const patch: Record<string, unknown> = {};
          if (row.cells.description) patch.description = row.cells.description;
          if (category) patch.category = category;
          if (row.cells.subCategory) patch.subCategory = row.cells.subCategory;
          if (width != null) patch.width = String(width);
          if (height != null) patch.height = String(height);
          if (depth != null) patch.depth = String(depth);
          if (Object.keys(patch).length > 0) {
            await db.update(cabinets).set(patch).where(eq(cabinets.id, cabinetId));
            updated++;
          }
        }

        // Pricing upsert (needs a style)
        if (hasPricing && input.styleId) {
          const listPrice = parseMoney(row.cells.listPrice);
          const yourCost = parseMoney(row.cells.yourCost);
          // NA/X/blank = mark as not available
          const markUnavailable = listPrice === NOT_AVAILABLE || yourCost === NOT_AVAILABLE;
          if (markUnavailable) {
            await db.update(distributorSkus)
              .set({ isAvailable: false })
              .where(and(
                eq(distributorSkus.cabinetId, cabinetId),
                eq(distributorSkus.distributorId, input.distributorId),
                eq(distributorSkus.styleId, input.styleId)
              ));
            priced++;
            continue;
          }
          const lp = typeof listPrice === "number" && !Number.isNaN(listPrice) ? listPrice : null;
          const yc = typeof yourCost === "number" && !Number.isNaN(yourCost) ? yourCost : null;
          if (lp !== null || yc !== null) {
            const sku = await db
              .select({ id: distributorSkus.id })
              .from(distributorSkus)
              .where(and(
                eq(distributorSkus.cabinetId, cabinetId),
                eq(distributorSkus.distributorId, input.distributorId),
                eq(distributorSkus.styleId, input.styleId)
              ))
              .limit(1);
            const pricePatch: Record<string, unknown> = { isAvailable: true };
            if (lp !== null) pricePatch.listPrice = String(lp);
            if (yc !== null) pricePatch.yourCost = String(yc);
            if (sku.length > 0) {
              await db.update(distributorSkus).set(pricePatch).where(eq(distributorSkus.id, sku[0].id));
              priced++;
            } else {
              await db.insert(distributorSkus).values({
                cabinetId,
                distributorId: input.distributorId,
                styleId: input.styleId,
                platformSku: `${normalizeCode(rawCode)}-S${input.styleId}-D${input.distributorId}`,
                distributorSku: rawCode,
                listPrice: lp !== null ? String(lp) : null,
                yourCost: yc !== null ? String(yc) : null,
                isAvailable: true,
                isPublished: false,
              });
              priced++;
            }
          }
        }
      }

      // Persist newly learned aliases in bulk
      if (newAliases.length > 0) {
        for (const a of newAliases) {
          await db.insert(codeAliases).values(a).onDuplicateKeyUpdate({ set: { rawCodeSample: a.rawCodeSample } });
        }
      }

      return { created, updated, priced, skipped, aliasesLearned: newAliases.length };
    }),

  /**
   * Inline create a new distributor line from the import UI.
   * Creates a minimal distributor record; branding can be edited later.
   */
  addDistributor: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        brandName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Derive a short code from the name
      const code = input.name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6) || "DIST";
      const initials = input.name
        .split(/\s+/)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 4) || "D";
      const res = await db.insert(distributors).values({
        code,
        name: input.name.trim(),
        initials,
        brandName: input.brandName?.trim() ?? null,
        brandInitials: initials,
        isActive: true,
        whiteLabel: false,
        displayMode: "branded",
        fulfillmentMode: "email",
        costMultiplier: "1.00",
      });
      const id = (res as unknown as [{ insertId: number }])[0].insertId;
      return { id, name: input.name.trim(), code };
    }),

  /**
   * Inline create a new door style for a distributor from the import UI.
   */
  addDoorStyle: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        ourName: z.string().min(1).max(100),
        styleCode: z.string().min(1).max(40),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const res = await db.insert(doorStyles).values({
        distributorId: input.distributorId,
        styleCode: input.styleCode.trim(),
        ourName: input.ourName.trim(),
        distributorName: input.ourName.trim(),
        isFeatured: false,
      });
      const id = (res as unknown as [{ insertId: number }])[0].insertId;
      return { id, ourName: input.ourName.trim(), styleCode: input.styleCode.trim() };
    }),

  /**
   * Parse an uploaded XLSX/CSV file and return its sheet names and column
   * headers (plus a preview of the first 5 data rows) so the UI can present
   * a column-mapping step before committing the import.
   */
  parseXlsxColumns: adminProcedure
    .input(
      z.object({
        /** Base64-encoded XLSX or CSV file content */
        fileBase64: z.string().min(1),
        /** Original filename — used to decide whether to parse as CSV or XLSX */
        filename: z.string().default("upload.xlsx"),
      })
    )
    .mutation(async ({ input }) => {
      const isCsv = input.filename.toLowerCase().endsWith(".csv");
      let sheetNames: string[];
      let wb: XLSX.WorkBook;
      try {
        if (isCsv) {
          const text = Buffer.from(input.fileBase64, "base64").toString("utf-8");
          wb = XLSX.read(text, { type: "string" });
        } else {
          wb = XLSX.read(input.fileBase64, { type: "base64" });
        }
        sheetNames = wb.SheetNames;
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not parse the file. Make sure it is a valid .xlsx or .csv file." });
      }

      const sheets: Array<{
        name: string;
        headers: string[];
        previewRows: Array<Record<string, string>>;
      }> = [];

      for (const name of sheetNames) {
        const ws = wb.Sheets[name];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
        if (rows.length === 0) {
          sheets.push({ name, headers: [], previewRows: [] });
          continue;
        }
        const headers = Object.keys(rows[0]);
        const previewRows = rows.slice(0, 5).map((r) =>
          Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "")]))
        );
        sheets.push({ name, headers, previewRows });
      }

      return { sheets };
    }),

  /**
   * Import distributor prices (and optionally descriptions) from an XLSX/CSV
   * file using an explicit column mapping chosen by the admin.
   *
   * The mapping tells us which spreadsheet column contains the model/SKU,
   * which contains the price, and whether that price is list or cost.
   * The door style + distributor are required when importing prices.
   */
  importWithMapping: adminProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().default("upload.xlsx"),
        sheetName: z.string().optional(),
        /** Column header in the spreadsheet that contains the model/SKU */
        skuColumn: z.string().min(1),
        /** Column header for the price */
        priceColumn: z.string().min(1),
        /** Whether the price column is list price or your cost */
        priceType: z.enum(["listPrice", "yourCost"]),
        /** Optional: column header for description */
        descriptionColumn: z.string().optional(),
        /** Distributor this upload belongs to */
        distributorId: z.number(),
        /** Door style these prices apply to */
        styleId: z.number(),
        /** Preview-only: if true, return what would happen without writing */
        dryRun: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Parse file
      const isCsv = input.filename.toLowerCase().endsWith(".csv");
      let wb: XLSX.WorkBook;
      try {
        if (isCsv) {
          const text = Buffer.from(input.fileBase64, "base64").toString("utf-8");
          wb = XLSX.read(text, { type: "string" });
        } else {
          wb = XLSX.read(input.fileBase64, { type: "base64" });
        }
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not parse the file." });
      }

      const sheetName = input.sheetName ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new TRPCError({ code: "BAD_REQUEST", message: `Sheet "${sheetName}" not found.` });

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
      if (rawRows.length === 0) return { matched: 0, unmatched: 0, priced: 0, skipped: 0, aliasesLearned: 0, unmatchedCodes: [] as string[], dryRun: input.dryRun };

      // Build fuzzy lookup
      const allCabs = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets);
      const byNorm = new Map<string, typeof allCabs[number]>();
      for (const c of allCabs) byNorm.set(normalizeCode(c.masterCode), c);
      const aliases = await db.select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId }).from(codeAliases);
      const byCabId = new Map(allCabs.map((c) => [c.id, c]));
      const byAlias = new Map<string, typeof allCabs[number]>();
      for (const a of aliases) {
        const cab = byCabId.get(a.cabinetId);
        if (cab) byAlias.set(a.rawCodeCanon, cab);
      }
      function resolveCode(raw: string): { cab: typeof allCabs[number] | undefined; confidence: string } {
        const norm = normalizeCode(raw);
        const direct = byNorm.get(norm);
        if (direct) return { cab: direct, confidence: normalizeCode(direct.masterCode) === norm ? "exact" : "normalized" };
        const aliased = byAlias.get(norm);
        if (aliased) return { cab: aliased, confidence: "alias" };
        return { cab: undefined, confidence: "none" };
      }

      let matched = 0;
      let unmatched = 0;
      let priced = 0;
      let skipped = 0;
      const unmatchedCodes: string[] = [];
      const newAliases: Array<{ rawCodeCanon: string; rawCodeSample: string; cabinetId: number }> = [];

      for (const row of rawRows) {
        const rawSku = String(row[input.skuColumn] ?? "").trim();
        if (!rawSku) { skipped++; continue; }

        const rawPrice = String(row[input.priceColumn] ?? "").trim();
        const priceVal = parseMoney(rawPrice);

        const { cab, confidence } = resolveCode(rawSku);

        if (!cab) {
          unmatched++;
          if (unmatchedCodes.length < 50) unmatchedCodes.push(rawSku);
          continue;
        }

        matched++;

        // Learn alias if this SKU format is new
        const normRaw = normalizeCode(rawSku);
        if (confidence === "normalized" && !byAlias.has(normRaw)) {
          newAliases.push({ rawCodeCanon: normRaw, rawCodeSample: rawSku, cabinetId: cab.id });
          byAlias.set(normRaw, cab);
        }

        if (input.dryRun) continue;

        // Update description if column provided
        if (input.descriptionColumn) {
          const desc = String(row[input.descriptionColumn] ?? "").trim();
          if (desc) {
            await db.update(cabinets).set({ description: desc }).where(eq(cabinets.id, cab.id));
          }
        }

        // Upsert price
        if (priceVal === NOT_AVAILABLE) {
          await db.update(distributorSkus)
            .set({ isAvailable: false })
            .where(and(
              eq(distributorSkus.cabinetId, cab.id),
              eq(distributorSkus.distributorId, input.distributorId),
              eq(distributorSkus.styleId, input.styleId)
            ));
          priced++;
          continue;
        }

        const numPrice = typeof priceVal === "number" && !Number.isNaN(priceVal) ? priceVal : null;
        if (numPrice === null) { skipped++; continue; }

        const pricePatch: Record<string, unknown> = { isAvailable: true };
        pricePatch[input.priceType] = String(numPrice);

        const existing = await db
          .select({ id: distributorSkus.id })
          .from(distributorSkus)
          .where(and(
            eq(distributorSkus.cabinetId, cab.id),
            eq(distributorSkus.distributorId, input.distributorId),
            eq(distributorSkus.styleId, input.styleId)
          ))
          .limit(1);

        if (existing.length > 0) {
          await db.update(distributorSkus).set(pricePatch).where(eq(distributorSkus.id, existing[0].id));
        } else {
              await db.insert(distributorSkus).values({
                cabinetId: cab.id,
                distributorId: input.distributorId,
                styleId: input.styleId,
                platformSku: `${normalizeCode(rawSku)}-S${input.styleId}-D${input.distributorId}`,
                distributorSku: rawSku,
                listPrice: input.priceType === "listPrice" ? String(numPrice) : null,
                yourCost: input.priceType === "yourCost" ? String(numPrice) : null,
                isAvailable: true,
              });
        }
        priced++;
      }

      // Bulk-insert new aliases
      let aliasesLearned = 0;
      if (!input.dryRun && newAliases.length > 0) {
        try {
          await db.insert(codeAliases).values(newAliases).onDuplicateKeyUpdate({ set: { rawCodeSample: sql`VALUES(raw_code_sample)` } });
          aliasesLearned = newAliases.length;
        } catch { /* ignore duplicate alias errors */ }
      }

      return { matched, unmatched, priced, skipped, aliasesLearned, unmatchedCodes, dryRun: input.dryRun };
    }),

  /**
   * Download a file from a Google Drive shareable link and return it as
   * base64 so the frontend can feed it into parseXlsxColumns / importWithMapping
   * without the user having to download the file first.
   *
   * Supports all common share-link formats:
   *   https://drive.google.com/file/d/<ID>/view
   *   https://drive.google.com/open?id=<ID>
   *   https://docs.google.com/spreadsheets/d/<ID>/...
   *   https://drive.google.com/uc?id=<ID>
   *
   * The file must be shared as "Anyone with the link can view".
   */
  fetchFromDriveLink: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      // Extract the file ID from any known Drive URL format
      let fileId: string | null = null;

      // /file/d/<ID>/ or /spreadsheets/d/<ID>/
      const pathMatch = input.url.match(/\/d\/([a-zA-Z0-9_-]{20,})/i);
      if (pathMatch) fileId = pathMatch[1];

      // ?id=<ID> or open?id=<ID>
      if (!fileId) {
        const qMatch = input.url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i);
        if (qMatch) fileId = qMatch[1];
      }

      if (!fileId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not extract a file ID from that link. Make sure it is a valid Google Drive share link.",
        });
      }

      // Use the direct-download URL (works for files shared as "anyone with the link")
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

      let response: Response;
      try {
        response = await fetch(downloadUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          redirect: "follow",
        });
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Network error while trying to download the file from Google Drive.",
        });
      }

      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Google Drive returned HTTP ${response.status}. Make sure the file is shared as "Anyone with the link can view".`,
        });
      }

      // Detect filename from Content-Disposition header
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const nameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;'"\n]+)/i);
      const rawFilename = nameMatch
        ? decodeURIComponent(nameMatch[1].trim())
        : `drive-file-${fileId}.xlsx`;
      // Sanitize filename — keep extension
      const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");

      // Read response body as buffer and convert to base64
      const arrayBuffer = await response.arrayBuffer();

      // Sanity-check size (max 20 MB)
      if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File is too large (max 20 MB). Please trim the spreadsheet and try again.",
        });
      }

      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return { base64, filename, sizeBytes: arrayBuffer.byteLength };
    }),

  /**
   * Parse an XLSX/CSV file and return all "price columns" — every column that
   * is NOT the SKU/model column, the Description column, or the Assemble column.
   * Also returns the first 5 data rows so the admin can sanity-check.
   */
  parseAllPriceColumns: adminProcedure
    .input(z.object({
      fileBase64: z.string().min(1),
      filename: z.string(),
      skuColumn: z.string().default("SKU"),  // header name for the SKU/model column
      skipColumns: z.array(z.string()).default(["Description", "Assemble", "description", "assemble"]),
    }))
    .mutation(async ({ input }) => {
      const buf = Buffer.from(input.fileBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

      if (rows.length === 0) return { priceColumns: [], sampleRows: [], totalRows: 0 };

      const allHeaders = Object.keys(rows[0]);
      const skipSet = new Set([input.skuColumn, ...input.skipColumns].map((s) => s.toLowerCase()));
      const priceColumns = allHeaders.filter((h) => !skipSet.has(h.toLowerCase()));

      // Build sample rows: first 5 data rows, only SKU + price columns
      const sampleRows = rows.slice(0, 5).map((row) => {
        const sku = String(row[input.skuColumn] ?? "");
        const prices: Record<string, string | null> = {};
        for (const col of priceColumns) {
          const v = row[col];
          prices[col] = v == null ? null : String(v);
        }
        return { sku, prices };
      });

      return { priceColumns, sampleRows, totalRows: rows.length };
    }),

  /**
   * Return saved column→style mappings for a distributor so the UI can
   * pre-fill the mapping table on the next upload.
   */
  getColumnMappings: adminProcedure
    .input(z.object({ distributorId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { distributorColumnMappings } = await import("../../drizzle/schema");
      return db
        .select()
        .from(distributorColumnMappings)
        .where(eq(distributorColumnMappings.distributorId, input.distributorId))
        .orderBy(distributorColumnMappings.columnCode);
    }),

  /**
   * Import prices from multiple columns at once.
   * Each entry in `mappings` specifies which column maps to which door style
   * and whether the prices are list or cost.
   * Saves/updates the column mappings so they are remembered next time.
   */
  importAllColumns: adminProcedure
    .input(z.object({
      distributorId: z.number().int().positive(),
      fileBase64: z.string().min(1),
      filename: z.string(),
      skuColumn: z.string().default("SKU"),
      mappings: z.array(z.object({
        columnCode: z.string().min(1),
        doorStyleId: z.number().int().positive(),
        priceType: z.enum(["list", "cost"]).default("list"),
      })).min(1),
      dryRun: z.boolean().default(false),
      /**
       * Full Catalog Update mode.
       * When true: after upserting all rows from the file, any distributor_skus row
       * for this distributor+style combination whose cabinetId was NOT present in the
       * upload is marked isAvailable=false (soft-delete / de-list).
       * When false (default): only the provided rows are touched; nothing is removed.
       */
      fullCatalogUpdate: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });

      const { distributorColumnMappings } = await import("../../drizzle/schema");

      // Parse the file
      const buf = Buffer.from(input.fileBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

      if (rows.length === 0) return { results: [], totalRows: 0 };

      // Load distributor for costMultiplier
      const [distRow] = await db.select({ costMultiplier: distributors.costMultiplier }).from(distributors).where(eq(distributors.id, input.distributorId)).limit(1);
      const costMult = distRow ? parseFloat(String(distRow.costMultiplier)) : null;
      // Build cabinet lookup (same fuzzy logic as importCommit)
      const allCabinets = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets);
      const byNorm = new Map<string, typeof allCabinets[number]>();
      for (const c of allCabinets) byNorm.set(normalizeCode(c.masterCode), c);
      const aliases = await db.select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId }).from(codeAliases);
      const aliasByCabId = new Map(allCabinets.map((c) => [c.id, c]));
      const byAlias = new Map<string, typeof allCabinets[number]>();
      for (const a of aliases) {
        const cab = aliasByCabId.get(a.cabinetId);
        if (cab) byAlias.set(a.rawCodeCanon, cab);
      }

      function resolveCabinet(rawCode: string) {
        const norm = normalizeCode(rawCode);
        return byNorm.get(norm) ?? byAlias.get(norm);
      }

      const results: Array<{
        columnCode: string;
        doorStyleId: number;
        priceType: string;
        matched: number;
        unmatched: number;
        priced: number;
        unmatchedCodes: string[];
        delisted: number;
      }> = [];

      const newAliases: Array<{ cabinetId: number; rawCodeSample: string; rawCodeCanon: string; distributorId: number }> = [];

      for (const mapping of input.mappings) {
        let matched = 0, unmatched = 0, priced = 0;
        const unmatchedCodes: string[] = [];
        const upserts: Array<typeof distributorSkus.$inferInsert> = [];

        for (const row of rows) {
          const rawSku = String(row[input.skuColumn] ?? "").trim();
          if (!rawSku) continue;

          const rawPrice = row[mapping.columnCode];
          if (rawPrice == null || String(rawPrice).trim() === "") continue;

          const priceStr = String(rawPrice).trim();
          // Treat NA/X/blank as not available
          const NOT_AVAIL_RE = /^(na|n\/a|x|-)$/i;
          const isNotAvailable = NOT_AVAIL_RE.test(priceStr);
          const parsedPrice = isNotAvailable ? null : parseFloat(priceStr.replace(/[^0-9.-]/g, ""));
          if (!isNotAvailable && (parsedPrice == null || isNaN(parsedPrice))) continue;

          const cabinet = resolveCabinet(rawSku);
          if (!cabinet) {
            unmatched++;
            if (unmatchedCodes.length < 50) unmatchedCodes.push(rawSku);
            continue;
          }
          matched++;

          // Learn alias
          const norm = normalizeCode(rawSku);
          if (norm !== normalizeCode(cabinet.masterCode)) {
            newAliases.push({ cabinetId: cabinet.id, rawCodeSample: rawSku, rawCodeCanon: norm, distributorId: input.distributorId });
          }

          const listPrice = mapping.priceType === "list" ? parsedPrice : null;
          // Auto-calculate yourCost from listPrice × distributor costMultiplier when uploading list prices
          const yourCost = mapping.priceType === "cost"
            ? parsedPrice
            : (listPrice !== null && costMult !== null && !isNaN(costMult))
              ? Math.round(listPrice * costMult * 100) / 100
              : null;
          const platformSku = `${input.distributorId}-${mapping.doorStyleId}-${cabinet.masterCode}`;

          upserts.push({
            distributorId: input.distributorId,
            cabinetId: cabinet.id,
            styleId: mapping.doorStyleId,
            platformSku,
            distributorSku: rawSku,
            listPrice: listPrice !== null ? String(listPrice) : null,
            yourCost: yourCost !== null ? String(yourCost) : null,
            isAvailable: !isNotAvailable,
          });
          priced++;
        }

        if (!input.dryRun && upserts.length > 0) {
          // Batch upsert in chunks of 200
          for (let i = 0; i < upserts.length; i += 200) {
            const chunk = upserts.slice(i, i + 200);
            await db.insert(distributorSkus).values(chunk).onDuplicateKeyUpdate({
              set: {
                listPrice: sql`VALUES(list_price)`,
                yourCost: sql`VALUES(your_cost)`,
                isAvailable: sql`VALUES(is_available)`,
              },
            });
          }
        }

        // Save unmatched codes to import_pending_skus staging table
        if (!input.dryRun && unmatchedCodes.length > 0) {
          // Build a pricesJson for each unmatched code from all rows
          const unmatchedSet = new Set(unmatchedCodes);
          const pendingMap = new Map<string, Record<string, { listPrice: number | null; yourCost: number | null; styleId: number }>>();
          for (const row of rows) {
            const rawSku = String(row[input.skuColumn] ?? "").trim();
            if (!rawSku || !unmatchedSet.has(rawSku)) continue;
            if (!pendingMap.has(rawSku)) pendingMap.set(rawSku, {});
            const entry = pendingMap.get(rawSku)!;
            const rawPrice = row[mapping.columnCode];
            if (rawPrice == null || String(rawPrice).trim() === "") continue;
            const priceStr = String(rawPrice).trim();
            const NOT_AVAIL_RE2 = /^(na|n\/a|x|-)$/i;
            const isNA = NOT_AVAIL_RE2.test(priceStr);
            const parsed = isNA ? null : parseFloat(priceStr.replace(/[^0-9.-]/g, ""));
            entry[mapping.columnCode] = {
              listPrice: mapping.priceType === "list" && !isNA ? parsed : null,
              yourCost: mapping.priceType === "cost" && !isNA ? parsed : null,
              styleId: mapping.doorStyleId,
            };
          }
          for (const [rawCode, prices] of Array.from(pendingMap)) {
            try {
              const pricesStr = JSON.stringify(prices);
              await db.insert(importPendingSkus).values({
                distributorId: input.distributorId,
                rawCode,
                pricesJson: pricesStr,
                status: "pending",
              }).onDuplicateKeyUpdate({
                set: {
                  pricesJson: sql`VALUES(pricesJson)`,
                  status: "pending",
                },
              });
            } catch (e) {
              console.error("[importAllColumns] failed to save pending SKU", rawCode, e);
            }
          }
        }
        // --- Full Catalog Update: de-list SKUs not in the upload ---
        let delisted = 0;
        if (!input.dryRun && input.fullCatalogUpdate && upserts.length > 0) {
          // Collect all cabinetIds that were present in this upload for this style
          const uploadedCabinetIds = upserts.map((u) => u.cabinetId as number);
          // Mark any SKU for this distributor+style NOT in the upload as unavailable
          const existingSkus = await db
            .select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId })
            .from(distributorSkus)
            .where(
              and(
                eq(distributorSkus.distributorId, input.distributorId),
                eq(distributorSkus.styleId, mapping.doorStyleId),
                eq(distributorSkus.isAvailable, true)
              )
            );
          const toDelistIds = existingSkus
            .filter((s) => !uploadedCabinetIds.includes(s.cabinetId!))
            .map((s) => s.id);
          if (toDelistIds.length > 0) {
            // Process in chunks of 200 to avoid oversized IN clauses
            for (let i = 0; i < toDelistIds.length; i += 200) {
              const chunk = toDelistIds.slice(i, i + 200);
              await db.update(distributorSkus)
                .set({ isAvailable: false })
                .where(inArray(distributorSkus.id, chunk));
            }
            delisted = toDelistIds.length;
            console.log(`[importAllColumns] fullCatalogUpdate: de-listed ${delisted} SKUs for distributor=${input.distributorId} style=${mapping.doorStyleId}`);
          }
        }

        results.push({ columnCode: mapping.columnCode, doorStyleId: mapping.doorStyleId, priceType: mapping.priceType, matched, unmatched, priced, unmatchedCodes, delisted });
      }

      // Save/update column mappings for next time
      if (!input.dryRun) {
        for (const mapping of input.mappings) {
          await db.insert(distributorColumnMappings).values({
            distributorId: input.distributorId,
            columnCode: mapping.columnCode,
            doorStyleId: mapping.doorStyleId,
            priceType: mapping.priceType,
          }).onDuplicateKeyUpdate({
            set: { doorStyleId: mapping.doorStyleId, priceType: mapping.priceType, lastUsedAt: new Date() },
          });
        }
        // Bulk-insert new aliases
        if (newAliases.length > 0) {
          try {
            await db.insert(codeAliases).values(newAliases).onDuplicateKeyUpdate({ set: { rawCodeSample: sql`VALUES(raw_code_sample)` } });
          } catch { /* ignore */ }
        }
      }

            return { results, totalRows: rows.length, dryRun: input.dryRun };
    }),

  /**
   * Preview import: returns every row from the spreadsheet with match status.
   * Nothing is written to the database. Used to show the review table before commit.
   */
  previewAllColumns: adminProcedure
    .input(z.object({
      distributorId: z.number().int().positive(),
      fileBase64: z.string().min(1),
      filename: z.string(),
      skuColumn: z.string().default("SKU"),
      // Only need one representative price column to show list price in the table
      priceColumn: z.string(),
      priceType: z.enum(["list", "cost"]).default("list"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      const buf = Buffer.from(input.fileBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (rows.length === 0) return { rows: [], totalRows: 0, costMultiplier: null };
      // Load distributor costMultiplier
      const [distRow] = await db.select({ costMultiplier: distributors.costMultiplier }).from(distributors).where(eq(distributors.id, input.distributorId)).limit(1);
      const costMult = distRow ? parseFloat(String(distRow.costMultiplier)) : null;
      // Build cabinet lookup
      const allCabinets = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets);
      const byNorm = new Map<string, typeof allCabinets[number]>();
      for (const c of allCabinets) byNorm.set(normalizeCode(c.masterCode), c);
      const aliases = await db.select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId }).from(codeAliases);
      const aliasByCabId = new Map(allCabinets.map((c) => [c.id, c]));
      const byAlias = new Map<string, typeof allCabinets[number]>();
      for (const a of aliases) {
        const cab = aliasByCabId.get(a.cabinetId);
        if (cab) byAlias.set(a.rawCodeCanon, cab);
      }
      function resolveCab(rawCode: string) {
        const norm = normalizeCode(rawCode);
        return byNorm.get(norm) ?? byAlias.get(norm);
      }
      const NOT_AVAIL_RE = /^(na|n\/a|x|-)$/i;
      const previewRows: Array<{
        rawCode: string;
        masterCode: string | null;
        masterCabinetId: number | null;
        listPrice: number | null;
        yourCost: number | null;
        matched: boolean;
        notAvailable: boolean;
      }> = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const rawSku = String(row[input.skuColumn] ?? "").trim();
        if (!rawSku || seen.has(rawSku)) continue;
        seen.add(rawSku);
        const rawPrice = row[input.priceColumn];
        const priceStr = rawPrice != null ? String(rawPrice).trim() : "";
        const isNA = NOT_AVAIL_RE.test(priceStr);
        const parsedPrice = isNA || priceStr === "" ? null : parseFloat(priceStr.replace(/[^0-9.-]/g, ""));
        const listPrice = input.priceType === "list" ? parsedPrice : null;
        const yourCost = input.priceType === "cost"
          ? parsedPrice
          : (listPrice !== null && costMult !== null && !isNaN(costMult))
            ? Math.round(listPrice * costMult * 100) / 100
            : null;
        const cabinet = resolveCab(rawSku);
        previewRows.push({
          rawCode: rawSku,
          masterCode: cabinet?.masterCode ?? null,
          masterCabinetId: cabinet?.id ?? null,
          listPrice,
          yourCost,
          matched: Boolean(cabinet),
          notAvailable: isNA,
        });
      }
      return { rows: previewRows, totalRows: previewRows.length, costMultiplier: costMult };
    }),

  /**
   * Save SKU aliases: admin types the correct cabinet master code for each
   * unmatched distributor SKU code. Creates a code_aliases entry so the
   * code resolves automatically on the next import.
   */
  saveSkuAliases: adminProcedure
    .input(
      z.object({
        aliases: z.array(
          z.object({
            /** The raw code from the distributor spreadsheet that didn't match */
            rawCode: z.string().min(1),
            /** The cabinet masterCode the admin says this maps to */
            masterCode: z.string().min(1),
          })
        ).min(1),
        distributorId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Look up cabinets by masterCode
      const masterCodes = input.aliases.map((a) => a.masterCode.trim().toUpperCase());
      const found = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(inArray(sql`UPPER(${cabinets.masterCode})`, masterCodes));

      const byMaster = new Map(found.map((c) => [c.masterCode.toUpperCase(), c]));

      const saved: string[] = [];
      const notFound: string[] = [];

      for (const alias of input.aliases) {
        const cab = byMaster.get(alias.masterCode.trim().toUpperCase());
        if (!cab) {
          notFound.push(alias.masterCode);
          continue;
        }
        const rawCodeCanon = normalizeCode(alias.rawCode);
        try {
          await db.insert(codeAliases).values({
            rawCodeCanon,
            rawCodeSample: alias.rawCode.trim(),
            cabinetId: cab.id,
          }).onDuplicateKeyUpdate({
            set: { cabinetId: cab.id, rawCodeSample: alias.rawCode.trim() },
          });
          saved.push(alias.rawCode);
        } catch {
          // ignore duplicate key errors
          saved.push(alias.rawCode);
        }
      }

      return { saved: saved.length, notFound };
    }),

  /**
   * Search cabinets by masterCode prefix or description keyword.
   * Used by the unmatched SKU resolution panel to help the admin find
   * the right cabinet to map to.
   */
  searchCabinets: adminProcedure
    .input(z.object({ q: z.string().min(1).max(80) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const term = `%${input.q.trim()}%`;
      const rows = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description, category: cabinets.category })
        .from(cabinets)
        .where(sql`(UPPER(${cabinets.masterCode}) LIKE UPPER(${term}) OR ${cabinets.description} LIKE ${term})`)
        .limit(20);
      return rows;
    }),

  /**
   * List all cabinets in a given category for the alias picker.
   * Returns id, masterCode, description, subCategory sorted by masterCode.
   */
  listCabinetsByCategory: adminProcedure
    .input(z.object({ category: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          subCategory: cabinets.subCategory,
        })
        .from(cabinets)
        .where(and(eq(cabinets.category, input.category), eq(cabinets.isActive, true)))
        .orderBy(cabinets.masterCode);
      return rows;
    }),

  /**
   * List pending (unmatched) import SKUs for admin assignment.
   */
  listPendingSkus: adminProcedure
    .input(z.object({
      distributorId: z.number().int().positive().optional(),
      status: z.enum(["pending", "resolved", "ignored"]).default("pending"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(importPendingSkus.status, input.status)];
      if (input.distributorId) conditions.push(eq(importPendingSkus.distributorId, input.distributorId));
      const rows = await db
        .select({
          id: importPendingSkus.id,
          distributorId: importPendingSkus.distributorId,
          rawCode: importPendingSkus.rawCode,
          pricesJson: importPendingSkus.pricesJson,
          status: importPendingSkus.status,
          resolvedCabinetId: importPendingSkus.resolvedCabinetId,
          createdAt: importPendingSkus.createdAt,
          distributorName: distributors.name,
        })
        .from(importPendingSkus)
        .leftJoin(distributors, eq(distributors.id, importPendingSkus.distributorId))
        .where(and(...conditions))
        .orderBy(importPendingSkus.createdAt);
      return rows;
    }),

  /**
   * Assign a pending unmatched code to a master cabinet.
   * Accepts either a masterCode or an existing alias code.
   * Creates the alias and inserts all pending SKU rows.
   */
  resolvePendingSku: adminProcedure
    .input(z.object({
      pendingId: z.number().int().positive(),
      /** The master code or alias the admin typed */
      masterCodeOrAlias: z.string().min(1).max(128),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Load the pending record
      const [pending] = await db
        .select()
        .from(importPendingSkus)
        .where(eq(importPendingSkus.id, input.pendingId))
        .limit(1);
      if (!pending) throw new TRPCError({ code: "NOT_FOUND", message: "Pending record not found" });

      // Resolve the typed code to a cabinet (direct or alias)
      const searchTerm = input.masterCodeOrAlias.trim().toUpperCase();
      const allCabs = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description })
        .from(cabinets);
      const byNorm = new Map(allCabs.map((c) => [normalizeCode(c.masterCode), c]));
      const aliases = await db.select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId }).from(codeAliases);
      const byCabId = new Map(allCabs.map((c) => [c.id, c]));
      const byAlias = new Map<string, typeof allCabs[number]>();
      for (const a of aliases) {
        const cab = byCabId.get(a.cabinetId);
        if (cab) byAlias.set(a.rawCodeCanon, cab);
      }
      const norm = normalizeCode(input.masterCodeOrAlias);
      const cabinet = byNorm.get(norm) ?? byAlias.get(norm);
      if (!cabinet) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No cabinet found for "${input.masterCodeOrAlias}". Check the master code or alias.` });
      }

      // Create alias: rawCode → cabinet
      const rawCodeCanon = normalizeCode(pending.rawCode);
      try {
        await db.insert(codeAliases).values({
          rawCodeCanon,
          rawCodeSample: pending.rawCode,
          cabinetId: cabinet.id,
        }).onDuplicateKeyUpdate({ set: { cabinetId: cabinet.id, rawCodeSample: pending.rawCode } });
      } catch { /* ignore */ }

      // Import the pending SKU rows
      const prices = JSON.parse(pending.pricesJson) as Record<string, { listPrice: number | null; yourCost: number | null; styleId: number }>;
      let inserted = 0;
      for (const [, priceData] of Object.entries(prices)) {
        const platformSku = `${pending.distributorId}-${priceData.styleId}-${cabinet.masterCode}`;
        try {
          await db.insert(distributorSkus).values({
            distributorId: pending.distributorId,
            cabinetId: cabinet.id,
            styleId: priceData.styleId,
            platformSku,
            distributorSku: pending.rawCode,
            listPrice: priceData.listPrice !== null ? String(priceData.listPrice) : null,
            yourCost: priceData.yourCost !== null ? String(priceData.yourCost) : null,
            isAvailable: true,
          }).onDuplicateKeyUpdate({
            set: {
              listPrice: sql`VALUES(list_price)`,
              yourCost: sql`VALUES(your_cost)`,
            },
          });
          inserted++;
        } catch { /* ignore duplicate */ }
      }

      // Mark as resolved
      await db.update(importPendingSkus)
        .set({ status: "resolved", resolvedCabinetId: cabinet.id, resolvedAt: new Date() })
        .where(eq(importPendingSkus.id, pending.id));

      return { resolved: true, cabinetId: cabinet.id, masterCode: cabinet.masterCode, skusInserted: inserted };
    }),

  /**
   * Ignore a pending unmatched code (mark as ignored so it doesn't clutter the list).
   */
  ignorePendingSku: adminProcedure
    .input(z.object({ pendingId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(importPendingSkus)
        .set({ status: "ignored" })
        .where(eq(importPendingSkus.id, input.pendingId));
      return { ignored: true };
    }),
});
