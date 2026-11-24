#!/usr/bin/env node
// Tells the Cabinet Dealz admin Backups tab that a backup started or finished. Never blocks the backup:
// on any problem it prints a warning and exits 0. Sends no file names and no customer data.
// Usage:
//   node report-run.mjs start  --env F --machine NAME --dest PATH --scope supabase_storage,database
//   node report-run.mjs finish --env F --run-id N --machine NAME --dest PATH --scope ... --status success|partial|failed --snapshot DIR --error "text"
import fs from "node:fs";
import path from "node:path";
import { parseArgs, loadEnv, DEFAULT_BACKUP_API_URL } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const event = args._[0];
const env = loadEnv(args.env);
const apiBase = (env.BACKUP_API_URL || DEFAULT_BACKUP_API_URL).replace(/\/+$/, "");
const str = (v) => (v && v !== true ? String(v) : "");

const body = {
  event, runId: args["run-id"] ? Number(args["run-id"]) : undefined,
  machineName: str(args.machine) || "unknown", destination: str(args.dest),
  scope: str(args.scope).split(",").filter(Boolean),
  startedAt: str(args.started) || undefined,
};
if (event === "finish") {
  body.status = str(args.status) || "failed";
  body.finishedAt = new Date().toISOString();
  body.snapshotFolder = str(args.snapshot);
  body.errorSummary = str(args.error).slice(0, 2000);
  try {
    const m = JSON.parse(fs.readFileSync(path.join(body.snapshotFolder, "manifest.json"), "utf8"));
    body.fileCount = m.totals?.objects ?? 0; body.totalBytes = m.totals?.bytes ?? 0;
  } catch { /* no manifest: counts stay empty */ }
}
try {
  if (!env.BACKUP_REPORT_TOKEN) throw new Error("BACKUP_REPORT_TOKEN is not set in the key file");
  const res = await fetch(`${apiBase}/api/backups/report`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-backup-token": env.BACKUP_REPORT_TOKEN },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = await res.json();
  console.log(JSON.stringify({ ok: true, runId: out.runId ?? null }));
} catch (e) {
  console.error(`WARNING: could not report to the admin Backups tab (${e.message}). The backup itself is not affected.`);
  console.log(JSON.stringify({ ok: false, runId: null }));
}
process.exit(0);
