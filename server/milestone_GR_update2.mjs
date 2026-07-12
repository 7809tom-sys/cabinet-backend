import mysql from 'mysql2/promise';
import fs from 'fs';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Load all scraped data
const base = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_base.json'));
const wall = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_wall.json'));
const tall = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_tall.json'));
const accessories = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_accessories.json'));
const vanities = JSON.parse(fs.readFileSync('/home/ubuntu/milestone_scraped_GR_vanities.json'));

const allItems = [...base, ...wall, ...tall, ...accessories, ...vanities];

// Portal GR- prefix → DB SG- prefix
// Plus specific SKU name differences between portal and DB
const SKU_MAP = {
  // Base cabinets - naming differences
  'GR-BT09': 'SG-BT9',
  'GR-B30': 'SG-B30S',
  'GR-SB30': 'SG-SB30S',
  'GR-BEC24': 'SG-BEC24',  // may already exist
  'GR-DFB18': 'SG-DFB18',  // may already exist
  // Oven/Tall - different format
  'GR-O308424': 'SG-O338424',
  'GR-O309024': 'SG-O339024',
  'GR-O309624': 'SG-O339624',
  // Wall cabinets - GD suffix variants
  'GR-W3312': 'SG-W3312GD',
  'GR-W3315': 'SG-W3315GD',
  'GR-W2418': 'SG-W2418GD',
  'GR-W3318': 'SG-W3318GD',
  'GR-W3324': 'SG-W332424',
  'GR-W1830GD': 'SG-W1830',
  'GR-W1836GD': 'SG-W1836',
  'GR-W1842GD': 'SG-W1842',
  // Accessories - TypeA suffix
  'RS18': 'RS18-TypeA',
  'RS21': 'RS21-TypeA',
  'RS24': 'RS24-TypeA',
  'RS27': 'RS27-TypeA',
  'RS30': 'RS30-TypeA',
  'RS33': 'RS33-TypeA',
  'RS36': 'RS36-TypeA',
  // Vanities
  'GR-VS30': 'SG-VS30S',
  'GR-V3321DL': 'SG-V3321DL',  // may not exist
  'GR-V3321DR': 'SG-V3321DR',  // may not exist
};

function mapSku(portalSku) {
  if (SKU_MAP[portalSku]) return SKU_MAP[portalSku];
  if (portalSku.startsWith('GR-')) return 'SG-' + portalSku.slice(3);
  return portalSku;
}

let updated = 0;
let notFound = [];
let skipped = 0;

for (const item of allItems) {
  if (!item.sku || item.cost === 0) { skipped++; continue; }
  
  const dbSku = mapSku(item.sku);
  
  const [rows] = await db.execute(
    `UPDATE distributor_skus SET yourCost = ?, listPrice = ? WHERE distributorSku = ?`,
    [item.cost, item.list, dbSku]
  );
  
  if (rows.affectedRows > 0) {
    updated++;
  } else {
    notFound.push({ portal: item.sku, db: dbSku, cost: item.cost, list: item.list });
  }
}

console.log(`Updated: ${updated}`);
console.log(`Skipped (zero cost): ${skipped}`);
console.log(`Not found (${notFound.length}):`);
notFound.forEach(i => console.log(`  ${i.portal} → ${i.db} ($${i.cost})`));

await db.end();
