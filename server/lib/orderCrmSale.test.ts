import { describe, expect, it } from "vitest";
import {
  applyCrmBackfill,
  applyOrderCrmSync,
  applyOrderRefund,
  previewCrmBackfill,
  wonRevenueDeals,
  type CrmOrderView,
  type MemoryDeal,
} from "./orderCrmSale";

function order(partial: Partial<CrmOrderView> & Pick<CrmOrderView, "id" | "status">): CrmOrderView {
  return {
    requestNumber: `CD-${partial.id}`,
    paidAt: null,
    stripePaymentIntentId: null,
    totalAmount: "520.00",
    affiliateId: null,
    originatorName: "Jamie Carter",
    originatorEmail: "jamie@example.com",
    originatorPhone: "555-0100",
    ...partial,
  };
}

function deal(partial: Partial<MemoryDeal> & Pick<MemoryDeal, "id">): MemoryDeal {
  return {
    stage: "qualified",
    orderRequestId: partial.id,
    estimatedValue: null,
    closedAt: null,
    activities: [],
    saleRefundedAt: null,
    affiliateId: null,
    contactEmail: "jamie@example.com",
    contactName: "Jamie Carter",
    contactPhone: "555-0100",
    ...partial,
  };
}

describe("order CRM sale sync", () => {
  it("keeps a submitted unpaid order qualified and does not create a second deal", () => {
    const submitted = order({ id: 8, status: "submitted" });
    const once = applyOrderCrmSync([], submitted);
    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({ stage: "qualified", orderRequestId: 8, contactEmail: "jamie@example.com" });
    const twice = applyOrderCrmSync(once, submitted);
    expect(twice).toHaveLength(1);
    expect(twice[0].id).toBe(once[0].id);
    expect(twice[0].stage).toBe("qualified");
  });

  it("moves the existing qualified deal to new_sale when the order is paid", () => {
    const existing = [deal({ id: 3, orderRequestId: 8, stage: "qualified", contactName: "Jamie Carter" })];
    const paid = order({ id: 8, status: "confirmed", paidAt: "2026-10-27T15:00:00.000Z", totalAmount: "520.00" });
    const next = applyOrderCrmSync(existing, paid);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(3);
    expect(next[0]).toMatchObject({
      stage: "new_sale",
      estimatedValue: "520.00",
      closedAt: "2026-10-27T15:00:00.000Z",
      contactName: "Jamie Carter",
    });
    expect(next[0].activities).toHaveLength(1);
    expect(next[0].activities[0]).toContain("New Sale");
    const again = applyOrderCrmSync(next, paid);
    expect(again[0].activities).toHaveLength(1);
  });

  it("copies the order email onto a New Sale lead that was linked without one", () => {
    const existing = [deal({
      id: 3,
      orderRequestId: 11700001,
      stage: "qualified",
      contactEmail: null,
      contactName: null,
      contactPhone: null,
    })];
    const paid = order({
      id: 11700001,
      requestNumber: "CD-20261022-OLOUT",
      status: "confirmed",
      paidAt: "2026-10-22T15:00:00.000Z",
      originatorEmail: "homeowner@example.com",
      originatorName: "Home Owner",
    });
    const next = applyOrderCrmSync(existing, paid);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      stage: "new_sale",
      contactEmail: "homeowner@example.com",
      contactName: "Home Owner",
    });
  });

  it("does not replace a contact email the lead already has", () => {
    const existing = [deal({ id: 3, orderRequestId: 8, contactEmail: "kept@example.com" })];
    const paid = order({
      id: 8,
      status: "confirmed",
      paidAt: "2026-10-27T15:00:00.000Z",
      originatorEmail: "other@example.com",
    });
    expect(applyOrderCrmSync(existing, paid)[0].contactEmail).toBe("kept@example.com");
  });

  it("fills a blank email when an unpaid order stays qualified", () => {
    const existing = [deal({ id: 4, orderRequestId: 8, stage: "qualified", contactEmail: null })];
    const next = applyOrderCrmSync(existing, order({ id: 8, status: "submitted", originatorEmail: "ada@example.com" }));
    expect(next[0]).toMatchObject({ stage: "qualified", contactEmail: "ada@example.com" });
  });

  it("creates the deal directly in new_sale when payment lands first", () => {
    const paid = order({ id: 9, status: "confirmed", stripePaymentIntentId: "pi_123", paidAt: "2026-10-27T15:00:00.000Z" });
    const next = applyOrderCrmSync([], paid);
    expect(next).toEqual([expect.objectContaining({ stage: "new_sale", orderRequestId: 9 })]);
  });

  it("leaves a refunded sale in place and only logs the refund", () => {
    const paid = order({ id: 8, status: "confirmed", paidAt: "2026-10-27T15:00:00.000Z" });
    const sold = applyOrderCrmSync([deal({ id: 3, orderRequestId: 8 })], paid);
    const refunded = applyOrderRefund(sold, paid, "Stripe charge.refunded");
    expect(refunded).toHaveLength(1);
    expect(refunded[0].stage).toBe("new_sale");
    expect(refunded[0].saleRefundedAt).toBeTruthy();
    expect(refunded[0].activities.some((body) => body.includes(":refund]"))).toBe(true);
    const repeat = applyOrderRefund(refunded, paid, "Stripe charge.refunded");
    expect(repeat[0].activities.filter((body) => body.includes(":refund]"))).toHaveLength(1);
  });

  it("previews a backfill without changing deals, then applies the same moves", () => {
    const orders = [
      order({ id: 1, status: "submitted" }),
      order({ id: 2, status: "confirmed", paidAt: "2026-10-01T00:00:00.000Z" }),
    ];
    const deals = [deal({ id: 5, orderRequestId: 2, stage: "qualified" })];
    const preview = previewCrmBackfill(orders, deals);
    expect(preview).toEqual({ createQualified: 1, createNewSale: 0, moveToNewSale: 1, unchanged: 0, skipped: 0 });
    const dry = applyCrmBackfill(orders, deals, true);
    expect(dry.deals).toBe(deals);
    expect(dry.deals[0].stage).toBe("qualified");
    const applied = applyCrmBackfill(orders, deals, false);
    expect(applied.deals.find((row) => row.orderRequestId === 2)?.stage).toBe("new_sale");
    expect(applied.deals.find((row) => row.orderRequestId === 1)?.stage).toBe("qualified");
    expect(applied.deals).toHaveLength(2);
  });

  it("counts New Sale as won revenue and not as an open lead", () => {
    const totals = wonRevenueDeals([
      { stage: "qualified", estimatedValue: "100" },
      { stage: "new_sale", estimatedValue: "520" },
      { stage: "won", estimatedValue: "80" },
      { stage: "lost", estimatedValue: "10" },
    ]);
    expect(totals).toEqual({ count: 2, value: 600 });
  });
});
