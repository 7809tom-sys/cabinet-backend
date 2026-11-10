import { createHash } from "node:crypto";
import { z } from "zod";
import { desc, eq, isNotNull } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { affiliateLiterature } from "../../drizzle/schema";
import { duplicateLibraryFileMessage } from "@shared/libraryFileHash";
import { isCommercialVideoMime } from "@shared/commercialVideo";
import { archiveLibraryCommercial } from "../lib/archiveLibraryCommercial";
import { lookupLibraryFileByHash } from "../lib/libraryContentHash";
import { LIBRARY_COMMERCIALS_MIGRATION, LibraryCommercialSchemaError, isUnknownNamedColumn } from "../lib/libraryCommercialSchema";
import {
  LIBRARY_DOCUMENT_FILE_PREFIX,
  visibilityForAffiliateLibrarySwitch,
  type LibraryVisibility,
} from "@shared/libraryVisibility";
import { TRPCError } from "@trpc/server";
import {
  LIBRARY_VISIBILITY_MIGRATION,
  LibrarySchemaError,
  missingLiteratureColumns,
  readLiteratureRows,
  writeLiteratureRow,
} from "../lib/affiliateLiteratureSchema";
import { describedDatabaseError } from "../lib/orderSchemaGuard";

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

function decodeBase64(value: string) {
  const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Literature file must be between 1 byte and 24 MB." });
  }
  return buffer;
}

function safeFilename(filename: string) {
  const trimmed = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed || "affiliate-literature";
}

/** Internal documents and affiliate documents share one private prefix. */
function literatureFileKey(filename: string) {
  return `${LIBRARY_DOCUMENT_FILE_PREFIX}${Date.now()}_${filename}`;
}

/**
 * Ids of archived commercials. Null when the column has not been pasted yet,
 * which is the same as "nothing is archived". A failure that is not that
 * missing column is rethrown.
 */
async function archivedLiteratureIds(db: { select: (fields: any) => any }): Promise<Set<number> | null> {
  try {
    const rows = await db
      .select({ id: affiliateLiterature.id })
      .from(affiliateLiterature)
      .where(isNotNull(affiliateLiterature.archivedAt)) as Array<{ id: number }>;
    return new Set(rows.map((row) => Number(row.id)));
  } catch (error) {
    if (isUnknownNamedColumn(error, "archivedAt")) return null;
    throw error;
  }
}

/**
 * tRPC has no logger of its own, so a failed database statement inside this
 * router used to reach the admin library as a bare 500 with nothing in the
 * Railway log. Every procedure here goes through this wrapper: it writes the
 * procedure name and the driver's own message (the "Failed query: select ..."
 * wrapper hides it on `cause`), then rethrows so the caller still sees the
 * failure.
 *
 * An admin gets the missing-SQL hint for a hand-run migration; anyone else gets
 * a plain internal error, so a schema detail is never shown to a non-admin.
 */
async function logged<T>(procedure: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const detail = describedDatabaseError(error);
    console.error(`[affiliate-literature] ${procedure} failed:`, detail);
    if (error instanceof LibrarySchemaError) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
    }
    // Only the columns and the table this file adds are worth a hint. A missing
    // base column means the library itself is wrong, and naming 0269 would send
    // an admin to the wrong SQL.
    if (
      missingLiteratureColumns(error).length > 0 ||
      /ER_NO_SUCH_TABLE|1146|doesn't exist|does not exist/i.test(detail)
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `The document library is missing something in the database. Run ${LIBRARY_VISIBILITY_MIGRATION} in TiDB.`,
      });
    }
    throw error;
  }
}

export const affiliateLiteratureRouter = router({
  /**
   * The admin library list. Reads named columns rather than `select()`, so a
   * deploy that lands before docs/sql/0269 still returns rows: a missing
   * visibility/toggle column reads as internal and never-toggled, which is what
   * those columns would have defaulted to anyway.
   */
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await logged("adminList", () => readLiteratureRows((columns) => db
      .select(columns)
      .from(affiliateLiterature)
      .orderBy(desc(affiliateLiterature.createdAt))));
    const archived = await archivedLiteratureIds(db);
    if (!archived) return rows;
    return rows.filter((row) => !archived.has(row.id));
  }),

  adminUpload: adminProcedure
    .input(z.object({
      title: z.string().trim().min(1).max(255),
      description: z.string().trim().max(2000).nullable().optional(),
      category: z.string().trim().min(1).max(64).default("General"),
      filename: z.string().trim().min(1).max(255),
      mimeType: z.string().min(1).max(128),
      dataBase64: z.string().min(1),
      /**
       * The admin page's "Affiliate library" checkbox. Off (the default) stores
       * the document as internal: admins only. On also shows it to signed-in
       * affiliates. Neither value makes a document public.
       */
      inAffiliateLibrary: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Supported files: PDF, DOCX, XLSX, PPTX, or TXT." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const buffer = decodeBase64(input.dataBase64);
      const contentSha256 = createHash("sha256").update(buffer).digest("hex");
      // Exact duplicates are refused before anything is stored. A missing hash
      // column means the owner has not pasted 0273 yet: the document still
      // uploads, and the log names the file that turns the check on.
      const lookup = await lookupLibraryFileByHash(db, contentSha256);
      if (lookup.state === "ready" && lookup.existing) {
        throw new TRPCError({ code: "CONFLICT", message: duplicateLibraryFileMessage(lookup.existing) });
      }
      if (lookup.state === "column-missing") {
        console.warn(
          `[affiliate-literature] contentSha256 is missing, so this upload was not checked for a duplicate. Run ${LIBRARY_COMMERCIALS_MIGRATION}.`,
        );
      }
      const filename = safeFilename(input.filename);
      const fileKey = literatureFileKey(filename);
      const stored = await storagePut(fileKey, buffer, input.mimeType);
      const values = {
        title: input.title,
        description: input.description?.trim() || null,
        category: input.category,
        filename,
        fileKey: stored.key,
        url: stored.url,
        mimeType: input.mimeType,
        sizeBytes: buffer.length,
        ...(lookup.state === "ready" ? { contentSha256 } : {}),
        isPublished: input.inAffiliateLibrary,
        visibility: visibilityForAffiliateLibrarySwitch(input.inAffiliateLibrary),
        affiliateToggledAt: input.inAffiliateLibrary ? new Date() : null,
        affiliateToggledBy: input.inAffiliateLibrary ? ctx.user.id : null,
        affiliateToggledByName: input.inAffiliateLibrary ? ctx.user.name ?? null : null,
        uploadedBy: ctx.user.id,
      };
      const inserted = await logged("adminUpload", () => writeLiteratureRow({
        procedure: "adminUpload",
        values,
        // An internal document needs no optional column; an affiliate one must
        // record the toggle, so it waits for docs/sql/0269 rather than half-saving.
        requireColumns: input.inAffiliateLibrary ? ["visibility", "affiliateToggledAt", "affiliateToggledBy"] : [],
        write: (next) => db.insert(affiliateLiterature).values(next as typeof values),
      }));
      return { id: (inserted[0] as any)?.insertId, url: stored.url };
    }),

  adminUpdate: adminProcedure
    .input(z.object({
      id: z.number().int(),
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      category: z.string().trim().min(1).max(64).optional(),
      /**
       * The single control for the "Affiliate library" checkbox. It writes the
       * visibility, the legacy isPublished flag, and the who/when audit in one
       * row update, so the three can never disagree.
       */
      inAffiliateLibrary: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, inAffiliateLibrary, ...patch } = input;
      const values: Record<string, unknown> = { ...patch };
      if (inAffiliateLibrary !== undefined) {
        const visibility: LibraryVisibility = visibilityForAffiliateLibrarySwitch(inAffiliateLibrary);
        Object.assign(values, {
          visibility,
          isPublished: inAffiliateLibrary,
          affiliateToggledAt: new Date(),
          affiliateToggledBy: ctx.user.id,
          affiliateToggledByName: ctx.user.name ?? null,
        });
      }
      if (!Object.keys(values).length) return { id };
      await logged("adminUpdate", () => writeLiteratureRow({
        procedure: "adminUpdate",
        values,
        // Toggling without the visibility columns would leave the audit trail
        // half-written, so the toggle is refused until 0269 has run.
        requireColumns: inAffiliateLibrary !== undefined
          ? ["visibility", "affiliateToggledAt", "affiliateToggledBy"]
          : [],
        write: (next) => db.update(affiliateLiterature).set(next).where(eq(affiliateLiterature.id, id)),
      }));
      return { id };
    }),

  adminDelete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db
        .select({ id: affiliateLiterature.id, mimeType: affiliateLiterature.mimeType })
        .from(affiliateLiterature)
        .where(eq(affiliateLiterature.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "That library file was not found." });
      // A commercial is archived. The storage object stays. Documents keep the
      // existing row delete, which still does not delete the stored file.
      if (isCommercialVideoMime(existing.mimeType)) {
        try {
          await archiveLibraryCommercial(db, existing.id, { id: ctx.user.id, name: ctx.user.name ?? null });
        } catch (error) {
          if (error instanceof LibraryCommercialSchemaError) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
          }
          throw error;
        }
        return { id: existing.id, archived: true as const };
      }
      await logged("adminDelete", () => db.delete(affiliateLiterature).where(eq(affiliateLiterature.id, input.id)));
      return { id: input.id, archived: false as const };
    }),
});
