/**
 * Audit Floral Grey catalog image URLs.
 * Find which cabinets have images vs which don't, and what URL pattern is used.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all FG SKUs with their cabinet image status
const [fgSkus] = await conn.execute(
  `SELECT ds.distributorSku, c.masterCode, c.catalogImageUrl, c.category
   FROM distributor_skus ds
   JOIN cabinets c ON c.id = ds.cabinetId
   WHERE ds.styleId = 180021
   ORDER BY c.category, c.masterCode`
);

const hasImage = fgSkus.filter(r => r.catalogImageUrl && r.catalogImageUrl.trim() !== '');
const noImage = fgSkus.filter(r => !r.catalogImageUrl || r.catalogImageUrl.trim() === '');

console.log(`Total FG SKUs: ${fgSkus.length}`);
console.log(`Has image: ${hasImage.length}`);
console.log(`No image: ${noImage.length}`);

// Show sample image URLs to understand the pattern
console.log('\nSample image URLs (first 10 with images):');
hasImage.slice(0, 10).forEach(r => console.log(`  ${r.distributorSku} (${r.masterCode}): ${r.catalogImageUrl}`));

// Show what's missing
console.log('\nMissing images:');
noImage.forEach(r => console.log(`  ${r.distributorSku} (${r.masterCode}) | ${r.category}`));

// Check if there's a door_style_images table with FG images
const [styleImages] = await conn.execute(
  `SELECT * FROM door_style_images WHERE styleId = 180021 LIMIT 5`
).catch(() => [[]]);
if (styleImages.length > 0) {
  console.log('\nDoor style images for FG:');
  styleImages.forEach(r => console.log(`  ${JSON.stringify(r)}`));
}

// Check what image URL pattern the FG- prefixed SKUs use vs non-FG
const fgPrefixed = fgSkus.filter(r => r.distributorSku.startsWith('FG-'));
const nonFgPrefixed = fgSkus.filter(r => !r.distributorSku.startsWith('FG-'));

console.log(`\nFG- prefixed SKUs: ${fgPrefixed.length} (${fgPrefixed.filter(r => r.catalogImageUrl).length} have images)`);
console.log(`Non-FG- SKUs: ${nonFgPrefixed.length} (${nonFgPrefixed.filter(r => r.catalogImageUrl).length} have images)`);

// Show a few FG- SKUs with images to understand URL pattern
const fgWithImg = fgPrefixed.filter(r => r.catalogImageUrl).slice(0, 5);
console.log('\nFG- SKUs with images:');
fgWithImg.forEach(r => console.log(`  ${r.distributorSku}: ${r.catalogImageUrl}`));

await conn.end();
