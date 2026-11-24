#!/usr/bin/env node
// Asks the Cabinet Dealz API for the backup schedule and decides whether a backup is due now.
// Prints ONE line of JSON. Always exits 0. If the API is unreachable it uses the cached schedule
// (schedule-cache.json next to this script), or 03:00 America/New_York.
// Usage: node check-due.mjs --dest "E:\CabinetDealzBackups" --env "C:\CabinetDealzBackup\backup.env" [--cache file] [--force]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, loadEnv, DEFAULT_BACKUP_API_URL } from "./lib.mjs";
import { DEFAULT_SCHEDULE, isBackupDue, isValidDailyTime, isValidTimezone, isValidRetentionDays } from "./schedule.mjs";

const args = parseArgs(process.argv.slice(2));
const here = path.dirname(fileURLToPath(import.meta.url));
const cacheFile = args.cache && args.cache !== true ? args.cache : path.join(here, "schedule-cache.json");
const env = loadEnv(args.env);
const apiBase = (env.BACKUP_API_URL || DEFAULT_BACKUP_API_URL).replace(/\/+$/, "");

function validSchedule(s) {
  return s && isValidDailyTime(s.dailyTime) && isValidTimezone(s.timezone) && isValidRetentionDays(s.retentionDays);
}

let schedule = null, source = "default";
try {
  if (!env.BACKUP_REPORT_TOKEN) throw new Error("no token");
  const res = await fetch(`${apiBase}/api/backups/schedule`, { headers: { "x-backup-token": env.BACKUP_REPORT_TOKEN }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!validSchedule(body)) throw new Error("bad schedule");
  schedule = { dailyTime: body.dailyTime, timezone: body.timezone, retentionDays: body.retentionDays };
  source = "api";
  try { fs.writeFileSync(cacheFile, JSON.stringify(schedule)); } catch { /* cache is best effort */ }
} catch {
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (validSchedule(cached)) { schedule = cached; source = "cache"; }
  } catch { /* fall through */ }
}
if (!schedule) schedule = { ...DEFAULT_SCHEDULE };

// Local dates that already have a good snapshot on the drive.
const doneDates = [];
const daily = path.join(args.dest && args.dest !== true ? args.dest : ".", "daily");
try {
  for (const d of fs.readdirSync(daily)) {
    try { if (/RESULT: OK/.test(fs.readFileSync(path.join(daily, d, "SUMMARY.txt"), "utf8"))) doneDates.push(d); } catch { /* not finished */ }
  }
} catch { /* no daily folder yet */ }

const decision = isBackupDue({ dailyTime: schedule.dailyTime, timezone: schedule.timezone, doneDates });
if (args.force && decision.today) { decision.due = true; decision.reason = "forced"; }
console.log(JSON.stringify({ ...decision, schedule, source }));
