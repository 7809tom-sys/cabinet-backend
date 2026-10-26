import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  buildHostedCheckoutPaymentFields,
  checkoutSessionMetadata,
  configuredWebhookSecrets,
  createMemoryStripePaymentStore,
  emptyPaymentLinkContext,
  mergeStripePayment,
  receiptDelivery,
  recordStripeWebhookEvent,
  redactSecrets,
  stripeReadTargets,
  syncStripeAccount,
  type StripePaymentDraft,
} from "./stripePaymentRecords";

function ctx(role: "admin" | "user" | "partner" | null): TrpcContext {
  return {
    user: role
      ? ({
          id: 7,
          openId: `o-${role}`,
          name: role,
          email: `${role}@cabinetdealz.test`,
          role,
        } as TrpcContext["user"])
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const occurred = new Date("2026-10-20T15:04:00.000Z");

function checkoutPaidEvent(id = "evt_checkout_550") {
  return {
    id,
    type: "checkout.session.completed",
    created: 1760972640,
    data: {
      object: {
        id: "cs_live_550",
        object: "checkout.session",
        livemode: true,
        payment_status: "paid",
        amount_total: 55000,
        currency: "usd",
        payment_intent: "pi_live_550",
        customer_details: { email: "buyer@example.com", name: "Jordan Buyer" },
        customer_email: "buyer@example.com",
        created: 1760972640,
        metadata: {
          order_id: "42",
          order_number: "OR-1042",
          affiliate_id: "9",
          purpose: "order",
          customer_name: "Jordan Buyer",
          customer_email: "buyer@example.com",
        },
      },
    },
  };
}

function chargeEvent(options: {
  id?: string;
  type?: string;
  livemode?: boolean;
  amount?: number;
  refunded?: number;
  receiptEmail?: string | null;
  paymentIntent?: string;
  chargeId?: string;
  invoice?: string | null;
}) {
  return {
    id: options.id ?? "evt_charge_550",
    type: options.type ?? "charge.succeeded",
    created: 1760972641,
    data: {
      object: {
        id: options.chargeId ?? "ch_live_550",
        object: "charge",
        livemode: options.livemode ?? true,
        amount: options.amount ?? 55000,
        amount_refunded: options.refunded ?? 0,
        currency: "usd",
        paid: (options.type ?? "charge.succeeded") !== "charge.failed",
        refunded: (options.refunded ?? 0) >= (options.amount ?? 55000) && (options.refunded ?? 0) > 0,
        status: options.type === "charge.failed" ? "failed" : "succeeded",
        payment_intent: options.paymentIntent ?? "pi_live_550",
        invoice: options.invoice ?? null,
        receipt_email: options.receiptEmail ?? null,
        receipt_url: "https://pay.stripe.com/receipts/acct_test/ch_live_550",
        description: "Cabinet Dealz order OR-1042",
        billing_details: { name: "Jordan Buyer", email: "buyer@example.com" },
        created: 1760972640,
        metadata: { order_number: "OR-1042", affiliate_id: "9", purpose: "order" },
      },
    },
  };
}

describe("Stripe invoice recording", () => {
  it("keeps checkout and the later charge on one row and links the affiliate order", async () => {
    const store = createMemoryStripePaymentStore();
    const links = emptyPaymentLinkContext({
      findOrderByStripe: async () => ({
        id: 42,
        requestNumber: "OR-1042",
        affiliateId: 9,
        originatorName: "Jordan Buyer",
        originatorEmail: "buyer@example.com",
      }),
    });
    await recordStripeWebhookEvent(checkoutPaidEvent(), { store, links });
    await recordStripeWebhookEvent(chargeEvent({}), { store, links });
    const rows = store.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      checkoutSessionId: "cs_live_550",
      paymentIntentId: "pi_live_550",
      chargeId: "ch_live_550",
      amountCents: 55000,
      currency: "usd",
      status: "paid",
      affiliateId: 9,
      orderRequestId: 42,
      orderNumber: "OR-1042",
      purpose: "order",
      customerEmail: "buyer@example.com",
      receiptEmail: null,
      receiptEmailSent: false,
      livemode: true,
    });
    expect(rows[0].receiptUrl).toContain("pay.stripe.com");
    expect(rows[0].stripeDashboardUrl).toBe("https://dashboard.stripe.com/payments/pi_live_550");
    expect(receiptDelivery(rows[0])).toBe("not_requested");
  });

  it("is idempotent for a replayed event and does not double a refund", async () => {
    const store = createMemoryStripePaymentStore();
    const links = emptyPaymentLinkContext();
    const paid = chargeEvent({ receiptEmail: "buyer@example.com" });
    await recordStripeWebhookEvent(paid, { store, links });
    const replay = await recordStripeWebhookEvent(paid, { store, links });
    expect(replay.duplicate).toBe(true);
    const refund = chargeEvent({
      id: "evt_refund_550",
      type: "charge.refunded",
      refunded: 55000,
      receiptEmail: "buyer@example.com",
    });
    await recordStripeWebhookEvent(refund, { store, links });
    await recordStripeWebhookEvent({ ...refund, id: "evt_refund_550_again" }, { store, links });
    const rows = store.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("refunded");
    expect(rows[0].amountCents).toBe(55000);
    expect(rows[0].amountRefundedCents).toBe(55000);
    expect(rows[0].receiptEmailSent).toBe(true);
  });

  it("records a partial refund without treating it as fully refunded", async () => {
    const store = createMemoryStripePaymentStore();
    await recordStripeWebhookEvent(chargeEvent({}), { store, links: emptyPaymentLinkContext() });
    await recordStripeWebhookEvent(
      chargeEvent({ id: "evt_partial", type: "charge.refunded", refunded: 10000 }),
      { store, links: emptyPaymentLinkContext() },
    );
    expect(store.rows()[0].status).toBe("partially_refunded");
    expect(store.rows()[0].amountRefundedCents).toBe(10000);
  });

  it("does not let a failed event overwrite a paid charge", () => {
    const paid = storeDraft({ status: "paid", amountCents: 55000 });
    const failed = storeDraft({ status: "failed", amountCents: 55000, lastEventType: "payment_intent.payment_failed" });
    expect(mergeStripePayment(paid, failed).status).toBe("paid");
  });

  it("does not email a test-mode receipt even when receipt_email is set", async () => {
    const store = createMemoryStripePaymentStore();
    await recordStripeWebhookEvent(
      chargeEvent({ id: "evt_test_charge", livemode: false, receiptEmail: "buyer@example.com", chargeId: "ch_test_550", paymentIntent: "pi_test_550" }),
      { store, links: emptyPaymentLinkContext() },
    );
    const row = store.rows()[0];
    expect(row.stripeMode).toBe("test");
    expect(row.receiptEmail).toBe("buyer@example.com");
    expect(row.receiptEmailSent).toBe(false);
    expect(receiptDelivery(row)).toBe("test_mode_not_emailed");
    expect(row.stripeDashboardUrl).toBe("https://dashboard.stripe.com/test/payments/pi_test_550");
  });

  it("marks an invoice email sent only after invoice.sent and links a membership reference", async () => {
    const store = createMemoryStripePaymentStore();
    const links = emptyPaymentLinkContext({
      findAffiliateInvoiceByRef: async (refs) =>
        refs.includes("in_live_member")
          ? { id: 3, affiliateId: 12, description: "Annual affiliate membership" }
          : null,
    });
    await recordStripeWebhookEvent(
      {
        id: "evt_invoice_paid",
        type: "invoice.paid",
        created: 1760972700,
        data: {
          object: {
            id: "in_live_member",
            livemode: true,
            status: "paid",
            amount_paid: 119500,
            currency: "usd",
            customer_email: "owner@affiliate.test",
            customer_name: "Affiliate Owner",
            description: "Annual affiliate membership",
            payment_intent: "pi_live_member",
            hosted_invoice_url: "https://invoice.stripe.com/i/acct_test/in_live_member",
            invoice_pdf: "https://pay.stripe.com/invoice/in_live_member/pdf",
            created: 1760972700,
            metadata: { purpose: "affiliate_membership" },
            lines: { data: [{ description: "Annual affiliate membership", quantity: 1, amount: 119500 }] },
          },
        },
      },
      { store, links },
    );
    expect(store.rows()[0]).toMatchObject({
      purpose: "affiliate_membership",
      affiliateId: 12,
      affiliateInvoiceId: 3,
      amountCents: 119500,
      invoiceEmailSent: false,
    });
    await recordStripeWebhookEvent(
      {
        id: "evt_invoice_sent",
        type: "invoice.sent",
        created: 1760972701,
        data: {
          object: {
            id: "in_live_member",
            livemode: true,
            status: "paid",
            amount_paid: 119500,
            currency: "usd",
            customer_email: "owner@affiliate.test",
            payment_intent: "pi_live_member",
            created: 1760972700,
          },
        },
      },
      { store, links },
    );
    expect(store.rows()).toHaveLength(1);
    expect(store.rows()[0].invoiceEmailSent).toBe(true);
    expect(store.rows()[0].lineItemsJson).toEqual([
      { description: "Annual affiliate membership", quantity: 1, amountCents: 119500 },
    ]);
  });

  it("backfills charges, sessions, and invoices once when the sync is repeated", async () => {
    const store = createMemoryStripePaymentStore();
    const reader = {
      async listCharges() {
        return {
          hasMore: false,
          data: [
            chargeEvent({ receiptEmail: null }).data.object,
            {
              id: "ch_live_member",
              livemode: true,
              amount: 119500,
              amount_refunded: 0,
              currency: "usd",
              paid: true,
              status: "succeeded",
              payment_intent: "pi_live_member",
              receipt_email: "owner@affiliate.test",
              receipt_url: "https://pay.stripe.com/receipts/member",
              description: "Annual affiliate membership",
              billing_details: { name: "Affiliate Owner", email: "owner@affiliate.test" },
              created: 1760972800,
              metadata: { purpose: "affiliate_membership", affiliate_id: "4" },
            },
          ],
        };
      },
      async listCheckoutSessions() {
        return { hasMore: false, data: [checkoutPaidEvent().data.object] };
      },
      async listInvoices() {
        return {
          hasMore: false,
          data: [
            {
              id: "in_live_member",
              livemode: true,
              status: "paid",
              amount_paid: 119500,
              currency: "usd",
              payment_intent: "pi_live_member",
              customer_email: "owner@affiliate.test",
              description: "Annual affiliate membership",
              created: 1760972800,
              metadata: { purpose: "affiliate_membership", affiliate_id: "4" },
            },
            { id: "in_open", livemode: true, status: "open", amount_due: 100, currency: "usd", created: 1760972800 },
          ],
        };
      },
    };
    const links = emptyPaymentLinkContext();
    const first = await syncStripeAccount(reader, { store, links });
    const second = await syncStripeAccount(reader, { store, links });
    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(store.rows()).toHaveLength(2);
    const order = store.rows().find((row) => row.paymentIntentId === "pi_live_550");
    const membership = store.rows().find((row) => row.paymentIntentId === "pi_live_member");
    expect(order?.checkoutSessionId).toBe("cs_live_550");
    expect(order?.chargeId).toBe("ch_live_550");
    expect(membership).toMatchObject({
      invoiceId: "in_live_member",
      chargeId: "ch_live_member",
      affiliateId: 4,
      purpose: "affiliate_membership",
      amountCents: 119500,
      receiptEmailSent: true,
    });
  });
});

describe("future checkout receipts", () => {
  it("sets receipt_email and invoice creation when the customer has an email", () => {
    const metadata = checkoutSessionMetadata({
      orderId: 42,
      orderNumber: "OR-1042",
      userId: 3,
      customerEmail: "buyer@example.com",
      customerName: "Jordan Buyer",
      affiliateId: 9,
    });
    expect(metadata).toMatchObject({
      order_id: "42",
      order_number: "OR-1042",
      affiliate_id: "9",
      purpose: "order",
      customer_email: "buyer@example.com",
    });
    const fields = buildHostedCheckoutPaymentFields({
      customerEmail: " buyer@example.com ",
      orderNumber: "OR-1042",
      metadata,
    });
    expect(fields.payment_intent_data?.receipt_email).toBe("buyer@example.com");
    expect(fields.invoice_creation?.enabled).toBe(true);
    expect(fields.invoice_creation?.invoice_data.metadata.affiliate_id).toBe("9");
  });

  it("does not invent a receipt address when the customer email is missing", () => {
    expect(buildHostedCheckoutPaymentFields({ customerEmail: "  ", orderNumber: "OR-1", metadata: {} })).toEqual({});
    expect(buildHostedCheckoutPaymentFields({ customerEmail: null, orderNumber: "OR-1", metadata: {} })).toEqual({});
  });
});

describe("Stripe credential selection for read-only sync", () => {
  it("reads live and test keys separately and ignores values that are not secret keys", () => {
    const targets = stripeReadTargets({
      STRIPE_SECRET_KEY: "sk_test_sandbox_example",
      CABINETDEALZ_STRIPE_LIVE_SECRET_KEY: "sk_live_project_example",
      STRIPE_LIVE_SECRET_KEY: "sk_live_project_example",
      STRIPE_WEBHOOK_SECRET: "not-a-key",
    });
    expect(targets.map((target) => target.mode)).toEqual(["test", "live"]);
    const secrets = configuredWebhookSecrets({
      STRIPE_WEBHOOK_SECRET: "whsec_test_example",
      CABINETDEALZ_STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live_example",
      STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live_example",
    });
    expect(secrets).toEqual(["whsec_test_example", "whsec_live_example"]);
    expect(configuredWebhookSecrets({ STRIPE_WEBHOOK_SECRET: "missing-prefix" })).toEqual([]);
  });

  it("redacts secret material from error text", () => {
    const redacted = redactSecrets("Invalid API Key provided: sk_live_abc123 and whsec_secretvalue");
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("secretvalue");
    expect(redacted).toContain("sk_live_[redacted]");
    expect(redacted).toContain("whsec_[redacted]");
  });
});

describe("stripeInvoices admin access", () => {
  it("refuses guests, customers, and affiliate partners", async () => {
    const callerFor = (role: "user" | "partner" | null) => appRouter.createCaller(ctx(role));
    await expect(callerFor(null).stripeInvoices.adminList({})).rejects.toThrow();
    await expect(callerFor("user").stripeInvoices.adminList({})).rejects.toThrow();
    await expect(callerFor("partner").stripeInvoices.adminAffiliateHistory({ affiliateId: 1 })).rejects.toThrow();
    await expect(callerFor("partner").stripeInvoices.syncFromStripe()).rejects.toThrow();
  });

  it("only lists and reads Stripe data from the admin sync", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers/stripeInvoices.ts"), "utf8");
    expect(source).toContain("adminProcedure");
    expect(source).toContain("charges.list");
    expect(source).toContain("checkout.sessions.list");
    expect(source).toContain("invoices.list");
    expect(source).toContain("accounts.push({ mode: target.mode, ...result })");
    expect(source).toContain("return { accounts }");
    expect(source).toContain("redactSecrets");
    expect(source).not.toContain("refunds.create");
    expect(source).not.toContain("checkout.sessions.create");
    expect(source).not.toContain("sendInvoice");
  });
});

function storeDraft(overrides: Partial<StripePaymentDraft>): StripePaymentDraft {
  return {
    livemode: true,
    stripeMode: "live",
    checkoutSessionId: null,
    paymentIntentId: "pi_live_550",
    chargeId: "ch_live_550",
    invoiceId: null,
    customerId: null,
    subscriptionId: null,
    amountCents: 55000,
    amountRefundedCents: 0,
    currency: "usd",
    status: "paid",
    customerName: "Jordan Buyer",
    customerEmail: "buyer@example.com",
    purpose: "order",
    description: "Order OR-1042",
    lineItemsJson: null,
    metadataJson: null,
    orderRequestId: 42,
    orderNumber: "OR-1042",
    affiliateId: 9,
    affiliateInvoiceId: null,
    receiptEmail: null,
    receiptUrl: null,
    receiptEmailSent: false,
    invoiceEmailSent: false,
    hostedInvoiceUrl: null,
    invoicePdfUrl: null,
    stripeDashboardUrl: null,
    occurredAt: occurred,
    lastEventId: null,
    lastEventType: null,
    ...overrides,
  };
}
