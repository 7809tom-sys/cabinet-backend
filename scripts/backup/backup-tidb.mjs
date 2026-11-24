#!/usr/bin/env node
// Optional: dumps schema cabinet_dealz to <dest>/daily/YYYY-MM-DD/database/cabinet_dealz.sql.gz using mysqldump
// (--single-transaction, no table locks). Skips with a message if mysqldump is not installed. Installs nothing.
// Usage: node scripts/backup/backup-tidb.mjs --dest "E:\CabinetDealzBackups" [--env "C:\path\backup.env"] [--date YYYY-MM-DD] [--tz America/New_York]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawn, spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { zonedDate, parseArgs, loadEnv, DATE_RE } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const tzArg = args.tz && args.tz !== true ? args.tz : "America/New_York";
if (!args.dest || args.dest === true) { console.error("Missing --dest"); process.exit(2); }
const date = args.date && args.date !== true ? args.date : zonedDate(new Date(), tzArg);
if (!DATE_RE.test(date)) { console.error("--date must be YYYY-MM-DD"); process.exit(2); }

const probe = spawnSync("mysqldump", ["--version"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.log("SKIPPED database dump: mysqldump is not installed (or not on PATH). TiDB Cloud's own daily backup still runs. See docs/BACKUPS.md.");
  process.exit(0);
}
let url;
try { url = new URL(loadEnv(args.env).DATABASE_URL || ""); } catch { console.error("DATABASE_URL missing or invalid (put it in the --env file)."); process.exit(2); }
const dbName = "cabinet_dealz";
const help = spawnSync("mysqldump", ["--help"], { encoding: "utf8" }).stdout || "";
const flags = ["--single-transaction", "--skip-lock-tables", "--no-tablespaces", "--routines", "--default-character-set=utf8mb4",
  `--host=${url.hostname}`, `--port=${url.port || "4000"}`, `--user=${decodeURIComponent(url.username)}`];
if (help.includes("--ssl-mode")) flags.push("--ssl-mode=VERIFY_IDENTITY");
else if (help.includes("--ssl")) flags.push("--ssl");
if (help.includes("--column-statistics")) flags.push("--column-statistics=0");
flags.push(dbName);

const outDir = path.resolve(args.dest, "daily", date, "database");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${dbName}.sql.gz`);
// The password goes through the environment, never the command line or any file.
const child = spawn("mysqldump", flags, { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ["ignore", "pipe", "pipe"] });
let stderr = ""; child.stderr.on("data", (c) => { stderr += c; });
const done = new Promise((res) => child.on("close", res));
await pipeline(child.stdout, zlib.createGzip(), fs.createWriteStream(`${outFile}.part`));
const code = await done;
if (code !== 0) { fs.rmSync(`${outFile}.part`, { force: true }); console.error(`mysqldump failed (exit ${code}): ${stderr.replace(/\s+/g, " ").slice(0, 500)}`); process.exit(1); }
fs.renameSync(`${outFile}.part`, outFile);
console.log(`Database dump written: ${outFile} (${fs.statSync(outFile).size} bytes)`);
