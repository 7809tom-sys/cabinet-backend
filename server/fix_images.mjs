import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);

// Mapping: masterCode -> catalogImageUrl to assign
// Logic: map each Designer Natural / missing code to the closest equivalent image
const updates = [
  // Full Height Base Cabinets (FHB* -> BFH-* images)
  ['FHB12', '/manus-storage/bfh12_l_b45a9c62.jpg'],
  ['FHB15', '/manus-storage/bfh15_l_6f4f6c29.jpg'],
  ['FHB21', '/manus-storage/bfh21_l_aafcc52f.jpg'],
  ['FHB27', '/manus-storage/bfh27_4c698683.jpg'],
  ['FHB33', '/manus-storage/bfh33_316e7801.jpg'],
  ['FHB39', '/manus-storage/bfh36_3445daf4.jpg'],
  ['FHB42', '/manus-storage/bfh36_3445daf4.jpg'],
  ['FHB48', '/manus-storage/bfh36_3445daf4.jpg'],

  // Tray Base
  ['TB-09', '/manus-storage/bt09_l_5b3286f4.jpg'],
  ['TB09',  '/manus-storage/bt09_l_5b3286f4.jpg'],

  // Lazy Susan Corner Base
  ['LS-33-12', '/manus-storage/bbc36_l_18f1f391.jpg'],
  ['LS-36-12', '/manus-storage/bbc36_l_18f1f391.jpg'],

  // Diagonal Corner Sink Base
  ['DCSB-36', '/manus-storage/catalog-images/1782758031695_1000002006_2ded7c21.jpg'],

  // Wall cabinets - standard sizes missing
  ['W-39-36', '/manus-storage/w3636_l_7a4e3b2d.jpg'],
  ['W-39-42', '/manus-storage/w3642_l_7a4e3b2d.jpg'],
  ['W-42-30', '/manus-storage/w3630_l_7a4e3b2d.jpg'],
  ['W-42-36', '/manus-storage/w3636_l_7a4e3b2d.jpg'],
  ['W-42-42', '/manus-storage/w3642_l_7a4e3b2d.jpg'],

  // Diagonal Corner Wall
  ['WDC-24-30', '/manus-storage/wdc2430_l_7a4e3b2d.jpg'],
  ['WDC-24-36', '/manus-storage/wdc2436_l_7a4e3b2d.jpg'],
  ['WDC-24-42', '/manus-storage/wdc2442_l_7a4e3b2d.jpg'],

  // Split Pantry Top Wall
  ['W364224', '/manus-storage/w3636_l_7a4e3b2d.jpg'],

  // Designer Natural Wall Cabinets - map to standard W-* images
  ['W1212PG', '/manus-storage/w1230_l_7a4e3b2d.jpg'],
  ['W1218',   '/manus-storage/w1230_l_7a4e3b2d.jpg'],
  ['W1512PG', '/manus-storage/w1530_l_7a4e3b2d.jpg'],
  ['W1518',   '/manus-storage/w1530_l_7a4e3b2d.jpg'],
  ['W1812PG', '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['W1818',   '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['W183024', '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['W183624', '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['W184224', '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['W2112PG', '/manus-storage/w2130_l_7a4e3b2d.jpg'],
  ['W2412PG', '/manus-storage/w2430_l_7a4e3b2d.jpg'],
  ['W2712PG', '/manus-storage/w2730_l_7a4e3b2d.jpg'],
  ['W3012PG', '/manus-storage/w3030_l_7a4e3b2d.jpg'],
  ['W3021',   '/manus-storage/w3030_l_7a4e3b2d.jpg'],
  ['W3312PG', '/manus-storage/w3330_l_7a4e3b2d.jpg'],
  ['W3321',   '/manus-storage/w3330_l_7a4e3b2d.jpg'],
  ['W3612PG', '/manus-storage/w3630_l_7a4e3b2d.jpg'],
  ['W3621',   '/manus-storage/w3630_l_7a4e3b2d.jpg'],
  ['WOC3312PG', '/manus-storage/w3330_l_7a4e3b2d.jpg'],
  ['WDC2412PG', '/manus-storage/wdc2430_l_7a4e3b2d.jpg'],
  ['WDC42PG',   '/manus-storage/wdc2442_l_7a4e3b2d.jpg'],
  ['W3DR18',  '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['W3DR24',  '/manus-storage/w2430_l_7a4e3b2d.jpg'],
  ['WCA1230', '/manus-storage/wca2430_l_7a4e3b2d.jpg'],
  ['WCA1236', '/manus-storage/wca2430_l_7a4e3b2d.jpg'],
  ['WCA1242', '/manus-storage/wca2430_l_7a4e3b2d.jpg'],

  // Wall Refrigerator Cabinets
  ['WR3315', '/manus-storage/wr3315_l_7a4e3b2d.jpg'],
  ['WR3324', '/manus-storage/wr3324_l_7a4e3b2d.jpg'],
  ['WR3612', '/manus-storage/wr3612_l_7a4e3b2d.jpg'],
  ['WR3615', '/manus-storage/wr3615_l_7a4e3b2d.jpg'],
  ['WR3618', '/manus-storage/wr3618_l_7a4e3b2d.jpg'],
  ['WR3621', '/manus-storage/wr3621_l_7a4e3b2d.jpg'],
  ['WR3624', '/manus-storage/wr3624_l_7a4e3b2d.jpg'],

  // Vanity cabinets -> use existing V-* images
  ['V2121',   '/manus-storage/vs24_01dc5f3e.jpg'],
  ['V2421',   '/manus-storage/vs24_01dc5f3e.jpg'],
  ['V2421DL', '/manus-storage/vs24_01dc5f3e.jpg'],
  ['V2421DR', '/manus-storage/vs24_01dc5f3e.jpg'],
  ['V2721',   '/manus-storage/vs27_1d5de9a6.jpg'],
  ['V3021',   '/manus-storage/vs30_55b53d31.jpg'],
  ['V3621',   '/manus-storage/vs36_91e539ab.jpg'],
  ['V4221DL', '/manus-storage/vsd42_2497077a.jpg'],
  ['V4221DR', '/manus-storage/vsd42_2497077a.jpg'],
  ['V4821DD', '/manus-storage/vsd48_81a4716d.jpg'],
  ['V6021DD', '/manus-storage/vsd48_81a4716d.jpg'],
  ['VSDB60',  '/manus-storage/vsd48_81a4716d.jpg'],

  // Appliance Garage
  ['AG2418', '/manus-storage/b24_e593ca0e.jpg'],

  // Base Fillers
  ['BF6', '/manus-storage/bf3_8ac29d9d.jpg'],

  // Base Microwave Cabinet
  ['BMC30', '/manus-storage/BMC-27-lineart-clean_99a2b233.png'],

  // Base Spice
  ['BSD6',  '/manus-storage/bsdc6_87c0ccf9.jpg'],
  ['BSR12', '/manus-storage/catalog-images/1783368903450_21-century-bsr12__85401_41a72424.jpg'],
  ['BSR9',  '/manus-storage/catalog-images/1783368918896_21-century-bsr12__85401_b460642f.jpg'],

  // Corbels
  ['CBLPN2', '/manus-storage/bf3_8ac29d9d.jpg'],
  ['CBLPN3', '/manus-storage/bf3_8ac29d9d.jpg'],

  // Display Doors
  ['DD', '/manus-storage/w1230_l_7a4e3b2d.jpg'],

  // Decorative Moulding / Base Moulding
  ['DEC004', '/manus-storage/bam_05d37ff7.jpg'],

  // Decorative End Panels
  ['DP1230', '/manus-storage/bdep_l_05c411a8.jpg'],
  ['DP1236', '/manus-storage/bdep_l_05c411a8.jpg'],
  ['DP1242', '/manus-storage/bdep_l_05c411a8.jpg'],
  ['DP2430', '/manus-storage/bdep_l_05c411a8.jpg'],

  // Floating Shelves
  ['FFS24', '/manus-storage/b24_e593ca0e.jpg'],
  ['FFS30', '/manus-storage/b30_c0ce43e2.jpg'],
  ['FFS36', '/manus-storage/b36_3b35748a.jpg'],
  ['FFS42', '/manus-storage/b42_e25e5bc6.jpg'],

  // Island Panels
  ['IS3696', '/manus-storage/bdep_l_05c411a8.jpg'],

  // Crown Moulding
  ['LCM8', '/manus-storage/acm8_81023e8f.jpg'],
  ['LVC',  '/manus-storage/acm8_81023e8f.jpg'],
  ['SHM8', '/manus-storage/acm8_81023e8f.jpg'],

  // Lattice Wine Rack
  ['LWR3015', '/manus-storage/bsv_9b9d19c7.jpg'],

  // Mullion Doors
  ['MD1530', '/manus-storage/w1530_l_7a4e3b2d.jpg'],
  ['MD1536', '/manus-storage/w1530_l_7a4e3b2d.jpg'],
  ['MD1542', '/manus-storage/w1530_l_7a4e3b2d.jpg'],
  ['MD1830', '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['MD1836', '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['MD1842', '/manus-storage/w1830_l_7a4e3b2d.jpg'],
  ['MD2130', '/manus-storage/w2130_l_7a4e3b2d.jpg'],
  ['MD2136', '/manus-storage/w2130_l_7a4e3b2d.jpg'],
  ['MD2142', '/manus-storage/w2130_l_7a4e3b2d.jpg'],
  ['MD2430', '/manus-storage/w2430_l_7a4e3b2d.jpg'],
  ['MD2436', '/manus-storage/w2430_l_7a4e3b2d.jpg'],
  ['MD2442', '/manus-storage/w2430_l_7a4e3b2d.jpg'],
  ['MD3030', '/manus-storage/w3030_l_7a4e3b2d.jpg'],
  ['MD3036', '/manus-storage/w3030_l_7a4e3b2d.jpg'],
  ['MD3042', '/manus-storage/w3030_l_7a4e3b2d.jpg'],

  // Microwave Wall Cabinet
  ['MWC2430', '/manus-storage/w2430_l_7a4e3b2d.jpg'],

  // Plate Rack
  ['PR2430', '/manus-storage/w2430_l_7a4e3b2d.jpg'],

  // Pot & Pan Drawers
  ['PPD24', '/manus-storage/b24_e593ca0e.jpg'],
  ['PPD30', '/manus-storage/b30_c0ce43e2.jpg'],
  ['PPD36', '/manus-storage/b36_3b35748a.jpg'],

  // Roll-out Shelf Holders
  ['RSH', '/manus-storage/b24_e593ca0e.jpg'],

  // Stained Plywood
  ['SPW', '/manus-storage/bdep_l_05c411a8.jpg'],

  // Tall Fillers
  ['TF396',  '/manus-storage/bf3_8ac29d9d.jpg'],
  ['TF696',  '/manus-storage/bf3_8ac29d9d.jpg'],
  ['TFF396', '/manus-storage/trim-bff-fluted-base-filler_18cbc176.png'],

  // Toilet Topper
  ['TT2436', '/manus-storage/b24_e593ca0e.jpg'],

  // Under Counter / Split Pantry Bottom
  ['UCB1854', '/manus-storage/bfh18_l_6674f97b.jpg'],
  ['UCD30',   '/manus-storage/b30_c0ce43e2.jpg'],
  ['UCD36',   '/manus-storage/b36_3b35748a.jpg'],

  // Wall Skins
  ['WS1542', '/manus-storage/bdep_l_05c411a8.jpg'],

  // Wall Fillers
  ['WF342',  '/manus-storage/bf3_8ac29d9d.jpg'],
  ['WF396',  '/manus-storage/bf3_8ac29d9d.jpg'],
  ['WF642',  '/manus-storage/bf3_8ac29d9d.jpg'],
  ['WF696',  '/manus-storage/bf3_8ac29d9d.jpg'],
  ['WFF396', '/manus-storage/trim-bff-fluted-base-filler_18cbc176.png'],
  ['WFF642', '/manus-storage/trim-bff-fluted-base-filler_18cbc176.png'],

  // Wine Storage Cubes
  ['WSC1515', '/manus-storage/bsv_9b9d19c7.jpg'],
  ['WSC1818', '/manus-storage/bsv_9b9d19c7.jpg'],
  ['WSC30',   '/manus-storage/bsv_9b9d19c7.jpg'],
];

// First, look up what images actually exist for the standard W-* wall cabinets
// so we can use real URLs instead of guessed ones
const [wallRows] = await c.query(`
  SELECT masterCode, catalogImageUrl FROM cabinets 
  WHERE masterCode REGEXP '^W-[0-9]' AND catalogImageUrl IS NOT NULL AND catalogImageUrl != ''
  ORDER BY masterCode
`);
const wallImages = new Map(wallRows.map(r => [r.masterCode, r.catalogImageUrl]));
console.log('Wall images found:', wallImages.size);
for (const [k, v] of wallImages) console.log(`  ${k} -> ${v}`);

// Build a helper to find the best wall image for a given width
function bestWallImage(width, height) {
  // Try exact match first, then closest width
  const candidates = [...wallImages.entries()].filter(([k]) => {
    const m = k.match(/^W-(\d+)-(\d+)/);
    return m && parseInt(m[1]) === width;
  });
  if (candidates.length > 0) {
    // Pick closest height
    const sorted = candidates.sort((a, b) => {
      const ha = parseInt(a[0].match(/W-\d+-(\d+)/)?.[1] ?? '30');
      const hb = parseInt(b[0].match(/W-\d+-(\d+)/)?.[1] ?? '30');
      return Math.abs(ha - height) - Math.abs(hb - height);
    });
    return sorted[0][1];
  }
  // Fall back to closest width
  const all = [...wallImages.entries()].filter(([k]) => k.match(/^W-\d+-\d+$/));
  if (all.length === 0) return null;
  const sorted = all.sort((a, b) => {
    const wa = parseInt(a[0].match(/W-(\d+)/)?.[1] ?? '30');
    const wb = parseInt(b[0].match(/W-(\d+)/)?.[1] ?? '30');
    return Math.abs(wa - width) - Math.abs(wb - width);
  });
  return sorted[0][1];
}

// Also look up WDC and WR images
const [wdcRows] = await c.query(`SELECT masterCode, catalogImageUrl FROM cabinets WHERE masterCode LIKE 'WDC-%' AND catalogImageUrl IS NOT NULL LIMIT 5`);
const [wrRows] = await c.query(`SELECT masterCode, catalogImageUrl FROM cabinets WHERE masterCode LIKE 'W-%-24' AND catalogImageUrl IS NOT NULL LIMIT 5`);
console.log('WDC images:', wdcRows.map(r => `${r.masterCode}=${r.catalogImageUrl}`));
console.log('WR images:', wrRows.map(r => `${r.masterCode}=${r.catalogImageUrl}`));

// Now fix the wall cabinet mappings using real URLs
const wallFixups = [
  // W*PG stacker wall -> use matching W-width-30 image
  ['W1212PG', bestWallImage(12, 30)],
  ['W1218',   bestWallImage(12, 30)],
  ['W1512PG', bestWallImage(15, 30)],
  ['W1518',   bestWallImage(15, 30)],
  ['W1812PG', bestWallImage(18, 30)],
  ['W1818',   bestWallImage(18, 30)],
  ['W183024', bestWallImage(18, 30)],
  ['W183624', bestWallImage(18, 36)],
  ['W184224', bestWallImage(18, 42)],
  ['W2112PG', bestWallImage(21, 30)],
  ['W2412PG', bestWallImage(24, 30)],
  ['W2712PG', bestWallImage(27, 30)],
  ['W3012PG', bestWallImage(30, 30)],
  ['W3021',   bestWallImage(30, 30)],
  ['W3312PG', bestWallImage(33, 30)],
  ['W3321',   bestWallImage(33, 30)],
  ['W3612PG', bestWallImage(36, 30)],
  ['W3621',   bestWallImage(36, 30)],
  ['WOC3312PG', bestWallImage(33, 30)],
  ['W3DR18',  bestWallImage(18, 30)],
  ['W3DR24',  bestWallImage(24, 30)],
  ['W-39-36', bestWallImage(36, 36)],
  ['W-39-42', bestWallImage(36, 42)],
  ['W-42-30', bestWallImage(36, 30)],
  ['W-42-36', bestWallImage(36, 36)],
  ['W-42-42', bestWallImage(36, 42)],
  ['W364224', bestWallImage(36, 42)],
  ['MD1530', bestWallImage(15, 30)],
  ['MD1536', bestWallImage(15, 36)],
  ['MD1542', bestWallImage(15, 42)],
  ['MD1830', bestWallImage(18, 30)],
  ['MD1836', bestWallImage(18, 36)],
  ['MD1842', bestWallImage(18, 42)],
  ['MD2130', bestWallImage(21, 30)],
  ['MD2136', bestWallImage(21, 36)],
  ['MD2142', bestWallImage(21, 42)],
  ['MD2430', bestWallImage(24, 30)],
  ['MD2436', bestWallImage(24, 36)],
  ['MD2442', bestWallImage(24, 42)],
  ['MD3030', bestWallImage(30, 30)],
  ['MD3036', bestWallImage(30, 36)],
  ['MD3042', bestWallImage(30, 42)],
  ['WR3315', bestWallImage(33, 30)],
  ['WR3324', bestWallImage(33, 30)],
  ['WR3612', bestWallImage(36, 30)],
  ['WR3615', bestWallImage(36, 30)],
  ['WR3618', bestWallImage(36, 30)],
  ['WR3621', bestWallImage(36, 30)],
  ['WR3624', bestWallImage(36, 30)],
  ['WCA1230', bestWallImage(24, 30)],
  ['WCA1236', bestWallImage(24, 36)],
  ['WCA1242', bestWallImage(24, 42)],
  ['DD', bestWallImage(15, 30)],
  ['MWC2430', bestWallImage(24, 30)],
  ['PR2430', bestWallImage(24, 30)],
  ['W3021', bestWallImage(30, 30)],
  ['WSC30', bestWallImage(12, 30)],
];

// Merge: wall fixups override the placeholder URLs in main updates
const allUpdates = new Map(updates);
for (const [code, url] of wallFixups) {
  if (url) allUpdates.set(code, url);
}

// Look up WDC image
const wdcImg = wdcRows[0]?.catalogImageUrl ?? null;
if (wdcImg) {
  allUpdates.set('WDC-24-30', wdcImg);
  allUpdates.set('WDC-24-36', wdcImg);
  allUpdates.set('WDC-24-42', wdcImg);
  allUpdates.set('WDC2412PG', wdcImg);
  allUpdates.set('WDC42PG', wdcImg);
}

console.log(`\nApplying ${allUpdates.size} image updates...`);
let updated = 0;
let skipped = 0;
for (const [code, url] of allUpdates) {
  if (!url) { console.log(`  SKIP ${code} (no image found)`); skipped++; continue; }
  const [result] = await c.execute(
    'UPDATE cabinets SET catalogImageUrl = ? WHERE masterCode = ? AND (catalogImageUrl IS NULL OR catalogImageUrl = "")',
    [url, code]
  );
  if (result.affectedRows > 0) {
    console.log(`  ✓ ${code} -> ${url.substring(0, 50)}`);
    updated++;
  } else {
    // Check if it already has an image
    const [[row]] = await c.execute('SELECT catalogImageUrl FROM cabinets WHERE masterCode = ?', [code]);
    if (row?.catalogImageUrl) {
      console.log(`  ~ ${code} already has image (skipped)`);
    } else {
      console.log(`  ? ${code} not found in DB`);
    }
    skipped++;
  }
}
console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
await c.end();
