import { describe, expect, it } from "vitest";
import {
  normalizeDistributorZipRates,
  resolveDistributorShippingRule,
  shippingRuleCanQuote,
} from "./distributorShipping";

describe("distributor shipping rules", () => {
  it("uses the most specific matching ZIP rate before the distributor-wide fee", () => {
    const result = resolveDistributorShippingRule({
      mode: "fixed",
      flatFeeCents: 29900,
      freeThresholdCents: null,
      zipRates: [{ zipPrefix: "750", feeCents: 19900 }, { zipPrefix: "75001", feeCents: 14900 }],
      exceptions: null,
    }, "75001", 100000);
    expect(result).toEqual({
      fixedFeeCents: 14900,
      label: "Distributor fixed freight for ZIP 75001",
      matchedZipPrefix: "75001",
    });
  });

  it("applies a threshold as customer-visible free freight", () => {
    expect(resolveDistributorShippingRule({
      mode: "threshold",
      flatFeeCents: 24900,
      freeThresholdCents: 500000,
      zipRates: [],
      exceptions: "Remote areas may have a surcharge.",
    }, "90210", 500000).fixedFeeCents).toBe(0);
  });

  it("keeps live rules on the live carrier path", () => {
    const rule = { mode: "live" as const, flatFeeCents: null, freeThresholdCents: null, zipRates: [], exceptions: null };
    expect(resolveDistributorShippingRule(rule, "30301", 10000).fixedFeeCents).toBeNull();
    expect(shippingRuleCanQuote(rule)).toBe(true);
  });

  it("normalizes configured ZIP zones and rejects unusable entries", () => {
    expect(normalizeDistributorZipRates([
      { zipPrefix: "750-01", feeCents: 12500 },
      { zipPrefix: "12", feeCents: 10000 },
      { zipPrefix: "902", feeCents: -1 },
    ])).toEqual([{ zipPrefix: "75001", feeCents: 12500 }]);
  });
});
