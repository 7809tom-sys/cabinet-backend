/**
 * Fourth pass: fix remaining items using more aggressive description parsing.
 * Also handles:
 *  - "34 1/2" (space instead of dash in fractions)
 *  - "4-1/2'H" (feet marker instead of inches)
 *  - "1-1/2""W" (double-double-quote)
 *  - Patterns like "24" x 84"" (no W/H/D labels)
 *  - Vanity bases: "30"W x 34 1/2" x 21"D"
 *  - REPV panels: "1-1/2""W x 96"H x 30"D"
 *  - Shelf boards: "24"W x 96"H x 3/4"D"
 *  - TDEP panels: "24" x 84""
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [cabs] = await conn.execute(
  `SELECT id, masterCode, description, category, width, height, depth
   FROM cabinets WHERE isActive = 1
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   ORDER BY masterCode`
);
console.log(`Remaining: ${cabs.length}`);

function parseMeasure(s) {
  s = s.trim().replace(/['"]/g, '');
  if (!s) return null;
  // "34 1/2" -> 34.5
  const spaceM = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (spaceM) return parseInt(spaceM[1]) + parseInt(spaceM[2]) / parseInt(spaceM[3]);
  // "34-1/2" -> 34.5
  const dashM = s.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (dashM) return parseInt(dashM[1]) + parseInt(dashM[2]) / parseInt(dashM[3]);
  // "3/4" -> 0.75
  const fracM = s.match(/^(\d+)\/(\d+)$/);
  if (fracM) return parseInt(fracM[1]) / parseInt(fracM[2]);
  // decimal or integer
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function extractDims(desc) {
  if (!desc) return null;
  // Normalize quotes
  let d = desc.replace(/[""]/g, '"').replace(/'/g, "'");
  
  const numPat = '([\\d]+(?:[\\s\\-][\\d]+\\/[\\d]+)?(?:\\/[\\d]+)?)';
  
  // Full W x H x D with labels
  let m = d.match(new RegExp(numPat + '"?W\\s*x\\s*' + numPat + '"?H\\s*x\\s*' + numPat + '"?D', 'i'));
  if (m) {
    const w = parseMeasure(m[1]), h = parseMeasure(m[2]), dep = parseMeasure(m[3]);
    if (w && h && dep) return { w, h, d: dep };
  }
  
  // W x middle x D (no H label) - e.g. "30"W x 34 1/2" x 21"D"
  m = d.match(new RegExp(numPat + '"W\\s*x\\s*' + numPat + '"\\s*x\\s*' + numPat + '"D', 'i'));
  if (m) {
    const w = parseMeasure(m[1]), h = parseMeasure(m[2]), dep = parseMeasure(m[3]);
    if (w && h && dep) return { w, h, d: dep };
  }
  
  // W x H only
  m = d.match(new RegExp(numPat + '"?W\\s*x\\s*' + numPat + '"?H', 'i'));
  if (m) {
    const w = parseMeasure(m[1]), h = parseMeasure(m[2]);
    if (w && h) return { w, h, d: null };
  }
  
  // Unlabeled: "24" x 84"" -> treat as W x H
  m = d.match(/(\d+)"\s*x\s*(\d+)"/);
  if (m) {
    return { w: parseInt(m[1]), h: parseInt(m[2]), d: null };
  }
  
  return null;
}

// Also handle specific known items manually
const manualFixes = {
  // Vanity bases with "34 1/2" in description
  'V3021TDL': { w: 30, h: 34.5, d: 21 },
  'V3021TDR': { w: 30, h: 34.5, d: 21 },
  'V3321DL':  { w: 33, h: 34.5, d: 21 },
  'V3321DR':  { w: 33, h: 34.5, d: 21 },
  'V3321TDL': { w: 33, h: 34.5, d: 21 },
  'V3321TDR': { w: 33, h: 34.5, d: 21 },
  'V3621TDL': { w: 36, h: 34.5, d: 21 },
  'V3621TDR': { w: 36, h: 34.5, d: 21 },
  // Diagonal corner sink floor
  'SBF4242': { w: 42, h: 0.75, d: 42 },
  // Tall decorative end panels
  'TDEP2484': { w: 24, h: 84, d: 0.75 },
  'TDEP2490': { w: 24, h: 90, d: 0.75 },
  'TDEP2496': { w: 24, h: 96, d: 0.75 },
  // Hardware (no real dimensions)
  'UV21_GLIDE_SET': { w: 1, h: 1, d: 1 },
  'UV21_Glide_Set': { w: 1, h: 1, d: 1 },
  'UV18_GLIDE_SET': { w: 1, h: 1, d: 1 },
  'UV18_Glide_Set': { w: 1, h: 1, d: 1 },
  'UV_SCHINGE': { w: 1, h: 1, d: 1 },
  'UV_SCHinge': { w: 1, h: 1, d: 1 },
  // Touch up kits / spray paint
  'TUK': { w: 4, h: 4, d: 2 },
  'SD': { w: 30, h: 5, d: 0.75 },
  // Roll-out trays (generic)
  'RS09': { w: 9, h: 3, d: 22 },
  'RS12': { w: 12, h: 3, d: 22 },
  'RS15': { w: 15, h: 3, d: 22 },
  'RS18': { w: 18, h: 3, d: 22 },
  'RS21': { w: 21, h: 3, d: 22 },
  'RS24': { w: 24, h: 3, d: 22 },
  'RS27': { w: 27, h: 3, d: 22 },
  'RS30': { w: 30, h: 3, d: 22 },
  'RS33': { w: 33, h: 3, d: 22 },
  'RS36': { w: 36, h: 3, d: 22 },
  // Waste bin
  'Waste Bin': { w: 12, h: 18, d: 12 },
  'WOOD TRAY': { w: 33, h: 3, d: 22 },
  // BER = blind corner base with ear
  'BER33': { w: 33, h: 34.5, d: 24 },
  'BER36': { w: 36, h: 34.5, d: 24 },
  // B181RS = base 18" with roll-out shelf
  'B181RS': { w: 18, h: 34.5, d: 24 },
  'OC-B181RS': { w: 18, h: 34.5, d: 24 },
  'B36FH2RS': { w: 36, h: 34.5, d: 24 },
  'OC-B36FH2RS': { w: 36, h: 34.5, d: 24 },
  // BCM8 = base crown moulding
  'BCM8(DCM)': { w: 96, h: 4, d: 4 },
  // BDEP = base decorative end panel
  'BDEP': { w: 23.25, h: 34.5, d: 0.25 },
  // BBFPV4296 = beadboard veneer panel
  'BBFPV4296': { w: 42, h: 96, d: 0.25 },
  // InFieldKit
  'INFIELDKIT_FRD': { w: 6, h: 6, d: 2 },
  'InFieldKit_FRD': { w: 6, h: 6, d: 2 },
};

let fixed = 0;
let skipped = 0;

for (const cab of cabs) {
  let dims = manualFixes[cab.masterCode] || null;
  
  if (!dims) {
    dims = extractDims(cab.description);
  }
  
  if (!dims) {
    skipped++;
    continue;
  }
  
  const updates = [];
  const params = [];
  
  if ((!cab.width || cab.width == 0) && dims.w) { updates.push('width = ?'); params.push(dims.w); }
  if ((!cab.height || cab.height == 0) && dims.h) { updates.push('height = ?'); params.push(dims.h); }
  if ((!cab.depth || cab.depth == 0) && dims.d) { updates.push('depth = ?'); params.push(dims.d); }
  
  if (updates.length === 0) { skipped++; continue; }
  
  params.push(cab.id);
  await conn.execute(`UPDATE cabinets SET ${updates.join(', ')} WHERE id = ?`, params);
  fixed++;
}

console.log(`Fixed: ${fixed}, Skipped: ${skipped}`);

const [remaining] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)`
);
console.log(`Still missing: ${remaining[0].cnt}`);

// Show what's left
const [leftover] = await conn.execute(
  `SELECT masterCode, description, category FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   AND category NOT IN ('Accessory', 'Accessories', 'Mouldings')
   ORDER BY masterCode LIMIT 20`
);
if (leftover.length > 0) {
  console.log('\nNon-accessory still missing:');
  leftover.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));
}

await conn.end();
