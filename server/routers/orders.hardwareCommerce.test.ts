import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const orders = readFileSync(new URL("./orders.ts", import.meta.url), "utf8");
const snapshotWriter = readFileSync(new URL("../lib/hardwareCommissionSnapshot.ts", import.meta.url), "utf8");

describe("Hardware Resources checkout contract", () => {
  it("requires immutable catalog IDs and reprices submitted hardware from current supplier list plus affiliate hardware markup", () => {
    expect(orders).toContain('line.productKind === "hardware"');
    expect(orders).toContain("line.vendorProductId");
    expect(orders).toContain("hardwareRetailCents(product.listPrice, markupBps)");
    expect(orders).toContain("hardwareUnitCostCents: costCents");
    expect(orders).toContain("hardwareMarkupBps: markupBps");
  });

  it("requires a distinct signed Hardware Resources quote and accepts bundled-free shipping only with verified kitchen freight", () => {
    expect(orders).toContain("hardwareFreightQuoteToken");
    expect(orders).toContain("freightQuoteItemsForOrder(hardwareOrderLines)");
    expect(orders).toContain('hardwareQuote.quoteKind === "hardware"');
    expect(orders).toContain('hardwareQuote.hardwareShippingMode === "bundled_free"');
    expect(orders).toContain("hasVerifiedKitchenFreight");
    expect(orders).toContain("hardwareQuote.totalCents === 0");
    expect(orders).toContain("hardwareProfileIsComplete(currentHardwareProfile ?? null)");
    expect(orders).toContain("hardwareQuote.profileRevision === (currentHardwareProfile?.profileRevision ?? -1)");
  });

  it("writes an idempotent 25% commission snapshot only after a confirmed paid order", () => {
    expect(snapshotWriter).toContain("hardwareAffiliateCommissionCents(hardwareMerchandiseCents)");
    expect(snapshotWriter).toContain("orderRequestId");
    expect(snapshotWriter).toContain("duplicate key");
    expect(snapshotWriter).toContain("/duplicate|unique/i");
    expect(snapshotWriter).toContain("order.status !== \"confirmed\"");
  });
});
