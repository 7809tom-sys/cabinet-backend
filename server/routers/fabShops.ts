// Admin-only: countertop fabrication shops (upload by state, list) and the shops
// matched to each countertop quote by ZIP. Nothing here emails or calls a shop.

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { countertopQuotes, fabricationShops } from "../../drizzle/schema";
import { FAB_SHOP_FIELDS, FAB_SHOP_MATCH_LIMIT, FAB_SHOP_MATCH_RADIUS_MILES, FAB_SHOP_UPLOAD_MAX_ROWS } from "@shared/fabricationShops";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { resolveRequestStoreScope } from "../lib/affiliateHostScope";
import {
  attachFabShopsToQuote,
  dbFabShopImportStore,
  fabShopsForQuotes,
  FabShopUndoMismatchError,
  importFabShops,
  isMissingTableError,
  listFabShopImports,
  setQuoteFabShopStatus,
  undoFabShopImportInDb,
} from "../lib/fabShops";

const shopRow = z.object(
  Object.fromEntries(FAB_SHOP_FIELDS.map((field) => [field, z.string().max(1000).optional()])) as Record<(typeof FAB_SHOP_FIELDS)[number], z.ZodOptional<z.ZodString>>,
);

const matchOptions = {
  radiusMiles: z.number().min(1).max(500).optional(),
  limit: z.number().int().min(1).max(25).optional(),
};

const NOT_READY = "The fabrication shop tables are not created yet. Run docs/sql/0291 in the TiDB SQL editor first.";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
  return db;
}

async function rethrow<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingTableError(error)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: NOT_READY });
    throw error;
  }
}

/** The quote, only when it belongs to the store this request is on. */
async function scopedQuote(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, req: Parameters<typeof resolveRequestStoreScope>[0], quoteId: number) {
  const scope = await resolveRequestStoreScope(req);
  const where = scope.pinned
    ? and(eq(countertopQuotes.id, quoteId), eq(countertopQuotes.affiliateId, scope.affiliateId!))
    : eq(countertopQuotes.id, quoteId);
  const [quote] = await db.select({ id: countertopQuotes.id, zip: countertopQuotes.zip }).from(countertopQuotes).where(where);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Countertop quote not found in this store." });
  return quote;
}

export const fabShopsRouter = router({
  defaults: adminProcedure.query(() => ({ radiusMiles: FAB_SHOP_MATCH_RADIUS_MILES, limit: FAB_SHOP_MATCH_LIMIT })),

  list: adminProcedure
    .input(z.object({ state: z.string().trim().max(2).nullish() }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      try {
        const rows = await db.select().from(fabricationShops);
        const counts = new Map<string, number>();
        for (const row of rows) counts.set(row.state, (counts.get(row.state) ?? 0) + 1);
        const state = input?.state?.toUpperCase() || null;
        return {
          ready: true,
          total: rows.length,
          states: Array.from(counts.entries()).map(([code, count]) => ({ state: code, count })).sort((a, b) => a.state.localeCompare(b.state)),
          shops: rows
            .filter((row) => !state || row.state === state)
            .sort((a, b) => a.state.localeCompare(b.state) || (a.city ?? "").localeCompare(b.city ?? "") || a.name.localeCompare(b.name)),
        };
      } catch (error) {
        if (isMissingTableError(error)) return { ready: false, total: 0, states: [], shops: [] };
        throw error;
      }
    }),

  importShops: adminProcedure
    .input(z.object({
      rows: z.array(shopRow).min(1).max(FAB_SHOP_UPLOAD_MAX_ROWS),
      sourceDoc: z.string().trim().min(1).max(200),
      defaultState: z.string().trim().max(32).nullish(),
      dryRun: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      return rethrow(() => importFabShops(dbFabShopImportStore(db), input));
    }),

  /** Past uploads: one row per Source text, with shop and quote match counts. */
  imports: adminProcedure.query(async () => {
    const db = await requireDb();
    try {
      return { ready: true, imports: await listFabShopImports(db) };
    } catch (error) {
      if (isMissingTableError(error)) return { ready: false, imports: [] };
      throw error;
    }
  }),

  /**
   * Undo one upload: removes the shops saved with exactly this Source text and
   * the quote matches pointing at them. confirmCount must equal the current
   * shop count for that Source, or nothing is deleted.
   */
  undoImport: adminProcedure
    .input(z.object({ sourceDoc: z.string().min(1).max(200), confirmCount: z.number().int().min(1) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      try {
        return await rethrow(() => undoFabShopImportInDb(db, input));
      } catch (error) {
        if (error instanceof FabShopUndoMismatchError) throw new TRPCError({ code: "CONFLICT", message: error.message });
        throw error;
      }
    }),

  /** Shops for each quote: saved ones first, otherwise live suggestions for the ZIP. */
  forQuotes: adminProcedure
    .input(z.object({ quoteIds: z.array(z.number().int()).max(500), ...matchOptions }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      if (!input.quoteIds.length) return { ready: true, byQuote: {} as Record<number, never[]> };
      const scope = await resolveRequestStoreScope(ctx.req);
      const rows = await db.select({ id: countertopQuotes.id, zip: countertopQuotes.zip, affiliateId: countertopQuotes.affiliateId }).from(countertopQuotes);
      const wanted = new Set(input.quoteIds);
      const quotes = rows.filter((row) => wanted.has(row.id) && (!scope.pinned || row.affiliateId === scope.affiliateId));
      return fabShopsForQuotes(db, quotes, input);
    }),

  /** Save the nearest shops on one quote. Adds only; sends nothing. */
  attachToQuote: adminProcedure
    .input(z.object({ quoteId: z.number().int(), ...matchOptions }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const quote = await scopedQuote(db, ctx.req, input.quoteId);
      return { added: await rethrow(() => attachFabShopsToQuote(db, quote, input)) };
    }),

  /** Follow-up status for one shop on one quote, set by hand. */
  setQuoteShopStatus: adminProcedure
    .input(z.object({
      quoteId: z.number().int(),
      fabShopId: z.number().int(),
      status: z.enum(["matched", "contacted", "quoted", "declined"]),
      note: z.string().max(500).nullish(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await scopedQuote(db, ctx.req, input.quoteId);
      await rethrow(() => setQuoteFabShopStatus(db, input));
      return { ok: true };
    }),
});
