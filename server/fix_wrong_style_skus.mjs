/**
 * Find and remove cabinet SKUs that are linked to the wrong style.
 * 
 * The problem: when distId=3 styles were merged into Milestone (distId=1) styles,
 * some distId=3 SKUs had descriptions referencing a DIFFERENT style 
 * (e.g. "Oxford Mist Vanity Sink Base" ending up under Floral Grey).
 * 
 * Strategy: for each Milestone style, find distId=3 SKUs whose cabinet description
 * mentions a different style name. These are the ones to remove.
 * 
 * Universal hardware accessories (no style name in description) are KEPT.
 * Color-specific accessories (fillers, panels, moldings) are KEPT.
 * Cabinet SKUs with a different style name in description are REMOVED.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all Milestone styles
const [milestoneStyles] = await conn.execute(
  `SELECT id, ourName FROM door_styles WHERE distributorId = 1 ORDER BY ourName`
);

// Build a list of all style names for cross-reference detection
const styleNames = milestoneStyles.map(s => s.ourName.toLowerCase());

let totalRemoved = 0;

for (const style of milestoneStyles) {
  // Get all distId=3 SKUs under this style
  const [dist3Skus] = await conn.execute(
    `SELECT ds.id, ds.distributorSku, c.masterCode, c.description, c.category
     FROM distributor_skus ds
     JOIN cabinets c ON c.id = ds.cabinetId
     WHERE ds.styleId = ? AND ds.distributorId = 3`,
    [style.id]
  );
  
  if (dist3Skus.length === 0) continue;
  
  const wrongIds = [];
  
  for (const sku of dist3Skus) {
    const desc = (sku.description || '').toLowerCase();
    
    // Check if this cabinet's description mentions a DIFFERENT style name
    const mentionedStyle = styleNames.find(sn => 
      sn !== style.ourName.toLowerCase() && 
      sn.length > 4 && // avoid short matches
      desc.includes(sn)
    );
    
    if (mentionedStyle) {
      wrongIds.push(sku.id);
      console.log(`  WRONG: [${style.ourName}] "${sku.distributorSku}" (${sku.masterCode}) - desc mentions "${mentionedStyle}"`);
    }
  }
  
  if (wrongIds.length > 0) {
    const [del] = await conn.execute(
      `DELETE FROM distributor_skus WHERE id IN (${wrongIds.join(',')})`
    );
    console.log(`  -> Removed ${del.affectedRows} wrong SKUs from ${style.ourName}`);
    totalRemoved += del.affectedRows;
  }
}

console.log(`\nTotal removed: ${totalRemoved}`);

// Verify Floral Grey no longer has VS30 Oxford Mist
const [check] = await conn.execute(
  `SELECT ds.distributorSku, c.masterCode, c.description
   FROM distributor_skus ds
   JOIN cabinets c ON c.id = ds.cabinetId
   WHERE ds.styleId = 180021 AND (c.description LIKE '%Oxford%' OR c.description LIKE '%Mist%')
   LIMIT 5`
);
if (check.length === 0) {
  console.log('\nFloral Grey: No more Oxford Mist entries ✓');
} else {
  console.log('\nFloral Grey still has Oxford Mist entries:');
  check.forEach(r => console.log(`  ${r.distributorSku}: ${r.description}`));
}

await conn.end();
