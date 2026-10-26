import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { cabinets } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

const UPDATES = [
  ['BBFBP-48-96', '/manus-storage/cab_BBFBP-48-96_1c21d348.jpg'],
  ['BEP-3', '/manus-storage/cab_BEP-3_d8a050ca.jpg'],
  ['BMW-30', '/manus-storage/cab_BMW-30_19c3cf0f.jpg'],
  ['BSR-09', '/manus-storage/cab_BSR-09_3ec0fc4f.png'],
  ['FPL-24-96', '/manus-storage/cab_FPL-24-96_31ee7b96.jpg'],
  ['FPL-37-96', '/manus-storage/cab_FPL-37-96_e1c7dcc2.jpg'],
  ['PLYEB-42', '/manus-storage/cab_PLYEB-42_d4164895.jpg'],
  ['RH-15-42', '/manus-storage/cab_RH-15-42_0bdbf05b.jpg'],
  ['RHC-06-30', '/manus-storage/cab_RHC-06-30_e2123091.jpg'],
  ['SB-15MINI', '/manus-storage/cab_SB-15MINI_a741701e.jpg'],
  ['SB-42', '/manus-storage/cab_SB-42_ad6abc38.png'],
  ['SBA-36', '/manus-storage/cab_SBA-36_b1245293.jpg'],
  ['TS-24-96', '/manus-storage/cab_TS-24-96_766a00cc.jpg'],
  ['TUK', '/manus-storage/cab_TUK_8575e2d9.jpg'],
  ['UC1884', '/manus-storage/cab_UC1884_42e89c2e.jpg'],
  ['UC1890', '/manus-storage/cab_UC1890_212f0ae1.jpg'],
  ['UC1896', '/manus-storage/cab_UC1896_29e4cbd2.jpg'],
  ['UC2484', '/manus-storage/cab_UC2484_b4aa47bc.jpg'],
  ['UC2490', '/manus-storage/cab_UC2490_2eff0a99.jpg'],
  ['UC2496', '/manus-storage/cab_UC2496_5faa25b7.jpg'],
  ['UCB2454', '/manus-storage/cab_UCB2454_a3a26bd6.jpg'],
  ['UCB3054', '/manus-storage/cab_UCB3054_edbdf65b.jpg'],
  ['UCB3654', '/manus-storage/cab_UCB3654_a88b58f2.jpg'],
  ['UOC3384', '/manus-storage/cab_UOC3384_e42193a0.jpg'],
  ['UOC3390', '/manus-storage/cab_UOC3390_7ff25f1d.jpg'],
  ['UOC3396', '/manus-storage/cab_UOC3396_99e66801.jpg'],
  ['VB-09', '/manus-storage/cab_VB-09_d7201dbe.jpg'],
  ['VB-12', '/manus-storage/cab_VB-12_e100fbe5.jpg'],
  ['VB-15', '/manus-storage/cab_VB-15_50f5598e.jpg'],
  ['VB-18', '/manus-storage/cab_VB-18_83448f4f.jpg'],
  ['VDEP', '/manus-storage/cab_VDEP_0b23458e.png'],
  ['W243024', '/manus-storage/cab_W243024_38cfff98.jpeg'],
  ['W243624', '/manus-storage/cab_W243624_31908e8a.jpeg'],
  ['W244224', '/manus-storage/cab_W244224_f93b1aa5.jpeg'],
  ['W303024', '/manus-storage/cab_W303024_8fa5a296.jpeg'],
  ['W303624', '/manus-storage/cab_W303624_dc50b108.jpeg'],
  ['W304224', '/manus-storage/cab_W304224_93ccbc8a.jpeg'],
  ['W363024', '/manus-storage/cab_W363024_b174bcab.jpeg'],
  ['W363624', '/manus-storage/cab_W363624_57d0c3dd.jpg'],
  ['WOOD TRAY', '/manus-storage/cab_WOOD_TRAY_38c695dd.jpg'],
  ['WS-12-42', '/manus-storage/cab_WS-12-42_833c0055.jpg'],
  ['DD-Q', '/manus-storage/cab_DD-Q_ab41389a.jpg'],
  ['KIOSK-DA', '/manus-storage/cab_KIOSK-DA_f53a4dea.jpg'],
  ['MINI', '/manus-storage/cab_MINI_53f0fe4f.jpg'],
  ['BS-24-35', '/manus-storage/cab_BS-24-35_57bf29f1.jpg'],
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

let updated = 0;
let failed = 0;

for (const [code, url] of UPDATES) {
  try {
    const result = await db.update(cabinets)
      .set({ catalogImageUrl: url })
      .where(eq(cabinets.masterCode, code));
    console.log(`✓ ${code} -> ${url}`);
    updated++;
  } catch (err) {
    console.error(`✗ ${code}: ${err.message}`);
    failed++;
  }
}

console.log(`\nUpdated: ${updated}, Failed: ${failed}`);
await conn.end();
