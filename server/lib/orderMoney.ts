/**
 * Admin order money. Amounts are integer cents so a cabinet, a shipping line,
 * and sales tax add to the same number Stripe charged.
 *
 * Customer total = merchandise subtotal + stored shipping + sales tax
 *                  − order-level discounts.
 * A promotion already reflected in the customer unit price is listed, and it
 * is not subtracted a second time. The Stripe fee is not part of this total.
 */

export const CURRENT_COST_LABEL = "current cost, not snapshotted";

export type CostSource = "snapshot" | "current" | "unavailable";

export type OrderMoneyLine = {
  masterCode?: string | null;
  rawCode?: string | null;
  description?: string | null;
  qty?: number | null;
  unitPrice?: number | string | null;
  linePrice?: number | string | null;
  originalUnitPrice?: number | string | null;
  promoName?: string | null;
  distributorSku?: string | null;
  unitDistributorCost?: number | string | null;
  hardwareUnitCostCents?: number | null;
  cabinetId?: number | null;
  styleId?: number | null;
  distributorId?: number | null;
  productKind?: string | null;
  vendorProductId?: number | null;
  pelicanProductId?: number | null;
};

export type OrderMoneyInput = {
  id: number;
  requestNumber?: string | null;
  originatorName?: string | null;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  zip?: string | null;
  deliveryMethod?: string | null;
  freightQuoteCents?: number | null;
  freightQuoteVerified?: boolean | null;
  taxAmount?: string | number | null;
  totalAmount?: string | number | null;
  lineItems?: OrderMoneyLine[] | null;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
};

export type ShippingLocation = {
  street: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type OrderDiscount = {
  lineIndex: number | null;
  name: string | null;
  amountCents: number;
  /** True when the customer unit price is already the discounted price. */
  includedInSubtotal: boolean;
};

export type ShippingLine = {
  kind: "shipping";
  name: "Shipping";
  qty: 1;
  amountCents: number | null;
  carrier: string | null;
  method: string | null;
  stored: boolean;
};

export type AdminOrderListMoney = {
  customerName: string | null;
  shippingLocation: ShippingLocation;
  subtotalCents: number;
  shippingLine: ShippingLine;
  shippingAmountCents: number | null;
  carrier: string | null;
  shippingMethod: string | null;
  taxAmountCents: number;
  discounts: OrderDiscount[];
  /** Order-level discounts subtracted from the invoice. Line promos are excluded. */
  discountCents: number;
  /**
   * Full invoice total: subtotal + shipping + tax − order-level discounts.
   * Null when shipping was never stored, so the cabinet subtotal is not
   * presented as the amount the customer was charged.
   */
  totalCents: number | null;
  stripeAmountChargedCents: number | null;
  reconciled: boolean;
  differenceCents: number | null;
};

export type AdminOrderProductLine = {
  kind: "product";
  lineIndex: number;
  sku: string | null;
  code: string | null;
  name: string;
  qty: number;
  unitCustomerPriceCents: number | null;
  lineTotalCents: number | null;
  unitDistributorCostCents: number | null;
  lineDistributorCostCents: number | null;
  costSource: CostSource;
  costLabel: string | null;
  grossMarginCents: number | null;
};

export type StripeAmountSource = "stored_charge" | "stripe_payment_intent" | "unavailable";

export type AdminOrderDetail = AdminOrderListMoney & {
  orderId: number;
  requestNumber: string | null;
  currency: "usd";
  lines: AdminOrderProductLine[];
  grossMarginCents: number | null;
  grossMarginComplete: boolean;
  stripe: {
    amountChargedCents: number | null;
    feeCents: number | null;
    netPayoutCents: number | null;
    paymentIntentId: string | null;
    chargeId: string | null;
    amountSource: StripeAmountSource;
    reconciled: boolean;
    differenceCents: number | null;
  };
};

export function dollarsToCents(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function formatUsdFromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${fraction}`;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function joinUniqueLabels(current: string | null, next: string | null | undefined): string | null {
  const parts = [current, next]
    .flatMap((value) => (value ?? "").split(","))
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(parts));
  return unique.length > 0 ? unique.join(", ") : null;
}

/**
 * Pickup is a stored zero-dollar shipping line. A ship order has stored
 * shipping only after a verified quote, including a verified free quote.
 * The column default of 0 is not a quote.
 */
export function storedShippingCents(order: Pick<OrderMoneyInput, "deliveryMethod" | "freightQuoteCents" | "freightQuoteVerified">): number | null {
  if (order.deliveryMethod === "pickup") return 0;
  if (order.freightQuoteVerified) return Math.max(0, Math.round(order.freightQuoteCents ?? 0));
  return null;
}

function lineQuantity(line: OrderMoneyLine): number {
  const qty = line.qty ?? 1;
  return Number.isFinite(qty) ? Math.max(0, Math.round(qty)) : 1;
}

export function lineTotalCents(line: OrderMoneyLine): number | null {
  const fromLine = dollarsToCents(line.linePrice);
  if (fromLine != null) return fromLine;
  const unit = dollarsToCents(line.unitPrice);
  if (unit == null) return null;
  return unit * lineQuantity(line);
}

export function merchandiseSubtotalCents(order: Pick<OrderMoneyInput, "lineItems" | "totalAmount">): number {
  const lines = order.lineItems ?? [];
  if (lines.length === 0) return dollarsToCents(order.totalAmount) ?? 0;
  return lines.reduce((sum, line) => sum + (lineTotalCents(line) ?? 0), 0);
}

function lineDiscounts(lines: OrderMoneyLine[]): OrderDiscount[] {
  const discounts: OrderDiscount[] = [];
  lines.forEach((line, lineIndex) => {
    const original = dollarsToCents(line.originalUnitPrice);
    const unit = dollarsToCents(line.unitPrice);
    if (original == null || unit == null || original <= unit) return;
    discounts.push({
      lineIndex,
      name: text(line.promoName),
      amountCents: (original - unit) * lineQuantity(line),
      includedInSubtotal: true,
    });
  });
  return discounts;
}

export function snapshotUnitCostCents(line: OrderMoneyLine): number | null {
  if (line.unitDistributorCost != null && line.unitDistributorCost !== "") {
    const cents = dollarsToCents(line.unitDistributorCost);
    if (cents != null) return cents;
  }
  if (typeof line.hardwareUnitCostCents === "number" && Number.isFinite(line.hardwareUnitCostCents)) {
    return Math.round(line.hardwareUnitCostCents);
  }
  return null;
}

export function resolveLineDistributorCost(input: {
  line: OrderMoneyLine;
  tableUnitCostCents: number | null;
  tableSku: string | null;
  currentUnitCostCents: number | null;
  currentSku: string | null;
}): { unitCostCents: number | null; source: CostSource; label: string | null; sku: string | null } {
  const snapped = snapshotUnitCostCents(input.line);
  if (snapped != null) {
    return { unitCostCents: snapped, source: "snapshot", label: null, sku: text(input.line.distributorSku) ?? input.tableSku ?? input.currentSku };
  }
  if (input.tableUnitCostCents != null) {
    return { unitCostCents: input.tableUnitCostCents, source: "snapshot", label: null, sku: input.tableSku ?? text(input.line.distributorSku) ?? input.currentSku };
  }
  if (input.currentUnitCostCents != null) {
    return {
      unitCostCents: input.currentUnitCostCents,
      source: "current",
      label: CURRENT_COST_LABEL,
      sku: input.currentSku ?? text(input.line.distributorSku),
    };
  }
  return { unitCostCents: null, source: "unavailable", label: null, sku: text(input.line.distributorSku) ?? input.currentSku };
}

export type StoredStripeCharge = {
  orderRequestId: number | null;
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
  chargeId: string | null;
  amountCents: number;
  status?: string | null;
  occurredAt?: Date | string | number | null;
};

function chargeTime(charge: StoredStripeCharge): number {
  const value = charge.occurredAt;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function chooseStoredStripeCharge(order: Pick<OrderMoneyInput, "id" | "stripePaymentIntentId" | "stripeSessionId">, records: StoredStripeCharge[]): StoredStripeCharge | null {
  const matches = records.filter((record) =>
    record.orderRequestId === order.id
    || (order.stripePaymentIntentId != null && record.paymentIntentId === order.stripePaymentIntentId)
    || (order.stripeSessionId != null && record.checkoutSessionId === order.stripeSessionId));
  if (matches.length === 0) return null;
  const settled = matches.filter((record) => record.status === "paid" || record.status === "partially_refunded" || record.status === "refunded");
  const pool = settled.length > 0 ? settled : matches;
  return pool.slice().sort((left, right) => chargeTime(right) - chargeTime(left))[0] ?? null;
}

export function reconcileOrderTotal(orderTotalCents: number | null, stripeAmountCents: number | null): { reconciled: boolean; differenceCents: number | null } {
  if (orderTotalCents == null || stripeAmountCents == null) return { reconciled: false, differenceCents: null };
  const differenceCents = orderTotalCents - stripeAmountCents;
  if (differenceCents === 0) return { reconciled: true, differenceCents: null };
  return { reconciled: false, differenceCents };
}

export function buildShippingLine(input: { amountCents: number | null; carrier: string | null; method: string | null }): ShippingLine {
  return {
    kind: "shipping",
    name: "Shipping",
    qty: 1,
    amountCents: input.amountCents,
    carrier: input.carrier,
    method: input.method,
    stored: input.amountCents != null,
  };
}

export function summarizeAdminOrder(order: OrderMoneyInput, extras?: {
  carrier?: string | null;
  shippingMethod?: string | null;
  orderLevelDiscountCents?: number;
  stripeAmountChargedCents?: number | null;
}): AdminOrderListMoney {
  const subtotalCents = merchandiseSubtotalCents(order);
  const shippingAmountCents = storedShippingCents(order);
  const taxAmountCents = Math.max(0, dollarsToCents(order.taxAmount) ?? 0);
  const promoDiscounts = lineDiscounts(order.lineItems ?? []);
  const orderLevelDiscountCents = Math.max(0, extras?.orderLevelDiscountCents ?? 0);
  const discounts = orderLevelDiscountCents > 0
    ? [...promoDiscounts, { lineIndex: null, name: "Order discount", amountCents: orderLevelDiscountCents, includedInSubtotal: false }]
    : promoDiscounts;
  const discountCents = orderLevelDiscountCents;
  const totalCents = shippingAmountCents == null
    ? null
    : subtotalCents + shippingAmountCents + taxAmountCents - discountCents;
  const stripeAmountChargedCents = extras?.stripeAmountChargedCents ?? null;
  const reconciliation = reconcileOrderTotal(totalCents, stripeAmountChargedCents);
  const carrier = text(extras?.carrier);
  const shippingMethod = text(extras?.shippingMethod) ?? (order.deliveryMethod === "pickup" ? "Pickup" : null);
  return {
    customerName: text(order.originatorName),
    shippingLocation: {
      street: text(order.shippingAddressLine1),
      line2: text(order.shippingAddressLine2),
      city: text(order.shippingCity),
      state: text(order.shippingState),
      zip: text(order.zip),
    },
    subtotalCents,
    shippingLine: buildShippingLine({ amountCents: shippingAmountCents, carrier, method: shippingMethod }),
    shippingAmountCents,
    carrier,
    shippingMethod,
    taxAmountCents,
    discounts,
    discountCents,
    totalCents,
    stripeAmountChargedCents,
    reconciled: reconciliation.reconciled,
    differenceCents: reconciliation.differenceCents,
  };
}

export function buildAdminOrderDetail(input: {
  order: OrderMoneyInput;
  carrier?: string | null;
  shippingMethod?: string | null;
  orderLevelDiscountCents?: number;
  stripeAmountChargedCents?: number | null;
  stripeFeeCents?: number | null;
  stripeNetCents?: number | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  amountSource: StripeAmountSource;
  lineCosts: Array<{ unitCostCents: number | null; source: CostSource; label: string | null; sku: string | null }>;
}): AdminOrderDetail {
  const summary = summarizeAdminOrder(input.order, {
    carrier: input.carrier,
    shippingMethod: input.shippingMethod,
    orderLevelDiscountCents: input.orderLevelDiscountCents,
    stripeAmountChargedCents: input.stripeAmountChargedCents,
  });
  const productLines = input.order.lineItems ?? [];
  let knownMargin = 0;
  let knownMarginLines = 0;
  let pricedLines = 0;
  const lines: AdminOrderProductLine[] = productLines.map((line, lineIndex) => {
    const cost = input.lineCosts[lineIndex] ?? { unitCostCents: null, source: "unavailable" as const, label: null, sku: null };
    const qty = lineQuantity(line);
    const lineTotal = lineTotalCents(line);
    const lineCost = cost.unitCostCents == null ? null : cost.unitCostCents * qty;
    const grossMarginCents = lineTotal == null || lineCost == null ? null : lineTotal - lineCost;
    if (lineTotal != null) pricedLines += 1;
    if (grossMarginCents != null) {
      knownMargin += grossMarginCents;
      knownMarginLines += 1;
    }
    return {
      kind: "product",
      lineIndex,
      sku: cost.sku ?? text(line.distributorSku) ?? text(line.masterCode) ?? text(line.rawCode),
      code: text(line.masterCode) ?? text(line.rawCode),
      name: text(line.description) ?? text(line.masterCode) ?? text(line.rawCode) ?? "Item",
      qty,
      unitCustomerPriceCents: dollarsToCents(line.unitPrice),
      lineTotalCents: lineTotal,
      unitDistributorCostCents: cost.unitCostCents,
      lineDistributorCostCents: lineCost,
      costSource: cost.source,
      costLabel: cost.label,
      grossMarginCents,
    };
  });
  const feeCents = input.stripeFeeCents ?? null;
  const netPayoutCents = input.stripeNetCents ?? (
    summary.stripeAmountChargedCents != null && feeCents != null
      ? summary.stripeAmountChargedCents - feeCents
      : null
  );
  return {
    ...summary,
    orderId: input.order.id,
    requestNumber: text(input.order.requestNumber),
    currency: "usd",
    lines,
    grossMarginCents: knownMarginLines > 0 ? knownMargin : null,
    grossMarginComplete: pricedLines > 0 && knownMarginLines === pricedLines,
    stripe: {
      amountChargedCents: summary.stripeAmountChargedCents,
      feeCents,
      netPayoutCents,
      paymentIntentId: text(input.paymentIntentId),
      chargeId: text(input.chargeId),
      amountSource: input.amountSource,
      reconciled: summary.reconciled,
      differenceCents: summary.differenceCents,
    },
  };
}
