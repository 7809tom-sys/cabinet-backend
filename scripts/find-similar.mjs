/**
 * Find potential duplicate cabinets by matching:
 * - Same category
 * - Same width, height, depth
 * - Same number of doors and drawers
 * But different masterCode
 */
import mysql from 'mysql2/promise';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const configPath = resolve('/home/ubuntu/cabinet-dealz/.project-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const dbUrl = config.env_vars.DATABASE_URL;

const conn = await mysql.createConnection(dbUrl);

const [rows] = await conn.execute(`
  SELECT c.id, c.masterCode, c.description, c.category, c.subCategory,
         c.width, c.height, c.depth, c.numberOfDoors, c.numberOfDrawers,
         c.placementType, c.configuredAt,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1
  ORDER BY c.category, c.width, c.masterCode
`);

console.log(`Total active cabinets: ${rows.length}`);

// Group by fingerprint: category + width + height + depth + doors + drawers
const groups = new Map();
for (const r of rows) {
  const key = `${r.category}|${r.width}|${r.height}|${r.depth}|${r.numberOfDoors}|${r.numberOfDrawers}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

// Find groups with more than 1 cabinet (potential duplicates)
const potentialDupes = [];
for (const [key, members] of groups) {
  if (members.length > 1) {
    potentialDupes.push({ key, members });
  }
}

console.log(`\nFound ${potentialDupes.length} groups with potential duplicates (${potentialDupes.reduce((s, g) => s + g.members.length, 0)} cabinets total)\n`);

// Format output
let output = `# Potential Duplicate Cabinets\n\n`;
output += `Found ${potentialDupes.length} groups where cabinets share the same category, width, height, depth, doors, and drawers.\n\n`;
output += `Review each group and confirm which rows should be merged.\n\n`;
output += `---\n\n`;

let groupNum = 0;
for (const { key, members } of potentialDupes) {
  groupNum++;
  const [cat, w, h, d, doors, drawers] = key.split('|');
  output += `## Group ${groupNum}: ${cat} ${w}"W x ${h}"H x ${d}"D (${doors} door, ${drawers} drawer)\n\n`;
  output += `| ID | Master Code | Description | SKUs | Configured |\n`;
  output += `|---|---|---|---|---|\n`;
  for (const m of members) {
    const configured = m.configuredAt ? '✓' : '';
    output += `| ${m.id} | ${m.masterCode} | ${m.description || ''} | ${m.skuCount} | ${configured} |\n`;
  }
  output += `\n`;
}

writeFileSync('/home/ubuntu/cabinet-dealz/scripts/potential-duplicates.md', output);
console.log(`Report written to scripts/potential-duplicates.md`);

await conn.end();
