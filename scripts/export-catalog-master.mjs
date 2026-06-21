// Master catalog review export.
// Produces an .xlsx with, per physical product (cabinet row):
//   - master code + ALL alternate distributor SKUs (the "known same as" codes)
//   - description, category, subCategory, dimensions, door/drawer counts
//   - the 2D drawing-type the item resolves to + image slug (visual sanity check)
//   - how many lines carry it
//   - automatic CONFLICT flags (description/dimension/category mismatches)
// Also writes a second sheet listing suspected duplicate/"same-as" clusters.
import "dotenv/config";
import mysql from "mysql2/promise";
import ExcelJS from "exceljs";

// ---- inline copy of the drawing-type logic (kept framework-free) -------------
const lc = (v) => (v ?? "").toString().toLowerCase();
const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
function cabinetDrawingType(cab) {
  const cat = lc(cab.category);
  const sub = lc(cab.subCategory);
  const code = lc(cab.masterCode);
  const desc = lc(cab.description);
  const hay = `${sub} ${desc} ${code}`;
  if (cat === "accessory" || /molding|filler|end panel|\bpanel\b|shelf|light rail|base rail|toe kick|scribe|valance/.test(hay)) return "accessory-strip";
  if (/appliance garage|tambour|garage/.test(hay)) return "appliance-garage";
  if (cab.isCornerCabinet || /blind corner|corner|easy reach|lazy susan|diagonal/.test(hay)) return "blind-corner";
  if (/sink base|sink/.test(hay) && /base|vanity/.test(`${cat} ${sub} ${desc}`)) return "sink-base";
  if (/glass/.test(hay)) return "glass-door";
  if (cat === "ada" || /\bada\b/.test(hay)) return "ada";
  if (cat === "vanity" || /vanity/.test(hay)) return "vanity";
  const doors = cab.numberOfDoors ?? 0;
  const drawers = cab.numberOfDrawers ?? 0;
  if (/drawer base|\bdrawer\b/.test(`${sub} ${desc}`) && doors === 0) return "drawer-base";
  if (drawers > 0 && doors === 0) return "drawer-base";
  return "standard-door";
}
const slugify = (s) =>
  (s ?? "").toLowerCase().replace(/["'']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
function cabinetImageSlug(cab) {
  const descPart = slugify((cab.description ?? "").split(/[.,;]/)[0] ?? "").slice(0, 60);
  const codePart = slugify(cab.masterCode ?? "");
  return [descPart, codePart].filter(Boolean).join("-") || codePart || "cabinet";
}

// ---- pull data ---------------------------------------------------------------
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT
    c.id, c.masterCode, c.description, c.category, c.subCategory,
    c.width, c.height, c.depth, c.numberOfDoors, c.numberOfDrawers,
    c.placementType, c.graphicType, c.isCornerCabinet, c.isActive,
    GROUP_CONCAT(DISTINCT ds.distributorSku ORDER BY ds.distributorSku SEPARATOR ' | ') AS altSkus,
    COUNT(DISTINCT ds.distributorId) AS numLines,
    COUNT(DISTINCT ds.id) AS numSkus
  FROM cabinets c
  LEFT JOIN distributor_skus ds ON ds.cabinetId = c.id
  GROUP BY c.id
  ORDER BY c.category, c.subCategory, c.masterCode
`);
await conn.end();

// ---- conflict detection ------------------------------------------------------
function rowConflicts(r) {
  const flags = [];
  const desc = lc(r.description);
  const sub = lc(r.subCategory);
  const w = toNum(r.width), h = toNum(r.height), d = toNum(r.depth);
  const drawType = cabinetDrawingType(r);

  // 1. description says "drawer front" but dims look like a tall panel
  if (/drawer front/.test(desc) && h && h > 12) {
    flags.push(`Desc "drawer front" but height ${h}" looks like a panel, not a drawer front`);
  }
  // 2. "panel / dishwasher / refrigerator end" but subCategory is a box type
  if (/(end panel|dishwasher|return panel|skin|filler)/.test(desc) && /(single door base|double door|base|wall)\b/.test(sub) && lc(r.category) !== "accessory") {
    flags.push(`Panel-type description but subCategory "${r.subCategory}" is a box type`);
  }
  if (/(end panel|dishwasher|return panel|skin)/.test(desc) && /(single door base|double door)/.test(sub)) {
    flags.push(`Panel description but subCategory "${r.subCategory}"`);
  }
  // 3. implausible dimensions (typo guard)
  if (h && h > 120) flags.push(`Height ${h}" implausibly large (likely typo)`);
  if (w && w > 120) flags.push(`Width ${w}" implausibly large (likely typo)`);
  // 4. missing dimensions on a sellable item
  if (!w && !h && !d) flags.push("Missing all dimensions");
  // 5. drawing-type vs description mismatch
  if (drawType === "drawer-base" && /(panel|end panel|filler|molding|skin)/.test(desc)) {
    flags.push(`Drawing type "drawer-base" but description is a ${drawType === "drawer-base" ? "panel/trim" : ""}`);
  }
  // 6. no SKUs at all (orphan product)
  if ((r.numSkus ?? 0) === 0) flags.push("No distributor SKUs (orphan / not buyable)");
  return flags;
}

// ---- duplicate clustering: same dims + same drawing type + similar desc ------
const normDesc = (s) => lc(s).replace(/["'']/g, "").replace(/\b\d+(\.\d+)?\b/g, "#").replace(/[^a-z# ]+/g, " ").replace(/\s+/g, " ").trim();
const clusters = new Map();
for (const r of rows) {
  const key = `${cabinetDrawingType(r)}|${toNum(r.width)}|${toNum(r.height)}|${normDesc(r.description)}`;
  if (!clusters.has(key)) clusters.set(key, []);
  clusters.get(key).push(r);
}
const dupClusters = [...clusters.values()].filter((g) => g.length > 1);

// ---- build workbook ----------------------------------------------------------
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Catalog");
ws.columns = [
  { header: "Master Code", key: "code", width: 16 },
  { header: "Alternate / Same-As SKUs", key: "alt", width: 40 },
  { header: "Description", key: "desc", width: 52 },
  { header: "Category", key: "cat", width: 12 },
  { header: "SubCategory", key: "sub", width: 22 },
  { header: "W", key: "w", width: 7 },
  { header: "H", key: "h", width: 7 },
  { header: "D", key: "d", width: 7 },
  { header: "Doors", key: "doors", width: 7 },
  { header: "Drawers", key: "drawers", width: 8 },
  { header: "Drawing Type (image)", key: "draw", width: 18 },
  { header: "Image Slug", key: "slug", width: 40 },
  { header: "# Lines", key: "lines", width: 8 },
  { header: "Active", key: "active", width: 8 },
  { header: "AUTO CONFLICT FLAGS", key: "flags", width: 50 },
  { header: "YOUR CORRECTION (name / category / same-as)", key: "fix", width: 44 },
];
ws.getRow(1).font = { bold: true };
ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
ws.views = [{ state: "frozen", ySplit: 1 }];

let conflictCount = 0;
for (const r of rows) {
  const flags = rowConflicts(r);
  if (flags.length) conflictCount++;
  const row = ws.addRow({
    code: r.masterCode,
    alt: r.altSkus || "(none)",
    desc: r.description,
    cat: r.category,
    sub: r.subCategory,
    w: toNum(r.width),
    h: toNum(r.height),
    d: toNum(r.depth),
    doors: r.numberOfDoors,
    drawers: r.numberOfDrawers,
    draw: cabinetDrawingType(r),
    slug: cabinetImageSlug(r),
    lines: r.numLines,
    active: r.isActive ? "yes" : "no",
    flags: flags.join("; "),
    fix: "",
  });
  if (flags.length) {
    row.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
    });
    row.getCell("flags").font = { color: { argb: "FF9A3412" }, bold: true };
  }
}
ws.autoFilter = { from: "A1", to: "P1" };

// duplicates sheet
const ws2 = wb.addWorksheet("Possible Same-As Clusters");
ws2.columns = [
  { header: "Cluster #", key: "n", width: 10 },
  { header: "Master Code", key: "code", width: 16 },
  { header: "Description", key: "desc", width: 52 },
  { header: "Category", key: "cat", width: 12 },
  { header: "SubCategory", key: "sub", width: 22 },
  { header: "W", key: "w", width: 7 },
  { header: "H", key: "h", width: 7 },
  { header: "Drawing Type", key: "draw", width: 16 },
  { header: "Alt SKUs", key: "alt", width: 36 },
];
ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
ws2.views = [{ state: "frozen", ySplit: 1 }];
let cn = 0;
for (const group of dupClusters) {
  cn++;
  for (const r of group) {
    ws2.addRow({
      n: cn,
      code: r.masterCode,
      desc: r.description,
      cat: r.category,
      sub: r.subCategory,
      w: toNum(r.width),
      h: toNum(r.height),
      draw: cabinetDrawingType(r),
      alt: r.altSkus || "(none)",
    });
  }
  ws2.addRow({});
}

const out = "/home/ubuntu/cabinet-dealz-master-catalog-review.xlsx";
await wb.xlsx.writeFile(out);
console.log(`Wrote ${rows.length} products to ${out}`);
console.log(`Conflicts flagged: ${conflictCount}`);
console.log(`Possible same-as clusters: ${dupClusters.length}`);
