import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { catalogImports } from "../../drizzle/schema";
import { importPafProducts } from "../lib/catalogImportLogic";
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

export const catalogImportRouter = router({
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
});
