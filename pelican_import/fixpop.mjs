import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
// Reset all popular flags for the visible catalog categories, then re-pick smarter.
await c.query("UPDATE pelican_products SET isPopular=0, popularRank=0");

// Helper: pick top-N per category by a WHERE clause, ordered, assign popularRank.
async function pick(category, whereExtra, orderBy, n=6){
  const [rows] = await c.query(
    `SELECT id FROM pelican_products
     WHERE category=? AND showInCatalog=1 AND listPrice IS NOT NULL ${whereExtra}
     ORDER BY ${orderBy} LIMIT ?`, [category, n]);
  let rank=1;
  for (const r of rows){
    await c.query("UPDATE pelican_products SET isPopular=1, popularRank=? WHERE id=?", [rank++, r.id]);
  }
  return rows.length;
}

const out = {};
// Quartz: marquee whites/calacatta/carrara looks
out.quartz = await pick("Quartz Slabs (Countertops)",
  "AND (LOWER(name) LIKE '%calacatta%' OR LOWER(name) LIKE '%carrara%' OR LOWER(name) LIKE '%white%' OR LOWER(name) LIKE '%oro%' OR LOWER(name) LIKE '%super%')",
  "listPrice DESC");
// Flooring: real planks (subCategory Planks & Flooring), popular wood looks, else just top planks
out.flooring = await pick("Flooring",
  "AND subCategory='Planks & Flooring'",
  "(CASE WHEN LOWER(name) LIKE '%oak%' OR LOWER(name) LIKE '%hickory%' OR LOWER(name) LIKE '%walnut%' OR LOWER(name) LIKE '%maple%' THEN 0 ELSE 1 END), name");
// Sinks & Faucets: real sinks first (subCategory Sinks), then faucets — not accessories
out.sinks = await pick("Sinks & Faucets",
  "AND subCategory='Sinks'",
  "(CASE WHEN LOWER(name||description) LIKE '%workstation%' OR LOWER(description) LIKE '%workstation%' OR LOWER(description) LIKE '%farmhouse%' OR LOWER(description) LIKE '%undermount%' THEN 0 ELSE 1 END), listPrice DESC", 4);
// add 2 popular faucets to fill the shortlist for that category (ranks continue)
{
  const [rows] = await c.query(
    `SELECT id FROM pelican_products WHERE category='Sinks & Faucets' AND showInCatalog=1 AND listPrice IS NOT NULL AND subCategory='Faucets'
     ORDER BY (CASE WHEN LOWER(description) LIKE '%pull-down%' OR LOWER(description) LIKE '%pull down%' OR LOWER(name) LIKE '%matte black%' THEN 0 ELSE 1 END), listPrice DESC LIMIT 2`);
  let rank=5;
  for (const r of rows){ await c.query("UPDATE pelican_products SET isPopular=1, popularRank=? WHERE id=?",[rank++, r.id]); }
  out.faucets = rows.length;
}
// Shower & Bath: doors first
out.shower = await pick("Shower & Bath",
  "AND (subCategory='Shower & Tub Doors' OR LOWER(description) LIKE '%frameless%' OR LOWER(description) LIKE '%sliding%')",
  "(CASE WHEN LOWER(description) LIKE '%frameless%' THEN 0 ELSE 1 END), listPrice DESC");
if (out.shower === 0) out.shower = await pick("Shower & Bath","", "listPrice DESC");
// Toilets: one-piece / dual flush / elongated
out.toilets = await pick("Toilets & Bidets",
  "AND (LOWER(description) LIKE '%one piece%' OR LOWER(description) LIKE '%one-piece%' OR LOWER(description) LIKE '%dual flush%' OR LOWER(description) LIKE '%elongated%' OR LOWER(name) LIKE '%toilet%')",
  "listPrice DESC");
if (out.toilets === 0) out.toilets = await pick("Toilets & Bidets","","listPrice DESC");
// Tile & Mosaic: recognizable looks
out.tile = await pick("Tile & Mosaic",
  "AND (LOWER(name) LIKE '%carrara%' OR LOWER(name) LIKE '%marble%' OR LOWER(name) LIKE '%hex%' OR LOWER(name) LIKE '%subway%' OR LOWER(name) LIKE '%white%')",
  "listPrice DESC");
if (out.tile === 0) out.tile = await pick("Tile & Mosaic","","listPrice DESC");

console.log("picked:", out);
const [chk] = await c.query("SELECT category, SUM(isPopular) pop FROM pelican_products GROUP BY category ORDER BY pop DESC");
console.table(chk);
await c.end();
