/**
 * One-off helper. Do not run it from deploy, CI, or a test.
 *
 * The document library (cabinet_dealz.affiliate_literature) stores filename
 * and sizeBytes and, until docs/sql/0273 is pasted, no content hash. This
 * script reads each row whose contentSha256 is empty, downloads that object's
 * bytes from the private library bucket, and PRINTS an UPDATE the owner can
 * review and paste. It does not execute the UPDATE. It does not delete a row
 * or an object.
 *
 *   pnpm exec tsx scripts/hash-library-files.ts
 *
 * Required environment variable names (values are never printed):
 *   DATABASE_URL
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Paste docs/sql/0273 first. If contentSha256 does not exist yet, this script
 * stops before it downloads anything.
 */
import { eq, or, isNull } from "drizzle-orm";
import { affiliateLiterature } from "../drizzle/schema";
import { libraryHashUpdateStatement, sha256Hex } from "../shared/libraryFileHash";
import { getDb } from "../server/db";
import { storageFetchObject } from "../server/storage";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL is not set. No query was run and nothing was printed.");
    process.exitCode = 1;
    return;
  }
  let rows: Array<{ id: number; fileKey: string; filename: string; contentSha256: string | null }>;
  try {
    rows = await db
      .select({
        id: affiliateLiterature.id,
        fileKey: affiliateLiterature.fileKey,
        filename: affiliateLiterature.filename,
        contentSha256: affiliateLiterature.contentSha256,
      })
      .from(affiliateLiterature)
      .where(or(isNull(affiliateLiterature.contentSha256), eq(affiliateLiterature.contentSha256, "")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Could not read affiliate_literature.contentSha256 (${message}). Paste docs/sql/0273 first. Nothing was downloaded.`);
    process.exitCode = 1;
    return;
  }

  console.log("-- Review these statements. They are not executed by this script.");
  console.log("-- Each one sets contentSha256 only when it is still empty.");
  for (const row of rows) {
    if (!row.fileKey) {
      console.log(`-- skip id ${row.id}: no file key`);
      continue;
    }
    const response = await storageFetchObject(row.fileKey);
    if (!response.ok) {
      console.log(`-- skip id ${row.id} (${row.filename}): storage answered ${response.status}`);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    console.log(libraryHashUpdateStatement(row.id, sha256Hex(bytes)));
  }
  console.log("-- end. Paste any line you have checked into the TiDB editor yourself.");
}

const isDirectRun = process.argv[1]?.includes("hash-library-files");
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "hash script failed");
    process.exitCode = 1;
  });
}
