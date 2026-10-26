import 'dotenv/config';
import fs from 'fs';
import mysql from 'mysql2/promise';
import { parse } from 'csv-parse/sync';

const raw = fs.readFileSync('/home/ubuntu/upload/cs_tab.csv', 'utf8');
const records = parse(raw, { relax_column_count: true, skip_empty_lines: true });
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
  dnRows.push({
    sku, masterCode: (r[0] || '').trim(), list: money(r[7]),
    cost: money(r[8]), code: (r[10] || '').trim(), desc: (r[6] || '').trim(),
  });
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cabs] = await conn.query('SELECT id, masterCode FROM cabinets');
const norm = (s) => (s || '').trim().toUpperCase();
const stripD = (s) => norm(s).replace(/-/g, '');
const exact = new Map(), strip = new Map();
for (const c of cabs) {
  if (!c.masterCode) continue;
  exact.set(norm(c.masterCode), c.id);
  const s = stripD(c.masterCode);
  if (!strip.has(s)) strip.set(s, c.id);
}

// Split a compact code like V2421DL into prefix + 2-digit dim groups + trailing letters.
// Returns array of candidate dashed strings to try.
function dashVariants(code) {
  const m = norm(code).match(/^([A-Z]+)(\d+)([A-Z0-9]*)$/);
  if (!m) return [];
  const [, pfx, digits, sfx] = m;
  const out = new Set();
  // group digits into 2s
  const pairs = [];
  for (let i = 0; i < digits.length; i += 2) pairs.push(digits.slice(i, i + 2));
  // full split: PFX-dd-dd(-dd)SFX
  out.add(`${pfx}-${pairs.join('-')}${sfx}`);
  // width-only: PFX-<first pair>SFX
  out.add(`${pfx}-${pairs[0]}${sfx}`);
  // width + drawer count guesses for bases/vanities
  for (const dc of ['3', '2']) {
    out.add(`${pfx}-${pairs[0]}-${dc}`);
    out.add(`${pfx}-${pairs.slice(0,2).join('-')}-${dc}`);
  }
  return [...out];
}

function resolve(d) {
  for (const key of [d.masterCode, d.code]) {
    if (exact.has(norm(key))) return { id: exact.get(norm(key)), how: 'exact' };
    if (strip.has(stripD(key))) return { id: strip.get(stripD(key)), how: 'strip' };
  }
  // dimension-dashed variants from the compact code
  for (const src of [d.code, d.masterCode]) {
    for (const cand of dashVariants(src)) {
      if (exact.has(norm(cand))) return { id: exact.get(norm(cand)), how: 'dash-exact:' + cand };
      if (strip.has(stripD(cand))) return { id: strip.get(stripD(cand)), how: 'dash-strip:' + cand };
    }
  }
  return null;
}

let matched = 0; const resolved = [], unmatched = [];
for (const d of dnRows) {
  const r = resolve(d);
  if (r) { matched++; resolved.push({ ...d, cabinetId: r.id, how: r.how }); }
  else unmatched.push(d);
}
console.log('DN rows:', dnRows.length, '| matched:', matched, '| unmatched:', unmatched.length);
const byPrefix = {};
for (const u of unmatched) { const p = (u.code.match(/^[A-Za-z]+/)||['?'])[0]; byPrefix[p]=(byPrefix[p]||0)+1; }
console.log('unmatched by prefix:', JSON.stringify(byPrefix));
fs.writeFileSync('/home/ubuntu/cabinet-dealz/notes/dn_resolved.json', JSON.stringify({ resolved, unmatched }, null, 2));
console.log('wrote notes/dn_resolved.json');
await conn.end();
