/**
 * Cabinet Dealz — Distributor SKUs Seed Script
 * Seeds the distributor_skus table from:
 *   - /home/ubuntu/ucd_tab.csv        (US Cabinet Depot, per-style list prices)
 *   - /home/ubuntu/clark_tab.csv      (Clark & Son, per-row with style code)
 *   - /home/ubuntu/skyline_tab.csv    (Skyline, per-style columns)
 *
 * Pricing formula:
 *   Your Cost     = List Price × costMultiplier (UCD: 0.30, CS: 0.38, SK: 0.35)
 *   Adj List      = Your Cost ÷ 0.30
 *   Wholesale     = Adj List × 0.50
 *   Contractor    = Adj List × 0.60
 *   Homeowner     = Adj List × 0.80
 *
 * Run: node server/seed_skus.mjs
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected to database');

// ─── Load lookup tables ───────────────────────────────────────────────────────

const [distRows] = await conn.execute('SELECT id, code, costMultiplier FROM distributors');
const distByCode = {};
for (const r of distRows) distByCode[r.code] = r;
console.log('Distributors:', Object.keys(distByCode));

const [styleRows] = await conn.execute('SELECT id, distributorId, styleCode FROM door_styles');
// Map: distCode -> styleCode -> styleId
const styleMap = {};
for (const r of styleRows) {
  const dist = distRows.find(d => d.id === r.distributorId);
  if (!dist) continue;
  if (!styleMap[dist.code]) styleMap[dist.code] = {};
  styleMap[dist.code][r.styleCode] = r.id;
}
console.log('Style map keys:', Object.keys(styleMap));

const [cabinetRows] = await conn.execute('SELECT id, masterCode FROM cabinets');
// Build multiple lookup keys per cabinet
const cabinetByCode = {};
for (const r of cabinetRows) {
  cabinetByCode[r.masterCode] = r.id;
  // Also index normalized versions
  const norm = r.masterCode.replace(/-/g, '').toUpperCase();
  cabinetByCode[norm] = r.id;
}
console.log(`Loaded ${cabinetRows.length} cabinets`);

// ─── Pricing helpers ──────────────────────────────────────────────────────────

function parsePrice(val) {
  if (!val) return null;
  const s = String(val).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function calcPricing(listPrice, costMultiplier) {
  if (!listPrice || listPrice <= 0) return null;
  const yourCost = round2(listPrice * costMultiplier);
  const adjList = round2(yourCost / 0.30);
  const wholesale = round2(adjList * 0.50);
  const contractor = round2(adjList * 0.60);
  const homeowner = round2(adjList * 0.80);
  return { yourCost, adjList, wholesale, contractor, homeowner };
}

// ─── Find cabinet ID with fallback normalization ──────────────────────────────

function findCabinetId(masterCode) {
  if (!masterCode) return null;
  const mc = String(masterCode).trim();
  // Direct lookup
  if (cabinetByCode[mc]) return cabinetByCode[mc];
  // Normalized (no dashes, uppercase)
  const norm = mc.replace(/-/g, '').toUpperCase();
  if (cabinetByCode[norm]) return cabinetByCode[norm];
  // Try with dashes added in common patterns
  // e.g. "DB12" -> "DB-12-3" or "B12" -> "B-12"
  return null;
}

// ─── Batch insert helper ──────────────────────────────────────────────────────

let insertCount = 0;
let skipCount = 0;

async function insertSku(platformSku, cabinetId, distributorId, styleId, distSku, listPrice, pricing) {
  if (!cabinetId || !styleId || !pricing) { skipCount++; return; }
  try {
    await conn.execute(
      `INSERT INTO distributor_skus
        (cabinetId, distributorId, styleId, platformSku, distributorSku,
         listPrice, yourCost, adjustedListPrice, wholesalePrice, contractorPrice, homeownerPrice,
         isAvailable, isPublished)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE
         listPrice=VALUES(listPrice), yourCost=VALUES(yourCost),
         adjustedListPrice=VALUES(adjustedListPrice), wholesalePrice=VALUES(wholesalePrice),
         contractorPrice=VALUES(contractorPrice), homeownerPrice=VALUES(homeownerPrice)`,
      [
        cabinetId, distributorId, styleId, platformSku, distSku,
        listPrice, pricing.yourCost, pricing.adjList,
        pricing.wholesale, pricing.contractor, pricing.homeowner,
      ]
    );
    insertCount++;
    if (insertCount % 500 === 0) process.stdout.write(`  ${insertCount} SKUs inserted...\r`);
  } catch (err) {
    if (!err.message.includes('Duplicate')) {
      console.error(`Error inserting ${platformSku}:`, err.message);
    }
    skipCount++;
  }
}

// ─── 1. US Cabinet Depot ──────────────────────────────────────────────────────

console.log('\n--- Seeding US Cabinet Depot SKUs ---');
const ucdRaw = fs.readFileSync('/home/ubuntu/ucd_tab.csv', 'utf8');
const ucdRows = parse(ucdRaw, { columns: true, skip_empty_lines: true });

const ucdDist = distByCode['UCD'];
const ucdCostMult = parseFloat(ucdDist.costMultiplier);

// Headers: SKU, Description, Weight, Group A Price, Group B Price, Group C Price, Group D Price,
//          Shaker White (SW), Shaker Antique White (SA), ...
// Style columns have format "Style Name (CODE)"
const ucdHeaders = Object.keys(ucdRows[0]);
const ucdStyleCols = ucdHeaders.filter(h => h.match(/\(([A-Z]+)\)$/));
console.log(`UCD style columns: ${ucdStyleCols.length}`);

for (const row of ucdRows) {
  const distSku = row['SKU'];
  if (!distSku) continue;

  const cabinetId = findCabinetId(distSku);

  for (const col of ucdStyleCols) {
    const match = col.match(/\(([A-Z]+)\)$/);
    if (!match) continue;
    const styleCode = match[1];
    const styleId = styleMap['UCD']?.[styleCode];
    if (!styleId) continue;

    const listPrice = parsePrice(row[col]);
    if (!listPrice) continue; // item not available in this style

    const pricing = calcPricing(listPrice, ucdCostMult);
    const platformSku = `${distSku}-${styleCode}-UCD`;

    await insertSku(platformSku, cabinetId, ucdDist.id, styleId, distSku, listPrice, pricing);
  }
}
console.log(`\nUCD done: ${insertCount} inserted, ${skipCount} skipped`);

// ─── 2. Clark & Son ───────────────────────────────────────────────────────────

const prevInsert = insertCount;
const prevSkip = skipCount;
console.log('\n--- Seeding Clark & Son SKUs ---');
const csRaw = fs.readFileSync('/home/ubuntu/clark_tab.csv', 'utf8');
const csRows = parse(csRaw, { columns: true, skip_empty_lines: true });

const csDist = distByCode['CS'];
const csCostMult = parseFloat(csDist.costMultiplier);

for (const row of csRows) {
  const masterCode = (row['Master Code'] || '').trim();
  const styleCode = (row['Door Style'] || '').trim();
  const distSku = (row['sku'] || '').trim();
  const basePriceRaw = row['Base Price'];

  if (!masterCode || !styleCode || !distSku) continue;

  const cabinetId = findCabinetId(masterCode);
  const styleId = styleMap['CS']?.[styleCode];
  if (!styleId) continue;

  const listPrice = parsePrice(basePriceRaw);
  if (!listPrice) continue;

  const pricing = calcPricing(listPrice, csCostMult);
  // Platform SKU: MasterCode-StyleCode-CS  e.g. DB12-ASP-CS
  // Normalize masterCode: remove dashes
  const normCode = masterCode.replace(/-/g, '');
  const platformSku = `${normCode}-${styleCode}-CS`;

  await insertSku(platformSku, cabinetId, csDist.id, styleId, distSku, listPrice, pricing);
}
console.log(`\nCS done: ${insertCount - prevInsert} inserted, ${skipCount - prevSkip} skipped`);

// ─── 3. Skyline ───────────────────────────────────────────────────────────────

const prevInsert2 = insertCount;
const prevSkip2 = skipCount;
console.log('\n--- Seeding Skyline SKUs ---');
const skRaw = fs.readFileSync('/home/ubuntu/skyline_tab.csv', 'utf8');
const skRows = parse(skRaw, { columns: true, skip_empty_lines: true });

const skDist = distByCode['SK'];
const skCostMult = parseFloat(skDist.costMultiplier);

// Headers include triplets: StyleCode, "StyleCode Our Price", "StyleCode Adj List Price"
// We only need the list price (first of each triplet = the SW list, GR list, etc.)
const skHeaders = Object.keys(skRows[0]);
// Style codes are the short uppercase headers
const skStyleCols = skHeaders.filter(h => {
  const t = h.trim();
  return t.length >= 2 && t.length <= 4 && /^[A-Z]+$/.test(t) &&
    !['SW', 'GR', 'SE', 'NB', 'AG', 'IB', 'SA', 'LG', 'SB', 'TC', 'RW', 'AW', 'AC',
      'DSG', 'DDW', 'CW', 'SDW', 'SAG', 'SIB', 'SAO', 'SWO', 'HW', 'HG', 'MB', 'MI',
      'OB', 'OS', 'CG', 'MG', 'FW', 'FG', 'FE'].indexOf(t) === -1
    ? false : true;
});

// Actually just find all style codes that exist in our styleMap for SK
const skStyleCodesAvailable = Object.keys(styleMap['SK'] || {});
console.log(`Skyline styles available in DB: ${skStyleCodesAvailable.length}`);

for (const row of skRows) {
  const masterCode = (row['Master Code'] || '').trim();
  const distSku = (row['SKU'] || '').trim();
  if (!masterCode || !distSku) continue;

  const cabinetId = findCabinetId(masterCode);

  for (const styleCode of skStyleCodesAvailable) {
    const styleId = styleMap['SK']?.[styleCode];
    if (!styleId) continue;

    // The list price column for this style is just the styleCode header
    const listPrice = parsePrice(row[styleCode]);
    if (!listPrice) continue; // not available in this style

    const pricing = calcPricing(listPrice, skCostMult);
    const normCode = masterCode.replace(/-/g, '');
    const platformSku = `${normCode}-${styleCode}-SK`;

    await insertSku(platformSku, cabinetId, skDist.id, styleId, distSku, listPrice, pricing);
  }
}
console.log(`\nSkyline done: ${insertCount - prevInsert2} inserted, ${skipCount - prevSkip2} skipped`);

// ─── Summary ──────────────────────────────────────────────────────────────────

await conn.end();
console.log(`\n✅ Distributor SKU seed complete!`);
console.log(`   Total inserted: ${insertCount}`);
console.log(`   Total skipped:  ${skipCount}`);
