import 'dotenv/config';
import fs from 'fs';
import mysql from 'mysql2/promise';
import { parse } from 'csv-parse/sync';

const CSV = '/home/ubuntu/upload/cs_tab.csv';
const raw = fs.readFileSync(CSV, 'utf8');
// CSV has a header row; parse with columns:false to index positionally.
const records = parse(raw, { relax_column_count: true, skip_empty_lines: true });

// Column indices (0-based) from observed header:
// 0 Master Code, 1 Master Code, 2 Description, 3 Item Code, 4 (blank),
// 5 sku, 6 Column2/desc, 7 Base Price (LIST), 8 .38 Pricing (COST),
// 9 Door Style, 10 Code, 11 adjusted list, ...
const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/[$,\s]/g, '');
  if (t === '' || isNaN(Number(t))) return null;
  return Number(t);
};

const dnRows = [];
for (const r of records) {
  const sku = (r[5] || '').trim();
  const doorStyle = (r[9] || '').trim();
  if (doorStyle !== 'DN' && !sku.startsWith('DN-')) continue;
  const masterCode = (r[0] || '').trim();
  const list = money(r[7]);
  const cost = money(r[8]);
  const code = (r[10] || '').trim();
  const desc = (r[6] || '').trim();
  dnRows.push({ sku, masterCode, list, cost, code, desc });
}

console.log('Parsed DN rows:', dnRows.length);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cabs] = await conn.query('SELECT id, masterCode FROM cabinets');
const byCode = new Map();
for (const c of cabs) {
  if (c.masterCode) byCode.set(c.masterCode.trim().toUpperCase(), c.id);
}
// normalization variants: exact, remove dashes, collapse
const norm = (s) => (s||'').trim().toUpperCase();
const stripDash = (s) => norm(s).replace(/-/g, '');
const byStrip = new Map();
for (const c of cabs) if (c.masterCode) byStrip.set(stripDash(c.masterCode), c.id);

let matched = 0, unmatched = [], noPrice = [];
const resolved = [];
for (const d of dnRows) {
  let cid = byCode.get(norm(d.masterCode));
  if (!cid) cid = byStrip.get(stripDash(d.masterCode));
  if (!cid) { unmatched.push(d); continue; }
  matched++;
  if (d.list == null && d.cost == null) noPrice.push(d);
  resolved.push({ ...d, cabinetId: cid });
}

console.log('Matched to cabinet:', matched);
console.log('Unmatched:', unmatched.length);
console.log('Matched but missing BOTH prices:', noPrice.length);
console.log('\n--- Sample matched (first 8) ---');
for (const r of resolved.slice(0, 8)) console.log(`${r.sku}  master=${r.masterCode} cab=${r.cabinetId} list=${r.list} cost=${r.cost}`);
console.log('\n--- Unmatched master codes (first 40) ---');
for (const u of unmatched.slice(0, 40)) console.log(`${u.sku}  master="${u.masterCode}" code=${u.code} list=${u.list} cost=${u.cost} :: ${u.desc.slice(0,50)}`);
if (noPrice.length) {
  console.log('\n--- Matched but no price (first 20) ---');
  for (const n of noPrice.slice(0,20)) console.log(`${n.sku} master=${n.masterCode}`);
}

fs.writeFileSync('/home/ubuntu/cabinet-dealz/notes/dn_resolved.json', JSON.stringify({ resolved, unmatched }, null, 2));
console.log('\nWrote resolved set to notes/dn_resolved.json');
await conn.end();
