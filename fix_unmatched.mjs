/**
 * fix_unmatched.mjs
 * 
 * Resolves 148 unmatched Clark & Son item codes by:
 * 1. Mapping known aliases to existing master cabinet records
 * 2. Creating new master cabinet records for genuinely new products
 * 3. Updating distributor_skus.cabinetId for all Clark & Son SKUs
 */
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const SPREADSHEET = '/home/ubuntu/upload/clarkandson.xlsx';

// ─── Manual alias map: Clark & Son code → existing masterCode ─────────────────
// Derived from the partial-match analysis output
const ALIAS_MAP = {
  // Wall cabinets - height variants (21" high)
  'W3021': 'W3030',   // 30w 21h → closest is W3030 (same width)
  'W3321': 'W3330',   // 33w 21h
  'W3621': 'W3636',   // 36w 21h
  // Wall diagonal corner cabinets
  'WDC2430': 'WDC2430', // may exist
  'WDC2436': 'WDC2436',
  'WDC2442': 'WDC2442',
  // Wall stacker cabinets (short)
  'WSC30': 'W3012',   // 30w stacker
  // Microwave wall cabinets → same as standard wall cabinets
  'MW3030': 'W3030',
  'MW3036': 'W3036',
  'MW3042': 'W3042',
  // 18" high wall cabinets (glass door variants map to standard)
  'W1218': 'W1218GD',
  'W1518': 'W1518GD',
  'W1818': 'W1818GD',
  // Stacker wall cabinets with PG suffix (plate groove) → standard
  'W1212PG': 'W1212',
  'W1512PG': 'W1512',
  'W1812PG': 'W1812',
  'W2112PG': 'W2112',
  'W2412PG': 'W2412',
  'W2712PG': 'W2712',
  'W3012PG': 'W3012',
  'W3312PG': 'W3312',
  'W3612PG': 'W3612',
  // Split pantry top wall cabinets (24" deep variants)
  'W243024': 'W2430',
  'W243624': 'W2436',
  'W244224': 'W2442',
  'W303024': 'W3030',
  'W303624': 'W3036',
  'W304224': 'W3042',
  'W363024': 'W3630',
  'W363624': 'W3636',
  'W364224': 'W3642',
  // ADA base cabinets → map to standard base cabinets
  'ADAB30': 'B30',
  'ADAB33': 'B33',
  'ADAB36': 'B36',
  'ADAB39': 'B39',
  'ADAB42': 'B42',
  'ADABBC36': 'BBC36',
  'ADADB18': 'B18',
  'ADADB21': 'B21',
  'ADASB36': 'B36',
  // Full height base cabinets
  'FHB27': 'B27',
  'FHB33': 'B33',
  'FHB39': 'B39',
  'FHB42': 'B42',
  'B48': 'FHB48',
  // Plywood edge banded
  'PLYEB42': 'B42',
  // Vanity cabinets
  'V3021': 'V3021DL',
  'V3621': 'V3621DL',
  'VDB1221': 'B12',
  'VDB1521': 'B15',
  'VDB1821': 'B18',
  'VDB2121': 'B21',
  'VDB2421': 'B24',
  'VSDB60': 'SD',
  // Bottom wall cabinets for split pantries
  'UCB1854': 'B18',
  'UCB2454': 'B24',
  'UCB3054': 'B30',
  'UCB3654': 'B36',
  // Accessories
  'FFS24': 'FS24',
  'FFS30': 'FS30',
  'FFS36': 'FS36',
  'IS3696': 'S3696',
  'TS2496': 'S2496',
  'LCM8': 'CM8',
  'LRMB': 'LRM',
  'SM8': 'SM8(SCR)',
  'BSD6': 'SD',
  'SDSWDC2412': 'SD',
};

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // 1. Get distributor id
  const [[dist]] = await conn.query(
    "SELECT id FROM distributors WHERE name = 'Clark and Son' LIMIT 1"
  );
  const distributorId = dist.id;
  console.log(`Distributor id: ${distributorId}`);

  // 2. Get all master cabinets
  const [cabinets] = await conn.query(
    'SELECT id, masterCode FROM cabinets'
  );
  const cabMap = {};
  for (const c of cabinets) cabMap[c.masterCode.toUpperCase()] = c.id;
  console.log(`Master cabinets: ${cabinets.length}`);

  // 3. Parse spreadsheet for descriptions/dimensions
  const wb = xlsx.readFile(SPREADSHEET);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  const dataRows = rows.slice(1).filter(r => r[0] != null && r[3] != null);
  const sheetData = {};
  for (const row of dataRows) {
    const code = String(row[3] ?? '').trim();
    const dims = String(row[5] ?? '').trim();
    const parts = dims.split('x').map(p => parseFloat(p.trim()));
    sheetData[code] = {
      code,
      category: String(row[1] ?? '').trim(),
      subCategory: String(row[2] ?? '').trim(),
      description: String(row[4] ?? '').trim(),
      dimensions: dims,
      w: parts[0] || null,
      h: parts[1] || null,
      d: parts[2] || null,
    };
  }

  // 4. Get all unmatched Clark & Son SKUs (cabinetId = 0)
  const [unmatchedSkus] = await conn.query(`
    SELECT DISTINCT ds.distributorSku
    FROM distributor_skus ds
    WHERE ds.distributorId = ? AND ds.cabinetId = 0
    ORDER BY ds.distributorSku
  `, [distributorId]);
  const unmatchedCodes = unmatchedSkus.map(r => r.distributorSku);
  console.log(`\nUnmatched codes to resolve: ${unmatchedCodes.length}`);

  let resolved = 0;
  let created = 0;
  let stillUnmatched = [];

  for (const code of unmatchedCodes) {
    const upperCode = code.toUpperCase();
    let cabinetId = null;

    // Try alias map first
    const aliasTarget = ALIAS_MAP[code] || ALIAS_MAP[upperCode];
    if (aliasTarget) {
      cabinetId = cabMap[aliasTarget.toUpperCase()] || null;
      if (cabinetId) {
        console.log(`  ALIAS  ${code} → ${aliasTarget} (id=${cabinetId})`);
      }
    }

    // Try direct lookup (case-insensitive)
    if (!cabinetId) {
      cabinetId = cabMap[upperCode] || null;
      if (cabinetId) console.log(`  DIRECT ${code} (id=${cabinetId})`);
    }

    // Create new master cabinet record if still not found
    if (!cabinetId) {
      const sheet = sheetData[code];
      if (sheet && sheet.description) {
        const [ins] = await conn.query(`
          INSERT INTO cabinets (masterCode, description, category, subCategory, width, height, depth, isActive, conflictStatus, showInCatalog, showInDesigner, showIn2020)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'none', 1, 1, 1)
        `, [
          code,
          sheet.description,
          sheet.category || 'Base',
          sheet.subCategory || null,
          sheet.w || null,
          sheet.h || null,
          sheet.d || null,
        ]);
        cabinetId = ins.insertId;
        cabMap[upperCode] = cabinetId;
        created++;
        console.log(`  CREATE ${code} → new id=${cabinetId} | ${sheet.description}`);
      } else {
        stillUnmatched.push(code);
        console.log(`  SKIP   ${code} (no sheet data)`);
        continue;
      }
    }

    // Update all Clark & Son SKUs for this code
    const [upd] = await conn.query(`
      UPDATE distributor_skus
      SET cabinetId = ?
      WHERE distributorId = ? AND distributorSku = ? AND cabinetId = 0
    `, [cabinetId, distributorId, code]);
    resolved += upd.affectedRows;
  }

  console.log(`\n✓ Done.`);
  console.log(`  SKU rows updated: ${resolved}`);
  console.log(`  New master cabinets created: ${created}`);
  if (stillUnmatched.length > 0) {
    console.log(`  Still unmatched (${stillUnmatched.length}): ${stillUnmatched.join(', ')}`);
  }

  await conn.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
