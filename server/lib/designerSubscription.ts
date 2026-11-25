/**
 * Designer subscriptions: $1,199/year Designer + Website (purchasing club
 * included) and $1,599/year Designer only. Requested by Tom on Nov 25, 2026
 * (corrected from monthly to yearly at 9:53 AM CT).
 *
 * Billing follows the affiliate monthly membership pattern: a hosted Stripe
 * Checkout in mode "subscription" with an inline recurring `price_data`, here
 * with interval "year" so Stripe renews it every 12 months.
 * No Stripe Price or Product has to be created in the dashboard; the amount
 * comes from shared/designerSubscriptionTiers.ts on every Checkout.
 *
 * This module never touches the affiliate membership. Its Checkout metadata
 * carries purpose=designer_subscription, and its product name never contains
 * "affiliate membership", so the membership webhook and the payment-record
 * classifier both leave it alone (it is recorded with purpose "other").
 *
 * Every write is keyed on the Stripe subscription id, so a retried webhook is
 * a no-op. Until docs/sql/0288_designer_subscriptions.tidb.sql is run, the
 * table is missing: reads return "no subscription" and webhook writes are
 * logged and skipped instead of failing the whole webhook.
 */

import type Stripe from "stripe";
import { desc, eq } from "drizzle-orm";
import { getStripe } from "../stripe";
import { getDb } from "../db";
import { designerSubscriptions } from "../../drizzle/schema";
import {
  DESIGNER_SUBSCRIPTION_TIERS,
  designerSubscriptionTier,
  type DesignerSubscriptionTier,
} from "@shared/designerSubscriptionTiers";
import { addMonthsUtc } from "@shared/affiliateMembershipPlans";

export const DESIGNER_SUBSCRIPTION_PURPOSE = "designer_subscription";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── Checkout ────────────────────────────────────────────────────────────────

export function designerSubscriptionMetadata(input: {
  userId: number;
  tier: DesignerSubscriptionTier;
  customerEmail?: string | null;
}): Record<string, string> {
  return {
    purpose: DESIGNER_SUBSCRIPTION_PURPOSE,
    user_id: String(input.userId),
    designer_tier: input.tier,
    customer_email: input.customerEmail ?? "",
  };
}

export function isDesignerSubscriptionMetadata(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.purpose === DESIGNER_SUBSCRIPTION_PURPOSE;
}

export function designerSubscriptionProductName(tier: DesignerSubscriptionTier): string {
  return `Cabinet Dealz ${DESIGNER_SUBSCRIPTION_TIERS[tier].name} — yearly`;
}

export function buildDesignerSubscriptionCheckoutParams(input: {
  userId: number;
  tier: DesignerSubscriptionTier;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const option = DESIGNER_SUBSCRIPTION_TIERS[input.tier];
  const metadata = designerSubscriptionMetadata(input);
  const productName = designerSubscriptionProductName(input.tier);
  return {
    ui_mode: "hosted_page",
    mode: "subscription",
    client_reference_id: String(input.userId),
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    billing_address_collection: "auto",
    phone_number_collection: { enabled: false },
    automatic_tax: { enabled: false },
    allow_promotion_codes: false,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: option.amountCents,
          recurring: { interval: "year", interval_count: 1 },
          product_data: {
            name: productName,
            description: `${option.includes.join(", ")}. Billed yearly. Cancel any time; access runs to the end of the paid year.`,
            metadata: { designer_tier: option.id },
          },
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    subscription_data: { metadata, description: productName },
  };
}

export async function createDesignerSubscriptionCheckout(input: {
  userId: number;
  tier: DesignerSubscriptionTier;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(buildDesignerSubscriptionCheckoutParams(input));
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export function isMissingDesignerSubscriptionTable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = error;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { message?: unknown; cause?: unknown; code?: unknown; errno?: unknown };
    const message = typeof e.message === "string" ? e.message : "";
    if (/designer_subscriptions/i.test(message) && /doesn't exist|does not exist|unknown table|no such table/i.test(message)) return true;
    if ((e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146) && /designer_subscriptions/i.test(message)) return true;
    cur = e.cause;
  }
  return false;
}

export interface DesignerSubscriptionView {
  tier: DesignerSubscriptionTier;
  status: "active" | "past_due" | "cancelled";
  amountCents: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** The signed-in user's newest subscription, or null (also null before the SQL is run). */
export async function loadMyDesignerSubscription(db: Db, userId: number): Promise<(DesignerSubscriptionView & { stripeSubscriptionId: string }) | null> {
  try {
    const [row] = await db
      .select()
      .from(designerSubscriptions)
      .where(eq(designerSubscriptions.userId, userId))
      .orderBy(desc(designerSubscriptions.createdAt))
      .limit(1);
    if (!row) return null;
    return {
      tier: row.tier,
      status: row.status,
      amountCents: row.amountCents,
      currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      stripeSubscriptionId: row.stripeSubscriptionId,
    };
  } catch (error) {
    if (isMissingDesignerSubscriptionTable(error)) return null;
    throw error;
  }
}

async function safeWrite(label: string, write: () => Promise<unknown>): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    if (isMissingDesignerSubscriptionTable(error)) {
      console.warn(`[Designer subscription] ${label} skipped: designer_subscriptions table is not created yet (docs/sql/0288).`);
      return false;
    }
    throw error;
  }
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

export type DesignerSubscriptionWebhookOutcome =
  | { handled: false; reason: string }
  | { handled: true; action: string; userId?: number | null };

function metadataOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id;
  }
  return null;
}

function positiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function invoiceSubscription(invoice: Stripe.Invoice): { id: string | null; metadata: Record<string, string> } {
  const parent = invoice.parent;
  const details = parent?.type === "subscription_details" ? parent.subscription_details : null;
  const id =
    idOf((invoice as unknown as { subscription?: unknown }).subscription) ?? idOf(details?.subscription);
  return { id, metadata: metadataOf(details?.metadata) };
}

function invoicePeriodEnd(invoice: Stripe.Invoice): Date | null {
  const ends = (invoice.lines?.data ?? [])
    .map((line) => line.period?.end)
    .filter((end): end is number => typeof end === "number" && end > 0);
  return ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<DesignerSubscriptionWebhookOutcome> {
  const metadata = metadataOf(session.metadata);
  if (!isDesignerSubscriptionMetadata(metadata)) return { handled: false, reason: "not_a_designer_subscription" };
  const option = designerSubscriptionTier(metadata.designer_tier);
  const userId = positiveInt(metadata.user_id);
  const subscriptionId = idOf(session.subscription);
  if (!option || !userId || !subscriptionId) {
    console.error(`[Designer subscription] Checkout ${session.id} is missing tier, user, or subscription id.`);
    return { handled: true, action: "ignored_incomplete_session", userId };
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const createdMs = typeof session.created === "number" ? session.created * 1000 : Date.now();
  // Yearly plan: the first paid period is 12 months. invoice.paid then sets
  // the exact period end Stripe billed, which wins over this estimate.
  const periodEnd = new Date(addMonthsUtc(createdMs, 12));
  const written = await safeWrite("activate", () =>
    db
      .insert(designerSubscriptions)
      .values({
        userId,
        tier: option.id,
        status: "active",
        amountCents: session.amount_total ?? option.amountCents,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: idOf(session.customer),
        stripeCheckoutSessionId: session.id,
        currentPeriodEnd: periodEnd,
      })
      // Retried webhook, or invoice.paid got there first: keep the row, only
      // fill the checkout session id.
      .onDuplicateKeyUpdate({ set: { stripeCheckoutSessionId: session.id } }),
  );
  return { handled: true, action: written ? `activated:${option.id}` : "table_missing", userId };
}

async function handleInvoice(invoice: Stripe.Invoice, paid: boolean): Promise<DesignerSubscriptionWebhookOutcome> {
  const { id: subscriptionId, metadata: subscriptionMetadata } = invoiceSubscription(invoice);
  const metadata = metadataOf(invoice.metadata);
  if (!isDesignerSubscriptionMetadata(subscriptionMetadata) && !isDesignerSubscriptionMetadata(metadata)) {
    return { handled: false, reason: "not_a_designer_subscription_invoice" };
  }
  if (!subscriptionId) return { handled: true, action: "ignored_no_subscription" };
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (!paid) {
    const written = await safeWrite("past_due", () =>
      db
        .update(designerSubscriptions)
        .set({ status: "past_due", lastStripeInvoiceId: invoice.id ?? null })
        .where(eq(designerSubscriptions.stripeSubscriptionId, subscriptionId)),
    );
    return { handled: true, action: written ? "past_due" : "table_missing" };
  }

  const source = isDesignerSubscriptionMetadata(subscriptionMetadata) ? subscriptionMetadata : metadata;
  const option = designerSubscriptionTier(source.designer_tier);
  const userId = positiveInt(source.user_id);
  const periodEnd = invoicePeriodEnd(invoice);
  const written = await safeWrite("renew", async () => {
    const updated = await db
      .update(designerSubscriptions)
      .set({
        status: "active",
        lastStripeInvoiceId: invoice.id ?? null,
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      })
      .where(eq(designerSubscriptions.stripeSubscriptionId, subscriptionId));
    const affected = (updated as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
    // First invoice can arrive before checkout.session.completed. Create the
    // row from the subscription metadata so the order of events does not matter.
    if (affected === 0 && option && userId) {
      await db
        .insert(designerSubscriptions)
        .values({
          userId,
          tier: option.id,
          status: "active",
          amountCents: invoice.amount_paid ?? option.amountCents,
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: idOf(invoice.customer),
          lastStripeInvoiceId: invoice.id ?? null,
          currentPeriodEnd: periodEnd,
        })
        .onDuplicateKeyUpdate({ set: { status: "active" } });
    }
  });
  return { handled: true, action: written ? "renewed" : "table_missing", userId };
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<DesignerSubscriptionWebhookOutcome> {
  if (!isDesignerSubscriptionMetadata(metadataOf(subscription.metadata))) {
    return { handled: false, reason: "not_a_designer_subscription" };
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const written = await safeWrite("cancel", () =>
    db
      .update(designerSubscriptions)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(designerSubscriptions.stripeSubscriptionId, subscription.id)),
  );
  return { handled: true, action: written ? "cancelled" : "table_missing" };
}

/** Called from server/stripeWebhook.ts before the order and membership paths. */
export async function handleDesignerSubscriptionStripeEvent(event: Stripe.Event): Promise<DesignerSubscriptionWebhookOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    case "invoice.paid":
      return handleInvoice(event.data.object as Stripe.Invoice, true);
    case "invoice.payment_failed":
      return handleInvoice(event.data.object as Stripe.Invoice, false);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    default:
      return { handled: false, reason: "event_not_handled" };
  }
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

/**
 * Stop billing at the end of the year already paid. Access runs to
 * currentPeriodEnd; customer.subscription.deleted marks the row cancelled.
 */
export async function cancelDesignerSubscriptionAtPeriodEnd(db: Db, userId: number): Promise<{ ok: boolean; accessUntil: string | null; reason?: string }> {
  const current = await loadMyDesignerSubscription(db, userId);
  if (!current || current.status === "cancelled") return { ok: false, accessUntil: null, reason: "no_active_subscription" };
  if (current.cancelAtPeriodEnd) return { ok: true, accessUntil: current.currentPeriodEnd };
  const stripe = getStripe();
  await stripe.subscriptions.update(current.stripeSubscriptionId, { cancel_at_period_end: true });
  await safeWrite("schedule cancel", () =>
    db
      .update(designerSubscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(designerSubscriptions.stripeSubscriptionId, current.stripeSubscriptionId)),
  );
  return { ok: true, accessUntil: current.currentPeriodEnd };
}
