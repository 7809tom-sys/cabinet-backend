import { createConnection } from 'mysql2/promise';
const url = process.env.DATABASE_URL;

// StoneCreek sink series names based on model codes
// PL-100 through PL-350 = undermount/drop-in kitchen sinks (Fireclay/composite)
// PL-3xxx = farmhouse/apron-front sinks
// PL-16xx, PL-36xx = bathroom/vanity sinks
// PL-6xx, PL-7xx, PL-8xx, PL-9xx = specialty/bar sinks

const SERIES_MAP = {
  'PL-100': 'Cascade',      // 16" round bar/prep sink
  'PL-125': 'Ridgeline',    // 18" single bowl
  'PL-150': 'Summit',       // 21" single bowl
  'PL-175': 'Horizon',      // 23" single bowl
  'PL-200': 'Crestview',    // 25" single bowl
  'PL-300': 'Broadstone',   // 30" single bowl
  'PL-350': 'Keystone',     // 33" double bowl
  'PL-30':  'Onyx',         // 16" bar sink
  // Farmhouse/apron front
  'PL-3001': 'Farmhouse Classic',
  'PL-3002': 'Farmhouse Classic',
  'PL-3014': 'Farmhouse Classic',
  'PL-3033': 'Farmhouse Heritage',
  'PL-3044': 'Farmhouse Heritage',
  'PL-3053': 'Farmhouse Heritage',
  'PL-3059': 'Farmhouse Artisan',
  'PL-3060': 'Farmhouse Artisan',
  'PL-3064': 'Farmhouse Artisan',
  'PL-3072': 'Farmhouse Artisan',
  'PL-3079': 'Farmhouse Artisan',
  'PL-3081': 'Farmhouse Artisan',
  'PL-3082': 'Farmhouse Artisan',
  'PL-3086': 'Farmhouse Artisan',
  'PL-3088': 'Farmhouse Reserve',
  'PL-3099': 'Farmhouse Reserve',
  // Bathroom/vanity
  'PL-1606': 'Vessel Porcelain',
  'PL-1634': 'Vessel Porcelain',
  'PL-1637': 'Vessel Porcelain',
  'PL-1646': 'Vessel Porcelain',
  'PL-1647': 'Vessel Porcelain',
  'PL-3608': 'Vanity Basin',
  'PL-3611': 'Vanity Basin',
  'PL-3639': 'Vanity Basin',
  'PL-1011': 'Drain Assembly',
  'PL-7201': 'Drain Assembly',
  // Bar/prep sinks
  'PL-609':  'Prep Bar',
  'PL-618':  'Prep Bar',
  'PL-624':  'Prep Bar',
  'PL-645':  'Prep Bar',
  'PL-661':  'Prep Bar',
  'PL-697':  'Prep Bar',
  'PL-5053': 'Prep Bar',
  'PL-8167': 'Prep Bar',
  'PL-8369': 'Prep Bar',
  'PL-968':  'Prep Bar',
};

// Color/finish mapping
function getColorLabel(name) {
  if (name.includes('Alpina')) return 'White';
  if (name.includes('Chroma')) return 'Stainless';
  if (name.includes('Concrete')) return 'Concrete Gray';
  if (name.includes('Gunmetal')) return 'Gunmetal';
  if (name.includes('Mocha')) return 'Mocha Brown';
  if (name.includes('Onyx')) return 'Matte Black';
  if (name.includes('Sand')) return 'Sand';
  if (name.includes('Bone')) return 'Bone White';
  if (name.includes('White')) return 'White';
  if (name.includes('Matte Black')) return 'Matte Black';
  if (name.includes('BN')) return 'Brushed Nickel';
  if (name.includes('18g')) return '18-Gauge Stainless';
  if (name.includes('Spread 4')) return '4" Spread';
  if (name.includes('Spread 8')) return '8" Spread';
  return null;
}

// Size/type descriptions for each model
const MODEL_DESC = {
  'PL-100': '16" Round Bar Sink',
  'PL-125': '18" Single Bowl Undermount',
  'PL-150': '21" Single Bowl Undermount',
  'PL-175': '23" Single Bowl Undermount',
  'PL-200': '25" Single Bowl Undermount',
  'PL-300': '30" Single Bowl Undermount',
  'PL-350': '33" Double Bowl Undermount',
  'PL-30':  '16" Bar Sink',
  'PL-3001': '30" Farmhouse Apron-Front Single Bowl',
  'PL-3002': '33" Farmhouse Apron-Front Single Bowl',
  'PL-3014': '36" Farmhouse Apron-Front Single Bowl',
  'PL-3033': '27" Farmhouse Apron-Front Single Bowl',
  'PL-3044': '30" Farmhouse Apron-Front Single Bowl',
  'PL-3053': '33" Farmhouse Apron-Front Single Bowl',
  'PL-3059': '30" Farmhouse Apron-Front Double Bowl',
  'PL-3060': '33" Farmhouse Apron-Front Double Bowl',
  'PL-3064': '27" Farmhouse Apron-Front Single Bowl',
  'PL-3072': '30" Farmhouse Apron-Front Single Bowl',
  'PL-3079': '33" Farmhouse Apron-Front Single Bowl',
  'PL-3081': '36" Farmhouse Apron-Front Single Bowl',
  'PL-3082': '30" Farmhouse Apron-Front Single Bowl',
  'PL-3086': '33" Farmhouse Apron-Front Single Bowl',
  'PL-3088': '30" Farmhouse Apron-Front Single Bowl',
  'PL-3099': '33" Farmhouse Apron-Front Single Bowl',
  'PL-1606': '16" Round Vessel Sink',
  'PL-1634': '18" Oval Vessel Sink',
  'PL-1637': '20" Rectangular Vessel Sink',
  'PL-1646': '22" Oval Vessel Sink',
  'PL-1647': '24" Rectangular Vessel Sink',
  'PL-3608': '18" Undermount Vanity Sink',
  'PL-3611': '20" Undermount Vanity Sink',
  'PL-3639': '22" Undermount Vanity Sink',
  'PL-1011': 'Basket Strainer Drain',
  'PL-7201': 'Pop-Up Drain Assembly',
  'PL-609':  '9" Square Bar Sink',
  'PL-618':  '12" Square Bar Sink',
  'PL-624':  '15" Square Bar Sink',
  'PL-645':  '18" Square Bar Sink',
  'PL-661':  '21" Square Bar Sink',
  'PL-697':  '24" Square Bar Sink',
  'PL-5053': '15" Round Bar Sink',
  'PL-8167': '16" Stainless Bar Sink',
  'PL-8369': '18" Stainless Bar Sink',
  'PL-968':  '18" Single Bowl Stainless',
};

async function main() {
  const conn = await createConnection(url);
  
  const [rows] = await conn.execute(
    'SELECT id, name FROM pelican_products WHERE subCategory = "Sinks" AND listPrice > 0 ORDER BY name'
  );
  
  let updated = 0;
  let skipped = 0;
  
  for (const row of rows) {
    const m = row.name.match(/^(PL-\d+)/);
    if (!m) { skipped++; continue; }
    
    const modelCode = m[1];
    const series = SERIES_MAP[modelCode];
    if (!series) { skipped++; continue; }
    
    const sizeDesc = MODEL_DESC[modelCode] || '';
    const colorLabel = getColorLabel(row.name);
    
    // Build new name: StoneCreek [Series] [Size] [Color]
    let newName = `StoneCreek ${series} ${sizeDesc}`;
    if (colorLabel) newName += ` — ${colorLabel}`;
    
    // Build description
    const desc = `${sizeDesc}. Fireclay construction with premium glaze finish. ${colorLabel ? colorLabel + ' color.' : ''} Easy-clean surface, chip and scratch resistant. Compatible with standard undermount installation.`;
    
    await conn.execute(
      'UPDATE pelican_products SET name = ?, description = ? WHERE id = ?',
      [newName, desc, row.id]
    );
    updated++;
  }
  
  console.log(`Updated: ${updated}, Skipped: ${skipped}`);
  
  // Verify
  const [check] = await conn.execute(
    'SELECT COUNT(*) as cnt FROM pelican_products WHERE subCategory = "Sinks" AND name LIKE "StoneCreek%"'
  );
  console.log('Now branded:', check[0].cnt);
  
  await conn.end();
}

main().catch(console.error);
