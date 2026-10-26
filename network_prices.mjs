import mysql from "mysql2/promise";

const c = await mysql.createConnection(process.env.DATABASE_URL);
const skus = ["B-12", "B-15", "B-24", "B-30", "W-12-30", "W-24-30", "W-30-30", "SB-36"];

const out = {};
for (const code of skus) {
  const [rows] = await c.query(
    `SELECT d.code distcode, d.name distname, ds.distributorName diststyle,
            sk.listPrice, sk.yourCost, sk.wholesalePrice, sk.contractorPrice, sk.homeownerPrice
     FROM distributor_skus sk
     JOIN door_styles ds ON sk.styleId = ds.id
     JOIN cabinets cb ON sk.cabinetId = cb.id
     JOIN distributors d ON sk.distributorId = d.id
     WHERE cb.masterCode = ?
       AND ds.distributorName LIKE '%Shaker White%'
     ORDER BY d.code, CAST(sk.homeownerPrice AS DECIMAL(10,2)) ASC`,
    [code]
  );
  // pick one representative white-shaker per distributor (the base/cheapest tier)
  const perDist = {};
  for (const r of rows) {
    if (!perDist[r.distcode]) perDist[r.distcode] = r;
  }
  out[code] = perDist;
  console.log(`\n=== ${code} ===`);
  for (const dc of Object.keys(perDist)) {
    const r = perDist[dc];
    console.log(`  ${dc} (${r.distname}) | ${r.diststyle} | list $${r.listPrice} cost $${r.yourCost} WS $${r.wholesalePrice} CON $${r.contractorPrice} HO $${r.homeownerPrice}`);
  }
}
await c.end();
