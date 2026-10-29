// Plans and delivers one distributor's portion of an order. The database
// wrapper records the outcome; a failure here never throws to order creation.

import { buildNetsuiteOrderCsv } from "@shared/netsuiteOrder";
import { NO_DISTRIBUTOR_SKU_MAPPED, type DistributorPoLineView } from "@shared/distributorPoLine";

export type DistributorEmailStatus = "pending" | "sent" | "failed" | "no_email";

export type DistributorEmailLine = {
  /** Distributor SKU, or the catalog code when the line did not map. */
  sku: string;
  /**
   * Kept so older callers still type-check. Distributor documents do not print
   * this field; put the supplier description on supplierDescription.
   */
  description: string;
  /** Distributor product name. The unmapped flag when mapped is false. */
  distributorItemName?: string | null;
  /** distributor_skus.supplierDescription when it adds detail beyond the name. */
  supplierDescription?: string | null;
  doorStyle: string | null;
  qty: number;
  /** Distributor cost for one unit. Null when the order did not snapshot a cost. */
  unitCost?: number | null;
  mapped?: boolean;
};

export type PoParty = {
  name: string;
  lines: string[];
};

export type PoCharge = {
  label: string;
  amount: number;
};

/** Printed when DISTRIBUTOR_PO_PAYMENT_TERMS is unset. Set that env var on Railway to change it. */
export const DEFAULT_DISTRIBUTOR_PO_PAYMENT_TERMS = "Per distributor agreement";

export const CABINET_DEALZ_PO_BRAND = {
  name: "Cabinet Dealz",
  lines: ["470 N Tamiami Trail", "Osprey, FL 34229", "(941) 899-3288", "sales@cabinetdealz.com"],
  navy: "#1a2b4a",
  gold: "#c9a227",
} as const;

export type DistributorPoDocument = {
  title: "Purchase Order";
  orderNumber: string;
  orderDate: string;
  poNumber: string | null;
  customerName: string | null;
  distributorName: string;
  vendor: PoParty;
  billTo: PoParty;
  shipTo: PoParty;
  deliveryLabel: string | null;
  lines: DistributorEmailLine[];
  charges: PoCharge[];
  subtotal: number | null;
  total: number | null;
  showPrices: boolean;
  paymentTerms: string;
  notes: string | null;
};

export function poViewToEmailLine(view: DistributorPoLineView): DistributorEmailLine {
  return {
    sku: view.sku || "—",
    description: "",
    distributorItemName: view.mapped ? view.distributorItemName : NO_DISTRIBUTOR_SKU_MAPPED,
    supplierDescription: view.mapped ? view.supplierDescription : "",
    doorStyle: view.doorStyle,
    qty: view.qty,
    unitCost: view.unitPrice != null && Number.isFinite(view.unitPrice) ? view.unitPrice : null,
    mapped: view.mapped,
  };
}

export function resolveLineDistributorId(
  line: { distributorId?: number | null; cabinetId?: number | null; styleId?: number | null },
  skuDistributor: Map<string, number>,
  fallbackDistributorId: number | null,
): number | null {
  const explicit = line.distributorId != null && line.distributorId > 0 ? line.distributorId : null;
  const skuKey = line.cabinetId && line.styleId ? `${line.cabinetId}-${line.styleId}` : null;
  const fromSku = skuKey ? skuDistributor.get(skuKey) ?? null : null;
  return explicit ?? fromSku ?? fallbackDistributorId;
}

export type DistributorPortion = {
  distributorId: number;
  distributorName: string;
  orderEmail: string | null;
  ccEmails: string[];
  lines: DistributorEmailLine[];
  /** Distributor warehouse name and address, when the row has them. */
  vendorLines?: string[];
};

export type DistributorEmailRecord = {
  distributorId: number;
  distributorName: string;
  status: DistributorEmailStatus;
  sentAt: string | null;
  sentTo: string | null;
  error: string | null;
};

export type DistributorEmailSummary = {
  distributorEmailStatus: DistributorEmailStatus;
  distributorEmailSentAt: string | null;
  distributorEmailTo: string | null;
  distributorEmailError: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function usableEmail(value: string | null | undefined): string | null {
  const email = value?.trim() ?? "";
  return email.length > 0 && email.length <= 320 && EMAIL_PATTERN.test(email) ? email : null;
}

export type AssignableLine = DistributorEmailLine & {
  distributorId?: number | null;
  cabinetId?: number | null;
  styleId?: number | null;
  masterCode?: string | null;
  rawCode?: string | null;
  catalogDescription?: string | null;
  lineDistributorSku?: string | null;
  productKind?: string | null;
  vendorProductId?: number | null;
  storedDoorStyle?: string | null;
  unitDistributorCost?: number | null;
};

export function assignLinesToDistributors(
  lines: AssignableLine[],
  skuDistributor: Map<string, number>,
  fallbackDistributorId: number | null,
): Map<number, AssignableLine[]> {
  const groups = new Map<number, AssignableLine[]>();
  const push = (distributorId: number, line: AssignableLine) => {
    const bucket = groups.get(distributorId) ?? [];
    bucket.push(line);
    groups.set(distributorId, bucket);
  };
  for (const line of lines) {
    const distributorId = resolveLineDistributorId(line, skuDistributor, fallbackDistributorId);
    if (distributorId == null) continue;
    push(distributorId, line);
  }
  return groups;
}

export function parseCcEmails(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (value ?? "").split(/[,;]+/)) {
    const email = usableEmail(part);
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function distributorPoPaymentTerms(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DISTRIBUTOR_PO_PAYMENT_TERMS?.replace(/\s+/g, " ").trim();
  if (!configured) return DEFAULT_DISTRIBUTOR_PO_PAYMENT_TERMS;
  return configured.slice(0, 500);
}

export function distributorPoAttachmentNames(orderNumber: string): { pdf: string; csv: string } {
  const safe = orderNumber.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-") || "order";
  return { pdf: `PO-${safe}.pdf`, csv: `PO-${safe}.csv` };
}

export function formatPoMoney(amount: number): string {
  const negative = amount < 0;
  const [dollars, cents] = Math.abs(amount).toFixed(2).split(".");
  return `${negative ? "-" : ""}$${dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

export function poLineAmount(qty: number, unitCost: number | null | undefined): number | null {
  if (unitCost == null || !Number.isFinite(unitCost) || !Number.isFinite(qty)) return null;
  return Math.round(unitCost * qty * 100) / 100;
}

export function orderPurchaseOrderCharges(order: {
  deliveryMethod?: "ship" | "pickup" | null;
  freightQuoteCents?: number | null;
  freightQuoteVerified?: boolean | null;
  taxAmount?: string | number | null;
}): PoCharge[] {
  const charges: PoCharge[] = [];
  if (order.deliveryMethod !== "pickup") {
    const cents = order.freightQuoteCents ?? 0;
    if (cents > 0 || order.freightQuoteVerified) charges.push({ label: "Shipping", amount: Math.round(cents) / 100 });
  }
  if (order.taxAmount != null && String(order.taxAmount).trim() !== "") {
    const tax = typeof order.taxAmount === "number" ? order.taxAmount : Number(order.taxAmount);
    if (Number.isFinite(tax) && tax !== 0) charges.push({ label: "Tax", amount: Math.round(tax * 100) / 100 });
  }
  return charges;
}

export function orderFulfillmentNotes(order: {
  deliveryLocationType?: "business" | "residential" | null;
  liftgateRequired?: boolean | null;
}): string[] {
  const notes: string[] = [];
  if (order.deliveryLocationType === "residential") notes.push("Residential delivery.");
  if (order.liftgateRequired) notes.push("Liftgate required.");
  return notes;
}

function displayOrderDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function party(name: string, lines: Array<string | null | undefined> | undefined): PoParty {
  return {
    name: name.trim() || "—",
    lines: (lines ?? []).map((line) => line?.trim() ?? "").filter(Boolean),
  };
}

function summarizeMoney(lines: DistributorEmailLine[], charges: PoCharge[]): { showPrices: boolean; subtotal: number | null; charges: PoCharge[]; total: number | null } {
  let subtotal: number | null = null;
  for (const line of lines) {
    const amount = poLineAmount(line.qty, line.unitCost);
    if (amount == null) continue;
    subtotal = Math.round(((subtotal ?? 0) + amount) * 100) / 100;
  }
  const shown = charges.filter((charge) => Number.isFinite(charge.amount));
  const total = subtotal == null && shown.length === 0
    ? null
    : Math.round(((subtotal ?? 0) + shown.reduce((sum, charge) => sum + charge.amount, 0)) * 100) / 100;
  return { showPrices: subtotal != null, subtotal, charges: shown, total };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function lineItemName(line: DistributorEmailLine): string {
  if (line.mapped === false) return NO_DISTRIBUTOR_SKU_MAPPED;
  return line.distributorItemName?.trim() || "";
}

export function lineDetail(line: DistributorEmailLine, name: string): string {
  if (line.mapped === false) return "";
  const detail = line.supplierDescription?.trim() || "";
  if (!detail || detail.toLowerCase() === name.toLowerCase()) return "";
  return detail;
}

export type DistributorOrderDocumentInput = {
  orderNumber: string;
  orderDate: string;
  customerName: string | null;
  shipTo: string[];
  distributorName: string;
  lines: DistributorEmailLine[];
  poNumber: string | null;
  notes: string | null;
  deliveryMethod?: "ship" | "pickup" | null;
  /** Warehouse / remit lines under the distributor name. */
  vendorLines?: string[];
  /** Buyer. Defaults to Cabinet Dealz when the order has no affiliate. */
  billTo?: PoParty | null;
  charges?: PoCharge[];
  paymentTerms?: string | null;
  fulfillmentNotes?: string[];
};

const EMPTY_SHIP_TO = "No ship-to address was stored on this order.";

export function buildDistributorPoDocument(input: DistributorOrderDocumentInput): DistributorPoDocument {
  const money = summarizeMoney(input.lines, input.charges ?? []);
  const shipLines = input.shipTo.map((line) => line.trim()).filter(Boolean);
  const noteParts = [input.notes?.trim(), ...(input.fulfillmentNotes ?? []).map((note) => note.trim())].filter((note): note is string => Boolean(note));
  return {
    title: "Purchase Order",
    orderNumber: input.orderNumber,
    orderDate: displayOrderDate(input.orderDate),
    poNumber: input.poNumber?.trim() || null,
    customerName: input.customerName?.trim() || null,
    distributorName: input.distributorName.trim() || "Distributor",
    vendor: party(input.distributorName, input.vendorLines),
    billTo: input.billTo?.name?.trim()
      ? party(input.billTo.name, input.billTo.lines)
      : party(CABINET_DEALZ_PO_BRAND.name, [...CABINET_DEALZ_PO_BRAND.lines]),
    shipTo: party(input.customerName?.trim() || "Recipient", shipLines.length ? shipLines : [EMPTY_SHIP_TO]),
    deliveryLabel: input.deliveryMethod === "pickup" ? "Pickup" : input.deliveryMethod === "ship" ? "Ship" : null,
    lines: input.lines,
    charges: money.charges,
    subtotal: money.subtotal,
    total: money.total,
    showPrices: money.showPrices,
    paymentTerms: input.paymentTerms?.trim() || distributorPoPaymentTerms(),
    notes: noteParts.length ? noteParts.join("\n") : null,
  };
}

function textBlock(title: string, block: PoParty): string[] {
  return [title, block.name, ...block.lines];
}

function renderPoText(document: DistributorPoDocument): string {
  const textLines = document.lines.length
    ? document.lines.map((line) => {
      const name = lineItemName(line);
      const detail = lineDetail(line, name);
      const style = line.doorStyle ? ` · ${line.doorStyle}` : "";
      const label = name ? ` — ${name}` : "";
      const extra = detail ? ` (${detail})` : "";
      const amount = poLineAmount(line.qty, line.unitCost);
      const price = amount != null && line.unitCost != null ? ` @ ${formatPoMoney(line.unitCost)} = ${formatPoMoney(amount)}` : "";
      return `- ${line.qty} x ${line.sku || "—"}${label}${extra}${style}${price}`;
    })
    : ["- No line items were assigned to this distributor."];
  const totals: Array<string | null> = [];
  if (document.subtotal != null) totals.push(`Subtotal: ${formatPoMoney(document.subtotal)}`);
  for (const charge of document.charges) totals.push(`${charge.label}: ${formatPoMoney(charge.amount)}`);
  if (document.total != null) totals.push(`Total: ${formatPoMoney(document.total)}`);
  return [
    "Purchase Order",
    CABINET_DEALZ_PO_BRAND.name,
    "",
    `Purchase order for ${document.distributorName}`,
    "",
    `Order number: ${document.orderNumber}`,
    `Date: ${document.orderDate}`,
    document.poNumber ? `PO number: ${document.poNumber}` : null,
    document.customerName ? `Customer: ${document.customerName}` : null,
    document.deliveryLabel ? `Fulfillment: ${document.deliveryLabel}` : null,
    `Payment terms: ${document.paymentTerms}`,
    "",
    ...textBlock("Vendor:", document.vendor),
    "",
    ...textBlock("Bill to:", document.billTo),
    "",
    "Ship to:",
    ...document.shipTo.lines,
    "",
    "Line items:",
    ...textLines,
    totals.length ? "" : null,
    ...totals,
    document.notes ? "" : null,
    document.notes ? `Notes: ${document.notes}` : null,
    "",
    "A purchase-order PDF and a CSV file are attached.",
    "Cabinet Dealz",
  ].filter((line): line is string => line != null).join("\n");
}

function addressCard(title: string, block: PoParty): string {
  const body = [block.name, ...block.lines].map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  return `<td valign="top" width="33%" style="padding:0 8px 0 0;">
    <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#c9a227;font-weight:700;">${escapeHtml(title)}</div>
    <div style="margin-top:6px;font-size:13px;line-height:1.45;color:#1a2b4a;">${body}</div>
  </td>`;
}

function renderPoHtml(document: DistributorPoDocument): string {
  const columns = document.showPrices
    ? ["Qty", "SKU", "Description", "Door Style", "Unit Cost", "Amount"]
    : ["Qty", "SKU", "Description", "Door Style"];
  const header = columns.map((label) => `<th align="${label === "Qty" || label === "Unit Cost" || label === "Amount" ? "right" : "left"}" style="padding:8px 10px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;">${label}</th>`).join("");
  const span = columns.length;
  const bodyRows = document.lines.length
    ? document.lines.map((line) => {
      const name = lineItemName(line);
      const detail = lineDetail(line, name);
      const amount = poLineAmount(line.qty, line.unitCost);
      const nameCell = `${escapeHtml(name)}${detail ? `<br><span style="color:#526174;font-size:12px;">${escapeHtml(detail)}</span>` : ""}`;
      const cells = [
        `<td align="right" style="padding:8px 10px;border-bottom:1px solid #e4e8ee;">${escapeHtml(String(line.qty))}</td>`,
        `<td style="padding:8px 10px;border-bottom:1px solid #e4e8ee;">${escapeHtml(line.sku || "—")}</td>`,
        `<td style="padding:8px 10px;border-bottom:1px solid #e4e8ee;">${nameCell}</td>`,
        `<td style="padding:8px 10px;border-bottom:1px solid #e4e8ee;">${escapeHtml(line.doorStyle || "")}</td>`,
      ];
      if (document.showPrices) {
        cells.push(`<td align="right" style="padding:8px 10px;border-bottom:1px solid #e4e8ee;">${line.unitCost != null && amount != null ? escapeHtml(formatPoMoney(line.unitCost)) : ""}</td>`);
        cells.push(`<td align="right" style="padding:8px 10px;border-bottom:1px solid #e4e8ee;">${amount != null ? escapeHtml(formatPoMoney(amount)) : ""}</td>`);
      }
      return `<tr>${cells.join("")}</tr>`;
    }).join("")
    : `<tr><td colspan="${span}" style="padding:8px 10px;">No line items were assigned to this distributor.</td></tr>`;
  const totalRows = [
    document.subtotal != null ? ["Subtotal", formatPoMoney(document.subtotal)] : null,
    ...document.charges.map((charge) => [charge.label, formatPoMoney(charge.amount)] as [string, string]),
    document.total != null ? ["Total", formatPoMoney(document.total)] : null,
  ].filter((row): row is [string, string] => row != null);
  const totals = totalRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        ${totalRows.map(([label, value], index) => {
          const last = index === totalRows.length - 1 && label === "Total";
          return `<tr><td align="right" style="padding:4px 10px;font-size:${last ? "15" : "13"}px;font-weight:${last ? "700" : "400"};color:#1a2b4a;">${escapeHtml(label)}</td><td align="right" width="120" style="padding:4px 10px;font-size:${last ? "15" : "13"}px;font-weight:${last ? "700" : "400"};color:#1a2b4a;">${escapeHtml(value)}</td></tr>`;
        }).join("")}
      </table>`
    : "";
  const facts = [
    ["Order number", document.orderNumber],
    ["Date", document.orderDate],
    document.poNumber ? ["PO number", document.poNumber] : null,
    document.customerName ? ["Customer", document.customerName] : null,
    document.deliveryLabel ? ["Fulfillment", document.deliveryLabel] : null,
  ].filter((fact): fact is [string, string] => fact != null);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #d5dbe3;font-family:Arial,Helvetica,sans-serif;color:#1a2b4a;">
      <tr><td style="background:#1a2b4a;padding:22px 24px;">
        <div style="font-size:20px;font-weight:700;color:#ffffff;">Cabinet Dealz</div>
        <div style="margin-top:4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c9a227;">Purchase Order</div>
      </td></tr>
      <tr><td style="padding:22px 24px 8px;">
        <p style="margin:0 0 14px;font-size:15px;">Purchase order for <strong>${escapeHtml(document.distributorName)}</strong></p>
        <p style="margin:0 0 16px;font-size:13px;line-height:1.55;">${facts.map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`).join("<br>")}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
          ${addressCard("Vendor", document.vendor)}
          ${addressCard("Bill to", document.billTo)}
          ${addressCard("Ship to", document.shipTo)}
        </tr></table>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#1a2b4a;color:#ffffff;">${header}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
        ${totals}
        <p style="margin:18px 0 0;font-size:13px;line-height:1.5;"><strong>Payment terms:</strong> ${escapeHtml(document.paymentTerms)}</p>
        ${document.notes ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.5;"><strong>Notes:</strong> ${escapeHtml(document.notes).replaceAll("\n", "<br>")}</p>` : ""}
        <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#526174;">A purchase-order PDF and a CSV file are attached.</p>
      </td></tr>
      <tr><td style="padding:14px 24px 18px;font-size:12px;color:#526174;">Cabinet Dealz · 470 N Tamiami Trail, Osprey, FL 34229 · sales@cabinetdealz.com</td></tr>
    </table>
    </td></tr></table>
    </body></html>`;
}

export function composeDistributorOrderEmail(input: DistributorOrderDocumentInput): { subject: string; text: string; html: string; document: DistributorPoDocument } {
  const document = buildDistributorPoDocument(input);
  return {
    subject: `Purchase Order ${input.orderNumber} — Cabinet Dealz`,
    text: renderPoText(document),
    html: renderPoHtml(document),
    document,
  };
}

export function buildDistributorEmailContent(input: DistributorOrderDocumentInput): { subject: string; text: string; html: string; csv: string; document: DistributorPoDocument } {
  const message = composeDistributorOrderEmail(input);
  const csv = buildNetsuiteOrderCsv({
    orderNumber: input.orderNumber,
    customerName: input.customerName,
    deliveryMethod: input.deliveryMethod,
    orderDate: input.orderDate,
  }, input.lines.map((line) => ({
    poSku: line.sku,
    distributorItemName: line.mapped === false ? NO_DISTRIBUTOR_SKU_MAPPED : (line.distributorItemName ?? ""),
    description: line.mapped === false ? "" : (line.supplierDescription ?? ""),
    doorStyle: line.doorStyle,
    qty: line.qty,
    unitPrice: line.unitCost ?? null,
  })));
  return { ...message, csv };
}

export function summarizeDistributorEmails(records: DistributorEmailRecord[]): DistributorEmailSummary {
  if (records.length === 0) {
    return {
      distributorEmailStatus: "pending",
      distributorEmailSentAt: null,
      distributorEmailTo: null,
      distributorEmailError: null,
    };
  }
  const sent = records.filter((row) => row.status === "sent");
  const failed = records.filter((row) => row.status === "failed");
  const missing = records.filter((row) => row.status === "no_email");
  const status: DistributorEmailStatus = failed.length
    ? "failed"
    : sent.length
      ? "sent"
      : missing.length
        ? "no_email"
        : "pending";
  const sentAt = sent.map((row) => row.sentAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const sentTo = records.map((row) => row.sentTo).filter((value): value is string => Boolean(value)).join(", ") || null;
  const error = [
    ...failed.map((row) => `${row.distributorName}: ${row.error || "Email failed"}`),
    ...missing.map((row) => `${row.distributorName}: no order email set`),
  ].join("; ") || null;
  return {
    distributorEmailStatus: status,
    distributorEmailSentAt: status === "sent" ? sentAt : null,
    distributorEmailTo: sentTo,
    distributorEmailError: status === "sent" && !failed.length && !missing.length ? null : error,
  };
}

export async function deliverDistributorEmails(input: {
  portions: DistributorPortion[];
  prior: DistributorEmailRecord[];
  force: boolean;
  now?: Date;
  send: (portion: DistributorPortion) => Promise<{ ok: boolean; error?: string }>;
}): Promise<DistributorEmailRecord[]> {
  const priorById = new Map(input.prior.map((row) => [row.distributorId, row]));
  const now = (input.now ?? new Date()).toISOString();
  const results: DistributorEmailRecord[] = [];
  for (const portion of input.portions) {
    const previous = priorById.get(portion.distributorId);
    if (previous?.status === "sent" && !input.force) {
      results.push(previous);
      continue;
    }
    const email = usableEmail(portion.orderEmail);
    if (!email) {
      results.push({
        distributorId: portion.distributorId,
        distributorName: portion.distributorName,
        status: "no_email",
        sentAt: null,
        sentTo: null,
        error: "No order email set",
      });
      continue;
    }
    try {
      const sent = await input.send({ ...portion, orderEmail: email });
      const cc = portion.ccEmails.filter((value) => value.toLowerCase() !== email.toLowerCase());
      if (!sent.ok) {
        results.push({
          distributorId: portion.distributorId,
          distributorName: portion.distributorName,
          status: "failed",
          sentAt: null,
          sentTo: [email, ...cc].join(", "),
          error: sent.error || "Email failed",
        });
        continue;
      }
      results.push({
        distributorId: portion.distributorId,
        distributorName: portion.distributorName,
        status: "sent",
        sentAt: now,
        sentTo: [email, ...cc].join(", "),
        error: null,
      });
    } catch (error) {
      results.push({
        distributorId: portion.distributorId,
        distributorName: portion.distributorName,
        status: "failed",
        sentAt: null,
        sentTo: email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
