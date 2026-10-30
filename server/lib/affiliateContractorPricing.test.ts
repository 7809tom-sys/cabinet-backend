import { describe, expect, it } from "vitest";
import { latestAffiliateSubmission, withAffiliateContractorUnitPrice } from "./affiliateContractorPricing";
import { pricingSettingsWithAffiliateContractorMarkup } from "../../shared/affiliateContractorMarkup";

const settings = pricingSettingsWithAffiliateContractorMarkup({
  homeownerMarkupBps: 15800,
  contractorMarkupBps: 12900,
  wholesaleMarkupBps: 12500,
}, 4000);

describe("affiliate contractor submission choice", () => {
  it("uses the latest reviewed affiliate-submitted approval", () => {
    const chosen = latestAffiliateSubmission([
      { id: 1, userId: 8, status: "approved", submittedByUserId: 3, reviewedAt: new Date("2026-01-01") },
      { id: 2, userId: 8, status: "approved", submittedByUserId: null, reviewedAt: new Date("2026-06-01") },
      { id: 4, userId: 8, status: "pending", submittedByUserId: 9, reviewedAt: null },
      { id: 5, userId: 9, status: "approved", submittedByUserId: 7, reviewedAt: new Date("2026-07-01") },
      { id: 3, userId: 8, status: "approved", submittedByUserId: 9, reviewedAt: new Date("2026-03-01") },
    ], 8);
    expect(chosen?.submittedByUserId).toBe(9);
  });
});

describe("affiliate contractor checkout price", () => {
  it("replaces the submitted cabinet price with cost times one plus the affiliate markup", () => {
    const rows = [{
      cabinetId: 7,
      styleId: 3,
      distributorId: 1,
      yourCost: "80.00",
      wholesalePrice: null,
      adjustedListPrice: null,
      listPrice: null,
    }];
    const line = withAffiliateContractorUnitPrice({
      cabinetId: 7,
      styleId: 3,
      distributorId: 1,
      qty: 2,
      unitPrice: 1,
      linePrice: 2,
    }, rows, settings);
    expect(line.unitPrice).toBe(112);
    expect(line.linePrice).toBe(224);
  });

  it("leaves hardware lines and lines without a cost row unchanged", () => {
    const hardware = withAffiliateContractorUnitPrice({
      cabinetId: 7,
      styleId: 3,
      productKind: "hardware",
      qty: 1,
      unitPrice: 15,
      linePrice: 15,
    }, [], settings);
    expect(hardware.unitPrice).toBe(15);
    const missing = withAffiliateContractorUnitPrice({
      cabinetId: 9,
      styleId: 3,
      qty: 1,
      unitPrice: 15,
      linePrice: 15,
    }, [], settings);
    expect(missing.unitPrice).toBe(15);
  });
});
