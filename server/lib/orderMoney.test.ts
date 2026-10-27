import { describe, expect, it } from "vitest";
import {
  CURRENT_COST_LABEL,
  buildAdminOrderDetail,
  chooseStoredStripeCharge,
  reconcileOrderTotal,
  resolveLineDistributorCost,
  storedShippingCents,
  summarizeAdminOrder,
  type OrderMoneyInput,
} from "./orderMoney";

const cabinetOrder = (overrides: Partial<OrderMoneyInput> = {}): OrderMoneyInput => ({
  id: 18,
  requestNumber: "CD-520",
  originatorName: "Ada Lovelace",
  shippingAddressLine1: "1 Analytic Engine",
  shippingAddressLine2: null,
  shippingCity: "London",
  shippingState: "KY",
  zip: "40741",
  deliveryMethod: "ship",
  freightQuoteCents: 4700,
  freightQuoteVerified: true,
  taxAmount: "24.00",
  totalAmount: "449.00",
  lineItems: [{
    masterCode: "3DB18",
    distributorSku: "3DB18",
    description: "3 drawer base",
    qty: 1,
    unitPrice: 449,
    linePrice: 449,
    unitDistributorCost: 200,
  }],
  stripePaymentIntentId: "pi_520",
  ...overrides,
});

describe("admin order invoice total", () => {
  it("uses the full invoice, 449 + 47 + 24 = 520, as the primary amount", () => {
    const summary = summarizeAdminOrder(cabinetOrder(), {
      carrier: "UPS",
      shippingMethod: "Ground",
      stripeAmountChargedCents: 52000,
    });
    expect(summary.customerName).toBe("Ada Lovelace");
    expect(summary.shippingLocation).toEqual({
      street: "1 Analytic Engine",
      line2: null,
      city: "London",
      state: "KY",
      zip: "40741",
    });
    expect(summary.subtotalCents).toBe(44900);
    expect(summary.shippingAmountCents).toBe(4700);
    expect(summary.shippingLine).toMatchObject({ kind: "shipping", name: "Shipping", amountCents: 4700, carrier: "UPS", method: "Ground", stored: true });
    expect(summary.taxAmountCents).toBe(2400);
    expect(summary.totalCents).toBe(52000);
    expect(summary.totalCents).not.toBe(summary.subtotalCents);
    expect(summary.stripeAmountChargedCents).toBe(52000);
    expect(summary.reconciled).toBe(true);
    expect(summary.differenceCents).toBeNull();
  });

  it("leaves shipping null and does not reconcile when no quote was stored", () => {
    const summary = summarizeAdminOrder(cabinetOrder({
      freightQuoteCents: 0,
      freightQuoteVerified: false,
    }), { stripeAmountChargedCents: 52000 });
    expect(summary.shippingAmountCents).toBeNull();
    expect(summary.shippingLine.stored).toBe(false);
    expect(summary.shippingLine.amountCents).toBeNull();
    expect(summary.totalCents).toBeNull();
    expect(summary.reconciled).toBe(false);
    expect(summary.differenceCents).toBeNull();
  });

  it("treats pickup and a verified free quote as stored shipping", () => {
    expect(storedShippingCents({ deliveryMethod: "pickup", freightQuoteCents: 0, freightQuoteVerified: false })).toBe(0);
    expect(storedShippingCents({ deliveryMethod: "ship", freightQuoteCents: 0, freightQuoteVerified: true })).toBe(0);
    expect(storedShippingCents({ deliveryMethod: "ship", freightQuoteCents: 0, freightQuoteVerified: false })).toBeNull();
  });

  it("reports the difference when the invoice and the stored Stripe charge disagree", () => {
    const summary = summarizeAdminOrder(cabinetOrder(), { stripeAmountChargedCents: 50000 });
    expect(summary.reconciled).toBe(false);
    expect(summary.differenceCents).toBe(2000);
    expect(reconcileOrderTotal(null, 52000)).toEqual({ reconciled: false, differenceCents: null });
  });

  it("does not add the Stripe fee to the customer total", () => {
    const detail = buildAdminOrderDetail({
      order: cabinetOrder(),
      carrier: "UPS",
      shippingMethod: "Ground",
      stripeAmountChargedCents: 52000,
      stripeFeeCents: 1500,
      stripeNetCents: 50500,
      paymentIntentId: "pi_520",
      chargeId: "ch_520",
      amountSource: "stored_charge",
      lineCosts: [{ unitCostCents: 20000, source: "snapshot", label: null, sku: "3DB18" }],
    });
    expect(detail.totalCents).toBe(52000);
    expect(detail.stripe.feeCents).toBe(1500);
    expect(detail.stripe.netPayoutCents).toBe(50500);
    expect(detail.stripe.reconciled).toBe(true);
    expect(detail.lines[0]).toMatchObject({
      sku: "3DB18",
      code: "3DB18",
      name: "3 drawer base",
      qty: 1,
      unitCustomerPriceCents: 44900,
      lineTotalCents: 44900,
      unitDistributorCostCents: 20000,
      lineDistributorCostCents: 20000,
      grossMarginCents: 24900,
      costSource: "snapshot",
      costLabel: null,
    });
    expect(detail.grossMarginCents).toBe(24900);
  });

  it("labels a live catalog cost when the order never snapshotted one", () => {
    const resolved = resolveLineDistributorCost({
      line: { masterCode: "3DB18", qty: 1, unitPrice: 449, linePrice: 449 },
      tableUnitCostCents: null,
      tableSku: null,
      currentUnitCostCents: 18000,
      currentSku: "3DB18",
    });
    expect(resolved).toMatchObject({ unitCostCents: 18000, source: "current", label: CURRENT_COST_LABEL, sku: "3DB18" });
  });

  it("prefers the order-time snapshot over the current catalog cost", () => {
    const resolved = resolveLineDistributorCost({
      line: { unitDistributorCost: "200.00", distributorSku: "3DB18" },
      tableUnitCostCents: null,
      tableSku: null,
      currentUnitCostCents: 18000,
      currentSku: "OTHER",
    });
    expect(resolved.source).toBe("snapshot");
    expect(resolved.unitCostCents).toBe(20000);
    expect(resolved.label).toBeNull();
  });

  it("keeps a line promotion inside the subtotal and still subtracts an order-level discount", () => {
    const summary = summarizeAdminOrder(cabinetOrder({
      lineItems: [{
        description: "3 drawer base",
        masterCode: "3DB18",
        qty: 1,
        unitPrice: 400,
        linePrice: 400,
        originalUnitPrice: 449,
        promoName: "Spring",
      }],
      totalAmount: "400.00",
    }), { orderLevelDiscountCents: 500, stripeAmountChargedCents: 46600 });
    expect(summary.subtotalCents).toBe(40000);
    expect(summary.discounts).toEqual([
      { lineIndex: 0, name: "Spring", amountCents: 4900, includedInSubtotal: true },
      { lineIndex: null, name: "Order discount", amountCents: 500, includedInSubtotal: false },
    ]);
    expect(summary.discountCents).toBe(500);
    expect(summary.totalCents).toBe(40000 + 4700 + 2400 - 500);
    expect(summary.reconciled).toBe(true);
  });

  it("chooses the stored charge for the order and ignores another order's charge", () => {
    const chosen = chooseStoredStripeCharge(cabinetOrder(), [
      { orderRequestId: 99, paymentIntentId: "pi_other", checkoutSessionId: null, chargeId: "ch_other", amountCents: 100, status: "paid", occurredAt: new Date("2026-10-27T00:00:00Z") },
      { orderRequestId: 18, paymentIntentId: "pi_520", checkoutSessionId: "cs_520", chargeId: "ch_520", amountCents: 52000, status: "paid", occurredAt: new Date("2026-10-26T00:00:00Z") },
    ]);
    expect(chosen?.amountCents).toBe(52000);
    expect(chosen?.chargeId).toBe("ch_520");
  });
});
