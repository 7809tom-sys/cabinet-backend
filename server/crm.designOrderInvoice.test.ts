import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers/crm.ts", import.meta.url), "utf8");

describe("CRM linked-plan invoice source contract", () => {
  it("prefers an order linked to the selected plan before legacy customer-email recovery", () => {
	  expect(source).toContain("inArray(orderRequests.kitchenDesignId, scopedLinkedDesignIds)");
    expect(source).toContain("linkedOrderRows[0] || designOrderRows[0] || !deal.contactEmail");
  });

  it("keeps order merchandise and verified freight as separate values", () => {
    expect(source).toContain("totalAmount: invoiceOrder.totalAmount");
    expect(source).toContain("freightQuoteCents: invoiceOrder.freightQuoteCents");
    expect(source).toContain("freightQuoteVerified: invoiceOrder.freightQuoteVerified");
    expect(source).toContain("shippingAmount: shippingPrefill.amount");
  });

  it("does not treat a zero saved plan share as an invoice price", () => {
    expect(source).toContain("shareSubtotal > 0");
    expect(source).toContain('"No verified plan price yet"');
  });
});
