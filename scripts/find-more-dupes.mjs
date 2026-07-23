/**
 * Find more duplicate cabinets by looking at:
 * 1. US Cabinet Depot (945xxxx) items that match Ashford (939xxxx) items by normalized code
 * 2. Skyline (936xxxx) items that match Ashford items
 * 3. Items with very similar descriptions in the same category+dimensions
 */
import mysql from 'mysql2/promise';
import { readFileSync, writeFileSync } from 'fs';

const configPath = '/home/ubuntu/cabinet-dealz/.project-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const conn = await mysql.createConnection(config.env_vars.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT c.id, c.masterCode, c.description, c.category, c.subCategory,
         c.width, c.height, c.depth, c.numberOfDoors, c.numberOfDrawers,
         c.placementType,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1
  ORDER BY c.category, c.masterCode
`);

// Normalize a code: remove hyphens, lowercase
function normalize(code) {
  return code.replace(/[-_\s]/g, '').toLowerCase();
}

// Extract the base pattern from a code (letters + numbers without size suffixes)
function basePattern(code) {
  // Remove hyphens, then try to match the core pattern
  const clean = code.replace(/[-_]/g, '');
  return clean.toLowerCase();
}

// Group by normalized code to find matches
const normMap = new Map();
for (const r of rows) {
  const norm = normalize(r.masterCode);
  if (!normMap.has(norm)) normMap.set(norm, []);
  normMap.get(norm).push(r);
}

// Find groups with multiple items (these are code duplicates we missed)
const codeDupes = [];
for (const [norm, members] of normMap) {
  if (members.length > 1) {
    codeDupes.push({ norm, members });
  }
}

// Also look for FH/FHB pattern matches
// e.g., B42FH should match B-42FH, FHB-42
const fhPatterns = new Map();
for (const r of rows) {
  const code = r.masterCode;
  // Match patterns like B##FH, B-##FH, FHB-##, FHB##
  const fhMatch = code.match(/^(?:B-?(\d+)FH|FHB-?(\d+))$/i);
  if (fhMatch) {
    const size = fhMatch[1] || fhMatch[2];
    const key = `FH_BASE_${size}`;
    if (!fhPatterns.has(key)) fhPatterns.set(key, []);
    fhPatterns.get(key).push(r);
  }
}

// Look for Oven cabinet patterns: O##, UOC##
const ovenPatterns = new Map();
for (const r of rows) {
  const code = r.masterCode;
  const ovenMatch = code.match(/^(?:O|UOC)-?(\d{2})(\d{2})(\d{2})?$/i);
  if (ovenMatch) {
    const key = `OVEN_${ovenMatch[1]}_${ovenMatch[2]}`;
    if (!ovenPatterns.has(key)) ovenPatterns.set(key, []);
    ovenPatterns.get(key).push(r);
  }
}

// Look for Wall cabinets: W-##-## vs W####
const wallPatterns = new Map();
for (const r of rows) {
  if (r.category !== 'Wall') continue;
  const code = r.masterCode;
  // W-12-30 vs W1230, W-30-30GD vs W3030GD
  const wallMatch = code.match(/^W-?(\d+)-?(\d+)(GD)?$/i);
  if (wallMatch) {
    const key = `WALL_${wallMatch[1]}_${wallMatch[2]}_${wallMatch[3] || ''}`;
    if (!wallPatterns.has(key)) wallPatterns.set(key, []);
    wallPatterns.get(key).push(r);
  }
}

// Now look for description-based matches within same category+dimensions
// Focus on items where one has many SKUs and another has few
const dimGroups = new Map();
for (const r of rows) {
  const key = `${r.category}|${r.width}|${r.height}|${r.depth}`;
  if (!dimGroups.has(key)) dimGroups.set(key, []);
  dimGroups.get(key).push(r);
}

// Find potential matches based on description keywords
function descKeywords(desc) {
  if (!desc) return '';
  return desc.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .sort()
    .join(' ');
}

let output = `# Additional Potential Duplicates\n\n`;

// Section 1: Code normalization matches (already merged ones excluded)
output += `## Code-based matches (same code after removing hyphens)\n\n`;
let count = 0;
for (const { norm, members } of codeDupes) {
  if (members.length <= 1) continue;
  count++;
  output += `### ${count}. "${norm}" (${members.length} items)\n\n`;
  output += `| ID | Master Code | Description | SKUs | Category |\n`;
  output += `|---|---|---|---|---|\n`;
  for (const m of members) {
    output += `| ${m.id} | ${m.masterCode} | ${(m.description || '').substring(0, 60)} | ${m.skuCount} | ${m.category} |\n`;
  }
  output += `\n`;
}

// Section 2: Full Height Base pattern matches
output += `\n## Full Height Base (FH/FHB) pattern matches\n\n`;
let fhCount = 0;
for (const [key, members] of fhPatterns) {
  if (members.length <= 1) continue;
  fhCount++;
  output += `### ${fhCount}. ${key} (${members.length} items)\n\n`;
  output += `| ID | Master Code | Description | SKUs |\n`;
  output += `|---|---|---|---|\n`;
  for (const m of members) {
    output += `| ${m.id} | ${m.masterCode} | ${(m.description || '').substring(0, 60)} | ${m.skuCount} |\n`;
  }
  output += `\n`;
}

// Section 3: Items from 945xxxx that might match 939xxxx by removing hyphens from code
output += `\n## US Cabinet Depot (945xxx) items still active - potential Ashford matches\n\n`;
const usCab = rows.filter(r => r.id >= 9450000 && r.id <= 9459999);
const ashford = rows.filter(r => r.id >= 9390000 && r.id <= 9399999);
const skyline = rows.filter(r => r.id >= 9360000 && r.id <= 9369999);

output += `| ID | Master Code | Description | SKUs | Category | Possible Match |\n`;
output += `|---|---|---|---|---|---|\n`;
for (const us of usCab) {
  const usNorm = normalize(us.masterCode);
  // Look for match in Ashford or Skyline
  const match = [...ashford, ...skyline].find(a => {
    const aNorm = normalize(a.masterCode);
    // Check if codes match when normalized
    if (aNorm === usNorm) return true;
    // Check if one contains the other
    if (aNorm.includes(usNorm) || usNorm.includes(aNorm)) return true;
    return false;
  });
  if (match) {
    output += `| ${us.id} | ${us.masterCode} | ${(us.description || '').substring(0, 50)} | ${us.skuCount} | ${us.category} | ${match.masterCode} (${match.id}) |\n`;
  } else {
    output += `| ${us.id} | ${us.masterCode} | ${(us.description || '').substring(0, 50)} | ${us.skuCount} | ${us.category} | NO MATCH |\n`;
  }
}

writeFileSync('/home/ubuntu/cabinet-dealz/scripts/more-duplicates.md', output);
console.log(`Report written. US Cabinet Depot items still active: ${usCab.length}`);
console.log(`Ashford items: ${ashford.length}, Skyline items: ${skyline.length}`);
console.log(`Code-based dupe groups: ${count}`);

await conn.end();
