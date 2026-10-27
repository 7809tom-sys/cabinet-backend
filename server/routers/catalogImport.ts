import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { catalogImports, cabinets } from "../../drizzle/schema";
import { importPafProducts } from "../lib/catalogImportLogic";
import { omitImportLockedFields } from "@shared/cabinetConflictFlags";
import type { PafProduct } from "../lib/pafXmlParser";
import { emailSettings } from "../../drizzle/schema";
import { sendEmailViaSettings, emailSettingsReady, sendEmail, isEmailConfigured } from "../email";

const NOTIFY_EMAIL = "7809tom@gmail.com";

/** Send an import-result email — tries DB-backed settings first, falls back to env SMTP. */
async function sendImportNotification(opts: {
  fileName: string;
  distributorId: number;
  status: "completed" | "failed";
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  errorMessage?: string;
}) {
  const subject =
    opts.status === "completed"
      ? `✅ Catalog Import Complete — ${opts.fileName}`
      : `❌ Catalog Import Failed — ${opts.fileName}`;

  const body =
    opts.status === "completed"
      ? [
          `Catalog import finished successfully.`,
          ``,
          `File:        ${opts.fileName}`,
          `Distributor: ID ${opts.distributorId}`,
          ``,
          `Results:`,
          `  Created : ${opts.created ?? 0}`,
          `  Updated : ${opts.updated ?? 0}`,
          `  Skipped : ${opts.skipped ?? 0}`,
          `  Errors  : ${opts.errors ?? 0}`,
          ``,
          `Log in to cabinetdealz.com/admin to review the catalog.`,
        ].join("\n")
      : [
          `Catalog import failed.`,
          ``,
          `File:        ${opts.fileName}`,
          `Distributor: ID ${opts.distributorId}`,
          ``,
          `Error: ${opts.errorMessage ?? "Unknown error"}`,
          ``,
          `Log in to cabinetdealz.com/admin to retry the import.`,
        ].join("\n");

  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(emailSettings).limit(1);
      const cfg = rows[0];
      if (emailSettingsReady(cfg)) {
        await sendEmailViaSettings(cfg, { to: NOTIFY_EMAIL, subject, text: body });
        return;
      }
    }
    if (isEmailConfigured()) {
      await sendEmail({ to: NOTIFY_EMAIL, subject, text: body });
    } else {
      console.warn("[CatalogImport] Email not configured — skipping import notification.");
    }
  } catch (err) {
    console.warn("[CatalogImport] Failed to send import notification email:", err);
  }
}

/**
 * 20/20 Catalog Importer Router
 * 
 * Procedures for uploading and processing 20/20 catalog zip files.
 * The importer:
 * - Validates zip file structure
 * - Extracts paf.xml and images
 * - Parses cabinet data deterministically (no AI interference)
 * - Creates/updates cabinet records while preserving existing pricing
 * - Tracks import history and error logs
 */

import { storagePut } from "../storage";

export const catalogImportRouter = router({
  /**
   * Upload a catalog image from base64 data
   */
  uploadImage: adminProcedure
    .input(
      z.object({
        productCode: z.string(),
        imageData: z.string(), // base64 encoded image
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const buffer = Buffer.from(input.imageData, "base64");
        const safeName = input.productCode.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
        const { url } = await storagePut(
          `catalog-images/${Date.now()}-${safeName}.jpg`,
          buffer,
          input.mimeType
        );
        return { success: true, url };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to upload image: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /**
   * List all catalog imports for a distributor
   */
  listImports: adminProcedure
    .input(z.object({ distributorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const imports = await db
        .select()
        .from(catalogImports)
        .where(eq(catalogImports.distributorId, input.distributorId))
        .orderBy(catalogImports.uploadedAt);

      return imports.map((imp) => ({
        id: imp.id,
        fileName: imp.fileName,
        status: imp.status,
        cabinetCount: imp.cabinetCount,
        skuCount: imp.skuCount,
        imageCount: imp.imageCount,
        preservePricing: imp.preservePricing,
        uploadedAt: imp.uploadedAt,
        importStartedAt: imp.importStartedAt,
        importCompletedAt: imp.importCompletedAt,
        uploadedByName: imp.uploadedByName,
        errorLog: imp.errorLog ? JSON.parse(imp.errorLog) : [],
      }));
    }),

  /**
   * Get details of a specific import
   */
  getImport: adminProcedure
    .input(z.object({ importId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [imp] = await db
        .select()
        .from(catalogImports)
        .where(eq(catalogImports.id, input.importId))
        .limit(1);

      if (!imp) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        id: imp.id,
        distributorId: imp.distributorId,
        fileName: imp.fileName,
        fileSize: imp.fileSize,
        status: imp.status,
        cabinetCount: imp.cabinetCount,
        skuCount: imp.skuCount,
        imageCount: imp.imageCount,
        preservePricing: imp.preservePricing,
        isRollbackable: imp.isRollbackable,
        uploadedAt: imp.uploadedAt,
        importStartedAt: imp.importStartedAt,
        importCompletedAt: imp.importCompletedAt,
        uploadedByName: imp.uploadedByName,
        errorLog: imp.errorLog ? JSON.parse(imp.errorLog) : [],
      };
    }),

  /**
   * Initialize a new catalog import (creates a pending record)
   * Returns the import ID for the upload UI to reference
   */
  initializeImport: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        fileName: z.string().min(1),
        fileSize: z.number().positive(),
        preservePricing: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.insert(catalogImports).values({
        distributorId: input.distributorId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        status: "pending",
        preservePricing: input.preservePricing,
        uploadedByUserId: ctx.user?.id,
        uploadedByName: ctx.user?.name || "Unknown",
      });

      // Get the last inserted import
      const [newImport] = await db
        .select({ id: catalogImports.id })
        .from(catalogImports)
        .orderBy(desc(catalogImports.id))
        .limit(1);

      return { importId: newImport?.id || 0 };
    }),

  /**
   * Update import status and counts after processing
   */
  updateImportStatus: adminProcedure
    .input(
      z.object({
        importId: z.number(),
        status: z.enum(["pending", "processing", "completed", "failed"]),
        cabinetCount: z.number().int().min(0).optional(),
        skuCount: z.number().int().min(0).optional(),
        imageCount: z.number().int().min(0).optional(),
        errorLog: z.array(z.object({
          code: z.string(),
          message: z.string(),
          details: z.string().optional(),
        })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const patch: Record<string, unknown> = {
        status: input.status,
      };

      if (input.status === "processing") {
        patch.importStartedAt = new Date();
      } else if (input.status === "completed" || input.status === "failed") {
        patch.importCompletedAt = new Date();
      }

      if (input.cabinetCount !== undefined) patch.cabinetCount = input.cabinetCount;
      if (input.skuCount !== undefined) patch.skuCount = input.skuCount;
      if (input.imageCount !== undefined) patch.imageCount = input.imageCount;
      if (input.errorLog !== undefined) patch.errorLog = JSON.stringify(input.errorLog);

      await db
        .update(catalogImports)
        .set(patch)
        .where(eq(catalogImports.id, input.importId));

      return { success: true };
    }),

  /**
   * Rollback an import (undo all changes from this import)
   * Only available if isRollbackable = true
   */
  rollbackImport: adminProcedure
    .input(z.object({ importId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [imp] = await db
        .select()
        .from(catalogImports)
        .where(eq(catalogImports.id, input.importId))
        .limit(1);

      if (!imp) throw new TRPCError({ code: "NOT_FOUND" });
      if (!imp.isRollbackable) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This import cannot be rolled back",
        });
      }

      // TODO: Implement rollback logic
      // - Delete all cabinets created by this import
      // - Restore all cabinets updated by this import to their pre-import state
      // - Delete all SKUs created by this import
      // - Restore all SKUs updated by this import

      await db
        .update(catalogImports)
        .set({ status: "failed", errorLog: JSON.stringify([{ code: "ROLLBACK", message: "Import rolled back by admin" }]) })
        .where(eq(catalogImports.id, input.importId));

      return { success: true };
    }),

  /**
   * Execute the import: process parsed products and create/update cabinets
   * This is called after the zip file has been uploaded and paf.xml parsed
   */
  executeImport: adminProcedure
    .input(
      z.object({
        importId: z.number(),
        distributorId: z.number(),
        products: z.array(
          z.object({
            code: z.string(),
            description: z.string(),
            category: z.string().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
            depth: z.number().optional(),
            numberOfDoors: z.number().optional(),
            numberOfDrawers: z.number().optional(),
            listPrice: z.number().optional(),
            imageUrl: z.string().optional(),
            catalogImageUrl: z.string().optional(),
          })
        ),
        preservePricing: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Update import status to processing
      await db
        .update(catalogImports)
        .set({ status: "processing", importStartedAt: new Date() })
        .where(eq(catalogImports.id, input.importId));

      // Load the real file name from the import record for notifications
      const [importRecord] = await db
        .select({ fileName: catalogImports.fileName })
        .from(catalogImports)
        .where(eq(catalogImports.id, input.importId))
        .limit(1);
      const importFileName = importRecord?.fileName ?? "catalog";

      try {
        // Execute the import
        const stats = await importPafProducts(
          input.distributorId,
          input.products as PafProduct[],
          input.preservePricing
        );

        // Update import status with results
        await db
          .update(catalogImports)
          .set({
            status: "completed",
            importCompletedAt: new Date(),
            cabinetCount: stats.created + stats.updated,
            skuCount: stats.created + stats.updated,
            imageCount: stats.imagesResolved || 0,
            errorLog: stats.errors.length > 0 ? JSON.stringify(stats.errors) : null,
          })
          .where(eq(catalogImports.id, input.importId));

        // Send completion email notification to owner
        await sendImportNotification({
          fileName: importFileName,
          distributorId: input.distributorId,
          status: "completed",
          created: stats.created,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors.length,
        });

        return {
          success: true,
          stats,
        };
      } catch (err) {
        // Mark import as failed
        const errorMsg = err instanceof Error ? err.message : String(err);
        await db
          .update(catalogImports)
          .set({
            status: "failed",
            importCompletedAt: new Date(),
            errorLog: JSON.stringify([{ code: "IMPORT_FAILED", message: errorMsg }]),
          })
          .where(eq(catalogImports.id, input.importId));

        // Send failure email notification to owner
        await sendImportNotification({
          fileName: importFileName,
          distributorId: input.distributorId,
          status: "failed",
          errorMessage: errorMsg,
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Import failed: ${errorMsg}`,
        });
      }
    }),
  /**
   * Import from master catalog CSV (the format exported by the website).
   * Columns: Code, Description, Category, SubCategory, Width, Height, Depth,
   *          Doors, Drawers, GraphicType, LinesWithSKU
   * This allows the round-trip: download CSV → edit → re-upload.
   */
  importMasterCsv: adminProcedure
    .input(
      z.object({
        csvText: z.string().min(1),
        distributorId: z.number(),
        preservePricing: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      // Parse CSV — handle quoted fields with embedded commas/newlines
      function parseCsvLine(line: string): string[] {
        const fields: string[] = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
          } else if (ch === ',' && !inQuote) {
            fields.push(cur.trim());
            cur = "";
          } else {
            cur += ch;
          }
        }
        fields.push(cur.trim());
        return fields;
      }

      const lines = input.csvText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV has no data rows" });

      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
      const colIdx = (names: string[]) => {
        for (const n of names) {
          const i = headers.indexOf(n);
          if (i >= 0) return i;
        }
        return -1;
      };

      const codeCol   = colIdx(["code"]);
      const descCol   = colIdx(["description"]);
      const catCol    = colIdx(["category"]);
      const subCatCol = colIdx(["subcategory"]);
      const wCol      = colIdx(["width"]);
      const hCol      = colIdx(["height"]);
      const dCol      = colIdx(["depth"]);
      const doorsCol  = colIdx(["doors", "numberofdoors"]);
      const drawCol   = colIdx(["drawers", "numberofdrawers"]);

      if (codeCol < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV missing 'Code' column" });

      const products: PafProduct[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const code = cols[codeCol]?.trim();
        if (!code) continue;
        const toNum = (idx: number) => {
          if (idx < 0) return undefined;
          const v = parseFloat(cols[idx] ?? "");
          return isNaN(v) ? undefined : v;
        };
        products.push({
          code,
          description: descCol >= 0 ? (cols[descCol] ?? "") : "",
          category: catCol >= 0 ? (cols[catCol] ?? "") : "",
          width: toNum(wCol),
          height: toNum(hCol),
          depth: toNum(dCol),
          numberOfDoors: toNum(doorsCol),
          numberOfDrawers: toNum(drawCol),
        });
      }

      if (products.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No valid rows found in CSV" });

      try {
        const stats = await importPafProducts(input.distributorId, products, input.preservePricing);
        await sendImportNotification({
          fileName: "master-catalog.csv",
          distributorId: input.distributorId,
          status: "completed",
          created: stats.created,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors.length,
        });
        return { success: true, stats };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await sendImportNotification({
          fileName: "master-catalog.csv",
          distributorId: input.distributorId,
          status: "failed",
          errorMessage: errorMsg,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `CSV import failed: ${errorMsg}` });
      }
    }),
  applyMasterCatalog: adminProcedure
    .input(z.object({
      csvText: z.string().min(1),
      dryRun: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // CSV parser (handles quoted fields)
      function parseCsvLine(line: string): string[] {
        const fields: string[] = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
          } else if (ch === ',' && !inQuote) {
            fields.push(cur.trim());
            cur = "";
          } else {
            cur += ch;
          }
        }
        fields.push(cur.trim());
        return fields;
      }

      const lines = input.csvText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV has no data rows" });

      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
      const colIdx = (names: string[]) => {
        for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; }
        return -1;
      };

      const codeCol    = colIdx(["code"]);
      const descCol    = colIdx(["description"]);
      const catCol     = colIdx(["category"]);
      const subCatCol  = colIdx(["subcategory"]);
      const wCol       = colIdx(["width"]);
      const hCol       = colIdx(["height"]);
      const dCol       = colIdx(["depth"]);
      const doorsCol   = colIdx(["doors", "numberofdoors"]);
      const drawCol    = colIdx(["drawers", "numberofdrawers"]);
      const gtCol      = colIdx(["graphictype"]);

      if (codeCol < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV missing 'Code' column" });

      const CAT_MAP: Record<string, string> = {
        base: "Base", wall: "Wall", tall: "Tall", vanity: "Vanity",
        ada: "ADA", accessory: "Accessory", molding: "Molding",
        filler: "Filler", panel: "Panel",
      };

      let updated = 0;
      let notFound = 0;
      let skipped = 0;
      const notFoundCodes: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const code = cols[codeCol]?.trim();
        if (!code) { skipped++; continue; }

        const toNum = (idx: number) => {
          if (idx < 0) return null;
          const v = parseFloat(cols[idx] ?? "");
          return isNaN(v) ? null : v;
        };
        const toInt = (idx: number) => {
          if (idx < 0) return null;
          const v = parseInt(cols[idx] ?? "", 10);
          return isNaN(v) ? null : v;
        };
        const toStr = (idx: number) => idx >= 0 ? (cols[idx]?.trim() || null) : null;

        const rawCat = toStr(catCol);
        const category = rawCat ? (CAT_MAP[rawCat.toLowerCase()] ?? rawCat) : null;
        const description = toStr(descCol);
        const subCategory = toStr(subCatCol);
        const width = toNum(wCol);
        const height = toNum(hCol);
        const depth = toNum(dCol);
        const numberOfDoors = toInt(doorsCol);
        const numberOfDrawers = toInt(drawCol);
        const graphicType = toStr(gtCol);

        const [existing] = await db
          .select({ id: cabinets.id, importLockedFields: cabinets.importLockedFields })
          .from(cabinets)
          .where(eq(cabinets.masterCode, code))
          .limit(1);
        if (!existing) {
          notFound++;
          if (notFoundCodes.length < 20) notFoundCodes.push(code);
          continue;
        }
        if (input.dryRun) {
          updated++;
          continue;
        }

        const patch = omitImportLockedFields({
          ...(description !== null && { description }),
          ...(category !== null && { category }),
          subCategory,
          ...(width !== null && { width: String(width) }),
          ...(height !== null && { height: String(height) }),
          ...(depth !== null && { depth: String(depth) }),
          ...(numberOfDoors !== null && { numberOfDoors }),
          ...(numberOfDrawers !== null && { numberOfDrawers }),
          graphicType,
        }, existing.importLockedFields);
        if (Object.keys(patch).length === 0) { skipped++; continue; }

        const result = await db.update(cabinets).set(patch).where(eq(cabinets.masterCode, code));

        if ((result as any)[0]?.affectedRows > 0 || result) {
          updated++;
        } else {
          notFound++;
          if (notFoundCodes.length < 20) notFoundCodes.push(code);
        }
      }

      return { updated, notFound, skipped, notFoundCodes, dryRun: input.dryRun };
    }),
});
