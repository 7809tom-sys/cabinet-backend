import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const SPREADSHEET = '/home/ubuntu/upload/clarkandson.xlsx';
const DIST_NAME = 'Clark and Son';

// Style codes in the spreadsheet (columns G-P, zero-indexed 6-15)
const STYLE_COLS = [
  { col: 6,  code: 'ASP' },
  { col: 7,  code: 'HS'  },
  { col: 8,  code: 'NG'  },
  { col: 9,  code: 'PS'  },
  { col: 10, code: 'WPG' },
  { col: 11, code: 'WS'  },
  { col: 12, code: 'MBS' },
  { col: 13, code: 'FS'  },
  { col: 14, code: 'CS'  },
  { col: 15, code: 'RH'  },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // 1. Ensure Clark & Son distributor exists
  let [distRows] = await conn.query(
    'SELECT id FROM distributors WHERE name = ? LIMIT 1',
    [DIST_NAME]
  );
  let distributorId;
  if (distRows.length === 0) {
    const [ins] = await conn.query(
      "INSERT INTO distributors (name, code, initials, isActive, displayMode, markupPercent, costMultiplier, baseMultiplier, freightMultiplier, tariffRate, shippingRate, leadTimeDays) VALUES (?, 'CAS', 'CAS', 1, 'neutral', '1.0000', '0.3000', '0.3000', '0.0000', '0.0000', '0.0000', 14)",
      [DIST_NAME]
    );
    distributorId = ins.insertId;
    console.log(`Created distributor "${DIST_NAME}" id=${distributorId}`);
  } else {
    distributorId = distRows[0].id;
    console.log(`Found distributor "${DIST_NAME}" id=${distributorId}`);
  }

  // 2. Resolve door style IDs from codes (pick first active match per code)
  const codes = STYLE_COLS.map(s => s.code);
  const [styleRows] = await conn.query(
    'SELECT id, styleCode FROM door_styles WHERE styleCode IN (?) AND isActive = 1 ORDER BY id ASC',
    [codes]
  );
  const codeToStyleId = {};
  for (const r of styleRows) {
    if (!codeToStyleId[r.styleCode]) codeToStyleId[r.styleCode] = r.id;
  }
  console.log('\nStyle code → DB styleId:');
  for (const s of STYLE_COLS) {
    console.log(`  ${s.code} → ${codeToStyleId[s.code] ?? 'NOT FOUND'}`);
  }

  // 3. Parse spreadsheet
  const wb = xlsx.readFile(SPREADSHEET);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  const dataRows = rows.slice(1).filter(r => r[0] != null && r[3] != null);
  console.log(`\nSpreadsheet data rows: ${dataRows.length}`);

  // 4. Resolve cabinet IDs by item code
  const itemCodes = [...new Set(dataRows.map(r => String(r[3]).trim().toUpperCase()))];
  const [cabRows] = await conn.query(
    'SELECT id, masterCode FROM cabinets WHERE UPPER(masterCode) IN (?)',
    [itemCodes]
  );
  const codeToCabinetId = {};
  for (const c of cabRows) codeToCabinetId[c.masterCode.toUpperCase()] = c.id;
  console.log(`Cabinet lookup: ${cabRows.length} of ${itemCodes.length} item codes matched`);

  // 5. Delete old SKUs per style for this distributor (clean slate per style)
  console.log('\nDeleting old Clark & Son SKUs per style...');
  for (const s of STYLE_COLS) {
    const styleId = codeToStyleId[s.code];
    if (!styleId) { console.log(`  SKIP ${s.code} (no DB match)`); continue; }
    const [del] = await conn.query(
      'DELETE FROM distributor_skus WHERE distributorId = ? AND styleId = ?',
      [distributorId, styleId]
    );
    console.log(`  ${s.code}: deleted ${del.affectedRows} old rows`);
  }

  // 6. Insert new SKUs
  console.log('\nInserting new SKUs...');
  let inserted = 0;
  let skipped = 0;
  let unmatched = new Set();

  for (const row of dataRows) {
    const rawCode = String(row[3] ?? '').trim();
    const upperCode = rawCode.toUpperCase();
    const cabinetId = codeToCabinetId[upperCode] ?? null;

    if (!cabinetId) unmatched.add(rawCode);

    for (const s of STYLE_COLS) {
      const styleId = codeToStyleId[s.code];
      if (!styleId) { skipped++; continue; }

      const rawPrice = row[s.col];
      if (rawPrice == null || String(rawPrice).trim().toUpperCase() === 'N/A' || isNaN(Number(rawPrice))) {
        skipped++;
        continue;
      }
      const listPrice = Number(rawPrice).toFixed(2);
      const platformSku = `CS_${s.code}_${rawCode}`;

      // distributorSku = the supplier's own item code (required NOT NULL)
      const distributorSku = rawCode;
      await conn.query(
        `INSERT INTO distributor_skus
           (distributorId, styleId, cabinetId, platformSku, distributorSku, listPrice, isAvailable, isPublished)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE
           listPrice = VALUES(listPrice),
           cabinetId = VALUES(cabinetId),
           isAvailable = 1,
           isPublished = 1`,
        [distributorId, styleId, cabinetId ?? 0, platformSku, distributorSku, listPrice]
      );
      inserted++;
    }
  }

  console.log(`\n✓ Done.`);
  console.log(`  Inserted/updated: ${inserted}`);
  console.log(`  Skipped (N/A or no style match): ${skipped}`);
  if (unmatched.size > 0) {
    console.log(`  Item codes with no cabinet match (${unmatched.size}): ${[...unmatched].slice(0, 20).join(', ')}${unmatched.size > 20 ? '...' : ''}`);
  }

  await conn.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
