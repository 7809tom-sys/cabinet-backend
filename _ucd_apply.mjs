// Apply UCD catalog corrections derived from the PDF source of truth.
//
// Steps:
//   1. Load PDF truth (ucd_pdf_truth2.csv) + tier map.
//   2. Backup all UCD distributor_skus rows to backup_ucd_skus.json.
//   3. For every UCD sku:
//        - determine its style tier + PDF row (by exact distributorSku).
//        - if no PDF row, or PDF price for that tier is null, or a
//          shaker-white-only item in non-SW style, or casselberry-only item in
//          non-CW/CS style  => DELETE (unpriced/unavailable => remove).
//        - else UPDATE listPrice to the exact tier price and recompute ladder.
//   4. Delete orphan skus (styleId not a UCD style).
//   5. Print a summary. Use --apply to actually write; default is dry-run.
import mysql from 'mysql2/promise';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const AUDIT_DIR = '/home/ubuntu/ucd_audit';

function parseCsv(path) {
  const text = fs.readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const o = {};
    headers.forEach((h, i) => (o[h] = cells[i]));
    return o;
  });
}
function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const TIER = { SW:1,SA:1,SD:1,SG:1,SI:1,SN:1,SB:1,SH:1,SC:1,EW:1,
  OW:2,OS:2,OM:2,OT:2, CW:3,CS:3,HE:3, SEO:4,HD:4 };
const CASSELBERRY = new Set(['CW', 'CS']);

// Normalize a DB distributorSku to the matching PDF product code.
// Returns the PDF code string, or null if it should be treated as unmatched.
function pdfCodeFor(distSku) {
  let c = String(distSku).trim().toUpperCase();
  // Strip a trailing style-id artifact like CDB-36-30055 -> CDB-36
  c = c.replace(/-(3\d{4})$/, '');
  // Roll-out shelves: RS18 -> RS18-TYPEA
  let m = c.match(/^RS(\d{2})$/);
  if (m) return `RS${m[1]}-TYPEA`;
  // Base Easy Reach: DB uses ERBnn, PDF uses BERnn
  m = c.match(/^ERB(\d+)$/);
  if (m) return `BER${m[1]}`;
  // Drawer bases with CC- prefix:
  //   CC-2DBnn -> 2DBnn ; CC-3DBnn -> 3DBnn ; CC-DBnn -> 3DBnn (plain = 3-drawer)
  m = c.match(/^CC-(2DB\d+)$/);
  if (m) return m[1];
  m = c.match(/^CC-(3DB\d+)$/);
  if (m) return m[1];
  m = c.match(/^CC-DB(\d+)$/);
  if (m) return `3DB${m[1]}`;
  return c;
}

const round2 = (n) => Math.round(n * 100) / 100;
function ladder(listPrice, costMult) {
  const yourCost = round2(listPrice * costMult);
  const adjList = round2(yourCost / 0.30);
  return {
    yourCost,
    adjList,
    wholesale: round2(adjList * 0.50),
    contractor: round2(adjList * 0.60),
    homeowner: round2(adjList * 0.80),
  };
}

const pdfRows = parseCsv(`${AUDIT_DIR}/ucd_pdf_truth2.csv`);
const pdf = {};
for (const r of pdfRows) pdf[r.code.trim().toUpperCase()] = r;
function tierPrice(r, t) {
  const v = r[`price_t${t}`];
  return v === '' || v == null ? null : parseInt(v, 10);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dists] = await conn.execute('SELECT id, name, code, costMultiplier FROM distributors');
const ucd = dists.find((d) => /cabinet depot/i.test(d.name) || d.code === 'UCD');
const costMult = parseFloat(ucd.costMultiplier);
const [styles] = await conn.execute('SELECT id, styleCode FROM door_styles WHERE distributorId = ?', [ucd.id]);
const sid2code = Object.fromEntries(styles.map((s) => [s.id, s.styleCode]));
const ucdStyleIds = new Set(styles.map((s) => s.id));

const [skus] = await conn.execute(
  `SELECT s.id, s.cabinetId, s.styleId, s.platformSku, s.distributorSku,
          s.listPrice, s.yourCost, s.adjustedListPrice, s.wholesalePrice,
          s.contractorPrice, s.homeownerPrice
   FROM distributor_skus s WHERE s.distributorId = ?`, [ucd.id]);

// Backup
fs.writeFileSync(`${AUDIT_DIR}/backup_ucd_skus.json`, JSON.stringify({ when: new Date().toISOString(), distributorId: ucd.id, skus }, null, 2));
console.log(`Backed up ${skus.length} UCD skus.`);

const toDelete = [];   // sku ids
const toUpdate = [];   // {id, listPrice, ladder}
const deleteReasons = {};
let orphanDel = 0;

for (const s of skus) {
  if (!ucdStyleIds.has(s.styleId)) { toDelete.push(s.id); orphanDel++; continue; }
  const sc = sid2code[s.styleId];
  const tier = TIER[sc];
  const code = pdfCodeFor(s.distributorSku);
  const r = pdf[code];
  let reason = null;
  if (!r) reason = 'no_pdf_row';
  else if (r.shaker_white_only === 'True' && sc !== 'SW') reason = 'shaker_white_only';
  else if (r.casselberry_only === 'True' && !CASSELBERRY.has(sc)) reason = 'casselberry_only';
  else if (tierPrice(r, tier) == null) reason = 'no_price_in_tier';

  if (reason) {
    toDelete.push(s.id);
    deleteReasons[reason] = (deleteReasons[reason] || 0) + 1;
    continue;
  }
  const want = tierPrice(r, tier);
  const cur = s.listPrice == null ? null : parseFloat(s.listPrice);
  const L = ladder(want, costMult);
  // Recompute the FULL ladder whenever ANY field diverges from the PDF-derived
  // value — not just listPrice/yourCost. The original seed left some rows with a
  // correct listPrice but an inconsistent wholesale/contractor/homeowner ladder.
  const diff = (a, b) => a == null || Math.abs(parseFloat(a) - b) >= 0.5;
  const needs =
    diff(cur, want) ||
    diff(s.yourCost, L.yourCost) ||
    diff(s.adjustedListPrice, L.adjList) ||
    diff(s.wholesalePrice, L.wholesale) ||
    diff(s.contractorPrice, L.contractor) ||
    diff(s.homeownerPrice, L.homeowner);
  if (needs) toUpdate.push({ id: s.id, listPrice: want, ...L });
}

console.log('\n=== CORRECTION PLAN ===');
console.log('DELETE total:', toDelete.length, '(orphans:', orphanDel, ', reasons:', JSON.stringify(deleteReasons), ')');
console.log('UPDATE prices:', toUpdate.length);
console.log('KEEP unchanged:', skus.length - toDelete.length - toUpdate.length);

if (!APPLY) {
  console.log('\nDRY RUN (no changes). Re-run with --apply to execute.');
  await conn.end();
  process.exit(0);
}

// Apply deletes in chunks
async function chunkedDelete(ids) {
  const CH = 500;
  for (let i = 0; i < ids.length; i += CH) {
    const part = ids.slice(i, i + CH);
    const placeholders = part.map(() => '?').join(',');
    await conn.execute(`DELETE FROM distributor_skus WHERE id IN (${placeholders})`, part);
  }
}
await chunkedDelete(toDelete);
console.log(`Deleted ${toDelete.length} skus.`);

let done = 0;
for (const u of toUpdate) {
  await conn.execute(
    `UPDATE distributor_skus SET listPrice=?, yourCost=?, adjustedListPrice=?, wholesalePrice=?, contractorPrice=?, homeownerPrice=? WHERE id=?`,
    [u.listPrice, u.yourCost, u.adjList, u.wholesale, u.contractor, u.homeowner, u.id]);
  done++;
  if (done % 500 === 0) process.stdout.write(`  updated ${done}...\r`);
}
console.log(`\nUpdated ${done} sku prices.`);

await conn.end();
console.log('DONE.');
