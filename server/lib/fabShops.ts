// Countertop fabrication shops: import, and ZIP matching for countertop quotes.
// Pure logic lives in @shared/fabricationShops; this file is the database side.
// Every read here tolerates the tables not existing yet (docs/sql/0291 not run):
// the quote list keeps working and simply shows no shops.

import { and, eq, inArray, sql } from "drizzle-orm";
import { countertopQuoteFabShops, fabricationShops, type FabricationShop } from "../../drizzle/schema";
import {
  FAB_SHOP_MATCH_LIMIT,
  FAB_SHOP_MATCH_RADIUS_MILES,
  matchFabShopsForZip,
  planFabShopImport,
  type ExistingFabShop,
  type FabShopImportPlan,
  type FabShopRow,
  type FabShopValues,
} from "@shared/fabricationShops";
import { normalizeZip } from "@shared/availability";
import { US_ZIP_LOCALITIES } from "@shared/data/usZipLocalities";
import type { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const FAB_SHOP_INSERT_CHUNK = 200;

/** True when the error is "table doesn't exist" (0291 not run yet). */
export function isMissingTableError(error: unknown): boolean {
  const text = String((error as { message?: unknown; cause?: { message?: unknown } })?.message ?? "")
    + String((error as { cause?: { message?: unknown } })?.cause?.message ?? "")
    + String((error as { code?: unknown })?.code ?? "")
    + String((error as { cause?: { code?: unknown } })?.cause?.code ?? "");
  return /ER_NO_SUCH_TABLE|doesn't exist|does not exist|1146/i.test(text);
}

/** State for a 5-digit ZIP from the offline ZIP list ("Tampa|FL" -> "FL"). */
export function stateForZip(zip: string | null | undefined): string | null {
  const zip5 = normalizeZip(zip);
  if (!zip5) return null;
  const value = US_ZIP_LOCALITIES[zip5];
  return value ? value.split("|")[1] ?? null : null;
}

export type FabShopImportStore = {
  loadExisting(): Promise<ExistingFabShop[]>;
  insert(rows: FabShopValues[]): Promise<void>;
};

export type FabShopImportResult = {
  dryRun: boolean;
  inserted: number;
  toImport: number;
  byState: FabShopImportPlan["byState"];
  duplicates: FabShopImportPlan["duplicates"];
  skipped: FabShopImportPlan["skipped"];
  zipFromCity: number;
  noZip: number;
};

export async function importFabShops(
  store: FabShopImportStore,
  input: { rows: FabShopRow[]; sourceDoc: string; defaultState?: string | null; dryRun: boolean },
): Promise<FabShopImportResult> {
  const plan = planFabShopImport(input.rows, await store.loadExisting(), { sourceDoc: input.sourceDoc, defaultState: input.defaultState });
  let inserted = 0;
  if (!input.dryRun) {
    for (let i = 0; i < plan.toInsert.length; i += FAB_SHOP_INSERT_CHUNK) {
      const chunk = plan.toInsert.slice(i, i + FAB_SHOP_INSERT_CHUNK);
      await store.insert(chunk);
      inserted += chunk.length;
    }
  }
  return {
    dryRun: input.dryRun,
    inserted,
    toImport: plan.toInsert.length,
    byState: plan.byState,
    duplicates: plan.duplicates,
    skipped: plan.skipped,
    zipFromCity: plan.zipFromCity,
    noZip: plan.noZip,
  };
}

export function dbFabShopImportStore(db: Db): FabShopImportStore {
  return {
    async loadExisting() {
      return db
        .select({ name: fabricationShops.name, zip: fabricationShops.zip, city: fabricationShops.city, state: fabricationShops.state, website: fabricationShops.website })
        .from(fabricationShops);
    },
    async insert(rows) {
      if (!rows.length) return;
      await db.insert(fabricationShops).values(rows.map((row) => ({
        ...row,
        googleRating: row.googleRating == null ? null : String(row.googleRating),
      })));
    },
  };
}

export type QuoteFabShopView = {
  fabShopId: number;
  name: string;
  city: string | null;
  state: string;
  zip: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  confidence: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  distanceMiles: number | null;
  method: string;
  /** "suggested" when computed live and not saved on the quote yet. */
  status: "suggested" | "matched" | "contacted" | "quoted" | "declined";
  note: string | null;
};

function shopView(shop: FabricationShop, extra: Pick<QuoteFabShopView, "distanceMiles" | "method" | "status" | "note">): QuoteFabShopView {
  return {
    fabShopId: shop.id,
    name: shop.name,
    city: shop.city,
    state: shop.state,
    zip: shop.zip,
    address: shop.address,
    phone: shop.phone,
    email: shop.email,
    website: shop.website,
    confidence: shop.confidence,
    googleRating: shop.googleRating == null ? null : Number(shop.googleRating),
    reviewCount: shop.reviewCount,
    ...extra,
  };
}

export type MatchOptions = { radiusMiles?: number; limit?: number };

export function liveMatches(shops: readonly FabricationShop[], zip: string | null | undefined, options: MatchOptions = {}) {
  return matchFabShopsForZip(zip, shops, {
    radiusMiles: options.radiusMiles ?? FAB_SHOP_MATCH_RADIUS_MILES,
    limit: options.limit ?? FAB_SHOP_MATCH_LIMIT,
    state: stateForZip(zip),
  });
}

/**
 * Shops for each quote: the shops saved on the quote when there are any,
 * otherwise live suggestions for the quote ZIP (not saved). Returns an empty
 * list per quote when the shop tables are not created yet.
 */
export async function fabShopsForQuotes(
  db: Db,
  quotes: readonly { id: number; zip: string | null }[],
  options: MatchOptions = {},
): Promise<{ ready: boolean; byQuote: Record<number, QuoteFabShopView[]> }> {
  const byQuote: Record<number, QuoteFabShopView[]> = {};
  for (const quote of quotes) byQuote[quote.id] = [];
  if (!quotes.length) return { ready: true, byQuote };
  let shops: FabricationShop[];
  let links: (typeof countertopQuoteFabShops.$inferSelect)[];
  try {
    shops = await db.select().from(fabricationShops);
    links = await db.select().from(countertopQuoteFabShops).where(inArray(countertopQuoteFabShops.quoteId, quotes.map((q) => q.id)));
  } catch (error) {
    if (isMissingTableError(error)) return { ready: false, byQuote };
    throw error;
  }
  const shopById = new Map(shops.map((shop) => [shop.id, shop]));
  for (const quote of quotes) {
    const saved = links
      .filter((link) => link.quoteId === quote.id && shopById.has(link.fabShopId))
      .map((link) => shopView(shopById.get(link.fabShopId)!, {
        distanceMiles: link.distanceMiles == null ? null : Number(link.distanceMiles),
        method: link.matchMethod,
        status: link.status,
        note: link.note,
      }))
      .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
    byQuote[quote.id] = saved.length
      ? saved
      : liveMatches(shops, quote.zip, options).map((match) => shopView(match.shop, {
        distanceMiles: match.distanceMiles,
        method: match.method,
        status: "suggested",
        note: null,
      }));
  }
  return { ready: true, byQuote };
}

/**
 * Save the nearest shops on a quote (adds only; a shop already on the quote
 * keeps its status). Returns how many were added. Sends nothing.
 */
export async function attachFabShopsToQuote(db: Db, quote: { id: number; zip: string | null }, options: MatchOptions = {}): Promise<number> {
  const shops = await db.select().from(fabricationShops);
  const matches = liveMatches(shops, quote.zip, options);
  if (!matches.length) return 0;
  const existing = await db
    .select({ fabShopId: countertopQuoteFabShops.fabShopId })
    .from(countertopQuoteFabShops)
    .where(eq(countertopQuoteFabShops.quoteId, quote.id));
  const have = new Set(existing.map((row) => row.fabShopId));
  const fresh = matches.filter((match) => !have.has(match.shop.id));
  if (!fresh.length) return 0;
  await db.insert(countertopQuoteFabShops).values(fresh.map((match) => ({
    quoteId: quote.id,
    fabShopId: match.shop.id,
    distanceMiles: match.distanceMiles == null ? null : String(match.distanceMiles),
    matchMethod: match.method,
  })));
  return fresh.length;
}

/** Best effort for a new quote: never throws, so a quote request can't fail on this. */
export async function attachFabShopsToNewQuote(db: Db, quote: { id: number; zip: string | null }): Promise<void> {
  if (!normalizeZip(quote.zip)) return;
  try {
    await attachFabShopsToQuote(db, quote);
  } catch (error) {
    if (!isMissingTableError(error)) console.warn("[fabShops] could not attach shops to countertop quote", quote.id, error);
  }
}

export async function setQuoteFabShopStatus(
  db: Db,
  input: { quoteId: number; fabShopId: number; status: "matched" | "contacted" | "quoted" | "declined"; note?: string | null },
): Promise<void> {
  const where = and(eq(countertopQuoteFabShops.quoteId, input.quoteId), eq(countertopQuoteFabShops.fabShopId, input.fabShopId));
  const found = await db.select({ id: countertopQuoteFabShops.id }).from(countertopQuoteFabShops).where(where);
  const patch = { status: input.status, ...(input.note !== undefined ? { note: input.note?.trim() ? input.note.trim().slice(0, 500) : null } : {}) };
  if (found.length) {
    await db.update(countertopQuoteFabShops).set(patch).where(where);
    return;
  }
  // A suggested shop the admin follows up on gets saved on the quote.
  const [shop] = await db.select().from(fabricationShops).where(eq(fabricationShops.id, input.fabShopId));
  if (!shop) throw new Error("Fabrication shop not found.");
  await db.insert(countertopQuoteFabShops).values({ quoteId: input.quoteId, fabShopId: input.fabShopId, matchMethod: "manual", ...patch });
}

// ---------------------------------------------------------------------------
// Past uploads and undo. Every upload saves its "Source" text on each shop
// (sourceDoc), so one upload can be listed and removed by that exact text.
// Rows with no sourceDoc are never listed for undo and never deleted here.

export const FAB_SHOP_DELETE_CHUNK = 500;

export type FabShopImportSummary = {
  sourceDoc: string;
  shops: number;
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
  quoteMatches: number;
  /** Quote matches someone followed up on (status other than "matched"). */
  quoteMatchesFollowedUp: number;
};

type ShopGroup = { sourceDoc: string | null; shops: number | string; firstCreatedAt: unknown; lastCreatedAt: unknown };
type MatchGroup = { sourceDoc: string | null; matches: number | string | null; followedUp: number | string | null };

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

/** Merge the per-upload shop counts with their quote match counts, newest upload first. */
export function summarizeFabShopImports(shopGroups: readonly ShopGroup[], matchGroups: readonly MatchGroup[]): FabShopImportSummary[] {
  const matches = new Map<string, { matches: number; followedUp: number }>();
  for (const group of matchGroups) {
    if (!group.sourceDoc) continue;
    matches.set(group.sourceDoc, { matches: Number(group.matches ?? 0), followedUp: Number(group.followedUp ?? 0) });
  }
  return shopGroups
    .filter((group): group is ShopGroup & { sourceDoc: string } => typeof group.sourceDoc === "string" && group.sourceDoc.length > 0)
    .map((group) => ({
      sourceDoc: group.sourceDoc,
      shops: Number(group.shops),
      firstCreatedAt: isoOrNull(group.firstCreatedAt),
      lastCreatedAt: isoOrNull(group.lastCreatedAt),
      quoteMatches: matches.get(group.sourceDoc)?.matches ?? 0,
      quoteMatchesFollowedUp: matches.get(group.sourceDoc)?.followedUp ?? 0,
    }))
    .sort((a, b) => (b.lastCreatedAt ?? "").localeCompare(a.lastCreatedAt ?? "") || a.sourceDoc.localeCompare(b.sourceDoc));
}

export async function listFabShopImports(db: Db): Promise<FabShopImportSummary[]> {
  const shopGroups = await db
    .select({
      sourceDoc: fabricationShops.sourceDoc,
      shops: sql<number>`count(*)`,
      firstCreatedAt: sql<unknown>`min(${fabricationShops.createdAt})`,
      lastCreatedAt: sql<unknown>`max(${fabricationShops.createdAt})`,
    })
    .from(fabricationShops)
    .groupBy(fabricationShops.sourceDoc);
  const matchGroups = await db
    .select({
      sourceDoc: fabricationShops.sourceDoc,
      matches: sql<number>`count(*)`,
      followedUp: sql<number>`sum(case when ${countertopQuoteFabShops.status} <> 'matched' then 1 else 0 end)`,
    })
    .from(countertopQuoteFabShops)
    .innerJoin(fabricationShops, eq(countertopQuoteFabShops.fabShopId, fabricationShops.id))
    .groupBy(fabricationShops.sourceDoc);
  return summarizeFabShopImports(shopGroups, matchGroups);
}

export type FabShopUndoStore = {
  /** Ids of the shops saved with exactly this sourceDoc. */
  shopIds(sourceDoc: string): Promise<number[]>;
  /** Deletes the quote matches, then the shops; returns how many of each went. */
  deleteShops(ids: number[]): Promise<{ quoteMatches: number; shops: number }>;
};

export class FabShopUndoMismatchError extends Error {
  constructor(readonly current: number, readonly confirmed: number) {
    super(`This upload has ${current} shop${current === 1 ? "" : "s"} now, not ${confirmed}. Reload the list and try again.`);
    this.name = "FabShopUndoMismatchError";
  }
}

/**
 * Remove every shop from one upload (exact sourceDoc match) and the quote
 * matches pointing at them. Refuses unless confirmCount equals the current
 * number of shops for that sourceDoc, so a stale screen can't delete more.
 */
export async function undoFabShopImport(
  store: FabShopUndoStore,
  input: { sourceDoc: string; confirmCount: number },
): Promise<{ sourceDoc: string; deletedShops: number; deletedQuoteMatches: number }> {
  const sourceDoc = input.sourceDoc;
  if (!sourceDoc.trim()) throw new Error("Pick an upload to undo.");
  const ids = await store.shopIds(sourceDoc);
  if (ids.length !== input.confirmCount) throw new FabShopUndoMismatchError(ids.length, input.confirmCount);
  if (!ids.length) return { sourceDoc, deletedShops: 0, deletedQuoteMatches: 0 };
  const deleted = await store.deleteShops(ids);
  return { sourceDoc, deletedShops: deleted.shops, deletedQuoteMatches: deleted.quoteMatches };
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: unknown })?.affectedRows ?? 0);
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function undoStoreFor(db: Db | Tx): FabShopUndoStore {
  return {
    async shopIds(sourceDoc) {
      const rows = await db.select({ id: fabricationShops.id }).from(fabricationShops).where(eq(fabricationShops.sourceDoc, sourceDoc));
      return rows.map((row) => row.id);
    },
    async deleteShops(ids) {
      let quoteMatches = 0;
      let shops = 0;
      for (let i = 0; i < ids.length; i += FAB_SHOP_DELETE_CHUNK) {
        const chunk = ids.slice(i, i + FAB_SHOP_DELETE_CHUNK);
        quoteMatches += affectedRows(await db.delete(countertopQuoteFabShops).where(inArray(countertopQuoteFabShops.fabShopId, chunk)));
      }
      for (let i = 0; i < ids.length; i += FAB_SHOP_DELETE_CHUNK) {
        const chunk = ids.slice(i, i + FAB_SHOP_DELETE_CHUNK);
        shops += affectedRows(await db.delete(fabricationShops).where(inArray(fabricationShops.id, chunk)));
      }
      return { quoteMatches, shops };
    },
  };
}

/** Undo one upload inside a transaction: nothing is deleted unless all of it is. */
export async function undoFabShopImportInDb(db: Db, input: { sourceDoc: string; confirmCount: number }) {
  return db.transaction(async (tx) => undoFabShopImport(undoStoreFor(tx), input));
}
