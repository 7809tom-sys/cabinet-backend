import { eq, sql } from "drizzle-orm";
import { orderRequests, type OrderLineItem } from "../../drizzle/schema";
import { getDb } from "../db";
import { sendEmail, type SendEmailOptions, type SendEmailResult } from "../email";
import { readOrderCostSnapshots } from "./orderCostSnapshot";
import { dollarsToCents, formatUsdFromCents, summarizeAdminOrder, type OrderMoneyInput } from "./orderMoney";
import { onOrderPaid } from "./orderSideEffects";

export const DEFAULT_ORDER_NOTIFY_EMAIL = "sales@cabinetdealz.com";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function orderNotifyEmail(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ORDER_NOTIFY_EMAIL?.trim();
  return configured || DEFAULT_ORDER_NOTIFY_EMAIL;
}

export function isUsableEmail(value: string | null | undefined): value is string {
  const email = value?.trim() ?? "";
  return email.length <= 320 && EMAIL_PATTERN.test(email);
}

export type ReceiptOrder = OrderMoneyInput & {
  originatorEmail?: string | null;
  lineItems?: OrderLineItem[] | null;
};

export type ReceiptMessage = {
  to: string;
  bcc?: string;
  subject: string;
  text: string;
  html: string;
  customerEmailed: boolean;
  salesCopied: boolean;
  customerEmailMissing: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addressBlock(order: ReceiptOrder): string[] {
  const location = [
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    [order.shippingCity, order.shippingState, order.zip].filter(Boolean).join(", "),
  ].map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return location.length > 0 ? location : ["No shipping address was stored on this order."];
}

export function composeOrderReceipt(order: ReceiptOrder, notifyEmail: string, shipping?: { carrier?: string | null; method?: string | null }): ReceiptMessage {
  const summary = summarizeAdminOrder(order, {
    carrier: shipping?.carrier,
    shippingMethod: shipping?.method,
  });
  const customerEmail = isUsableEmail(order.originatorEmail) ? order.originatorEmail.trim() : null;
  const salesEmail = notifyEmail.trim();
  const customerEmailMissing = customerEmail == null;
  const to = customerEmail ?? salesEmail;
  const bcc = customerEmail && customerEmail.toLowerCase() !== salesEmail.toLowerCase() ? salesEmail : undefined;
  const requestNumber = order.requestNumber?.trim() || `Order ${order.id}`;
  const lines = order.lineItems ?? [];
  const textLines = [
    customerEmailMissing ? "Customer email was missing or invalid. This receipt was not delivered to the customer." : "Thank you for your order.",
    "",
    `Order number: ${requestNumber}`,
    order.originatorName?.trim() ? `Customer: ${order.originatorName.trim()}` : null,
    "",
    "Ship to:",
    ...addressBlock(order),
    "",
    "Items:",
    ...(lines.length > 0 ? lines.map((line) => {
      const name = line.description?.trim() || line.masterCode || "Item";
      const code = line.distributorSku || line.masterCode || line.rawCode || "";
      const qty = line.qty ?? 1;
      const lineCents = dollarsToCents(line.linePrice);
      const total = lineCents == null ? "—" : formatUsdFromCents(lineCents);
      return `- ${name}${code ? ` (${code})` : ""} × ${qty} — ${total}`;
    }) : ["- No line items were stored."]),
    "",
    `Subtotal: ${formatUsdFromCents(summary.subtotalCents)}`,
    summary.shippingAmountCents == null ? "Shipping: not stored on this order" : `Shipping${[summary.carrier, summary.shippingMethod].filter(Boolean).join(" ") ? ` (${[summary.carrier, summary.shippingMethod].filter(Boolean).join(" / ")})` : ""}: ${formatUsdFromCents(summary.shippingAmountCents)}`,
    `Sales tax: ${formatUsdFromCents(summary.taxAmountCents)}`,
    summary.discountCents != null && summary.discountCents > 0 ? `Discounts: -${formatUsdFromCents(summary.discountCents)}` : null,
    summary.totalCents == null ? "Total: could not be confirmed because shipping was not stored" : `Total: ${formatUsdFromCents(summary.totalCents)}`,
    "",
    "Cabinet Dealz",
  ].filter((line): line is string => line != null);
  const text = textLines.join("\n");
  const itemRows = lines.map((line) => {
    const name = escapeHtml(line.description?.trim() || line.masterCode || "Item");
    const code = escapeHtml(line.distributorSku || line.masterCode || line.rawCode || "");
    const lineCents = dollarsToCents(line.linePrice);
    const total = lineCents == null ? "—" : formatUsdFromCents(lineCents);
    return `<tr><td>${name}${code ? ` (${code})` : ""}</td><td>${line.qty ?? 1}</td><td>${total}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1a2b4a">
    ${customerEmailMissing ? `<p><strong>Customer email was missing or invalid.</strong> This receipt was not delivered to the customer.</p>` : `<p>Thank you for your order.</p>`}
    <p><strong>Order number:</strong> ${escapeHtml(requestNumber)}</p>
    <p><strong>Ship to</strong><br>${addressBlock(order).map(escapeHtml).join("<br>")}</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse"><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table>
    <p>Subtotal: ${formatUsdFromCents(summary.subtotalCents)}<br>
    ${summary.shippingAmountCents == null ? "Shipping: not stored on this order" : `Shipping: ${formatUsdFromCents(summary.shippingAmountCents)}`}<br>
    Sales tax: ${formatUsdFromCents(summary.taxAmountCents)}<br>
    ${summary.totalCents == null ? "Total: could not be confirmed because shipping was not stored" : `<strong>Total: ${formatUsdFromCents(summary.totalCents)}</strong>`}</p>
    </body></html>`;
  return {
    to,
    bcc,
    subject: `Your Cabinet Dealz receipt — ${requestNumber}`,
    text,
    html,
    customerEmailed: !customerEmailMissing,
    salesCopied: true,
    customerEmailMissing,
  };
}

export type ReceiptDeliveryResult = {
  sent: boolean;
  skipped: boolean;
  customerEmailed: boolean;
  salesCopied: boolean;
  customerEmailMissing: boolean;
  error?: string;
};

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

export async function claimOrderReceipt(db: Pick<Database, "execute">, orderId: number): Promise<"claimed" | "already_sent" | "schema_missing"> {
  try {
    const result = await db.execute(sql`UPDATE order_requests SET receiptSentAt = CURRENT_TIMESTAMP WHERE id = ${orderId} AND receiptSentAt IS NULL`);
    return affectedRows(result) > 0 ? "claimed" : "already_sent";
  } catch (error) {
    const missing = error instanceof Error ? error.message : String(error);
    if (/unknown column|ER_BAD_FIELD_ERROR|doesn't exist|does not exist/i.test(missing)) return "schema_missing";
    throw error;
  }
}

export async function releaseOrderReceipt(db: Pick<Database, "execute">, orderId: number): Promise<void> {
  await db.execute(sql`UPDATE order_requests SET receiptSentAt = NULL WHERE id = ${orderId}`);
}

function rowsFromExecute(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

function receiptStamp(value: unknown): Date | string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

/** Null when the column is missing or the receipt has not been claimed. */
export async function readReceiptSentAt(db: Pick<Database, "execute">, orderIds: number[]): Promise<Map<number, Date | string | null>> {
  const map = new Map<number, Date | string | null>();
  if (orderIds.length === 0) return map;
  try {
    const result = await db.execute(sql`
      SELECT id, receiptSentAt FROM order_requests
      WHERE id IN (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const row of rowsFromExecute(result)) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      map.set(id, receiptStamp(row.receiptSentAt));
    }
  } catch (error) {
    const missing = error instanceof Error ? error.message : String(error);
    if (/unknown column|ER_BAD_FIELD_ERROR|doesn't exist|does not exist/i.test(missing)) return map;
    throw error;
  }
  return map;
}

export async function deliverOrderReceipt(input: {
  order: ReceiptOrder;
  notifyEmail: string;
  claim: () => Promise<"claimed" | "already_sent" | "schema_missing">;
  release: () => Promise<void>;
  send: (message: SendEmailOptions) => Promise<SendEmailResult>;
  shipping?: { carrier?: string | null; method?: string | null };
}): Promise<ReceiptDeliveryResult> {
  if (!isUsableEmail(input.notifyEmail)) {
    const error = "ORDER_NOTIFY_EMAIL is not a usable address, so the paid-order receipt was not sent.";
    console.error(`[Order Receipt] ${error} Order ${input.order.requestNumber ?? input.order.id}.`);
    return { sent: false, skipped: false, customerEmailed: false, salesCopied: false, customerEmailMissing: !isUsableEmail(input.order.originatorEmail), error };
  }
  const claim = await input.claim();
  if (claim === "already_sent") {
    return { sent: false, skipped: true, customerEmailed: false, salesCopied: false, customerEmailMissing: false };
  }
  if (claim === "schema_missing") {
    const error = "order_requests.receiptSentAt is missing. Run the order reconciliation SQL before paid-order receipts can be sent.";
    console.error(`[Order Receipt] ${error} Order ${input.order.requestNumber ?? input.order.id}.`);
    return { sent: false, skipped: false, customerEmailed: false, salesCopied: false, customerEmailMissing: !isUsableEmail(input.order.originatorEmail), error };
  }
  const message = composeOrderReceipt(input.order, input.notifyEmail, input.shipping);
  if (message.customerEmailMissing) {
    console.warn(`[Order Receipt] Customer email missing or invalid for order ${input.order.requestNumber ?? input.order.id}. Sending the sales copy only to ${message.to}.`);
  }
  const result = await input.send({ to: message.to, bcc: message.bcc, subject: message.subject, text: message.text, html: message.html });
  if (!result.success) {
    await input.release();
    const reason = result.notConfigured
      ? "Email is not configured. Set RESEND_API_KEY and ORDER_EMAIL_FROM."
      : (result.error ?? "Email provider rejected the receipt.");
    console.error(`[Order Receipt] Failed for order ${input.order.requestNumber ?? input.order.id}: ${reason}`);
    return { sent: false, skipped: false, customerEmailed: false, salesCopied: false, customerEmailMissing: message.customerEmailMissing, error: reason };
  }
  console.log(`[Order Receipt] Sent order ${input.order.requestNumber ?? input.order.id} to ${message.to}${message.bcc ? ` (BCC ${message.bcc})` : ""}.`);
  return {
    sent: true,
    skipped: false,
    customerEmailed: message.customerEmailed,
    salesCopied: message.salesCopied,
    customerEmailMissing: message.customerEmailMissing,
  };
}

async function sendWithConfiguredMail(_db: Database, message: SendEmailOptions): Promise<SendEmailResult> {
  return sendEmail(message);
}

export async function sendPaidOrderReceipt(orderId: number, env: NodeJS.ProcessEnv = process.env): Promise<ReceiptDeliveryResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
  if (!order) {
    console.error(`[Order Receipt] Paid order ${orderId} was not found, so no receipt was sent.`);
    return { sent: false, skipped: false, customerEmailed: false, salesCopied: false, customerEmailMissing: false, error: "Order not found" };
  }
  const snapshots = await readOrderCostSnapshots(db, [orderId]);
  const commerce = snapshots.commerce.find((row) => row.orderRequestId === orderId);
  const result = await deliverOrderReceipt({
    order: { ...order, lineItems: (order.lineItems ?? []) as OrderLineItem[] },
    notifyEmail: orderNotifyEmail(env),
    shipping: { carrier: commerce?.shippingCarrier ?? null, method: commerce?.shippingService ?? null },
    claim: () => claimOrderReceipt(db, orderId),
    release: () => releaseOrderReceipt(db, orderId),
    send: (message) => sendWithConfiguredMail(db, message),
  });
  if (result.error && !result.sent && !result.skipped) {
    throw new Error(result.error);
  }
  return result;
}

export async function markOrderPaidById(orderId: number, paymentIntentId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select({
    id: orderRequests.id,
    status: orderRequests.status,
    orderRailStatus: orderRequests.orderRailStatus,
    paidAt: orderRequests.paidAt,
  }).from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
  if (!order) return;
  await db.update(orderRequests).set({
    stripePaymentIntentId: paymentIntentId,
    paidAt: order.paidAt ?? new Date(),
    status: order.status === "draft" || order.status === "submitted" ? "confirmed" : order.status,
    orderRailStatus: order.orderRailStatus === "awaiting_payment" ? "affiliate_review" : order.orderRailStatus,
  }).where(eq(orderRequests.id, orderId));
  try {
    await onOrderPaid(orderId);
  } catch (error) {
    console.error(`[OrderCrm] Paid order ${orderId} was saved, but the CRM and distributor follow-up failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
