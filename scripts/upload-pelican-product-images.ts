/**
 * Uploads the official Pelican product photos committed under
 * data/pelican/product-images/ to the app's existing storage (Supabase, via
 * server/storage.ts) under the exact keys used by
 * docs/sql/0270_pelican_missing_product_images.tidb.sql.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/upload-pelican-product-images.ts
 *   ... --dry-run    list what would be uploaded, upload nothing
 *
 * Keys are already content-hash names (<official-file-slug>_<sha256 first 8>.webp),
 * so re-running is idempotent (upsert) and can never change a stored address.
 * This script never touches the database. Run it BEFORE the SQL file.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { storageUploadExact } from "../server/storage";

const MANIFEST = new URL("../data/pelican/product-images-manifest.json", import.meta.url);
const IMAGE_DIR = new URL("../data/pelican/product-images/", import.meta.url);

type ManifestImage = {
  asset: string;
  storageKey: string;
  sha256: string;
  catalogRows: Array<{ id: number; pelicanCode: string }>;
};

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { images: ManifestImage[] };
const dryRun = process.argv.includes("--dry-run");

let uploaded = 0;
for (const image of manifest.images) {
  const bytes = readFileSync(new URL(image.asset, IMAGE_DIR));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== image.sha256) {
    throw new Error(`${image.asset} does not match the checksum recorded in the manifest. Refusing to upload.`);
  }
  if (dryRun) {
    console.log(`would upload ${image.asset} -> /manus-storage/${image.storageKey} (${image.catalogRows.length} row(s))`);
    continue;
  }
  await storageUploadExact(image.storageKey, bytes, "image/webp", { upsert: true });
  uploaded += 1;
  console.log(`uploaded ${image.asset} -> /manus-storage/${image.storageKey}`);
}

console.log(
  dryRun
    ? `DRY RUN: ${manifest.images.length} image(s) would be uploaded. Nothing was written.`
    : `Done. ${uploaded} image(s) uploaded. Now run docs/sql/0270_pelican_missing_product_images.tidb.sql.`,
);
