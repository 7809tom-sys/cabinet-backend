import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '/home/ubuntu/cabinet-dealz/.env' });

// Parse the scraped prices file
const raw = readFileSync('/home/ubuntu/uscd_prices_raw.txt', 'utf8');
const prices = {};
for (const line of raw.trim().split('\n')) {
  const [sku, price] = line.trim().split(',');
  if (!sku || !price) continue;
  // Strip SU- prefix and Unfinished- prefix to match DB format
  const cleanSku = sku.replace(/^SU-/, '').replace(/^Unfinished-/, '');
  prices[cleanSku] = parseFloat(price);
}

console.log(`Loaded ${Object.keys(prices).length} prices`);
console.log('Sample:', Object.entries(prices).slice(0, 5));

const conn = await createConnection(process.env.DATABASE_URL);

// Get all distributor SKUs from the DB
const [rows] = await conn.query(
  `SELECT id, distributorSku, listPrice, yourCost FROM distributor_skus`
);

console.log(`Found ${rows.length} rows in DB`);

let updated = 0;
let notFound = [];

for (const row of rows) {
  const dbSku = row.distributorSku;
  const dealerPrice = prices[dbSku];
  
  if (dealerPrice === undefined) {
    notFound.push(dbSku);
    continue;
  }
  
  // Update listPrice = dealer price, yourCost = dealer price (costMultiplier = 1.0)
  await conn.query(
    `UPDATE distributor_skus SET listPrice = ?, yourCost = ? WHERE id = ?`,
    [dealerPrice, dealerPrice, row.id]
  );
  updated++;
}

console.log(`\nUpdated: ${updated} SKUs`);
console.log(`Not found in scraped data: ${notFound.length}`);
if (notFound.length > 0) {
  console.log('Missing SKUs:', notFound.slice(0, 20));
}

// Also update the costMultiplier in distributors table to 1.0 for Line A
const [distRows] = await conn.query(`SELECT id, name, costMultiplier FROM distributors`);
console.log('\nDistributors:', distRows.map(r => `${r.id}: ${r.name} (multiplier: ${r.costMultiplier})`));

await conn.end();
console.log('\nDone!');
