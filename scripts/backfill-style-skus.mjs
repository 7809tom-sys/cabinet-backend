/**
 * backfill-style-skus.mjs
 *
 * Closes the catalog gap where many cabinets show in the global Catalog
 * (cabinets.list, gated only by isActive) but NOT in the Design Tool for a
 * given door style (placeableCabinets / familyCatalog, which require a
 * published+available distributor_skus row for that exact styleId).
 *
 * Strategy (per active door style):
 *   1. Compute the "line master set" = every cabinet (masterCode) published
 *      on ANY style of that style's distributor line.
 *   2. For each cabinet in the line master that this style is missing, copy a
 *      donor SKU from the most-complete style on the SAME line that has it.
 *      Price fields (yourCost/listPrice/adjustedListPrice/wholesalePrice/
 *      contractorPrice/homeownerPrice) and distributorSku/supplierCabinetName
 *      are copied from the donor; platformSku is regenerated to be unique.
 *
 * SAFETY:
 *   - Backs up the FULL distributor_skus table to scripts/skus-backup-*.json
 *     before any INSERT.
 *   - Dry-run by default. Pass --live to actually INSERT.
 *
 * Usage:
 *   node scripts/backfill-style-skus.mjs            # dry run, prints plan
 *   node scripts/backfill-style-skus.mjs --live     # backup + insert
 */
import mysql from "mysql2/promise";
import { writeFileSync } from "node:fs";

const LIVE = process.argv.includes("--live");
const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function rows(sql, params = []) {
  const [r] = await conn.execute(sql, params);
  return r;
}

// ---- Reference data -------------------------------------------------------
const distributors = await rows(`SELECT id, code FROM distributors`);
const distById = new Map(distributors.map((d) => [d.id, d]));

const styles = await rows(`
  SELECT id AS styleId, ourName, styleCode, distributorId, isActive
  FROM door_styles
`);
const styleById = new Map(styles.map((s) => [s.styleId, s]));
const activeStyles = styles.filter((s) => s.isActive === 1);

// All published+available SKUs joined to active cabinets, with price fields.
const skus = await rows(`
  SELECT s.id, s.cabinetId, s.distributorId, s.styleId,
         s.distributorSku, s.listPrice, s.yourCost, s.adjustedListPrice,
         s.wholesalePrice, s.contractorPrice, s.homeownerPrice,
         s.supplierCabinetName,
         c.masterCode, c.isActive AS cabActive
  FROM distributor_skus s
  JOIN cabinets c ON c.id = s.cabinetId
  WHERE s.isPublished = 1 AND s.isAvailable = 1 AND c.isActive = 1
`);

// Existing platformSku set (to guarantee uniqueness on insert)
const existingPlatform = new Set(
  (await rows(`SELECT platformSku FROM distributor_skus`)).map((r) => r.platformSku)
);

// ---- Build indexes --------------------------------------------------------
// lineMasterCabinets: lineKey -> Map(masterCode -> cabinetId)
// stylePublished: styleId -> Set(masterCode)
// donorByLineCabinet: `${lineKey}|${masterCode}` -> array of donor SKU rows
const lineMasterCabinets = new Map();
const stylePublished = new Map();
const donorByLineCabinet = new Map();
const styleSkuCount = new Map(); // styleId -> count (to pick most complete donor)

for (const k of skus) {
  const st = styleById.get(k.styleId);
  const lineKey = st ? st.distributorId : k.distributorId;

  if (!lineMasterCabinets.has(lineKey)) lineMasterCabinets.set(lineKey, new Map());
  lineMasterCabinets.get(lineKey).set(k.masterCode, k.cabinetId);

  if (!stylePublished.has(k.styleId)) stylePublished.set(k.styleId, new Set());
  stylePublished.get(k.styleId).add(k.masterCode);

  const dk = `${lineKey}|${k.masterCode}`;
  if (!donorByLineCabinet.has(dk)) donorByLineCabinet.set(dk, []);
  donorByLineCabinet.get(dk).push(k);

  styleSkuCount.set(k.styleId, (styleSkuCount.get(k.styleId) ?? 0) + 1);
}

// Pick the best donor for a (line, masterCode): prefer the one whose style has
// the most published SKUs (most "complete" / canonical style on that line).
function bestDonor(lineKey, masterCode) {
  const list = donorByLineCabinet.get(`${lineKey}|${masterCode}`);
  if (!list || list.length === 0) return null;
  return list
    .slice()
    .sort((a, b) => (styleSkuCount.get(b.styleId) ?? 0) - (styleSkuCount.get(a.styleId) ?? 0))[0];
}

// ---- Plan inserts ---------------------------------------------------------
const inserts = [];
const usedPlatform = new Set(existingPlatform);

function makePlatformSku(masterCode, styleCode, distCode) {
  const base = `${masterCode}-${styleCode}-${distCode}`.toUpperCase();
  let candidate = base;
  let n = 2;
  while (usedPlatform.has(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  usedPlatform.add(candidate);
  return candidate;
}

for (const s of activeStyles) {
  const lineKey = s.distributorId;
  const master = lineMasterCabinets.get(lineKey);
  if (!master) continue;
  const have = stylePublished.get(s.styleId) ?? new Set();
  const distCode = distById.get(lineKey)?.code ?? `D${lineKey}`;

  for (const [masterCode, cabinetId] of master) {
    if (have.has(masterCode)) continue;
    const donor = bestDonor(lineKey, masterCode);
    if (!donor) continue;

    const platformSku = makePlatformSku(masterCode, s.styleCode, distCode);
    inserts.push({
      cabinetId,
      distributorId: lineKey,
      styleId: s.styleId,
      platformSku,
      distributorSku: donor.distributorSku,
      listPrice: donor.listPrice,
      yourCost: donor.yourCost,
      adjustedListPrice: donor.adjustedListPrice,
      wholesalePrice: donor.wholesalePrice,
      contractorPrice: donor.contractorPrice,
      homeownerPrice: donor.homeownerPrice,
      supplierCabinetName: donor.supplierCabinetName,
      _styleName: s.ourName,
      _masterCode: masterCode,
      _donorStyleId: donor.styleId,
    });
  }
}

// ---- Report ---------------------------------------------------------------
const byStyle = new Map();
for (const ins of inserts) {
  byStyle.set(ins._styleName, (byStyle.get(ins._styleName) ?? 0) + 1);
}
console.log(`Active styles: ${activeStyles.length}`);
console.log(`Planned new SKU rows: ${inserts.length}`);
console.log(`Styles receiving backfill: ${byStyle.size}`);
console.log("\nTop 15 styles by backfill count:");
[...byStyle.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([name, n]) => console.log(`  ${name}: +${n}`));

if (!LIVE) {
  console.log("\n[DRY RUN] No rows inserted. Re-run with --live to apply.");
  await conn.end();
  process.exit(0);
}

// ---- Backup then insert ---------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `scripts/skus-backup-${stamp}.json`;
const allSkus = await rows(`SELECT * FROM distributor_skus`);
writeFileSync(backupPath, JSON.stringify(allSkus, null, 2));
console.log(`\nBacked up ${allSkus.length} existing SKU rows to ${backupPath}`);

const insertedIdsPath = `scripts/skus-backfill-inserted-${stamp}.json`;
const insertedPlatformSkus = [];

let done = 0;
const CHUNK = 200;
for (let i = 0; i < inserts.length; i += CHUNK) {
  const chunk = inserts.slice(i, i + CHUNK);
  const values = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,1,1)").join(",");
  const params = [];
  for (const ins of chunk) {
    params.push(
      ins.cabinetId, ins.distributorId, ins.styleId, ins.platformSku,
      ins.distributorSku, ins.listPrice, ins.yourCost, ins.adjustedListPrice,
      ins.wholesalePrice, ins.contractorPrice, ins.homeownerPrice,
      ins.supplierCabinetName
    );
    insertedPlatformSkus.push(ins.platformSku);
  }
  await rows(
    `INSERT INTO distributor_skus
       (cabinetId, distributorId, styleId, platformSku, distributorSku,
        listPrice, yourCost, adjustedListPrice, wholesalePrice,
        contractorPrice, homeownerPrice, supplierCabinetName,
        isAvailable, isPublished)
     VALUES ${values}`,
    params
  );
  done += chunk.length;
  console.log(`  inserted ${done}/${inserts.length}`);
}

writeFileSync(insertedIdsPath, JSON.stringify(insertedPlatformSkus, null, 2));
console.log(`\nInserted ${done} rows. New platformSkus listed in ${insertedIdsPath}`);
console.log("To revert: DELETE FROM distributor_skus WHERE platformSku IN (<list>);");

await conn.end();
