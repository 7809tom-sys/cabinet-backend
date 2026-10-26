/**
 * Find Skyline (936xxxx) items that are likely duplicates of Ashford (939xxxx) items
 * by matching category + dimensions + description keywords
 */
import mysql from 'mysql2/promise';
import { readFileSync, writeFileSync } from 'fs';

const configPath = '/home/ubuntu/cabinet-dealz/.project-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const conn = await mysql.createConnection(config.env_vars.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT c.id, c.masterCode, c.description, c.category, c.subCategory,
         c.width, c.height, c.depth, c.numberOfDoors, c.numberOfDrawers,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1
  ORDER BY c.id
`);

const skyline = rows.filter(r => r.id >= 9360000 && r.id <= 9369999);
const ashford = rows.filter(r => r.id >= 9390000 && r.id <= 9399999);
const usCab = rows.filter(r => r.id >= 9450000 && r.id <= 9459999);
const ada = rows.filter(r => r.id >= 9690000 && r.id <= 9699999);
const accessories = rows.filter(r => r.id >= 9720000 && r.id <= 9729999);

let output = `# Remaining Active Cabinets by Source\n\n`;
output += `- Skyline (936xxx): ${skyline.length} items\n`;
output += `- Ashford (939xxx): ${ashford.length} items\n`;
output += `- US Cabinet Depot (945xxx): ${usCab.length} items\n`;
output += `- ADA (969xxx): ${ada.length} items\n`;
output += `- Accessories (972xxx): ${accessories.length} items\n`;
output += `- **Total: ${rows.length}**\n\n`;

// For each Skyline item, find potential Ashford match
output += `---\n\n## Skyline items (936xxx) - ${skyline.length} remaining\n\n`;
output += `These are Skyline items that survived the first merge. Showing each with its best Ashford match candidate.\n\n`;

output += `| # | Skyline ID | Code | Description | SKUs | Best Ashford Match | Match Code | Match Desc | Match SKUs | Same? |\n`;
output += `|---|---|---|---|---|---|---|---|---|---|\n`;

let num = 0;
for (const s of skyline) {
  num++;
  // Find best Ashford match: same category + same dimensions
  const candidates = ashford.filter(a => 
    a.category === s.category && 
    a.width === s.width && 
    a.height === s.height && 
    a.depth === s.depth
  );
  
  if (candidates.length > 0) {
    // Pick the one with most similar description or most SKUs
    const best = candidates.sort((a, b) => b.skuCount - a.skuCount)[0];
    output += `| ${num} | ${s.id} | ${s.masterCode} | ${(s.description || '').substring(0, 45)} | ${s.skuCount} | ${best.id} | ${best.masterCode} | ${(best.description || '').substring(0, 45)} | ${best.skuCount} | ? |\n`;
  } else {
    output += `| ${num} | ${s.id} | ${s.masterCode} | ${(s.description || '').substring(0, 45)} | ${s.skuCount} | - | NO MATCH | - | - | unique |\n`;
  }
}

// Also show US Cabinet Depot items
output += `\n---\n\n## US Cabinet Depot items (945xxx) - ${usCab.length} remaining\n\n`;
output += `| # | ID | Code | Description | SKUs | Category |\n`;
output += `|---|---|---|---|---|---|\n`;
num = 0;
for (const u of usCab) {
  num++;
  output += `| ${num} | ${u.id} | ${u.masterCode} | ${(u.description || '').substring(0, 55)} | ${u.skuCount} | ${u.category} |\n`;
}

writeFileSync('/home/ubuntu/cabinet-dealz/scripts/skyline-audit.md', output);
console.log(`Done. Skyline: ${skyline.length}, Ashford: ${ashford.length}, US Cab: ${usCab.length}`);

await conn.end();
