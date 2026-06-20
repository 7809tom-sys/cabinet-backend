/**
 * Cabinet Dealz — Remap distributor_skus.cabinetId to current cabinet IDs.
 * Matches platformSku master segment to cabinets.masterCode via normalized key
 * (uppercase, strip non-alphanumerics). styleId was already remapped earlier.
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

const [cabs] = await conn.query("SELECT id, masterCode FROM cabinets");
const cabByNorm = new Map();
for (const c of cabs) cabByNorm.set(norm(c.masterCode), c.id);

const [skus] = await conn.query("SELECT id, platformSku, cabinetId FROM distributor_skus");
console.log(`Processing ${skus.length} SKUs against ${cabByNorm.size} cabinets`);

const updates = [];
let miss = 0;
for (const s of skus) {
  const parts = String(s.platformSku).split("-");
  const master = parts.slice(0, parts.length - 2).join("-");
  const newId = cabByNorm.get(norm(master));
  if (!newId) { miss++; continue; }
  if (newId !== s.cabinetId) updates.push({ id: s.id, cabinetId: newId });
}
console.log(`Updates needed: ${updates.length}, misses: ${miss}`);

const BATCH = 500;
for (let i = 0; i < updates.length; i += BATCH) {
  const chunk = updates.slice(i, i + BATCH);
  const ids = chunk.map((u) => u.id);
  const cabCase = chunk.map((u) => `WHEN ${u.id} THEN ${u.cabinetId}`).join(" ");
  await conn.query(
    `UPDATE distributor_skus SET cabinetId = CASE id ${cabCase} END WHERE id IN (${ids.join(",")})`
  );
  process.stdout.write(`\r  ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
}
console.log("\nDone.");

const [v] = await conn.query(`
  SELECT
    SUM(CASE WHEN c.id IS NULL THEN 1 ELSE 0 END) AS orphan_cab,
    SUM(CASE WHEN d.id IS NULL THEN 1 ELSE 0 END) AS orphan_style,
    COUNT(*) total
  FROM distributor_skus s
  LEFT JOIN cabinets c ON s.cabinetId = c.id
  LEFT JOIN door_styles d ON s.styleId = d.id
`);
console.log("AFTER REMAP:", JSON.stringify(v[0]));
await conn.end();
