// Standalone catalog export for physical review.
// Dumps every cabinet (code, description, category, subCategory, dimensions,
// door/drawer counts, graphicType image-name) plus a count of how many
// distributor lines carry it, so the user can spot mislabels (e.g. DWR-3).
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL in env");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const [rows] = await conn.execute(`
  SELECT
    c.masterCode        AS code,
    c.description       AS description,
    c.category          AS category,
    c.subCategory       AS subCategory,
    c.width             AS width,
    c.height            AS height,
    c.depth             AS depth,
    c.numberOfDoors     AS doors,
    c.numberOfDrawers   AS drawers,
    c.placementType     AS placementType,
    c.graphicType       AS graphicType,
    c.isCornerCabinet   AS isCorner,
    c.isActive          AS isActive,
    COUNT(DISTINCT ds.styleId) AS lines_with_sku
  FROM cabinets c
  LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id
  GROUP BY c.id
  ORDER BY c.category, c.subCategory, c.masterCode
`);

// CSV with safe quoting
const headers = [
  "Code",
  "Description",
  "Category",
  "SubCategory",
  "Width",
  "Height",
  "Depth",
  "Doors",
  "Drawers",
  "PlacementType",
  "GraphicType (image/graphic name)",
  "IsCorner",
  "IsActive",
  "LinesWithSku",
  "CORRECTION NOTES (fill in)",
];

const esc = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const lines = [headers.map(esc).join(",")];
for (const r of rows) {
  lines.push(
    [
      r.code,
      r.description,
      r.category,
      r.subCategory,
      r.width,
      r.height,
      r.depth,
      r.doors,
      r.drawers,
      r.placementType,
      r.graphicType,
      r.isCorner ? "yes" : "no",
      r.isActive ? "yes" : "no",
      r.lines_with_sku,
      "",
    ]
      .map(esc)
      .join(",")
  );
}

fs.writeFileSync("/home/ubuntu/cabinet-dealz-catalog-review.csv", lines.join("\n"), "utf8");
console.log(`Wrote ${rows.length} rows to /home/ubuntu/cabinet-dealz-catalog-review.csv`);

await conn.end();
