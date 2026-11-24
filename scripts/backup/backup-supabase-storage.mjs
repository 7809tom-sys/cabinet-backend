#!/usr/bin/env node
// Downloads every object from every Supabase Storage bucket into <dest>/daily/YYYY-MM-DD/<bucket>/<path>.
// READ-ONLY on Supabase: only list and download calls are made. Nothing is deleted, moved or overwritten there.
// Usage: node scripts/backup/backup-supabase-storage.mjs --dest "E:\CabinetDealzBackups" [--env "C:\path\backup.env"] [--date YYYY-MM-DD] [--concurrency 4]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { chicagoDate, parseArgs, loadEnv, supabaseConfig, safeRelPath, joinInside, formatBytes, DATE_RE } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.dest || args.dest === true) {
  console.error('Missing --dest. Example: --dest "E:\\CabinetDealzBackups"');
  process.exit(2);
}
const date = args.date && args.date !== true ? args.date : chicagoDate();
if (!DATE_RE.test(date)) { console.error("--date must be YYYY-MM-DD"); process.exit(2); }
const concurrency = Math.max(1, Number(args.concurrency) || 4);

let cfg;
try { cfg = supabaseConfig(loadEnv(args.env)); } catch (e) { console.error(e.message); process.exit(2); }

const snapDir = path.resolve(args.dest, "daily", date);
fs.mkdirSync(snapDir, { recursive: true });
const failures = [];
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

async function api(url, init = {}, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...cfg.headers, ...(init.headers || {}) } });
      if (res.status >= 500 || res.status === 429) { last = new Error(`HTTP ${res.status}`); await new Promise((r) => setTimeout(r, 1000 * (i + 1))); continue; }
      return res;
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
  }
  throw last;
}

async function listBuckets() {
  const res = await api(`${cfg.storageUrl}/bucket`);
  if (!res.ok) throw new Error(`Could not list buckets: HTTP ${res.status}`);
  return (await res.json()).map((b) => ({ name: b.name, public: !!b.public }));
}

// Recursively list objects. Folder entries have id === null.
async function listObjects(bucket, prefix = "", out = []) {
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await api(`${cfg.storageUrl}/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: pageSize, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`List failed for ${bucket}/${prefix}: HTTP ${res.status}`);
    const items = await res.json();
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null || it.id === undefined) await listObjects(bucket, full, out);
      else out.push({ path: full, size: Number(it.metadata?.size ?? 0), updated_at: it.updated_at ?? it.created_at ?? null });
    }
    if (items.length < pageSize) break;
  }
  return out;
}

async function sha256File(file) {
  const h = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), h);
  return h.digest("hex");
}

async function downloadOne(bucket, obj) {
  const rel = safeRelPath(obj.path);
  const dest = joinInside(snapDir, bucket, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Resume: skip when a file of the expected size is already there.
  if (fs.existsSync(dest) && obj.size > 0 && fs.statSync(dest).size === obj.size) {
    return { ...obj, local: `${bucket}/${rel}`, sha256: await sha256File(dest), skipped: true };
  }
  const encoded = obj.path.split("/").map(encodeURIComponent).join("/");
  const res = await api(`${cfg.storageUrl}/object/${encodeURIComponent(bucket)}/${encoded}`);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const part = `${dest}.part`;
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const src = Readable.fromWeb(res.body);
  src.on("data", (c) => { hash.update(c); bytes += c.length; });
  await pipeline(src, fs.createWriteStream(part));
  fs.renameSync(part, dest);
  return { ...obj, size: bytes, local: `${bucket}/${rel}`, sha256: hash.digest("hex"), skipped: false };
}

async function pool(items, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < items.length) { const item = items[i++]; await worker(item); }
  }));
}

const buckets = await listBuckets();
log(`Buckets found: ${buckets.map((b) => `${b.name}${b.public ? " (public)" : " (private)"}`).join(", ") || "none"}`);
for (const must of ["site-media", "private-files"]) {
  if (!buckets.some((b) => b.name === must)) { failures.push(`Expected bucket missing: ${must}`); log(`WARNING: expected bucket ${must} not found`); }
}

const manifest = { date, time_zone: "America/Chicago", generated_at: new Date().toISOString(), buckets: {}, totals: { objects: 0, bytes: 0, failed: 0 } };
for (const b of buckets) {
  log(`Listing ${b.name} ...`);
  let objects = [];
  try { objects = await listObjects(b.name); } catch (e) { failures.push(`${b.name}: ${e.message}`); continue; }
  log(`${b.name}: ${objects.length} objects. Downloading ...`);
  const done = []; let bytes = 0, failed = 0, skipped = 0, n = 0;
  await pool(objects, async (obj) => {
    try {
      const r = await downloadOne(b.name, obj);
      done.push({ path: r.path, local_path: r.local, size: r.size, updated_at: r.updated_at, sha256: r.sha256 });
      bytes += r.size; if (r.skipped) skipped++;
    } catch (e) { failed++; failures.push(`${b.name}/${obj.path}: ${e.message}`); }
    if (++n % 200 === 0) log(`${b.name}: ${n}/${objects.length}`);
  });
  done.sort((a, c) => a.path.localeCompare(c.path));
  manifest.buckets[b.name] = { public: b.public, listed: objects.length, objects: done.length, bytes, failed, skipped_already_downloaded: skipped, files: done };
  manifest.totals.objects += done.length; manifest.totals.bytes += bytes; manifest.totals.failed += failed;
}

// The manifest holds file names and hashes only. No keys are ever written.
fs.writeFileSync(path.join(snapDir, "manifest.json"), JSON.stringify(manifest, null, 2));
const lines = [
  "Cabinet Dealz Supabase file backup",
  `Date (America/Chicago): ${date}`,
  `Finished: ${new Date().toISOString()}`,
  ...Object.entries(manifest.buckets).map(([n, v]) => `  ${n}: ${v.objects} of ${v.listed} files, ${formatBytes(v.bytes)}, failed ${v.failed}`),
  `TOTAL: ${manifest.totals.objects} files, ${formatBytes(manifest.totals.bytes)}`,
  `Failures: ${failures.length}`,
  ...failures.slice(0, 200).map((f) => `  - ${f}`),
  failures.length ? "RESULT: FAILED (see list above)" : "RESULT: OK",
];
fs.writeFileSync(path.join(snapDir, "SUMMARY.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
process.exit(failures.length ? 1 : 0);
