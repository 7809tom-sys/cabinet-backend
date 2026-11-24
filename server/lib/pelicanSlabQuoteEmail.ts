/**
 * Automatic Florida slab quote email to the supplier's slab sales contact.
 *
 * When a customer submits an order request that ships to a Florida address
 * and contains supplier quartz slab lines (productKind "surface" in the
 * "Quartz Slabs (Countertops)" lane), the backend emails the supplier's slab
 * quote contact the customer's details plus the slab quote: items, slab
 * count, the Florida per-slab delivery line, totals, reference number and
 * date. The owner gets a copy through the existing OWNER_EMAIL alert.
 *
 * - The per-slab amount is the shared FLORIDA_COUNTERTOP_CENTS_PER_SLAB
 *   constant in shared/shippingRules.ts (the same $50/slab Florida rule the
 *   cart and checkout already charge). Change it there.
 * - The recipient is the PELICAN_QUOTE_EMAIL env var (comma-separated list
 *   allowed). No address is hardcoded. Unset means no supplier email is sent.
 * - Sending is fire-and-forget: a mail failure is logged and never breaks the
 *   order request.
 * - This email goes to the supplier, so it names the supplier. Nothing here
 *   is shown to the customer.
 */

import { sendEmail, type SendEmailOptions, type SendEmailResult } from "../email";
import { notifyOwner, type NotificationPayload } from "../_core/notification";
import {
  FLORIDA_COUNTERTOP_CENTS_PER_SLAB,
  countertopSlabCount,
  isFloridaDelivery,
  shippingCategoryForItem,
} from "../../shared/shippingRules";

const LOG = "[PelicanSlabQuote]";

export const PELICAN_QUOTE_EMAIL_ENV = "PELICAN_QUOTE_EMAIL" as const;

/** Cabinet Dealz contact block printed in the email (same as the PO letterhead). */
export const SLAB_QUOTE_CONTACT_LINES = [
  "Cabinet Dealz",
  "470 N Tamiami Trail, Osprey, FL 34229",
  "(941) 899-3288",
  "sales@cabinetdealz.com",
] as const;

export type SlabQuoteLineInput = {
  masterCode?: string | null;
  rawCode?: string | null;
  description?: string | null;
  qty: number;
  unitPrice?: number | null;
  linePrice?: number | null;
  productKind?: string | null;
  category?: string | null;
  pelicanProductId?: number | null;
};

export type PelicanSlabQuoteRequest = {
  orderRequestId: number;
  requestNumber: string;
  submittedAt?: Date;
  deliveryMethod: "ship" | "pickup";
  deliveryLocationType?: "business" | "residential" | null;
  liftgateRequired?: boolean | null;
  customer: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  address: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };
  notes?: string | null;
  lines: readonly SlabQuoteLineInput[];
};

export type SlabQuoteLine = {
  sku: string;
  description: string;
  qty: number;
  unitCents: number | null;
  lineCents: number | null;
};

export type PelicanSlabQuote = {
  lines: SlabQuoteLine[];
  slabCount: number;
  perSlabCents: number;
  deliveryCents: number;
  /** Sum of priced slab lines. null when any slab line has no price. */
  slabSubtotalCents: number | null;
  /** Slabs + Florida delivery. null when the subtotal is not fully priced. */
  totalCents: number | null;
};

/** Supplier quartz slab line: a supplier surface line in the countertop lane. */
export function isPelicanSlabLine(line: SlabQuoteLineInput): boolean {
  if (line.productKind !== "surface") return false;
  return shippingCategoryForItem({
    productKind: line.productKind,
    category: line.category ?? null,
    name: line.description ?? null,
    qty: line.qty,
  }) === "countertops";
}

export function pelicanQuoteRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[PELICAN_QUOTE_EMAIL_ENV] ?? "";
  return raw
    .split(/[,;]+/)
    .map((value) => value.trim())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function toCents(dollars: number | null | undefined): number | null {
  if (dollars == null || !Number.isFinite(Number(dollars))) return null;
  return Math.round(Number(dollars) * 100);
}

/**
 * The Florida slab quote for one request, or null when it does not apply:
 * pickup orders, non-Florida destinations, and requests with no slab lines.
 */
export function buildPelicanSlabQuote(request: PelicanSlabQuoteRequest): PelicanSlabQuote | null {
  if (request.deliveryMethod !== "ship") return null;
  if (!isFloridaDelivery({ state: request.address.state, zip: request.address.zip })) return null;
  const slabLines = request.lines.filter(isPelicanSlabLine);
  if (slabLines.length === 0) return null;

  const lines: SlabQuoteLine[] = slabLines.map((line) => {
    const qty = countertopSlabCount({ qty: line.qty });
    const unitCents = toCents(line.unitPrice);
    const lineCents = toCents(line.linePrice) ?? (unitCents != null ? unitCents * qty : null);
    return {
      sku: (line.masterCode || line.rawCode || "").trim() || "(no SKU)",
      description: (line.description ?? "").trim() || "Quartz slab",
      qty,
      unitCents,
      lineCents,
    };
  });
  const slabCount = lines.reduce((sum, line) => sum + line.qty, 0);
  if (slabCount <= 0) return null;
  const perSlabCents = FLORIDA_COUNTERTOP_CENTS_PER_SLAB;
  const deliveryCents = slabCount * perSlabCents;
  const allPriced = lines.every((line) => line.lineCents != null);
  const slabSubtotalCents = allPriced ? lines.reduce((sum, line) => sum + (line.lineCents ?? 0), 0) : null;
  return {
    lines,
    slabCount,
    perSlabCents,
    deliveryCents,
    slabSubtotalCents,
    totalCents: slabSubtotalCents == null ? null : slabSubtotalCents + deliveryCents,
  };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatQuoteDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function orNotProvided(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text || "(not provided)";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildPelicanSlabQuoteEmail(
  request: PelicanSlabQuoteRequest,
  quote: PelicanSlabQuote,
  now: Date = new Date(),
): { subject: string; text: string; html: string } {
  const date = formatQuoteDate(request.submittedAt ?? now);
  const slabWord = quote.slabCount === 1 ? "slab" : "slabs";
  const state = (request.address.state ?? "").trim().toUpperCase() || "FL";
  const cityLine = [
    (request.address.city ?? "").trim(),
    [state, (request.address.zip ?? "").trim()].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const addressLines = [request.address.line1, request.address.line2, cityLine]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  const deliveryLocation = request.deliveryLocationType === "residential" ? "Residential" : "Business";

  const itemLines = quote.lines.map((line, index) => {
    const each = line.unitCents != null ? `${formatUsd(line.unitCents)} each` : "price pending";
    const lineTotal = line.lineCents != null ? formatUsd(line.lineCents) : "price pending";
    return `${index + 1}. ${line.qty} × ${line.description} (SKU ${line.sku}) — ${each} — ${lineTotal}`;
  });

  const subject = `Florida Pelican slab quote request ${request.requestNumber} — ${quote.slabCount} ${slabWord}`;
  const lines: string[] = [
    "Hello,",
    "",
    "Cabinet Dealz received a new Pelican quartz slab quote request for delivery in Florida. The customer's details and the slab quote are below. Please reply with availability, lead time and your delivery date for this reference.",
    "",
    `Reference: ${request.requestNumber}`,
    `Date: ${date}`,
    `Order request ID: ${request.orderRequestId}`,
    "",
    "CUSTOMER",
    `Name: ${orNotProvided(request.customer.name)}`,
    `Email: ${orNotProvided(request.customer.email)}`,
    `Phone: ${orNotProvided(request.customer.phone)}`,
    "Job / ship-to address:",
    ...(addressLines.length > 0 ? addressLines.map((part) => `  ${part}`) : ["  (not provided)"]),
    `Location: Florida (${state})`,
    `Delivery location: ${deliveryLocation}`,
    `Liftgate requested: ${request.liftgateRequired ? "Yes" : "No"}`,
    "",
    "PELICAN SLABS",
    ...itemLines,
    `Slab count: ${quote.slabCount}`,
    "",
    "QUOTE",
    `Slab subtotal: ${quote.slabSubtotalCents != null ? formatUsd(quote.slabSubtotalCents) : "price pending on one or more slabs"}`,
    `Florida slab delivery: ${quote.slabCount} ${slabWord} × ${formatUsd(quote.perSlabCents)} = ${formatUsd(quote.deliveryCents)}`,
    `Slab total (slabs + Florida delivery): ${quote.totalCents != null ? formatUsd(quote.totalCents) : "pending — see slab subtotal"}`,
    "Slab prices are the prices quoted to the customer on cabinetdealz.com. Sales tax is not included.",
    "",
    "CUSTOMER NOTES",
    (request.notes ?? "").trim() || "(none)",
    "",
    "NEXT STEPS",
    `1. Confirm the slabs above are available and reply with your lead time and delivery date for ${request.requestNumber}.`,
    "2. Tell us right away if any slab, size or color has changed.",
    "3. Please include the reference number in every reply.",
    "",
    "CONTACT",
    ...SLAB_QUOTE_CONTACT_LINES,
  ];
  const text = lines.join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a2b4a;white-space:pre-wrap">${escapeHtml(text)}</div>`;
  return { subject, text, html };
}

export type PelicanSlabQuoteDeps = {
  send: (opts: SendEmailOptions) => Promise<SendEmailResult>;
  notify: (payload: NotificationPayload) => Promise<boolean>;
  env: NodeJS.ProcessEnv;
  now: () => Date;
};

const defaultDeps: PelicanSlabQuoteDeps = {
  send: sendEmail,
  notify: notifyOwner,
  env: process.env,
  now: () => new Date(),
};

export type PelicanSlabQuoteResult =
  | { status: "skipped"; reason: "not_applicable" }
  | { status: "not_configured"; slabCount: number }
  | { status: "sent" | "failed"; slabCount: number; ownerCopied: boolean; error?: string };

/**
 * Sends the supplier email (and the owner copy) when the request qualifies.
 * Never throws: every failure is logged and reported in the result.
 */
export async function sendPelicanSlabQuoteEmails(
  request: PelicanSlabQuoteRequest,
  deps: Partial<PelicanSlabQuoteDeps> = {},
): Promise<PelicanSlabQuoteResult> {
  const { send, notify, env, now } = { ...defaultDeps, ...deps };
  let quote: PelicanSlabQuote | null;
  try {
    quote = buildPelicanSlabQuote(request);
  } catch (error) {
    console.error(`${LOG} Could not build the slab quote for ${request.requestNumber}: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "skipped", reason: "not_applicable" };
  }
  if (!quote) return { status: "skipped", reason: "not_applicable" };

  const recipients = pelicanQuoteRecipients(env);
  if (recipients.length === 0) {
    console.warn(`${LOG} ${request.requestNumber} has ${quote.slabCount} Florida slab(s), but ${PELICAN_QUOTE_EMAIL_ENV} is not set, so no supplier quote email was sent.`);
    return { status: "not_configured", slabCount: quote.slabCount };
  }

  const email = buildPelicanSlabQuoteEmail(request, quote, now());
  let sent = false;
  let error: string | undefined;
  try {
    const result = await send({ to: recipients.join(", "), subject: email.subject, text: email.text, html: email.html });
    sent = result.success;
    if (!sent) error = result.error ?? "unknown error";
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  if (sent) {
    console.log(`${LOG} Sent the Florida slab quote for ${request.requestNumber} (${quote.slabCount} slab(s)) to the supplier contact.`);
  } else {
    console.error(`${LOG} Supplier quote email for ${request.requestNumber} failed: ${error}`);
  }

  let ownerCopied = false;
  try {
    ownerCopied = await notify({
      title: sent
        ? `Florida slab quote ${request.requestNumber} sent to Pelican`
        : `Florida slab quote ${request.requestNumber} NOT sent to Pelican`,
      content: [
        sent
          ? `Copy of the automatic slab quote email sent to ${recipients.join(", ")}.`
          : `The automatic slab quote email to ${recipients.join(", ")} failed (${error}). Send it by hand.`,
        "",
        `Subject: ${email.subject}`,
        "",
        email.text,
      ].join("\n"),
    });
  } catch (caught) {
    console.warn(`${LOG} Owner copy for ${request.requestNumber} failed: ${caught instanceof Error ? caught.message : String(caught)}`);
  }

  return sent
    ? { status: "sent", slabCount: quote.slabCount, ownerCopied }
    : { status: "failed", slabCount: quote.slabCount, ownerCopied, error };
}

/** Fire-and-forget wrapper for request handlers. Never throws, never blocks. */
export function queuePelicanSlabQuoteEmails(request: PelicanSlabQuoteRequest): void {
  void sendPelicanSlabQuoteEmails(request).catch((error) => {
    console.error(`${LOG} Unexpected error for ${request.requestNumber}: ${error instanceof Error ? error.message : String(error)}`);
  });
}
