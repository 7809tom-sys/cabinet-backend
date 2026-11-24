#!/usr/bin/env node
// Restores files from a backup snapshot back into Supabase Storage. NEVER run automatically.
// Refuses to overwrite objects that already exist unless --overwrite is given. Use --dry-run first.
// Usage: node scripts/backup/restore-supabase-storage.mjs --snapshot "E:\CabinetDealzBackups\daily\2026-11-23" --bucket site-media [--prefix catalog/] [--env file] [--overwrite] [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { parseArgs, loadEnv, supabaseConfig, joinInside } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.snapshot || !args.bucket || args.snapshot === true || args.bucket === true) {
  console.error("Usage: --snapshot <daily/DATE folder> --bucket <name> [--prefix p/] [--env file] [--overwrite] [--dry-run]"); process.exit(2);
}
const cfg = supabaseConfig(loadEnv(args.env));
const manifest = JSON.parse(fs.readFileSync(path.join(args.snapshot, "manifest.json"), "utf8"));
const b = manifest.buckets[args.bucket];
if (!b) { console.error(`Bucket ${args.bucket} is not in this snapshot. Has: ${Object.keys(manifest.buckets).join(", ")}`); process.exit(2); }
const prefix = args.prefix && args.prefix !== true ? args.prefix : "";
const files = b.files.filter((f) => f.path.startsWith(prefix));
let ok = 0, skipped = 0, failed = 0;
for (const f of files) {
  if (args["dry-run"]) { console.log(`would restore ${args.bucket}/${f.path}`); continue; }
  const local = joinInside(args.snapshot, f.local_path);
  const encoded = f.path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${cfg.storageUrl}/object/${encodeURIComponent(args.bucket)}/${encoded}`, {
    method: "POST",
    headers: { ...cfg.headers, "x-upsert": args.overwrite ? "true" : "false", "Content-Type": "application/octet-stream" },
    body: fs.readFileSync(local),
  });
  if (res.ok) ok++;
  else if (!args.overwrite && (res.status === 409 || res.status === 400)) { skipped++; console.log(`exists, left alone: ${f.path}`); }
  else { failed++; console.error(`FAILED ${f.path}: HTTP ${res.status}`); }
}
console.log(`Done. restored ${ok}, left alone ${skipped}, failed ${failed}, matched ${files.length}.`);
process.exit(failed ? 1 : 0);
