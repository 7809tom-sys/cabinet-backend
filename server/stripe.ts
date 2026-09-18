/**
 * Stripe integration helpers for Cabinet Dealz.
 * Checkout sessions are created server-side; the frontend opens the Stripe-hosted
 * checkout page in a new tab. Webhooks update order payment status.
 */

import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { orderRequests } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Stripe client ────────────────────────────────────────────────────────────

export function getStripe(): Stripe {
  if (!ENV.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-06-24.dahlia" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number; // in cents
  platformSku?: string;
}

export interface CreateCheckoutInput {
  orderId: number;
  orderNumber: string;
  lineItems: CheckoutLineItem[];
  customerEmail?: string;
  customerName?: string;
  userId: number;
  successUrl: string;
  cancelUrl: string;
}

// ─── Create Checkout Session ──────────────────────────────────────────────────

export async function createCheckoutSession(
  input: CreateCheckoutInput
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();

  const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    input.lineItems.map((item) => ({
      price_data: {
        currency: "usd",
        unit_amount: item.unitPriceCents,
        product_data: {
          name: item.description,
          ...(item.platformSku ? { metadata: { sku: item.platformSku } } : {}),
        },
      },
      quantity: item.quantity,
    }));

  const session = await stripe.checkout.sessions.create({
    ui_mode: "hosted_page",
    mode: "payment",
    client_reference_id: String(input.userId),
    customer_email: input.customerEmail,
    billing_address_collection: "auto",
    phone_number_collection: { enabled: false },
    automatic_tax: { enabled: false },
    allow_promotion_codes: false,
    submit_type: "auto",
    integration_identifier: "hosted_web_0001",
    origin_context: "web",
    line_items: stripeLineItems,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      order_id: String(input.orderId),
      order_number: input.orderNumber,
      user_id: String(input.userId),
      customer_email: input.customerEmail ?? "",
      customer_name: input.customerName ?? "",
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  // Persist the session ID on the active order request so the webhook can look
  // it up. `orders` is a retired aggregate path and is deliberately not used
  // by Cart → Order Review → payment.
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(orderRequests)
    .set({ stripeSessionId: session.id })
    .where(eq(orderRequests.id, input.orderId));

  return { url: session.url, sessionId: session.id };
}

// ─── Fulfill a paid order ─────────────────────────────────────────────────────

export async function fulfillOrder(
  sessionId: string,
  paymentIntentId: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(orderRequests)
    .set({
      status: "confirmed",
      stripePaymentIntentId: paymentIntentId ?? undefined,
      paidAt: new Date(),
    })
    .where(eq(orderRequests.stripeSessionId, sessionId));
}
