import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getDb } from "../db";

/**
 * In-memory cache for public, read-mostly catalog procedures.
 *
 * The key is the procedure name plus its parsed input, so an affiliate slug,
 * a page, or a category never shares another caller's result. Responses that
 * depend on the signed-in user are not stored. Search text is not stored
 * either: those keys are unique and would crowd out the pages shoppers reuse.
 *
 * Invalidation is process-local. A second server copy can serve the previous
 * result until the TTL. Admin, vendor, and supplier mutations clear this
 * process immediately.
 */

export const PUBLIC_CATALOG_CACHE_TTL_MS = 60_000;
export const PUBLIC_CATALOG_CACHE_MAX_ENTRIES = 300;
export const PUBLIC_CATALOG_CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=60";

export const CATALOG_TAGS = {
  pelican: "pelican",
  doorStyles: "door-styles",
  cabinets: "cabinets",
  pageContent: "page-content",
} as const;

/** Procedures whose anonymous GET body is safe for a shared HTTP cache. */
export const PUBLIC_CATALOG_HTTP_PATHS = new Set([
  "pelican.byCategory",
  "pelican.bySlug",
  "pelican.relatedProducts",
  "pelican.categories",
  "doorStyles.featured",
  "doorStyles.list",
  "doorStyles.publicRoomScenes",
  "doorStyles.specificationReferences",
  "cabinets.list",
  "cabinets.listForStyle",
  "cabinets.categories",
  "cabinets.subCategories",
  "pageContent.getAll",
  "pageContent.getPage",
  "storefront.families",
  "storefront.doorStyleTypes",
]);

type CacheEntry = {
  value: unknown;
  expiresAt: number;
  tags: string[];
  storedAt: number;
};

const store = new Map<string, CacheEntry>();
const serverTiming = new WeakMap<object, string>();

let cacheForcedForTests = false;

export function resetPublicCatalogCache(): void {
  store.clear();
}

/** Vitest leaves the cache off so a direct database write cannot go stale. */
export function enablePublicCatalogCacheForTests(enabled: boolean): void {
  cacheForcedForTests = enabled;
}

export function publicCatalogCacheEnabled(): boolean {
  if (cacheForcedForTests) return true;
  if (process.env.VITEST || process.env.NODE_ENV === "test") return false;
  return true;
}

export function stablePublicCatalogKey(procedure: string, input: unknown): string {
  return `${procedure}\0${stableStringify(input ?? null)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function publicCatalogInputIsCacheable(input: unknown): boolean {
  if (!input || typeof input !== "object") return true;
  const record = input as { search?: unknown; scope?: unknown };
  if (record.scope === "admin") return false;
  return !(typeof record.search === "string" && record.search.trim().length > 0);
}

function copy<T>(value: T): T {
  if (typeof structuredClone !== "function") return value;
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function evictIfNeeded(now: number): void {
  const expired: string[] = [];
  store.forEach((entry, key) => {
    if (entry.expiresAt <= now) expired.push(key);
  });
  expired.forEach((key) => store.delete(key));
  while (store.size > PUBLIC_CATALOG_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    store.forEach((entry, key) => {
      if (entry.storedAt < oldestAt) {
        oldestAt = entry.storedAt;
        oldestKey = key;
      }
    });
    if (oldestKey == null) break;
    store.delete(oldestKey);
  }
}

export function invalidatePublicCatalogCache(tags?: readonly string[]): void {
  if (!tags || tags.length === 0) {
    store.clear();
    return;
  }
  const drop = new Set(tags);
  const stale: string[] = [];
  store.forEach((entry, key) => {
    if (entry.tags.some((tag) => drop.has(tag))) stale.push(key);
  });
  stale.forEach((key) => store.delete(key));
}

export function catalogServerTimingFor(res: object | undefined): string | undefined {
  if (!res) return undefined;
  return serverTiming.get(res);
}

function noteServerTiming(res: object | undefined, elapsedMs: number, hit: boolean): void {
  if (!res) return;
  const value = `catalog;dur=${Math.max(0, Math.round(elapsedMs))};desc="${hit ? "hit" : "miss"}"`;
  serverTiming.set(res, value);
  const writable = res as { setHeader?: (name: string, value: string) => void };
  if (typeof writable.setHeader !== "function") return;
  try {
    writable.setHeader("Server-Timing", value);
  } catch {
    // The adapter may already have started the body. The responseMeta hook
    // still copies the timing captured above.
  }
}

export async function cachedPublicCatalog<T>(args: {
  procedure: string;
  input: unknown;
  tags: readonly string[];
  load: () => Promise<T>;
  ttlMs?: number;
  now?: number;
  res?: object;
}): Promise<T> {
  const ttlMs = args.ttlMs ?? PUBLIC_CATALOG_CACHE_TTL_MS;
  if (!publicCatalogInputIsCacheable(args.input)) {
    const started = Date.now();
    const value = await args.load();
    noteServerTiming(args.res, Date.now() - started, false);
    return value;
  }
  const now = args.now ?? Date.now();
  const key = stablePublicCatalogKey(args.procedure, args.input);
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    noteServerTiming(args.res, 0, true);
    return copy(hit.value) as T;
  }
  const started = Date.now();
  const value = await args.load();
  const elapsed = Date.now() - started;
  store.set(key, {
    value: copy(value),
    expiresAt: now + ttlMs,
    tags: [...args.tags],
    storedAt: now,
  });
  evictIfNeeded(now);
  noteServerTiming(args.res, elapsed, false);
  if (elapsed >= 500) {
    console.info(`[catalog-cache] ${args.procedure} miss ${elapsed}ms`);
  }
  return copy(value);
}

type PublicCtx = {
  req?: CreateExpressContextOptions["req"];
  res?: CreateExpressContextOptions["res"];
};

export async function servePublicCatalog<T>(args: {
  procedure: string;
  ctx: PublicCtx;
  input: unknown;
  tags: readonly string[];
  fallback: T;
  load: () => Promise<T>;
}): Promise<T> {
  if (!publicCatalogCacheEnabled()) return args.load();
  const db = await getDb();
  if (!db) return args.fallback;
  return cachedPublicCatalog({
    procedure: args.procedure,
    input: args.input ?? null,
    tags: args.tags,
    load: args.load,
    res: args.ctx?.res,
  });
}

export function publicCatalogResponseHeaders(args: {
  method: string | undefined;
  paths: readonly string[] | undefined;
  type: string;
  errors: readonly unknown[];
  eagerGeneration?: boolean;
  authorization: string | string[] | undefined;
  testAccount: string | string[] | undefined;
  serverTiming?: string;
}): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (args.serverTiming) headers["Server-Timing"] = args.serverTiming;
  const paths = args.paths ?? [];
  const cacheable = args.type === "query"
    && !args.eagerGeneration
    && args.errors.length === 0
    && args.method === "GET"
    && paths.length === 1
    && PUBLIC_CATALOG_HTTP_PATHS.has(paths[0])
    && !headerPresent(args.authorization)
    && !headerPresent(args.testAccount);
  if (cacheable) {
    headers["Cache-Control"] = PUBLIC_CATALOG_CACHE_CONTROL;
    // tRPC already sends `vary: trpc-accept`. responseMeta replaces that
    // header, so keep both values.
    headers.Vary = "trpc-accept, Authorization";
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function headerPresent(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0);
  return typeof value === "string" && value.trim().length > 0;
}
