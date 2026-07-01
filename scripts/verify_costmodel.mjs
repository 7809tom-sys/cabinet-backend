import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

let url = process.env.DATABASE_URL;
if (!url) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  url = m ? m[1].trim().replace(/^"|"$/g, "") : "";
}
const conn = await mysql.createConnection(url);

const [dists] = await conn.query(
  "SELECT id, code, name, costMultiplier FROM distributors ORDER BY id"
);
console.log("Distributors and their costMultiplier:");
for (const d of dists) console.log(`  #${d.id} ${d.code} (${d.name}): x${d.costMultiplier}`);

console.log("\nCheck: does yourCost ≈ listPrice × costMultiplier?  (sample 3 SKUs per distributor)");
for (const d of dists) {
  const [rows] = await conn.query(
    `SELECT platformSku, listPrice, yourCost, wholesalePrice, adjustedListPrice
     FROM distributor_skus
     WHERE distributorId = ? AND listPrice IS NOT NULL
     LIMIT 3`,
    [d.id]
  );
  console.log(`\n  #${d.id} ${d.code} (x${d.costMultiplier}):`);
  for (const r of rows) {
    const expected = r.listPrice != null ? Math.round(Number(r.listPrice) * Number(d.costMultiplier) * 100) / 100 : null;
    console.log(
      `    ${r.platformSku}: list=$${r.listPrice}  ×${d.costMultiplier}=$${expected}  ` +
      `| yourCost=$${r.yourCost}  wholesale=$${r.wholesalePrice}  adjList=$${r.adjustedListPrice}`
    );
  }
}
await conn.end();
