// Countertop fabrication shops: import, and ZIP matching for countertop quotes.
// Pure logic lives in @shared/fabricationShops; this file is the database side.
// Every read here tolerates the tables not existing yet (docs/sql/0291 not run):
// the quote list keeps working and simply shows no shops.

import { and, eq, inArray } from "drizzle-orm";
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
