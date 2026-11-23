import {
  AWAITING_MANUAL_SHIPPING_QUOTE_STATUS,
  AWAITING_SHIPPING_ESTIMATE_STATUS,
  canCaptureShippingPayment,
  type ShippingQuoteStatus,
} from "../../shared/shippingRules";

export { canCaptureShippingPayment };

export type ShippingQuotePath = "fixed" | "estimate" | "manual";

export function resolveShippingQuoteStatus(input: {
  path?: ShippingQuotePath | null;
  hasPendingEstimate: boolean;
  manualQuoteRequested?: boolean;
}): ShippingQuoteStatus {
  if (input.path === "manual" || input.manualQuoteRequested) {
    return AWAITING_MANUAL_SHIPPING_QUOTE_STATUS;
  }
  if (input.path === "estimate" || input.hasPendingEstimate) {
    return AWAITING_SHIPPING_ESTIMATE_STATUS;
  }
  if (input.path === "fixed" || !input.hasPendingEstimate) return "quoted";
  return "none";
}

export function buildShippingPathOwnerEmail(input: {
  path: "estimate" | "manual";
  originatorName?: string | null;
  originatorEmail: string;
  originatorPhone?: string | null;
  deliveryAddress: { line1: string; line2?: string | null; city: string; state: string; zip: string };
  requestNumber?: string | null;
  orderRequestId?: number | null;
  pendingCategories: string[];
  knownShippingCents: number;
  pendingLabels: string[];
  lineSummary: string;
  notes?: string | null;
}): { title: string; content: string } {
  const manual = input.path === "manual";
  const title = manual ? "Manual shipping quote requested" : "Shipping estimate requested";
  const address = [
    input.deliveryAddress.line1,
    input.deliveryAddress.line2,
    `${input.deliveryAddress.city}, ${input.deliveryAddress.state} ${input.deliveryAddress.zip}`,
  ].filter((part) => part && String(part).trim()).join("\n");
  const lines = [
    manual
      ? "A customer sent the whole invoice for a manual shipping quote. Do not capture payment until the quote is returned."
      : "A customer requested a shipping estimate. They can still place or save the order with shipping shown as pending.",
    "",
    `Customer: ${input.originatorName?.trim() || "(not provided)"}`,
    `Email: ${input.originatorEmail}`,
    `Phone: ${input.originatorPhone?.trim() || "(not provided)"}`,
    `Delivery address:\n${address}`,
    input.requestNumber ? `Order: ${input.requestNumber}` : "Order: not saved yet",
    input.orderRequestId ? `Order ID: ${input.orderRequestId}` : null,
    `Known shipping: $${(input.knownShippingCents / 100).toFixed(2)}`,
    input.pendingLabels.length > 0 ? `Pending: ${input.pendingLabels.join("; ")}` : "Pending: none",
    input.pendingCategories.length > 0 ? `Pending categories: ${input.pendingCategories.join(", ")}` : null,
    "",
    "Items:",
    input.lineSummary.trim() || "(none)",
    input.notes?.trim() ? `\nNotes:\n${input.notes.trim()}` : null,
  ].filter((line) => line != null);
  return { title, content: lines.join("\n") };
}
