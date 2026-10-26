// Match extracted Pelican PDF product images to pelican_products by name,
// upload matched images to storage, and update imageUrl.
// Run with tsx so it reuses the app's drizzle connection + storage helpers.
//   pnpm tsx scripts/pelican_images.ts           -> dry run
//   pnpm tsx scripts/pelican_images.ts --apply   -> upload + update DB
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { pelicanProducts } from "../drizzle/pelicanSchema";
import { storagePut } from "../server/storage";

const APPLY = process.argv.includes("--apply");
const EXTRACT_DIR = "/home/ubuntu/pelican_extract";
const IMG_DIR = path.join(EXTRACT_DIR, "images");
const MAPPING = path.join(EXTRACT_DIR, "mapping.json");

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/["\u201c\u201d\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type Row = { name: string; page: number; img_file: string | null; w?: number; h?: number; is_placeholder?: boolean };

async function main() {
  const rows: Row[] = JSON.parse(fs.readFileSync(MAPPING, "utf8"));
  const real = rows.filter((r) => !r.is_placeholder && r.img_file);

  const byName = new Map<string, Row & { area: number }>();
  for (const r of real) {
    const k = norm(r.name);
    if (!k) continue;
    const area = (r.w || 0) * (r.h || 0);
    const prev = byName.get(k);
    if (!prev || area > prev.area) byName.set(k, { ...r, area });
  }

  const db = drizzle(process.env.DATABASE_URL!);
  const products = await db
    .select({ id: pelicanProducts.id, code: pelicanProducts.pelicanCode, name: pelicanProducts.name, imageUrl: pelicanProducts.imageUrl })
    .from(pelicanProducts);

  let matched = 0, alreadyHad = 0, noImage = 0;
  const plan: { id: number; name: string; img: string }[] = [];
  for (const p of products) {
    const candidates = [norm(p.name), norm(p.code)];
    let hit: (Row & { area: number }) | undefined;
    for (const c of candidates) {
      if (byName.has(c)) { hit = byName.get(c); break; }
    }
    if (!hit || !hit.img_file) { noImage++; continue; }
    matched++;
    if (p.imageUrl && p.imageUrl.trim()) alreadyHad++;
    plan.push({ id: p.id, name: p.name, img: hit.img_file });
  }

  console.log("products:", products.length);
  console.log("real PDF images (unique names):", byName.size);
  console.log("matched products:", matched);
  console.log("  (of which already had imageUrl):", alreadyHad);
  console.log("products with NO PDF match:", noImage);

  if (!APPLY) {
    console.log("\nDRY RUN - no uploads. Sample matches:");
    for (const m of plan.slice(0, 10)) console.log("  ", m.id, m.name, "->", m.img);
    process.exit(0);
  }

  console.log("\nAPPLYING: uploading", plan.length, "images...");
  let done = 0, failed = 0;
  for (const m of plan) {
    try {
      const buf = fs.readFileSync(path.join(IMG_DIR, m.img));
      const { url } = await storagePut(`pelican/${m.id}.png`, buf, "image/png");
      await db.update(pelicanProducts).set({ imageUrl: url }).where(eq(pelicanProducts.id, m.id));
      done++;
      if (done % 50 === 0) console.log("  uploaded", done, "/", plan.length);
    } catch (e) {
      failed++;
      console.error("  FAIL id", m.id, m.name, String(e).slice(0, 140));
    }
  }
  console.log("DONE. uploaded:", done, "failed:", failed);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
