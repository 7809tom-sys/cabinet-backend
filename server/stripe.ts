/**
 * Stripe integration helpers for Cabinet Dealz.
 * Checkout sessions are created server-side; the frontend opens the Stripe-hosted
 * checkout page in a new tab. Webhooks update order payment status.
 */

import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { orders } from "../drizzle/schema";
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
    mode: "payment",
    line_items: stripeLineItems,
    customer_email: input.customerEmail,
    allow_promotion_codes: true,
    client_reference_id: input.userId.toString(),
    metadata: {
      order_id: input.orderId.toString(),
      order_number: input.orderNumber,
      user_id: input.userId.toString(),
      customer_email: input.customerEmail ?? "",
      customer_name: input.customerName ?? "",
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  // Persist the session ID on the order so the webhook can look it up
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(orders)
    .set({ stripeSessionId: session.id })
    .where(eq(orders.id, input.orderId));

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
    .update(orders)
    .set({
      paymentStatus: "paid",
      status: "confirmed",
      stripePaymentIntentId: paymentIntentId ?? undefined,
      paidAt: new Date(),
    })
    .where(eq(orders.stripeSessionId, sessionId));
}
