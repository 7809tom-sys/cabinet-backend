// One-off: list all door-sample + catalog image keys and their byte sizes.
// Uses DATABASE_URL + Forge presign-get to measure each asset.
import mysql from "mysql2/promise";

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, "");
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DB = process.env.DATABASE_URL;

function keyFromUrl(u) {
  if (!u) return null;
  const m = String(u).match(/\/manus-storage\/(.+)$/);
  return m ? m[1] : null;
}

async function presignGet(key) {
  const url = new URL("v1/storage/presign/get", FORGE_URL + "/");
  url.searchParams.set("path", key);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${FORGE_KEY}` } });
  if (!r.ok) throw new Error(`presign ${r.status}`);
  const { url: signed } = await r.json();
  return signed;
}

async function headSize(signed) {
  // Range request 0-0 to read Content-Range total without downloading the body.
  const r = await fetch(signed, { headers: { Range: "bytes=0-0" } });
  const cr = r.headers.get("content-range"); // bytes 0-0/12345
  if (cr) {
    const m = cr.match(/\/(\d+)$/);
    if (m) return Number(m[1]);
  }
  const cl = r.headers.get("content-length");
  return cl ? Number(cl) : null;
}

const conn = await mysql.createConnection(DB);
const [doors] = await conn.execute(
  "SELECT DISTINCT doorSampleImageUrl AS u FROM door_styles WHERE doorSampleImageUrl IS NOT NULL AND doorSampleImageUrl <> ''"
);
const [cabs] = await conn.execute(
  "SELECT DISTINCT catalogImageUrl AS u FROM cabinets WHERE catalogImageUrl IS NOT NULL AND catalogImageUrl <> ''"
);
await conn.end();

const rows = [];
for (const group of [["door", doors], ["cab", cabs]]) {
  const [label, list] = group;
  for (const { u } of list) {
    const key = keyFromUrl(u);
    if (!key) continue;
    try {
      const signed = await presignGet(key);
      const size = await headSize(signed);
      rows.push({ label, key, size });
    } catch (e) {
      rows.push({ label, key, size: -1, err: String(e) });
    }
  }
}

rows.sort((a, b) => (b.size || 0) - (a.size || 0));
let total = 0;
for (const r of rows) total += r.size > 0 ? r.size : 0;
console.log(`TOTAL assets=${rows.length} totalBytes=${total} (${(total / 1048576).toFixed(1)} MB)`);
console.log("Top 15 largest:");
for (const r of rows.slice(0, 15)) {
  console.log(`  ${r.label}  ${(r.size / 1048576).toFixed(2)} MB  ${r.key}`);
}
const doorRows = rows.filter((r) => r.label === "door");
const cabRows = rows.filter((r) => r.label === "cab");
const sum = (a) => a.reduce((s, r) => s + (r.size > 0 ? r.size : 0), 0);
console.log(`door assets=${doorRows.length} sum=${(sum(doorRows) / 1048576).toFixed(1)} MB avg=${(sum(doorRows) / Math.max(1, doorRows.length) / 1024).toFixed(0)} KB`);
console.log(`cab  assets=${cabRows.length} sum=${(sum(cabRows) / 1048576).toFixed(1)} MB avg=${(sum(cabRows) / Math.max(1, cabRows.length) / 1024).toFixed(0)} KB`);
