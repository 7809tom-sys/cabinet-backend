import { describe, expect, it } from "vitest";
import { sellPriceForTier, type AffiliateContractorCostContext } from "../../shared/margins";
import { attachAffiliateContractorCost, latestAffiliateSubmission, withAffiliateContractorUnitPrice } from "./affiliateContractorPricing";

const siteSettings = {
  homeownerMarkupBps: 15800,
  contractorMarkupBps: 12900,
  wholesaleMarkupBps: 12500,
};

const storeCost: AffiliateContractorCostContext = {
  markupBps: 2900,
  tier: { basis: "cost_multiplier", basisPoints: 12000 },
  platformAffiliateMarkupBps: 500,
};

const settings = attachAffiliateContractorCost(siteSettings, "contractor", storeCost);

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
  it("uses the same affiliate-cost contractor price as the catalog", () => {
    const rows = [{
      cabinetId: 7,
      styleId: 3,
      distributorId: 1,
      category: "Base",
      yourCost: "100.00",
      wholesalePrice: null,
      adjustedListPrice: null,
      listPrice: "250.00",
    }];
    const catalogPrice = sellPriceForTier(rows[0], settings, "contractor");
    const line = withAffiliateContractorUnitPrice({
      cabinetId: 7,
      styleId: 3,
      distributorId: 1,
      qty: 2,
      unitPrice: 1,
      linePrice: 2,
    }, rows, settings);
    expect(catalogPrice).toBe(154.8);
    expect(line.unitPrice).toBe(catalogPrice);
    expect(line.linePrice).toBe(309.6);
  });

  it("prices a flooring order line from the 40/60 affiliate cost, matching the catalog", () => {
    const rows = [{
      cabinetId: 8,
      styleId: 3,
      distributorId: 1,
      category: "Flooring",
      yourCost: 100,
      wholesalePrice: null,
      adjustedListPrice: null,
      listPrice: 200,
    }];
    const catalogPrice = sellPriceForTier(rows[0], settings, "contractor");
    const line = withAffiliateContractorUnitPrice({
      cabinetId: 8,
      styleId: 3,
      distributorId: 1,
      qty: 1,
      unitPrice: 1,
      linePrice: 1,
    }, rows, settings);
    expect(catalogPrice).toBe(180.6);
    expect(line.unitPrice).toBe(catalogPrice);
  });

  it("keeps the site contractor price when the contractor has no markup row", () => {
    const rows = [{
      cabinetId: 7,
      styleId: 3,
      distributorId: 1,
      yourCost: "100.00",
      wholesalePrice: null,
      adjustedListPrice: null,
      listPrice: null,
    }];
    const unchanged = attachAffiliateContractorCost(siteSettings, "contractor", null);
    expect(unchanged).toBe(siteSettings);
    const line = withAffiliateContractorUnitPrice({
      cabinetId: 7,
      styleId: 3,
      distributorId: 1,
      qty: 1,
      unitPrice: 1,
      linePrice: 1,
    }, rows, unchanged);
    expect(line.unitPrice).toBe(129);
    expect(sellPriceForTier(rows[0], unchanged, "contractor")).toBe(129);
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

describe("viewer role gate", () => {
  it("leaves a non-contractor viewer's settings and prices unchanged", () => {
    for (const role of ["homeowner", "admin", "affiliate", "wholesale"]) {
      expect(attachAffiliateContractorCost(siteSettings, role, storeCost)).toBe(siteSettings);
    }
    const contractorSettings = attachAffiliateContractorCost(siteSettings, "contractor", storeCost);
    const row = { yourCost: 100, listPrice: 250, category: "Base" };
    expect(sellPriceForTier(row, siteSettings, "homeowner")).toBe(158);
    expect(sellPriceForTier(row, contractorSettings, "homeowner")).toBe(158);
    expect(sellPriceForTier(row, siteSettings, "wholesale")).toBe(125);
    expect(sellPriceForTier(row, contractorSettings, "wholesale")).toBe(125);
    expect(sellPriceForTier(row, siteSettings, "contractor")).toBe(129);
    expect(contractorSettings.contractorMarkupBps).toBe(siteSettings.contractorMarkupBps);
  });
});
