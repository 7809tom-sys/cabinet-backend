/**
 * Uploads the three DL Cabinetry door sample photos to the app's existing storage (Supabase, via
 * server/storage.ts) under the exact keys used by data/distributors/dl-cabinetry/dl_door_images_tidb.sql.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/upload-dl-door-images.ts
 *
 * Keys are content-hash names (<slug>-door_<sha256 first 8>.png), so re-running is safe. It never touches the
 * database. Run it BEFORE the SQL file.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { storageUploadExact } from "../server/storage";

const ROOT = new URL("../data/distributors/dl-cabinetry/door-images/", import.meta.url);
const files = [
  { file: "white_shaker_door.png", slug: "white-shaker" },
  { file: "slim_shaker_alabaster_door.png", slug: "slim-shaker-alabaster" },
  { file: "slim_shaker_ebony_door.png", slug: "slim-shaker-ebony" },
];

for (const { file, slug } of files) {
  const bytes = readFileSync(new URL(file, ROOT));
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `dl-cabinetry-${slug}-door_${sha.slice(0, 8)}.png`;
  await storageUploadExact(key, bytes, "image/png", { upsert: true });
  console.log(`uploaded ${file} -> /manus-storage/${key}`);
}
