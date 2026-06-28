import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL not set');

// Parse connection string
const url = new URL(DB_URL);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', '').split('?')[0],
  ssl: { rejectUnauthorized: false },
});

const STYLE_URLS = {
  "Aero Alba": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aero-alba-3AG9zBFTsEbjYFDBMUkz6h.webp",
  "Aero Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aero-blanc-ZFvMY9Mo5qiUsguyGwQ6hR.webp",
  "Aero Obsidian": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aero-obsidian-RqieuLHhB3hM3sbh7ECTux.webp",
  "Aero Relic": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aero-relic-fTuXzBtR7uxrTvoKuQucdA.webp",
  "Aero Solstice": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aero-solstice-RnUerLczBPS8RWR3kDEmxU.webp",
  "Aura Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aura-blanc-XwPLSh7Jr2Q24WpZM7SPZV.webp",
  "Aura Cream": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aura-cream-DDgGbSt8x72zY5bwHZXE2Y.webp",
  "Aurum Vault": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-aurum-vault-P4uvRNxeerPSTeJYhasLTP.webp",
  "Blanc Core": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-blanc-core-Mif3czvjjavKi8cwVke4SG.webp",
  "Bloom Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-bloom-blanc-ajKkmVLyAEeD45KGLqmQ9r.webp",
  "Bloom Cinder": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-bloom-cinder-dcuDhQ3HHZ6zHNFM9Smav7.webp",
  "Bloom Umbra": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-bloom-umbra-Y3TCUMxrkoEQGTDvr3m8cL.webp",
  "Carbon Frost": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-carbon-frost-7UK73P9NBgXtEWjW53wnN9.webp",
  "Casselberry Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-casselberry-blanc-h6PSqUQ8Ln3ufChMVuJNNN.webp",
  "Casselberry Saddle": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-casselberry-saddle-h8JQfRLCEoEL4r3aG6Ca6g.webp",
  "Cinder Core Gray": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-cinder-core-F5QCpyBWb5cxgytsBWsaqJ.webp",
  "Cinder Core Dovetail": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-slate-echo-4ehBdXS4ifePkwZuGKpjVv.webp",
  "Cobalt Abyss": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-cobalt-abyss-ZXS7SMRgZZqu7hBDbEwDWS.webp",
  "Dual Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-dual-blanc-TYZVPsKSjhatXUu9Av9stM.webp",
  "Dual Vesper": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-dual-vesper-ezoErnsAWg3DyqBdYwoo5N.webp",
  "Edge Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-edge-blanc-SitERSxkdWzq3Zj4pfnhKx.webp",
  "Essence Oak": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-essence-oak-BrfLQ6eSNd2E5373h7AS4D.webp",
  "Glace Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-glace-blanc-5eZJQzYFwd7Sb3BeGrDcxQ.webp",
  "Glace Cinder": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-glace-cinder-gKfoFYwKfGX5tT69x2KuYG.webp",
  "Haven Dune": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-haven-dune-PNCGVxHdxY5XzNZFtqNRhV.webp",
  "Haven Ember": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-haven-ember-LMy94DnMvsqAD5eehS4LBT.webp",
  "Haven White": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-haven-white-5dCaBEZJppFg3X83J4vnm7.webp",
  "Honey Core": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-honey-core-S64wV7ScT4L94E4KcBgyfR.webp",
  "Ivy Core": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-ivy-core-PGHvJ6r9XfoLMHedcwPxK2.webp",
  "Lumina Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-lumina-blanc-HqhzwEKo8Jn5SXXtcu5GUF.webp",
  "Lumina White": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-lumina-white-mzTaEXcmXgbiWKPmWc8agg.webp",
  "Navy Core": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-navy-core-7Gz9wRkxAD5ikJLiL8eDAd.webp",
  "Nimbus Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-nimbus-blanc-AG4Uratmkvqh4dKYdv3cAL.webp",
  "Nimbus Grey": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-nimbus-grey-cDDncwMLPS59eUekwWxCmA.webp",
  "Nocturne Glass": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-nocturne-glass-hfdRxqp4SQ8cfddgVhXM4u.webp",
  "Nova Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-nova-blanc-Tc6zzCFMvc96d34fwPsynz.webp",
  "Nova White": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-nova-white-nTXw2rJPzkmCvfXH3ASXE5.webp",
  "Obsidian Forge": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-obsidian-forge-6Gn8tn2P42zUTmgXNmSUYM.webp",
  "Onyx Core": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-onyx-core-evXGGfwe7GZE6SRuz7aBaJ.webp",
  "Onyx Shadow": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-onyx-shadow-CRAcgTLwnfZDQgmpoKnwSP.webp",
  "Oxford Blanc": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-oxford-blanc-V8VrCXpsvNvFRs7RhfXyKT.webp",
  "Oxford Mist": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-oxford-mist-9QzeEhiL42V9cemcha3BVq.webp",
  "Oxford Sage": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-oxford-sage-7vU3Dm6EFGRMdhsJSxwMHX.webp",
  "Oxford Toffee": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-oxford-toffee-5XojBWJXQsDN83c9L65AQu.webp",
  "Prism Clear": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-prism-clear-o2tqi72UHB6TUf9vLpMhDa.webp",
  "Selene Gray": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-selene-gray-JcaVJt7fxKpNtvFLzqeXgk.webp",
  "Silva Shaker": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-silva-shaker-m8JQfnzTFzk6VG3KCVH6x9.webp",
  "Slate Core": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-slate-core-NwjAAMhZxCG85QHgcjdjwY.webp",
  "Slate Echo": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-slate-echo-4ehBdXS4ifePkwZuGKpjVv.webp",
  "Solis Oak": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-solis-oak-BJpLfz4bC8UM7NNxEWChnu.webp",
  "Sterling Pulse": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-sterling-pulse-4d8bXmBqeYUvmPvUgMa7sa.webp",
  "Sylvan Rust": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-sylvan-rust-R697cogjYADxPwGxWLxfza.webp",
  "Sylvan Rust Hickory": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-sylvan-rust-hickory-3CJCmKH7zpRz9WZv8F5jGf.webp",
  "Terra Shaker": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-terra-shaker-fn34JdXXv8Be5AoN5krNU4.webp",
  "Umbra Oak": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-umbra-oak-8WZGZHy6yXeiGeL3coajmS.webp",
  "Umbra Shaker": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-umbra-shaker-8kGeab8cMxEfhxVdiNdLX6.webp",
  "Vellum Crema": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-vellum-crema-Knb2xMV7E2b9YxTdDZUipz.webp",
  "Vellum Noir": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-vellum-noir-deNuTgfMiVyCMYQYGAH43b.webp",
  "Vesper Ash": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-vesper-ash-cP7giQ5c9FzxvGRH85ohNQ.webp",
  "Virid Echo": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-virid-echo-StRSZTPcXjsQknedRQJkAu.webp",
  "Zenith Sage": "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/room-scene-zenith-sage-7N3S2T4cPeXMyrEYzVvaHJ.webp",
};

let updated = 0;
let notFound = [];

for (const [name, url] of Object.entries(STYLE_URLS)) {
  const [result] = await connection.execute(
    'UPDATE door_styles SET roomSceneImageUrl = ? WHERE ourName = ?',
    [url, name]
  );
  if (result.affectedRows > 0) {
    updated++;
    console.log(`✅ Updated: ${name}`);
  } else {
    notFound.push(name);
    console.log(`❌ Not found: ${name}`);
  }
}

console.log(`\nDone: ${updated} updated, ${notFound.length} not found`);
if (notFound.length > 0) {
  console.log('Not found:', notFound);
}

await connection.end();
