import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { affiliateInvoices } from "../../drizzle/schema";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { linkStripeRecordsToAffiliateInvoice } from "../stripePaymentStore";
import {
  MEMBERSHIP_PLAN_IDS,
  MEMBERSHIP_PLAN_OPTIONS,
  assessMembershipCancellation,
  formatPlanPrice,
  membershipPlanOption,
  normalizeMembershipPlan,
} from "@shared/affiliateMembershipPlans";
import { loadMembershipSnapshot, toMembershipView } from "../lib/affiliateMembership";
import {
  cancelMembershipAtPeriodEnd,
  ensureOpenInvoice,
  getInvoice,
  listAffiliateInvoices,
  listAllAffiliateInvoices,
  markInvoicePaid,
  planPaymentTerm,
} from "../lib/affiliateMembershipBilling";
import {
  cancelMembershipSubscriptionAtPeriodEnd,
  createMembershipCheckoutSession,
} from "../lib/affiliateMembershipCheckout";

const planSchema = z.enum(MEMBERSHIP_PLAN_IDS);

async function resolveMyAffiliateId(ctx: { user: { id: number; email: string | null } }): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const access = await resolveAffiliateAccess(db, ctx.user);
  if (!access?.isOwner) return null;
  return access.affiliateId;
}

function requestOrigin(ctx: { req?: { headers?: Record<string, unknown> } }): string {
  const origin = (ctx.req?.headers?.origin as string | undefined) ?? "";
  return origin || "https://www.cabinetdealz.com";
}

/**
 * The two plan options, in the shape the pricing page and the member page
 * render. Published from one constant so the frontend never types a price.
 */
export const MEMBERSHIP_PLAN_PUBLIC = MEMBERSHIP_PLAN_IDS.map((id) => {
  const option = MEMBERSHIP_PLAN_OPTIONS[id];
  return {
    id: option.id,
    label: option.label,
    amountCents: option.amountCents,
    priceLabel: formatPlanPrice(id),
    minimumMonths: option.minimumMonths,
    minimumCommitmentCents: option.minimumCommitmentCents,
    description: option.description,
  };
});

export const affiliateMembershipRouter = router({
  // ─── Public: the two plan options ──────────────────────────────────────────
  // The storefront landing page and the affiliate pricing page read this, so
  // both prices and the three-month minimum come from one place.
  planOptions: publicProcedure.query(() => MEMBERSHIP_PLAN_PUBLIC),

  // ─── Partner: my membership status + invoices ──────────────────────────────
  myMembership: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const affiliateId = await resolveMyAffiliateId(ctx);
    if (affiliateId == null) return null;
    const snapshot = await loadMembershipSnapshot(db, affiliateId);
    if (!snapshot) return null;
    const invoices = await listAffiliateInvoices(db, affiliateId);
    return {
      ...toMembershipView(snapshot),
      invoices,
      planOptions: MEMBERSHIP_PLAN_PUBLIC,
    };
  }),

  /**
   * Partner: the open invoice for the plan they picked. Idempotent — a second
   * call with the same plan returns the same invoice, and a call with the other
   * plan re-points the single open invoice at that plan.
   */
  requestInvoice: protectedProcedure
    .input(z.object({ plan: planSchema.default("annual") }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const affiliateId = await resolveMyAffiliateId(ctx);
      if (affiliateId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      }
      return ensureOpenInvoice(db, affiliateId, normalizeMembershipPlan(input?.plan));
    }),

  /**
   * Partner: start Stripe Checkout for the plan they picked. Annual is a one
   * time payment; monthly is a subscription (see affiliateMembershipCheckout).
   * The membership is activated by the webhook, never by the browser coming
   * back to the success URL.
   */
  startCheckout: protectedProcedure
    .input(z.object({ plan: planSchema.default("annual") }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const affiliateId = await resolveMyAffiliateId(ctx);
      if (affiliateId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
      }
      const plan = normalizeMembershipPlan(input?.plan);
      const invoices = await listAffiliateInvoices(db, affiliateId);
      const open = invoices.find((row) => row.status === "open");

      let checkout: { url: string; sessionId: string; mode: "payment" | "subscription" };
      try {
        checkout = await createMembershipCheckoutSession({
          affiliateId,
          userId: ctx.user.id,
          plan,
          customerEmail: ctx.user.email ?? null,
          customerName: ctx.user.name ?? null,
          invoiceId: open?.id ?? null,
          successUrl: `${requestOrigin(ctx)}/affiliate?membership=success&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${requestOrigin(ctx)}/affiliate?membership=cancelled&plan=${plan}`,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Stripe Checkout could not be started. ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }

      return {
        ...checkout,
        plan,
        amountCents: membershipPlanOption(plan).amountCents,
        invoiceId: open?.id ?? null,
      };
    }),

  /**
   * Partner: cancel. Refused inside the monthly three-month minimum, with the
   * date the button unlocks. Accepted, access continues to the end of the paid
   * period and no further renewal is charged.
   */
  cancelMembership: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const affiliateId = await resolveMyAffiliateId(ctx);
    if (affiliateId == null) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
    }

    const snapshot = await loadMembershipSnapshot(db, affiliateId);
    if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
    if (snapshot.cancelledAt) {
      return {
        ok: true,
        alreadyCancelled: true,
        accessUntil: snapshot.expiresAt,
        stripeSubscription: "not_applicable" as const,
      };
    }

    const now = Date.now();
    const decision = assessMembershipCancellation({
      plan: snapshot.plan,
      nowMs: now,
      periodEndMs: snapshot.expiresAt?.getTime() ?? null,
      commitmentEndsAtMs: snapshot.committedUntil?.getTime() ?? null,
    });
    if (!decision.allowed) {
      const unlock = snapshot.committedUntil ? snapshot.committedUntil.toISOString().slice(0, 10) : "the end of the minimum";
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `This plan has a three-month minimum. You can cancel from ${unlock}.`,
      });
    }

    const stripeSubscription = await cancelMembershipSubscriptionAtPeriodEnd(snapshot.stripeSubscriptionId);
    const result = await cancelMembershipAtPeriodEnd(db, affiliateId, now);
    return { ok: true, alreadyCancelled: false, accessUntil: result.accessUntil, stripeSubscription };
  }),

  // ─── Admin: list all invoices (optionally by status) ───────────────────────
  adminListInvoices: adminProcedure
    .input(z.object({ status: z.enum(["open", "paid", "void", "all"]).default("all") }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const status = input?.status ?? "all";
      const rows = await listAllAffiliateInvoices(db);
      return status === "all" ? rows : rows.filter((r) => r.status === status);
    }),

  // ─── Admin: create an open invoice for an affiliate ────────────────────────
  adminCreateInvoice: adminProcedure
    .input(z.object({ affiliateId: z.number().int(), plan: planSchema.default("annual") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return ensureOpenInvoice(db, input.affiliateId, normalizeMembershipPlan(input.plan));
    }),

  /**
   * Admin: preview what recording a payment now would do — the new expiry and
   * the commitment date — before anything is written.
   */
  adminPreviewPayment: adminProcedure
    .input(z.object({ affiliateId: z.number().int(), plan: planSchema.default("annual") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { term, plan } = await planPaymentTerm(db, input.affiliateId, input.plan, Date.now());
      return {
        plan,
        amountCents: membershipPlanOption(plan).amountCents,
        periodStart: new Date(term.periodStartMs),
        periodEnd: new Date(term.periodEndMs),
        committedUntil: new Date(term.commitmentEndsAtMs),
      };
    }),

  // ─── Admin: record a payment (Stripe / external card / manual) ─────────────
  // Activates the membership for the invoice's plan: one year for annual, one
  // month for monthly (with the three-month minimum starting at the first
  // monthly payment).
  adminMarkPaid: adminProcedure
    .input(
      z.object({
        invoiceId: z.number().int(),
        paymentMethod: z.enum(["stripe", "external_card", "manual"]),
        paymentRef: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const inv = await getInvoice(db, input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      if (inv.status === "paid") return { ok: true, alreadyPaid: true };
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice was voided." });

      const result = await markInvoicePaid(db, {
        invoiceId: inv.id,
        paidAtMs: Date.now(),
        paymentMethod: input.paymentMethod,
        paymentRef: input.paymentRef,
        paidByUserId: ctx.user.id,
      });

      if (input.paymentMethod === "stripe" && input.paymentRef) {
        try {
          await linkStripeRecordsToAffiliateInvoice(db, {
            paymentRef: input.paymentRef,
            affiliateId: inv.affiliateId,
            affiliateInvoiceId: inv.id,
            description: inv.description,
          });
        } catch (error) {
          console.error(
            "[Affiliate membership] Could not link the Stripe payment reference:",
            error instanceof Error ? error.message : "unknown error",
          );
        }
      }

      return { ...result, periodEnd: result.periodEnd ?? null, committedUntil: result.committedUntil ?? null };
    }),

  // ─── Admin: void an invoice ────────────────────────────────────────────────
  adminVoidInvoice: adminProcedure
    .input(z.object({ invoiceId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.update(affiliateInvoices).set({ status: "void" }).where(eq(affiliateInvoices.id, input.invoiceId));
      return { ok: true };
    }),
});
