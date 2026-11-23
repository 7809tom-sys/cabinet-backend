import { describe, expect, it, vi } from "vitest";
import {
  AWAITING_MANUAL_SHIPPING_QUOTE_STATUS,
  AWAITING_SHIPPING_ESTIMATE_STATUS,
} from "../../shared/shippingRules";
import {
  buildShippingPathOwnerEmail,
  canCaptureShippingPayment,
  resolveShippingQuoteStatus,
} from "./shippingQuotePaths";

const address = { line1: "100 Main St", line2: null, city: "Miami", state: "FL", zip: "33101" };

describe("shipping quote path status", () => {
  it("marks an estimate-pending invoice and still allows payment of known amounts", () => {
    expect(resolveShippingQuoteStatus({ path: "estimate", hasPendingEstimate: true })).toBe(AWAITING_SHIPPING_ESTIMATE_STATUS);
    expect(resolveShippingQuoteStatus({ hasPendingEstimate: true })).toBe(AWAITING_SHIPPING_ESTIMATE_STATUS);
    expect(canCaptureShippingPayment(AWAITING_SHIPPING_ESTIMATE_STATUS)).toBe(true);
  });

  it("holds payment capture on the manual-quote path", () => {
    expect(resolveShippingQuoteStatus({ path: "manual", hasPendingEstimate: true })).toBe(AWAITING_MANUAL_SHIPPING_QUOTE_STATUS);
    expect(canCaptureShippingPayment(AWAITING_MANUAL_SHIPPING_QUOTE_STATUS)).toBe(false);
  });

  it("records a fully known fixed quote as quoted", () => {
    expect(resolveShippingQuoteStatus({ path: "fixed", hasPendingEstimate: false })).toBe("quoted");
  });
});

describe("owner email copy", () => {
  it("builds an estimate email and a manual-quote email without sending anything", () => {
    const estimate = buildShippingPathOwnerEmail({
      path: "estimate",
      originatorName: "Ada",
      originatorEmail: "ada@example.com",
      originatorPhone: "555-0100",
      deliveryAddress: address,
      requestNumber: "CD-20261123-TEST",
      pendingCategories: ["flooring"],
      knownShippingCents: 10000,
      pendingLabels: ["Flooring shipping: quoted separately / pending"],
      lineSummary: "2 × Calacatta slab",
    });
    expect(estimate.title).toBe("Shipping estimate requested");
    expect(estimate.content).toContain("still place or save");
    expect(estimate.content).toContain("ada@example.com");
    expect(estimate.content).toContain("Known shipping: $100.00");
    expect(estimate.content).toContain("2 × Calacatta slab");

    const manual = buildShippingPathOwnerEmail({
      path: "manual",
      originatorEmail: "ada@example.com",
      deliveryAddress: address,
      pendingCategories: ["countertops"],
      knownShippingCents: 0,
      pendingLabels: ["Countertop shipping outside Florida: quoted separately / pending"],
      lineSummary: "2 × Calacatta slab",
    });
    expect(manual.title).toBe("Manual shipping quote requested");
    expect(manual.content).toContain("Do not capture payment");
  });
});
