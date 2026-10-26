/**
 * Third pass: parse dimensions from description text for all remaining cabinets.
 * Handles formats like:
 *   96"W x 3/4"H x 1/4"D
 *   23-1/4"W x 34-1/2"H x 1/4"D
 *   30"W x 34 1/2" x 21"D   (no H label)
 *   24"W x 96"H x 3/4"D
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all active cabinets still missing at least one dimension
const [cabs] = await conn.execute(
  `SELECT id, masterCode, description, category, width, height, depth
   FROM cabinets WHERE isActive = 1
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   ORDER BY masterCode`
);
console.log(`Cabinets still missing dims: ${cabs.length}`);

// Parse a measurement string like "3/4", "34-1/2", "23-1/4", "34.5", "1.5"
function parseMeasure(s) {
  s = s.trim();
  // Decimal: 34.5
  if (/^\d+\.\d+$/.test(s)) return parseFloat(s);
  // Fraction only: 3/4
  if (/^\d+\/\d+$/.test(s)) {
    const [n, d] = s.split('/');
    return parseInt(n) / parseInt(d);
  }
  // Mixed: 34-1/2 or 23-1/4
  const mixed = s.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  // Integer
  if (/^\d+$/.test(s)) return parseInt(s);
  return null;
}

// Extract W, H, D from description
function extractDims(desc) {
  if (!desc) return null;
  
  // Normalize: remove " characters, make consistent
  const d = desc.replace(/[""]/g, '"');
  
  // Pattern 1: {W}"W x {H}"H x {D}"D  (with H label)
  // Handles fractions, decimals, mixed numbers
  const numPat = '([\\d]+(?:[\\-\\.][\\d/]+)?)';
  
  // Try full W x H x D pattern
  let m = d.match(new RegExp(numPat + '"?W\\s*x\\s*' + numPat + '"?H\\s*x\\s*' + numPat + '"?D', 'i'));
  if (m) {
    const w = parseMeasure(m[1]);
    const h = parseMeasure(m[2]);
    const dep = parseMeasure(m[3]);
    if (w && h && dep) return { w, h, d: dep };
  }
  
  // Pattern 2: {W}"W x {H}" x {D}"D  (no H label, middle is height)
  m = d.match(new RegExp(numPat + '"?W\\s*x\\s*' + numPat + '"\\s*x\\s*' + numPat + '"?D', 'i'));
  if (m) {
    const w = parseMeasure(m[1]);
    const h = parseMeasure(m[2]);
    const dep = parseMeasure(m[3]);
    if (w && h && dep) return { w, h, d: dep };
  }
  
  // Pattern 3: {W}"W x {H}" (just W and H, no depth)
  m = d.match(new RegExp(numPat + '"?W\\s*x\\s*' + numPat + '"?H', 'i'));
  if (m) {
    const w = parseMeasure(m[1]);
    const h = parseMeasure(m[2]);
    if (w && h) return { w, h, d: null };
  }
  
  return null;
}

let fixed = 0;
let skipped = 0;
const cannotParse = [];

for (const cab of cabs) {
  const dims = extractDims(cab.description);
  
  if (!dims) {
    cannotParse.push(cab.masterCode + ': ' + (cab.description || '').substring(0, 80));
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

console.log(`\nFixed: ${fixed}, Skipped: ${skipped}`);

if (cannotParse.length > 0) {
  console.log(`\nCannot parse (${cannotParse.length}):`);
  cannotParse.forEach(s => console.log('  ' + s));
}

// Final count
const [remaining] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)`
);
console.log(`\nStill missing dimensions: ${remaining[0].cnt}`);

await conn.end();
