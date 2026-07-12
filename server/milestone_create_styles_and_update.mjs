/**
 * Creates missing door styles for Line A (Milestone) and
 * updates/adds all SKUs from the spreadsheet for all styles.
 */
import mysql from 'mysql2/promise';
import { execSync } from 'child_process';
import fs from 'fs';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Complete style mapping: spreadsheet col → { styleCode, name, collection }
const ALL_STYLES = {
  'SW':  { styleCode: 'SW',  name: 'Shaker White',        collection: 'Essential' },
  'GR':  { styleCode: 'SG',  name: 'Shaker Gray',         collection: 'Essential' },
  'SE':  { styleCode: 'SEO', name: 'Shaker Espresso',     collection: 'Essential' },
  'NB':  { styleCode: 'SN',  name: 'Navy Blue',           collection: 'Charm' },
  'AG':  { styleCode: 'AG',  name: 'Aston Green',         collection: 'Charm' },
  'IB':  { styleCode: 'SI',  name: 'Iron Black',          collection: 'Charm' },
  'SA':  { styleCode: 'SA',  name: 'Smokey Ash',          collection: 'Charm' },
  'LG':  { styleCode: 'LG',  name: 'Lunar Gray',          collection: 'Charm' },
  'SB':  { styleCode: 'SB',  name: 'Sage Breeze',         collection: 'Charm' },
  'TC':  { styleCode: 'TC',  name: 'Treasure Chest',      collection: 'Charm' },
  'RW':  { styleCode: 'RW',  name: 'Rustic Wood',         collection: 'Charm' },
  'AW':  { styleCode: 'AW',  name: 'Aspen White',         collection: 'Premium' },
  'AC':  { styleCode: 'AC',  name: 'Aspen Charcoal Gray', collection: 'Premium' },
  'DSG': { styleCode: 'SD',  name: 'Double Smokey Gray',  collection: 'Double Shaker' },
  'DDW': { styleCode: 'DDW', name: 'Double Dove White',   collection: 'Double Shaker' },
  'CW':  { styleCode: 'CW',  name: 'Charleston White',    collection: 'Premium' },
  'SDW': { styleCode: 'SDW', name: 'Slim Dove White',     collection: 'Slim Shaker' },
  'SAG': { styleCode: 'SAG', name: 'Slim Aston Green',    collection: 'Slim Shaker' },
  'SIB': { styleCode: 'SIB', name: 'Slim Iron Black',     collection: 'Slim Shaker' },
  'SAO': { styleCode: 'SAO', name: 'Slim Amber Oak',      collection: 'Slim Shaker' },
  'SWO': { styleCode: 'SWO', name: 'Slim White Oak',      collection: 'Slim Shaker' },
  'HW':  { styleCode: 'HW',  name: 'High Gloss White',    collection: 'High Gloss' },
  'HG':  { styleCode: 'HG',  name: 'High Gloss Gray',     collection: 'High Gloss' },
  'MB':  { styleCode: 'MB',  name: 'Matte Black',         collection: 'High Gloss' },
  'MI':  { styleCode: 'MI',  name: 'Midnight Glass',      collection: 'High Gloss' },
  'OB':  { styleCode: 'OB',  name: 'Oxford Blue',         collection: 'Oxford' },
  'OS':  { styleCode: 'OS',  name: 'Oxford Sage',         collection: 'Oxford' },
  'CG':  { styleCode: 'CG',  name: 'Crystal Glass',       collection: 'High Gloss' },
  'MG':  { styleCode: 'MG',  name: 'Matte Gray',          collection: 'High Gloss' },
  'FW':  { styleCode: 'FW',  name: 'Floor White',         collection: 'Builder Grade' },
  'FG':  { styleCode: 'FG',  name: 'Floor Gray',          collection: 'Builder Grade' },
  'FE':  { styleCode: 'FE',  name: 'Floor Espresso',      collection: 'Builder Grade' },
};

const MULTIPLIER = 0.35;

// Get existing door styles
const [styleRows] = await db.execute(
  `SELECT id, styleCode FROM door_styles WHERE distributorId = 1`
);
const styleIdMap = {};
for (const s of styleRows) styleIdMap[s.styleCode] = s.id;
console.log('Existing styles:', Object.keys(styleIdMap).join(', '));

// Create missing door styles
let stylesCreated = 0;
for (const [col, info] of Object.entries(ALL_STYLES)) {
  if (!styleIdMap[info.styleCode]) {
    const [result] = await db.execute(
      `INSERT INTO door_styles (distributorId, styleCode, ourName, distributorName, doorStyle, isActive)
       VALUES (1, ?, ?, ?, 'Shaker', 1)
       ON DUPLICATE KEY UPDATE ourName = VALUES(ourName)`,
      [info.styleCode, info.name, info.name]
    );
    if (result.insertId) {
      styleIdMap[info.styleCode] = result.insertId;
      console.log(`Created style: ${info.styleCode} - ${info.name} (id=${result.insertId})`);
      stylesCreated++;
    } else {
      // Get existing id
      const [existing] = await db.execute(
        `SELECT id FROM door_styles WHERE distributorId = 1 AND styleCode = ?`, [info.styleCode]
      );
      if (existing.length > 0) styleIdMap[info.styleCode] = existing[0].id;
    }
  }
}
console.log(`Created ${stylesCreated} new door styles`);

// Read spreadsheet
const pythonScript = `
import openpyxl, json
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
fs.writeFileSync('/tmp/read_xlsx3.py', pythonScript);
const result = JSON.parse(execSync('python3 /tmp/read_xlsx3.py').toString());
const { rows } = result;
console.log(`Spreadsheet SKUs: ${rows.length}`);

// Get all master cabinets
const [cabinetRows] = await db.execute(`SELECT id, masterCode FROM cabinets`);
const cabinetByCode = {};
for (const c of cabinetRows) cabinetByCode[c.masterCode] = c.id;

// Get all existing distributor_skus
const [existingSkus] = await db.execute(
  `SELECT distributorSku FROM distributor_skus WHERE distributorId = 1`
);
const existingSkuSet = new Set(existingSkus.map(r => r.distributorSku));
console.log(`Existing Line A SKUs: ${existingSkuSet.size}`);

// Process only the styles that were previously null (not yet processed)
const ALREADY_DONE = new Set(['SW', 'SG', 'SEO', 'SN', 'SI', 'SA', 'SB', 'SD', 'CW', 'OS']);
const stylesToProcess = Object.entries(ALL_STYLES).filter(([col, info]) => !ALREADY_DONE.has(info.styleCode));
console.log(`Styles to process: ${stylesToProcess.map(([c, i]) => i.styleCode).join(', ')}`);

let totalUpdated = 0;
let totalAdded = 0;
let errors = [];

for (const [col, info] of stylesToProcess) {
  const styleId = styleIdMap[info.styleCode];
  if (!styleId) {
    console.log(`Skipping ${col}: no styleId for ${info.styleCode}`);
    continue;
  }

  const skuPrefix = info.styleCode + '-';
  let styleUpdated = 0;
  let styleAdded = 0;

  for (const row of rows) {
    const baseSku = row['SKU'];
    const listPrice = row[col];
    
    if (!baseSku || listPrice === null || listPrice === undefined || listPrice === '#N/A' || typeof listPrice !== 'number') {
      continue;
    }

    const dbSku = skuPrefix + baseSku;
    const yourCost = Math.round(listPrice * MULTIPLIER * 100) / 100;

    if (existingSkuSet.has(dbSku)) {
      // Update existing
      const [upd] = await db.execute(
        `UPDATE distributor_skus SET yourCost = ?, listPrice = ? WHERE distributorSku = ?`,
        [yourCost, listPrice, dbSku]
      );
      if (upd.affectedRows > 0) styleUpdated++;
    } else {
      // Add new — find or create master cabinet
      let cabinetId = cabinetByCode[baseSku];
      
      if (!cabinetId) {
        // Create master cabinet
        const desc = row['Description'] || baseSku;
        try {
          const [ins] = await db.execute(
            `INSERT INTO cabinets (masterCode, description, category, subCategory, isActive, descriptionSource)
             VALUES (?, ?, 'Accessory', '', 1, 'spreadsheet')
             ON DUPLICATE KEY UPDATE description = VALUES(description)`,
            [baseSku, desc]
          );
          cabinetId = ins.insertId || (await db.execute(`SELECT id FROM cabinets WHERE masterCode = ?`, [baseSku]))[0][0]?.id;
          if (cabinetId) cabinetByCode[baseSku] = cabinetId;
        } catch (e) {
          errors.push(`Cabinet create failed for ${baseSku}: ${e.message}`);
          continue;
        }
      }

      if (!cabinetId) { errors.push(`No cabinetId for ${dbSku}`); continue; }

      try {
        await db.execute(
          `INSERT INTO distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, listPrice, yourCost, isAvailable, isPublished)
           VALUES (?, 1, ?, ?, ?, ?, ?, 1, 0)
           ON DUPLICATE KEY UPDATE listPrice = VALUES(listPrice), yourCost = VALUES(yourCost)`,
          [cabinetId, styleId, dbSku, dbSku, listPrice, yourCost]
        );
        existingSkuSet.add(dbSku);
        styleAdded++;
      } catch (e) {
        errors.push(`Insert failed for ${dbSku}: ${e.message}`);
      }
    }
  }

  console.log(`${col} (${info.styleCode}): Updated ${styleUpdated}, Added ${styleAdded}`);
  totalUpdated += styleUpdated;
  totalAdded += styleAdded;
}

console.log(`\n=== COMPLETE: Updated ${totalUpdated}, Added ${totalAdded} ===`);
if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  errors.slice(0, 10).forEach(e => console.log(' ', e));
}

await db.end();
