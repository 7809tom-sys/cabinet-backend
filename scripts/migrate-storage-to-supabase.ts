/**
 * One-time copy of legacy /manus-storage files into Supabase Storage under
 * their ORIGINAL keys, so existing database URLs keep working unchanged.
 *
 *   pnpm exec tsx --env-file=.env scripts/migrate-storage-to-supabase.ts <keys.txt> [options]
 *
 *   <keys.txt>        one storage key per line (no /manus-storage/ prefix)
 *   --source <url>    legacy base URL (default https://www.cabinetdealz.com/manus-storage)
 *   --from-dir <dir>  read files from a local copy (<dir>/<key>) instead of --source
 *   --limit <n>       only process the first n keys (e.g. a 20-file test)
 *   --report <file>   JSON-lines result log (default storage-migration-report.jsonl)
 *   --concurrency <n> parallel transfers (default 4)
 *   --dry-run         check source and destination only, upload nothing
 *
 * Safe to re-run: keys already in Supabase are skipped, never overwritten.
 */
import fs from "node:fs";
import path from "node:path";
import { bucketForKey, storageUploadExact } from "../server/storage";
import { ENV } from "../server/_core/env";
import { imageMimeFromBytes } from "../server/_core/storageProxy";

const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const VALUE_FLAGS = new Set(["--source", "--from-dir", "--limit", "--report", "--concurrency"]);
const keysFile = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]));
if (!keysFile) {
  console.error("Usage: migrate-storage-to-supabase.ts <keys.txt> [--source url] [--limit n] [--report file] [--dry-run]");
  process.exit(1);
}
const SOURCE = (flag("--source") ?? "https://www.cabinetdealz.com/manus-storage").replace(/\/+$/, "");
const FROM_DIR = flag("--from-dir");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;
const REPORT = flag("--report") ?? "storage-migration-report.jsonl";
const DRY_RUN = args.includes("--dry-run");
const CONCURRENCY = Number(flag("--concurrency") ?? 4);

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif",
  hdr: "image/vnd.radiance", glb: "model/gltf-binary", mp4: "video/mp4", webm: "video/webm",
};

const encodeKeyPath = (key: string) => key.split("/").map(encodeURIComponent).join("/");
const storageBase = `${ENV.supabaseUrl.replace(/\/+$/, "")}/storage/v1`;
const auth = { apikey: ENV.supabaseServiceRoleKey, Authorization: `Bearer ${ENV.supabaseServiceRoleKey}` };

async function existsInSupabase(key: string): Promise<boolean> {
  const resp = await fetch(`${storageBase}/object/authenticated/${bucketForKey(key)}/${encodeKeyPath(key)}`, {
    method: "HEAD",
    headers: auth,
  });
  return resp.ok;
}

type Result = { key: string; bucket: string; status: "exists" | "copied" | "would-copy" | "missing-at-source" | "failed"; bytes?: number; detail?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Network drops ("fetch failed") are retried with backoff; real HTTP errors are not. */
async function migrateKey(key: string): Promise<Result> {
  let result: Result = { key, bucket: bucketForKey(key), status: "failed" };
  for (let attempt = 1; attempt <= 4; attempt++) {
    result = await migrateKeyOnce(key);
    if (result.status !== "failed" || !/fetch failed|ECONN|ETIMEDOUT|UND_ERR|socket|terminated/i.test(result.detail ?? "")) return result;
    await sleep(1000 * 2 ** attempt);
  }
  return result;
}

async function migrateKeyOnce(key: string): Promise<Result> {
  const bucket = bucketForKey(key);
  try {
    if (await existsInSupabase(key)) return { key, bucket, status: "exists" };
    let bytes: Uint8Array;
    let upstreamType = "";
    if (FROM_DIR) {
      const file = path.join(FROM_DIR, ...key.split("/"));
      if (!fs.existsSync(file)) return { key, bucket, status: "missing-at-source", detail: "not in folder" };
      bytes = new Uint8Array(fs.readFileSync(file));
    } else {
      const source = await fetch(`${SOURCE}/${encodeKeyPath(key)}`, { redirect: "follow" });
      if (source.status === 403 || source.status === 404) return { key, bucket, status: "missing-at-source", detail: String(source.status) };
      if (!source.ok) return { key, bucket, status: "failed", detail: `source ${source.status}` };
      bytes = new Uint8Array(await source.arrayBuffer());
      upstreamType = source.headers.get("content-type") ?? "";
    }
    if (bytes.length === 0) return { key, bucket, status: "failed", detail: "empty source body" };
    if (DRY_RUN) return { key, bucket, status: "would-copy", bytes: bytes.length };
    const ext = key.includes(".") ? key.split(".").pop()!.toLowerCase() : "";
    // Many media-library keys have no extension, so sniff image/PDF signatures.
    const contentType = upstreamType && upstreamType !== "application/octet-stream"
      ? upstreamType
      : EXT_TYPES[ext] ?? imageMimeFromBytes(bytes) ?? (isPdf(bytes) ? "application/pdf" : "application/octet-stream");
    await storageUploadExact(key, bytes, contentType);
    return { key, bucket, status: "copied", bytes: bytes.length };
  } catch (error) {
    const cause = error instanceof Error ? (error.cause as { code?: string; message?: string } | undefined) : undefined;
    const detail = (error instanceof Error ? error.message : String(error)) + (cause ? ` (${cause.code ?? cause.message ?? ""})` : "");
    // A concurrent or earlier run already stored it.
    if (/\(409\)|Duplicate|already exists/i.test(detail)) return { key, bucket, status: "exists" };
    return { key, bucket, status: "failed", detail: detail.slice(0, 300) };
  }
}

async function main() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) throw new Error("SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const keys = fs.readFileSync(keysFile!, "utf8").split(/\r?\n/).map((k) => k.trim().replace(/^\/?manus-storage\//, "")).filter(Boolean);
  const queue = keys.slice(0, LIMIT);
  console.log(`${DRY_RUN ? "[dry run] " : ""}${queue.length} of ${keys.length} keys from ${FROM_DIR ?? SOURCE}`);

  const counts: Record<string, number> = {};
  const out = fs.createWriteStream(REPORT, { flags: "a" });
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < queue.length) {
      const result = await migrateKey(queue[next++]);
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      out.write(JSON.stringify(result) + "\n");
      if (result.status === "failed" || result.status === "missing-at-source") console.log(`  ${result.status}: ${result.key} ${result.detail ?? ""}`);
      if (++done % 100 === 0) console.log(`  ${done}/${queue.length}`, JSON.stringify(counts));
    }
  }));
  out.end();
  console.log("done:", JSON.stringify(counts), `report: ${REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
