import { desc, eq, or } from "drizzle-orm";
import { orderRequests, stripePaymentRecords, users } from "../../drizzle/schema";
import type { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InvoiceEmailSource = "deal" | "order" | "account" | "stripe_record" | "stripe";
export type InvoiceStripeLookup = "not_needed" | "found" | "unavailable" | "skipped";

export type InvoiceRecipient = {
  email: string | null;
  source: InvoiceEmailSource | null;
  stripeLookup: InvoiceStripeLookup;
};

export type StripeEmailIds = {
  paymentIntentId?: string | null;
  chargeId?: string | null;
  customerId?: string | null;
  sessionId?: string | null;
};

export type StripeEmailReader = {
  retrievePaymentIntent(id: string): Promise<unknown>;
  retrieveCharge(id: string): Promise<unknown>;
  retrieveCustomer(id: string): Promise<unknown>;
  retrieveCheckoutSession(id: string): Promise<unknown>;
};

/** A stored address we can actually send to. Blank and malformed values are ignored. */
export function usableInvoiceEmail(value: string | null | undefined): string | null {
  const email = value?.trim() ?? "";
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/**
 * Copy an incoming address onto a lead only when the lead does not already
 * have one. An existing contact email is left alone.
 */
export function contactEmailToBackfill(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  if (usableInvoiceEmail(existing)) return null;
  return usableInvoiceEmail(incoming);
}

/**
 * Local records win over a live Stripe call.
 * Deal contact, then the linked order, then the checkout row we already stored,
 * then the customer account, then a live Stripe email when one was returned.
 */
export function chooseInvoiceRecipient(input: {
  dealEmail?: string | null;
  orderEmail?: string | null;
  checkoutEmail?: string | null;
  accountEmail?: string | null;
  stripeLiveEmail?: string | null;
  stripeLookup?: InvoiceStripeLookup;
}): InvoiceRecipient {
  const dealEmail = usableInvoiceEmail(input.dealEmail);
  if (dealEmail) return { email: dealEmail, source: "deal", stripeLookup: "not_needed" };
  const orderEmail = usableInvoiceEmail(input.orderEmail);
  if (orderEmail) return { email: orderEmail, source: "order", stripeLookup: "not_needed" };
  const checkoutEmail = usableInvoiceEmail(input.checkoutEmail);
  if (checkoutEmail) return { email: checkoutEmail, source: "stripe_record", stripeLookup: "not_needed" };
  const accountEmail = usableInvoiceEmail(input.accountEmail);
  if (accountEmail) return { email: accountEmail, source: "account", stripeLookup: "not_needed" };
  const stripeLiveEmail = usableInvoiceEmail(input.stripeLiveEmail);
  if (stripeLiveEmail) return { email: stripeLiveEmail, source: "stripe", stripeLookup: "found" };
  return { email: null, source: null, stripeLookup: input.stripeLookup ?? "skipped" };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Pull the customer address off one Stripe object.
 * Preference is receipt_email, then billing_details.email, then customer.email
 * (and the checkout session's customer_details.email / customer_email).
 */
export function customerEmailFromStripeResource(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record || record.deleted === true) return null;
  const charge = asRecord(record.latest_charge) ?? record;
  const billing = asRecord(charge.billing_details) ?? asRecord(record.billing_details);
  const customerDetails = asRecord(record.customer_details);
  return usableInvoiceEmail(asString(record.receipt_email))
    ?? usableInvoiceEmail(asString(charge.receipt_email))
    ?? usableInvoiceEmail(asString(billing?.email))
    ?? usableInvoiceEmail(asString(customerDetails?.email))
    ?? usableInvoiceEmail(asString(record.customer_email))
    ?? usableInvoiceEmail(asString(record.email));
}

async function readStripeResource(
  label: string,
  orderId: number | null,
  load: () => Promise<unknown>,
  timeoutMs: number,
): Promise<{ payload: unknown | null; failed: boolean }> {
  try {
    const payload = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      load().then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    });
    return { payload, failed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[CRM invoice] Stripe customer email lookup failed for order ${orderId ?? "unknown"}: ${message}`);
    return { payload: null, failed: true };
  }
}

/**
 * Live Stripe lookup. A missing payment intent (for example a sandbox charge
 * the current account cannot see) is logged and skipped. It never throws.
 */
export async function lookupStripeCustomerEmail(
  ids: StripeEmailIds,
  options?: { reader?: StripeEmailReader; orderId?: number | null; timeoutMs?: number },
): Promise<{ email: string | null; unavailable: boolean }> {
  const reader = options?.reader ?? await defaultStripeEmailReader();
  if (!reader) return { email: null, unavailable: false };
  const timeoutMs = options?.timeoutMs ?? 4000;
  const orderId = options?.orderId ?? null;
  let unavailable = false;
  let chargeId = ids.chargeId ?? null;
  let customerId = ids.customerId ?? null;

  const consider = async (label: string, id: string | null | undefined, load: (value: string) => Promise<unknown>): Promise<unknown | null> => {
    if (!id) return null;
    const result = await readStripeResource(label, orderId, () => load(id), timeoutMs);
    if (result.failed) unavailable = true;
    return result.payload;
  };

  const intent = await consider("payment_intent", ids.paymentIntentId, (id) => reader.retrievePaymentIntent(id));
  const intentEmail = customerEmailFromStripeResource(intent);
  if (intentEmail) return { email: intentEmail, unavailable: false };
  const intentRecord = asRecord(intent);
  if (typeof intentRecord?.latest_charge === "string") chargeId = chargeId || intentRecord.latest_charge;
  if (typeof intentRecord?.customer === "string") customerId = customerId || intentRecord.customer;

  const charge = await consider("charge", chargeId, (id) => reader.retrieveCharge(id));
  const chargeEmail = customerEmailFromStripeResource(charge);
  if (chargeEmail) return { email: chargeEmail, unavailable: false };
  const chargeRecord = asRecord(charge);
  if (typeof chargeRecord?.customer === "string") customerId = customerId || chargeRecord.customer;

  const session = await consider("checkout_session", ids.sessionId, (id) => reader.retrieveCheckoutSession(id));
  const sessionEmail = customerEmailFromStripeResource(session);
  if (sessionEmail) return { email: sessionEmail, unavailable: false };
  const sessionRecord = asRecord(session);
  if (typeof sessionRecord?.customer === "string") customerId = customerId || sessionRecord.customer;

  const customer = await consider("customer", customerId, (id) => reader.retrieveCustomer(id));
  const customerEmail = customerEmailFromStripeResource(customer);
  if (customerEmail) return { email: customerEmail, unavailable: false };
  return { email: null, unavailable };
}

async function defaultStripeEmailReader(): Promise<StripeEmailReader | null> {
  const { ENV } = await import("../_core/env");
  if (!ENV.stripeSecretKey) return null;
  const { getStripe } = await import("../stripe");
  const stripe = getStripe();
  return {
    retrievePaymentIntent: (id) => stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] }),
    retrieveCharge: (id) => stripe.charges.retrieve(id),
    retrieveCustomer: (id) => stripe.customers.retrieve(id),
    retrieveCheckoutSession: (id) => stripe.checkout.sessions.retrieve(id),
  };
}

/**
 * Email to offer for a CRM invoice.
 * Uses only rows we already stored unless every local source is empty and the
 * order has a Stripe id. A failed Stripe read leaves the email empty.
 */
export async function loadDealInvoiceRecipient(
  db: Database,
  deal: { contactEmail?: string | null; orderRequestId?: number | null },
): Promise<InvoiceRecipient> {
  const dealEmail = usableInvoiceEmail(deal.contactEmail);
  if (dealEmail) return { email: dealEmail, source: "deal", stripeLookup: "not_needed" };
  if (deal.orderRequestId == null) return { email: null, source: null, stripeLookup: "skipped" };

  const [order] = await db.select({
    id: orderRequests.id,
    requestNumber: orderRequests.requestNumber,
    originatorEmail: orderRequests.originatorEmail,
    userId: orderRequests.userId,
    stripePaymentIntentId: orderRequests.stripePaymentIntentId,
    stripeSessionId: orderRequests.stripeSessionId,
  }).from(orderRequests).where(eq(orderRequests.id, deal.orderRequestId)).limit(1);
  if (!order) return { email: null, source: null, stripeLookup: "skipped" };

  const orderEmail = usableInvoiceEmail(order.originatorEmail);
  if (orderEmail) return { email: orderEmail, source: "order", stripeLookup: "not_needed" };

  const records = await db.select({
    customerEmail: stripePaymentRecords.customerEmail,
    receiptEmail: stripePaymentRecords.receiptEmail,
    paymentIntentId: stripePaymentRecords.paymentIntentId,
    chargeId: stripePaymentRecords.chargeId,
    customerId: stripePaymentRecords.customerId,
    checkoutSessionId: stripePaymentRecords.checkoutSessionId,
  }).from(stripePaymentRecords).where(or(
    eq(stripePaymentRecords.orderRequestId, order.id),
    eq(stripePaymentRecords.orderNumber, order.requestNumber),
  )).orderBy(desc(stripePaymentRecords.occurredAt)).limit(5);

  let checkoutEmail: string | null = null;
  const stripeIds: StripeEmailIds = {
    paymentIntentId: order.stripePaymentIntentId,
    sessionId: order.stripeSessionId,
    chargeId: null,
    customerId: null,
  };
  for (const record of records) {
    checkoutEmail = checkoutEmail
      ?? usableInvoiceEmail(record.customerEmail)
      ?? usableInvoiceEmail(record.receiptEmail);
    stripeIds.paymentIntentId = stripeIds.paymentIntentId || record.paymentIntentId;
    stripeIds.sessionId = stripeIds.sessionId || record.checkoutSessionId;
    stripeIds.chargeId = stripeIds.chargeId || record.chargeId;
    stripeIds.customerId = stripeIds.customerId || record.customerId;
  }
  if (checkoutEmail) return { email: checkoutEmail, source: "stripe_record", stripeLookup: "not_needed" };

  if (order.userId) {
    const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, order.userId)).limit(1);
    const accountEmail = usableInvoiceEmail(account?.email);
    if (accountEmail) return { email: accountEmail, source: "account", stripeLookup: "not_needed" };
  }

  const hasStripeId = Boolean(stripeIds.paymentIntentId || stripeIds.chargeId || stripeIds.customerId || stripeIds.sessionId);
  if (!hasStripeId) return { email: null, source: null, stripeLookup: "skipped" };
  const live = await lookupStripeCustomerEmail(stripeIds, { orderId: order.id });
  return chooseInvoiceRecipient({
    stripeLiveEmail: live.email,
    stripeLookup: live.email ? "found" : live.unavailable ? "unavailable" : "skipped",
  });
}
