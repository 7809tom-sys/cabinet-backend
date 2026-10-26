/**
 * Update door_styles build specs and descriptions for all 13 Ashford (Clark & Son) styles.
 * Data sourced directly from the specification blocks at the top of each pasted product page.
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Authoritative specs per style code, extracted from the pasted product pages
const specs = {
  ASP: {
    distributorName: 'Aspen White',
    doorStyle: 'Flat Panel w/ Decorative Edge',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'White',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: 'Flat Panel',
    description: 'Aspen White features a flat panel door with a decorative edge profile in a bright white painted finish. Solid maple/birch construction with full overlay, 1/2" plywood box, and dovetail drawer boxes.',
  },
  CC: {
    distributorName: 'Classic Cream',
    doorStyle: 'Flat Panel w/ Decorative Edge',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Cream',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: 'Flat Panel',
    description: 'Classic Cream offers a warm cream painted finish with a flat panel decorative edge door. Solid maple/birch with full overlay, plywood box construction, and dovetail drawer boxes.',
  },
  CS: {
    distributorName: 'Carmel Shaker',
    doorStyle: 'Shaker Style',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Caramel/Tan',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: '5-Piece Shaker',
    description: 'Carmel Shaker brings a warm caramel tone to the classic 5-piece shaker profile. Solid maple/birch, full overlay, plywood box, and dovetail drawer boxes with undermount soft-close glides.',
  },
  DN: {
    distributorName: 'Designer Natural',
    doorStyle: 'Flat Panel w/ Decorative Edge',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Stained',
    color: 'Natural Maple',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: 'Flat Panel',
    description: 'Designer Natural showcases the natural beauty of maple with a clear stain finish and flat panel decorative edge door. Full overlay, plywood box, and dovetail drawer construction.',
  },
  FS: {
    distributorName: 'Fresh Sage',
    doorStyle: 'Flat Panel w/ Decorative Edge',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Sage Green',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: 'Flat Panel',
    description: 'Fresh Sage delivers a calming sage green painted finish with a flat panel decorative edge door. Solid maple/birch, full overlay, plywood box, and dovetail drawer boxes.',
  },
  GV: {
    distributorName: 'Greek Villa',
    doorStyle: 'Flat Panel w/ Decorative Edge',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Off-White / Warm White',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: 'Flat Panel',
    description: 'Greek Villa features a warm off-white painted finish inspired by Mediterranean architecture. Flat panel decorative edge door, solid maple/birch, full overlay, and dovetail drawer construction.',
  },
  HS: {
    distributorName: 'Hickory Shaker',
    doorStyle: 'Shaker Style',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Stained',
    color: 'Hickory Brown',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: '5-Piece Shaker',
    description: 'Hickory Shaker combines the warmth of a hickory stain with the clean lines of a 5-piece shaker door. Solid maple/birch construction, full overlay, 1/2" plywood box, and dovetail drawer boxes.',
  },
  MBS: {
    distributorName: 'Midnight Black Shaker',
    doorStyle: 'Shaker Style (Engineered HDF Construction)',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Matte Black',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: '5-Piece Shaker (HDF)',
    description: 'Midnight Black Shaker delivers a bold matte black finish on a 5-piece shaker door with engineered HDF construction. Color-matched exterior, solid maple/birch box, full overlay, and dovetail drawer boxes.',
  },
  NG: {
    distributorName: 'Winchester Grey',
    doorStyle: 'Flat Panel w/ Decorative Edge',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Grey',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: 'Flat Panel',
    description: 'Winchester Grey offers a sophisticated grey painted finish with a flat panel decorative edge door. Solid maple/birch, full overlay, plywood box construction, and dovetail drawer boxes.',
  },
  PS: {
    distributorName: 'Platinum Shaker',
    doorStyle: 'Shaker Style',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Light Grey / Platinum',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: '5-Piece Shaker',
    description: 'Platinum Shaker features a light platinum grey painted finish on a classic 5-piece shaker door. Solid maple/birch, full overlay, plywood box, and dovetail drawer construction.',
  },
  RH: {
    distributorName: 'Rustic Hickory',
    doorStyle: 'Shaker Style',
    woodSpecies: 'Hickory',
    finish: 'Stained',
    color: 'Natural Hickory',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: 'Solid Slab Shaker',
    description: 'Rustic Hickory showcases the natural character of solid hickory wood with a shaker-style solid slab door. Color-matched exterior, full overlay, 1/2" plywood box, and dovetail drawer boxes. Note: hickory cabinets may have exposed ends and may require end panels.',
  },
  WPG: {
    distributorName: 'West Point Grey',
    doorStyle: 'Shaker Style',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'Medium Grey',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: '5-Piece Shaker',
    description: 'West Point Grey brings a medium grey painted finish to the 5-piece shaker door profile. Solid maple/birch, full overlay, plywood box, and dovetail drawer construction.',
  },
  WS: {
    distributorName: 'White Shaker',
    doorStyle: 'Shaker Style',
    woodSpecies: 'Solid Maple/Birch',
    finish: 'Painted',
    color: 'White',
    boxConstruction: '1/2" Solid Plywood',
    drawerConstruction: '3/4" Solid Wood Dovetail, Undermount Soft Close',
    hardware: 'Soft Close 6 Way Adjustable Concealed Hinge',
    overlayType: 'Full Overlay',
    doorPanelType: '5-Piece Shaker',
    description: 'White Shaker is the timeless classic — a crisp white painted finish on a 5-piece shaker door. Solid maple/birch, full overlay, 1/2" plywood box, and dovetail drawer boxes with undermount soft-close glides. ADA-compliant variants available.',
  },
};

let updated = 0;
for (const [styleCode, data] of Object.entries(specs)) {
  const [result] = await conn.query(`
    UPDATE door_styles SET
      distributorName = ?,
      doorStyle = ?,
      woodSpecies = ?,
      finish = ?,
      color = ?,
      boxConstruction = ?,
      drawerConstruction = ?,
      hardware = ?,
      overlayType = ?,
      doorPanelType = ?
    WHERE distributorId = 2 AND styleCode = ?
  `, [
    data.distributorName,
    data.doorStyle,
    data.woodSpecies,
    data.finish,
    data.color,
    data.boxConstruction,
    data.drawerConstruction,
    data.hardware,
    data.overlayType,
    data.doorPanelType,
    styleCode,
  ]);
  if (result.affectedRows > 0) {
    updated++;
    console.log(`  ✅ ${styleCode.padEnd(6)} ${data.distributorName}`);
  } else {
    console.log(`  ⚠️  ${styleCode.padEnd(6)} NOT FOUND`);
  }
}

console.log(`\nUpdated ${updated} / ${Object.keys(specs).length} Ashford door styles`);

// Verify
const [rows] = await conn.query(`
  SELECT styleCode, ourName, distributorName, doorStyle, woodSpecies, finish, color, overlayType
  FROM door_styles WHERE distributorId = 2 ORDER BY styleCode
`);
console.log('\nVerification:');
for (const r of rows) {
  console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(30)} | ${r.woodSpecies} | ${r.doorStyle} | ${r.finish} | ${r.color}`);
}

await conn.end();
