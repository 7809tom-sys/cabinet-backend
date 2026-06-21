import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs";

let url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

// Parse the ?ssl={...} query param the way drizzle/mysql2 expects.
let ssl;
const qIdx = url.indexOf("?");
if (qIdx !== -1) {
  const params = new URLSearchParams(url.slice(qIdx + 1));
  const sslRaw = params.get("ssl");
  if (sslRaw) ssl = JSON.parse(sslRaw);
  url = url.slice(0, qIdx);
}

const conn = await mysql.createConnection(ssl ? { uri: url, ssl } : url);
const [rows] = await conn.execute(`
  SELECT c.masterCode, c.description, c.category, c.subCategory,
         c.width, c.height, c.depth, c.numberOfDoors, c.numberOfDrawers,
         c.graphicType,
         COUNT(DISTINCT s.distributorId) AS linesWithSku
  FROM cabinets c
  LEFT JOIN distributor_skus s ON s.cabinetId = c.id
  GROUP BY c.id
  ORDER BY c.category, c.masterCode
`);
await conn.end();

function esc(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const headers = ["Code","Description","Category","SubCategory","Width","Height","Depth","Doors","Drawers","GraphicType","LinesWithSKU"];
const lines = [headers.join(",")];
for (const r of rows) {
  lines.push([
    r.masterCode, r.description, r.category, r.subCategory,
    r.width ?? "", r.height ?? "", r.depth ?? "",
    r.numberOfDoors ?? 0, r.numberOfDrawers ?? 0, r.graphicType ?? "",
    r.linesWithSku ?? 0,
  ].map(esc).join(","));
}
fs.writeFileSync("/home/ubuntu/cabinet-dealz-master-catalog.csv", lines.join("\n") + "\n");
console.log(`Wrote ${rows.length} cabinets.`);
