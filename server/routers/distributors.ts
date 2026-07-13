import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { distributors, cabinets, distributorSkus, doorStyles, codeAliases } from "../../drizzle/schema";
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
        imageUrl: cabinets.catalogImageUrl,
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

        // Fuzzy resolve: exact → normalized → alias
        const resolved = resolveCode(rawCode);
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
});
