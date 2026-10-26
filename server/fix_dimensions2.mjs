/**
 * Second pass dimension fix - handles style-prefixed codes and more patterns.
 * Also checks what the remaining Base/Wall/Tall/Vanity missing items look like.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Show remaining non-Accessory cabinets missing dimensions
const [nonAcc] = await conn.execute(
  `SELECT id, masterCode, description, category, subCategory, width, height, depth
   FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   AND category NOT IN ('Accessory', 'Accessories', 'Mouldings', 'Filler')
   ORDER BY category, masterCode`
);
console.log('Non-accessory cabinets still missing dimensions (' + nonAcc.length + '):');
nonAcc.forEach(r => {
  console.log(`  [${r.id}] ${r.masterCode} | ${r.category}/${r.subCategory} | ${r.width || '?'}W x ${r.height || '?'}H x ${r.depth || '?'}D`);
  console.log(`    desc: ${r.description}`);
});

// Fix them by parsing description for dimensions
// Pattern: "30\"W x 34-1/2\"H x 24\"D" or "30"W x 34.5"H x 24"D"
function parseDimsFromDesc(desc) {
  if (!desc) return null;
  
  // Match patterns like: 30"W x 34-1/2"H x 24"D  or  30"W x 34.5"H x 24"D
  const m = desc.match(/(\d+(?:\.\d+)?(?:-\d+\/\d+)?)"?W\s*x\s*(\d+(?:\.\d+)?(?:-\d+\/\d+)?)"?H\s*x\s*(\d+(?:\.\d+)?(?:-\d+\/\d+)?)"?D/i);
  if (m) {
    const parseNum = (s) => {
      if (s.includes('-')) {
        const [whole, frac] = s.split('-');
        const [num, den] = frac.split('/');
        return parseFloat(whole) + parseFloat(num) / parseFloat(den);
      }
      return parseFloat(s);
    };
    return { w: parseNum(m[1]), h: parseNum(m[2]), d: parseNum(m[3]) };
  }
  return null;
}

let fixed = 0;
for (const cab of nonAcc) {
  const dims = parseDimsFromDesc(cab.description);
  if (!dims) {
    console.log(`  CANNOT PARSE: ${cab.masterCode}`);
    continue;
  }
  
  const updates = [];
  const params = [];
  if (!cab.width || cab.width == 0) { updates.push('width = ?'); params.push(dims.w); }
  if (!cab.height || cab.height == 0) { updates.push('height = ?'); params.push(dims.h); }
  if (!cab.depth || cab.depth == 0) { updates.push('depth = ?'); params.push(dims.d); }
  
  if (updates.length === 0) continue;
  params.push(cab.id);
  await conn.execute(`UPDATE cabinets SET ${updates.join(', ')} WHERE id = ?`, params);
  fixed++;
  console.log(`  Fixed from desc: ${cab.masterCode} -> ${dims.w}W x ${dims.h}H x ${dims.d}D`);
}
console.log(`\nFixed ${fixed} from descriptions`);

// Now check Accessory cabinets - show a sample to understand what they are
const [accSample] = await conn.execute(
  `SELECT id, masterCode, description, category, subCategory, width, height, depth
   FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   AND category IN ('Accessory', 'Accessories')
   ORDER BY masterCode LIMIT 30`
);
console.log('\nAccessory sample still missing dims:');
accSample.forEach(r => console.log(`  ${r.masterCode}: ${r.description}`));

await conn.end();
