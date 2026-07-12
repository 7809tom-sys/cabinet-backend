import mysql from 'mysql2/promise';
import fs from 'fs';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Load all scraped data
const base = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_base.json'));
const wall = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_wall.json'));
const tall = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_tall.json'));
const accessories = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_accessories.json'));
const vanities = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_vanities.json'));

const allItems = [...base, ...wall, ...tall, ...accessories, ...vanities];
console.log(`Total GR items scraped: ${allItems.length}`);

// Portal uses GR- prefix, database uses SG- prefix for Shaker Gray
// Map portal prefix to DB prefix
function mapSku(portalSku) {
  if (portalSku.startsWith('GR-')) return 'SG-' + portalSku.slice(3);
  return portalSku; // non-prefixed items (RS18, Wood Tray, etc.) stay as-is
}

let updated = 0;
let notFound = [];
let skipped = 0;

for (const item of allItems) {
  if (!item.sku || item.cost === 0) { skipped++; continue; }
  
  const dbSku = mapSku(item.sku);
  
  const [rows] = await db.execute(
    `UPDATE distributor_skus SET yourCost = ?, listPrice = ? WHERE distributorSku = ?`,
    [item.cost, item.list, dbSku]
  );
  
  if (rows.affectedRows > 0) {
    updated++;
  } else {
    notFound.push({ portal: item.sku, db: dbSku, cost: item.cost });
  }
}

console.log(`Updated: ${updated}`);
console.log(`Skipped (zero cost): ${skipped}`);
console.log(`Not found (${notFound.length}):`, notFound.map(i => `${i.portal} → ${i.db}`).join(', '));

// Check what SG- SKUs already exist in the DB
const [existing] = await db.execute(
  `SELECT distributorSku, yourCost FROM distributor_skus WHERE distributorSku LIKE 'SG-%' LIMIT 10`
);
console.log('Existing SG- sample:', JSON.stringify(existing));

await db.end();
