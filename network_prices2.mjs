import mysql from "mysql2/promise";

const c = await mysql.createConnection(process.env.DATABASE_URL);
const skus = ["B-12", "B-15", "B-24", "B-30", "W-12-30", "W-24-30", "W-30-30", "SB-36"];

// First: what white-ish shaker style names exist per distributor?
const [styles] = await c.query(
  `SELECT d.code distcode, ds.distributorName, ds.ourName
   FROM door_styles ds JOIN distributors d ON ds.distributorId = d.id
   WHERE ds.distributorName LIKE '%White%' OR ds.distributorName LIKE '%Shaker%'
   ORDER BY d.code, ds.distributorName`
);
console.log("WHITE/SHAKER STYLES PER DISTRIBUTOR:");
for (const s of styles) console.log(`  ${s.distcode} | ${s.distributorName}  -> ${s.ourName}`);

console.log("\n\nPER-SKU per-distributor cheapest white shaker:");
for (const code of skus) {
  const [rows] = await c.query(
    `SELECT d.code distcode, ds.distributorName diststyle, sk.listPrice,
            sk.yourCost, sk.wholesalePrice, sk.contractorPrice, sk.homeownerPrice
     FROM distributor_skus sk
     JOIN door_styles ds ON sk.styleId = ds.id
     JOIN cabinets cb ON sk.cabinetId = cb.id
     JOIN distributors d ON sk.distributorId = d.id
     WHERE cb.masterCode = ?
       AND (ds.distributorName LIKE '%White Shaker%' OR ds.distributorName LIKE '%Shaker White%' OR ds.distributorName = 'White Shaker')
     ORDER BY d.code, CAST(sk.homeownerPrice AS DECIMAL(10,2)) ASC`,
    [code]
  );
  const perDist = {};
  for (const r of rows) if (!perDist[r.distcode]) perDist[r.distcode] = r;
  console.log(`\n=== ${code} ===`);
  for (const dc of ["UCD", "CS", "SK"]) {
    const r = perDist[dc];
    if (r) console.log(`  ${dc} | ${r.diststyle} | cost $${r.yourCost} WS $${r.wholesalePrice} CON $${r.contractorPrice} HO $${r.homeownerPrice}`);
    else console.log(`  ${dc} | (not carried)`);
  }
}
await c.end();
