// Targeted corrections for cabinet rows whose width/description/door/drawer
// fields were mis-imported. Run: node server/fix_cabinet_specs.mjs [--apply]
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

// Pull the leading size number out of a description like `24" Base Cabinet ...`
function sizeFromDesc(desc) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*"/.exec(desc || "");
  return m ? Number(m[1]) : null;
}

// Explicit per-code corrections. Each entry may set width/description/doors/drawers/category/placementType.
const FIXES = {
  // BFH = Full Height base; "Three Drawer" wording is wrong -> full-height door(s)
  "BFH-12": { description: '12" Full Height Single Door Base Cabinet', numberOfDrawers: 0, numberOfDoors: 1 },
  "BFH-15": { description: '15" Full Height Single Door Base Cabinet', numberOfDrawers: 0, numberOfDoors: 1 },
  "BFH-18": { description: '18" Full Height Single Door Base Cabinet', numberOfDrawers: 0, numberOfDoors: 1 },

  // Width clearly wrong vs description size
  "BS-24-35": { width: 24 },
  "BSDC-6": { width: 6, numberOfDrawers: 0, description: '6" Base Spice Pull-Out Cabinet' },
  "SB-15MINI": { width: 15 },

  // CB-9 corner base: width=2 is wrong. A 9" corner base footprint is 9.
  "CB-9": { width: 9 },

  // Tray divider inserts are accessories, not drawers
  "CTRAY-33": { numberOfDrawers: 0, category: "Accessory", placementType: "accessory" },
  "CTRAY-36": { numberOfDrawers: 0, category: "Accessory", placementType: "accessory" },
  "BBC45-TRAY": { numberOfDrawers: 0 },

  // Panels: flat finishing panels, not floor boxes. Tag as accessory so the
  // design tool doesn't place them as base cabinets. Keep face dimension as width.
  "BDEP": { description: "Dishwasher End Panel", category: "Accessory", placementType: "accessory", numberOfDoors: 0 },
  "BSV": { description: '42" Base Skin / Finished Side Panel', width: 42, category: "Accessory", placementType: "accessory", numberOfDoors: 0 },
};

(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL);
  const codes = Object.keys(FIXES);
  const [rows] = await c.query(
    "SELECT id, masterCode, description, width, numberOfDoors, numberOfDrawers, category, placementType FROM cabinets WHERE masterCode IN (?)",
    [codes]
  );
  let count = 0;
  for (const r of rows) {
    const fix = FIXES[r.masterCode];
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fix)) {
      const cur = r[k];
      if (String(cur) !== String(v)) {
        sets.push(`\`${k}\` = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) continue;
    count++;
    console.log(`${r.masterCode}: ${sets.map((s, i) => `${s.replace(" = ?", "")}=${vals[i]}`).join(", ")}`);
    if (APPLY) {
      vals.push(r.id);
      await c.query(`UPDATE cabinets SET ${sets.join(", ")} WHERE id = ?`, vals);
    }
  }
  console.log(`\n${APPLY ? "Applied" : "Would change"} ${count} rows.`);
  await c.end();
})();
