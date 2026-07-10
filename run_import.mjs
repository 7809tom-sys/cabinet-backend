/**
 * Import all scraped USCD lines into the database.
 * Run from the cabinet-dealz directory: node run_import.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse the URL
const m = DB_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (!m) {
  console.error('Could not parse DATABASE_URL:', DB_URL.substring(0, 50));
  process.exit(1);
}
const [, user, password, host, port, database] = m;

console.log(`Connecting to ${host}:${port}/${database} as ${user}`);

const conn = await mysql.createConnection({
  host,
  port: parseInt(port),
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
});

console.log('Connected!');

// Load the scraped data
const allData = JSON.parse(readFileSync('/home/ubuntu/uscd_all_lines_scraped.json', 'utf8'));

// VERIFIED style ID mapping
const STYLE_IDS = {
  'shaker-white':              30046,
  'shaker-antique-white':      30043,
  'shaker-dove':               30044,
  'shaker-grey':               30045,
  'shaker-ivy':                30047,
  'shaker-navy':               30048,
  'shaker-black':              30049,
  'shaker-honey':              30050,
  'shaker-cinder':             30051,
  'shaker-essence-oak':        30061,
  'haven-dune':                30057,
  'haven-ember':               30060,
  'oxford-white':              30053,
  'oxford-sage':               30054,
  'oxford-mist':               30058,
  'oxford-toffee':             30059,
  'edgeline-white':            30052,
  'casselberry-antique-white': 30055,
  'casselberry-saddle':        30056,
  // torrance-white: null - skip, no door style record
};

const DISTRIBUTOR_ID = 1;

function parseFrac(s) {
  s = String(s).trim();
  if (s.includes('-') && s.includes('/')) {
    const [whole, frac] = s.split('-');
    const [num, den] = frac.split('/');
    return parseInt(whole) + parseInt(num) / parseInt(den);
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseDimensions(desc, sku) {
  let w = null, h = null, d = null;
  const m = (desc || '').match(/(\d+(?:-\d+\/\d+)?)"W\s*[xX×]\s*(\d+(?:-\d+\/\d+)?)"H\s*[xX×]\s*(\d+(?:-\d+\/\d+)?)"D/i);
  if (m) {
    w = parseFrac(m[1]);
    h = parseFrac(m[2]);
    d = parseFrac(m[3]);
  }
  if (w === null) {
    const skuClean = sku.replace(/^[A-Z]+-/, '').toUpperCase();
    const m2 = skuClean.match(/^[A-Z]+(\d+)/);
    if (m2) w = parseFloat(m2[1]);
  }
  return [w, h, d];
}

function inferCategory(sku, desc) {
  const dl = (desc || '').toLowerCase();
  const sb = sku.replace(/^[A-Z]+-/, '').toUpperCase();
  if (/base cabinet|drawer base|sink base|tray base|lazy susan base|corner base|blind corner base/.test(dl)) return 'Base';
  if (/wall cabinet|wall cab/.test(dl)) return 'Wall';
  if (/tall cabinet|pantry|oven cabinet|utility cabinet|utility tower/.test(dl)) return 'Tall';
  if (/vanity|bathroom/.test(dl)) return 'Vanity';
  if (/filler|panel|skin|scribe|moulding|molding|crown|light rail|valance|toe kick/.test(dl)) return 'Filler';
  if (/^(DB|SB|TB|BT|BC|LS|B)/.test(sb)) return 'Base';
  if (/^(WB|W|CW|BCW)/.test(sb)) return 'Wall';
  if (/^(P|OT|UT|U)/.test(sb)) return 'Tall';
  if (/^(VS|VB|VDB|V)/.test(sb)) return 'Vanity';
  if (/^(F|ACM|COV|LR|CR|TK|SCR)/.test(sb)) return 'Filler';
  return 'Accessory';
}

function inferSubcategory(sku, desc) {
  const dl = (desc || '').toLowerCase();
  const sb = sku.replace(/^[A-Z]+-/, '').toUpperCase();
  if (/drawer base/.test(dl) || /^DB/.test(sb)) return 'Drawer Base';
  if (/sink base/.test(dl) || /^SB/.test(sb)) return 'Sink Base';
  if (/tray base/.test(dl) || /^(BT|TB)/.test(sb)) return 'Tray Base';
  if (/full height/.test(dl) || /FH/.test(sb)) return 'Full Height Door Base';
  if (/lazy susan base/.test(dl) || /^LS/.test(sb)) return 'Lazy Susan Base';
  if (/blind corner base/.test(dl) || /BCB/.test(sb)) return 'Blind Corner Base';
  if (/corner base/.test(dl) || /^CB/.test(sb)) return 'Corner Base';
  if (/base cabinet/.test(dl)) return 'Standard Base';
  if (/corner wall/.test(dl) || /^CW/.test(sb)) return 'Corner Wall';
  if (/blind corner wall/.test(dl) || /BCW/.test(sb)) return 'Blind Corner Wall';
  if (/wall cabinet/.test(dl)) return 'Standard Wall';
  if (/pantry/.test(dl) || /^P/.test(sb)) return 'Pantry';
  if (/oven/.test(dl)) return 'Oven Tower';
  if (/utility/.test(dl)) return 'Utility Tower';
  if (/vanity drawer/.test(dl) || /^VDB/.test(sb)) return 'Vanity Drawer Base';
  if (/vanity/.test(dl)) return 'Vanity Base';
  if (/filler/.test(dl)) return 'Filler';
  if (/moulding|molding/.test(dl)) return 'Moulding';
  if (/panel|skin/.test(dl)) return 'Panel';
  return null;
}

function masterCode(sku) {
  return sku.replace(/^[A-Z]+-/, '').toUpperCase();
}

// Collect all unique cabinets and all SKUs
const cabinets = new Map(); // masterCode -> cabinet data
const skus = []; // all distributor_skus

for (const [slug, products] of Object.entries(allData)) {
  const styleId = STYLE_IDS[slug];
  if (!styleId) {
    console.log(`  SKIP ${slug}: no styleId`);
    continue;
  }
  
  for (const p of products) {
    const sku = p.sku;
    const price = parseFloat(p.price) || 0;
    const desc = p.description || '';
    const imageUrl = p.imageUrl || '';
    
    const mc = masterCode(sku);
    const category = inferCategory(sku, desc);
    const subcategory = inferSubcategory(sku, desc);
    const [w, h, d] = parseDimensions(desc, sku);
    
    if (!cabinets.has(mc)) {
      cabinets.set(mc, { mc, desc, category, subcategory, w, h, d, imageUrl });
    }
    
    const platformSku = `${mc}-${styleId}`;
    skus.push({ platformSku, sku, styleId, price, imageUrl });
  }
}

console.log(`\nPrepared ${cabinets.size} cabinet records`);
console.log(`Prepared ${skus.length} distributor_sku records`);

// Insert cabinets
let cabInserted = 0, cabSkipped = 0;
const cabList = [...cabinets.values()];
for (let i = 0; i < cabList.length; i += 50) {
  const batch = cabList.slice(i, i + 50);
  for (const c of batch) {
    try {
      await conn.execute(
        `INSERT IGNORE INTO cabinets 
         (masterCode, description, descriptionSource, category, subCategory, width, height, depth, catalogImageUrl)
         VALUES (?, ?, 'US Cabinet Depot', ?, ?, ?, ?, ?, ?)`,
        [c.mc, c.desc.substring(0, 500), c.category, c.subcategory, c.w, c.h, c.d, c.imageUrl]
      );
      cabInserted++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        cabSkipped++;
      } else {
        console.error(`  Cabinet error for ${c.mc}:`, e.message);
      }
    }
  }
  if ((i + 50) % 200 === 0 || i + 50 >= cabList.length) {
    process.stdout.write(`  Cabinets: ${Math.min(i+50, cabList.length)}/${cabList.length}\r`);
  }
}
console.log(`\nCabinets: ${cabInserted} inserted, ${cabSkipped} already existed`);

// Get cabinet ID map
const [cabRows] = await conn.query('SELECT id, masterCode FROM cabinets');
const cabIdMap = new Map(cabRows.map(r => [r.masterCode, r.id]));
console.log(`Cabinet ID map: ${cabIdMap.size} entries`);

// Insert distributor_skus
let skuInserted = 0, skuSkipped = 0, skuErrors = 0;
for (let i = 0; i < skus.length; i += 50) {
  const batch = skus.slice(i, i + 50);
  for (const s of batch) {
    const cabinetId = cabIdMap.get(s.platformSku.replace(/-\d+$/, ''));
    if (!cabinetId) {
      skuErrors++;
      continue;
    }
    try {
      await conn.execute(
        `INSERT IGNORE INTO distributor_skus 
         (platformSku, distributorSku, distributorId, styleId, cabinetId, listPrice, imageUrl)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.platformSku, s.sku, DISTRIBUTOR_ID, s.styleId, cabinetId, s.price, s.imageUrl]
      );
      skuInserted++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        skuSkipped++;
      } else {
        console.error(`  SKU error for ${s.platformSku}:`, e.message);
        skuErrors++;
      }
    }
  }
  if ((i + 50) % 500 === 0 || i + 50 >= skus.length) {
    process.stdout.write(`  SKUs: ${Math.min(i+50, skus.length)}/${skus.length}\r`);
  }
}
console.log(`\nDistributor SKUs: ${skuInserted} inserted, ${skuSkipped} already existed, ${skuErrors} errors`);

// Final count
const [[{ total_cabs }]] = await conn.query('SELECT COUNT(*) as total_cabs FROM cabinets');
const [[{ total_skus }]] = await conn.query('SELECT COUNT(*) as total_skus FROM distributor_skus');
console.log(`\nDatabase totals: ${total_cabs} cabinets, ${total_skus} distributor_skus`);

await conn.end();
console.log('Done!');
