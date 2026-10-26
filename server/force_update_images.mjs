import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const db = await createConnection(process.env.DATABASE_URL);

// Load the image mapping
const imageMap = JSON.parse(readFileSync('/home/ubuntu/fg_image_map.json', 'utf-8'));

const BASE_URL = 'https://shop.milestonecabinetry.com/media/catalog/product/cache/b7789d0155824a8e920d070ec4715e3b/';

// Build masterCode -> full image URL (strip FG- prefix)
const codeToUrl = {};
for (const item of imageMap) {
  const masterCode = item.sku.replace(/^FG-/, '');
  codeToUrl[masterCode] = item.url;
}

// Expand range mappings
const ranges = {
  'B15': 'B12', 'B18': 'B12', 'B21': 'B12',
  'B27': 'B24',
  'B33': 'B30', 'B36': 'B30', 'B42': 'B30',
  '3DB15': '3DB12', '3DB18': '3DB12', '3DB21': '3DB12', '3DB24': '3DB12',
  '3DB27': '3DB12', '3DB30': '3DB12', '3DB33': '3DB12', '3DB36': '3DB12',
  'SB33': 'SB30', 'SB36': 'SB30',
  'ADA-B15': 'ADA-B12',
  'ADA-B21': 'ADA-B18',
  'ADA-B27': 'ADA-B24',
  'ADA-B33': 'ADA-B30', 'ADA-B36': 'ADA-B30',
  'ADA-3DB15': 'ADA-3DB12', 'ADA-3DB18': 'ADA-3DB12', 'ADA-3DB21': 'ADA-3DB12', 'ADA-3DB24': 'ADA-3DB12',
  'VB12': 'VB15', 'VB18': 'VB15', 'VB21': 'VB15',
};
for (const [code, sourceCode] of Object.entries(ranges)) {
  if (codeToUrl[sourceCode] && !codeToUrl[code]) {
    codeToUrl[code] = codeToUrl[sourceCode];
  }
}

// Wall cabinet ranges
const wallSizes = ['09','12','15','18','21'];
const wallLargeSizes = ['24','27','30','33','36','39','42','45','48'];
const wallHeights = ['30','36','42'];
const wallSourceMap = {
  '30': { small: 'W0930', large: 'W2430' },
  '36': { small: 'W0936', large: 'W2436' },
  '42': { small: 'W0942', large: 'W2442' },
};
for (const [h, sources] of Object.entries(wallSourceMap)) {
  const smallUrl = codeToUrl[sources.small];
  const largeUrl = codeToUrl[sources.large];
  if (smallUrl) {
    for (const w of wallSizes) codeToUrl[`W${w}${h}`] = smallUrl;
  }
  if (largeUrl) {
    for (const w of wallLargeSizes) codeToUrl[`W${w}${h}`] = largeUrl;
  }
}

// W3012/15/18/24 series
for (const h of ['12','15','18','24']) {
  const src = codeToUrl[`W30${h}`];
  if (src) {
    for (const w of ['30','33','36','39','42']) {
      codeToUrl[`W${w}${h}`] = src;
    }
  }
}

console.log(`Built mapping for ${Object.keys(codeToUrl).length} masterCodes`);

// First check what the 512 without images look like
const [missing] = await db.execute(
  `SELECT masterCode, catalogImageUrl, COUNT(*) as cnt 
   FROM cabinets 
   WHERE catalogImageUrl IS NULL OR catalogImageUrl = ''
   GROUP BY masterCode, catalogImageUrl
   ORDER BY cnt DESC
   LIMIT 30`
);
console.log('\nTop 30 masterCodes missing images:');
for (const row of missing) {
  const hasMapping = codeToUrl[row.masterCode] ? '✓' : '✗';
  console.log(`  ${hasMapping} ${row.masterCode} (${row.cnt} cabinets)`);
}

// Force update ALL cabinets with correct portal images (overwrite existing)
let updated = 0;
for (const [masterCode, imageUrl] of Object.entries(codeToUrl)) {
  const [result] = await db.execute(
    `UPDATE cabinets SET catalogImageUrl = ? WHERE masterCode = ?`,
    [imageUrl, masterCode]
  );
  if (result.affectedRows > 0) {
    updated += result.affectedRows;
  }
}

console.log(`\nForce-updated ${updated} cabinet records with portal images`);

// Final summary
const [summary] = await db.execute(
  `SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN catalogImageUrl IS NOT NULL AND catalogImageUrl != '' THEN 1 ELSE 0 END) as withImage,
    SUM(CASE WHEN catalogImageUrl IS NULL OR catalogImageUrl = '' THEN 1 ELSE 0 END) as withoutImage
   FROM cabinets`
);
console.log(`\nFinal cabinets summary:`);
console.log(`  Total: ${summary[0].total}`);
console.log(`  With image: ${summary[0].withImage}`);
console.log(`  Without image: ${summary[0].withoutImage}`);

// Show remaining without images
const [stillMissing] = await db.execute(
  `SELECT masterCode, COUNT(*) as cnt 
   FROM cabinets 
   WHERE catalogImageUrl IS NULL OR catalogImageUrl = ''
   GROUP BY masterCode
   ORDER BY cnt DESC
   LIMIT 20`
);
if (stillMissing.length > 0) {
  console.log('\nStill missing images:');
  for (const row of stillMissing) {
    console.log(`  ${row.masterCode} (${row.cnt})`);
  }
}

await db.end();
