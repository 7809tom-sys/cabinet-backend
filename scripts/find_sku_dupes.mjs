import mysql from "mysql2/promise";
const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
function reformat(sku) {
  const p = sku.split("-");
  return `${p[p.length-1]}-${p[p.length-2]}-${p.slice(0,p.length-2).join("-")}`;
}
const [rows] = await conn.query(
  `SELECT id, platformSku, cabinetId, distributorId, styleId, distributorSku, listPrice, imageUrl FROM distributor_skus`
);
const byNew = new Map();
for (const r of rows) {
  const n = reformat(r.platformSku);
  if (!byNew.has(n)) byNew.set(n, []);
  byNew.get(n).push(r);
}
const dupeGroups = [...byNew.entries()].filter(([, v]) => v.length > 1);
console.log("collision groups:", dupeGroups.length);
let totalExtra = 0;
for (const [, v] of dupeGroups) totalExtra += v.length - 1;
console.log("extra rows (would be lost to UNIQUE):", totalExtra);
console.log("\n--- first 15 collision groups ---");
for (const [n, v] of dupeGroups.slice(0, 15)) {
  console.log(`\nNEW SKU ${n}  (${v.length} rows)`);
  for (const r of v) {
    console.log(`   old=${r.platformSku} id=${r.id} cab=${r.cabinetId} dist=${r.distributorId} style=${r.styleId} dsku=${r.distributorSku} price=${r.listPrice} img=${r.imageUrl ? "Y" : ""}`);
  }
}
await conn.end();
