import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  cabinets,
  distributorSkus,
  doorStyles,
  orderRequests,
  affiliates,
  type OrderLineItem,
} from "../../drizzle/schema";
import { normalizeReferralCode } from "@shared/affiliate";
import { validateFamilyLock } from "@shared/familyLock";
import {
  buildCodeIndex,
  matchCode,
  parseOrderCsv,
  type CabinetCodeRecord,
  type CodeMatch,
} from "@shared/codeMatch";
import { invokeLLM } from "../_core/llm";

// ─── Shared types surfaced to the client ───────────────────────────────────────
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
    .where(eq(cabinets.isActive, true));
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

// Match a list of {code, qty} pairs against the master catalog.
async function matchPairs(
  pairs: { code: string; qty: number }[]
): Promise<ExtractedLine[]> {
  const records = await loadCodeRecords();
  const index = buildCodeIndex(records);
  return pairs.map((p) => toExtractedLine(matchCode(p.code, index), p.qty));
}

const tierEnum = z.enum(["Wholesale", "Contractor"]);

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
    .mutation(async ({ input }) => {
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

      const extracted = await matchPairs(lines);
      return {
        lines: extracted,
        matchedCount: extracted.filter((l) => l.matched).length,
        unmatchedCount: extracted.filter((l) => !l.matched).length,
      };
    }),

  // ─── CSV bulk import: "code,qty" rows → matched lines ──────────────────────
  extractFromCsv: publicProcedure
    .input(z.object({ csv: z.string().min(1).max(200_000) }))
    .mutation(async ({ input }) => {
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
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.cabinetIds.length === 0) {
        return { prices: [] as { cabinetId: number; unitPrice: number | null }[] };
      }
      const rows = await db
        .select({
          cabinetId: distributorSkus.cabinetId,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
        })
        .from(distributorSkus)
        .where(
          and(
            inArray(distributorSkus.cabinetId, input.cabinetIds),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        );

      // Best (lowest) price per cabinet for the chosen tier.
      const best = new Map<number, number>();
      for (const r of rows) {
        const price = Number(
          input.tier === "Wholesale"
            ? r.wholesalePrice ?? r.contractorPrice
            : r.contractorPrice ?? r.wholesalePrice
        );
        if (!Number.isFinite(price)) continue;
        const cur = best.get(r.cabinetId);
        if (cur === undefined || price < cur) best.set(r.cabinetId, price);
      }
      return {
        prices: input.cabinetIds.map((id) => ({
          cabinetId: id,
          unitPrice: best.has(id) ? best.get(id)! : null,
        })),
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
          name: doorStyles.ourName,
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
        source: z.enum(["ocr", "csv", "design", "manual"]).default("manual"),
        styleId: z.number().nullable().optional(),
        styleName: z.string().max(128).nullable().optional(),
        tier: tierEnum.default("Contractor"),
        lineItems: z.array(lineItemInput).min(1, "Add at least one line item"),
        notes: z.string().max(2000).optional(),
        referralCode: z.string().max(32).optional(),
        submit: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

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
      const itemCount = normalizedLines.reduce((sum, l) => sum + l.qty, 0);

      // Affiliate attribution: if a referral code was supplied, resolve the
      // active affiliate it belongs to and tag this request.
      let affiliateId: number | null = null;
      let referralCode: string | null = null;
      const code = normalizeReferralCode(input.referralCode ?? "");
      if (code) {
        const affRows = await db
          .select({ id: affiliates.id, status: affiliates.status, referralCode: affiliates.referralCode })
          .from(affiliates)
          .where(eq(affiliates.referralCode, code))
          .limit(1);
        const aff = affRows[0];
        if (aff && aff.status === "active") {
          affiliateId = aff.id;
          referralCode = aff.referralCode;
        }
      }

      const result = await db.insert(orderRequests).values({
        userId: ctx.user?.id ?? null,
        requestNumber: makeRequestNumber(),
        originatorName: input.originatorName ?? ctx.user?.name ?? null,
        originatorEmail: input.originatorEmail ?? ctx.user?.email ?? null,
        originatorPhone: input.originatorPhone ?? null,
        zip: input.zip ?? null,
        source: input.source,
        status: input.submit ? "submitted" : "draft",
        styleId: input.styleId ?? null,
        styleName: input.styleName ?? null,
        tier: input.tier,
        lineItems: normalizedLines,
        itemCount,
        totalAmount: total > 0 ? total.toFixed(2) : null,
        notes: input.notes ?? null,
        affiliateId,
        referralCode,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // NOTE: Per owner workflow, a submitted order should eventually be emailed
      // to the distributor with copies to affiliates, and confirmed by the
      // originator/affiliate. That email step is DEFERRED until distributor email
      // is wired. For now we only persist the request.
      return { id: insertId };
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
});
