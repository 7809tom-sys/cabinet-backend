/**
 * Reads all 350 SKUs from the Milestone 2026 Order Form spreadsheet
 * and adds any missing ones to the database for all mapped styles.
 * Uses the master cabinets table to find the cabinetId for each base SKU.
 */
import mysql from 'mysql2/promise';
import { execSync } from 'child_process';
import fs from 'fs';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Read spreadsheet data
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

fs.writeFileSync('/tmp/read_xlsx2.py', pythonScript);
const result = JSON.parse(execSync('python3 /tmp/read_xlsx2.py').toString());
const { rows } = result;
console.log(`Total spreadsheet SKUs: ${rows.length}`);

// Style column → DB styleCode mapping (spreadsheet col → DB prefix)
const STYLE_MAP = {
  'SW': 'SW',   // Shaker White
  'GR': 'SG',   // Shaker Gray
  'SE': 'SEO',  // Shaker Essence Oak
  'NB': 'SN',   // Shaker Navy Blue
  'AG': null,   // Shaker Antique Gray? — skip, AG not in DB
  'IB': 'SI',   // Shaker Ivy/Blue
  'SA': 'SA',   // Shaker Antique White
  'LG': null,   // Unknown — skip
  'SB': 'SB',   // Shaker Black
  'TC': null,   // Toffee/Caramel? — skip
  'RW': null,   // Unknown — skip
  'AW': null,   // Unknown — skip
  'AC': null,   // Unknown — skip
  'DSG': 'SD',  // Shaker Dove/Sage Gray
  'DDW': null,  // Unknown — skip
  'CW': 'CW',   // Casselberry White
  'SDW': null,  // Unknown — skip
  'SAG': null,  // Unknown — skip
  'SIB': null,  // Unknown — skip
  'SAO': null,  // Unknown — skip
  'SWO': null,  // Unknown — skip
  'HW': null,   // Haven White? — skip
  'HG': null,   // Haven Gray? — skip
  'MB': null,   // Unknown — skip
  'MI': null,   // Unknown — skip
  'OB': null,   // Unknown — skip
  'OS': 'OS',   // Oxford Sage
  'CG': null,   // Unknown — skip
  'MG': null,   // Unknown — skip
  'FW': null,   // Unknown — skip
  'FG': null,   // Unknown — skip
  'FE': null,   // Unknown — skip
};

const MULTIPLIER = 0.35;

// Get all door styles for Line A
const [styleRows] = await db.execute(
  `SELECT id, styleCode FROM door_styles WHERE distributorId = 1`
);
const styleIdMap = {};
for (const s of styleRows) styleIdMap[s.styleCode] = s.id;

// Get all master cabinets to find cabinetId by masterCode
const [cabinetRows] = await db.execute(
  `SELECT id, masterCode, description, category, subCategory, width, height, depth FROM cabinets`
);
const cabinetByCode = {};
for (const c of cabinetRows) cabinetByCode[c.masterCode] = c;
console.log(`Master cabinets in DB: ${cabinetRows.length}`);

// Get all existing distributor_skus for Line A to avoid duplicates
const [existingSkus] = await db.execute(
  `SELECT distributorSku FROM distributor_skus WHERE distributorId = 1`
);
const existingSkuSet = new Set(existingSkus.map(r => r.distributorSku));
console.log(`Existing Line A SKUs: ${existingSkuSet.size}`);

// Parse dimensions from description (e.g. "Base Cabinet - 12\"W x 34-1/2\"H x 24\"D")
function parseDimensions(desc) {
  const wMatch = desc?.match(/(\d+(?:-\d+\/\d+)?)"?W/);
  const hMatch = desc?.match(/(\d+(?:-\d+\/\d+)?)"?H/);
  const dMatch = desc?.match(/(\d+(?:-\d+\/\d+)?)"?D/);
  
  function parseFraction(s) {
    if (!s) return null;
    const parts = s.split('-');
    if (parts.length === 2) {
      const [whole, frac] = parts;
      const [num, den] = frac.split('/');
      return parseFloat(whole) + parseFloat(num) / parseFloat(den);
    }
    return parseFloat(s);
  }
  
  return {
    width: wMatch ? parseFraction(wMatch[1]) : null,
    height: hMatch ? parseFraction(hMatch[1]) : null,
    depth: dMatch ? parseFraction(dMatch[1]) : null,
  };
}

// Determine category from description
function getCategory(desc, sku) {
  const d = (desc || '').toLowerCase();
  const s = (sku || '').toLowerCase();
  if (d.includes('vanity') || s.startsWith('v') || s.startsWith('vs') || s.startsWith('vsd')) return 'Vanity';
  if (d.includes('wall') || s.match(/^w\d/)) return 'Wall';
  if (d.includes('oven') || d.includes('pantry') || d.includes('utility') || d.includes('tall') || s.match(/^u\d/)) return 'Tall';
  if (d.includes('base') || s.match(/^b\d/) || s.match(/^[23]db/) || s.match(/^sb/) || s.match(/^csb/)) return 'Base';
  if (d.includes('accessory') || d.includes('crown') || d.includes('molding') || d.includes('filler') || d.includes('toe') || d.includes('skin') || d.includes('panel')) return 'Accessory';
  return 'Accessory';
}

let added = 0;
let skipped = 0;
let errors = [];

const styleCols = Object.keys(STYLE_MAP).filter(k => STYLE_MAP[k] !== null);

for (const col of styleCols) {
  const dbStyleCode = STYLE_MAP[col];
  const styleId = styleIdMap[dbStyleCode];
  if (!styleId) continue;

  const skuPrefix = dbStyleCode + '-';
  let styleAdded = 0;

  for (const row of rows) {
    const baseSku = row['SKU'];
    const listPrice = row[col];
    const description = row['Description'];
    
    // Skip if not available for this style
    if (!baseSku || listPrice === null || listPrice === undefined || listPrice === '#N/A' || typeof listPrice !== 'number') {
      continue;
    }

    const dbSku = skuPrefix + baseSku;
    
    // Skip if already exists
    if (existingSkuSet.has(dbSku)) continue;

    const yourCost = Math.round(listPrice * MULTIPLIER * 100) / 100;

    // Find the master cabinet record
    let cabinetId = null;
    
    // Try exact match first
    if (cabinetByCode[baseSku]) {
      cabinetId = cabinetByCode[baseSku].id;
    }

    if (!cabinetId) {
      // Try to find by similar code (e.g. B30S for B30, BT9 for BT09)
      const normalized = baseSku.replace(/^0+/, '').replace(/0+$/, '');
      for (const [code, cab] of Object.entries(cabinetByCode)) {
        if (code.replace(/^0+/, '').replace(/0+$/, '') === normalized) {
          cabinetId = cab.id;
          break;
        }
      }
    }

    if (!cabinetId) {
      // Need to create a new master cabinet record first
      const dims = parseDimensions(description);
      const category = getCategory(description, baseSku);
      
      try {
        const [insertResult] = await db.execute(
          `INSERT INTO cabinets (masterCode, description, category, subCategory, width, height, depth, isActive, descriptionSource) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'spreadsheet')
           ON DUPLICATE KEY UPDATE description = VALUES(description)`,
          [baseSku, description || baseSku, category, '', dims.width, dims.height, dims.depth]
        );
        
        if (insertResult.insertId) {
          cabinetId = insertResult.insertId;
          cabinetByCode[baseSku] = { id: cabinetId, masterCode: baseSku };
        } else {
          // Get the existing id
          const [existing] = await db.execute(`SELECT id FROM cabinets WHERE masterCode = ?`, [baseSku]);
          if (existing.length > 0) cabinetId = existing[0].id;
        }
      } catch (e) {
        errors.push(`Failed to create cabinet ${baseSku}: ${e.message}`);
        continue;
      }
    }

    if (!cabinetId) {
      errors.push(`No cabinetId for ${dbSku}`);
      continue;
    }

    // Insert the distributor_sku record
    try {
      await db.execute(
        `INSERT INTO distributor_skus (cabinetId, distributorId, styleId, platformSku, distributorSku, listPrice, yourCost, isAvailable, isPublished)
         VALUES (?, 1, ?, ?, ?, ?, ?, 1, 0)
         ON DUPLICATE KEY UPDATE listPrice = VALUES(listPrice), yourCost = VALUES(yourCost)`,
        [cabinetId, styleId, dbSku, dbSku, listPrice, yourCost]
      );
      existingSkuSet.add(dbSku);
      styleAdded++;
      added++;
    } catch (e) {
      errors.push(`Failed to insert ${dbSku}: ${e.message}`);
    }
  }

  if (styleAdded > 0) {
    console.log(`${col} (${dbStyleCode}): Added ${styleAdded} new SKUs`);
  }
}

console.log(`\n=== TOTAL ADDED: ${added} new SKUs ===`);
if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  errors.slice(0, 20).forEach(e => console.log(' ', e));
}

await db.end();
