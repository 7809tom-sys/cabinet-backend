import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const configPath = '/home/ubuntu/cabinet-dealz/.project-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const conn = await mysql.createConnection(config.env_vars.DATABASE_URL);

// Get all active cabinets grouped by source
const [all] = await conn.execute(`
  SELECT id, masterCode, description, category, subCategory, width, height, depth,
         numberOfDoors, numberOfDrawers,
         (SELECT COUNT(*) FROM distributor_skus ds WHERE ds.cabinetId = c.id) as skuCount
  FROM cabinets c
  WHERE c.isActive = 1
  ORDER BY c.category, c.width, c.masterCode
`);

// Group by source
const skyline = all.filter(r => r.id >= 9360000 && r.id <= 9369999);
const ashford = all.filter(r => r.id >= 9390000 && r.id <= 9399999);
const usCab = all.filter(r => r.id >= 9450000 && r.id <= 9459999);
const other = all.filter(r => r.id >= 9720000);

console.log(`Total active: ${all.length}`);
console.log(`Skyline: ${skyline.length} | Ashford: ${ashford.length} | US Cab Depot: ${usCab.length} | Other: ${other.length}`);
console.log("");

// For each Skyline item, try to find an Ashford match by same category + width + height + doors + drawers
console.log("=== SKYLINE ITEMS WITHOUT ASHFORD MATCH (potential unique items) ===");
console.log("");

const unmatched = [];
const matched = [];

for (const s of skyline) {
  const match = ashford.find(a => 
    a.category === s.category &&
    a.width === s.width &&
    a.height === s.height &&
    a.numberOfDoors === s.numberOfDoors &&
    a.numberOfDrawers === s.numberOfDrawers
  );
  if (match) {
    matched.push({ skyline: s, ashford: match });
  } else {
    unmatched.push(s);
  }
}

console.log(`Matched (potential duplicates): ${matched.length}`);
console.log(`Unmatched (unique Skyline items): ${unmatched.length}`);
console.log("");

console.log("=== POTENTIAL DUPLICATES (Skyline → Ashford match by dims) ===");
for (const m of matched) {
  console.log(`SKY: ${m.skyline.masterCode.padEnd(12)} (${m.skyline.id}, ${m.skyline.skuCount} SKUs) | ${m.skyline.description?.substring(0,45)}`);
  console.log(`ASH: ${m.ashford.masterCode.padEnd(12)} (${m.ashford.id}, ${m.ashford.skuCount} SKUs) | ${m.ashford.description?.substring(0,45)}`);
  console.log("");
}

console.log("=== US CAB DEPOT ITEMS WITHOUT ASHFORD MATCH ===");
const usCabUnmatched = [];
const usCabMatched = [];
for (const u of usCab) {
  const match = ashford.find(a =>
    a.category === u.category &&
    a.width === u.width &&
    a.height === u.height &&
    a.numberOfDoors === u.numberOfDoors &&
    a.numberOfDrawers === u.numberOfDrawers
  );
  if (match) {
    usCabMatched.push({ usCab: u, ashford: match });
  } else {
    usCabUnmatched.push(u);
  }
}

console.log(`US Cab matched: ${usCabMatched.length} | Unmatched: ${usCabUnmatched.length}`);
console.log("");
for (const m of usCabMatched) {
  console.log(`USC: ${m.usCab.masterCode.padEnd(12)} (${m.usCab.id}, ${m.usCab.skuCount} SKUs) | ${m.usCab.description?.substring(0,45)}`);
  console.log(`ASH: ${m.ashford.masterCode.padEnd(12)} (${m.ashford.id}, ${m.ashford.skuCount} SKUs) | ${m.ashford.description?.substring(0,45)}`);
  console.log("");
}

await conn.end();
