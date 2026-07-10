/**
 * Import all 331 Shaker Unfinished SKUs from the collected data file.
 * 
 * For each SKU:
 * 1. Create or find the cabinet master record (cabinets table)
 * 2. Insert a distributor_sku row linking cabinet -> distributor(1/UCD) -> style(150002/SU)
 * 
 * Distributor ID: 1 (UCD)
 * Door Style ID: 150002 (Shaker Unfinished / SU)
 */

import mysql from 'mysql2/promise';
import fs from 'fs';

const DISTRIBUTOR_ID = 1;
const STYLE_ID = 150002;

// Parse the collected data file
const rawData = fs.readFileSync('/home/ubuntu/su_skus_collected.txt', 'utf8');
const skus = [];

for (const line of rawData.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const parts = trimmed.split('|');
  if (parts.length < 4) continue;
  const sku = parts[0].trim();
  const price = parseFloat(parts[1].trim());
  const description = parts[2].trim();
  const categoryRaw = parts[3].trim();
  if (isNaN(price)) continue;
  skus.push({ sku, price, description, categoryRaw });
}

console.log(`Parsed ${skus.length} SKUs from data file`);

// Map USCD category names to our cabinet categories
function mapCategory(cat) {
  if (cat === 'Base Cabinets') return 'Base';
  if (cat === 'Wall Cabinets') return 'Wall';
  if (cat === 'Tall Cabinets') return 'Tall';
  if (cat === 'Vanities') return 'Vanity';
  if (cat === 'Mouldings') return 'Accessory';
  if (cat === 'Fillers & Panels') return 'Accessory';
  if (cat === 'Accessories') return 'Accessory';
  return 'Accessory';
}

// Map category to subCategory based on description
function mapSubCategory(sku, description, cat) {
  const d = description.toLowerCase();
  if (cat === 'Mouldings') return 'Moulding';
  if (cat === 'Fillers & Panels') {
    if (d.includes('filler')) return 'Filler';
    if (d.includes('panel') || d.includes('skin')) return 'Panel';
    if (d.includes('shelf board')) return 'Shelf Board';
    if (d.includes('dishwasher')) return 'Filler';
    if (d.includes('refrigerator end')) return 'Panel';
    return 'Filler';
  }
  if (cat === 'Accessories') {
    if (d.includes('corbel') || d.includes('leg') || d.includes('valance')) return 'Decorative';
    if (d.includes('roll out') || d.includes('rollout')) return 'Roll Out Shelf';
    if (d.includes('hinge')) return 'Hardware';
    if (d.includes('glide')) return 'Hardware';
    if (d.includes('sample')) return 'Sample';
    if (d.includes('swatch')) return 'Sample';
    return 'Accessory';
  }
  if (cat === 'Vanities') {
    if (d.includes('sink')) return 'Vanity Sink Base';
    if (d.includes('drawer')) return 'Vanity Drawer Base';
    if (d.includes('combo')) return 'Vanity Combo Base';
    if (d.includes('knee drawer')) return 'Vanity Accessory';
    return 'Vanity Base';
  }
  if (cat === 'Tall Cabinets') {
    if (d.includes('oven')) return 'Oven Cabinet';
    if (d.includes('rollout') || d.includes('roll out')) return 'Utility Cabinet';
    return 'Utility Cabinet';
  }
  if (cat === 'Wall Cabinets') {
    if (d.includes('bridge')) return 'Bridge Cabinet';
    if (d.includes('refrigerator')) return 'Refrigerator Wall Cabinet';
    if (d.includes('diagonal corner') || d.includes('easy reach')) return 'Corner Wall Cabinet';
    if (d.includes('blind corner')) return 'Blind Corner Wall Cabinet';
    if (d.includes('glass door') && d.includes('stacker')) return 'Stacker Wall Cabinet';
    if (d.includes('glass door')) return 'Glass Door Wall Cabinet';
    if (d.includes('angle wall')) return 'Angle Wall Cabinet';
    if (d.includes('open cabinet')) return 'Open Wall Cabinet';
    if (d.includes('microwave')) return 'Microwave Cabinet';
    if (d.includes('wine') || d.includes('stem glass') || d.includes('floating shelf')) return 'Specialty Wall';
    return 'Wall Cabinet';
  }
  if (cat === 'Base Cabinets') {
    if (d.includes('sink base') || d.includes('farm sink')) return 'Sink Base';
    if (d.includes('three drawer')) return 'Three Drawer Base';
    if (d.includes('two drawer')) return 'Two Drawer Base';
    if (d.includes('full height door') && d.includes('rollout')) return 'Rollout Base';
    if (d.includes('full height door') && d.includes('tray divider')) return 'Tray Divider Base';
    if (d.includes('full height door') && d.includes('trashcan')) return 'Trash Can Base';
    if (d.includes('full height door')) return 'Full Height Door Base';
    if (d.includes('rollout') || d.includes('roll out')) return 'Rollout Base';
    if (d.includes('tray divider')) return 'Tray Divider Base';
    if (d.includes('trashcan')) return 'Trash Can Base';
    if (d.includes('blind base corner') || d.includes('blind corner')) return 'Blind Corner Base';
    if (d.includes('easy reach') && d.includes('lazy susan')) return 'Lazy Susan Base';
    if (d.includes('easy reach')) return 'Easy Reach Base';
    if (d.includes('diagonal corner sink')) return 'Corner Sink Base';
    if (d.includes('tray base')) return 'Tray Base';
    if (d.includes('angle base')) return 'Angle Base';
    if (d.includes('microwave')) return 'Microwave Base';
    if (d.includes('file')) return 'File Base';
    if (d.includes('knee drawer') || d.includes('desk knee')) return 'Desk Accessory';
    return 'Base Cabinet';
  }
  return null;
}

// Extract dimensions from description
function parseDimensions(description) {
  // Pattern: 12"W x 34-1/2"H x 24"D
  const wMatch = description.match(/(\d+(?:-\d+\/\d+)?)"W/);
  const hMatch = description.match(/(\d+(?:-\d+\/\d+)?)"H/);
  const dMatch = description.match(/(\d+(?:-\d+\/\d+)?)"D/);
  
  function parseFraction(s) {
    if (!s) return null;
    if (s.includes('-')) {
      const [whole, frac] = s.split('-');
      const [num, den] = frac.split('/');
      return parseFloat(whole) + parseFloat(num) / parseFloat(den);
    }
    return parseFloat(s);
  }
  
  return {
    width: wMatch ? parseFraction(wMatch[1]) : null,
    height: hMatch ? parseFraction(hMatch[1]) : null,
    depth: dMatch ? parseFraction(dMatch[1]) : null,
  };
}

// Determine placement type
function mapPlacementType(cat) {
  if (cat === 'Base Cabinets') return 'base';
  if (cat === 'Wall Cabinets') return 'wall';
  if (cat === 'Tall Cabinets') return 'tall';
  if (cat === 'Vanities') return 'vanity';
  return null; // accessories, mouldings, fillers don't get placed in designer
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

let inserted = 0;
let skipped = 0;
let errors = 0;

for (const item of skus) {
  const { sku, price, description, categoryRaw } = item;
  const category = mapCategory(categoryRaw);
  const subCategory = mapSubCategory(sku, description, categoryRaw);
  const dims = parseDimensions(description);
  const placementType = mapPlacementType(categoryRaw);
  
  // masterCode = the SKU itself (e.g. SU-B12, SU-W3030)
  const masterCode = sku;
  
  try {
    // 1. Upsert cabinet master record
    const [existing] = await conn.execute(
      'SELECT id FROM cabinets WHERE masterCode = ?',
      [masterCode]
    );
    
    let cabinetId;
    if (existing.length > 0) {
      cabinetId = existing[0].id;
      // Update if needed
      await conn.execute(`
        UPDATE cabinets SET 
          description = ?, category = ?, subCategory = ?,
          width = ?, height = ?, depth = ?,
          placementType = ?,
          isActive = 1, conflictStatus = 'none'
        WHERE id = ?
      `, [description, category, subCategory,
          dims.width, dims.height, dims.depth,
          placementType, cabinetId]);
    } else {
      const [result] = await conn.execute(`
        INSERT INTO cabinets 
          (masterCode, description, descriptionSource, category, subCategory,
           width, height, depth, placementType, isActive, conflictStatus,
           showInCatalog, showInDesigner, showIn2020)
        VALUES (?, ?, 'US Cabinet Depot', ?, ?, ?, ?, ?, ?, 1, 'none', 1, 1, 1)
      `, [masterCode, description, category, subCategory,
          dims.width, dims.height, dims.depth, placementType]);
      cabinetId = result.insertId;
    }
    
    // 2. Upsert distributor_sku
    const platformSku = `${masterCode}-SU-UCD`;
    const [existingSku] = await conn.execute(
      'SELECT id FROM distributor_skus WHERE platformSku = ?',
      [platformSku]
    );
    
    if (existingSku.length > 0) {
      await conn.execute(`
        UPDATE distributor_skus SET
          listPrice = ?, yourCost = ?, isAvailable = 1, isPublished = 1, status = 'approved'
        WHERE platformSku = ?
      `, [price, price, platformSku]);
    } else {
      await conn.execute(`
        INSERT INTO distributor_skus
          (cabinetId, distributorId, styleId, platformSku, distributorSku,
           listPrice, yourCost, isAvailable, isPublished, status, supplierCabinetName)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'approved', ?)
      `, [cabinetId, DISTRIBUTOR_ID, STYLE_ID, platformSku, sku,
          price, price, description]);
    }
    
    inserted++;
    if (inserted % 50 === 0) console.log(`  Progress: ${inserted}/${skus.length}`);
    
  } catch (err) {
    console.error(`  ERROR on ${sku}: ${err.message}`);
    errors++;
  }
}

await conn.end();

console.log(`\n=== IMPORT COMPLETE ===`);
console.log(`  Inserted/Updated: ${inserted}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Errors: ${errors}`);
console.log(`  Total processed: ${skus.length}`);
