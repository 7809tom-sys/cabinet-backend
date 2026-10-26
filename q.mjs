import mysql from "mysql2/promise";
const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url + (url.includes("?")?"&":"?") + "ssl={\"rejectUnauthorized\":true}");
const groups = {
  "Roll Out Shelf": "subCategory='Roll Out Shelf'",
  "Roll-Out Tray": "subCategory='Roll-Out Tray'",
  "Decorative End Panel": "subCategory='Decorative End Panel'",
  "Trim & Molding": "subCategory='Trim & Molding'",
  "Hardware": "subCategory='Hardware'",
  "Filler F-%": "masterCode LIKE 'F-%'",
  "Filler-desc": "LOWER(description) LIKE '%filler%'",
  "TUK": "masterCode='TUK'",
};
for (const [k,w] of Object.entries(groups)) {
  const [rows] = await conn.query(`SELECT COUNT(*) n FROM cabinets WHERE isActive=1 AND ${w}`);
  console.log(k.padEnd(22), rows[0].n);
}
// sample master codes for trim/filler
const [t] = await conn.query("SELECT masterCode, description FROM cabinets WHERE isActive=1 AND subCategory='Trim & Molding' LIMIT 8");
console.log("--- Trim & Molding sample:"); t.forEach(r=>console.log(" ", r.masterCode, "|", r.description));
const [f] = await conn.query("SELECT masterCode, description FROM cabinets WHERE isActive=1 AND LOWER(description) LIKE '%filler%' LIMIT 8");
console.log("--- Filler sample:"); f.forEach(r=>console.log(" ", r.masterCode, "|", r.description));
await conn.end();
