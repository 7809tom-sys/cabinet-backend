import Stripe from "stripe";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { affiliateInvoices, affiliates } from "../../drizzle/schema";
import {
  createDbPaymentLinkContext,
  createDrizzleStripePaymentStore,
  listStripePaymentRecords,
  type StripeInvoiceListFilters,
} from "../stripePaymentStore";
import {
  redactSecrets,
  stripeReadTargets,
  syncStripeAccount,
  type StripeHistoryReader,
  type StripeMode,
  type StripePaymentStatus,
} from "../stripePaymentRecords";
import { noteStripeMatchedPayment } from "../lib/orderSideEffects";

const listInput = z.object({
  search: z.string().max(200).optional(),
  affiliateId: z.number().int().positive().optional(),
  unassignedOnly: z.boolean().optional(),
  status: z.enum(["paid", "refunded", "partially_refunded", "failed", "pending", "all"]).optional(),
  mode: z.enum(["live", "test", "all"]).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

function parseFilterDate(value: string | undefined, bound: "start" | "end"): Date | undefined {
  if (!value) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${bound === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid date." });
  }
  return date;
}

function filtersFromInput(input: z.infer<typeof listInput>): StripeInvoiceListFilters {
  return {
    search: input.search,
    affiliateId: input.affiliateId,
    unassignedOnly: input.unassignedOnly,
    status: (input.status ?? "all") as StripePaymentStatus | "all",
    mode: (input.mode ?? "all") as StripeMode | "all",
    from: parseFilterDate(input.from, "start"),
    to: parseFilterDate(input.to, "end"),
    limit: input.limit,
  };
}

const emptyList = {
  rows: [],
  summary: { total: 0, paid: 0, refunded: 0, failed: 0, receiptsSent: 0, receiptsMissing: 0 },
};

function historyReader(secretKey: string): StripeHistoryReader {
  const stripe = new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" });
  return {
    async listCharges(startingAfter) {
      const page = await stripe.charges.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
      return { data: page.data as unknown as Record<string, unknown>[], hasMore: page.has_more };
    },
    async listCheckoutSessions(startingAfter) {
      const page = await stripe.checkout.sessions.list({
        limit: 100,
        status: "complete",
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      return { data: page.data as unknown as Record<string, unknown>[], hasMore: page.has_more };
    },
    async listInvoices(startingAfter) {
      const page = await stripe.invoices.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
      return { data: page.data as unknown as Record<string, unknown>[], hasMore: page.has_more };
    },
  };
}

export const stripeInvoicesRouter = router({
  adminList: adminProcedure.input(listInput.optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return emptyList;
    return listStripePaymentRecords(db, filtersFromInput(input ?? { limit: 100 }));
  }),

  adminAffiliateHistory: adminProcedure
    .input(z.object({ affiliateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { affiliate: null, membershipInvoices: [], stripePayments: emptyList };
      const [affiliate] = await db
        .select({
          id: affiliates.id,
          storeName: affiliates.storeName,
          slug: affiliates.slug,
          email: affiliates.email,
          membershipStatus: affiliates.membershipStatus,
          membershipFeeCents: affiliates.membershipFeeCents,
          membershipPaidAt: affiliates.membershipPaidAt,
          membershipExpiresAt: affiliates.membershipExpiresAt,
        })
        .from(affiliates)
        .where(eq(affiliates.id, input.affiliateId))
        .limit(1);
      const membershipInvoices = await db
        .select()
        .from(affiliateInvoices)
        .where(eq(affiliateInvoices.affiliateId, input.affiliateId))
        .orderBy(desc(affiliateInvoices.issuedAt));
      const stripePayments = await listStripePaymentRecords(db, { affiliateId: input.affiliateId, limit: 200 });
      return { affiliate: affiliate ?? null, membershipInvoices, stripePayments };
    }),

  /**
   * Read-only pull of historical Charges, completed Checkout Sessions, and
   * Invoices from every configured Stripe mode. This never creates, refunds,
   * or emails anything.
   */
  syncFromStripe: adminProcedure.mutation(async () => {
    const targets = stripeReadTargets();
    if (targets.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No Stripe secret key is configured for live or test mode.",
      });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const store = createDrizzleStripePaymentStore(db);
    const links = createDbPaymentLinkContext(db);
    const accounts: Array<{ mode: StripeMode; charges: number; sessions: number; invoices: number; upserted: number; created: number; truncated: boolean }> = [];
    for (const target of targets) {
      try {
        const result = await syncStripeAccount(historyReader(target.secretKey), {
          store,
          links,
          onLinkedPayment: ({ orderId, status }) => noteStripeMatchedPayment(orderId, status),
        });
        accounts.push({ mode: target.mode, ...result });
      } catch (error) {
        const message = redactSecrets(error instanceof Error ? error.message : "Stripe request failed");
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Stripe history sync failed for ${target.mode} mode. ${message}`,
        });
      }
    }
    return { accounts };
  }),
});
