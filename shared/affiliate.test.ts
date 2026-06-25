import { describe, expect, it } from "vitest";
import {
  normalizeReferralCode,
  slugify,
  deriveReferralCode,
  computeCommission,
  sumCommission,
  AFFILIATE_MEMBERSHIP,
  formatMembershipPrice,
  membershipPriceLabel,
} from "./affiliate";

describe("normalizeReferralCode", () => {
  it("uppercases and strips non-alphanumerics", () => {
    expect(normalizeReferralCode("first-class 01")).toBe("FIRSTCLASS01");
    expect(normalizeReferralCode("  fc_dz!  ")).toBe("FCDZ");
  });
  it("caps at 32 chars", () => {
    expect(normalizeReferralCode("a".repeat(50)).length).toBe(32);
  });
  it("handles empty", () => {
    expect(normalizeReferralCode("")).toBe("");
  });
});

describe("slugify", () => {
  it("makes a url-safe slug", () => {
    expect(slugify("First Class Flooring & Cabinet Design")).toBe(
      "first-class-flooring-cabinet-design"
    );
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Hello World--  ")).toBe("hello-world");
  });
});

describe("deriveReferralCode", () => {
  it("derives from store name", () => {
    expect(deriveReferralCode("First Class")).toBe("FIRSTCLASS");
  });
  it("falls back to STORE when empty", () => {
    expect(deriveReferralCode("!!!")).toBe("STORE");
  });
});

describe("computeCommission", () => {
  it("computes a percentage rounded to cents", () => {
    expect(computeCommission(2869.44, 0.05)).toBe(143.47);
  });
  it("returns 0 for non-positive / invalid", () => {
    expect(computeCommission(0, 0.05)).toBe(0);
    expect(computeCommission(100, 0)).toBe(0);
    expect(computeCommission(NaN, 0.05)).toBe(0);
  });
});

describe("sumCommission", () => {
  it("only counts confirmed orders toward gross + commission", () => {
    const res = sumCommission(
      [
        { totalAmount: 1000, status: "confirmed" },
        { totalAmount: 500, status: "submitted" },
        { totalAmount: 2000, status: "confirmed" },
        { totalAmount: null, status: "confirmed" },
      ],
      0.05
    );
    expect(res.referredCount).toBe(4);
    expect(res.confirmedCount).toBe(3);
    expect(res.gross).toBe(3000);
    expect(res.commission).toBe(150);
  });
});


describe("affiliate membership offer", () => {
  it("is priced at $1,195 per year", () => {
    expect(AFFILIATE_MEMBERSHIP.priceUsd).toBe(1195);
    expect(AFFILIATE_MEMBERSHIP.billingPeriod).toBe("year");
  });

  it("lists the three core benefits", () => {
    const titles = AFFILIATE_MEMBERSHIP.benefits.map((b) => b.title);
    expect(titles).toEqual([
      "Kitchen Design Software",
      "Your Own Website",
      "Buying-Group Access",
    ]);
  });

  it("formats the price with a thousands separator", () => {
    expect(formatMembershipPrice()).toBe("$1,195");
    expect(formatMembershipPrice(995)).toBe("$995");
  });

  it("builds a full price label with the billing period", () => {
    expect(membershipPriceLabel()).toBe("$1,195/year");
  });
});
