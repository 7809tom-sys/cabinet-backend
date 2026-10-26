/**
 * Update Floral Grey (FG) dealer costs from portal-scraped data.
 * Updates existing SKUs and adds missing ones.
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const scraped = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_FG.json', 'utf8'));
console.log(`Loaded ${scraped.length} items for Floral Grey`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// The style ID for Floral Grey is 180021 (confirmed from DB check)
const STYLE_ID = 180021;
const STYLE_CODE = 'FG';
const DISTRIBUTOR_ID = 1;

let updated = 0;
let added = 0;
let skipped = 0;
const missing = [];

for (const item of scraped) {
  const { sku, cost, list } = item;
  
  // Skip items with $0 cost (like door samples)
  if (!cost || cost === 0 || isNaN(cost)) {
    console.log(`  Skipping ${sku} - no cost`);
    skipped++;
    continue;
  }
  
  // Check if this SKU already exists in distributor_skus
  const [existing] = await conn.execute(
    `SELECT id, yourCost, listPrice FROM distributor_skus 
     WHERE distributorSku = ? AND distributorId = ?`,
    [sku, DISTRIBUTOR_ID]
  );
  
  if (existing.length > 0) {
    // Update the cost
    await conn.execute(
      `UPDATE distributor_skus SET yourCost = ?, listPrice = ? WHERE id = ?`,
      [cost, list || null, existing[0].id]
    );
    updated++;
  } else {
    // New SKU - need to find the cabinet masterCode from the SKU
    const baseCode = sku.replace(`${STYLE_CODE}-`, '');
    
    // Find the cabinet
    const [cabinets] = await conn.execute(
      `SELECT id, masterCode FROM cabinets WHERE masterCode = ? LIMIT 1`,
      [baseCode]
    );
    
    if (cabinets.length === 0) {
      missing.push({ sku, baseCode, cost });
      skipped++;
      continue;
    }
    
    // Insert new distributor_sku
    await conn.execute(
      `INSERT INTO distributor_skus (distributorSku, platformSku, cabinetId, styleId, distributorId, listPrice, yourCost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sku, sku, cabinets[0].id, STYLE_ID, DISTRIBUTOR_ID, list || null, cost]
    );
    added++;
    console.log(`  Added: ${sku} @ $${cost}`);
  }
}

console.log(`\nDone for Floral Grey (FG):`);
console.log(`  Updated: ${updated}`);
console.log(`  Added: ${added}`);
console.log(`  Skipped: ${skipped}`);

if (missing.length > 0) {
  console.log(`\nMissing cabinets (no masterCode match):`);
  missing.forEach(m => console.log(`  ${m.sku} -> baseCode: ${m.baseCode} @ $${m.cost}`));
}

await conn.end();
