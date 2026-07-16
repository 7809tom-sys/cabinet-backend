/**
 * Update all 21 Madison (US Cabinet Depot) door styles with Capital Collection build specs.
 * Source: US Cabinet Depot "Framed Capital Collection" product page
 */
import mysql from 'mysql2/promise';

const DIST_ID = 1; // Madison / US Cabinet Depot

// Capital Collection shared specs (all 21 styles share these)
const SHARED_SPECS = {
  boxConstruction: '1/2" Plywood Box with Matching UV Coated Exterior',
  drawerConstruction: '3/4" Dovetail Drawer Box with Undermount Full Extension Soft Close Glides',
  hardware: 'Concealed 6-Way Adjustable Hinges with Soft Close Feature',
  overlayType: 'Full Overlay',
  doorPanelType: 'Five Piece Door Construction',
};

// Per-style specs: [styleCode, doorStyle, woodSpecies, finish, color, series]
const STYLES = [
  // Shaker Series
  ['SW',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'White',              'Shaker Series'],
  ['SA',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Antique White',      'Shaker Series'],
  ['SD',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Dove / Off-White',   'Shaker Series'],
  ['SG',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Grey',               'Shaker Series'],
  ['SI',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Ivy Green',          'Shaker Series'],
  ['SN',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Navy Blue',          'Shaker Series'],
  ['SB',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Black',              'Shaker Series'],
  ['SH',  'Shaker Style', 'Solid Maple/Birch', 'Stained',  'Honey',              'Shaker Series'],
  ['SC',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Cinder / Dark Grey', 'Shaker Series'],
  ['SEO', 'Shaker Style', 'Oak',               'Stained',  'Natural Oak',        'Shaker Series'],
  ['SU',  'Shaker Style', 'Solid Maple/Birch', 'Unfinished','Natural Unfinished', 'Shaker Series'],
  // Oxford Series
  ['OW',  'Raised Panel', 'Solid Maple/Birch', 'Painted',  'White',              'Oxford Series'],
  ['OC',  'Raised Panel', 'Solid Maple/Birch', 'Painted',  'Cashmere / Warm White', 'Oxford Series'],
  ['OS',  'Raised Panel', 'Solid Maple/Birch', 'Painted',  'Sage Green',         'Oxford Series'],
  ['OT',  'Raised Panel', 'Solid Maple/Birch', 'Stained',  'Toffee / Warm Brown','Oxford Series'],
  ['OM',  'Raised Panel', 'Solid Maple/Birch', 'Painted',  'Mist / Light Grey',  'Oxford Series'],
  // Haven Series
  ['HD',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Dune / Ivory',       'Haven Series'],
  ['HE',  'Shaker Style', 'Solid Maple/Birch', 'Painted',  'Ember / Warm Mocha', 'Haven Series'],
  // Edgeline Series
  ['EW',  'Slab / Flat Panel', 'Solid Maple/Birch', 'Painted', 'White',          'Edgeline Series'],
  // Casselberry Series
  ['CW',  'Raised Panel', 'Solid Maple/Birch', 'Painted',  'Antique White',      'Casselberry Series'],
  ['CS',  'Raised Panel', 'Solid Maple/Birch', 'Stained',  'Saddle / Walnut Brown', 'Casselberry Series'],
];

async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  let updated = 0;
  let notFound = [];

  for (const [code, doorStyle, woodSpecies, finish, color, series] of STYLES) {
    const [rows] = await db.query(
      'SELECT id, ourName FROM door_styles WHERE distributorId = ? AND styleCode = ?',
      [DIST_ID, code]
    );
    if (!rows.length) {
      notFound.push(code);
      continue;
    }
    const style = rows[0];
    await db.query(
      `UPDATE door_styles SET
        doorStyle = ?,
        woodSpecies = ?,
        finish = ?,
        color = ?,
        boxConstruction = ?,
        drawerConstruction = ?,
        hardware = ?,
        overlayType = ?,
        doorPanelType = ?
      WHERE id = ?`,
      [
        doorStyle, woodSpecies, finish, color,
        SHARED_SPECS.boxConstruction,
        SHARED_SPECS.drawerConstruction,
        SHARED_SPECS.hardware,
        SHARED_SPECS.overlayType,
        SHARED_SPECS.doorPanelType,
        style.id
      ]
    );
    console.log(`  ✅ ${code.padEnd(5)} ${style.ourName.padEnd(30)} | ${series} | ${doorStyle} | ${finish} | ${color}`);
    updated++;
  }

  if (notFound.length) {
    console.log(`\n⚠️  Not found: ${notFound.join(', ')}`);
  }

  console.log(`\nUpdated ${updated} / ${STYLES.length} Madison door styles`);

  // Verify
  const [verify] = await db.query(
    `SELECT styleCode, ourName, doorStyle, woodSpecies, finish, color
     FROM door_styles WHERE distributorId = ? AND isActive = 1
     ORDER BY styleCode`,
    [DIST_ID]
  );
  console.log('\nVerification:');
  for (const r of verify) {
    console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(30)} | ${r.doorStyle || '—'} | ${r.finish || '—'} | ${r.color || '—'}`);
  }

  await db.end();
}

run().catch(console.error);
