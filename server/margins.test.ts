import { describe, it, expect } from "vitest";
import {
  applyTierMarkup,
  markupBpsForTier,
  bpsToPercentLabel,
  clampBps,
  NEUTRAL_BPS,
} from "../shared/margins";

const NEUTRAL = {
  homeownerMarkupBps: NEUTRAL_BPS,
  contractorMarkupBps: NEUTRAL_BPS,
  wholesaleMarkupBps: NEUTRAL_BPS,
};

describe("margins math", () => {
  it("neutral (10000 bps) leaves a base price unchanged", () => {
    expect(applyTierMarkup("100.00", NEUTRAL, "homeowner")).toBe(100);
    expect(applyTierMarkup(250, NEUTRAL, "contractor")).toBe(250);
    expect(applyTierMarkup("99.99", NEUTRAL, "wholesale")).toBe(99.99);
  });

  it("applies a positive markup to the correct tier only", () => {
    const s = {
      homeownerMarkupBps: 11500, // +15%
      contractorMarkupBps: NEUTRAL_BPS,
      wholesaleMarkupBps: 9000, // -10%
    };
    expect(applyTierMarkup(100, s, "homeowner")).toBe(115);
    expect(applyTierMarkup(100, s, "contractor")).toBe(100);
    expect(applyTierMarkup(100, s, "wholesale")).toBe(90);
  });

  it("rounds to 2 decimals", () => {
    const s = { ...NEUTRAL, homeownerMarkupBps: 10333 }; // +3.33%
    expect(applyTierMarkup(100, s, "homeowner")).toBe(103.33);
  });

  it("returns null for null/NaN base price", () => {
    expect(applyTierMarkup(null, NEUTRAL, "homeowner")).toBeNull();
    expect(applyTierMarkup(undefined, NEUTRAL, "homeowner")).toBeNull();
    expect(applyTierMarkup("not-a-number", NEUTRAL, "homeowner")).toBeNull();
  });

  it("markupBpsForTier picks the right field", () => {
    const s = {
      homeownerMarkupBps: 1,
      contractorMarkupBps: 2,
      wholesaleMarkupBps: 3,
    };
    expect(markupBpsForTier(s, "homeowner")).toBe(1);
    expect(markupBpsForTier(s, "contractor")).toBe(2);
    expect(markupBpsForTier(s, "wholesale")).toBe(3);
  });

  it("clampBps keeps values in range and defaults NaN to neutral", () => {
    expect(clampBps(-500)).toBe(0);
    expect(clampBps(999999)).toBe(110000);
    expect(clampBps(NaN)).toBe(NEUTRAL_BPS);
  });

  it("bpsToPercentLabel formats deltas", () => {
    expect(bpsToPercentLabel(10000)).toBe("0%");
    expect(bpsToPercentLabel(11500)).toBe("+15%");
    expect(bpsToPercentLabel(9000)).toBe("-10%");
  });
});
