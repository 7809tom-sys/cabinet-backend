/**
 * Stripe payment history: map webhook and API objects onto one invoice row,
 * merge repeats without double-counting, and describe whether a receipt or
 * invoice email actually goes out.
 *
 * Stripe emails a receipt in live mode when `receipt_email` is set, regardless
 * of Dashboard email settings. Test-mode charges never send that email.
 * Invoice emails are recorded only after Stripe emits `invoice.sent`.
 */

import type { StripePaymentLineItem } from "../drizzle/schema";

export type { StripePaymentLineItem };

export type StripePaymentStatus = "paid" | "refunded" | "partially_refunded" | "failed" | "pending";
export type StripePaymentPurpose = "order" | "affiliate_membership" | "other";
export type StripeMode = "live" | "test";
export type ReceiptDelivery = "live_receipt_email" | "test_mode_not_emailed" | "not_requested";
export type InvoiceDelivery = "invoice_email_sent" | "invoice_created" | "test_mode_not_emailed" | "not_created";

export interface StripePaymentDraft {
  livemode: boolean;
  stripeMode: StripeMode;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  invoiceId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  amountCents: number;
  amountRefundedCents: number;
  currency: string;
  status: StripePaymentStatus;
  customerName: string | null;
  customerEmail: string | null;
  purpose: StripePaymentPurpose;
  description: string | null;
  lineItemsJson: StripePaymentLineItem[] | null;
  metadataJson: Record<string, string> | null;
  orderRequestId: number | null;
  orderNumber: string | null;
  affiliateId: number | null;
  affiliateInvoiceId: number | null;
  receiptEmail: string | null;
  receiptUrl: string | null;
  receiptEmailSent: boolean;
  invoiceEmailSent: boolean;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  stripeDashboardUrl: string | null;
  occurredAt: Date;
  lastEventId: string | null;
  lastEventType: string | null;
}

export interface StoredStripePayment extends StripePaymentDraft {
  id: number;
}

export interface StripePaymentStore {
  findByStripeIds(ids: StripeIdSet): Promise<StoredStripePayment[]>;
  insert(row: StripePaymentDraft): Promise<StoredStripePayment>;
  update(id: number, row: StripePaymentDraft): Promise<StoredStripePayment>;
  deleteIds(ids: number[]): Promise<void>;
  hasEvent(eventId: string): Promise<boolean>;
  saveEvent(eventId: string, eventType: string): Promise<void>;
}

export interface StripeIdSet {
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  invoiceId?: string | null;
}

export interface OrderPaymentLink {
  id: number;
  requestNumber: string;
  affiliateId: number | null;
  originatorName: string | null;
  originatorEmail: string | null;
}

export interface AffiliateInvoiceLink {
  id: number;
  affiliateId: number;
  description: string | null;
}

export interface PaymentLinkContext {
  findOrderByStripe(ids: { sessionId?: string | null; paymentIntentId?: string | null; orderId?: number | null }): Promise<OrderPaymentLink | null>;
  findAffiliateInvoiceByRef(refs: string[]): Promise<AffiliateInvoiceLink | null>;
  findAffiliateByEmail(email: string): Promise<{ id: number } | null>;
}

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.succeeded",
  "charge.failed",
  "charge.refunded",
  "charge.updated",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.sent",
]);

const STATUS_RANK: Record<StripePaymentStatus, number> = {
  pending: 0,
  failed: 1,
  paid: 2,
  partially_refunded: 3,
  refunded: 4,
};

export function isHandledStripeEvent(type: string): boolean {
  return HANDLED_EVENT_TYPES.has(type);
}

export function redactSecrets(message: string): string {
  return message
    .replace(/sk_(live|test)_[^\s'"]+/g, "sk_$1_[redacted]")
    .replace(/pk_(live|test)_[^\s'"]+/g, "pk_$1_[redacted]")
    .replace(/whsec_[^\s'"]+/g, "whsec_[redacted]");
}

export function stripeDashboardUrl(input: {
  livemode: boolean;
  chargeId?: string | null;
  paymentIntentId?: string | null;
  invoiceId?: string | null;
  checkoutSessionId?: string | null;
}): string {
  const base = input.livemode ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test";
  if (input.paymentIntentId) return `${base}/payments/${input.paymentIntentId}`;
  if (input.chargeId) return `${base}/payments/${input.chargeId}`;
  if (input.invoiceId) return `${base}/invoices/${input.invoiceId}`;
  if (input.checkoutSessionId) return `${base}/checkout/sessions/${input.checkoutSessionId}`;
  return `${base}/payments`;
}

export function receiptDelivery(input: { livemode: boolean; receiptEmail: string | null }): ReceiptDelivery {
  if (!input.livemode) return "test_mode_not_emailed";
  return input.receiptEmail ? "live_receipt_email" : "not_requested";
}

export function invoiceDelivery(input: {
  livemode: boolean;
  invoiceId: string | null;
  invoiceEmailSent: boolean;
}): InvoiceDelivery {
  if (!input.invoiceId) return "not_created";
  if (!input.livemode) return "test_mode_not_emailed";
  return input.invoiceEmailSent ? "invoice_email_sent" : "invoice_created";
}

/** Live-mode receipts are emailed when receipt_email is set. Test mode never emails them. */
export function deriveReceiptEmailSent(input: { livemode: boolean; receiptEmail: string | null }): boolean {
  return input.livemode && Boolean(input.receiptEmail);
}

export interface CheckoutMetadataInput {
  orderId: number;
  orderNumber: string;
  userId: number;
  customerEmail?: string;
  customerName?: string;
  affiliateId?: number | null;
}

export function checkoutSessionMetadata(input: CheckoutMetadataInput): Record<string, string> {
  return {
    order_id: String(input.orderId),
    order_number: input.orderNumber,
    user_id: String(input.userId),
    customer_email: input.customerEmail ?? "",
    customer_name: input.customerName ?? "",
    affiliate_id: input.affiliateId != null ? String(input.affiliateId) : "",
    purpose: "order",
  };
}

/**
 * Fields added to a hosted Checkout Session so a live-mode customer receives a
 * Stripe receipt and Stripe also creates an invoice for the payment.
 * Omitted when we have no customer email, because Stripe cannot address either.
 */
export function buildHostedCheckoutPaymentFields(input: {
  customerEmail?: string | null;
  orderNumber: string;
  metadata: Record<string, string>;
}): {
  payment_intent_data?: {
    receipt_email: string;
    description: string;
    metadata: Record<string, string>;
  };
  invoice_creation?: {
    enabled: true;
    invoice_data: {
      description: string;
      metadata: Record<string, string>;
      footer: string;
    };
  };
} {
  const receiptEmail = input.customerEmail?.trim() || "";
  if (!receiptEmail) return {};
  const description = `Cabinet Dealz order ${input.orderNumber}`;
  return {
    payment_intent_data: {
      receipt_email: receiptEmail,
      description,
      metadata: input.metadata,
    },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description,
        metadata: input.metadata,
        footer: "Thank you for your Cabinet Dealz order.",
      },
    },
  };
}

export function mergeStripePayment(existing: StripePaymentDraft | null, incoming: StripePaymentDraft): StripePaymentDraft {
  if (!existing) return finalizeDraft(incoming);
  const status = pickStatus(existing.status, incoming.status);
  const metadataJson = { ...(existing.metadataJson ?? {}), ...(incoming.metadataJson ?? {}) };
  const merged: StripePaymentDraft = {
    ...existing,
    livemode: existing.livemode || incoming.livemode,
    stripeMode: existing.livemode || incoming.livemode ? "live" : "test",
    checkoutSessionId: prefer(incoming.checkoutSessionId, existing.checkoutSessionId),
    paymentIntentId: prefer(incoming.paymentIntentId, existing.paymentIntentId),
    chargeId: prefer(incoming.chargeId, existing.chargeId),
    invoiceId: prefer(incoming.invoiceId, existing.invoiceId),
    customerId: prefer(incoming.customerId, existing.customerId),
    subscriptionId: prefer(incoming.subscriptionId, existing.subscriptionId),
    amountCents: incoming.amountCents > 0 ? incoming.amountCents : existing.amountCents,
    amountRefundedCents: Math.max(existing.amountRefundedCents, incoming.amountRefundedCents),
    currency: prefer(incoming.currency, existing.currency) ?? "usd",
    status,
    customerName: prefer(incoming.customerName, existing.customerName),
    customerEmail: prefer(incoming.customerEmail, existing.customerEmail),
    purpose: incoming.purpose !== "other" ? incoming.purpose : existing.purpose,
    description: prefer(incoming.description, existing.description),
    lineItemsJson: incoming.lineItemsJson?.length ? incoming.lineItemsJson : existing.lineItemsJson,
    metadataJson: Object.keys(metadataJson).length > 0 ? metadataJson : null,
    orderRequestId: incoming.orderRequestId ?? existing.orderRequestId,
    orderNumber: prefer(incoming.orderNumber, existing.orderNumber),
    affiliateId: incoming.affiliateId ?? existing.affiliateId,
    affiliateInvoiceId: incoming.affiliateInvoiceId ?? existing.affiliateInvoiceId,
    receiptEmail: prefer(incoming.receiptEmail, existing.receiptEmail),
    receiptUrl: prefer(incoming.receiptUrl, existing.receiptUrl),
    receiptEmailSent: false,
    invoiceEmailSent: existing.invoiceEmailSent || incoming.invoiceEmailSent,
    hostedInvoiceUrl: prefer(incoming.hostedInvoiceUrl, existing.hostedInvoiceUrl),
    invoicePdfUrl: prefer(incoming.invoicePdfUrl, existing.invoicePdfUrl),
    stripeDashboardUrl: null,
    occurredAt: existing.occurredAt.getTime() <= incoming.occurredAt.getTime() ? existing.occurredAt : incoming.occurredAt,
    lastEventId: incoming.lastEventId ?? existing.lastEventId,
    lastEventType: incoming.lastEventType ?? existing.lastEventType,
  };
  return finalizeDraft(merged);
}

function pickStatus(existing: StripePaymentStatus, incoming: StripePaymentStatus): StripePaymentStatus {
  if (incoming === "failed" && (existing === "paid" || existing === "refunded" || existing === "partially_refunded")) {
    return existing;
  }
  if (existing === "failed" && incoming === "pending") return existing;
  return STATUS_RANK[incoming] >= STATUS_RANK[existing] ? incoming : existing;
}

function prefer<T extends string>(incoming: T | null | undefined, existing: T | null | undefined): T | null {
  if (incoming != null && incoming !== "") return incoming;
  return existing ?? null;
}

export function finalizeDraft(draft: StripePaymentDraft): StripePaymentDraft {
  const receiptEmailSent = deriveReceiptEmailSent(draft);
  return {
    ...draft,
    currency: (draft.currency || "usd").toLowerCase(),
    receiptEmailSent,
    stripeDashboardUrl: stripeDashboardUrl(draft),
  };
}

export async function enrichStripePaymentDraft(draft: StripePaymentDraft, links: PaymentLinkContext): Promise<StripePaymentDraft> {
  const metadata = draft.metadataJson ?? {};
  const orderId = positiveInt(metadata.order_id) ?? draft.orderRequestId;
  const order = await links.findOrderByStripe({
    sessionId: draft.checkoutSessionId,
    paymentIntentId: draft.paymentIntentId,
    orderId,
  });
  const next: StripePaymentDraft = { ...draft };
  if (order) {
    next.orderRequestId = order.id;
    next.orderNumber = order.requestNumber;
    next.affiliateId = next.affiliateId ?? order.affiliateId;
    next.customerName = next.customerName ?? order.originatorName;
    next.customerEmail = next.customerEmail ?? order.originatorEmail;
    if (next.purpose === "other") next.purpose = "order";
    if (!next.description) next.description = `Order ${order.requestNumber}`;
  }
  const affiliateFromMeta = positiveInt(metadata.affiliate_id);
  if (affiliateFromMeta) next.affiliateId = next.affiliateId ?? affiliateFromMeta;
  const metaPurpose = metadata.purpose;
  if (metaPurpose === "order" || metaPurpose === "affiliate_membership") next.purpose = metaPurpose;
  if (next.purpose === "other") next.purpose = inferPurpose(metadata, next.description);

  const refs = [next.chargeId, next.paymentIntentId, next.checkoutSessionId, next.invoiceId].filter(
    (value): value is string => Boolean(value),
  );
  if (refs.length > 0) {
    const invoice = await links.findAffiliateInvoiceByRef(refs);
    if (invoice) {
      next.affiliateInvoiceId = invoice.id;
      next.affiliateId = next.affiliateId ?? invoice.affiliateId;
      next.purpose = "affiliate_membership";
      next.description = next.description ?? invoice.description;
    }
  }
  if (!next.affiliateId && next.purpose === "affiliate_membership" && next.customerEmail) {
    const affiliate = await links.findAffiliateByEmail(next.customerEmail);
    if (affiliate) next.affiliateId = affiliate.id;
  }
  return finalizeDraft(next);
}

function inferPurpose(metadata: Record<string, string>, description: string | null): StripePaymentPurpose {
  if (metadata.order_id || metadata.order_number) return "order";
  const text = `${description ?? ""} ${metadata.description ?? ""}`.toLowerCase();
  if (text.includes("affiliate membership") || text.includes("annual affiliate")) return "affiliate_membership";
  return "other";
}

function positiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isDuplicateKeyError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const pending: unknown[] = [error];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const record = current as { code?: string; errno?: number; message?: string; cause?: unknown };
    if (record.code === "ER_DUP_ENTRY" || record.errno === 1062) return true;
    if (typeof record.message === "string" && record.message.toLowerCase().includes("duplicate")) return true;
    if (record.cause) pending.push(record.cause);
  }
  return false;
}

export async function upsertStripePayment(store: StripePaymentStore, draft: StripePaymentDraft): Promise<{ row: StoredStripePayment; created: boolean }> {
  try {
    return await upsertStripePaymentOnce(store, draft);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return upsertStripePaymentOnce(store, draft);
  }
}

async function upsertStripePaymentOnce(store: StripePaymentStore, draft: StripePaymentDraft): Promise<{ row: StoredStripePayment; created: boolean }> {
  const finalized = finalizeDraft(draft);
  if (!hasStripeIdentity(finalized)) {
    throw new Error("Stripe payment is missing a session, payment intent, charge, or invoice id");
  }
  const matches = await store.findByStripeIds(finalized);
  if (matches.length === 0) {
    const row = await store.insert(finalized);
    return { row, created: true };
  }
  const [primary, ...extras] = matches;
  let merged = mergeStripePayment(toDraft(primary), finalized);
  for (const extra of extras) merged = mergeStripePayment(merged, toDraft(extra));
  if (extras.length > 0) await store.deleteIds(extras.map((row) => row.id));
  const row = await store.update(primary.id, merged);
  return { row, created: false };
}

export function hasStripeIdentity(draft: StripeIdSet): boolean {
  return Boolean(draft.checkoutSessionId || draft.paymentIntentId || draft.chargeId || draft.invoiceId);
}

export function toDraft(row: StoredStripePayment): StripePaymentDraft {
  const { id: _id, ...draft } = row;
  return draft;
}

export interface RecordStripeEventResult {
  recorded: boolean;
  duplicate: boolean;
  created: boolean;
}

export async function recordStripeWebhookEvent(
  event: { id: string; type: string; created?: number; data: { object: unknown } },
  deps: {
    store: StripePaymentStore;
    links: PaymentLinkContext;
    retrieveSessionLineItems?: (sessionId: string) => Promise<StripePaymentLineItem[] | null>;
  },
): Promise<RecordStripeEventResult> {
  if (!isHandledStripeEvent(event.type)) return { recorded: false, duplicate: false, created: false };
  if (await deps.store.hasEvent(event.id)) return { recorded: false, duplicate: true, created: false };
  let draft = draftFromStripeEvent(event);
  if (!draft) {
    await deps.store.saveEvent(event.id, event.type);
    return { recorded: false, duplicate: false, created: false };
  }
  if (draft.checkoutSessionId && deps.retrieveSessionLineItems && !draft.lineItemsJson?.length) {
    try {
      draft.lineItemsJson = await deps.retrieveSessionLineItems(draft.checkoutSessionId);
    } catch (error) {
      console.warn("[Stripe Webhook] Line items were not loaded:", redactSecrets(error instanceof Error ? error.message : "unknown error"));
    }
  }
  const enriched = await enrichStripePaymentDraft(draft, deps.links);
  const saved = await upsertStripePayment(deps.store, enriched);
  await deps.store.saveEvent(event.id, event.type);
  return { recorded: true, duplicate: false, created: saved.created };
}

export function draftFromStripeEvent(event: { id: string; type: string; created?: number; data: { object: unknown } }): StripePaymentDraft | null {
  const object = asRecord(event.data?.object);
  if (!object) return null;
  const base = blankDraft(event);
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
      return fromCheckoutSession(object, base, event.type);
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled":
      return fromPaymentIntent(object, base, event.type);
    case "charge.succeeded":
    case "charge.failed":
    case "charge.refunded":
    case "charge.updated":
      return fromCharge(object, base, event.type);
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.sent":
      return fromInvoice(object, base, event.type);
    default:
      return null;
  }
}

function blankDraft(event: { id: string; type: string; created?: number }): StripePaymentDraft {
  return {
    livemode: false,
    stripeMode: "test",
    checkoutSessionId: null,
    paymentIntentId: null,
    chargeId: null,
    invoiceId: null,
    customerId: null,
    subscriptionId: null,
    amountCents: 0,
    amountRefundedCents: 0,
    currency: "usd",
    status: "pending",
    customerName: null,
    customerEmail: null,
    purpose: "other",
    description: null,
    lineItemsJson: null,
    metadataJson: null,
    orderRequestId: null,
    orderNumber: null,
    affiliateId: null,
    affiliateInvoiceId: null,
    receiptEmail: null,
    receiptUrl: null,
    receiptEmailSent: false,
    invoiceEmailSent: false,
    hostedInvoiceUrl: null,
    invoicePdfUrl: null,
    stripeDashboardUrl: null,
    occurredAt: new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000),
    lastEventId: event.id,
    lastEventType: event.type,
  };
}

function fromCheckoutSession(session: Record<string, unknown>, base: StripePaymentDraft, eventType: string): StripePaymentDraft | null {
  const sessionId = asString(session.id);
  if (!sessionId) return null;
  const paymentStatus = asString(session.payment_status);
  const status: StripePaymentStatus =
    eventType === "checkout.session.async_payment_failed"
      ? "failed"
      : paymentStatus === "paid" || eventType === "checkout.session.async_payment_succeeded"
        ? "paid"
        : "pending";
  const customerDetails = asRecord(session.customer_details);
  const metadata = safeMetadata(asMetadata(session.metadata));
  return finalizeDraft({
    ...base,
    ...modeFields(session),
    checkoutSessionId: sessionId,
    paymentIntentId: asId(session.payment_intent),
    invoiceId: asId(session.invoice),
    customerId: asId(session.customer),
    subscriptionId: asId(session.subscription),
    amountCents: asNumber(session.amount_total) ?? 0,
    currency: asString(session.currency) ?? "usd",
    status,
    customerName: asString(customerDetails?.name) ?? asString(metadata?.customer_name),
    customerEmail: asString(customerDetails?.email) ?? asString(session.customer_email) ?? asString(metadata?.customer_email),
    description: metadata?.order_number ? `Order ${metadata.order_number}` : null,
    metadataJson: metadata,
    orderNumber: metadata?.order_number ?? null,
    occurredAt: unixDate(session.created) ?? base.occurredAt,
  });
}

function fromPaymentIntent(intent: Record<string, unknown>, base: StripePaymentDraft, eventType: string): StripePaymentDraft | null {
  const paymentIntentId = asString(intent.id);
  if (!paymentIntentId) return null;
  const metadata = safeMetadata(asMetadata(intent.metadata));
  const error = asRecord(intent.last_payment_error);
  const status: StripePaymentStatus =
    eventType === "payment_intent.succeeded" ? "paid" : eventType === "payment_intent.canceled" || eventType === "payment_intent.payment_failed" ? "failed" : "pending";
  return finalizeDraft({
    ...base,
    ...modeFields(intent),
    paymentIntentId,
    customerId: asId(intent.customer),
    invoiceId: asId(intent.invoice),
    amountCents: asNumber(intent.amount_received) || asNumber(intent.amount) || 0,
    currency: asString(intent.currency) ?? "usd",
    status,
    receiptEmail: asString(intent.receipt_email),
    customerEmail: asString(intent.receipt_email) ?? asString(metadata?.customer_email),
    customerName: asString(metadata?.customer_name),
    description: asString(intent.description) ?? (eventType === "payment_intent.payment_failed" ? asString(error?.message) : null),
    metadataJson: metadata,
    orderNumber: metadata?.order_number ?? null,
    occurredAt: unixDate(intent.created) ?? base.occurredAt,
  });
}

function fromCharge(charge: Record<string, unknown>, base: StripePaymentDraft, _eventType: string): StripePaymentDraft | null {
  const chargeId = asString(charge.id);
  if (!chargeId) return null;
  const metadata = safeMetadata(asMetadata(charge.metadata));
  const billing = asRecord(charge.billing_details);
  const amount = asNumber(charge.amount) ?? 0;
  const refunded = asNumber(charge.amount_refunded) ?? 0;
  return finalizeDraft({
    ...base,
    ...modeFields(charge),
    chargeId,
    paymentIntentId: asId(charge.payment_intent),
    invoiceId: asId(charge.invoice),
    customerId: asId(charge.customer),
    amountCents: amount,
    amountRefundedCents: refunded,
    currency: asString(charge.currency) ?? "usd",
    status: statusFromCharge(charge, amount, refunded),
    customerName: asString(billing?.name) ?? asString(metadata?.customer_name),
    customerEmail: asString(billing?.email) ?? asString(charge.receipt_email) ?? asString(metadata?.customer_email),
    receiptEmail: asString(charge.receipt_email),
    receiptUrl: asString(charge.receipt_url),
    description: asString(charge.description) ?? (metadata?.order_number ? `Order ${metadata.order_number}` : null),
    metadataJson: metadata,
    orderNumber: metadata?.order_number ?? null,
    occurredAt: unixDate(charge.created) ?? base.occurredAt,
  });
}

function fromInvoice(invoice: Record<string, unknown>, base: StripePaymentDraft, eventType: string): StripePaymentDraft | null {
  const invoiceId = asString(invoice.id);
  if (!invoiceId) return null;
  const metadata = safeMetadata(asMetadata(invoice.metadata));
  const invoiceStatus = asString(invoice.status);
  const status: StripePaymentStatus =
    eventType === "invoice.payment_failed" || invoiceStatus === "uncollectible"
      ? "failed"
      : invoiceStatus === "paid" || eventType === "invoice.paid"
        ? "paid"
        : "pending";
  const transitions = asRecord(invoice.status_transitions);
  return finalizeDraft({
    ...base,
    ...modeFields(invoice),
    invoiceId,
    paymentIntentId: asId(invoice.payment_intent),
    chargeId: asId(invoice.charge),
    customerId: asId(invoice.customer),
    subscriptionId: asId(invoice.subscription),
    amountCents: asNumber(invoice.amount_paid) || asNumber(invoice.total) || asNumber(invoice.amount_due) || 0,
    currency: asString(invoice.currency) ?? "usd",
    status,
    customerName: asString(invoice.customer_name) ?? asString(metadata?.customer_name),
    customerEmail: asString(invoice.customer_email) ?? asString(metadata?.customer_email),
    description: asString(invoice.description),
    lineItemsJson: lineItemsFromInvoice(invoice),
    metadataJson: metadata,
    orderNumber: metadata?.order_number ?? null,
    hostedInvoiceUrl: asString(invoice.hosted_invoice_url),
    invoicePdfUrl: asString(invoice.invoice_pdf),
    invoiceEmailSent: eventType === "invoice.sent",
    occurredAt: unixDate(transitions?.paid_at) ?? unixDate(invoice.created) ?? base.occurredAt,
  });
}

export function statusFromCharge(charge: Record<string, unknown>, amount: number, refunded: number): StripePaymentStatus {
  if (charge.refunded === true || (amount > 0 && refunded >= amount)) return "refunded";
  if (refunded > 0) return "partially_refunded";
  const status = asString(charge.status);
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  if (charge.paid === true || status === "succeeded") return "paid";
  return "pending";
}

function lineItemsFromInvoice(invoice: Record<string, unknown>): StripePaymentLineItem[] | null {
  const lines = asRecord(invoice.lines);
  const data = lines && Array.isArray(lines.data) ? lines.data : [];
  const items: StripePaymentLineItem[] = [];
  for (const entry of data) {
    const row = asRecord(entry);
    if (!row) continue;
    items.push({
      description: asString(row.description) ?? "Item",
      quantity: asNumber(row.quantity) ?? 1,
      amountCents: asNumber(row.amount) ?? 0,
    });
  }
  return items.length > 0 ? items : null;
}

function modeFields(object: Record<string, unknown>): { livemode: boolean; stripeMode: StripeMode } {
  const livemode = object.livemode === true;
  return { livemode, stripeMode: livemode ? "live" : "test" };
}

function unixDate(value: unknown): Date | null {
  const seconds = asNumber(value);
  if (seconds == null) return null;
  return new Date(seconds * 1000);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asId(value: unknown): string | null {
  if (typeof value === "string") return asString(value);
  return asString(asRecord(value)?.id);
}

function asMetadata(value: unknown): Record<string, string> | null {
  const record = asRecord(value);
  if (!record) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const SENSITIVE = /secret|password|token|api[_-]?key|sk_live|sk_test|whsec/i;

export function safeMetadata(metadata: Record<string, string> | null): Record<string, string> | null {
  if (!metadata) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE.test(key) || SENSITIVE.test(value)) continue;
    out[key] = value.slice(0, 500);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface StripeHistoryPage {
  data: Record<string, unknown>[];
  hasMore: boolean;
}

export interface StripeHistoryReader {
  listCharges(startingAfter?: string): Promise<StripeHistoryPage>;
  listCheckoutSessions(startingAfter?: string): Promise<StripeHistoryPage>;
  listInvoices(startingAfter?: string): Promise<StripeHistoryPage>;
}

const SYNC_PAGE_LIMIT = 20;

export interface StripeSyncAccountResult {
  mode: StripeMode;
  charges: number;
  sessions: number;
  invoices: number;
  upserted: number;
  created: number;
  truncated: boolean;
}

export async function syncStripeAccount(
  reader: StripeHistoryReader,
  deps: { store: StripePaymentStore; links: PaymentLinkContext },
): Promise<Omit<StripeSyncAccountResult, "mode">> {
  const charges = await listPages((startingAfter) => reader.listCharges(startingAfter));
  const sessions = await listPages((startingAfter) => reader.listCheckoutSessions(startingAfter));
  const invoices = await listPages((startingAfter) => reader.listInvoices(startingAfter));
  let upserted = 0;
  let created = 0;
  const apply = async (draft: StripePaymentDraft | null) => {
    if (!draft || !hasStripeIdentity(draft)) return;
    const enriched = await enrichStripePaymentDraft(draft, deps.links);
    const saved = await upsertStripePayment(deps.store, enriched);
    upserted += 1;
    if (saved.created) created += 1;
  };
  for (const charge of charges.items) {
    const draft = fromCharge(charge, blankDraft({ id: "sync", type: "charge.succeeded" }), "charge.succeeded");
    await apply(draft);
  }
  for (const session of sessions.items) {
    if (asString(session.mode) === "setup") continue;
    if (asString(session.status) === "open") continue;
    const draft = fromCheckoutSession(session, blankDraft({ id: "sync", type: "checkout.session.completed" }), "checkout.session.completed");
    await apply(draft);
  }
  for (const invoice of invoices.items) {
    const status = asString(invoice.status);
    if (status !== "paid" && status !== "uncollectible") continue;
    const eventType = status === "paid" ? "invoice.paid" : "invoice.payment_failed";
    const draft = fromInvoice(invoice, blankDraft({ id: "sync", type: eventType }), eventType);
    await apply(draft);
  }
  return {
    charges: charges.items.length,
    sessions: sessions.items.length,
    invoices: invoices.items.length,
    upserted,
    created,
    truncated: charges.truncated || sessions.truncated || invoices.truncated,
  };
}

async function listPages(fetchPage: (startingAfter?: string) => Promise<StripeHistoryPage>): Promise<{ items: Record<string, unknown>[]; truncated: boolean }> {
  const items: Record<string, unknown>[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < SYNC_PAGE_LIMIT; page += 1) {
    const result = await fetchPage(startingAfter);
    items.push(...result.data);
    if (!result.hasMore || result.data.length === 0) return { items, truncated: false };
    const lastId = asString(result.data[result.data.length - 1]?.id);
    if (!lastId) return { items, truncated: true };
    startingAfter = lastId;
  }
  return { items, truncated: true };
}

type EnvironmentValues = Record<string, string | undefined>;

/** Secret keys used only for read-only history sync. Values stay on the server. */
export function stripeReadTargets(env: EnvironmentValues = process.env): Array<{ mode: StripeMode; secretKey: string }> {
  const targets: Array<{ mode: StripeMode; secretKey: string }> = [];
  const push = (value: string | undefined) => {
    const secretKey = value?.trim() ?? "";
    const mode: StripeMode | null = secretKey.startsWith("sk_live_") ? "live" : secretKey.startsWith("sk_test_") ? "test" : null;
    if (!mode) return;
    if (targets.some((target) => target.secretKey === secretKey)) return;
    targets.push({ mode, secretKey });
  };
  push(env.STRIPE_SECRET_KEY);
  push(env.CABINETDEALZ_STRIPE_LIVE_SECRET_KEY);
  push(env.STRIPE_LIVE_SECRET_KEY);
  return targets;
}

/** Webhook signing secrets for the active sandbox and any configured live endpoint. */
export function configuredWebhookSecrets(env: EnvironmentValues = process.env): string[] {
  const secrets: string[] = [];
  for (const value of [env.STRIPE_WEBHOOK_SECRET, env.CABINETDEALZ_STRIPE_LIVE_WEBHOOK_SECRET, env.STRIPE_LIVE_WEBHOOK_SECRET]) {
    const secret = value?.trim() ?? "";
    if (!secret.startsWith("whsec_") || secrets.includes(secret)) continue;
    secrets.push(secret);
  }
  return secrets;
}

export function createMemoryStripePaymentStore(): StripePaymentStore & { rows: () => StoredStripePayment[] } {
  const rows: StoredStripePayment[] = [];
  const events = new Set<string>();
  let nextId = 1;
  const matches = (row: StoredStripePayment, ids: StripeIdSet) =>
    (ids.chargeId != null && row.chargeId === ids.chargeId) ||
    (ids.paymentIntentId != null && row.paymentIntentId === ids.paymentIntentId) ||
    (ids.checkoutSessionId != null && row.checkoutSessionId === ids.checkoutSessionId) ||
    (ids.invoiceId != null && row.invoiceId === ids.invoiceId);
  return {
    rows: () => rows.map((row) => ({ ...row })),
    async findByStripeIds(ids) {
      return rows.filter((row) => matches(row, ids)).map((row) => ({ ...row }));
    },
    async insert(row) {
      const stored = { ...row, id: nextId };
      nextId += 1;
      rows.push(stored);
      return { ...stored };
    },
    async update(id, row) {
      const index = rows.findIndex((candidate) => candidate.id === id);
      if (index < 0) throw new Error("Stripe payment record not found");
      const stored = { ...row, id };
      rows[index] = stored;
      return { ...stored };
    },
    async deleteIds(ids) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (ids.includes(rows[index].id)) rows.splice(index, 1);
      }
    },
    async hasEvent(eventId) {
      return events.has(eventId);
    },
    async saveEvent(eventId) {
      events.add(eventId);
    },
  };
}

export function emptyPaymentLinkContext(overrides: Partial<PaymentLinkContext> = {}): PaymentLinkContext {
  return {
    findOrderByStripe: async () => null,
    findAffiliateInvoiceByRef: async () => null,
    findAffiliateByEmail: async () => null,
    ...overrides,
  };
}
