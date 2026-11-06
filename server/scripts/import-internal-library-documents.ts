/**
 * Upload the committed internal proposal into the private storage bucket.
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
 * What it does:
 *   1. Reads the committed PDF from `docs/library/internal/` in the frontend repo.
 *   2. Uploads it under the exact `library-documents/internal/...` key that
 *      docs/sql/0255_library_internal_documents.tidb.sql stores in the row.
 *   3. Reports the row's visibility so a wrong value is visible, not silent.
 *
 * It uploads bytes only. It never creates a row, never changes visibility, and
 * never sets isPublished. That is the SQL's job and the admin checkbox's job.
 *
 * The key is under `library-documents/`, which `server/storage.ts` puts in the
 * private bucket and `server/_core/storageProxy.ts` refuses on a public path, so
 * the file is reachable only through a signed URL from an admin procedure.
 *
 * Re-running is safe: it overwrites the same object with the same bytes.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { affiliateLiterature } from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { isAffiliateLibraryDocument } from "@shared/libraryVisibility";

const DOCUMENT_FILE = "website-improvement-proposal-marazzi-lessons-cabinetdealz.pdf";
const STORED_KEY = `library-documents/internal/${DOCUMENT_FILE}`;

/** Optional: point at the frontend checkout that holds docs/library/internal. */
function documentPath() {
  const fromEnv = process.env.FRONTEND_REPO_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv, "docs/library/internal", DOCUMENT_FILE);
  return resolve(process.cwd(), "docs/library/internal", DOCUMENT_FILE);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const filePath = documentPath();
  const bytes = readFileSync(filePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const [row] = await db
    .select()
    .from(affiliateLiterature)
    .where(eq(affiliateLiterature.fileKey, STORED_KEY))
    .limit(1);
  if (!row) {
    throw new Error(
      `No affiliate_literature row points at ${STORED_KEY}. Run ` +
        "docs/sql/0255_library_internal_documents.tidb.sql first.",
    );
  }

  await storagePut(STORED_KEY, bytes, "application/pdf");

  console.log(`Uploaded ${bytes.length} bytes to the private bucket as ${STORED_KEY}`);
  console.log(`SHA-256 ${sha256}`);
  console.log(
    row.visibility === "internal" && !isAffiliateLibraryDocument(row)
      ? `Row ${row.id} is internal: admin only, not visible to affiliates.`
      : `WARNING: row ${row.id} is visibility=${row.visibility} isPublished=${row.isPublished}. ` +
          "This document is meant to stay internal; fix it in the admin page.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
