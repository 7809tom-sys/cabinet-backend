// Re-format platformSku from CABINET-COLOR-DIST  ->  DIST-COLOR-CABINET
// Safe: prints collision check first; applies across all 4 tables in ONE transaction;
// re-verifies uniqueness; rolls back on any mismatch.
// Usage: node scripts/reformat_skus.mjs --apply   (omit --apply for dry-run)

import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Tables that carry the platformSku string.
const TABLES = ["distributor_skus", "pantry_bundles", "cart_items", "order_items"];

// Transform one SKU string: last seg = dist, second-to-last = color, the rest = cabinet.
function reformat(sku) {
  if (typeof sku !== "string" || !sku.includes("-")) return null;
  const parts = sku.split("-");
  if (parts.length < 3) return null; // need at least cab + color + dist
  const dist = parts[parts.length - 1];
  const color = parts[parts.length - 2];
  const cabinet = parts.slice(0, parts.length - 2).join("-");
  if (!dist || !color || !cabinet) return null;
  return `${dist}-${color}-${cabinet}`;
}

const conn = await mysql.createConnection(url);
try {
  // --- 1. Collision / sanity check on the source-of-truth table ---
  const [rows] = await conn.query(`SELECT platformSku FROM distributor_skus`);
  const olds = rows.map((r) => r.platformSku);
  const news = [];
  const bad = [];
  for (const s of olds) {
    const n = reformat(s);
    if (!n) bad.push(s);
    else news.push(n);
  }
  const distinctNew = new Set(news);
  console.log("=== DRY-RUN CHECK (distributor_skus) ===");
  console.log("total rows         :", olds.length);
  console.log("transformable      :", news.length);
  console.log("untransformable    :", bad.length, bad.slice(0, 10));
  console.log("distinct new SKUs  :", distinctNew.size);
  console.log("collision-free     :", distinctNew.size === news.length);
  console.log("samples            :");
  for (const s of olds.slice(0, 6)) console.log("   ", s, "=>", reformat(s));

  if (bad.length > 0) {
    console.error("\nABORT: some SKUs could not be transformed. Fix before applying.");
    process.exit(2);
  }
  if (distinctNew.size !== news.length) {
    console.error("\nABORT: transform would create duplicate SKUs. Not safe to apply.");
    process.exit(3);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to perform the update.");
    process.exit(0);
  }

  // --- 2. Apply across all tables inside one transaction ---
  console.log("\n=== APPLYING (transaction) ===");
  await conn.beginTransaction();
  const counts = {};
  for (const t of TABLES) {
    // Only rows whose platformSku has >=2 dashes get reordered; others (NULL) untouched.
    const [res] = await conn.query(
      `UPDATE ${t}
         SET platformSku = CONCAT(
           SUBSTRING_INDEX(platformSku, '-', -1), '-',
           SUBSTRING_INDEX(SUBSTRING_INDEX(platformSku, '-', -2), '-', 1), '-',
           SUBSTRING_INDEX(platformSku, '-', LENGTH(platformSku) - LENGTH(REPLACE(platformSku, '-', '')) - 1)
         )
       WHERE platformSku IS NOT NULL
         AND (LENGTH(platformSku) - LENGTH(REPLACE(platformSku, '-', ''))) >= 2`
    );
    counts[t] = res.affectedRows;
    console.log(`  ${t}: ${res.affectedRows} rows updated`);
  }

  // --- 3. Verify uniqueness on the catalog table post-update ---
  const [chk] = await conn.query(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT platformSku) AS distinct_skus FROM distributor_skus`
  );
  const { total, distinct_skus } = chk[0];
  console.log(`  verify distributor_skus: total=${total} distinct=${distinct_skus}`);
  const [samp] = await conn.query(`SELECT platformSku FROM distributor_skus LIMIT 5`);
  console.log("  post samples:", samp.map((r) => r.platformSku).join(", "));

  if (Number(total) !== Number(distinct_skus)) {
    console.error("VERIFY FAILED: duplicates present. Rolling back.");
    await conn.rollback();
    process.exit(4);
  }

  await conn.commit();
  console.log("\nCOMMITTED. SKU re-format complete.");
} catch (e) {
  try { await conn.rollback(); } catch {}
  console.error("ERROR (rolled back):", e.message);
  process.exit(1);
} finally {
  await conn.end();
}
