import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

describe("active order Stripe Checkout", () => {
  it("keeps the minimal Stripe identifiers on the active order request", () => {
    const schema = source("drizzle/schema.ts");
    expect(schema).toContain('stripeSessionId: varchar("stripeSessionId", { length: 255 })');
    expect(schema).toContain('stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 })');
    expect(schema).toContain('paidAt: timestamp("paidAt")');
    expect(schema).toContain('stripeSessionUnique: uniqueIndex("order_requests_stripe_session_uq").on(t.stripeSessionId)');
  });

  it("uses only a submitted order owned by the signed-in customer and server-persisted amounts", () => {
    const orders = source("server/routers/orders.ts");
    const stripeProcedure = orders.slice(orders.indexOf("createStripeCheckout:"));
    expect(stripeProcedure).toContain("createStripeCheckout: protectedProcedure");
    expect(stripeProcedure).toContain('order.userId !== ctx.user.id && ctx.user.role !== "admin"');
    expect(stripeProcedure).toContain('order.status !== "submitted"');
    expect(stripeProcedure).toContain('order.deliveryMethod === "ship" && !order.freightQuoteVerified');
    expect(stripeProcedure).toContain("await getPlatformPricingSettings()");
    expect(stripeProcedure).toContain('description: "Sales tax"');
    expect(stripeProcedure).toContain('description: "Damage coverage"');
    expect(stripeProcedure).toContain('description: "Card processing fee"');
    expect(stripeProcedure).not.toContain("input.freightCents");
    expect(stripeProcedure).not.toContain("input.amountCents");
  });

  it("adds required Stripe metadata and persists the session on order_requests", () => {
    const stripe = source("server/stripe.ts");
    expect(stripe).toContain('import { orderRequests } from "../drizzle/schema"');
    expect(stripe).toContain("client_reference_id: String(input.userId)");
    expect(stripe).toContain("customer_email: input.customerEmail");
    expect(stripe).toContain("order_id: String(input.orderId)");
    expect(stripe).toContain("customer_email: input.customerEmail ?? \"\"");
    expect(stripe).toContain(".update(orderRequests)");
    expect(stripe).toContain("eq(orderRequests.stripeSessionId, sessionId)");
  });

  it("confirms an order only after a paid Stripe checkout webhook", () => {
    const webhook = source("server/stripeWebhook.ts");
    expect(webhook).toContain('if (session.payment_status === "paid")');
    expect(webhook).toContain("await fulfillOrder(session.id, paymentIntentId)");
    expect(webhook).toContain('event.id.startsWith("evt_test_")');
  });

  it("allows zero verified freight only for the single temporary payment test item", () => {
    const orders = source("server/routers/orders.ts");
    expect(orders).toContain("isTemporaryOneDollarFreeShippingOrder(normalizedLines)");
    expect(orders).toContain('deliveryMethod === "ship" && hasOnlyTemporaryFreeShippingItems');
    expect(orders).toContain("freightQuoteVerified = true;");
    expect(orders).toContain('message: "Request a current shipping quote before submitting this order."');
  });
});
