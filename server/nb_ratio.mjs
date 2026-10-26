import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query("SELECT distributorSku, listPrice, yourCost, wholesalePrice, contractorPrice, homeownerPrice FROM distributor_skus WHERE distributorId=2 AND styleId=30001 LIMIT 12");
console.log("ASP tier ratios (relative to listPrice):");
for (const r of rows) {
  const lp = parseFloat(r.listPrice);
  const f = v => v==null? 'null' : (parseFloat(v)/lp).toFixed(4);
  console.log(`${r.distributorSku} list=${r.listPrice} cost=${r.yourCost}(${f(r.yourCost)}) whl=${r.wholesalePrice}(${f(r.wholesalePrice)}) con=${r.contractorPrice}(${f(r.contractorPrice)}) home=${r.homeownerPrice}(${f(r.homeownerPrice)})`);
}
await conn.end();
