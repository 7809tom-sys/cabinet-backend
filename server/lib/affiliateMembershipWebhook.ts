/**
 * Membership side of the Stripe webhook.
 *
 * The order Checkout path (fulfillOrder) only ever looks for an order request.
 * A membership Checkout carries `purpose=affiliate_membership` in its metadata,
 * so it is routed here instead. This module is deliberately separate from the
 * order handler: an order must never be created from a membership payment, and a
 * membership must never be activated by an order payment.
 *
 * Handled:
 *   checkout.session.completed / async_payment_succeeded
 *     One-time annual payment, or the first month of a subscription.
 *   invoice.paid
 *     Every later month of a Stripe subscription.
 *   invoice.payment_failed
 *     A renewal card was declined → past_due, so an admin can chase it.
 *   customer.subscription.deleted
 *     Stripe ended the subscription → past_due once the paid period lapses.
 *
 * Every write is keyed on a Stripe id, so a retried webhook is a no-op.
 */

import type Stripe from "stripe";
import { getDb } from "../db";
import { normalizeMembershipPlan, type MembershipPlan } from "@shared/affiliateMembershipPlans";
import {
  findAffiliateIdBySubscriptionId,
  markMembershipPastDue,
  recordStripeMembershipPayment,
} from "./affiliateMembershipBilling";
import { loadMembershipSnapshot } from "./affiliateMembership";
import { isMembershipCheckoutMetadata } from "./affiliateMembershipCheckout";

export type MembershipWebhookOutcome =
  | { handled: false; reason: string }
  | { handled: true; action: string; affiliateId?: number | null };

function metadataOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function positiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function unixMs(seconds: unknown): number {
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  return Number.isFinite(n) && n > 0 ? n * 1000 : Date.now();
}

function subscriptionIdOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id;
  }
  return null;
}

/**
 * Invoice.subscription moved under `parent.subscription_details.subscription`
 * in current Stripe API versions. Read both shapes so the handler survives a
 * pinned API version change without a second code path elsewhere.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = subscriptionIdOf((invoice as unknown as { subscription?: unknown }).subscription);
  if (direct) return direct;
  const parent = invoice.parent;
  if (parent?.type === "subscription_details") {
    return subscriptionIdOf(parent.subscription_details?.subscription);
  }
  return null;
}

/**
 * The plan a Stripe object belongs to. Metadata wins; an invoice created by a
 * subscription can also be recognized from the subscription's own metadata.
 */
function resolvePlan(metadata: Record<string, string>, fallback?: Record<string, string>): MembershipPlan {
  const fromPrimary = metadata.membership_plan;
  if (fromPrimary) return normalizeMembershipPlan(fromPrimary);
  return normalizeMembershipPlan(fallback?.membership_plan);
}

async function handleCheckoutSession(session: Stripe.Checkout.Session): Promise<MembershipWebhookOutcome> {
  const metadata = metadataOf(session.metadata);
  if (!isMembershipCheckoutMetadata(metadata)) return { handled: false, reason: "not_a_membership_session" };

  const affiliateId = positiveInt(metadata.affiliate_id);
  if (!affiliateId) return { handled: false, reason: "missing_affiliate_id" };

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const plan = resolvePlan(metadata);
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const paidAtMs = unixMs(session.created);
  const reference = subscriptionId ? `${subscriptionId}:first` : session.id;

  const result = await recordStripeMembershipPayment(db, {
    affiliateId,
    plan,
    paidAtMs,
    paymentRef: reference,
    amountCents: session.amount_total ?? undefined,
    description: plan === "annual" ? "Annual affiliate membership" : "Monthly affiliate membership (month 1)",
    stripeSubscriptionId: subscriptionId,
    invoiceId: positiveInt(metadata.affiliate_invoice_id),
  });

  return {
    handled: true,
    action: result.applied ? `membership_activated:${plan}` : "membership_already_active",
    affiliateId,
  };
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<MembershipWebhookOutcome> {
  const parent = invoice.parent;
  const subscriptionDetails = parent?.type === "subscription_details" ? parent.subscription_details : null;
  const metadata = metadataOf(invoice.metadata);
  const subscriptionMetadata = metadataOf(subscriptionDetails?.metadata);
  const subscriptionId = invoiceSubscriptionId(invoice);

  const looksLikeMembership =
    isMembershipCheckoutMetadata(metadata) ||
    isMembershipCheckoutMetadata(subscriptionMetadata) ||
    /affiliate membership/i.test(invoice.description ?? "");
  if (!looksLikeMembership) return { handled: false, reason: "not_a_membership_invoice" };

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const affiliateId =
    positiveInt(metadata.affiliate_id) ??
    positiveInt(subscriptionMetadata.affiliate_id) ??
    (subscriptionId ? await findAffiliateIdBySubscriptionId(db, subscriptionId) : null);
  if (!affiliateId) return { handled: false, reason: "unknown_affiliate" };

  // The first month is billed on the same subscription that Checkout created, so
  // it shares one idempotency key with the checkout event. Whichever arrives
  // first does the write; the other finds a paid row and changes nothing. This
  // keeps the first payment counted once even when Stripe delivers the two
  // events out of order or retries one of them.
  const firstMonthOfSubscription = subscriptionId != null && invoice.billing_reason === "subscription_create";

  const plan = resolvePlan(metadata, subscriptionMetadata);
  const result = await recordStripeMembershipPayment(db, {
    affiliateId,
    plan,
    paidAtMs: unixMs(invoice.status_transitions?.paid_at ?? invoice.created),
    paymentRef: firstMonthOfSubscription
      ? `${subscriptionId}:first`
      : subscriptionId
        ? `${subscriptionId}:${invoice.id}`
        : invoice.id,
    amountCents: invoice.amount_paid || undefined,
    description: plan === "annual" ? "Annual affiliate membership" : "Monthly affiliate membership",
    stripeSubscriptionId: subscriptionId,
  });

  return {
    handled: true,
    action: result.applied ? `membership_period_added:${plan}` : "membership_invoice_already_applied",
    affiliateId,
  };
}

async function handleInvoiceFailed(invoice: Stripe.Invoice): Promise<MembershipWebhookOutcome> {
  const parent = invoice.parent;
  const subscriptionDetails = parent?.type === "subscription_details" ? parent.subscription_details : null;
  const subscriptionId = invoiceSubscriptionId(invoice);
  const metadata = metadataOf(invoice.metadata);
  const subscriptionMetadata = metadataOf(subscriptionDetails?.metadata);
  const looksLikeMembership =
    isMembershipCheckoutMetadata(metadata) ||
    isMembershipCheckoutMetadata(subscriptionMetadata) ||
    /affiliate membership/i.test(invoice.description ?? "");
  if (!looksLikeMembership) return { handled: false, reason: "not_a_membership_invoice" };

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const affiliateId =
    positiveInt(metadata.affiliate_id) ??
    positiveInt(subscriptionMetadata.affiliate_id) ??
    (subscriptionId ? await findAffiliateIdBySubscriptionId(db, subscriptionId) : null);
  if (!affiliateId) return { handled: false, reason: "unknown_affiliate" };

  await markMembershipPastDue(db, affiliateId);
  return { handled: true, action: "membership_past_due", affiliateId };
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<MembershipWebhookOutcome> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const affiliateId =
    positiveInt(metadataOf(subscription.metadata).affiliate_id) ??
    (await findAffiliateIdBySubscriptionId(db, subscription.id));
  if (!affiliateId) return { handled: false, reason: "unknown_affiliate" };
  // Access is driven by membershipExpiresAt, so a deleted subscription only
  // matters if the period already ran out. Recompute through the same rule.
  const snapshot = await loadMembershipSnapshot(db, affiliateId);
  if (snapshot?.expiresAt && snapshot.expiresAt.getTime() > Date.now()) {
    return { handled: true, action: "membership_still_paid_through", affiliateId };
  }
  await markMembershipPastDue(db, affiliateId);
  return { handled: true, action: "membership_past_due", affiliateId };
}

/**
 * Entry point the webhook calls for every event. Returns handled:false for
 * anything that is not a membership payment so the order path keeps working
 * exactly as before.
 */
export async function handleMembershipStripeEvent(event: Stripe.Event): Promise<MembershipWebhookOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid" && event.type === "checkout.session.completed") {
        return { handled: false, reason: "membership_checkout_not_paid_yet" };
      }
      return handleCheckoutSession(session);
    }
    case "invoice.paid":
      return handleInvoicePaid(event.data.object as Stripe.Invoice);
    case "invoice.payment_failed":
      return handleInvoiceFailed(event.data.object as Stripe.Invoice);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    default:
      return { handled: false, reason: "event_not_membership_related" };
  }
}
