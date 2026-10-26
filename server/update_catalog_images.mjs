import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const db = await createConnection(process.env.DATABASE_URL);

// Load the image mapping from FG portal scrape
const imageMap = JSON.parse(readFileSync('/home/ubuntu/fg_image_map.json', 'utf-8'));

// Build masterCode -> imageUrl mapping (strip FG- prefix since masterCodes are shared)
const BASE_URL = 'https://shop.milestonecabinetry.com/media/catalog/product/cache/b7789d0155824a8e920d070ec4715e3b/';

// Build the mapping: masterCode -> full image URL
const codeToUrl = {};
for (const item of imageMap) {
  const masterCode = item.sku.replace(/^FG-/, '');
  codeToUrl[masterCode] = item.url;
}

// Also add range mappings - some masterCodes share images
// B12-B21 all use b12-21_2.jpg
const b1221Url = codeToUrl['B12'];
if (b1221Url) {
  for (const code of ['B12', 'B15', 'B18', 'B21']) {
    codeToUrl[code] = b1221Url;
  }
}
// B24-B27 use b24-27_2.jpg
const b2427Url = codeToUrl['B24'];
if (b2427Url) {
  for (const code of ['B24', 'B27']) {
    codeToUrl[code] = b2427Url;
  }
}
// B30-B42 use b30-42_2.jpg
const b3042Url = codeToUrl['B30'];
if (b3042Url) {
  for (const code of ['B30', 'B33', 'B36', 'B42']) {
    codeToUrl[code] = b3042Url;
  }
}
// 3DB12-3DB36 use 3db12-36_2.jpg
const db3Url = codeToUrl['3DB12'];
if (db3Url) {
  for (const code of ['3DB12', '3DB15', '3DB18', '3DB21', '3DB24', '3DB27', '3DB30', '3DB33', '3DB36']) {
    codeToUrl[code] = db3Url;
  }
}
// SB30-SB36 use sb30-36_2.jpg
const sbUrl = codeToUrl['SB30'];
if (sbUrl) {
  for (const code of ['SB30', 'SB33', 'SB36']) {
    codeToUrl[code] = sbUrl;
  }
}
// W09-W21 30/36/42 heights use same images
const w930Url = codeToUrl['W0930'];
if (w930Url) {
  for (const w of ['09', '12', '15', '18', '21']) {
    codeToUrl[`W${w}30`] = w930Url;
  }
}
const w936Url = codeToUrl['W0936'];
if (w936Url) {
  for (const w of ['09', '12', '15', '18', '21']) {
    codeToUrl[`W${w}36`] = w936Url;
  }
}
const w942Url = codeToUrl['W0942'];
if (w942Url) {
  for (const w of ['09', '12', '15', '18', '21']) {
    codeToUrl[`W${w}42`] = w942Url;
  }
}
// W24-W48 30/36/42 heights
const w2430Url = codeToUrl['W2430'];
if (w2430Url) {
  for (const w of ['24', '27', '30', '33', '36', '39', '42', '45', '48']) {
    codeToUrl[`W${w}30`] = w2430Url;
  }
}
const w2436Url = codeToUrl['W2436'];
if (w2436Url) {
  for (const w of ['24', '27', '30', '33', '36', '39', '42', '45', '48']) {
    codeToUrl[`W${w}36`] = w2436Url;
  }
}
const w2442Url = codeToUrl['W2442'];
if (w2442Url) {
  for (const w of ['24', '27', '30', '33', '36', '39', '42', '45', '48']) {
    codeToUrl[`W${w}42`] = w2442Url;
  }
}
// ADA base cabinets
const adaB1215Url = codeToUrl['ADA-B12'];
if (adaB1215Url) {
  for (const code of ['ADA-B12', 'ADA-B15']) {
    codeToUrl[code] = adaB1215Url;
  }
}
const adaB1821Url = codeToUrl['ADA-B18'];
if (adaB1821Url) {
  for (const code of ['ADA-B18', 'ADA-B21']) {
    codeToUrl[code] = adaB1821Url;
  }
}
const adaB243Url = codeToUrl['ADA-B24'];
if (adaB243Url) {
  for (const code of ['ADA-B24', 'ADA-B27']) {
    codeToUrl[code] = adaB243Url;
  }
}
const adaB303Url = codeToUrl['ADA-B30'];
if (adaB303Url) {
  for (const code of ['ADA-B30', 'ADA-B33', 'ADA-B36']) {
    codeToUrl[code] = adaB303Url;
  }
}
// ADA 3DB
const ada3dbUrl = codeToUrl['ADA-3DB12'];
if (ada3dbUrl) {
  for (const code of ['ADA-3DB12', 'ADA-3DB15', 'ADA-3DB18', 'ADA-3DB21', 'ADA-3DB24']) {
    codeToUrl[code] = ada3dbUrl;
  }
}
// VB vanity bases
const vb1518Url = codeToUrl['VB15'];
if (vb1518Url) {
  for (const code of ['VB12', 'VB15', 'VB18', 'VB21']) {
    codeToUrl[code] = vb1518Url;
  }
}

console.log(`Built mapping for ${Object.keys(codeToUrl).length} masterCodes`);

// Now update the cabinets table
let updated = 0;
let notFound = 0;

for (const [masterCode, imageUrl] of Object.entries(codeToUrl)) {
  const [result] = await db.execute(
    `UPDATE cabinets SET catalogImageUrl = ? WHERE masterCode = ? AND (catalogImageUrl IS NULL OR catalogImageUrl = '')`,
    [imageUrl, masterCode]
  );
  if (result.affectedRows > 0) {
    updated += result.affectedRows;
  } else {
    // Check if the cabinet exists at all
    const [rows] = await db.execute(
      `SELECT COUNT(*) as cnt FROM cabinets WHERE masterCode = ?`,
      [masterCode]
    );
    if (rows[0].cnt === 0) notFound++;
  }
}

console.log(`Updated ${updated} cabinet records with catalog images`);
console.log(`${notFound} masterCodes not found in cabinets table`);

// Also update any cabinets that have a catalogImageUrl but it's the wrong type
// (e.g. SVG placeholder URLs stored in DB)
const [svgResult] = await db.execute(
  `UPDATE cabinets SET catalogImageUrl = NULL WHERE catalogImageUrl LIKE '%svg%'`
);
console.log(`Cleared ${svgResult.affectedRows} SVG placeholder URLs from DB`);

// Show summary of how many cabinets now have images
const [summary] = await db.execute(
  `SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN catalogImageUrl IS NOT NULL AND catalogImageUrl != '' THEN 1 ELSE 0 END) as withImage,
    SUM(CASE WHEN catalogImageUrl IS NULL OR catalogImageUrl = '' THEN 1 ELSE 0 END) as withoutImage
   FROM cabinets`
);
console.log(`\nCabinets summary:`);
console.log(`  Total: ${summary[0].total}`);
console.log(`  With image: ${summary[0].withImage}`);
console.log(`  Without image: ${summary[0].withoutImage}`);

await db.end();
