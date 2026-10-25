import { describe, expect, it } from "vitest";
import { usableInvoicePrefill, verifiedFreightInvoicePrefill } from "./crmInvoicePrefill";

describe("CRM invoice source prefill", () => {
  it("uses a valid original application total and preserves its source label", () => {
    expect(usableInvoicePrefill({ totalAmount: "4875.50", source: "Order ORD-1001" })).toEqual({
      amount: "4875.50",
      source: "Order ORD-1001",
    });
  });

  it("rejects cancelled, negative, and missing application totals", () => {
    expect(usableInvoicePrefill({ totalAmount: "900", status: "cancelled", source: "Installation estimate #4" })).toEqual({ amount: null, source: null });
    expect(usableInvoicePrefill({ totalAmount: "-1", source: "Order ORD-1001" })).toEqual({ amount: null, source: null });
    expect(usableInvoicePrefill(null)).toEqual({ amount: null, source: null });
  });
});

describe("CRM invoice verified freight prefill", () => {
  const source = "Verified shipping quote · Order ORD-1001";

  it("uses a signed carrier quote as a separate shipping amount", () => {
    expect(verifiedFreightInvoicePrefill({
      freightQuoteCents: 18450,
      freightQuoteVerified: true,
      deliveryMethod: "ship",
      source,
    })).toEqual({ amount: "184.50", source, note: null });
  });

  it("preserves a signed free-freight quote instead of treating it as missing", () => {
    expect(verifiedFreightInvoicePrefill({
      freightQuoteCents: 0,
      freightQuoteVerified: true,
      deliveryMethod: "ship",
      source,
    })).toEqual({ amount: "0.00", source, note: null });
  });

  it("does not invoice pickup, unsigned, cancelled, or malformed freight as shipping", () => {
    expect(verifiedFreightInvoicePrefill({
      freightQuoteCents: 24900,
      freightQuoteVerified: true,
      deliveryMethod: "pickup",
      source,
    })).toEqual({ amount: null, source: null, note: "Pickup selected — no shipping charge is added." });
    expect(verifiedFreightInvoicePrefill({
      freightQuoteCents: 24900,
      freightQuoteVerified: false,
      deliveryMethod: "ship",
      source,
    })).toEqual({ amount: null, source: null, note: "Shipping needs a verified carrier quote." });
    expect(verifiedFreightInvoicePrefill({
      freightQuoteCents: 24900,
      freightQuoteVerified: true,
      deliveryMethod: "ship",
      status: "cancelled",
      source,
    })).toEqual({ amount: null, source: null, note: "Shipping needs a verified carrier quote." });
    expect(verifiedFreightInvoicePrefill({
      freightQuoteCents: -1,
      freightQuoteVerified: true,
      deliveryMethod: "ship",
      source,
    })).toEqual({ amount: null, source: null, note: "Shipping needs a verified carrier quote." });
    expect(verifiedFreightInvoicePrefill({
      freightQuoteCents: 12.5,
      freightQuoteVerified: true,
      deliveryMethod: "ship",
      source,
    })).toEqual({ amount: null, source: null, note: "Shipping needs a verified carrier quote." });
  });
});
