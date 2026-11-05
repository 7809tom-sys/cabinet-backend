// ─── Customer "order verified" email ─────────────────────────────────────────
// When an order is marked verified the customer is told we have the order and
// it is being processed. Delivery uses the same sender resolution as every
// other customer message: an enabled affiliate mailbox carries it, otherwise
// the shared platform sender does with the store as reply-to.
//
// Exactly-once: order_requests.orderVerifiedEmailSentAt is claimed with a
// conditional UPDATE before the send, so a second click on Order verified
// cannot email the customer twice. A failed send releases the claim so a later
// click can retry once. Nothing here may block or roll back the verification.

import { eq, sql } from "drizzle-orm";
import { affiliates, crmActivities, crmDeals, orderRequests } from "../../drizzle/schema";
import { getDb } from "../db";
import type { SendEmailResult } from "../email";
import { deliverCrmMessage, loadCrmOutboundPlan } from "./crmOutboundMail";
import { ensureAffiliatePipelineDeal } from "./crmPipelineAttach";
import { insertCrmEmailLog } from "./crmCustomerMail";
import { isMissingSchemaError, schemaErrorMessage } from "./orderSchemaGuard";

const LOG = "[Order Verified Email]";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Store name shown when the order did not come through an affiliate storefront. */
export const HOUSE_CUSTOMER_BRAND = "CabinetDealz";

export type VerifiedEmailOrder = {
  id: number;
  requestNumber?: string | null;
  originatorName?: string | null;
  originatorEmail?: string | null;
  affiliateId?: number | null;
};

export type OrderVerifiedEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type VerifiedEmailSkipReason = "already_sent" | "no_customer_email" | "schema_missing";

export type OrderVerifiedEmailResult = {
  sent: boolean;
  skipped: boolean;
  skipReason?: VerifiedEmailSkipReason;
  to?: string;
  error?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function customerEmailOf(order: Pick<VerifiedEmailOrder, "originatorEmail">): string | null {
  const email = order.originatorEmail?.trim() ?? "";
  return email.length <= 320 && EMAIL_PATTERN.test(email) ? email : null;
}

/** "CD-520" from requestNumber; falls back to the row id for older orders. */
export function verifiedOrderNumber(order: Pick<VerifiedEmailOrder, "id" | "requestNumber">): string {
  const stored = order.requestNumber?.trim();
  return stored ? stored.replace(/^#+/, "") : String(order.id);
}

/** The affiliate's store name for its own order; the house brand otherwise. */
export function verifiedEmailBrand(storeName: string | null | undefined): string {
  return storeName?.trim() || HOUSE_CUSTOMER_BRAND;
}

/**
 * The approved copy:
 *
 *   Subject: Your order #{orderNumber} has been verified
 *
 *   Hi {customerName},
 *
 *   Your order #{orderNumber} has been verified by {affiliateName}. Look for
 *   further information soon with your shipping details.
 *
 *   Any questions, feel free to contact {affiliateName} at {affiliatePhone}.
 *
 *   Thank you for your order.
 *   {affiliateName}
 *
 * A missing name becomes "Hi,". A missing phone drops " at {affiliatePhone}"
 * rather than inventing one.
 */
export function composeOrderVerifiedEmail(input: {
  order: VerifiedEmailOrder;
  storeName?: string | null;
  storePhone?: string | null;
}): OrderVerifiedEmailMessage | null {
  const to = customerEmailOf(input.order);
  if (!to) return null;
  const brand = verifiedEmailBrand(input.storeName);
  const orderNumber = verifiedOrderNumber(input.order);
  const customerName = input.order.originatorName?.trim() ?? "";
  const phone = input.storePhone?.trim() ?? "";
  const greeting = customerName ? `Hi ${customerName},` : "Hi,";
  const verifiedLine = `Your order #${orderNumber} has been verified by ${brand}. Look for further information soon with your shipping details.`;
  const contactLine = phone
    ? `Any questions, feel free to contact ${brand} at ${phone}.`
    : `Any questions, feel free to contact ${brand}.`;
  const text = [
    greeting,
    verifiedLine,
    contactLine,
    `Thank you for your order.\n${brand}`,
  ].join("\n\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1a2b4a">
    <p>${escapeHtml(greeting)}</p>
    <p>Your order <strong>#${escapeHtml(orderNumber)}</strong> has been verified by ${escapeHtml(brand)}. Look for further information soon with your shipping details.</p>
    <p>${escapeHtml(contactLine)}</p>
    <p>Thank you for your order.<br>${escapeHtml(brand)}</p>
    </body></html>`;
  return {
    to,
    subject: `Your order #${orderNumber} has been verified`,
    text,
    html,
  };
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function affectedRows(result: unknown): number {
  const candidates = Array.isArray(result) ? [result, result[0]] : [result];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && "affectedRows" in candidate) {
      const count = Number((candidate as { affectedRows: number }).affectedRows);
      if (Number.isFinite(count)) return count;
    }
  }
  return 0;
}

/**
 * Marks the order as emailed, but only when nothing has claimed it yet. The
 * marker is written before the send so two clicks in quick succession cannot
 * both pass this check.
 */
export async function claimOrderVerifiedEmail(
  db: Pick<Database, "execute">,
  orderId: number,
): Promise<"claimed" | "already_sent" | "schema_missing"> {
  try {
    const result = await db.execute(sql`
      UPDATE order_requests SET orderVerifiedEmailSentAt = CURRENT_TIMESTAMP
      WHERE id = ${orderId} AND orderVerifiedEmailSentAt IS NULL
    `);
    return affectedRows(result) > 0 ? "claimed" : "already_sent";
  } catch (error) {
    if (isMissingSchemaError(error)) return "schema_missing";
    throw error;
  }
}

/** Frees a claim after a failed send so a later click can retry once. */
export async function releaseOrderVerifiedEmail(db: Pick<Database, "execute">, orderId: number): Promise<void> {
  await db.execute(sql`UPDATE order_requests SET orderVerifiedEmailSentAt = NULL WHERE id = ${orderId}`);
}

/**
 * Claim, compose, send, and report. Never throws for a delivery problem: the
 * caller logs the result and the order stays verified.
 */
export async function deliverOrderVerifiedEmail(input: {
  order: VerifiedEmailOrder;
  storeName?: string | null;
  storePhone?: string | null;
  claim: () => Promise<"claimed" | "already_sent" | "schema_missing">;
  release: () => Promise<void>;
  send: (message: OrderVerifiedEmailMessage) => Promise<SendEmailResult>;
}): Promise<OrderVerifiedEmailResult> {
  const orderNumber = verifiedOrderNumber(input.order);
  const message = composeOrderVerifiedEmail(input);
  if (!message) {
    // Nothing to send and nothing will change later, so mark it done. A later
    // click must not re-run the whole lookup for the same missing address.
    console.warn(`${LOG} Order ${orderNumber} has no usable customer email, so no verified email was sent.`);
    try {
      await input.claim();
    } catch (error) {
      console.warn(`${LOG} Could not mark order ${orderNumber} as handled: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { sent: false, skipped: true, skipReason: "no_customer_email" };
  }
  const claim = await input.claim();
  if (claim === "already_sent") return { sent: false, skipped: true, skipReason: "already_sent" };
  if (claim === "schema_missing") {
    const error = "order_requests.orderVerifiedEmailSentAt is missing. Run the order verified email SQL before verified orders can email the customer.";
    console.error(`${LOG} ${error} Order ${orderNumber}.`);
    return { sent: false, skipped: true, skipReason: "schema_missing", error };
  }
  let result: SendEmailResult;
  try {
    result = await input.send(message);
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!result.success) {
    const reason = result.notConfigured
      ? "Email is not configured. Set RESEND_API_KEY and ORDER_EMAIL_FROM, or save a store mailbox."
      : (result.error ?? "The email provider rejected the message.");
    console.error(`${LOG} Failed for order ${orderNumber}: ${reason}`);
    try {
      await input.release();
    } catch (error) {
      console.error(`${LOG} Could not clear the marker for order ${orderNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { sent: false, skipped: false, error: reason, to: message.to };
  }
  console.log(`${LOG} Order ${orderNumber} verified email sent to ${message.to}.`);
  return { sent: true, skipped: false, to: message.to };
}

async function loadStoreContact(
  db: Database,
  affiliateId: number | null | undefined,
): Promise<{ storeName: string | null; storePhone: string | null }> {
  if (affiliateId == null) return { storeName: null, storePhone: null };
  const [store] = await db.select({
    storeName: affiliates.storeName,
    publicPhone: affiliates.publicPhone,
    phone: affiliates.phone,
  }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  return {
    storeName: store?.storeName ?? null,
    // The storefront's public contact number wins; the affiliate's own record
    // phone covers a store that never saved a public one. A blank pair drops
    // the phone from the copy rather than inventing a number.
    storePhone: store?.publicPhone?.trim() || store?.phone?.trim() || null,
  };
}

/**
 * Best-effort CRM record of the send. A logging problem must never turn a
 * delivered message into a "failed" result, which would release the marker and
 * mail the customer twice.
 */
async function recordVerifiedEmailInCrm(
  db: Database,
  order: typeof orderRequests.$inferSelect,
  message: OrderVerifiedEmailMessage,
  from: string,
): Promise<void> {
  try {
    const deal = await ensureAffiliatePipelineDeal(db, {
      affiliateId: order.affiliateId,
      ownerUserId: order.userId,
      title: `Order ${order.requestNumber}`,
      contactName: order.originatorName,
      contactEmail: message.to,
      source: "order_request",
      orderRequestId: order.id,
      match: "order",
    });
    await insertCrmEmailLog(db, {
      dealId: deal.id,
      toEmail: message.to,
      fromEmail: from,
      subject: message.subject,
      body: message.text,
      sentByName: "Order verified",
    });
    await db.insert(crmActivities).values({
      dealId: deal.id,
      kind: "email",
      body: `Order verified email sent to ${message.to}.`,
    });
    await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
  } catch (error) {
    console.warn(`${LOG} Email for order ${order.requestNumber} was sent, but the CRM record failed: ${schemaErrorMessage(error)}`);
  }
}

/**
 * Customer mail keeps the affiliate's own mailbox when one is saved and
 * enabled, exactly like the paid-order receipt. The fallback is the shared
 * platform sender with the store as reply-to.
 */
async function sendThroughStoreMailbox(
  db: Database,
  order: typeof orderRequests.$inferSelect,
  message: OrderVerifiedEmailMessage,
): Promise<SendEmailResult> {
  const resolution = await loadCrmOutboundPlan(db, order.affiliateId);
  let sent: { from: string; transport: "resend" | "smtp" | "affiliate_smtp" };
  try {
    sent = await deliverCrmMessage(resolution, {
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      affiliateId: order.affiliateId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { success: false, notConfigured: reason === "not_configured", error: reason };
  }
  await recordVerifiedEmailInCrm(db, order, message, sent.from);
  return { success: true, transport: sent.transport, from: sent.from };
}

/**
 * Sends the verified email for one order at most once. Returns a result; a
 * failure is the caller's to log, never a reason to undo the verification.
 */
export async function sendOrderVerifiedCustomerEmail(orderId: number): Promise<OrderVerifiedEmailResult> {
  const db = await getDb();
  if (!db) {
    console.error(`${LOG} Database not available, so no verified email was sent for order ${orderId}.`);
    return { sent: false, skipped: true, error: "Database not available" };
  }
  const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
  if (!order) {
    console.error(`${LOG} Order ${orderId} was not found, so no verified email was sent.`);
    return { sent: false, skipped: true, error: "Order not found" };
  }
  const { storeName, storePhone } = await loadStoreContact(db, order.affiliateId);
  return deliverOrderVerifiedEmail({
    order,
    storeName,
    storePhone,
    claim: () => claimOrderVerifiedEmail(db, orderId),
    release: () => releaseOrderVerifiedEmail(db, orderId),
    send: (message) => sendThroughStoreMailbox(db, order, message),
  });
}
