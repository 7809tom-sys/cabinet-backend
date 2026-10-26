/**
 * Replace direct Manus CDN URLs (files.manuscdn.com, d2xsxph8kpxj0f.cloudfront.net)
 * stored in the database with first-party /manus-storage/legacy-cdn/<file> paths,
 * after uploading each file to Supabase Storage under that key. The storage proxy
 * already serves /manus-storage/<key> from Supabase, so nothing else changes.
 *
 *   pnpm exec tsx --env-file=.env scripts/migrate-manus-cdn-urls.ts --from-dir "manus storage/external" [--apply] [--backup file]
 *
 * Default is a dry run. With --apply it (1) uploads the files, (2) writes every
 * affected old value to the backup file, (3) rewrites the values, (4) re-counts.
 * Rewrites touch only the matching URL text; other data in a row is unchanged and
 * `updatedAt` is preserved.
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { storageUploadExact } from "../server/storage";
import { ENV } from "../server/_core/env";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const APPLY = args.includes("--apply");
const FROM_DIR = flag("--from-dir");
const BACKUP = flag("--backup") ?? "cdn-url-backup.jsonl";
if (!FROM_DIR) { console.error("--from-dir <folder with host__path__file files> is required"); process.exit(1); }

const URL_RE = /https?:\/\/(?:files\.manuscdn\.com|d2xsxph8kpxj0f\.cloudfront\.net)\/[^\s"'<>)\\]+/g;
const EXT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf" };
const fileNameFor = (url: string) => url.replace(/^https?:\/\//, "").split(/[?#]/)[0].split("/").join("__");
const keyFor = (url: string) => `legacy-cdn/${url.replace(/^https?:\/\//, "").split(/[?#]/)[0].split("/").pop()}`;

async function main() {
  const conn = await mysql.createConnection(ENV.databaseUrl || process.env.DATABASE_URL!);
  const [[{ db }]] = await conn.query("SELECT DATABASE() db") as any;
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} on database ${db}`);

  const [cols] = await conn.query(
    `SELECT table_name t, column_name c, data_type d FROM information_schema.columns
     WHERE table_schema=DATABASE() AND data_type IN ('varchar','text','mediumtext','longtext','json','tinytext','char') ORDER BY t, c`,
  ) as any;
  const [pkRows] = await conn.query(
    `SELECT table_name t, column_name c FROM information_schema.key_column_usage
     WHERE table_schema=DATABASE() AND constraint_name='PRIMARY' ORDER BY table_name, ordinal_position`,
  ) as any;
  const [updRows] = await conn.query(
    `SELECT table_name t FROM information_schema.columns WHERE table_schema=DATABASE() AND column_name='updatedAt'`,
  ) as any;
  const pks = new Map<string, string[]>();
  for (const r of pkRows) pks.set(r.t, [...(pks.get(r.t) ?? []), r.c]);
  const hasUpdatedAt = new Set<string>(updRows.map((r: any) => r.t));

  // 1. Find every affected cell and the distinct URLs.
  type Hit = { t: string; c: string; d: string; pk: Record<string, unknown>; old: string };
  const hits: Hit[] = [];
  const urls = new Set<string>();
  for (const { t, c, d } of cols) {
    const pk = pks.get(t) ?? [];
    let rows: any[];
    try {
      [rows] = await conn.query(
        `SELECT ${pk.map((p) => `\`${p}\``).join(", ")}${pk.length ? ", " : ""}CAST(\`${c}\` AS CHAR) v FROM \`${t}\`
         WHERE CAST(\`${c}\` AS CHAR) LIKE '%manuscdn.com%' OR CAST(\`${c}\` AS CHAR) LIKE '%d2xsxph8kpxj0f%'`,
      ) as any;
    } catch { continue; }
    for (const row of rows) {
      const text = String(row.v);
      const found = [...text.matchAll(URL_RE)].map((m) => m[0]);
      if (!found.length) continue;
      found.forEach((u) => urls.add(u));
      hits.push({ t, c, d, pk: Object.fromEntries(pk.map((p) => [p, row[p]])), old: text });
    }
  }

  // 2. Every URL needs a local file and a unique target key.
  const plan = [...urls].map((url) => ({ url, file: path.join(FROM_DIR!, fileNameFor(url)), key: keyFor(url) }));
  const missing = plan.filter((p) => !fs.existsSync(p.file));
  const dupKeys = plan.filter((p, i) => plan.findIndex((q) => q.key === p.key && q.url !== p.url) !== -1 && i >= 0);
  console.log(`cells to rewrite: ${hits.length} | distinct URLs: ${plan.length} | files missing: ${missing.length} | key collisions: ${dupKeys.length}`);
  const perCol = new Map<string, number>();
  hits.forEach((h) => perCol.set(`${h.t}.${h.c}`, (perCol.get(`${h.t}.${h.c}`) ?? 0) + 1));
  console.log("cells by column:", JSON.stringify([...perCol]));
  const noPk = [...new Set(hits.filter((h) => !Object.keys(h.pk).length).map((h) => h.t))];
  if (noPk.length) console.log("tables without a primary key (rewritten by value, backup keyed by value):", noPk.join(", "));
  if (missing.length || dupKeys.length) { console.error("Aborting: missing files or colliding keys."); for (const m of missing) console.error("  missing", m.file); process.exit(1); }
  if (!APPLY) { for (const p of plan) console.log(`  ${p.key}  <-  ${p.url}`); console.log("Dry run only. Re-run with --apply."); await conn.end(); return; }

  // 3. Upload (never overwrites a different file silently: same key = same URL).
  for (const p of plan) {
    const ext = p.key.split(".").pop()?.toLowerCase() ?? "";
    await storageUploadExact(p.key, fs.readFileSync(p.file), EXT_TYPES[ext] ?? "application/octet-stream", { upsert: true });
  }
  console.log(`uploaded ${plan.length} files`);

  // 4. Backup every affected value before touching anything.
  fs.writeFileSync(BACKUP, hits.map((h) => JSON.stringify({ table: h.t, column: h.c, type: h.d, pk: h.pk, old: h.old })).join("\n") + "\n");
  console.log(`backup written: ${BACKUP} (${hits.length} cells)`);

  // 5. Rewrite per (table, column, url), keeping updatedAt unchanged.
  let changed = 0;
  for (const { t, c } of [...new Map(hits.map((h) => [`${h.t}.${h.c}`, h])).values()]) {
    for (const p of plan) {
      const target = `/manus-storage/${p.key}`;
      const [res] = await conn.query(
        `UPDATE \`${t}\` SET \`${c}\` = REPLACE(CAST(\`${c}\` AS CHAR), ?, ?)${hasUpdatedAt.has(t) ? ", `updatedAt` = `updatedAt`" : ""}
         WHERE CAST(\`${c}\` AS CHAR) LIKE ?`,
        [p.url, target, `%${p.url.replace(/[%_]/g, "\\$&")}%`],
      ) as any;
      changed += res.affectedRows ?? 0;
    }
  }
  console.log(`rows updated: ${changed}`);

  // 6. Verify nothing still points at the Manus CDN.
  let remaining = 0;
  for (const { t, c } of cols) {
    try {
      const [[r]] = await conn.query(
        `SELECT COUNT(*) n FROM \`${t}\` WHERE CAST(\`${c}\` AS CHAR) LIKE '%files.manuscdn.com%' OR CAST(\`${c}\` AS CHAR) LIKE '%d2xsxph8kpxj0f%'`,
      ) as any;
      remaining += Number(r.n);
    } catch { /* ignore */ }
  }
  console.log(`rows still referencing the Manus CDN: ${remaining}`);
  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
