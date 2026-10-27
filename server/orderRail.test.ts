import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const orders = readFileSync(new URL("./routers/orders.ts", import.meta.url), "utf8");
const distributor = readFileSync(new URL("./routers/distributorPortal.ts", import.meta.url), "utf8");
const stripe = readFileSync(new URL("./stripe.ts", import.meta.url), "utf8");

describe("official affiliate-distributor order rail", () => {
  it("models payment, affiliate review, distributor invoice, and fulfillment authorization separately", () => {
    expect(schema).toContain('"awaiting_payment"');
    expect(schema).toContain('"affiliate_review"');
    expect(schema).toContain('"distributor_inventory_check"');
    expect(schema).toContain('"affiliate_invoice_review"');
    expect(schema).toContain('"fulfillment_authorized"');
  });

  it("moves a paid checkout into affiliate review rather than fulfillment", () => {
    expect(stripe).toContain('orderRailStatus: "affiliate_review"');
    expect(stripe).toContain('status: "confirmed"');
  });

  it("requires affiliate ownership before routing an order to a supply line", () => {
    expect(orders).toContain("affiliateApproveForInventory: protectedProcedure");
    expect(orders).toContain("Only the originating affiliate can approve this order.");
    expect(orders).toContain('orderRailStatus: "distributor_inventory_check"');
  });

  it("requires a distributor inventory confirmation and updated invoice before final affiliate approval", () => {
    expect(distributor).toContain('confirmInventoryAndInvoice: withVendorFeature("cabinet_catalog")');
    expect(distributor).toContain('orderRailStatus: "affiliate_invoice_review"');
    expect(distributor).toContain("distributorInvoiceReference");
    expect(orders).toContain("affiliateApproveDistributorInvoice: protectedProcedure");
    expect(orders).toContain('orderRailStatus: "fulfillment_authorized"');
  });
});
