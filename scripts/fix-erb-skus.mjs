/**
 * fix-erb-skus.mjs
 * 
 * ERB-33 and ERB-36 (Easy Reach Corner Base) cabinets have no distributor SKUs,
 * so they never appear in the Kitchen Designer when a distributor/style is selected.
 * 
 * This script copies the SKU structure from BBC-36 (Blind Corner Base) for each
 * style/distributor combination, creating matching SKUs for ERB-33 and ERB-36
 * with the same pricing as BBC-36 (they are similar-sized corner base cabinets).
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse mysql://user:pass@host:port/db
const url = new URL(DB_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log('Connected to database');

// Get cabinet IDs
const [cabRows] = await conn.execute(
  "SELECT id, masterCode FROM cabinets WHERE masterCode IN ('BBC-36','ERB-33','ERB-36','LSB33','LSB36')"
);
console.log('Cabinet rows:', cabRows);

const cabMap = {};
for (const r of cabRows) {
  cabMap[r.masterCode] = r.id;
}
console.log('Cabinet ID map:', cabMap);

// Get all BBC-36 SKUs as the template
const [bbcSkus] = await conn.execute(
  `SELECT distributorId, styleId, platformSku, distributorSku, listPrice, yourCost, 
   adjustedListPrice, wholesalePrice, contractorPrice, homeownerPrice, 
   isAvailable, isPublished, imageUrl, supplierCabinetName
   FROM distributor_skus WHERE cabinetId = ?`,
  [cabMap['BBC-36']]
);
console.log(`Found ${bbcSkus.length} BBC-36 SKUs to use as template`);

// Check existing ERB SKUs
const [existingErb] = await conn.execute(
  `SELECT cabinetId, distributorId, styleId FROM distributor_skus 
   WHERE cabinetId IN (?, ?)`,
  [cabMap['ERB-33'], cabMap['ERB-36']]
);
console.log(`Existing ERB SKUs: ${existingErb.length}`);

// Build set of existing (cabinetId, distributorId, styleId) combos
const existingSet = new Set(existingErb.map(r => `${r.cabinetId}-${r.distributorId}-${r.styleId}`));

// Insert missing ERB-33 and ERB-36 SKUs for each BBC-36 style/distributor combo
let inserted = 0;
for (const sku of bbcSkus) {
  for (const [code, cabinetId] of [['ERB-33', cabMap['ERB-33']], ['ERB-36', cabMap['ERB-36']]]) {
    const key = `${cabinetId}-${sku.distributorId}-${sku.styleId}`;
    if (existingSet.has(key)) {
      console.log(`  Skipping ${code} (already exists for dist=${sku.distributorId} style=${sku.styleId})`);
      continue;
    }
    
    // Generate platform SKU based on the code
    const styleCode = sku.platformSku ? sku.platformSku.split('-').slice(-1)[0] : '';
    const newPlatformSku = `${code}-${sku.styleId}`;
    const newDistributorSku = sku.distributorSku ? sku.distributorSku.replace('BBC-36', code).replace('BBC36', code.replace('-','')) : null;
    
    await conn.execute(
      `INSERT INTO distributor_skus 
       (cabinetId, distributorId, styleId, platformSku, distributorSku, listPrice, yourCost,
        adjustedListPrice, wholesalePrice, contractorPrice, homeownerPrice,
        isAvailable, isPublished, imageUrl, supplierCabinetName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cabinetId,
        sku.distributorId,
        sku.styleId,
        newPlatformSku,
        newDistributorSku,
        sku.listPrice,
        sku.yourCost,
        sku.adjustedListPrice,
        sku.wholesalePrice,
        sku.contractorPrice,
        sku.homeownerPrice,
        sku.isAvailable,
        sku.isPublished,
        null, // no image override
        `${code} Easy Reach Corner Base Cabinet`,
      ]
    );
    inserted++;
    console.log(`  Inserted ${code} for dist=${sku.distributorId} style=${sku.styleId}`);
  }
}

console.log(`\nDone! Inserted ${inserted} new ERB SKUs.`);
await conn.end();
