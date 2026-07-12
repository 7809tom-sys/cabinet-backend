/**
 * Fix missing cabinet dimensions by parsing masterCode patterns.
 * 
 * Standard Milestone cabinet naming conventions:
 * 
 * BASE CABINETS (34.5"H x 24"D):
 *   B{W}       = Single door base, e.g. B24 = 24W x 34.5H x 24D
 *   BT{W}      = Base with tray (blind corner), e.g. BT09 = 9W x 34.5H x 24D
 *   SB{W}      = Sink base, e.g. SB30 = 30W x 34.5H x 24D
 *   3DB{W}     = 3-drawer base, e.g. 3DB24 = 24W x 34.5H x 24D
 *   3VDB{W}    = 3-drawer vanity base, e.g. 3VDB18 = 18W x 34.5H x 21D
 *   BWB{W}     = Base with wine bottle rack
 *   B{W}39     = 39" wide base
 *   ADA-B{W}   = ADA base (28.5"H)
 *   ADA-BT{W}  = ADA base tray (28.5"H)
 *   ADA-SB{W}  = ADA sink base (28.5"H)
 *   ADA-3DB{W} = ADA 3-drawer base (28.5"H)
 * 
 * WALL CABINETS (12"D):
 *   W{W}{H}    = Wall cabinet, e.g. W3030 = 30W x 30H x 12D
 *   W{W}{H}{D} = Deep wall cabinet, e.g. W301224 = 30W x 12H x 24D
 * 
 * TALL CABINETS (24"D):
 *   U{W}{H}{D} = Utility/Pantry, e.g. U189624 = 18W x 96H x 24D
 * 
 * VANITY CABINETS (21"D):
 *   VS{W}      = Vanity sink base, e.g. VS30 = 30W x 34.5H x 21D
 *   VSD{W}     = Vanity sink double door
 *   ADA-VS{W}  = ADA vanity sink (28.5"H)
 *   ADA-VSD{W} = ADA vanity sink double
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all active cabinets missing at least one dimension
const [cabs] = await conn.execute(
  `SELECT id, masterCode, description, category, subCategory, width, height, depth, pkgLength, pkgWidth, pkgHeight, pkgWeight
   FROM cabinets WHERE isActive = 1
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   ORDER BY masterCode`
);
console.log(`Found ${cabs.length} cabinets missing dimensions`);

let fixed = 0;
let skipped = 0;

function parseDims(masterCode) {
  const code = masterCode.toUpperCase().trim();
  
  // Strip style prefix if present (e.g. "FG-B24" -> "B24", "ANTIQUE WHITE-B24" -> "B24")
  const base = code.includes('-') ? code.split('-').slice(-1)[0] : code;
  
  // ===== WALL CABINETS =====
  // W{W2}{H2}{D2} = deep wall, e.g. W301224 = 30W x 12H x 24D
  let m = base.match(/^W(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: parseInt(m[2]), d: parseInt(m[3]), type: 'wall-deep' };
  }
  
  // W{W2}{H2} = standard wall, e.g. W3030 = 30W x 30H x 12D
  m = base.match(/^W(\d{2})(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: parseInt(m[2]), d: 12, type: 'wall' };
  }
  
  // W{W2}{H1} = short wall, e.g. W309 = 30W x 9H x 12D (rare)
  m = base.match(/^W(\d{2})(\d{1})$/);
  if (m) {
    return { w: parseInt(m[1]), h: parseInt(m[2]), d: 12, type: 'wall-short' };
  }
  
  // ===== TALL CABINETS =====
  // U{W2}{H2}{D2} = utility/pantry, e.g. U189624 = 18W x 96H x 24D
  m = base.match(/^U(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: parseInt(m[2]), d: parseInt(m[3]), type: 'tall' };
  }
  
  // ===== ADA BASE CABINETS (28.5"H) =====
  // ADA-BT{W} = ADA base tray
  m = masterCode.toUpperCase().match(/ADA-BT(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 28.5, d: 24, type: 'ada-base-tray' };
  }
  
  // ADA-3DB{W} = ADA 3-drawer base
  m = masterCode.toUpperCase().match(/ADA-3DB(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 28.5, d: 24, type: 'ada-3drawer' };
  }
  
  // ADA-3VDB{W} = ADA vanity drawer base
  m = masterCode.toUpperCase().match(/ADA-3VDB(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 28.5, d: 21, type: 'ada-vanity-drawer' };
  }
  
  // ADA-SB{W}R = ADA sink base with return
  m = masterCode.toUpperCase().match(/ADA-SB(\d{2})R?$/);
  if (m) {
    return { w: parseInt(m[1]), h: 28.5, d: 24, type: 'ada-sink-base' };
  }
  
  // ADA-B{W} = ADA single door base
  m = masterCode.toUpperCase().match(/ADA-B(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 28.5, d: 24, type: 'ada-base' };
  }
  
  // ADA-VS{W}R? = ADA vanity sink base
  m = masterCode.toUpperCase().match(/ADA-VS(\d{2})R?$/);
  if (m) {
    return { w: parseInt(m[1]), h: 28.5, d: 21, type: 'ada-vanity-sink' };
  }
  
  // ADA-VSD{W} = ADA vanity sink double door
  m = masterCode.toUpperCase().match(/ADA-VSD(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 28.5, d: 21, type: 'ada-vanity-sink-double' };
  }
  
  // ===== STANDARD BASE CABINETS (34.5"H x 24"D) =====
  // BT{W} = base tray/blind corner
  m = base.match(/^BT(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 24, type: 'base-tray' };
  }
  
  // 3DB{W} = 3-drawer base
  m = base.match(/^3DB(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 24, type: '3drawer-base' };
  }
  
  // 3VDB{W} = 3-drawer vanity base
  m = base.match(/^3VDB(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 21, type: '3drawer-vanity-base' };
  }
  
  // SB{W}R? = sink base
  m = base.match(/^SB(\d{2})R?$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 24, type: 'sink-base' };
  }
  
  // BWB{W} = base with wine bottle rack
  m = base.match(/^BWB(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 24, type: 'base-wine' };
  }
  
  // VS{W}R? = vanity sink base
  m = base.match(/^VS(\d{2})R?$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 21, type: 'vanity-sink' };
  }
  
  // VSD{W} = vanity sink double door
  m = base.match(/^VSD(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 21, type: 'vanity-sink-double' };
  }
  
  // B{W} = standard base (single or double door)
  m = base.match(/^B(\d{2})$/);
  if (m) {
    return { w: parseInt(m[1]), h: 34.5, d: 24, type: 'base' };
  }
  
  return null;
}

// Standard packaging size estimates based on cabinet type
function pkgDims(w, h, d, type) {
  // Add 2-3" to each dimension for packaging
  const pw = w + 3;
  const ph = h + 3;
  const pd = d + 3;
  
  // Weight rough estimate: base cabinets ~0.5 lb/inch of width
  const weight = Math.round(w * 0.5 + 10);
  
  return { pkgLength: pw, pkgWidth: pd, pkgHeight: ph, pkgWeight: weight };
}

for (const cab of cabs) {
  const dims = parseDims(cab.masterCode);
  
  if (!dims) {
    skipped++;
    continue;
  }
  
  const { w, h, d } = dims;
  const pkg = pkgDims(w, h, d, dims.type);
  
  // Only update missing fields
  const updates = [];
  const params = [];
  
  if (!cab.width || cab.width == 0) { updates.push('width = ?'); params.push(w); }
  if (!cab.height || cab.height == 0) { updates.push('height = ?'); params.push(h); }
  if (!cab.depth || cab.depth == 0) { updates.push('depth = ?'); params.push(d); }
  if (!cab.pkgLength || cab.pkgLength == 0) { updates.push('pkgLength = ?'); params.push(pkg.pkgLength); }
  if (!cab.pkgWidth || cab.pkgWidth == 0) { updates.push('pkgWidth = ?'); params.push(pkg.pkgWidth); }
  if (!cab.pkgHeight || cab.pkgHeight == 0) { updates.push('pkgHeight = ?'); params.push(pkg.pkgHeight); }
  if (!cab.pkgWeight || cab.pkgWeight == 0) { updates.push('pkgWeight = ?'); params.push(pkg.pkgWeight); }
  
  if (updates.length === 0) { skipped++; continue; }
  
  params.push(cab.id);
  await conn.execute(
    `UPDATE cabinets SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
  fixed++;
}

console.log(`\nFixed: ${fixed}, Skipped: ${skipped}`);

// Check remaining missing
const [remaining] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)`
);
console.log('Still missing dimensions:', remaining[0].cnt);

// Show what's still missing by category
const [stillMissing] = await conn.execute(
  `SELECT category, COUNT(*) as cnt FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   GROUP BY category ORDER BY cnt DESC`
);
console.log('Still missing by category:');
stillMissing.forEach(r => console.log(`  ${r.category}: ${r.cnt}`));

await conn.end();
