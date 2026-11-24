#!/usr/bin/env node
// Writes <dest>/INDEX.txt grouping daily snapshots into days 1-30, 31-60 and 61-90 (today = day 1).
// Snapshots older than 90 days are only LISTED ("would remove") unless --prune is given.
// It never moves snapshots and never touches anything outside <dest>/daily.
// Usage: node scripts/backup/rotate-backups.mjs --dest "E:\CabinetDealzBackups" [--prune] [--today YYYY-MM-DD]
import fs from "node:fs";
import path from "node:path";
import { chicagoDate, parseArgs, planRotation, joinInside, DATE_RE } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.dest || args.dest === true) { console.error('Missing --dest. Example: --dest "E:\\CabinetDealzBackups"'); process.exit(2); }
const today = args.today && args.today !== true ? args.today : chicagoDate();
if (!DATE_RE.test(today)) { console.error("--today must be YYYY-MM-DD"); process.exit(2); }

const dest = path.resolve(args.dest);
const daily = path.join(dest, "daily");
if (!fs.existsSync(daily)) { console.error(`Nothing to rotate: ${daily} does not exist`); process.exit(2); }

const names = fs.readdirSync(daily, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const plan = planRotation(names, today);

const out = [`Cabinet Dealz backup index (as of ${today}, America/Chicago)`, "Day 1 = today's snapshot, day 2 = yesterday, ...", ""];
for (const g of ["days-01-30", "days-31-60", "days-61-90"]) {
  out.push(`${g}  (${plan[g].length} snapshots)`);
  for (const s of plan[g]) {
    const ok = fs.existsSync(path.join(daily, s.name, "SUMMARY.txt")) && /RESULT: OK/.test(fs.readFileSync(path.join(daily, s.name, "SUMMARY.txt"), "utf8"));
    out.push(`  ${s.name}  day ${s.day}  ${ok ? "ok" : "CHECK: no OK summary"}`);
  }
  out.push("");
}
let removed = 0;
if (plan["older-than-90"].length) {
  out.push(`older-than-90  (${plan["older-than-90"].length} snapshots) ${args.prune ? "REMOVED" : "would remove (run with --prune to delete)"}`);
  for (const s of plan["older-than-90"]) {
    out.push(`  ${s.name}  day ${s.day}`);
    if (args.prune) { fs.rmSync(joinInside(daily, s.name), { recursive: true, force: true }); removed++; }
  }
  out.push("");
}
if (plan.future.length) out.push(`Ignored (dated in the future): ${plan.future.map((s) => s.name).join(", ")}`, "");
if (plan.ignored.length) out.push(`Ignored (not a date folder, left alone): ${plan.ignored.join(", ")}`, "");
fs.writeFileSync(path.join(dest, "INDEX.txt"), out.join("\n"));
console.log(out.join("\n"));
console.log(args.prune ? `Pruned ${removed} snapshot(s).` : "Dry run for deletion: nothing removed.");
