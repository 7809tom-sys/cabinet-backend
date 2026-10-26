/**
 * Audit: find all active cabinets missing dimensions and/or catalog images.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Total active cabinets
const [total] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1`
);
console.log('Total active cabinets:', total[0].cnt);

// Missing width
const [missingW] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 AND (width IS NULL OR width = 0 OR width = '')`
);
console.log('Missing width:', missingW[0].cnt);

// Missing height
const [missingH] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 AND (height IS NULL OR height = 0 OR height = '')`
);
console.log('Missing height:', missingH[0].cnt);

// Missing depth
const [missingD] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 AND (depth IS NULL OR depth = 0 OR depth = '')`
);
console.log('Missing depth:', missingD[0].cnt);

// Missing all three
const [missingAll] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0) AND (height IS NULL OR height = 0) AND (depth IS NULL OR depth = 0)`
);
console.log('Missing ALL dimensions:', missingAll[0].cnt);

// Missing catalog image
const [missingImg] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1 AND (catalogImageUrl IS NULL OR catalogImageUrl = '')`
);
console.log('Missing catalogImageUrl:', missingImg[0].cnt);

// Sample of cabinets missing dimensions - show by category
const [sampleMissing] = await conn.execute(
  `SELECT masterCode, description, category, subCategory, width, height, depth, catalogImageUrl
   FROM cabinets WHERE isActive = 1 
   AND (width IS NULL OR width = 0 OR height IS NULL OR height = 0 OR depth IS NULL OR depth = 0)
   ORDER BY category, masterCode
   LIMIT 50`
);
console.log('\nSample cabinets missing dimensions:');
sampleMissing.forEach(r => {
  const dims = `${r.width || '?'}W x ${r.height || '?'}H x ${r.depth || '?'}D`;
  const img = r.catalogImageUrl ? 'HAS_IMG' : 'NO_IMG';
  console.log(`  ${r.masterCode} | ${r.category}/${r.subCategory} | ${dims} | ${img}`);
});

// Check what columns exist for packaging
const [cols] = await conn.execute(
  `SHOW COLUMNS FROM cabinets`
);
const colNames = cols.map(c => c.Field);
console.log('\nCabinet table columns:', colNames.join(', '));

await conn.end();
