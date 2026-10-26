/**
 * Fix cabinet descriptions that reference the wrong style name.
 * e.g. FG-VS30 has description "Oxford Mist Vanity Sink Base..." - should say "Floral Grey"
 * 
 * Strategy: for each Milestone style, find SKUs where the cabinet description
 * mentions a different style name, and replace that style name with the correct one.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Map of style names that might appear in descriptions -> canonical name
// These are the distId=3 names that got merged in
const styleAliases = {
  'Oxford Mist': 'Floral Grey',
  'Oxford Sage': 'Floral Grey',
  'Oxford White': 'Floral Grey',
  'Oxford Blue': 'Floral Grey',
  'Oxford Cashmere': 'Floral Grey',
  'Oxford Toffee': 'Floral Grey',
  'Shaker White': 'Floral White',
  'Shaker Gray': 'Floral Grey',
  'Shaker Black': 'Floral Espresso',
  'Shaker Espresso': 'Floral Espresso',
  'Shaker Expresso': 'Floral Espresso',
};

// Focus on the Floral styles first
const floralStyles = [
  { styleId: 180021, name: 'Floral Grey',     prefix: 'FG-' },
  { styleId: 180020, name: 'Floral White',    prefix: 'FW-' },
  { styleId: 180022, name: 'Floral Espresso', prefix: 'FE-' },
];

for (const style of floralStyles) {
  // Get all SKUs for this style
  const [skus] = await conn.execute(
    `SELECT ds.id, ds.distributorSku, c.id as cabId, c.masterCode, c.description
     FROM distributor_skus ds
     JOIN cabinets c ON c.id = ds.cabinetId
     WHERE ds.styleId = ?
     ORDER BY ds.distributorSku`,
    [style.styleId]
  );
  
  let fixed = 0;
  for (const sku of skus) {
    const desc = sku.description || '';
    
    // Check if description mentions a different style
    let newDesc = desc;
    for (const [wrongName, correctStyle] of Object.entries(styleAliases)) {
      if (desc.includes(wrongName)) {
        newDesc = newDesc.replace(new RegExp(wrongName, 'g'), style.name);
      }
    }
    
    // Also fix generic "Shaker" prefix descriptions
    // e.g. "Shaker White Three Drawer Base" -> "Floral Grey Three Drawer Base"
    const shakerMatch = newDesc.match(/^(Shaker\s+(?:White|Gray|Grey|Black|Espresso|Expresso))\s+(.+)/i);
    if (shakerMatch) {
      newDesc = style.name + ' ' + shakerMatch[2];
    }
    
    if (newDesc !== desc) {
      await conn.execute(`UPDATE cabinets SET description = ? WHERE id = ?`, [newDesc, sku.cabId]);
      console.log(`  Fixed: ${sku.distributorSku}`);
      console.log(`    Was: ${desc.substring(0, 80)}`);
      console.log(`    Now: ${newDesc.substring(0, 80)}`);
      fixed++;
    }
  }
  
  if (fixed > 0) {
    console.log(`\n${style.name}: fixed ${fixed} descriptions`);
  } else {
    console.log(`${style.name}: no description fixes needed`);
  }
}

// Now check all Milestone styles for wrong descriptions
console.log('\n\nChecking all Milestone styles for wrong-style descriptions...');
const [allWrong] = await conn.execute(
  `SELECT ds.styleId, dst.ourName as styleName, ds.distributorSku, c.masterCode, c.description
   FROM distributor_skus ds
   JOIN door_styles dst ON dst.id = ds.styleId
   JOIN cabinets c ON c.id = ds.cabinetId
   WHERE dst.distributorId = 1
   AND (
     c.description LIKE '%Oxford Mist%' OR
     c.description LIKE '%Oxford Sage%' OR
     c.description LIKE '%Oxford White%' OR
     c.description LIKE '%Shaker White%' OR
     c.description LIKE '%Shaker Gray%' OR
     c.description LIKE '%Shaker Black%'
   )
   AND dst.ourName NOT LIKE '%Oxford%'
   AND dst.ourName NOT LIKE '%Shaker%'
   ORDER BY dst.ourName, ds.distributorSku
   LIMIT 30`
);

if (allWrong.length > 0) {
  console.log(`Found ${allWrong.length} more wrong descriptions:`);
  allWrong.forEach(r => console.log(`  [${r.styleName}] ${r.distributorSku}: ${r.description.substring(0, 70)}`));
} else {
  console.log('No more wrong descriptions found.');
}

await conn.end();
