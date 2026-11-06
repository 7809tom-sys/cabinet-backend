/**
 * Upload the committed internal library documents into the private bucket.
 *
 * Run it once, after reviewing this patch, on the environment whose DATABASE_URL
 * points at the live TiDB database:
 *
 *   pnpm exec tsx server/scripts/import-internal-library-documents.ts
 *
 * Required environment variable names (values are never printed):
 *   DATABASE_URL
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   FRONTEND_REPO_ROOT   the cabinet-frontend checkout that holds docs/library/internal
 *
 * What it does, for every document in `shared/internalLibraryDocuments.ts`:
 *   1. Reads the committed file from `docs/library/internal/` in the frontend repo.
 *   2. Checks the bytes against the manifest's size and SHA-256, so a truncated
 *      or re-encoded file stops here instead of becoming a broken download.
 *   3. Uploads it under the exact `library-documents/internal/...` key the SQL
 *      under docs/sql/ stores in the row, with that row's mimeType.
 *   4. Reports the matching row's visibility, so a wrong value is visible.
 *
 * It uploads bytes only. It never creates a row, never changes visibility, and
 * never sets isPublished. That is the SQL's job and the admin checkbox's job.
 *
 * The keys are under `library-documents/`, which `server/storage.ts` puts in the
 * private bucket and `server/_core/storageProxy.ts` refuses on a public path, so
 * each document is reachable only through a signed URL.
 *
 * Safe to re-run: it overwrites the same objects with the same bytes.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { affiliateLiterature } from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import {
  INTERNAL_LIBRARY_DOCUMENTS,
  internalLibraryDocumentPath,
  type InternalLibraryDocument,
} from "@shared/internalLibraryDocuments";
import { isAffiliateLibraryDocument } from "@shared/libraryVisibility";

/** Optional: point at the frontend checkout that holds docs/library/internal. */
function documentPath(document: InternalLibraryDocument) {
  const fromEnv = process.env.FRONTEND_REPO_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv, internalLibraryDocumentPath(document));
  return resolve(process.cwd(), internalLibraryDocumentPath(document));
}

function readVerifiedBytes(document: InternalLibraryDocument) {
  const filePath = documentPath(document);
  const bytes = readFileSync(filePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== document.sizeBytes) {
    throw new Error(
      `${filePath} is ${bytes.length} bytes but the library row for "${document.title}" records ` +
        `${document.sizeBytes}. Fix the committed file or the row, then re-run.`,
    );
  }
  if (sha256 !== document.sha256) {
    throw new Error(
      `${filePath} has SHA-256 ${sha256} but the manifest records ${document.sha256}. ` +
        "Uploading it would leave a download that is not the document the row describes.",
    );
  }
  return { bytes, sha256 };
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const document of INTERNAL_LIBRARY_DOCUMENTS) {
    const { bytes, sha256 } = readVerifiedBytes(document);

    await storagePut(document.storageKey, bytes, document.mimeType);
    console.log(`Uploaded ${bytes.length} bytes to the private bucket as ${document.storageKey}`);
    console.log(`SHA-256 ${sha256}`);

    const [row] = await db
      .select()
      .from(affiliateLiterature)
      .where(eq(affiliateLiterature.fileKey, document.storageKey))
      .limit(1);
    if (!row) {
      // Not fatal: the SQL that registers the row can run after this.
      console.log(
        `No affiliate_literature row points at ${document.storageKey} yet. ` +
          "Run the SQL that registers it, then open it from the admin library.",
      );
      continue;
    }
    console.log(
      row.visibility === "internal" && !isAffiliateLibraryDocument(row)
        ? `Row ${row.id} is internal: admin only, not visible to affiliates.`
        : `WARNING: row ${row.id} is visibility=${row.visibility} isPublished=${row.isPublished}. ` +
            "This document is meant to stay internal; fix it in the admin page.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
