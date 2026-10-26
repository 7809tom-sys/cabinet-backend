/**
 * preview_capital_prices.mjs
 * DRY RUN — shows what would be imported without touching the database.
 */
import { createConnection } from 'mysql2/promise';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISTRIBUTOR_ID = 210002;

const STYLE_COLUMN = {
  SW: 'a', SA: 'a', SD: 'a', SG: 'a', SU: 'a',
  SI: 'b', SN: 'b', SB: 'b', SH: 'b', SC: 'b', EW: 'b',
  OW: 'c', OC: 'c', OS: 'c', CW: 'c', CS: 'c', HD: 'c', HS: 'c', HH: 'c',
  OM: 'd', OT: 'd', HR: 'd', HE: 'd', SEO: 'd',
};

function parsePrice(raw) {
  if (!raw || /^[XN]/.test(raw.trim())) return null;
  const cleaned = raw.replace(/[$,†*]/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function extractPricingRows(text) {
  const lines = text.split('\n');
  const results = [];
  const seen = new Set();
  const ITEM_CODE_RE = /^\s{0,3}([A-Z][A-Z0-9]{1,14}[A-Z0-9])\*?†?\s+\d+\s+(.*)/;
  const PRICE_RE = /\$[\d,]+(?:\.\d{2})?[†*]?/g;

  for (const line of lines) {
    const m = line.match(ITEM_CODE_RE);
    if (!m) continue;
    const itemCode = m[1].replace(/[*†]/g, '').trim();
    if (itemCode.length > 16) continue;
    const rest = m[2];
    const prices = [];
    let pm;
    PRICE_RE.lastIndex = 0;
    while ((pm = PRICE_RE.exec(rest)) !== null) prices.push(pm[0]);
    if (prices.length === 0) continue;
    const key = `${itemCode}|${prices.join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      itemCode,
      priceA: parsePrice(prices[0] || null),
      priceB: parsePrice(prices[1] || null),
      priceC: parsePrice(prices[2] || null),
      priceD: parsePrice(prices[3] || null),
    });
  }
  return results;
}

async function main() {
  const textPath = path.join(__dirname, '../research/capital_spec_book_text.txt');
  const text = readFileSync(textPath, 'utf8');

  console.log('Extracting pricing rows from spec book...');
  const rows = extractPricingRows(text);
  console.log(`Found ${rows.length} unique item code rows`);

  const conn = await createConnection(process.env.DATABASE_URL);
  const [existingRows] = await conn.query(
    `SELECT ds.id, ds.distributorSku, ds.listPrice, ds.yourCost, dst.styleCode, dst.ourName
     FROM distributor_skus ds
     JOIN door_styles dst ON dst.id = ds.styleId
     WHERE ds.distributorId = ?`,
    [DISTRIBUTOR_ID]
  );
  await conn.end();

  const lookup = new Map();
  for (const row of existingRows) {
    if (!lookup.has(row.distributorSku)) lookup.set(row.distributorSku, new Map());
    lookup.get(row.distributorSku).set(row.styleCode, row);
  }
  console.log(`Loaded ${existingRows.length} existing USCD SKU rows`);

  const updates = [];
  const unmatched = [];
  let xCount = 0;

  for (const { itemCode, priceA, priceB, priceC, priceD } of rows) {
    const styleMap = lookup.get(itemCode);
    if (!styleMap) { unmatched.push(itemCode); continue; }

    for (const [styleCode, skuRow] of styleMap.entries()) {
      const col = STYLE_COLUMN[styleCode];
      if (!col) continue;
      const newPrice = col === 'a' ? priceA : col === 'b' ? priceB : col === 'c' ? priceC : priceD;
      if (newPrice === null) { xCount++; continue; }
      const oldPrice = skuRow.listPrice ? parseFloat(skuRow.listPrice) : null;
      const changed = oldPrice === null || Math.abs(oldPrice - newPrice) > 0.005;
      updates.push({
        skuId: skuRow.id, itemCode, styleCode,
        styleName: skuRow.ourName,
        oldListPrice: oldPrice, newListPrice: newPrice,
        yourCost: skuRow.yourCost ? parseFloat(skuRow.yourCost) : null,
        changed,
      });
    }
  }

  // Write CSV
  const csvPath = path.join(__dirname, '../research/capital_price_preview.csv');
  const csvLines = ['itemCode,styleCode,styleName,oldListPrice,newListPrice,yourCost,changed'];
  for (const u of updates) {
    csvLines.push([
      u.itemCode, u.styleCode, `"${u.styleName}"`,
      u.oldListPrice ?? '', u.newListPrice,
      u.yourCost ?? '', u.changed ? 'YES' : 'no'
    ].join(','));
  }
  writeFileSync(csvPath, csvLines.join('\n'));

  const changedCount = updates.filter(u => u.changed).length;
  const unchangedCount = updates.filter(u => !u.changed).length;

  console.log('\n=== PREVIEW SUMMARY ===');
  console.log(`Total SKU rows to update:  ${updates.length}`);
  console.log(`  Price will change:       ${changedCount}`);
  console.log(`  Already correct:         ${unchangedCount}`);
  console.log(`  X/N/A (unavailable):     ${xCount}`);
  console.log(`Unmatched item codes:      ${unmatched.length}`);
  console.log(`\nFull CSV: ${csvPath}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched item codes (not in distributor_skus):');
    unmatched.forEach(c => console.log(' ', c));
  }

  const changed = updates.filter(u => u.changed).slice(0, 25);
  console.log('\nSample price changes (first 25):');
  console.log('ItemCode         Style  Old Price   New Price   Your Cost');
  console.log('-'.repeat(65));
  for (const u of changed) {
    const old = u.oldListPrice != null ? `$${u.oldListPrice.toFixed(2)}` : '(none)';
    const nw = `$${u.newListPrice.toFixed(2)}`;
    const cost = u.yourCost != null ? `$${u.yourCost.toFixed(2)}` : '(none)';
    console.log(`${u.itemCode.padEnd(16)} ${u.styleCode.padEnd(6)} ${old.padEnd(12)} ${nw.padEnd(12)} ${cost}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
