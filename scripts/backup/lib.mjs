// Shared helpers for the backup scripts. Pure functions only (no network) so they can be unit tested.
import fs from "node:fs";
import path from "node:path";

export const TIME_ZONE = "America/New_York"; // default; Tom's schedule can change it
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const GROUPS = [
  { name: "days-01-30", from: 1, to: 30 },
  { name: "days-31-60", from: 31, to: 60 },
  { name: "days-61-90", from: 61, to: 90 },
];

/** YYYY-MM-DD for a moment in a time zone (default America/New_York). */
export function zonedDate(now = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const chicagoDate = (now = new Date()) => zonedDate(now, "America/Chicago");

function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Snapshot "day number": today's snapshot is day 1, yesterday's is day 2, and so on. */
export function snapshotDay(snapshotDate, today) {
  return dayNumber(today) - dayNumber(snapshotDate) + 1;
}

/** retention: days to keep (default 90). Days 91..retention (only when retention > 90) go in "days-91-plus". */
export function groupForDay(day, retention = 90) {
  if (day < 1) return "future";
  const g = GROUPS.find((x) => day >= x.from && day <= x.to);
  if (g) return g.name;
  return day <= retention ? "days-91-plus" : "older-than-90";
}

/** Plan the 90-day layout. Names that are not YYYY-MM-DD are ignored (never touched). */
export function planRotation(names, today, retention = 90) {
  const valid = names.filter((n) => DATE_RE.test(n)).sort().reverse();
  const plan = { "days-01-30": [], "days-31-60": [], "days-61-90": [], "days-91-plus": [], "older-than-90": [], future: [], ignored: names.filter((n) => !DATE_RE.test(n)) };
  for (const name of valid) {
    const day = snapshotDay(name, today);
    plan[groupForDay(day, retention)].push({ name, day });
  }
  return plan;
}

/** Make a path segment safe for Windows and POSIX file systems. */
export function safeSegment(seg) {
  let s = seg.replace(/[<>:"|?*\\\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "_");
  if (s === "" ) s = "_";
  if (s === "." || s === "..") s = "_";
  return s;
}

export function safeRelPath(objectPath) {
  return objectPath.split("/").filter((s) => s !== "").map(safeSegment).join("/");
}

/** Join and make sure the result stays inside root. Throws otherwise. */
export function joinInside(root, ...parts) {
  const full = path.resolve(root, ...parts);
  const rel = path.relative(path.resolve(root), full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing path outside ${root}`);
  }
  return full;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

export function parseEnvText(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    const q = v.match(/^(["'])(.*?)\1(?:\s+#.*)?$/);
    if (q) v = q[2];
    else v = v.replace(/\s+#.*$/, "");
    env[m[1]] = v;
  }
  return env;
}

/** Process env wins; a --env file fills in anything missing. Never logs values. */
export function loadEnv(envFile) {
  const merged = {};
  if (envFile && envFile !== true) {
    if (!fs.existsSync(envFile)) throw new Error(`--env file not found: ${envFile}`);
    Object.assign(merged, parseEnvText(fs.readFileSync(envFile, "utf8")));
  }
  for (const [k, v] of Object.entries(process.env)) if (v) merged[k] = v;
  return merged;
}

export function supabaseConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY. Put them in the file given with --env.");
  return { storageUrl: `${url.replace(/\/+$/, "")}/storage/v1`, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(2)} ${u[i]}`;
}
