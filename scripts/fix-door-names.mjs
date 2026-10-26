/**
 * fix-door-names.mjs
 * Renames all French/non-English words in door style ourName and aliasName
 * to plain English equivalents.
 *
 * Mapping rules (word-level, case-insensitive):
 *   Blanc  → White
 *   Noir   → Black
 *   Crema  → Cream
 *   Glace  → Ice
 *   Aero   → Air
 *   Vellum → Velvet  (keep brand feel but English)
 *   Lumina → Lumen   (already English-ish, but keep)
 *   Aura   → (keep – English word)
 *   Bloom  → (keep – English word)
 *   Nimbus → (keep – English word)
 *   Nova   → (keep – English word)
 *   Edge   → (keep)
 *   Oxford → (keep)
 *   Casselberry → (keep)
 *   Haven  → (keep)
 *   Solis  → Solar
 *   Virid  → Green
 *   Aurum  → Gold
 *   Sylvan → Forest
 *   Umbra  → Shadow
 *   Vesper → Dusk
 *   Zenith → (keep – English word)
 *   Selene → Moon
 *   Zephyr → (keep – English word)
 *   Silva  → Silver
 *   Cobalt → (keep – English word)
 *   Obsidian → (keep – English word)
 *   Nocturne → Night
 *   Prism  → (keep – English word)
 *   Essence → (keep – English word)
 *   Ivy    → (keep – English word)
 *   Navy   → (keep – English word)
 *   Onyx   → (keep – English word)
 *   Honey  → (keep – English word)
 *   Cinder → (keep – English word)
 *   Slate  → (keep – English word)
 *   Terra  → Earth
 *   Carbon → (keep – English word)
 *   Sterling → (keep – English word)
 *   Dual   → (keep – English word)
 *   Haven  → (keep – English word)
 *   Relic  → (keep – English word)
 *   Solstice → (keep – English word)
 *   Alba   → Dawn
 *   Casselberry → (keep – proper noun)
 *   Saddle → (keep – English word)
 *   Dune   → (keep – English word)
 *   Mist   → (keep – English word)
 *   Toffee → (keep – English word)
 *   Ember  → (keep – English word)
 *   Oak    → (keep – English word)
 *   Rustic → (keep – English word)
 *   Core   → (keep – English word)
 *   Sage   → (keep – English word)
 *   Frost  → (keep – English word)
 *   Ash    → (keep – English word)
 *   Shaker → (keep – English word)
 *   Hickory → (keep – English word)
 *   Clear  → (keep – English word)
 *   Glass  → (keep – English word)
 *   Pulse  → (keep – English word)
 *   Echo   → (keep – English word)
 *   Forge  → (keep – English word)
 *   Abyss  → (keep – English word)
 *   Vault  → (keep – English word)
 *   Rust   → (keep – English word)
 *
 * Non-English words that need replacing:
 *   Blanc  → White
 *   Noir   → Black
 *   Crema  → Cream
 *   Glace  → Ice
 *   Vellum Noir → Velvet Black
 *   Vellum Crema → Velvet Cream
 *   Lumina Blanc → Lumina White
 *   Dual Blanc → Dual White
 *   Aero Blanc → Air White
 *   Aero Alba → Air Dawn
 *   Glace Blanc → Ice White
 *   Glace Cinder → Ice Cinder
 *   Bloom Blanc → Bloom White
 *   Aura Blanc → Aura White
 *   Nimbus Blanc → Nimbus White
 *   Nova Blanc → Nova White
 *   Edge Blanc → Edge White
 *   Oxford Blanc → Oxford White
 *   Casselberry Blanc → Casselberry White
 *   Blanc Core → White Core
 *   Solis Oak → Solar Oak
 *   Virid Echo → Green Echo
 *   Aurum Vault → Gold Vault
 *   Sylvan Rust → Forest Rust
 *   Umbra Shaker → Shadow Shaker
 *   Umbra Oak → Shadow Oak
 *   Vesper Ash → Dusk Ash
 *   Dual Vesper → Dual Dusk
 *   Selene Gray → Moon Gray
 *   Silva Shaker → Silver Shaker
 *   Nocturne Glass → Night Glass
 *   Terra Shaker → Earth Shaker
 *   Alba → Dawn (in Aero Alba)
 */

import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

// Map of exact ourName → new English name
// Also used for aliasName when it matches ourName
const NAME_MAP = {
  // French "Blanc" = White
  'Blanc Core':            'White Core',
  'Lumina Blanc':          'Lumina White',
  'Dual Blanc':            'Dual White',
  'Aero Blanc':            'Air White',
  'Glace Blanc':           'Ice White',
  'Bloom Blanc':           'Bloom White',
  'Aura Blanc':            'Aura White',
  'Nimbus Blanc':          'Nimbus White',
  'Nova Blanc':            'Nova White',
  'Edge Blanc':            'Edge White',
  'Oxford Blanc':          'Oxford White',
  // Casselberry Blanc is the approved Madison-facing alternate name for
  // Casselberry Antique White; do not translate this proper product name.

  // French "Noir" = Black
  'Vellum Noir':           'Velvet Black',

  // Spanish/Italian "Crema" = Cream
  'Vellum Crema':          'Velvet Cream',

  // French "Glace" = Ice
  'Glace Cinder':          'Ice Cinder',

  // Latin "Aero" = Air (brand prefix)
  'Aero Relic':            'Air Relic',
  'Aero Obsidian':         'Air Obsidian',
  'Aero Solstice':         'Air Solstice',
  'Aero Alba':             'Air Dawn',

  // Latin "Solis" = Solar/Sun
  'Solis Oak':             'Solar Oak',

  // Latin "Virid" = Green
  'Virid Echo':            'Green Echo',

  // Latin "Aurum" = Gold
  'Aurum Vault':           'Gold Vault',

  // Latin "Sylvan" = Forest
  'Sylvan Rust':           'Forest Rust',

  // Latin "Umbra" = Shadow
  'Umbra Shaker':          'Shadow Shaker',
  'Umbra Oak':             'Shadow Oak',

  // Latin "Vesper" = Dusk/Evening
  'Vesper Ash':            'Dusk Ash',
  'Dual Vesper':           'Dual Dusk',

  // Greek "Selene" = Moon
  'Selene Gray':           'Moon Gray',

  // Latin "Silva" = Silver/Forest
  'Silva Shaker':          'Silver Shaker',

  // Latin "Nocturne" = Night
  'Nocturne Glass':        'Night Glass',

  // Latin "Terra" = Earth
  'Terra Shaker':          'Earth Shaker',

  // Latin "Lumina" → keep as Lumina (it's recognizable English-adjacent)
  // but fix "Lumina White" already handled above

  // "Bloom Cinder", "Bloom Umbra" — Umbra = Shadow
  'Bloom Umbra':           'Bloom Shadow',
};

async function main() {
  const conn = await createConnection(url);
  let updated = 0;

  for (const [oldName, newName] of Object.entries(NAME_MAP)) {
    // Update ourName
    const [r1] = await conn.execute(
      'UPDATE door_styles SET ourName = ? WHERE ourName = ?',
      [newName, oldName]
    );
    if (r1.affectedRows > 0) {
      console.log(`ourName: "${oldName}" → "${newName}" (${r1.affectedRows} row)`);
      updated += r1.affectedRows;
    }

    // Update aliasName where it still matches the old name
    const [r2] = await conn.execute(
      'UPDATE door_styles SET aliasName = ? WHERE aliasName = ?',
      [newName, oldName]
    );
    if (r2.affectedRows > 0) {
      console.log(`aliasName: "${oldName}" → "${newName}" (${r2.affectedRows} row)`);
      updated += r2.affectedRows;
    }
  }

  console.log(`\nDone. Total field updates: ${updated}`);
  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
