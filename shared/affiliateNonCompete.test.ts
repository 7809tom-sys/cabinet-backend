import { describe, expect, it } from "vitest";
import {
  AFFILIATE_LIQUIDATED_DAMAGES_USD,
  AFFILIATE_NON_COMPETE_TERM_MONTHS,
  affiliateNonCompeteEnforcementNote,
} from "./affiliateNonCompete";

describe("affiliate non-compete contract constants", () => {
  it("sets a two-year term and a ten-thousand-dollar proposed liquidated-damages amount", () => {
    expect(AFFILIATE_NON_COMPETE_TERM_MONTHS).toBe(24);
    expect(AFFILIATE_LIQUIDATED_DAMAGES_USD).toBe(10_000);
  });

  it("records the confirmed violation and immediate storefront suspension in the enforcement note", () => {
    const note = affiliateNonCompeteEnforcementNote({
      at: new Date("2026-08-18T00:00:00.000Z"),
      violationSummary: "Operating a competing white-label cabinet storefront.",
    });
    expect(note).toContain("Confirmed violation");
    expect(note).toContain("Storefront suspended");
    expect(note).toContain("$10,000 per violation");
  });
});
