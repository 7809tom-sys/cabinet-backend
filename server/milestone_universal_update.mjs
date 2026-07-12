/**
 * Universal Milestone price updater.
 * Usage: STYLE_PREFIX=SG STYLE_ID=30045 node milestone_universal_update.mjs
 * 
 * Reads scraped price data from /home/ubuntu/milestone_scraped_{STYLE_PREFIX}.json
 * Format: [{ sku: "SG-B09", cost: 45.50, list: 130.00, desc: "...", w: 9, h: 34.5, d: 24, cat: "Base", sub: "Base", placement: "base" }]
 */
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const STYLE_PREFIX = process.env.STYLE_PREFIX;
const STYLE_ID = parseInt(process.env.STYLE_ID);
const DIST_ID = 1;

if (!STYLE_PREFIX || !STYLE_ID) {
  console.error('Usage: STYLE_PREFIX=SG STYLE_ID=30045 npx tsx milestone_universal_update.mjs');
  process.exit(1);
}

const dataFile = `/home/ubuntu/milestone_scraped_${STYLE_PREFIX}.json`;
let items;
try {
  items = JSON.parse(readFileSync(dataFile, 'utf8'));
} catch (e) {
  console.error(`Cannot read ${dataFile}: ${e.message}`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
const [, user, pass, host, port, db] = match;
const conn = await createConnection({ host, port: port ? +port : 3306, user, password: pass, database: db, ssl: { rejectUnauthorized: false } });

let updated = 0, added = 0, skipped = 0, errors = 0;

for (const item of items) {
  try {
    // Check if SKU already exists
    const [existing] = await conn.query(
      `SELECT id, yourCost FROM distributor_skus WHERE distributorId = ? AND distributorSku = ? LIMIT 1`,
      [DIST_ID, item.sku]
    );

    if (existing.length > 0) {
      const row = existing[0];
      const currentCost = row.yourCost ? parseFloat(row.yourCost) : null;
      if (currentCost === item.cost) { skipped++; continue; }
      await conn.query(`UPDATE distributor_skus SET yourCost = ? WHERE id = ?`, [item.cost, row.id]);
      console.log(`UPDATED ${item.sku}: ${currentCost ?? 'null'} → ${item.cost}`);
      updated++;
      continue;
    }

    // Not found — try to find the base cabinet by stripping the style prefix
    // e.g. SG-B09 → B09, SW-B09 → B09
    const baseCode = item.sku.replace(/^[A-Z]+-/, '');
    const [cabRows] = await conn.query(`SELECT id FROM cabinets WHERE masterCode = ? LIMIT 1`, [baseCode]);
    let cabinetId;
    if (cabRows.length > 0) {
      cabinetId = cabRows[0].id;
    } else {
      // Create new cabinet record
      const [ins] = await conn.query(
        `INSERT INTO cabinets (masterCode, description, descriptionSource, category, subCategory, width, height, depth, placementType, numberOfDoors, numberOfDrawers, priceVerified)
         VALUES (?, ?, 'distributor', ?, ?, ?, ?, ?, ?, 0, 0, false)`,
        [baseCode, item.desc || item.sku, item.cat || 'Base', item.sub || 'Base Cabinet', item.w || 0, item.h || 0, item.d || 0, item.placement || 'base']
      );
      cabinetId = ins.insertId;
      console.log(`  Created cabinet id=${cabinetId} for ${baseCode}`);
    }

    const platformSku = `${baseCode}-${STYLE_ID}`;
    await conn.query(
      `INSERT INTO distributor_skus (distributorId, cabinetId, styleId, platformSku, distributorSku, listPrice, yourCost, isPublished, isAvailable, supplierCabinetName)
       VALUES (?, ?, ?, ?, ?, ?, ?, true, true, ?)
       ON DUPLICATE KEY UPDATE yourCost = VALUES(yourCost), listPrice = VALUES(listPrice)`,
      [DIST_ID, cabinetId, STYLE_ID, platformSku, item.sku, item.list, item.cost, item.desc || item.sku]
    );
    console.log(`ADDED ${item.sku}: cost=${item.cost}, list=${item.list}`);
    added++;
  } catch (e) {
    console.error(`ERROR on ${item.sku}: ${e.message}`);
    errors++;
  }
}

console.log(`\n=== ${STYLE_PREFIX} SUMMARY ===`);
console.log(`  Updated: ${updated}, Added: ${added}, Skipped (no change): ${skipped}, Errors: ${errors}`);
await conn.end();
process.exit(0);
