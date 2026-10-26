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
// Build multiple lookup maps
const exact = new Map();     // uppercase exact
const strip = new Map();     // dashes removed
for (const c of cabs) {
  if (!c.masterCode) continue;
  const up = c.masterCode.trim().toUpperCase();
  exact.set(up, c.id);
  strip.set(up.replace(/-/g, ''), c.id);
}
const norm = (s) => (s || '').trim().toUpperCase();
const stripD = (s) => norm(s).replace(/-/g, '');

// Candidate generator: from a compact DN code, produce plausible cabinet codes.
function candidates(masterCode, code) {
  const cands = new Set();
  const push = (v) => { if (v) { cands.add(norm(v)); cands.add(stripD(v)); } };
  push(masterCode);
  push(code);
  // Try prefix + dimensions splitting on the compact CODE, e.g. FHB18 -> FHB-18
  const m = code.match(/^([A-Za-z]+)(\d.*)$/);
  if (m) {
    const prefix = m[1];
    let rest = m[2];
    // suffix letters (DL/DR/GD/TDL...) split off
    const sfx = rest.match(/^([\d]+)([A-Za-z].*)?$/);
    // Split digit run into 2-digit dimension groups: 3030 -> 30-30, 3021 ->30-21
    const digits = rest.replace(/[^\d]/g, '');
    const tail = rest.replace(/^\d+/, ''); // trailing letters e.g. DL
    // group into pairs
    let groups = [];
    if (digits.length >= 2 && digits.length % 2 === 0) {
      for (let i = 0; i < digits.length; i += 2) groups.push(digits.slice(i, i + 2));
    } else {
      groups = [digits];
    }
    push(prefix + '-' + groups.join('-') + (tail || ''));
    // single dimension variant: prefix-<digits>
    push(prefix + '-' + digits + (tail || ''));
  }
  return [...cands];
}

let matched = 0;
const resolved = [];
const unmatched = [];
for (const d of dnRows) {
  let cid = null;
  for (const c of candidates(d.masterCode, d.code)) {
    cid = exact.get(c) || strip.get(c);
    if (cid) break;
  }
  if (cid) { matched++; resolved.push({ ...d, cabinetId: cid }); }
  else unmatched.push(d);
}

console.log('DN rows:', dnRows.length, '| matched:', matched, '| unmatched:', unmatched.length);
// Categorize unmatched by prefix
const byPrefix = {};
for (const u of unmatched) {
  const p = (u.code.match(/^[A-Za-z]+/) || ['?'])[0];
  byPrefix[p] = (byPrefix[p] || 0) + 1;
}
console.log('\nUnmatched by code prefix:');
for (const [p, n] of Object.entries(byPrefix).sort((a,b)=>b[1]-a[1])) console.log(`  ${p}: ${n}`);

fs.writeFileSync('/home/ubuntu/cabinet-dealz/notes/dn_resolved.json',
  JSON.stringify({ resolved, unmatched }, null, 2));
console.log('\nWrote', resolved.length, 'resolved +', unmatched.length, 'unmatched to notes/dn_resolved.json');
await conn.end();
