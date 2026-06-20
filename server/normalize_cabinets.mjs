/**
 * Cabinet Dealz — Catalog Normalization
 * Cleans descriptions to a uniform professional standard and corrects
 * door/drawer counts using standard cabinet conventions.
 *
 * Run: node server/normalize_cabinets.mjs        (dry run, writes preview file)
 *      node server/normalize_cabinets.mjs --apply (writes to DB)
 */
import mysql from "mysql2/promise";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(
  "SELECT id, masterCode, description, category, subCategory, width, height, depth, numberOfDoors, numberOfDrawers FROM cabinets ORDER BY category, masterCode"
);

// ── helpers ───────────────────────────────────────────────────────────────
const titleCase = (s) =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

function cleanDescription(d) {
  let desc = (d.description || "").trim();
  // Remove a leading "CODE - " echo (e.g. "ACM8 - 8\" Crown Molding", "BAM - 3/4\"...")
  desc = desc.replace(/^[A-Z0-9\-\/]+\s+-\s+/, "");
  // Remove appended raw dimension strings: " - 24\"W x 34-1/2\"H x 24\"D" or "- 48\"W x 96\"H"
  desc = desc.replace(/\s*[-–]\s*\d[\d\-\/]*"?\s*W(\s*x\s*[\d\-\/]+"?\s*[HD])?(\s*x\s*[\d\-\/]+"?\s*[HD])?\s*$/i, "");
  // Remove trailing standalone dimension fragments like " x 96\"H"
  desc = desc.replace(/\s*x\s*[\d\-\/]+"?\s*[HD]\s*$/i, "");
  // Collapse double spaces
  desc = desc.replace(/\s{2,}/g, " ").trim();
  // Normalize common phrasings
  desc = desc
    .replace(/\bw\/\b/gi, "with ")
    .replace(/\bSgl\b/gi, "Single")
    .replace(/\bDbl\b/gi, "Double")
    .replace(/\bdrw\b/gi, "Drawer")
    .replace(/\s{2,}/g, " ")
    .trim();
  return desc;
}

// Derive door/drawer counts from the description WORDING only (safe, no width guessing).
const WORD_NUM = { single: 1, double: 2, triple: 3, three: 3, four: 4, two: 2, one: 1 };
function fixCounts(d) {
  const desc = (d.description || "").toLowerCase();
  let doors = d.numberOfDoors;
  let drawers = d.numberOfDrawers;

  // Doors: look for "<word> door"
  const doorMatch = desc.match(/\b(single|double|triple|three|two|one)\s+(?:tall\s+|glass\s+)?door/);
  if (doorMatch) doors = WORD_NUM[doorMatch[1]] ?? doors;
  else if (/\bdoors\b/.test(desc) && doors === 0) doors = 2;

  // Drawers: look for "<word> drawer"
  const drawerMatch = desc.match(/\b(single|double|triple|three|four|two|one)\s+drawer/);
  if (drawerMatch) drawers = WORD_NUM[drawerMatch[1]] ?? drawers;
  // If the description says exactly "... single drawer ..." handled above.
  // Do NOT invent drawers when the wording doesn't mention them.

  return { doors, drawers };
}

const changes = [];
for (const d of rows) {
  const newDesc = cleanDescription(d);
  const { doors, drawers } = fixCounts(d);
  if (newDesc !== d.description || doors !== d.numberOfDoors || drawers !== d.numberOfDrawers) {
    changes.push({
      id: d.id,
      code: d.masterCode,
      oldDesc: d.description,
      newDesc,
      oldDoors: d.numberOfDoors,
      newDoors: doors,
      oldDrawers: d.numberOfDrawers,
      newDrawers: drawers,
    });
  }
}

fs.writeFileSync(
  "/home/ubuntu/cabinet-dealz/normalize_preview.json",
  JSON.stringify(changes, null, 1)
);
console.log(`${changes.length} cabinets would change (of ${rows.length}).`);
console.log("Preview written to normalize_preview.json");

if (APPLY) {
  for (const c of changes) {
    await conn.query(
      "UPDATE cabinets SET description = ?, numberOfDoors = ?, numberOfDrawers = ? WHERE id = ?",
      [c.newDesc, c.newDoors, c.newDrawers, c.id]
    );
  }
  console.log(`Applied ${changes.length} updates to DB.`);
}

await conn.end();
