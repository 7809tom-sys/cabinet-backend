import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [byStyle] = await conn.query(`SELECT ds.styleId, dst.styleCode, dst.ourName, COUNT(*) n FROM distributor_skus ds LEFT JOIN door_styles dst ON ds.styleId=dst.id WHERE ds.distributorId=2 GROUP BY ds.styleId, dst.styleCode, dst.ourName ORDER BY n DESC`);
console.log("distId2 SKU counts by style (desc):");
for (const r of byStyle) console.log(`  ${r.styleCode} (${r.ourName}) styleId=${r.styleId}: ${r.n}`);
// Look at how listPrice vs yourCost ratio works: ASP-B24 sheet says list 521.66? our earlier DN sheet listPrice=497.28 our=188.97 -> ratio .38
// Show the cabinets table structure to map cabinetId
const [ccols] = await conn.query("SHOW COLUMNS FROM cabinets");
console.log("cabinets COLUMNS:", ccols.map(c=>c.Field).join(", "));
const [cab] = await conn.query("SELECT * FROM cabinets LIMIT 2");
console.log("sample cabinets:", JSON.stringify(cab, null, 2));
await conn.end();
