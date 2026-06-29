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
  it("compounds markup on markup up the ladder", () => {
    // base $100, wholesale +15% = $115, affiliate +5% = $120.75 → 12075,
    // retail +25% = $150.9375 → 15094
    const l = priceLadder(10000);
    expect(l.baseCostCents).toBe(10000);
    expect(l.wholesaleCents).toBe(11500);
    expect(l.affiliateCents).toBe(12075);
    expect(l.suggestedRetailCents).toBe(15094);
  });

  it("never goes negative", () => {
    const l = priceLadder(-500);
    expect(l.baseCostCents).toBe(0);
    expect(l.suggestedRetailCents).toBe(0);
  });
});

describe("computeFeeStack — defaults (1% damage, 10% tech cap $100, 4% card)", () => {
  it("card order under the tech cap", () => {
    // cabinets $500 = 50000; damage 1% = 500; tech 10% = 5000 (< $100 cap? no,
    // 5000 = $50 < $10000 cap → uncapped); freight $0.
    const fs = computeFeeStack({ cabinetSubtotalCents: 50000, paymentMethod: "card", isAffiliateOrder: true });
    expect(fs.damageFeeCents).toBe(500);
    expect(fs.techFeeCents).toBe(5000);
    expect(fs.techFeeCapped).toBe(false);
    expect(fs.preCardTotalCents).toBe(55500);
    // card fee 4% of 55500 = 2220
    expect(fs.cardFeeCents).toBe(2220);
    expect(fs.totalCents).toBe(57720);
  });

  it("caps the tech fee at $100 for large orders", () => {
    // cabinets $2000 = 200000; tech 10% = 20000 → capped to 10000 ($100)
    const fs = computeFeeStack({ cabinetSubtotalCents: 200000, paymentMethod: "ach", achApproved: true, isAffiliateOrder: true });
    expect(fs.techFeeCents).toBe(10000);
    expect(fs.techFeeCapped).toBe(true);
  });

  it("approved ACH waives the 4% card fee", () => {
    const fs = computeFeeStack({ cabinetSubtotalCents: 50000, paymentMethod: "ach", achApproved: true });
    expect(fs.cardFeeCents).toBe(0);
    expect(fs.totalCents).toBe(fs.preCardTotalCents);
  });

  it("unapproved ACH still pays the card fee until approved", () => {
    const fs = computeFeeStack({ cabinetSubtotalCents: 50000, paymentMethod: "ach", achApproved: false });
    expect(fs.cardFeeCents).toBeGreaterThan(0);
  });

  it("includes freight in the card-fee base but not the damage/tech base", () => {
    const noFreight = computeFeeStack({ cabinetSubtotalCents: 50000, paymentMethod: "card" });
    const withFreight = computeFeeStack({ cabinetSubtotalCents: 50000, freightCents: 10000, paymentMethod: "card" });
    // Damage + tech identical (based on cabinet subtotal only)
    expect(withFreight.damageFeeCents).toBe(noFreight.damageFeeCents);
    expect(withFreight.techFeeCents).toBe(noFreight.techFeeCents);
    // Card fee grows because freight is in the pre-card total
    expect(withFreight.cardFeeCents).toBeGreaterThan(noFreight.cardFeeCents);
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
