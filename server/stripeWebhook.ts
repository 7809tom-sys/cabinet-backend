/**
 * Stripe webhook handler for Cabinet Dealz.
 * Registered BEFORE express.json() so the raw request body is available for
 * Stripe signature verification.
 */

import type { Express, Request, Response } from "express";
import express from "express";
import type Stripe from "stripe";
import { fulfillOrder, getStripe } from "./stripe";
import { getDb } from "./db";
import { createHardwareCommissionSnapshot } from "./lib/hardwareCommissionSnapshot";
import { markOrderPaidById, sendPaidOrderReceipt } from "./lib/orderReceiptEmail";
import { createDbPaymentLinkContext, createDrizzleStripePaymentStore } from "./stripePaymentStore";
import {
  configuredWebhookSecrets,
  recordStripeWebhookEvent,
  redactSecrets,
  type StripePaymentLineItem,
} from "./stripePaymentRecords";

function constructStripeEvent(body: Buffer, signature: string | string[] | undefined): Stripe.Event {
  const stripe = getStripe();
  const header = Array.isArray(signature) ? signature[0] : signature;
  if (!header) throw new Error("Missing Stripe signature");
  const secrets = configuredWebhookSecrets();
  if (secrets.length === 0) throw new Error("Stripe webhook signing secret is not configured");
  let lastMessage = "Signature verification failed";
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, header, secret);
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : lastMessage;
    }
  }
  throw new Error(redactSecrets(lastMessage));
}

async function retrieveSessionLineItems(sessionId: string): Promise<StripePaymentLineItem[] | null> {
  const stripe = getStripe();
  const page = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
  const items = page.data.map((item) => ({
    description: item.description ?? "Item",
    quantity: item.quantity ?? 1,
    amountCents: item.amount_total ?? item.amount_subtotal ?? 0,
  }));
  return items.length > 0 ? items : null;
}

export function registerStripeWebhook(app: Express): void {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];

      // Stripe's webhook test tool sends synthetic events whose ids start with
      // "evt_test_". Signature is still verified. Those events only confirm the
      // endpoint is reachable; they are not stored as payments.
      let event: Stripe.Event;
      try {
        event = constructStripeEvent(req.body as Buffer, sig);
      } catch (err) {
        const msg = redactSecrets(err instanceof Error ? err.message : "Unknown error");
        console.error("[Stripe Webhook] Signature verification failed:", msg);
        res.status(400).send(`Webhook Error: ${msg}`);
        return;
      }

      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        res.json({ verified: true });
        return;
      }

      console.log(`[Stripe Webhook] Event: ${event.type} (${event.id})`);

      try {
        switch (event.type) {
          case "checkout.session.completed":
          case "checkout.session.async_payment_succeeded": {
            const session = event.data.object as import("stripe").Stripe.Checkout.Session;
            const paymentIntentId =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id ?? null;

            if (session.payment_status === "paid" || event.type === "checkout.session.async_payment_succeeded") {
              const orderId = await fulfillOrder(session.id, paymentIntentId);
              console.log(
                `[Stripe Webhook] Checkout ${session.id} confirmed (payment_intent=${paymentIntentId ?? "n/a"})`,
              );
              if (orderId) await sendPaidOrderReceipt(orderId);
              else console.error(`[Order Receipt] Paid checkout ${session.id} did not match an order, so no receipt was sent.`);
            } else {
              console.warn(`[Stripe Webhook] Checkout ${session.id} completed without a paid status.`);
            }
            break;
          }

          case "payment_intent.succeeded": {
            const pi = event.data.object as import("stripe").Stripe.PaymentIntent;
            const purpose = pi.metadata?.purpose?.trim();
            const rawOrderId = Number(pi.metadata?.order_id);
            const orderId = (purpose == null || purpose === "" || purpose === "order") && Number.isInteger(rawOrderId) && rawOrderId > 0
              ? rawOrderId
              : null;
            if (orderId) {
              await markOrderPaidById(orderId, pi.id);
              await createHardwareCommissionSnapshot(orderId);
              await sendPaidOrderReceipt(orderId);
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const pi = event.data.object as import("stripe").Stripe.PaymentIntent;
            console.warn(`[Stripe Webhook] Payment failed: ${pi.id}`);
            break;
          }

          default:
            break;
        }

        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await recordStripeWebhookEvent(event, {
          store: createDrizzleStripePaymentStore(db),
          links: createDbPaymentLinkContext(db),
          retrieveSessionLineItems,
        });
      } catch (err) {
        console.error("[Stripe Webhook] Handler error:", redactSecrets(err instanceof Error ? err.message : "Unknown error"));
        res.status(500).send("Internal server error");
        return;
      }

      res.json({ received: true });
    },
  );
}
