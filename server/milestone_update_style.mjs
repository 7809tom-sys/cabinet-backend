/**
 * Reusable script to update a Milestone door style's dealer costs from scraped portal data.
 * Usage: node milestone_update_style.mjs <jsonFile> <styleCode>
 * Example: node milestone_update_style.mjs /home/ubuntu/milestone_scraped_FG.json FG
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const jsonFile = process.argv[2];
const styleCode = process.argv[3];

if (!jsonFile || !styleCode) {
  console.error('Usage: node milestone_update_style.mjs <jsonFile> <styleCode>');
  process.exit(1);
}

const scraped = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
console.log(`Loaded ${scraped.length} items for style ${styleCode}`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find the door style ID for this style code
const [styleRows] = await conn.execute(
  `SELECT id, ourName FROM door_styles WHERE distributorId = 1 AND (
    ourName LIKE ? OR distributorName LIKE ? OR doorStyle LIKE ?
  ) LIMIT 5`,
  [`%${styleCode}%`, `%${styleCode}%`, `%${styleCode}%`]
);

if (styleRows.length === 0) {
  console.error(`No door style found for code ${styleCode}`);
  // Try to find by looking at existing distributor_skus
  const [skuRows] = await conn.execute(
    `SELECT DISTINCT ds.styleId, dst.ourName FROM distributor_skus ds 
     JOIN door_styles dst ON ds.styleId = dst.id
     WHERE ds.distributorSku LIKE ? AND ds.distributorId = 1 LIMIT 5`,
    [`${styleCode}-%`]
  );
  if (skuRows.length > 0) {
    console.log('Found by SKU prefix:', skuRows);
  }
  await conn.end();
  process.exit(1);
}

console.log('Found door styles:', styleRows.map(r => `${r.id}: ${r.ourName}`).join(', '));

// Use the first match
const styleId = styleRows[0].id;
console.log(`Using styleId: ${styleId} (${styleRows[0].ourName})`);

let updated = 0;
let added = 0;
let skipped = 0;

for (const item of scraped) {
  const { sku, cost, list } = item;
  
  // Skip items with $0 cost (like door samples)
  if (cost === 0 || cost === null || isNaN(cost)) {
    skipped++;
    continue;
  }
  
  // Check if this SKU already exists in distributor_skus
  const [existing] = await conn.execute(
    `SELECT id, yourCost, listPrice FROM distributor_skus 
     WHERE distributorSku = ? AND distributorId = 1`,
    [sku]
  );
  
  if (existing.length > 0) {
    // Update the cost
    await conn.execute(
      `UPDATE distributor_skus SET yourCost = ?, listPrice = ? WHERE id = ?`,
      [cost, list || null, existing[0].id]
    );
    updated++;
  } else {
    // Need to find the cabinet masterCode from the SKU
    // Strip the style prefix to get the base code
    const baseCode = sku.replace(`${styleCode}-`, '');
    
    // Find the cabinet
    const [cabinets] = await conn.execute(
      `SELECT id, masterCode FROM cabinets WHERE masterCode = ? LIMIT 1`,
      [baseCode]
    );
    
    if (cabinets.length === 0) {
      console.log(`  Cabinet not found for SKU ${sku} (baseCode: ${baseCode})`);
      skipped++;
      continue;
    }
    
    const cabinetId = cabinets[0].id;
    
    // Insert new distributor_sku
    await conn.execute(
      `INSERT INTO distributor_skus (distributorSku, platformSku, styleId, distributorId, listPrice, yourCost)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [sku, sku, styleId, list || null, cost]
    );
    added++;
    console.log(`  Added: ${sku} @ $${cost}`);
  }
}

console.log(`\nDone for ${styleCode}:`);
console.log(`  Updated: ${updated}`);
console.log(`  Added: ${added}`);
console.log(`  Skipped: ${skipped}`);

await conn.end();
