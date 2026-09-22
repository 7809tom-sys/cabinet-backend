import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRICING_SETTINGS,
  normalizePricingSettings,
  applyBps,
  priceLadder,
  computeFeeStack,
  formatCents,
  paymentMethodLabel,
} from "./pricing";

describe("applyBps", () => {
  it("applies basis points and rounds to whole cents", () => {
    expect(applyBps(10000, 500)).toBe(500); // 5% of $100
    expect(applyBps(12345, 100)).toBe(123); // 1% of $123.45 = 123.45 → 123
    expect(applyBps(0, 1000)).toBe(0);
  });
});

describe("normalizePricingSettings", () => {
  it("fills missing/invalid fields with defaults", () => {
    const s = normalizePricingSettings({ affiliateMarkupBps: 700, damageFeeBps: -5, techFeeCapCents: null });
    expect(s.affiliateMarkupBps).toBe(700); // kept
    expect(s.damageFeeBps).toBe(DEFAULT_PRICING_SETTINGS.damageFeeBps); // negative → default
    expect(s.techFeeCapCents).toBe(DEFAULT_PRICING_SETTINGS.techFeeCapCents); // null → default
  });

  it("returns all defaults for null", () => {
    expect(normalizePricingSettings(null)).toEqual(DEFAULT_PRICING_SETTINGS);
  });
});

describe("priceLadder", () => {
  it("marks up every tier off the base cost (no chaining)", () => {
    // base $100: wholesale +15% = $115, affiliate +5% = $105, retail +25% =
    // $125. Each tier is computed off the SAME $100 cost, not off the tier below.
    const l = priceLadder(10000);
    expect(l.baseCostCents).toBe(10000);
    expect(l.wholesaleCents).toBe(11500);
    expect(l.affiliateCents).toBe(10500);
    expect(l.suggestedRetailCents).toBe(12500);
  });

  it("never goes negative", () => {
    const l = priceLadder(-500);
    expect(l.baseCostCents).toBe(0);
    expect(l.suggestedRetailCents).toBe(0);
  });
});

describe("computeFeeStack — affiliate-cost-only fees", () => {
  it("assesses an affiliate's cost invoice without increasing customer checkout", () => {
    // Affiliate cost $500; customer merchandise $800 + $75 freight.
    const fs = computeFeeStack({
      cabinetSubtotalCents: 80000,
      freightCents: 7500,
      affiliateCostCents: 50000,
      paymentMethod: "card",
      isAffiliateOrder: true,
    });
    expect(fs.damageFeeCents).toBe(500);
    expect(fs.techFeeCents).toBe(5000);
    expect(fs.techFeeCapped).toBe(false);
    // Card fee is 4% of affiliate cost only, with no fee-on-fee or freight basis.
    expect(fs.cardFeeCents).toBe(2000);
    expect(fs.affiliateTotalCostCents).toBe(57500);
    expect(fs.totalCents).toBe(87500);
  });

  it("caps the tech fee at $100 for large orders", () => {
    // cabinets $2000 = 200000; tech 10% = 20000 → capped to 10000 ($100)
    const fs = computeFeeStack({ cabinetSubtotalCents: 300000, affiliateCostCents: 200000, paymentMethod: "ach", achApproved: true, isAffiliateOrder: true });
    expect(fs.techFeeCents).toBe(10000);
    expect(fs.techFeeCapped).toBe(true);
  });

  it("approved affiliate ACH waives the 4% card fee", () => {
    const fs = computeFeeStack({ cabinetSubtotalCents: 70000, affiliateCostCents: 50000, paymentMethod: "ach", achApproved: true, isAffiliateOrder: true });
    expect(fs.cardFeeCents).toBe(0);
    expect(fs.affiliateTotalCostCents).toBe(55500);
  });

  it("unapproved affiliate ACH still pays the card fee until approved", () => {
    const fs = computeFeeStack({ cabinetSubtotalCents: 70000, affiliateCostCents: 50000, paymentMethod: "ach", achApproved: false, isAffiliateOrder: true });
    expect(fs.cardFeeCents).toBeGreaterThan(0);
  });

  it("does not apply affiliate fees to a customer checkout, retail, or freight", () => {
    const noFreight = computeFeeStack({ cabinetSubtotalCents: 50000, affiliateCostCents: 30000, paymentMethod: "card", isAffiliateOrder: true });
    const withFreight = computeFeeStack({ cabinetSubtotalCents: 50000, freightCents: 10000, affiliateCostCents: 30000, paymentMethod: "card", isAffiliateOrder: true });
    expect(withFreight.damageFeeCents).toBe(noFreight.damageFeeCents);
    expect(withFreight.techFeeCents).toBe(noFreight.techFeeCents);
    expect(withFreight.cardFeeCents).toBe(noFreight.cardFeeCents);
    expect(withFreight.totalCents - noFreight.totalCents).toBe(10000);
    const customer = computeFeeStack({ cabinetSubtotalCents: 50000, freightCents: 10000, paymentMethod: "card" });
    expect(customer.damageFeeCents).toBe(0);
    expect(customer.techFeeCents).toBe(0);
    expect(customer.cardFeeCents).toBe(0);
    expect(customer.totalCents).toBe(60000);
  });

  it("zero subtotal yields a zero stack", () => {
    const fs = computeFeeStack({ cabinetSubtotalCents: 0, paymentMethod: "card" });
    expect(fs.totalCents).toBe(0);
  });
});

describe("formatting helpers", () => {
  it("formats cents as USD", () => {
    expect(formatCents(12345)).toBe("$123.45");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(100000)).toBe("$1,000.00");
  });

  it("labels payment methods", () => {
    expect(paymentMethodLabel("ach")).toContain("ACH");
    expect(paymentMethodLabel("card")).toContain("card");
  });
});
