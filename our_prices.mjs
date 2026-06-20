import mysql from "mysql2/promise";

const c = await mysql.createConnection(process.env.DATABASE_URL);

// 8 common SKUs to compare. Map our master codes.
const skus = ["B-12", "B-24", "B-30", "W-12-30", "W-24-30", "W-30-30", "SB-36", "B-15"];

// For each, get the cheapest (value line) and premium homeowner price for a white shaker style
for (const code of skus) {
  const [rows] = await c.query(
    `SELECT d.name dist, d.code distcode, ds.ourName style, ds.distributorName diststyle,
            sk.listPrice, sk.homeownerPrice
     FROM distributor_skus sk
     JOIN door_styles ds ON sk.styleId = ds.id
     JOIN cabinets cb ON sk.cabinetId = cb.id
     JOIN distributors d ON sk.distributorId = d.id
     WHERE cb.masterCode = ?
       AND (ds.distributorName LIKE '%White%' OR ds.distributorName LIKE '%Shaker White%')
     ORDER BY CAST(sk.homeownerPrice AS DECIMAL(10,2)) ASC`,
    [code]
  );
  if (rows.length === 0) {
    console.log(`${code}: NO MATCH (white shaker)`);
    continue;
  }
  const cheapest = rows[0];
  const dearest = rows[rows.length - 1];
  console.log(
    `${code} | value: ${cheapest.distcode} ${cheapest.style} $${cheapest.homeownerPrice} (list ${cheapest.listPrice}) | premium: ${dearest.distcode} ${dearest.style} $${dearest.homeownerPrice} (list ${dearest.listPrice})`
  );
}
await c.end();
