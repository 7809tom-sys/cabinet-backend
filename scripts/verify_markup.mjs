import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

let url = process.env.DATABASE_URL;
if (!url) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  url = m ? m[1].trim().replace(/^"|"$/g, "") : "";
}
const conn = await mysql.createConnection(url);

const [ps] = await conn.query("SELECT * FROM pricing_settings WHERE id = 1");
console.log("Pricing settings:", JSON.stringify(ps[0], null, 2));

// Pull a few published base SKUs with their cost columns for style 30046.
const [rows] = await conn.query(
  `SELECT s.platformSku, s.homeownerPrice, s.wholesalePrice, s.adjustedListPrice, s.yourCost, s.listPrice
   FROM distributor_skus s
   JOIN cabinets c ON c.id = s.cabinetId
   WHERE s.styleId = 30046 AND s.isPublished = 1 AND s.isAvailable = 1 AND c.category = 'Base'
   LIMIT 5`
);

const g = ps[0];
const NEUTRAL = 10000;
const costBase = (r) => {
  for (const k of ["yourCost", "wholesalePrice", "adjustedListPrice", "listPrice"]) {
    if (r[k] != null && r[k] !== "") return Number(r[k]);
  }
  return null;
};
const sell = (r, bps) => {
  const b = costBase(r);
  return b == null ? null : Math.round(b * (bps / NEUTRAL) * 100) / 100;
};

console.log("\nGlobal markup bps:", g.globalMarkupBps, "(10000 = OFF/neutral)");
console.log("Homeowner bps:", g.homeownerMarkupBps, "Contractor:", g.contractorMarkupBps, "Wholesale:", g.wholesaleMarkupBps);
console.log("\nSKU checks (sell should = costBase × homeownerBps/10000, NOT stored homeownerPrice):");
for (const r of rows) {
  const cb = costBase(r);
  console.log(
    `  ${r.platformSku}: costBase=$${cb}  stored_homeownerPrice=$${r.homeownerPrice}  ` +
    `NEW homeowner sell=$${sell(r, g.homeownerMarkupBps)}  contractor=$${sell(r, g.contractorMarkupBps)}  wholesale=$${sell(r, g.wholesaleMarkupBps)}`
  );
}
await conn.end();
