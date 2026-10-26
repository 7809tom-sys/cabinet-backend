// One-off: optimize the 61 oversized door-sample photos.
//
// For each distinct door sample image:
//   1. download original via Forge presign-get
//   2. resize to max 900px on the long edge + compress (Pillow, via python3)
//   3. upload the optimized version via Forge presign-put under a new key
//   4. update every door_styles row that referenced the old URL to the new one
//
// Idempotent-ish: we only process keys that are NOT already suffixed "_opt".
// Originals are left in storage untouched (detail views could still use them,
// but we repoint everything to the smaller version which looks identical at the
// sizes actually rendered).
import mysql from "mysql2/promise";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, "");
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DB = process.env.DATABASE_URL;
const MAX_EDGE = 900; // px — generous for any place a door photo is shown
const JPEG_Q = 82;

function keyFromUrl(u) {
  const m = String(u || "").match(/\/manus-storage\/(.+)$/);
  return m ? m[1] : null;
}
async function presignGet(key) {
  const url = new URL("v1/storage/presign/get", FORGE_URL + "/");
  url.searchParams.set("path", key);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${FORGE_KEY}` } });
  if (!r.ok) throw new Error(`presign-get ${r.status}`);
  return (await r.json()).url;
}
async function presignPut(key) {
  const url = new URL("v1/storage/presign/put", FORGE_URL + "/");
  url.searchParams.set("path", key);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${FORGE_KEY}` } });
  if (!r.ok) throw new Error(`presign-put ${r.status}`);
  return (await r.json()).url;
}
function hash8() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

const tmp = mkdtempSync(join(tmpdir(), "dooropt-"));
const PY = `
import sys
from PIL import Image
src, dst, max_edge, q = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src)
im = im.convert("RGB")
w, h = im.size
scale = min(1.0, max_edge / float(max(w, h)))
if scale < 1.0:
    im = im.resize((max(1, int(w*scale)), max(1, int(h*scale))), Image.LANCZOS)
im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)
print(im.size[0], im.size[1])
`;
const pyFile = join(tmp, "resize.py");
writeFileSync(pyFile, PY);

const conn = await mysql.createConnection(DB);
const [rows] = await conn.execute(
  "SELECT DISTINCT doorSampleImageUrl AS u FROM door_styles WHERE doorSampleImageUrl IS NOT NULL AND doorSampleImageUrl <> ''"
);

let done = 0, skipped = 0, totalBefore = 0, totalAfter = 0;
for (const { u } of rows) {
  const key = keyFromUrl(u);
  if (!key) { skipped++; continue; }
  if (key.includes("_opt")) { skipped++; continue; } // already optimized

  try {
    const signed = await presignGet(key);
    const resp = await fetch(signed);
    if (!resp.ok) throw new Error(`download ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    totalBefore += buf.length;

    const inFile = join(tmp, "in_" + hash8());
    const outFile = join(tmp, "out_" + hash8() + ".jpg");
    writeFileSync(inFile, buf);
    execFileSync("python3", [pyFile, inFile, outFile, String(MAX_EDGE), String(JPEG_Q)], { stdio: ["ignore", "pipe", "pipe"] });
    const outBuf = readFileSync(outFile);
    totalAfter += outBuf.length;

    // New key: keep a readable name, add _opt + a hash, force .jpg
    const base = key.replace(/\.[a-zA-Z0-9]+$/, "").replace(/_[0-9a-f]{8}$/, "");
    const newKey = `${base}_opt_${hash8()}.jpg`;

    const putUrl = await presignPut(newKey);
    const up = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Blob([outBuf], { type: "image/jpeg" }) });
    if (!up.ok) throw new Error(`upload ${up.status}`);

    const newUrl = `/manus-storage/${newKey}`;
    const [res] = await conn.execute(
      "UPDATE door_styles SET doorSampleImageUrl = ? WHERE doorSampleImageUrl = ?",
      [newUrl, u]
    );
    done++;
    console.log(`OK  ${(buf.length/1048576).toFixed(2)}MB -> ${(outBuf.length/1024).toFixed(0)}KB  rows=${res.affectedRows}  ${newKey}`);
  } catch (e) {
    skipped++;
    console.log(`ERR ${key}: ${String(e)}`);
  }
}
await conn.end();
console.log(`\nDONE optimized=${done} skipped=${skipped}  before=${(totalBefore/1048576).toFixed(1)}MB after=${(totalAfter/1048576).toFixed(2)}MB`);
