/**
 * Seed script: add missing USCD bridge/refrigerator wall cabinet distributor_skus rows.
 * 
 * Cabinet types:
 *   12" deep bridge: W3012, W3312, W3612, W3015, W3315, W3615, W3018, W3318, W3618, W3024, W3324, W3624
 *   24" deep fridge wall: W301224, W331224, W361224, W301524, W331524, W361524, W301824, W331824, W361824, W302424, W332424, W362424
 * 
 * 19 USCD styles × 24 cabinet types = 456 rows
 */
import { getDb } from './server/db';
import { sql } from 'drizzle-orm';

const USCD_DISTRIBUTOR_ID = 210002;

// Cabinet masterCode → cabinetId (from DB check)
const BRIDGE_CABS: { masterCode: string; cabinetId: number; depth: number; height: number; width: number }[] = [
  // 12" deep bridge cabinets
  { masterCode: 'W3012', cabinetId: 9360085, depth: 12, height: 12, width: 30 },
  { masterCode: 'W3312', cabinetId: 9360086, depth: 12, height: 12, width: 33 },
  { masterCode: 'W3612', cabinetId: 9360087, depth: 12, height: 12, width: 36 },
  { masterCode: 'W3015', cabinetId: 9360088, depth: 12, height: 15, width: 30 },
  { masterCode: 'W3315', cabinetId: 9360089, depth: 12, height: 15, width: 33 },
  { masterCode: 'W3615', cabinetId: 9360090, depth: 12, height: 15, width: 36 },
  { masterCode: 'W3018', cabinetId: 9360092, depth: 12, height: 18, width: 30 },
  { masterCode: 'W3318', cabinetId: 9360093, depth: 12, height: 18, width: 33 },
  { masterCode: 'W3618', cabinetId: 9360094, depth: 12, height: 18, width: 36 },
  { masterCode: 'W3024', cabinetId: 9360095, depth: 12, height: 24, width: 30 },
  { masterCode: 'W3324', cabinetId: 9360096, depth: 12, height: 24, width: 33 },
  { masterCode: 'W3624', cabinetId: 9360097, depth: 12, height: 24, width: 36 },
  // 24" deep refrigerator wall cabinets
  { masterCode: 'W301224', cabinetId: 9360120, depth: 24, height: 12, width: 30 },
  { masterCode: 'W331224', cabinetId: 9360123, depth: 24, height: 12, width: 33 },
  { masterCode: 'W361224', cabinetId: 9360126, depth: 24, height: 12, width: 36 },
  { masterCode: 'W301524', cabinetId: 9360121, depth: 24, height: 15, width: 30 },
  { masterCode: 'W331524', cabinetId: 9360124, depth: 24, height: 15, width: 33 },
  { masterCode: 'W361524', cabinetId: 9360127, depth: 24, height: 15, width: 36 },
  { masterCode: 'W301824', cabinetId: 9360122, depth: 24, height: 18, width: 30 },
  { masterCode: 'W331824', cabinetId: 9360125, depth: 24, height: 18, width: 33 },
  { masterCode: 'W361824', cabinetId: 9360128, depth: 24, height: 18, width: 36 },
  { masterCode: 'W302424', cabinetId: 9360129, depth: 24, height: 24, width: 30 },
  { masterCode: 'W332424', cabinetId: 9360130, depth: 24, height: 24, width: 33 },
  { masterCode: 'W362424', cabinetId: 9360131, depth: 24, height: 24, width: 36 },
];

// USCD styles: styleId → styleCode (for platformSku prefix)
const USCD_STYLES: { styleId: number; styleCode: string }[] = [
  { styleId: 330014, styleCode: 'SW' },
  { styleId: 330015, styleCode: 'SA' },
  { styleId: 330016, styleCode: 'SG' },
  { styleId: 330017, styleCode: 'SD' },
  { styleId: 330018, styleCode: 'SI' },
  { styleId: 330019, styleCode: 'SN' },
  { styleId: 330020, styleCode: 'SB' },
  { styleId: 330021, styleCode: 'SH' },
  { styleId: 330022, styleCode: 'SC' },
  { styleId: 330023, styleCode: 'EW' },
  { styleId: 330024, styleCode: 'OW' },
  { styleId: 330025, styleCode: 'OS' },
  { styleId: 330026, styleCode: 'CW' },
  { styleId: 330027, styleCode: 'CS' },
  { styleId: 330028, styleCode: 'HD' },
  { styleId: 330029, styleCode: 'OM' },
  { styleId: 330030, styleCode: 'OT' },
  { styleId: 330031, styleCode: 'HE' },
  { styleId: 330032, styleCode: 'SEO' },
];

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }

  let inserted = 0;
  let skipped = 0;

  for (const style of USCD_STYLES) {
    for (const cab of BRIDGE_CABS) {
      const platformSku = `${style.styleCode}-${cab.masterCode}`;
      const distributorSku = cab.masterCode;

      // Check if already exists
      const existing = await db.execute(sql`
        SELECT id FROM distributor_skus
        WHERE distributorId = ${USCD_DISTRIBUTOR_ID}
          AND cabinetId = ${cab.cabinetId}
          AND styleId = ${style.styleId}
        LIMIT 1
      `);
      const rows = (existing as any).rows ?? (existing as any)[0] ?? existing;
      if (rows.length > 0) {
        skipped++;
        continue;
      }

      await db.execute(sql`
        INSERT INTO distributor_skus
          (cabinetId, distributorId, styleId, platformSku, distributorSku, isAvailable, isPublished, status)
        VALUES
          (${cab.cabinetId}, ${USCD_DISTRIBUTOR_ID}, ${style.styleId}, ${platformSku}, ${distributorSku}, 1, 1, 'approved')
      `);
      inserted++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, Skipped (already existed): ${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
