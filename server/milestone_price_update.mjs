// Update yourCost for Milestone Shaker White SKUs from portal dealer prices
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
const [, user, pass, host, port, db] = match;

const conn = await createConnection({
  host, port: port ? +port : 3306,
  user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

// Portal prices scraped from Milestone website (dealer cost = yourCost)
const portalPrices = JSON.parse(readFileSync('/home/ubuntu/milestone_prices_shaker_white.json', 'utf8'));

console.log(`\nLoaded ${portalPrices.length} SKUs from portal`);

let updated = 0;
let notFound = [];
let alreadyCorrect = 0;

for (const item of portalPrices) {
  const portalSku = item.sku; // e.g. "SW-BT09"
  const dealerCost = parseFloat(item.dealerPrice.replace('$', ''));
  const listPrice = parseFloat(item.listPrice.replace('$', ''));
  
  // Find matching row in distributor_skus (distributorId=1, distributorSku=SW-BT09)
  const [rows] = await conn.query(
    'SELECT id, distributorSku, yourCost, listPrice FROM distributor_skus WHERE distributorId = 1 AND distributorSku = ? LIMIT 1',
    [portalSku]
  );
  
  if (rows.length === 0) {
    notFound.push(portalSku);
    continue;
  }
  
  const row = rows[0];
  const currentCost = row.yourCost ? parseFloat(row.yourCost) : null;
  
  if (currentCost === dealerCost) {
    alreadyCorrect++;
    continue;
  }
  
  // Update yourCost
  await conn.query(
    'UPDATE distributor_skus SET yourCost = ? WHERE id = ?',
    [dealerCost, row.id]
  );
  
  console.log(`  UPDATED ${portalSku}: cost ${currentCost ?? 'null'} → ${dealerCost} (list: ${listPrice})`);
  updated++;
}

console.log(`\n=== SUMMARY ===`);
console.log(`  Updated: ${updated}`);
console.log(`  Already correct: ${alreadyCorrect}`);
console.log(`  Not found in DB: ${notFound.length}`);
if (notFound.length > 0) console.log(`  Missing SKUs: ${notFound.join(', ')}`);

await conn.end();
process.exit(0);
