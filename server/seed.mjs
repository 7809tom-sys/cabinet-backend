/**
 * Cabinet Dealz Database Seed Script
 * Seeds: distributors, door_styles, cabinets
 * Run: node server/seed.mjs
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database');

// ─── 1. Seed Distributors ──────────────────────────────────────────────────────

const distributorData = [
  {
    code: 'UCD',
    name: 'US Cabinet Depot',
    initials: 'UCD',
    costMultiplier: 0.30,
    tariffRate: 0.07,
    shippingRate: 0.10,
    warehouseZips: JSON.stringify(['30024', '85040', '60638', '75247', '98032', '33054', '19153', '07105']),
    leadTimeDays: 7,
  },
  {
    code: 'CS',
    name: 'Clark & Son',
    initials: 'CS',
    costMultiplier: 0.38,
    tariffRate: 0.00,
    shippingRate: 0.00,
    warehouseZips: JSON.stringify(['32401']),
    leadTimeDays: 10,
  },
  {
    code: 'SK',
    name: 'Skyline',
    initials: 'SK',
    costMultiplier: 0.35,
    tariffRate: 0.00,
    shippingRate: 0.00,
    warehouseZips: JSON.stringify(['75234']),
    leadTimeDays: 7,
  },
];

console.log('Seeding distributors...');
for (const d of distributorData) {
  await conn.execute(
    `INSERT INTO distributors (code, name, initials, costMultiplier, tariffRate, shippingRate, warehouseZips, leadTimeDays, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE name=VALUES(name), costMultiplier=VALUES(costMultiplier), tariffRate=VALUES(tariffRate), shippingRate=VALUES(shippingRate)`,
    [d.code, d.name, d.initials, d.costMultiplier, d.tariffRate, d.shippingRate, d.warehouseZips, d.leadTimeDays]
  );
}
console.log(`✓ Seeded ${distributorData.length} distributors`);

// Get distributor IDs
const [distRows] = await conn.execute('SELECT id, code FROM distributors');
const distMap = {};
for (const r of distRows) distMap[r.code] = r.id;
console.log('Distributor IDs:', distMap);

// ─── 2. Seed Door Styles ───────────────────────────────────────────────────────

const cdStandardsRaw = fs.readFileSync('/home/ubuntu/cd_standards.csv', 'utf8');
const cdStandards = parse(cdStandardsRaw, { columns: true, skip_empty_lines: true });

// Map distributor names from CSV to our codes
const distNameToCode = {
  'Clark And Son': 'CS',
  'US Cabinet Depot': 'UCD',
  'Skyline': 'SK',
};

// Build slug from ourName for image URLs
function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

console.log(`Seeding ${cdStandards.length} door styles...`);
let styleCount = 0;
for (const row of cdStandards) {
  const distCode = distNameToCode[row['Distributor']];
  if (!distCode) {
    console.warn(`Unknown distributor: ${row['Distributor']}`);
    continue;
  }
  const distributorId = distMap[distCode];
  const ourName = row['Our Name'] || row['Door Name'];
  const slug = toSlug(ourName);

  // Use the SEO names from CSV or build from slug
  const doorPicName = row['Door Pic SEO Name'] || `${slug}-door.jpg`;
  const roomSceneName = row['Room Scene Pic SEO Name'] || `${slug}-room-scene.jpg`;
  const thumbnailName = doorPicName.replace('.jpg', '-thumb.jpg');

  await conn.execute(
    `INSERT INTO door_styles (distributorId, styleCode, ourName, distributorName, doorStyle, woodSpecies, finish, color, boxConstruction, drawerConstruction, hardware, frameSize, overlayType, doorPanelType, doorSampleImageUrl, roomSceneImageUrl, thumbnailImageUrl, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE ourName=VALUES(ourName)`,
    [
      distributorId,
      row['Color Code'],
      ourName,
      row['Door Name'],
      row['Door Style'] || null,
      row['Wood'] || null,
      row['Finish'] || null,
      row['Sherwin Color'] || null,
      row['Box construction.'] || null,
      row['Drawer'] || null,
      row['Hardware'] || null,
      row['Frame Size'] || null,
      row['Overlay Type'] || null,
      row['Door Panel Type'] || null,
      `/door-samples/${doorPicName}`,
      `/room-scenes/${roomSceneName}`,
      `/thumbnails/${thumbnailName}`,
    ]
  );
  styleCount++;
}
console.log(`✓ Seeded ${styleCount} door styles`);

// ─── 3. Seed Cabinets ──────────────────────────────────────────────────────────

const genericInfoRaw = fs.readFileSync('/home/ubuntu/GENERIC_INFO_2D_READY.csv', 'utf8');
const genericInfo = parse(genericInfoRaw, { columns: true, skip_empty_lines: true });

// Map category names
function mapCategory(cat) {
  const catMap = {
    'Base Cabinet': 'Base',
    'Wall Cabinet': 'Wall',
    'Tall Cabinet': 'Tall',
    'ADA Cabinet': 'ADA',
    'Vanity Cabinet': 'Vanity',
    'Accessory': 'Accessory',
    'Trim': 'Accessory',
    'Accessory & Trim': 'Accessory',
    'Base': 'Base',
    'Wall': 'Wall',
    'Tall': 'Tall',
    'ADA': 'ADA',
    'Vanity': 'Vanity',
  };
  return catMap[cat] || cat;
}

function parseNum(val) {
  if (!val || val === '' || val === 'N/A') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseBool(val) {
  if (!val) return false;
  return val.toLowerCase() === 'yes' || val === '1' || val === 'true';
}

function parseIntVal(val) {
  if (!val || val === '') return null;
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

console.log(`Seeding ${genericInfo.length} cabinet items...`);
let cabinetCount = 0;
let skipped = 0;

for (const row of genericInfo) {
  const masterCode = row['Item Code'];
  if (!masterCode) { skipped++; continue; }

  const category = mapCategory(row['Category'] || '');
  const description = row['Description'] || '';
  if (!description) { skipped++; continue; }

  const isCorner = parseBool(row['Corner Cabinet']);
  const cornerType = row['Corner Type'] || null;
  const cornerSide = isCorner ? (cornerType?.toLowerCase().includes('right') ? 'right' : 'left') : null;

  // Map hinge side
  let hingeSide = row['Door Hinge Side'] || null;
  if (hingeSide) {
    const hs = hingeSide.toLowerCase();
    if (hs === 'left') hingeSide = 'left';
    else if (hs === 'right') hingeSide = 'right';
    else if (hs === 'both' || hs === 'reversible') hingeSide = 'both';
    else if (hs === 'none' || hs === '') hingeSide = 'none';
  }

  try {
    await conn.execute(
      `INSERT INTO cabinets (
        masterCode, description, descriptionSource, category, subCategory,
        width, height, depth, physicalWidth, weight,
        placementType, numberOfDoors, numberOfDrawers, hingeSide,
        doorSwingClearance, toeKickHeight, stackingAllowed,
        isCornerCabinet, cornerSide, fillerRequired,
        openingWidth, minPull, maxPull,
        graphicType,
        pkgLength, pkgWidth, pkgHeight,
        isActive
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?,
        ?, ?, ?,
        1
      )
      ON DUPLICATE KEY UPDATE description=VALUES(description), category=VALUES(category)`,
      [
        masterCode,
        description,
        row['Source'] || null,
        category,
        row['Sub Category'] || null,
        parseNum(row['Width']),
        parseNum(row['Height']),
        parseNum(row['Depth']),
        parseNum(row['Physical Width']),
        parseNum(row['Weight']),
        row['Placement Zone'] ? row['Placement Zone'].toLowerCase() : null,
        parseIntVal(row['Num Doors']) || 0,
        parseIntVal(row['Num Drawers']) || 0,
        hingeSide,
        parseNum(row['Door Swing Clearance (in)']),
        parseNum(row['Toe Kick Height']),
        parseBool(row['Stacking Allowed']),
        isCorner,
        cornerSide,
        parseBool(row['Filler Required']),
        parseNum(row['Opening Measurement']),
        parseNum(row['Minimum Pull']),
        parseNum(row['Maximum Pull']),
        row['2D Elevation Symbol'] || row['2D Symbol'] || null,
        parseNum(row['Package L']),
        parseNum(row['Package W']),
        parseNum(row['Package H']),
      ]
    );
    cabinetCount++;
  } catch (err) {
    console.error(`Error inserting ${masterCode}:`, err.message);
    skipped++;
  }
}
console.log(`✓ Seeded ${cabinetCount} cabinets (skipped ${skipped})`);

// ─── Done ──────────────────────────────────────────────────────────────────────

await conn.end();
console.log('\n✅ Seed complete!');
