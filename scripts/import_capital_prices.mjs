/**
 * import_capital_prices.mjs
 *
 * Parses the Capital spec book text extraction and upserts list prices
 * into distributor_skus for US Cabinet Depot (distributorId = 210002).
 *
 * Price columns in the spec book:
 *   Col 1 (col_a): SW, SA, SD, SG, SU
 *   Col 2 (col_b): SI, SN, SB, SH, SC, EW
 *   Col 3 (col_c): OW, OC, OS, CW, CS, HD, HS, HH
 *   Col 4 (col_d): OM, OT, HR, HE, SEO
 *
 * The script:
 *   1. Reads the pdftotext output
 *   2. Extracts every (itemCode, col_a, col_b, col_c, col_d) row
 *   3. Looks up existing distributor_skus rows by distributorSku + distributorId
 *   4. Updates listPrice for matched rows (leaves yourCost untouched)
 *   5. Reports unmatched item codes for review
 */

import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISTRIBUTOR_ID = 210002;

// Style code → price column mapping
const STYLE_COLUMN = {
  // Column A (cheapest tier)
  SW: 'a', SA: 'a', SD: 'a', SG: 'a', SU: 'a',
  // Column B
  SI: 'b', SN: 'b', SB: 'b', SH: 'b', SC: 'b', EW: 'b',
  // Column C
  OW: 'c', OC: 'c', OS: 'c', CW: 'c', CS: 'c', HD: 'c', HS: 'c', HH: 'c',
  // Column D (most expensive tier)
  OM: 'd', OT: 'd', HR: 'd', HE: 'd', SEO: 'd',
};

/**
 * Parse a price string like "$1,234.56" or "$389" → number, or null if "X" / "N/A"
 */
function parsePrice(raw) {
  if (!raw || raw.trim() === 'X' || raw.trim() === 'N/A' || raw.trim() === '') return null;
  const cleaned = raw.replace(/[$,†*]/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

/**
 * Extract all pricing rows from the spec book text.
 * Returns array of { itemCode, priceA, priceB, priceC, priceD }
 *
 * The text layout (with -layout flag) preserves column positions.
 * A pricing row looks like:
 *   " B12                            51                      $542             $599                $629               $657"
 * We detect rows that start with a known item-code pattern and have 2–4 dollar amounts.
 */
function extractPricingRows(text) {
  const lines = text.split('\n');
  const results = [];
  const seen = new Set();

  // Item code pattern: starts with letters, may have digits, may end with *, †, etc.
  // We'll be permissive and filter by presence of at least one $ price.
  const ITEM_CODE_RE = /^\s{0,3}([A-Z][A-Z0-9]{1,14}[A-Z0-9])\*?†?\s+\d+\s+(.*)/;
  const PRICE_RE = /\$[\d,]+(?:\.\d{2})?[†*]?/g;

  for (const line of lines) {
    const m = line.match(ITEM_CODE_RE);
    if (!m) continue;

    const itemCode = m[1].replace(/[*†]/g, '').trim();
    const rest = m[2];

    const prices = [];
    let pm;
    PRICE_RE.lastIndex = 0;
    while ((pm = PRICE_RE.exec(rest)) !== null) {
      prices.push(pm[0]);
    }

    // Need at least 1 price; skip header/footer lines
    if (prices.length === 0) continue;

    // Skip lines that are clearly not cabinet codes (e.g. long descriptive text)
    if (itemCode.length > 16) continue;

    // Deduplicate: same itemCode can appear on multiple pages with same prices
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

  // Show first 10 for verification
  console.log('\nSample rows:');
  rows.slice(0, 10).forEach(r =>
    console.log(`  ${r.itemCode.padEnd(16)} A=$${r.priceA} B=$${r.priceB} C=$${r.priceC} D=$${r.priceD}`)
  );

  const conn = await createConnection(process.env.DATABASE_URL);

  // Get all existing USCD SKUs: distributorSku → array of {id, styleCode, listPrice}
  const [existingRows] = await conn.query(
    `SELECT ds.id, ds.distributorSku, ds.styleId, ds.listPrice, dst.styleCode
     FROM distributor_skus ds
     JOIN door_styles dst ON dst.id = ds.styleId
     WHERE ds.distributorId = ?`,
    [DISTRIBUTOR_ID]
  );

  // Build lookup: distributorSku → Map<styleCode, row>
  const lookup = new Map();
  for (const row of existingRows) {
    if (!lookup.has(row.distributorSku)) lookup.set(row.distributorSku, new Map());
    lookup.get(row.distributorSku).set(row.styleCode, row);
  }

  console.log(`\nLoaded ${existingRows.length} existing USCD SKU rows`);

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  const unmatched = [];

  for (const { itemCode, priceA, priceB, priceC, priceD } of rows) {
    const styleMap = lookup.get(itemCode);
    if (!styleMap) {
      unmatched.push(itemCode);
      noMatch++;
      continue;
    }

    // For each style that has an existing SKU row, update listPrice
    for (const [styleCode, skuRow] of styleMap.entries()) {
      const col = STYLE_COLUMN[styleCode];
      if (!col) {
        skipped++;
        continue;
      }

      const newPrice =
        col === 'a' ? priceA :
        col === 'b' ? priceB :
        col === 'c' ? priceC :
        col === 'd' ? priceD : null;

      if (newPrice === null) {
        // X or N/A means not available in this style — leave as-is
        skipped++;
        continue;
      }

      await conn.query(
        'UPDATE distributor_skus SET listPrice = ? WHERE id = ?',
        [newPrice, skuRow.id]
      );
      updated++;
    }
  }

  await conn.end();

  console.log('\n=== Import Results ===');
  console.log(`Updated:   ${updated} SKU rows`);
  console.log(`Skipped:   ${skipped} (X/N/A prices or unmapped styles)`);
  console.log(`No match:  ${noMatch} item codes not found in database`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched item codes (not in distributor_skus):');
    unmatched.slice(0, 50).forEach(c => console.log(' ', c));
    if (unmatched.length > 50) console.log(`  ... and ${unmatched.length - 50} more`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
