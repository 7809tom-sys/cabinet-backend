import { z } from "zod";
import { eq, and, or, desc, inArray, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { sendEmailViaSettings, emailSettingsReady } from "../email";
import { resolvePresentation } from "../lib/presentation";
import {
  buildNetsuiteOrderCsv,
  buildOrderEmailText,
  type NetsuiteOrderLine,
} from "@shared/netsuiteOrder";
import { getDb, notInConflict } from "../db";
import {
  cabinets,
  distributorSkus,
  doorStyles,
  distributors,
  orderRequests,
  kitchenDesigns,
  affiliates,
  codeAliases,
  emailSettings,
  type OrderLineItem,
} from "../../drizzle/schema";
import { normalizeReferralCode } from "@shared/affiliate";
import { emitCrmEvent } from "../_core/crmWebhook";
import { validateFamilyLock } from "@shared/familyLock";
import {
  buildCodeIndex,
  matchCode,
  canonicalize,
  parseOrderCsv,
  type CabinetCodeRecord,
  type CodeMatch,
} from "@shared/codeMatch";
import { invokeLLM } from "../_core/llm";
import { sellPriceForTier } from "@shared/margins";
import { getPricingSettings } from "../db";
import { resolveMarkupBps } from "@shared/affiliateBranding";
import { affiliateStyleBranding } from "../../drizzle/schema";
import { buildAffiliateOrderPersistence } from "@shared/affiliateOrderAlias";
import { createCheckoutSession } from "../stripe";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { freightItemsHash, verifyFreightQuoteToken } from "../_core/freightQuoteToken";
import { calcSalesTax } from "@shared/usSalesTax";
import { isTemporaryOneDollarCheckoutTestItem, isTemporaryOneDollarFreeShippingOrder } from "@shared/temporaryCheckoutTest";

// Map the order tierEnum to the shared PricingTier.
const orderTier = (t: "Wholesale" | "Contractor" | "Homeowner") =>
  t === "Wholesale" ? ("wholesale" as const) : t === "Contractor" ? ("contractor" as const) : ("homeowner" as const);

/**
 * Accept a saved-plan link only when the caller owns that plan, is an
 * administrator, or is an authorized team member of the plan's affiliate.
 * The client-provided value is an association hint, never an authorization
 * decision or a source of document access on its own.
 */
async function resolveAuthorizedKitchenDesignId(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; email: string | null; role: string } | null | undefined,
  requestedDesignId: number | undefined,
	expectedAffiliateId: number | null,
): Promise<number | null> {
  if (!requestedDesignId) return null;
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in before associating an order with a saved plan." });
  }
  const [design] = await db
    .select({ id: kitchenDesigns.id, userId: kitchenDesigns.userId, affiliateId: kitchenDesigns.affiliateId })
    .from(kitchenDesigns)
    .where(eq(kitchenDesigns.id, requestedDesignId))
    .limit(1);
  if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Saved plan not found." });
	if (design.affiliateId !== expectedAffiliateId) {
	  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This saved plan belongs to a different store. Open the original store before ordering it." });
	}
  if (user.role === "admin" || design.userId === user.id) return design.id;

  const affiliateAccess = await resolveAffiliateAccess(db, user);
  const isAuthorizedAffiliateTeam = design.affiliateId != null
    && affiliateAccess?.affiliateId === design.affiliateId
    && (affiliateAccess.isOwner || affiliateAccess.accessDesigner || affiliateAccess.accessCrm);
  if (isAuthorizedAffiliateTeam) return design.id;

  throw new TRPCError({ code: "FORBIDDEN", message: "You cannot associate this order with another customer's saved plan." });
}

// ─── Shared types surfaced to the client ───────────────────────────────────────
export type RecAddOn = {
  id: number;
  masterCode: string;
  description: string;
  subCategory: string | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  unitPrice: number | null;
};

export type ExtractedLine = {
  rawCode: string;
  normalized: string;
  qty: number;
  cabinetId: number | null;
  masterCode: string | null;
  description: string | null;
  matched: boolean;
  confidence: CodeMatch["confidence"];
};

// Load the active master-code list once per request for matching.
async function loadCodeRecords(): Promise<CabinetCodeRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: cabinets.id,
      masterCode: cabinets.masterCode,
      description: cabinets.description,
      category: cabinets.category,
    })
    .from(cabinets)
    .where(and(eq(cabinets.isActive, true), notInConflict()));
  return rows;
}

function toExtractedLine(match: CodeMatch, qty: number): ExtractedLine {
  return {
    rawCode: match.rawCode,
    normalized: match.normalized,
    qty: Math.max(1, Math.round(qty || 1)),
    cabinetId: match.cabinetId,
    masterCode: match.masterCode,
    description: match.description,
    matched: match.matched,
    confidence: match.confidence,
  };
}

// Load persisted manual-fix aliases as a canonical-raw-code -> cabinet record map.
// Two-tier: global aliases (userId=NULL, set by admin) apply to everyone;
// per-user aliases (userId=<id>) override globals for that specific user.
// Only aliases whose target cabinet is still active are included.
async function loadAliasMap(
  records: CabinetCodeRecord[],
  userId?: number | null
): Promise<Map<string, CabinetCodeRecord>> {
  const db = await getDb();
  const map = new Map<string, CabinetCodeRecord>();
  if (!db) return map;
  const byId = new Map(records.map((r) => [r.id, r]));
  // Load global aliases first (userId IS NULL)
  const globalRows = await db
    .select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId })
    .from(codeAliases)
    .where(sql`${codeAliases.userId} IS NULL`);
  for (const a of globalRows) {
    const rec = byId.get(a.cabinetId);
    if (rec) map.set(a.rawCodeCanon, rec);
  }
  // If a user is logged in, load their private aliases and let them override globals
  if (userId) {
    const userRows = await db
      .select({ rawCodeCanon: codeAliases.rawCodeCanon, cabinetId: codeAliases.cabinetId })
      .from(codeAliases)
      .where(eq(codeAliases.userId, userId));
    for (const a of userRows) {
      const rec = byId.get(a.cabinetId);
      if (rec) map.set(a.rawCodeCanon, rec); // overrides global if same key
    }
  }
  return map;
}

// Match a list of {code, qty} pairs against the master catalog, honoring any
// persisted manual-fix aliases first. Pass userId to include that user's private aliases.
async function matchPairs(
  pairs: { code: string; qty: number }[],
  userId?: number | null
): Promise<ExtractedLine[]> {
  const records = await loadCodeRecords();
  const index = buildCodeIndex(records);
  const aliasMap = await loadAliasMap(records, userId);
  return pairs.map((p) => toExtractedLine(matchCode(p.code, index, aliasMap), p.qty));
}

const tierEnum = z.enum(["Wholesale", "Contractor", "Homeowner"]);

const lineItemInput = z.object({
  cabinetId: z.number().nullable(),
  masterCode: z.string().max(64),
  rawCode: z.string().max(128).optional(),
  description: z.string().max(512),
  qty: z.number().int().min(1).max(999),
  unitPrice: z.number().nullable().optional(),
  linePrice: z.number().nullable().optional(),
  doorStyle: z.string().max(128).nullable().optional(),
  styleId: z.number().nullable().optional(),
  tier: tierEnum.nullable().optional(),
  matched: z.boolean(),
});

// Generate a human-friendly request number: CD-<yyyymmdd>-<rand>.
function makeRequestNumber(): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `CD-${stamp}-${rand}`;
}

export const ordersRouter = router({
  // ─── OCR: image → cabinet codes + quantities ──────────────────────────────
  // Accepts a data URL (data:image/...;base64,...) or a public image URL. Calls
  // the vision LLM to read cabinet codes + quantities off a quote/spec sheet,
  // then matches each extracted code against the master catalog. Returns matched
  // and unmatched lines for the review UI. No record is persisted here.
  extractFromImage: publicProcedure
    .input(
      z.object({
        imageUrl: z.string().min(1), // data URL or https URL
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as { user?: { id?: number } }).user?.id ?? null;
      let lines: { code: string; qty: number }[] = [];
      try {
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are a parser for kitchen cabinet order sheets. Extract every cabinet line item you can read. A cabinet code is a short alphanumeric token like B24, B-24, DB24-3, W3030, W-30-30, SB36, BBC45, VSB-30, ADA-B-24. Quantity is the count for that line (default 1 if not shown). Ignore prices, totals, addresses, and non-cabinet text. Return strictly the JSON schema provided.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Read this cabinet order/quote sheet and list every cabinet code with its quantity.",
                },
                {
                  type: "image_url",
                  image_url: { url: input.imageUrl, detail: "high" },
                },
              ],
            },
          ],
          maxTokens: 2000,
          outputSchema: {
            name: "cabinet_order_extraction",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      code: { type: "string" },
                      qty: { type: "number" },
                    },
                    required: ["code", "qty"],
                  },
                },
              },
              required: ["items"],
            },
            strict: true,
          },
        });

        const content = result.choices?.[0]?.message?.content;
        const text = typeof content === "string" ? content : "";
        const parsed = JSON.parse(text || "{}") as {
          items?: { code?: string; qty?: number }[];
        };
        lines = (parsed.items ?? [])
          .map((i) => ({ code: String(i.code ?? "").trim(), qty: Number(i.qty ?? 1) }))
          .filter((i) => i.code.length > 0);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Could not read cabinet codes from that image. Try a clearer photo or use CSV import.",
        });
      }

      const extracted = await matchPairs(lines, userId);
      return {
        lines: extracted,
        matchedCount: extracted.filter((l) => l.matched).length,
        unmatchedCount: extracted.filter((l) => !l.matched).length,
      };
    }),

  // ─── CSV bulk import: "code,qty" rows → matched lines ──────────────────────
  extractFromCsv: publicProcedure
    .input(z.object({ csv: z.string().min(1).max(200_000) }))
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as { user?: { id?: number } }).user?.id ?? null;
      const rows = parseOrderCsv(input.csv);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No rows found. Use a CSV with a 'code' column (and optional 'qty').",
        });
      }
      const extracted = await matchPairs(rows);
      return {
        lines: extracted,
        matchedCount: extracted.filter((l) => l.matched).length,
        unmatchedCount: extracted.filter((l) => !l.matched).length,
      };
    }),

  // ─── Touch-up kit lookup (checkout add-on suggestion) ──────────────────────
  // Resolves the touch-up kit accessory so the checkout flow can suggest it as a
  // one-click add. Returns null if no buyable kit exists. Matched by master code
  // "TUK"; falls back to an Accessory whose description mentions "touch-up".
  touchUpKit: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        isActive: cabinets.isActive,
      })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "TUK"))
      .limit(1);
    const kit = rows[0];
    if (!kit || kit.isActive === false) return null;
    return {
      id: kit.id,
      masterCode: kit.masterCode,
      description: kit.description ?? "Touch-Up Kit",
    };
  }),

  // ─── Checkout recommendation engine ───────────────────────────────────────
  // Cart/order-aware accessory recommendations, strictly scoped to the order's
  // chosen door style (so we never suggest an item that isn't buyable in that
  // family). Returns priced groups the Order Review step can offer as one-click
  // adds. cabinetIds are the lines already on the order; recommendations that are
  // already on the order are filtered out so we don't suggest duplicates.
  recommendAddOns: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        cabinetIds: z.array(z.number()).max(500).default([]),
        tier: tierEnum.default("Contractor"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const empty = {
        touchUpKit: [] as RecAddOn[],
        rollOutTrays: [] as RecAddOn[],
        endPanels: [] as RecAddOn[],
        molding: [] as RecAddOn[],
        fillers: [] as RecAddOn[],
      };
      if (!db) return empty;

      const ps = await getPricingSettings();
      const cols = {
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        // Cost columns — the base the per-tier markup multiplies.
        yourCost: distributorSkus.yourCost,
        contractorPrice: distributorSkus.contractorPrice,
        wholesalePrice: distributorSkus.wholesalePrice,
        adjustedListPrice: distributorSkus.adjustedListPrice,
        listPrice: distributorSkus.listPrice,
        retailPriceBasis: distributors.retailPriceBasis,
      };
      const gate = and(
        eq(cabinets.isActive, true),
        notInConflict(),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true)
      );

      const runQuery = async (extra: ReturnType<typeof and> | undefined) => {
        const rows = await db
          .select(cols)
          .from(cabinets)
          .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
          .where(extra ? and(gate, extra) : gate)
          .orderBy(cabinets.masterCode);
        return rows;
      };

      // Collapse the (cabinet x distributor) rows to one cheapest-priced entry per
      // cabinet, dropping any cabinet that is already on the order.
      const onOrder = new Set(input.cabinetIds);
      const collapse = (rows: Awaited<ReturnType<typeof runQuery>>): RecAddOn[] => {
        const best = new Map<number, RecAddOn>();
        for (const r of rows) {
          if (onOrder.has(r.id)) continue;
          // Sell price = cost base × per-tier markup (matches the admin tab).
          const unitPrice = sellPriceForTier(r, ps, orderTier(input.tier));
          const existing = best.get(r.id);
          if (
            !existing ||
            (unitPrice !== null && (existing.unitPrice === null || unitPrice < existing.unitPrice))
          ) {
            best.set(r.id, {
              id: r.id,
              masterCode: r.masterCode,
              description: r.description ?? r.masterCode,
              subCategory: r.subCategory ?? null,
              width: r.width != null ? Number(r.width) : null,
              height: r.height != null ? Number(r.height) : null,
              depth: r.depth != null ? Number(r.depth) : null,
              unitPrice,
            });
          }
        }
        return Array.from(best.values()).sort((a, b) => a.masterCode.localeCompare(b.masterCode));
      };

      const [tuk, trays, panels, molding, fillers] = await Promise.all([
        runQuery(eq(cabinets.masterCode, "TUK")).then(collapse),
        // Roll-out shelves/trays: the live catalog uses subCategory "Roll Out Shelf".
        runQuery(eq(cabinets.subCategory, "Roll Out Shelf")).then(collapse),
        runQuery(eq(cabinets.subCategory, "Decorative End Panel")).then(collapse),
        runQuery(eq(cabinets.subCategory, "Trim & Molding")).then(collapse),
        // Fillers/scribe strips: F-* codes OR anything described as a filler.
        runQuery(
          or(
            like(cabinets.masterCode, "F-%"),
            sql`LOWER(${cabinets.description}) LIKE '%filler%'`
          )
        ).then(collapse),
      ]);

      return {
        touchUpKit: tuk,
        rollOutTrays: trays,
        endPanels: panels,
        molding,
        fillers,
      };
    }),

  // ─── Manual / typed code matching ──────────────────────────────────────────
  matchCodes: publicProcedure
    .input(
      z.object({
        items: z
          .array(z.object({ code: z.string().min(1).max(128), qty: z.number().int().min(1).max(999).default(1) }))
          .min(1)
          .max(500),
      })
    )
    .mutation(async ({ input }) => {
      const extracted = await matchPairs(input.items);
      return {
        lines: extracted,
        matchedCount: extracted.filter((l) => l.matched).length,
        unmatchedCount: extracted.filter((l) => !l.matched).length,
      };
    }),

  // ─── Price a set of matched cabinets for a chosen door style ───────────────
  // Door-style-first: a styleId resolves the best available + published price per
  // cabinet across whichever supply lines carry that style. Supplier identity is
  // never returned. Tier selects which price column is used.
  priceLines: publicProcedure
    .input(
      z.object({
        cabinetIds: z.array(z.number()).max(500),
        styleId: z.number(),
        tier: tierEnum.default("Contractor"),
        /** Optional affiliate slug — when provided, the affiliate's markup is
         *  applied on top of the homeowner price so the order builder shows
         *  the same marked-up prices the customer saw on the storefront. */
        affiliateSlug: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Owner/admin gets the wholesale floor ("My Cost") per line for margin
      // tooling; this column is NEVER returned to anyone else.
      const isAdmin = ctx.user?.role === "admin";
      const db = await getDb();
      if (!db || input.cabinetIds.length === 0) {
        return { prices: [] as { cabinetId: number; unitPrice: number | null; myCost: number | null }[] };
      }
      const ps = await getPricingSettings();
      const rows = await db
        .select({
          cabinetId: distributorSkus.cabinetId,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          listPrice: distributorSkus.listPrice,
          retailPriceBasis: distributors.retailPriceBasis,
        })
        .from(distributorSkus)
        .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
        .where(
          and(
            inArray(distributorSkus.cabinetId, input.cabinetIds),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        );

      // ── Affiliate markup config (loaded once if a slug is provided) ──────────
      // When the order is placed through an affiliate storefront, apply their
      // markup on top of the homeowner price so the order builder and review
      // screen show the same prices the customer saw on the storefront.
      let affiliateMarkupConfig: {
        globalMarkupBps: number;
        categoryMarkupBps: Record<string, number>;
        styleMarkupBps: Record<number, number>;
      } | null = null;

      if (input.affiliateSlug) {
        const slug = input.affiliateSlug.toLowerCase();
        const affRows = await db
          .select()
          .from(affiliates)
          .where(eq(affiliates.slug, slug))
          .limit(1);
        const aff = affRows[0];
        if (aff && aff.storefrontEnabled && aff.status !== "inactive") {
          const brandRows = await db
            .select({ styleId: affiliateStyleBranding.styleId, markupBps: affiliateStyleBranding.markupBps })
            .from(affiliateStyleBranding)
            .where(eq(affiliateStyleBranding.affiliateId, aff.id));
          const styleMarkupBps: Record<number, number> = {};
          for (const r of brandRows) {
            if (typeof r.markupBps === "number") styleMarkupBps[r.styleId] = r.markupBps;
          }
          let categoryMarkupBps: Record<string, number> = {};
          try {
            if (aff.categoryMarkupJson) categoryMarkupBps = JSON.parse(aff.categoryMarkupJson);
          } catch { categoryMarkupBps = {}; }
          affiliateMarkupConfig = {
            globalMarkupBps: aff.defaultMarkupBps ?? 0,
            categoryMarkupBps,
            styleMarkupBps,
          };
        }
      }

      // Best (lowest) SELL price per cabinet for the chosen tier (cost × markup).
      const best = new Map<number, number>();
      // Best (lowest) WHOLESALE floor per cabinet — owner-only "My Cost".
      const bestCost = new Map<number, number>();
      for (const r of rows) {
        if (r.cabinetId == null) continue;
        const price = sellPriceForTier(r, ps, orderTier(input.tier));
        if (price !== null && Number.isFinite(price)) {
          const cur = best.get(r.cabinetId);
          if (cur === undefined || price < cur) best.set(r.cabinetId, price);
        }
        if (isAdmin) {
          const cost = Number(r.yourCost ?? r.wholesalePrice ?? r.contractorPrice);
          if (Number.isFinite(cost)) {
            const curC = bestCost.get(r.cabinetId);
            if (curC === undefined || cost < curC) bestCost.set(r.cabinetId, cost);
          }
        }
      }

      return {
        prices: input.cabinetIds.map((id) => {
          let unitPrice = best.has(id) ? best.get(id)! : null;
          // Apply affiliate markup on top of the homeowner price when browsing
          // through an affiliate storefront. The styleId here is the door-style
          // lock for the whole order — category is unknown at this level so only
          // global + per-style markup applies (category markup is applied
          // client-side where the category is known).
          if (unitPrice !== null && affiliateMarkupConfig) {
            const bps = resolveMarkupBps(affiliateMarkupConfig, { styleId: input.styleId });
            if (bps > 0) {
              const cents = Math.round(unitPrice * 100);
              const marked = cents + Math.round((cents * bps) / 10000);
              unitPrice = marked / 100;
            }
          }
          return {
            cabinetId: id,
            unitPrice,
            // Only the owner/admin ever receives a non-null cost.
            myCost: isAdmin && bestCost.has(id) ? bestCost.get(id)! : null,
          };
        }),
      };
    }),

  // ─── Style options available for a set of cabinets ─────────────────────────
  // Returns door styles that have published+available SKUs for ALL of the given
  // cabinets (so the originator can pick a single style for the whole order).
  stylesForCabinets: publicProcedure
    .input(z.object({ cabinetIds: z.array(z.number()).min(1).max(500) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          styleId: distributorSkus.styleId,
          cabinetId: distributorSkus.cabinetId,
          // Use aliasName (white-label public name) when set; fall back to ourName.
          name: sql<string>`COALESCE(NULLIF(${doorStyles.aliasName}, ''), ${doorStyles.ourName})`,
          doorStyle: doorStyles.doorStyle,
          finish: doorStyles.finish,
          color: doorStyles.color,
        })
        .from(distributorSkus)
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(
          and(
            inArray(distributorSkus.cabinetId, input.cabinetIds),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            eq(doorStyles.isActive, true)
          )
        );

      // Group cabinets covered per style; keep styles that cover everything.
      const wanted = new Set(input.cabinetIds);
      const byStyle = new Map<
        number,
        { name: string; doorStyle: string | null; finish: string | null; color: string | null; covered: Set<number> }
      >();
      for (const r of rows) {
        if (r.cabinetId == null) continue;
        const entry =
          byStyle.get(r.styleId) ??
          { name: r.name, doorStyle: r.doorStyle, finish: r.finish, color: r.color, covered: new Set<number>() };
        entry.covered.add(r.cabinetId);
        byStyle.set(r.styleId, entry);
      }
      const out: {
        styleId: number;
        name: string;
        doorStyle: string | null;
        finish: string | null;
        color: string | null;
        coversAll: boolean;
        coverage: number;
      }[] = [];
      // Dedupe by style name (a style can exist across lines).
      const seenName = new Set<string>();
      Array.from(byStyle.entries())
        .sort((a, b) => b[1].covered.size - a[1].covered.size)
        .forEach(([styleId, e]) => {
          const key = (e.name || String(styleId)).toUpperCase();
          if (seenName.has(key)) return;
          seenName.add(key);
          const coversAll = Array.from(wanted).every((id) => e.covered.has(id));
          out.push({
            styleId,
            name: e.name,
            doorStyle: e.doorStyle,
            finish: e.finish,
            color: e.color,
            coversAll,
            coverage: e.covered.size,
          });
        });
      // Styles covering everything first, then by coverage, then name.
      return out.sort((a, b) => {
        if (a.coversAll !== b.coversAll) return a.coversAll ? -1 : 1;
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return (a.name || "").localeCompare(b.name || "");
      });
    }),

  // ─── Create an order request (draft or submitted) ─────────────────────────
  createRequest: publicProcedure
    .input(
      z.object({
        originatorName: z.string().max(256).optional(),
        originatorEmail: z.string().email().max(320).optional(),
        originatorPhone: z.string().max(32).optional(),
        zip: z.string().max(16).optional(),
        source: z.enum(["ocr", "csv", "design", "manual", "barcode"]).default("manual"),
        styleId: z.number().nullable().optional(),
        styleName: z.string().max(128).nullable().optional(),
        tier: tierEnum.default("Contractor"),
        lineItems: z.array(lineItemInput).min(1, "Add at least one line item"),
        notes: z.string().max(2000).optional(),
	    storeScope: z.string().trim().min(1).max(255).default("owner"),
        referralCode: z.string().max(32).optional(),
        deliveryMethod: z.enum(["ship", "pickup"]).optional(),
        deliveryLocationType: z.enum(["business", "residential"]).optional(),
        liftgateRequired: z.boolean().optional(),
        freightQuoteToken: z.string().max(4096).optional(),
        pickupDistributorId: z.number().int().positive().nullable().optional(),
        /** 2-letter US state code for sales tax calculation */
        taxState: z.string().length(2).optional(),
        /** Combined state+local tax rate as a decimal (e.g. 0.07 = 7%) */
        taxRate: z.number().min(0).max(0.25).optional(),
        /** Computed tax amount in dollars */
        taxAmount: z.number().min(0).optional(),
        /** Optional exact saved plan that originated this design order. */
        kitchenDesignId: z.number().int().positive().optional(),
        submit: z.boolean().default(false),
      })
    )
        .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // Server-side tier enforcement: non-admin users always get their assigned pricingTier.
      // Admins may pass any tier (for quoting on behalf of a customer).
      const isAdmin = (ctx as { user?: { role?: string } }).user?.role === "admin";
      const userDbTier = (ctx as { user?: { pricingTier?: string } }).user?.pricingTier;
      const resolvedTier: "Wholesale" | "Contractor" | "Homeowner" = isAdmin
        ? input.tier
        : userDbTier === "wholesale"
          ? "Wholesale"
          : userDbTier === "contractor"
            ? "Contractor"
            : "Homeowner"; // guests and homeowners default to Homeowner
      const normalizedLines: OrderLineItem[] = input.lineItems.map((l) => {
        const unitPrice = l.unitPrice ?? null;
        const linePrice =
          l.linePrice ?? (unitPrice !== null ? Number((unitPrice * l.qty).toFixed(2)) : null);
        return {
          cabinetId: l.cabinetId,
          masterCode: l.masterCode,
          rawCode: l.rawCode,
          description: l.description,
          qty: l.qty,
          unitPrice,
          linePrice,
          doorStyle: l.doorStyle ?? input.styleName ?? null,
          styleId: l.styleId ?? input.styleId ?? null,
          tier: l.tier ?? input.tier,
          matched: l.matched,
        };
      });
      const hasOnlyTemporaryFreeShippingItems = isTemporaryOneDollarFreeShippingOrder(normalizedLines);

      // Family-lock: a single order must stay within one door-style family.
      // Only enforced on submit (a draft may still be mid-review with mixed lines).
      if (input.submit) {
        const lock = validateFamilyLock(
          normalizedLines.map((l) => ({ styleId: l.styleId, masterCode: l.masterCode })),
          input.styleId ?? null
        );
        if (!lock.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: lock.reason });
        }
      }

      const total = normalizedLines.reduce(
        (sum, l) => sum + (l.linePrice ?? 0),
        0
      );
      // The browser may display an estimate while the customer is choosing a
      // state, but an order stores its rate and amount from the shared server
      // tax table. This is the amount later sent to Stripe.
      const taxState = input.taxState?.trim().toUpperCase() || null;
      const calculatedTax = taxState ? calcSalesTax(total, taxState) : null;
      if (taxState && !calculatedTax) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid two-letter US state for sales tax." });
      }
      const itemCount = normalizedLines.reduce((sum, l) => sum + l.qty, 0);
      const deliveryMethod = input.deliveryMethod ?? "ship";
      const deliveryLocationType = input.deliveryLocationType ?? "business";
      const liftgateRequired = input.liftgateRequired === true;
      let freightQuoteCents = 0;
      let freightQuoteVerified = false;
      if (deliveryMethod === "ship" && input.freightQuoteToken) {
        let quote;
        try {
          quote = verifyFreightQuoteToken(input.freightQuoteToken);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Freight quote is invalid.",
          });
        }
        const expectedZip = (input.zip ?? "").replace(/\D/g, "").slice(0, 5);
        const expectedItemsHash = freightItemsHash(
          normalizedLines
            .filter((line) => !isTemporaryOneDollarCheckoutTestItem(line))
            .map((line) => ({
              cabinetId: line.cabinetId,
              masterCode: line.masterCode,
              styleId: line.styleId ?? input.styleId ?? null,
              distributorId: null,
              qty: line.qty,
            })),
        );
        const quoteMatchesOrder =
          quote.destinationZip === expectedZip &&
          quote.merchandiseSubtotalCents === Math.max(0, Math.round(total * 100)) &&
          quote.residential === (deliveryLocationType === "residential") &&
          quote.liftgate === liftgateRequired &&
          quote.itemsHash === expectedItemsHash;
        if (!quoteMatchesOrder) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The shipping quote no longer matches this order. Request a new quote.",
          });
        }
        freightQuoteCents = quote.totalCents;
        freightQuoteVerified = true;
      } else if (deliveryMethod === "ship" && hasOnlyTemporaryFreeShippingItems) {
        // This is a deliberately narrow real-payment smoke-test SKU. Its zero
        // freight is server-authorized; every ordinary shipping order still
        // requires a signed current carrier quote below.
        freightQuoteVerified = true;
      } else if (input.deliveryMethod === "ship" && input.submit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request a current shipping quote before submitting this order.",
        });
      }
      // Affiliate attribution: if a referral code was supplied, resolve the
      // active affiliate it belongs to and tag this request.
      let affiliateId: number | null = null;
      let referralCode: string | null = null;
	  const scopeSlug = input.storeScope.trim().toLowerCase();
	  if (scopeSlug !== "owner") {
	    const [scopeAffiliate] = await db
	      .select({ id: affiliates.id, status: affiliates.status, referralCode: affiliates.referralCode })
	      .from(affiliates)
	      .where(eq(affiliates.slug, scopeSlug))
	      .limit(1);
	    if (!scopeAffiliate || scopeAffiliate.status !== "active") {
	      throw new TRPCError({ code: "NOT_FOUND", message: "This affiliate store is not available." });
	    }
	    affiliateId = scopeAffiliate.id;
	    referralCode = scopeAffiliate.referralCode;
	  }
      const code = normalizeReferralCode(input.referralCode ?? "");
      if (code) {
        const affRows = await db
          .select({ id: affiliates.id, status: affiliates.status, referralCode: affiliates.referralCode })
          .from(affiliates)
          .where(eq(affiliates.referralCode, code))
          .limit(1);
        const aff = affRows[0];
        if (aff && aff.status === "active") {
	      if (affiliateId != null && affiliateId !== aff.id) {
	        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The referral does not match the active store." });
	      }
          affiliateId = aff.id;
          referralCode = aff.referralCode;
        }
      }
	  const expectedDesignAffiliateId = scopeSlug === "owner" ? null : affiliateId;
	  if (input.kitchenDesignId && affiliateId !== expectedDesignAffiliateId) {
	    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This saved plan and referral belong to different stores." });
	  }
	  const kitchenDesignId = await resolveAuthorizedKitchenDesignId(db, ctx.user, input.kitchenDesignId, expectedDesignAffiliateId);

      // Resolve each stored display name from the affiliate's own branding
      // records. This protects white-label order records from stale or direct
      // requests carrying a central catalog name.
      const affiliateStyleAliases = new Map<number, string>();
      if (affiliateId) {
        const styleIds = Array.from(
          new Set(
            [input.styleId, ...normalizedLines.map((line) => line.styleId)]
              .filter((styleId): styleId is number => typeof styleId === "number")
          )
        );
        if (styleIds.length > 0) {
          const aliases = await db
            .select({ styleId: affiliateStyleBranding.styleId, brandName: affiliateStyleBranding.brandName })
            .from(affiliateStyleBranding)
            .where(
              and(
                eq(affiliateStyleBranding.affiliateId, affiliateId),
                inArray(affiliateStyleBranding.styleId, styleIds)
              )
            );
          for (const alias of aliases) {
            const name = alias.brandName?.trim();
            if (name) affiliateStyleAliases.set(alias.styleId, name);
          }
        }
      }
      const orderAliasPersistence = buildAffiliateOrderPersistence({
        styleId: input.styleId,
        submittedStyleName: input.styleName,
        lines: normalizedLines,
        aliases: affiliateStyleAliases,
      });
      const resolvedOrderStyleName = orderAliasPersistence.styleName;
      const resolvedLines = orderAliasPersistence.lineItems;

      if (input.submit && affiliateId) {
        const targetStyleIds = new Set<number>();
        if (input.styleId) targetStyleIds.add(input.styleId);
        for (const l of resolvedLines) {
          if (l.styleId) targetStyleIds.add(l.styleId);
        }
        if (targetStyleIds.size > 0) {
          const disabledRows = await db
            .select({ styleId: affiliateStyleBranding.styleId })
            .from(affiliateStyleBranding)
            .where(
              and(
                eq(affiliateStyleBranding.affiliateId, affiliateId),
                eq(affiliateStyleBranding.isEnabled, false),
                inArray(affiliateStyleBranding.styleId, Array.from(targetStyleIds))
              )
            );
          if (disabledRows.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One or more cabinet lines in your order are currently disabled by this affiliate store.",
            });
          }
        }
      }

      const requestNumber = makeRequestNumber();
      const result = await db.insert(orderRequests).values({
        userId: ctx.user?.id ?? null,
        kitchenDesignId,
        requestNumber,
        originatorName: input.originatorName ?? ctx.user?.name ?? null,
        originatorEmail: input.originatorEmail ?? ctx.user?.email ?? null,
        originatorPhone: input.originatorPhone ?? null,
        zip: input.zip ?? null,
        source: input.source,
        status: input.submit ? "submitted" : "draft",
        styleId: input.styleId ?? null,
        styleName: resolvedOrderStyleName,
        tier: resolvedTier,
        lineItems: resolvedLines,
        itemCount,
        totalAmount: total > 0 ? total.toFixed(2) : null,
        notes: input.notes ?? null,
        affiliateId,
        referralCode,
        deliveryMethod,
        deliveryLocationType,
        liftgateRequired: deliveryMethod === "ship" && liftgateRequired,
        freightQuoteCents,
        freightQuoteVerified,
        pickupDistributorId: deliveryMethod === "pickup" ? input.pickupDistributorId ?? null : null,
        taxState,
        taxRate: calculatedTax ? String(calculatedTax.taxRate) : null,
        taxAmount: calculatedTax ? String(calculatedTax.taxAmount.toFixed(2)) : null,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // Push a CRM event only for SUBMITTED orders (drafts are still in-progress).
      // Best-effort + tagged with the referring affiliate/dealer (NULL = house).
      if (input.submit) {
        void emitCrmEvent({
          event: "order_submitted",
          affiliateId,
          referralCode,
          contact: {
            userId: ctx.user?.id ?? null,
            name: input.originatorName ?? ctx.user?.name ?? null,
            email: input.originatorEmail ?? ctx.user?.email ?? null,
            phone: input.originatorPhone ?? null,
          },
          data: {
            orderId: insertId,
            requestNumber,
            source: input.source,
            kitchenDesignId,
            tier: input.tier,
            styleName: orderAliasPersistence.crmData.styleName,
            itemCount,
            totalAmount: total > 0 ? Number(total.toFixed(2)) : null,
            deliveryMethod: input.deliveryMethod ?? "ship",
          },
          link: `/admin/orders/${insertId}`,
        });
      }
      // NOTE: Per owner workflow, a submitted order should eventually be emailed
      // to the distributor with copies to affiliates, and confirmed by the
      // originator/affiliate. That email step is DEFERRED until distributor email
      // is wired. For now we only persist the request.
      return { id: insertId, requestNumber, freightCents: freightQuoteCents };
    }),

  // ─── Originator confirmation ───────────────────────────────────────────────
  // The originator (or affiliate) confirms a submitted request. This is the
  // "must be confirmed by the order originator" step.
  confirm: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db
        .update(orderRequests)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(eq(orderRequests.id, input.id));
      return { id: input.id, status: "confirmed" as const };
    }),

  /** Affiliate approval releases a paid customer order to its supply line. */
  affiliateApproveForInventory: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, input.id)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      if (!order.affiliateId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only affiliate orders use this approval rail." });
      const access = await resolveAffiliateAccess(db, ctx.user);
      if (ctx.user.role !== "admin" && (!access || access.affiliateId !== order.affiliateId || !access.isOwner)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the originating affiliate can approve this order." });
      }
      if (order.status !== "confirmed" || !order.stripePaymentIntentId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A paid Stripe checkout is required before affiliate review." });
      }
      if (order.orderRailStatus !== "affiliate_review") {
        throw new TRPCError({ code: "CONFLICT", message: "This order is not awaiting affiliate review." });
      }
      const [style] = order.styleId
        ? await db.select({ distributorId: doorStyles.distributorId }).from(doorStyles).where(eq(doorStyles.id, order.styleId)).limit(1)
        : [];
      if (!style?.distributorId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No distributor line could be resolved for this order." });
      const now = new Date();
      await db.update(orderRequests).set({
        distributorId: style.distributorId,
        orderRailStatus: "distributor_inventory_check",
        affiliateReviewedAt: now,
        affiliateReviewedByUserId: ctx.user.id,
      }).where(eq(orderRequests.id, order.id));
      return { id: order.id, orderRailStatus: "distributor_inventory_check" as const };
    }),

  /** Final affiliate sign-off authorizes fulfillment after the distributor invoice. */
  affiliateApproveDistributorInvoice: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, input.id)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const access = await resolveAffiliateAccess(db, ctx.user);
      if (!order.affiliateId || (ctx.user.role !== "admin" && (!access || access.affiliateId !== order.affiliateId || !access.isOwner))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the originating affiliate can approve this distributor invoice." });
      }
      if (order.orderRailStatus !== "affiliate_invoice_review" || !order.distributorInventoryConfirmedAt) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Distributor inventory confirmation and updated invoice are required first." });
      }
      const now = new Date();
      await db.update(orderRequests).set({
        orderRailStatus: "fulfillment_authorized",
        affiliateInvoiceApprovedAt: now,
        affiliateInvoiceApprovedByUserId: ctx.user.id,
        fulfillmentAuthorizedAt: now,
      }).where(eq(orderRequests.id, order.id));
      return { id: order.id, orderRailStatus: "fulfillment_authorized" as const };
    }),

  // ─── Read one request ──────────────────────────────────────────────────────
  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  // ─── My requests (authenticated) ───────────────────────────────────────────
  myRequests: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(orderRequests)
      .where(eq(orderRequests.userId, ctx.user.id))
      .orderBy(desc(orderRequests.createdAt));
  }),

  // ─── Admin list ────────────────────────────────────────────────────────────
  adminList: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["draft", "submitted", "confirmed", "cancelled"]).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(orderRequests)
        .orderBy(desc(orderRequests.createdAt));
      if (input?.status) return rows.filter((r) => r.status === input.status);
      return rows;
    }),

  // ─── Admin: orders with resolved PO SKUs ─────────────────────────────────
  // Returns every order request enriched with a `poSku` field per line item.
  // Format: {distributorCode}-{styleCode}-{distributorSku}  e.g. usd-sw-3db24
  adminListWithPoSkus: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["draft", "submitted", "confirmed", "cancelled"]).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      // Fetch all orders
      const rows = await db
        .select()
        .from(orderRequests)
        .orderBy(desc(orderRequests.createdAt));
      const filtered = input?.status ? rows.filter((r) => r.status === input.status) : rows;

      // Collect all unique cabinetIds and styleIds across all orders
      const cabinetIdSet = new Set<number>();
      const styleIdSet = new Set<number>();
      for (const row of filtered) {
        const lines = (row.lineItems ?? []) as OrderLineItem[];
        for (const l of lines) {
          if (l.cabinetId) cabinetIdSet.add(l.cabinetId);
          if (l.styleId) styleIdSet.add(l.styleId);
        }
        if (row.styleId) styleIdSet.add(row.styleId);
      }

      // Build a lookup: cabinetId+styleId → { distributorSku, distributorCode, styleCode, distributorId }
      type SkuKey = `${number}-${number}`;
      const skuMap = new Map<
        SkuKey,
        { distributorSku: string; distributorCode: string; styleCode: string; distributorId: number }
      >();

      if (cabinetIdSet.size > 0 && styleIdSet.size > 0) {
        const skuRows = await db
          .select({
            cabinetId: distributorSkus.cabinetId,
            styleId: distributorSkus.styleId,
            distributorSku: distributorSkus.distributorSku,
            distributorId: distributorSkus.distributorId,
            distributorCode: distributors.code,
            styleCode: doorStyles.styleCode,
          })
          .from(distributorSkus)
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .where(
            and(
              inArray(distributorSkus.cabinetId, Array.from(cabinetIdSet)),
              inArray(distributorSkus.styleId, Array.from(styleIdSet)),
              eq(distributorSkus.isAvailable, true)
            )
          );
        for (const r of skuRows) {
          if (r.cabinetId == null) continue;
          const key: SkuKey = `${r.cabinetId}-${r.styleId}`;
          if (!skuMap.has(key)) {
            skuMap.set(key, {
              distributorSku: r.distributorSku,
              distributorCode: r.distributorCode,
              styleCode: r.styleCode,
              distributorId: r.distributorId,
            });
          }
        }
      }

      // Per-style color/finish + owning distributor (for the internal build sheet).
      // The invoice is ADMIN-ONLY, so we surface the REAL supplier identity here.
      type StyleMeta = {
        distributorId: number;
        doorStyle: string | null;
        finish: string | null;
        color: string | null;
        woodSpecies: string | null;
        distributorName: string;
        distributorCode: string;
      };
      const styleMetaMap = new Map<number, StyleMeta>();
      if (styleIdSet.size > 0) {
        const styleRows = await db
          .select({
            id: doorStyles.id,
            distributorId: doorStyles.distributorId,
            doorStyle: doorStyles.doorStyle,
            finish: doorStyles.finish,
            color: doorStyles.color,
            woodSpecies: doorStyles.woodSpecies,
            dName: distributors.name,
            dBrandName: distributors.brandName,
            dCode: distributors.code,
          })
          .from(doorStyles)
          .innerJoin(distributors, eq(doorStyles.distributorId, distributors.id))
          .where(inArray(doorStyles.id, Array.from(styleIdSet)));
        for (const r of styleRows) {
          styleMetaMap.set(r.id, {
            distributorId: r.distributorId,
            doorStyle: r.doorStyle,
            finish: r.finish,
            color: r.color,
            woodSpecies: r.woodSpecies,
            // Admin build sheet: prefer the real brand name, else the line name.
            distributorName: r.dBrandName || r.dName,
            distributorCode: r.dCode,
          });
        }
      }

      // Enrich each order's line items with a formatted poSku + color/finish, and
      // resolve the order's owning distributor (most common across lines).
      return filtered.map((row) => {
        const styleId = row.styleId;
        const distCount = new Map<number, number>();
        const enrichedLines = ((row.lineItems ?? []) as OrderLineItem[]).map((l) => {
          const sid = l.styleId ?? styleId ?? null;
          const key: SkuKey | null = l.cabinetId && sid ? `${l.cabinetId}-${sid}` : null;
          const sku = key ? skuMap.get(key) : undefined;
          if (sku) distCount.set(sku.distributorId, (distCount.get(sku.distributorId) ?? 0) + 1);
          const poSku = sku
            ? `${sku.distributorCode.toLowerCase()}-${sku.styleCode.toLowerCase()}-${sku.distributorSku.toLowerCase()}`
            : null;
          const meta = sid ? styleMetaMap.get(sid) : undefined;
          const colorFinish =
            meta && (meta.color || meta.finish)
              ? [meta.color, meta.finish].filter(Boolean).join(" · ")
              : null;
          return {
            ...l,
            poSku,
            distributorName: meta?.distributorName ?? null,
            colorFinish,
          };
        });
        // Resolve the order-level distributor: prefer the most common per-line, else the order style's.
        let orderDistId: number | null = null;
        let bestN = -1;
        for (const [id, n] of Array.from(distCount.entries())) {
          if (n > bestN) {
            bestN = n;
            orderDistId = id;
          }
        }
        if (orderDistId == null && styleId) orderDistId = styleMetaMap.get(styleId)?.distributorId ?? null;
        const orderDistName =
          (orderDistId != null
            ? Array.from(styleMetaMap.values()).find((m) => m.distributorId === orderDistId)?.distributorName
            : null) ?? null;
        return {
          ...row,
          lineItems: enrichedLines,
          distributorId: orderDistId,
          distributorName: orderDistName,
        };
      });
    }),

  // ─── Send confirmed order to the distributor ───────────────────────────────
  // Admin-triggered after review. Resolves the order's owning distributor, builds
  // a human-readable PO plus a NetSuite-ready CSV, and emails it to the
  // distributor's order-intake inbox with CC copies (affiliate/sales). The
  // NetSuite direct-API mode is stubbed: when a line is set to "netsuite_api" we
  // still email the CSV and note that direct push is pending credentials.
  sendToDistributor: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.id, input.id))
        .limit(1);
      const order = rows[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      const lines = (order.lineItems ?? []) as OrderLineItem[];
      if (lines.length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order has no line items." });

      // Resolve the owning distributor from the line items' SKUs (most common),
      // falling back to the order-level style's distributor.
      const cabinetIds = lines.map((l) => l.cabinetId).filter((x): x is number => typeof x === "number");
      const styleIds = new Set<number>();
      for (const l of lines) if (l.styleId) styleIds.add(l.styleId);
      if (order.styleId) styleIds.add(order.styleId);

      const skuRows =
        cabinetIds.length && styleIds.size
          ? await db
              .select({
                cabinetId: distributorSkus.cabinetId,
                styleId: distributorSkus.styleId,
                distributorId: distributorSkus.distributorId,
                distributorSku: distributorSkus.distributorSku,
                distributorCode: distributors.code,
                styleCode: doorStyles.styleCode,
              })
              .from(distributorSkus)
              .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
              .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
              .where(
                and(
                  inArray(distributorSkus.cabinetId, cabinetIds),
                  inArray(distributorSkus.styleId, Array.from(styleIds)),
                  eq(distributorSkus.isAvailable, true)
                )
              )
          : [];

      const skuByKey = new Map<string, { poSku: string; distributorId: number }>();
      const distCount = new Map<number, number>();
      for (const r of skuRows) {
        const key = `${r.cabinetId}-${r.styleId}`;
        if (!skuByKey.has(key)) {
          skuByKey.set(key, {
            poSku: `${r.distributorCode.toLowerCase()}-${r.styleCode.toLowerCase()}-${r.distributorSku.toLowerCase()}`,
            distributorId: r.distributorId,
          });
        }
        distCount.set(r.distributorId, (distCount.get(r.distributorId) ?? 0) + 1);
      }
      let distributorId: number | null = null;
      let bestN = -1;
      for (const [id, n] of Array.from(distCount.entries())) {
        if (n > bestN) {
          bestN = n;
          distributorId = id;
        }
      }
      if (distributorId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not resolve a distributor for this order (no matched SKUs).",
        });
      }

      const distRows = await db
        .select()
        .from(distributors)
        .where(eq(distributors.id, distributorId))
        .limit(1);
      const dist = distRows[0];
      if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Distributor not found" });
      if (!dist.orderEmail) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No order email is set for ${dist.brandName || dist.name}. Add one in Distributor Fulfillment settings.`,
        });
      }
      const emailRows = await db.select().from(emailSettings).limit(1);
      const emailCfg = emailRows[0];
      if (!emailSettingsReady(emailCfg)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Email is not configured or is disabled. Set up SMTP in Admin → Email Settings before sending orders.",
        });
      }

      // Build the NetSuite-ready lines + CSV + text body.
      const nsLines: NetsuiteOrderLine[] = lines.map((l) => {
        const sid = l.styleId ?? order.styleId ?? null;
        const key = l.cabinetId && sid ? `${l.cabinetId}-${sid}` : null;
        const poSku = key ? skuByKey.get(key)?.poSku ?? null : null;
        return {
          poSku,
          masterCode: l.masterCode,
          rawCode: l.rawCode,
          description: l.description,
          qty: l.qty,
          unitPrice: l.unitPrice ?? null,
        };
      });
      const header = {
        orderNumber: order.requestNumber,
        customerName: order.originatorName,
        styleName: order.styleName,
        deliveryMethod: order.deliveryMethod,
        orderDate: new Date(order.createdAt).toISOString(),
      };
      const csv = buildNetsuiteOrderCsv(header, nsLines);
      const distName = dist.brandName || dist.name;
      const text = buildOrderEmailText(header, nsLines, {
        distributorName: distName,
        pickupAddress: dist.pickupAddress,
        totalAmount: order.totalAmount,
      });

      const cc = (dist.ccEmails ?? "")
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const apiNote =
        dist.fulfillmentMode === "netsuite_api"
          ? "\n\n[Note] This line is configured for NetSuite direct-API push, which is not yet activated. The order is delivered by email with the NetSuite CSV attached in the meantime."
          : "";

      const result = await sendEmailViaSettings(emailCfg!, {
        to: dist.orderEmail,
        cc: cc.length ? cc : undefined,
        subject: `Purchase Order ${order.requestNumber} — Cabinet Dealz`,
        text: text + apiNote,
        replyTo: order.originatorEmail ?? undefined,
        attachments: [
          {
            filename: `PO-${order.requestNumber}.csv`,
            content: csv,
            contentType: "text/csv",
          },
        ],
      });
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to send the order email.",
        });
      }

      const recipients = [dist.orderEmail, ...cc].join(", ");
      await db
        .update(orderRequests)
        .set({
          distributorId,
          sentToDistributorAt: new Date(),
          sentToDistributorEmail: recipients,
        })
        .where(eq(orderRequests.id, order.id));

      return {
        id: order.id,
        sentTo: recipients,
        distributorName: distName,
        fulfillmentMode: dist.fulfillmentMode,
      };
    }),

  // ─── Persisted manual-fix alias ────────────────────────────────────────────
  // When a user resolves an unrecognized order code by hand (Fix/swap), remember
  // the mapping so the same raw code auto-resolves next time. Keyed by the
  // canonicalized raw code; re-saving the same raw code re-points it (upsert).
  saveAlias: publicProcedure
    .input(
      z.object({
        rawCode: z.string().min(1).max(128),
        cabinetId: z.number().int().positive(),
        // global=true: admin saves a global alias (userId=NULL) that applies to everyone.
        // global=false/omitted: saves as a per-user private alias.
        global: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const canon = canonicalize(input.rawCode);
      if (!canon) throw new TRPCError({ code: "BAD_REQUEST", message: "Empty code" });
      // Confirm the target cabinet exists and is active.
      const cab = await db
        .select({ id: cabinets.id })
        .from(cabinets)
        .where(and(eq(cabinets.id, input.cabinetId), eq(cabinets.isActive, true)))
        .limit(1);
      if (cab.length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown cabinet" });
      const ctxUser = (ctx as { user?: { id?: number; role?: string } }).user;
      const userId = ctxUser?.id ?? null;
      // Admins saving from the import preview use global=true to create a global alias (userId=NULL).
      // Regular customers always save under their own userId (private alias).
      const isAdmin = ctxUser?.role === "admin";
      const aliasUserId = (isAdmin && input.global) ? null : userId;
      // Upsert on the composite unique key (rawCodeCanon, userId).
      await db
        .insert(codeAliases)
        .values({
          rawCodeCanon: canon,
          rawCodeSample: input.rawCode.trim().slice(0, 128),
          cabinetId: input.cabinetId,
          userId: aliasUserId,
          createdByUserId: userId,
        })
        .onDuplicateKeyUpdate({
          set: {
            cabinetId: input.cabinetId,
            rawCodeSample: input.rawCode.trim().slice(0, 128),
            updatedAt: new Date(),
          },
        });
      return { ok: true, rawCodeCanon: canon, global: aliasUserId === null };
    }),

  // List saved aliases (admin-only) for review/management.
  getAliases: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: codeAliases.id,
        rawCodeCanon: codeAliases.rawCodeCanon,
        rawCodeSample: codeAliases.rawCodeSample,
        cabinetId: codeAliases.cabinetId,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        updatedAt: codeAliases.updatedAt,
      })
      .from(codeAliases)
      .leftJoin(cabinets, eq(codeAliases.cabinetId, cabinets.id))
      .orderBy(desc(codeAliases.updatedAt));
  }),

  // ─── Admin: delete order request(s) (for testing/cleanup) ──────────────────
  // orderRequests is self-contained (line items live in the JSON `lineItems`
  // column), so deleting a row removes the whole order — no separate cascade.
  // adminDelete: remove one or more orders by id.
  adminDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(orderRequests).where(inArray(orderRequests.id, input.ids));
      return { deleted: input.ids.length };
    }),

  // ─── Admin: QuickBooks CSV export ────────────────────────────────────────────
  // Returns orders as a QuickBooks IIF-compatible CSV string that can be imported
  // directly into QuickBooks Online or Desktop via the CSV import wizard.
  // Columns follow the QBO Sales Receipt import format:
  //   TxnType, Date, Num, Name, Memo, ItemDescription, ItemQuantity, ItemRate, ItemAmount, TaxAmount, TxnTaxCodeRef, TotalAmt
  exportQBO: protectedProcedure
    .input(
      z.object({
        fromDate: z.string().optional(), // ISO date string e.g. "2025-01-01"
        toDate: z.string().optional(),
        status: z.enum(["draft", "submitted", "confirmed", "cancelled"]).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { csv: "", filename: "quickbooks-orders.csv", count: 0 };

      let rows = await db
        .select()
        .from(orderRequests)
        .orderBy(desc(orderRequests.createdAt));

      // Apply filters
      if (input?.status) rows = rows.filter((r) => r.status === input.status);
      if (input?.fromDate) {
        const from = new Date(input.fromDate);
        rows = rows.filter((r) => new Date(r.createdAt) >= from);
      }
      if (input?.toDate) {
        const to = new Date(input.toDate);
        to.setHours(23, 59, 59, 999);
        rows = rows.filter((r) => new Date(r.createdAt) <= to);
      }

      if (rows.length === 0) return { csv: "", filename: "quickbooks-orders.csv", count: 0 };

      // Build QuickBooks Sales Receipt CSV
      const headers = [
        "TxnType",
        "Date",
        "Num",
        "Name",
        "Memo",
        "ItemDescription",
        "ItemQuantity",
        "ItemRate",
        "ItemAmount",
        "TaxAmount",
        "TaxState",
        "TaxRate",
        "TotalAmt",
        "Status",
      ];

      const escCsv = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const csvLines: string[] = [headers.join(",")];

      for (const row of rows) {
        const lines = ((row.lineItems ?? []) as OrderLineItem[]);
        const date = new Date(row.createdAt).toLocaleDateString("en-US");
        const customerName = row.originatorName || row.originatorEmail || "Guest";
        const subtotal = parseFloat(row.totalAmount ?? "0") || 0;
        const taxAmt = parseFloat(row.taxAmount ?? "0") || 0;
        const grandTotal = subtotal + taxAmt;
        const memo = `Cabinet Dealz Order ${row.requestNumber} — ${row.styleName || ""} ${row.tier}`;

        if (lines.length === 0) {
          // Order with no line items — single summary row
          csvLines.push([
            "Sales Receipt",
            date,
            row.requestNumber,
            customerName,
            memo,
            "Cabinet Order",
            "1",
            subtotal.toFixed(2),
            subtotal.toFixed(2),
            taxAmt.toFixed(2),
            row.taxState ?? "",
            row.taxRate ? (parseFloat(row.taxRate) * 100).toFixed(2) + "%" : "",
            grandTotal.toFixed(2),
            row.status,
          ].map(escCsv).join(","));
        } else {
          // First line: full header info + first item
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i] as OrderLineItem;
            const qty = l.qty ?? 1;
            const rate = l.unitPrice ?? 0;
            const lineAmt = l.linePrice ?? (qty * rate);
            csvLines.push([
              "Sales Receipt",
              i === 0 ? date : "",
              i === 0 ? row.requestNumber : "",
              i === 0 ? customerName : "",
              i === 0 ? memo : "",
              l.description || l.masterCode || "",
              qty,
              rate.toFixed(2),
              lineAmt.toFixed(2),
              i === lines.length - 1 ? taxAmt.toFixed(2) : "",
              i === lines.length - 1 ? (row.taxState ?? "") : "",
              i === lines.length - 1 ? (row.taxRate ? (parseFloat(row.taxRate) * 100).toFixed(2) + "%" : "") : "",
              i === lines.length - 1 ? grandTotal.toFixed(2) : "",
              i === 0 ? row.status : "",
            ].map(escCsv).join(","));
          }
        }
      }

      const csv = csvLines.join("\n");
      const date = new Date().toISOString().slice(0, 10);
      return { csv, filename: `cabinet-dealz-qbo-${date}.csv`, count: rows.length };
    }),

  // adminDeleteAll: clear all orders, optionally only those matching a status
  // (e.g. all "draft"/"submitted" test orders). Omit status to wipe everything.
  adminDeleteAll: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["draft", "submitted", "confirmed", "cancelled"]).optional(),
        })
        .optional()
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = input?.status
        ? await db.select({ id: orderRequests.id }).from(orderRequests).where(eq(orderRequests.status, input.status))
        : await db.select({ id: orderRequests.id }).from(orderRequests);
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return { deleted: 0 };
      await db.delete(orderRequests).where(inArray(orderRequests.id, ids));
      return { deleted: ids.length };
    }),

  // ─── Stripe Checkout return status ────────────────────────────────────────
  // Stripe redirects with its unguessable session identifier. This public read
  // intentionally exposes only the confirmation state and money breakdown for
  // that one checkout session, never customer contact or payment-card data.
  stripeCheckoutStatus: publicProcedure
    .input(z.object({ sessionId: z.string().min(8).max(255) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const rows = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.stripeSessionId, input.sessionId))
        .limit(1);
      const order = rows[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Checkout session not found." });

      const merchandiseCents = Math.max(0, Math.round(Number(order.totalAmount ?? 0) * 100));
      const freightCents = order.deliveryMethod === "pickup" ? 0 : order.freightQuoteCents;
      const salesTaxCents = Math.max(0, Math.round(Number(order.taxAmount ?? 0) * 100));
      return {
        requestNumber: order.requestNumber,
        paid: order.status === "confirmed" && Boolean(order.stripePaymentIntentId),
        paymentPending: order.status === "submitted",
        amountCents: merchandiseCents + freightCents + salesTaxCents,
        breakdown: {
          merchandiseCents,
          freightCents,
          salesTaxCents,
          damageFeeCents: 0,
          techFeeCents: 0,
          cardFeeCents: 0,
        },
      };
    }),

  // ─── Stripe Checkout Session ──────────────────────────────────────────────
  // Creates a Stripe-hosted payment page for an existing, submitted order
  // request. Every chargeable amount comes from the persisted order and current
  // approved fee settings — never from a browser amount input.
  createStripeCheckout: protectedProcedure
    .input(
      z.object({
        orderRequestId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const rows = await db
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.id, input.orderRequestId))
        .limit(1);
      const order = rows[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      if (order.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot pay for another customer's order." });
      }
      if (order.status === "confirmed") {
        throw new TRPCError({ code: "CONFLICT", message: "This order has already been paid and confirmed." });
      }
      if (order.status !== "submitted") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Submit the order for review before opening secure checkout." });
      }

      const lineItems = (order.lineItems as OrderLineItem[]) ?? [];
      if (lineItems.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order has no line items" });
      }

      // Build Stripe line items from the order
      const stripeLines: import("../stripe").CheckoutLineItem[] = lineItems
        .filter((l) => l.linePrice != null && l.linePrice > 0)
        .map((l) => ({
          description: `${l.masterCode ?? l.rawCode ?? "Cabinet"} — ${l.description ?? ""}`.trim(),
          quantity: l.qty,
          unitPriceCents: Math.round(((l.unitPrice ?? l.linePrice! / l.qty) * 100)),
          platformSku: l.masterCode ?? undefined,
        }));

      const merchandiseCents = stripeLines.reduce(
        (sum, line) => sum + line.unitPriceCents * line.quantity,
        0,
      );
      if (merchandiseCents <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No priced items are available to charge." });
      }

      const verifiedFreightCents = order.deliveryMethod === "pickup" ? 0 : order.freightQuoteCents;
      if (order.deliveryMethod === "ship" && !order.freightQuoteVerified) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A verified shipping quote must be attached before payment.",
        });
      }

      // Add only the server-verified freight snapshot stored on the order.
      if (verifiedFreightCents > 0) {
        stripeLines.push({
          description: "LTL Freight Shipping",
          quantity: 1,
          unitPriceCents: verifiedFreightCents,
        });
      }

      const salesTaxCents = Math.max(0, Math.round(Number(order.taxAmount ?? 0) * 100));
      if (salesTaxCents > 0) {
        stripeLines.push({ description: "Sales tax", quantity: 1, unitPriceCents: salesTaxCents });
      }

      if (stripeLines.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No priced items to charge" });
      }

      const origin = (ctx.req as import("express").Request).headers.origin as string ?? "https://www.cabinetdealz.com";
      let checkoutPathPrefix = "";
      if (order.affiliateId) {
        const affiliateRows = await db
          .select({ slug: affiliates.slug })
          .from(affiliates)
          .where(eq(affiliates.id, order.affiliateId))
          .limit(1);
        if (affiliateRows[0]?.slug) checkoutPathPrefix = `/store/${affiliateRows[0].slug}`;
      }
      const { url, sessionId } = await createCheckoutSession({
        orderId: order.id,
        orderNumber: order.requestNumber,
        lineItems: stripeLines,
        customerEmail: order.originatorEmail ?? ctx.user.email ?? undefined,
        customerName: order.originatorName ?? ctx.user.name ?? undefined,
        userId: ctx.user.id,
        successUrl: `${origin}${checkoutPathPrefix}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}${checkoutPathPrefix}/checkout/cancelled?order=${order.id}`,
      });

      return {
        url,
        sessionId,
        amountCents: merchandiseCents + verifiedFreightCents + salesTaxCents,
        breakdown: {
          merchandiseCents,
          freightCents: verifiedFreightCents,
          salesTaxCents,
          damageFeeCents: 0,
          techFeeCents: 0,
          cardFeeCents: 0,
        },
      };
    }),
});
