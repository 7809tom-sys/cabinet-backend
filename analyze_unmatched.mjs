import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const SPREADSHEET = '/home/ubuntu/upload/clarkandson.xlsx';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // 1. Get all Clark & Son SKUs with no cabinetId
  const [unmatchedSkus] = await conn.query(`
    SELECT DISTINCT ds.distributorSku, ds.platformSku, ds.listPrice
    FROM distributor_skus ds
    INNER JOIN distributors d ON d.id = ds.distributorId
    WHERE d.name = 'Clark and Son' AND ds.cabinetId = 0
    ORDER BY ds.distributorSku
  `);
  const unmatchedCodes = [...new Set(unmatchedSkus.map(r => r.distributorSku))];
  console.log(`Unmatched codes: ${unmatchedCodes.length}`);

  // 2. Get all existing master cabinets
  const [cabinets] = await conn.query(`
    SELECT id, masterCode, description, category, subCategory, width, height, depth
    FROM cabinets ORDER BY masterCode
  `);
  const cabMap = {};
  for (const c of cabinets) cabMap[c.masterCode.toUpperCase()] = c;
  console.log(`Master cabinets in DB: ${cabinets.length}`);

  // 3. Parse spreadsheet to get descriptions for unmatched codes
  const wb = xlsx.readFile(SPREADSHEET);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  const dataRows = rows.slice(1).filter(r => r[0] != null && r[3] != null);
  
  const sheetData = {};
  for (const row of dataRows) {
    const code = String(row[3] ?? '').trim();
    sheetData[code] = {
      code,
      category: String(row[1] ?? '').trim(),
      subCategory: String(row[2] ?? '').trim(),
      description: String(row[4] ?? '').trim(),
      dimensions: String(row[5] ?? '').trim(),
    };
  }

  // 4. For each unmatched code, try to find a match in master cabinets
  const results = [];
  for (const code of unmatchedCodes) {
    const sheet = sheetData[code] || {};
    const upperCode = code.toUpperCase();
    
    // Try exact match first
    let match = cabMap[upperCode];
    let matchType = match ? 'exact' : 'none';
    
    // Try partial match (code contains masterCode or vice versa)
    if (!match) {
      for (const [mCode, cab] of Object.entries(cabMap)) {
        if (mCode.includes(upperCode) || upperCode.includes(mCode)) {
          match = cab;
          matchType = 'partial';
          break;
        }
      }
    }

    // Parse dimensions from code (e.g. W3021 = Wall 30w 21h, B3624 = Base 36w 24h)
    let parsedW = null, parsedH = null, parsedD = null;
    const dimFromSheet = sheet.dimensions || '';
    if (dimFromSheet) {
      const parts = dimFromSheet.split('x').map(p => parseFloat(p.trim()));
      if (parts.length >= 2) { parsedW = parts[0]; parsedH = parts[1]; parsedD = parts[2] || null; }
    }

    results.push({
      code,
      category: sheet.category || '',
      subCategory: sheet.subCategory || '',
      description: sheet.description || '',
      dimensions: sheet.dimensions || '',
      parsedW, parsedH, parsedD,
      matchType,
      matchId: match?.id || null,
      matchCode: match?.masterCode || null,
      matchDesc: match?.description || null,
    });
  }

  // 5. Print summary
  const exact = results.filter(r => r.matchType === 'exact');
  const partial = results.filter(r => r.matchType === 'partial');
  const none = results.filter(r => r.matchType === 'none');
  
  console.log(`\nMatch summary:`);
  console.log(`  Exact: ${exact.length}`);
  console.log(`  Partial: ${partial.length}`);
  console.log(`  No match: ${none.length}`);

  console.log('\n=== NO MATCH (need new master cabinet records) ===');
  for (const r of none) {
    console.log(`${r.code} | ${r.category} | ${r.subCategory} | ${r.description} | ${r.dimensions}`);
  }

  console.log('\n=== PARTIAL MATCHES (review needed) ===');
  for (const r of partial) {
    console.log(`${r.code} -> ${r.matchCode} | ${r.description} | ${r.matchDesc}`);
  }

  await conn.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
