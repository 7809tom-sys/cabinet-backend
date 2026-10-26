/**
 * Reads the "Price List" sheet from the Milestone 2026 Order Form spreadsheet
 * and updates yourCost (list * 0.35) and listPrice for every SKU in every style.
 *
 * Style code mapping: spreadsheet column → DB styleCode → DB style ID
 */
import mysql from 'mysql2/promise';
import { execSync } from 'child_process';
import fs from 'fs';

// Use Python to read the xlsx since we don't have xlsx npm package
const pythonScript = `
import openpyxl, json, sys

wb = openpyxl.load_workbook('/home/ubuntu/cabinet-dealz/milestone_order_form_2026.xlsx', data_only=True)
ws = wb['Price List']

rows = []
headers = None
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        headers = list(row)
        continue
    if row[0] is None:
        continue
    row_dict = {}
    for j, val in enumerate(row):
        if j < len(headers) and headers[j] is not None:
            row_dict[str(headers[j])] = val
    if row_dict.get('SKU'):
        rows.append(row_dict)

print(json.dumps({'headers': headers, 'rows': rows}))
`;

fs.writeFileSync('/tmp/read_xlsx.py', pythonScript);
const result = JSON.parse(execSync('python3 /tmp/read_xlsx.py').toString());

const { headers, rows } = result;
console.log(`Headers: ${JSON.stringify(headers)}`);
console.log(`Total SKU rows: ${rows.length}`);

// Style column → DB styleCode mapping
// Spreadsheet columns: SW, GR, SE, NB, AG, IB, SA, LG, SB, TC, RW, AW, AC, DSG, DDW, CW, SDW, SAG, SIB, SAO, SWO, HW, HG, MB, MI, OB, OS, CG, MG, FW, FG, FE
const STYLE_MAP = {
  'SW': 'SW',   // Shaker White → Nova White (30046)
  'GR': 'SG',   // Shaker Gray → Slate Core (30045) — portal uses GR, DB uses SG
  'SE': 'SEO',  // Shaker Essence Oak (30061)
  'NB': 'SN',   // Shaker Navy → Navy Core (30048)
  'AG': 'SA',   // Shaker Antique → Aura White (30043) — need to verify
  'IB': 'SI',   // Shaker Ivy → Ivy Core (30047)
  'SA': 'SA',   // Shaker Antique White → Aura White (30043)
  'LG': null,   // Unknown — skip for now
  'SB': 'SB',   // Shaker Black → Onyx Core (30049)
  'TC': null,   // Unknown — skip
  'RW': null,   // Unknown — skip
  'AW': null,   // Unknown — skip
  'AC': null,   // Unknown — skip
  'DSG': 'SD',  // Shaker Dove → Nimbus White (30044)
  'DDW': null,  // Unknown — skip
  'CW': 'CW',   // Casselberry White (30055)
  'SDW': null,  // Unknown — skip
  'SAG': null,  // Unknown — skip
  'SIB': null,  // Unknown — skip
  'SAO': null,  // Unknown — skip
  'SWO': null,  // Unknown — skip
  'HW': null,   // Unknown — skip
  'HG': null,   // Unknown — skip
  'MB': null,   // Unknown — skip
  'MI': null,   // Unknown — skip
  'OB': null,   // Unknown — skip
  'OS': 'OS',   // Oxford Sage (30054)
  'CG': null,   // Unknown — skip
  'MG': null,   // Unknown — skip
  'FW': null,   // Unknown — skip
  'FG': null,   // Unknown — skip
  'FE': null,   // Unknown — skip
};

const MULTIPLIER = 0.35;

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Get all door styles for Line A to build styleCode → id map
const [styleRows] = await db.execute(
  `SELECT id, styleCode FROM door_styles WHERE distributorId = 1`
);
const styleIdMap = {};
for (const s of styleRows) {
  styleIdMap[s.styleCode] = s.id;
}
console.log('Style ID map:', JSON.stringify(styleIdMap));

// Process each style column
const styleCols = Object.keys(STYLE_MAP).filter(k => STYLE_MAP[k] !== null);
let totalUpdated = 0;
let totalNotFound = [];

for (const col of styleCols) {
  const dbStyleCode = STYLE_MAP[col];
  const styleId = styleIdMap[dbStyleCode];
  if (!styleId) {
    console.log(`Skipping ${col} → ${dbStyleCode}: no style ID found`);
    continue;
  }

  // Determine SKU prefix for this style
  // The spreadsheet SKU is the base code (e.g. "B30", "W3630")
  // DB SKU is prefix + "-" + base code (e.g. "SW-B30", "SG-W3630")
  const skuPrefix = dbStyleCode + '-';

  let styleUpdated = 0;
  let styleNotFound = [];

  for (const row of rows) {
    const baseSku = row['SKU'];
    const listPrice = row[col];
    
    if (!baseSku || listPrice === null || listPrice === undefined || listPrice === '#N/A' || typeof listPrice !== 'number') {
      continue; // Skip unavailable items for this style
    }

    const dbSku = skuPrefix + baseSku;
    const yourCost = Math.round(listPrice * MULTIPLIER * 100) / 100;

    const [updateResult] = await db.execute(
      `UPDATE distributor_skus SET yourCost = ?, listPrice = ? WHERE distributorSku = ?`,
      [yourCost, listPrice, dbSku]
    );

    if (updateResult.affectedRows > 0) {
      styleUpdated++;
    } else {
      styleNotFound.push({ sku: dbSku, list: listPrice, cost: yourCost });
    }
  }

  console.log(`${col} (${dbStyleCode}, id=${styleId}): Updated ${styleUpdated}, Not found: ${styleNotFound.length}`);
  if (styleNotFound.length > 0 && styleNotFound.length <= 20) {
    styleNotFound.forEach(i => console.log(`  NOT FOUND: ${i.sku} (list=$${i.list}, cost=$${i.cost})`));
  } else if (styleNotFound.length > 20) {
    console.log(`  First 10 not found: ${styleNotFound.slice(0, 10).map(i => i.sku).join(', ')}`);
  }

  totalUpdated += styleUpdated;
  totalNotFound = totalNotFound.concat(styleNotFound);
}

console.log(`\n=== TOTAL: Updated ${totalUpdated}, Not found ${totalNotFound.length} ===`);

// Save not-found list for review
fs.writeFileSync('/home/ubuntu/cabinet-dealz/milestone_not_found.json', JSON.stringify(totalNotFound, null, 2));
console.log('Not-found list saved to milestone_not_found.json');

await db.end();
