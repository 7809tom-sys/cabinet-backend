/**
 * revert-backfill-style-skus.mjs
 *
 * Removes exactly the rows inserted by backfill-style-skus.mjs, using the
 * inserted-platformSku list it wrote. Restores per-door-style cabinet
 * availability (each style only offers its own published cabinets).
 *
 * Usage: node scripts/revert-backfill-style-skus.mjs <inserted-list.json>
 */
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const listPath = process.argv[2];
if (!listPath) {
  console.error("Pass the inserted-list JSON path as the first arg.");
  process.exit(1);
}
const list = JSON.parse(readFileSync(listPath, "utf8"));
console.log(`Revert list contains ${list.length} platformSkus.`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
async function rows(sql, params = []) {
  const [r] = await conn.execute(sql, params);
  return r;
}

const [[before]] = [await rows("SELECT COUNT(*) n FROM distributor_skus")];
console.log("rows before:", before.n);

let deleted = 0;
const CH = 300;
for (let i = 0; i < list.length; i += CH) {
  const chunk = list.slice(i, i + CH);
  const ph = chunk.map(() => "?").join(",");
  const res = await rows(
    `DELETE FROM distributor_skus WHERE platformSku IN (${ph})`,
    chunk
  );
  deleted += res.affectedRows ?? 0;
  console.log(`  deleted ${deleted}/${list.length}`);
}

const [[after]] = [await rows("SELECT COUNT(*) n FROM distributor_skus")];
console.log("rows after:", after.n, " (deleted", deleted, ")");

await conn.end();
