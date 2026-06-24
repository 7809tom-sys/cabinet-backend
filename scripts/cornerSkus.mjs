import mysql from "mysql2/promise";
import fs from "fs";

const url = fs.readFileSync("/tmp/dburl.txt", "utf8").trim();
const conn = await mysql.createConnection(url);

const codes = ["ERB-33","ERB-36","WER-24-30","WER-24-36","WER-24-42",
  "DCW-24-30","DCW-24-36","WBC-24-30","WBC-27-30","BBC-36","BBC-39","CB-9",
  "LSB33","LSB36","LSB36ADA"];

const out = [];
for (const code of codes) {
  const [c] = await conn.execute(
    `SELECT id, masterCode, placementType, width, height, depth, isActive, conflictStatus FROM cabinets WHERE masterCode=?`,
    [code]
  );
  if (!c.length) { out.push(`${code}: NOT FOUND`); continue; }
  const cab = c[0];
  const [skus] = await conn.execute(
    `SELECT s.id, s.styleId, s.isPublished, s.isAvailable, d.ourName styleName
     FROM distributor_skus s LEFT JOIN door_styles d ON d.id=s.styleId
     WHERE s.cabinetId=?`,
    [cab.id]
  );
  const pub = skus.filter(s => s.isPublished && s.isAvailable);
  out.push(`${code} | place=${cab.placementType} | dims=${cab.width}x${cab.height}x${cab.depth} | active=${cab.isActive} | conflict=${cab.conflictStatus} | totalSkus=${skus.length} | published+available=${pub.length}`);
  if (pub.length) {
    out.push(`    styles: ${pub.map(s=>`${s.styleName||s.styleId}`).slice(0,8).join(", ")}`);
  } else if (skus.length) {
    out.push(`    has SKUs but none published+available (pub flags: ${skus.map(s=>`${s.isPublished}/${s.isAvailable}`).slice(0,5).join(",")})`);
  }
}
fs.writeFileSync("/tmp/corner_skus.txt", out.join("\n"));
console.log(out.join("\n"));
await conn.end();
