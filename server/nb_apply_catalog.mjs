import 'dotenv/config';
import mysql from 'mysql2/promise';

const DRY = process.argv.includes('--dry');

// Staged our-name / category fixes from door_review_session.md.
// Only fields that CHANGE are listed. id is authoritative.
const nameFixes = [
  // Clark And Son (distId 2)
  { id: 30005, ourName: 'Silva Shaker' },                 // HS Silver -> Silva
  { id: 30009, ourName: 'Nimbus Grey', doorStyle: 'Raised Panel' }, // WPG category fix
  { id: 30003, ourName: 'Terra Shaker' },                 // CS Earth -> Terra
  { id: 30001, doorStyle: 'Raised Panel' },               // ASP ensure Raised Panel
  // Skyline (distId 3) name fixes
  { id: 30013, ourName: 'Umbra Shaker' },                 // SE
  { id: 30011, ourName: 'Blanc Core' },                   // SW
  { id: 30020, ourName: 'Aurum Vault' },                  // TC
  { id: 30015, ourName: 'Virid Echo' },                   // AG
  { id: 30017, ourName: 'Vesper Ash' },                   // SA
  { id: 30018, ourName: 'Selene Gray' },                  // LG
  { id: 30021, ourName: 'Sylvan Rust' },                  // RW
  { id: 30028, ourName: 'Aero Sage' },                    // SAG
  { id: 30029, ourName: 'Aero Obsidian' },                // SIB
  { id: 30031, ourName: 'Aero Alba' },                    // SWO
  { id: 30030, ourName: 'Aero Solstice' },                // SAO
  { id: 30027, ourName: 'Aero Blanc' },                   // SDW
  { id: 30014, ourName: 'Cobalt Abyss' },                 // NB (already ok, no-op safe)
  { id: 30016, ourName: 'Obsidian Forge' },               // IB
  { id: 30019, ourName: 'Zephyr Sage' },                  // SB
  { id: 30012, ourName: 'Cinder Core' },                  // GR
];

// Skyline slab / raised panel name+category fixes staged earlier
const skylineExtra = [
  { id: null, styleCode: 'OS', distId: 3, ourName: 'Umbra Oak' },
  { id: null, styleCode: 'OB', distId: 3, ourName: 'Solis Oak' },
  { id: null, styleCode: 'MI', distId: 3, ourName: 'Vellum Crema' },
  { id: null, styleCode: 'MB', distId: 3, ourName: 'Vellum Noir' },
  { id: null, styleCode: 'MG', distId: 3, ourName: 'Nocturne Glass' },
  { id: null, styleCode: 'CG', distId: 3, ourName: 'Prism Clear' },
  { id: null, styleCode: 'HG', distId: 3, ourName: 'Glace Cinder' },
  { id: null, styleCode: 'HW', distId: 3, ourName: 'Glace Blanc' },
  { id: null, styleCode: 'AC', distId: 3, ourName: 'Carbon Frost' },
  { id: null, styleCode: 'CW', distId: 3, ourName: 'Haven White', doorStyle: 'Raised Panel' },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.beginTransaction();
try {
  let updates = 0, skipped = [];
  async function applyFix(f) {
    let id = f.id;
    if (!id && f.styleCode) {
      const [rows] = await conn.query(
        'SELECT id FROM door_styles WHERE styleCode=? AND distributorId=?',
        [f.styleCode, f.distId]);
      if (!rows.length) { skipped.push(f.styleCode + ' (not found)'); return; }
      id = rows[0].id;
    }
    const sets = [], vals = [];
    if (f.ourName) { sets.push('ourName=?'); vals.push(f.ourName); }
    if (f.doorStyle) { sets.push('doorStyle=?'); vals.push(f.doorStyle); }
    sets.push('doorSampleVerified=1');
    if (!sets.length) return;
    vals.push(id);
    if (!DRY) await conn.query(`UPDATE door_styles SET ${sets.join(', ')} WHERE id=?`, vals);
    updates++;
  }
  for (const f of [...nameFixes, ...skylineExtra]) await applyFix(f);
  console.log('Catalog fixes applied:', updates, DRY ? '(dry)' : '');
  if (skipped.length) console.log('Skipped (not found):', skipped.join(', '));

  if (DRY) { await conn.rollback(); console.log('DRY — rolled back'); }
  else { await conn.commit(); console.log('COMMITTED'); }
} catch (e) {
  await conn.rollback();
  console.error('ERROR rolled back:', e.message);
  process.exitCode = 1;
} finally { await conn.end(); }
