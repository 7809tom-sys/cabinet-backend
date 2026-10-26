import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("NO DATABASE_URL"); process.exit(1); }
const conn = await mysql.createConnection(url);

const [ws] = await conn.query("SELECT id, masterCode, description, width, height, depth, physicalWidth, category, subCategory, placementType, isActive FROM cabinets WHERE masterCode = 'WS-12-42'");
console.log("WS-12-42 row:", JSON.stringify(ws, null, 2));

const [w1242] = await conn.query("SELECT id, masterCode, description, width, height, depth, isActive FROM cabinets WHERE masterCode = 'W-12-42'");
console.log("W-12-42 row:", JSON.stringify(w1242, null, 2));

const id = ws[0]?.id;
if (id != null) {
  const [skus] = await conn.query("SELECT COUNT(*) AS n FROM distributor_skus WHERE cabinetId = ?", [id]);
  const [oi] = await conn.query("SELECT COUNT(*) AS n FROM order_items WHERE cabinetId = ?", [id]);
  console.log("WS-12-42 sku_count:", skus[0].n, "order_items:", oi[0].n);
  // sample a couple skus
  const [sample] = await conn.query("SELECT id, platformSku, distributorSku, styleId FROM distributor_skus WHERE cabinetId = ? LIMIT 5", [id]);
  console.log("sample skus:", JSON.stringify(sample, null, 2));
}

// Any other obviously-corrupt wall cabinets: depth < 1 or height>90 in Wall category
const [bad] = await conn.query("SELECT id, masterCode, description, width, height, depth FROM cabinets WHERE category='Wall' AND (depth < 1 OR height > 90 OR width > 60) ORDER BY masterCode");
console.log("Other suspicious Wall rows:", JSON.stringify(bad, null, 2));

await conn.end();
