/**
 * Idempotent move of government-ID objects out of the public storage bucket.
 *
 * This script is NOT run by deployment or by tests. Run it once, after review,
 * on the environment that holds the existing files:
 *
 *   pnpm exec tsx server/scripts/move-affiliate-w9-ids-to-private-storage.ts
 *
 * Required environment variable names (do not print their values):
 *   DATABASE_URL
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * What it does:
 *   1. Reads affiliates.w9IdDocumentUrl.
 *   2. Copies affiliate-w9-id/* from the public site-media bucket into private-files.
 *   3. Deletes the public object after the private copy is readable.
 *   4. Leaves the stored key in place so signed URLs keep resolving.
 * Re-running skips objects that are already in the private bucket.
 */
import { eq, isNotNull } from "drizzle-orm";
import { affiliates } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageKeyFromStoredUrl } from "../lib/storageAccess";
import {
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
  storageCopyBetweenBuckets,
  storageDeleteFromBucket,
  storageObjectExistsInBucket,
} from "../storage";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ id: affiliates.id, w9IdDocumentUrl: affiliates.w9IdDocumentUrl })
    .from(affiliates)
    .where(isNotNull(affiliates.w9IdDocumentUrl));

  let copied = 0;
  let already = 0;
  let missing = 0;
  for (const row of rows) {
    const stored = row.w9IdDocumentUrl;
    if (!stored) continue;
    const key = storageKeyFromStoredUrl(stored);
    if (!key.startsWith("affiliate-w9-id/")) {
      console.log(`skip affiliate ${row.id}: document key is not affiliate-w9-id/`);
      continue;
    }
    const result = await storageCopyBetweenBuckets(key, PUBLIC_BUCKET, PRIVATE_BUCKET);
    if (result === "missing") {
      const privateReady = await storageObjectExistsInBucket(PRIVATE_BUCKET, key);
      if (!privateReady) {
        missing += 1;
        console.log(`missing affiliate ${row.id}: object not in public or private storage`);
        continue;
      }
      already += 1;
    } else if (result === "already-present") {
      already += 1;
    } else {
      copied += 1;
    }
    if (await storageObjectExistsInBucket(PRIVATE_BUCKET, key)) {
      await storageDeleteFromBucket(PUBLIC_BUCKET, key);
    }
    if (!stored.includes(`/manus-storage/${key}`)) {
      await db.update(affiliates).set({ w9IdDocumentUrl: `/manus-storage/${key}` }).where(eq(affiliates.id, row.id));
    }
  }
  console.log(`affiliate W-9 ID move complete: copied=${copied} already=${already} missing=${missing}`);
}

const invokedDirectly = process.argv[1]?.includes("move-affiliate-w9-ids-to-private-storage");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "W-9 ID move failed");
    process.exitCode = 1;
  });
}
