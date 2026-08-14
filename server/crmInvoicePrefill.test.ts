import { describe, expect, it } from "vitest";
import { usableInvoicePrefill } from "./crmInvoicePrefill";

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
