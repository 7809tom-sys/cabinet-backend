/**
 * Stripe webhook handler for Cabinet Dealz.
 * Registered BEFORE express.json() so the raw request body is available for
 * Stripe signature verification.
 */

import type { Express, Request, Response } from "express";
import express from "express";
import { getStripe } from "./stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { orderRequests } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export function registerStripeWebhook(app: Express): void {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];

      // ── Test event short-circuit ──────────────────────────────────────────
      // Stripe's webhook test tool sends synthetic events with id starting
      // "evt_test_". These bypass signature verification so the dashboard can
      // confirm the endpoint is reachable.
      let event: ReturnType<typeof getStripe>["webhooks"]["constructEvent"] extends (...args: any[]) => infer R ? R : never;
      try {
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          sig as string,
          ENV.stripeWebhookSecret,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
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
          case "checkout.session.completed": {
            const session = event.data.object as import("stripe").Stripe.Checkout.Session;
            const orderId = session.metadata?.order_id
              ? parseInt(session.metadata.order_id, 10)
              : null;
            const paymentIntentId =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id ?? null;

            if (orderId) {
              const db = await getDb();
              if (db) {
                await db
                  .update(orderRequests)
                  .set({
                    status: "confirmed",
                    confirmedAt: new Date(),
                  })
                  .where(eq(orderRequests.id, orderId));
                console.log(
                  `[Stripe Webhook] Order ${orderId} confirmed (payment_intent=${paymentIntentId ?? "n/a"})`,
                );
              }
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const pi = event.data.object as import("stripe").Stripe.PaymentIntent;
            console.warn(`[Stripe Webhook] Payment failed: ${pi.id}`);
            break;
          }

          default:
            // Unhandled event types — log and acknowledge.
            console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }
      } catch (err) {
        console.error("[Stripe Webhook] Handler error:", err);
        res.status(500).send("Internal server error");
        return;
      }

      res.json({ received: true });
    },
  );
}
