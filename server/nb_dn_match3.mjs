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
    sku,
    masterCode: (r[0] || '').trim(),
    list: money(r[7]),
    cost: money(r[8]),
    code: (r[10] || '').trim(),
    desc: (r[6] || '').trim(),
  });
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cabs] = await conn.query('SELECT id, masterCode FROM cabinets');

const norm = (s) => (s || '').trim().toUpperCase();
const stripD = (s) => norm(s).replace(/-/g, '');

const exact = new Map();   // uppercase exact code -> id
const strip = new Map();   // dashes removed -> id (first wins)
const stripAll = new Map(); // dashes removed -> [ids] to detect ambiguity
for (const c of cabs) {
  if (!c.masterCode) continue;
  const up = norm(c.masterCode);
  exact.set(up, c.id);
  const s = stripD(c.masterCode);
  if (!strip.has(s)) strip.set(s, c.id);
  if (!stripAll.has(s)) stripAll.set(s, []);
  stripAll.get(s).push({ id: c.id, code: up });
}

// Given a DN row, try to resolve a cabinetId.
function resolve(d) {
  // 1) exact on the sheet's master code (col 0) — most reliable
  if (exact.has(norm(d.masterCode))) return { id: exact.get(norm(d.masterCode)), how: 'exact-master' };
  // 2) strip-dash on master code
  if (strip.has(stripD(d.masterCode))) return { id: strip.get(stripD(d.masterCode)), how: 'strip-master' };
  // 3) strip-dash on the compact DN code (col 10)
  if (strip.has(stripD(d.code))) return { id: strip.get(stripD(d.code)), how: 'strip-code' };
  // 4) drawer-base / vanity-drawer: DB33 -> DB-33-3 or DB-33-2 ; VDB1221 -> VDB-12-3
  const m = d.code.match(/^([A-Za-z]+)(\d+)([A-Za-z]*)$/);
  if (m) {
    const [, pfx, digits, sfx] = m;
    // try appending drawer-count variants for drawer bases
    for (const dc of ['-3', '-2']) {
      const cand = stripD(`${pfx}${digits}`) + dc.replace('-', '');
      // build like PFX-<width>-<count>: width is first 2 digits
      const w = digits.slice(0, 2);
      const guess = stripD(`${pfx}${w}${dc.replace('-', '')}`);
      if (strip.has(guess)) return { id: strip.get(guess), how: `drawerguess${dc}` };
    }
    // vanity depth style VDB1221 -> VDB-12-3 (take width, ignore depth 21, add -3)
    if (/^(VDB|DB)$/.test(pfx) && digits.length >= 3) {
      const w = digits.slice(0, digits.length - 2);
      for (const dc of ['3', '2']) {
        const guess = stripD(`${pfx}${w}${dc}`);
        if (strip.has(guess)) return { id: strip.get(guess), how: 'vanity-depth' };
      }
    }
  }
  return null;
}

let matched = 0;
const resolved = [];
const unmatched = [];
for (const d of dnRows) {
  const r = resolve(d);
  if (r) { matched++; resolved.push({ ...d, cabinetId: r.id, how: r.how }); }
  else unmatched.push(d);
}

console.log('DN rows:', dnRows.length, '| matched:', matched, '| unmatched:', unmatched.length);
const howCount = {};
for (const r of resolved) howCount[r.how] = (howCount[r.how] || 0) + 1;
console.log('match methods:', JSON.stringify(howCount));
const byPrefix = {};
for (const u of unmatched) { const p = (u.code.match(/^[A-Za-z]+/) || ['?'])[0]; byPrefix[p] = (byPrefix[p]||0)+1; }
console.log('unmatched by prefix:', JSON.stringify(byPrefix));

fs.writeFileSync('/home/ubuntu/cabinet-dealz/notes/dn_resolved.json',
  JSON.stringify({ resolved, unmatched }, null, 2));
console.log('wrote notes/dn_resolved.json');
await conn.end();
