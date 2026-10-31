import { describe, expect, it } from "vitest";
import {
  GO_LIVE_TERMS_VERSION,
  PREVIEW_BADGE_TEXT,
  buildGoLiveTerms,
  canSeePreviewSuppliers,
  isPreviewSupplier,
} from "./distributorPreview";

const terms = (overrides: Partial<Parameters<typeof buildGoLiveTerms>[0]> = {}) =>
  buildGoLiveTerms({
    code: "DL",
    name: "DL Cabinetry",
    costMultiplier: "1.0000",
    baseMultiplier: "1.0000",
    freightMultiplier: "0.0000",
    retailPriceBasis: "cost_plus_tier",
    shippingRuleMode: "live",
    warehouseZips: ["32256", "78754", "37086", "70126", "32822", "33634"],
    leadTimeDays: 7,
    pendingSkuCount: 200,
    doorStyleCount: 15,
    ...overrides,
  });

describe("admin preview visibility", () => {
  it("shows preview suppliers only to the admin role, never to anyone else", () => {
    expect(canSeePreviewSuppliers({ role: "admin" })).toBe(true);
    for (const role of ["user", "affiliate", "contractor", "distributor", "homeowner", null, undefined, ""]) {
      expect(canSeePreviewSuppliers({ role })).toBe(false);
    }
    expect(canSeePreviewSuppliers(null)).toBe(false);
    expect(canSeePreviewSuppliers(undefined)).toBe(false);
  });

  it("treats exactly the offline suppliers as preview, whichever supplier it is", () => {
    expect(isPreviewSupplier({ isActive: false })).toBe(true);
    expect(isPreviewSupplier({ isActive: true })).toBe(false);
    expect(isPreviewSupplier({ isActive: null })).toBe(false);
    expect(isPreviewSupplier({ isActive: undefined })).toBe(false);
  });

  it("uses one badge text for every preview supplier", () => {
    expect(PREVIEW_BADGE_TEXT).toBe("ADMIN PREVIEW — not live");
  });
});

describe("go live terms", () => {
  it("is built from the saved configuration for any supplier", () => {
    const dl = terms();
    expect(dl.version).toBe(GO_LIVE_TERMS_VERSION);
    expect(dl.supplier).toEqual({ code: "DL", name: "DL Cabinetry" });
    expect(dl.lines.join("\n")).toContain("32256, 78754, 37086, 70126, 32822, 33634");
    expect(dl.lines.join("\n")).toContain("publishes 200 pending SKU(s) and activates 15 door style(s)");
    expect(dl.acceptance).toMatch(/^I accept/);

    const other = terms({ code: "XYZ", name: "Another Supplier", warehouseZips: ["60601"], pendingSkuCount: 12, doorStyleCount: 3, costMultiplier: 0.2461, baseMultiplier: 0.23, freightMultiplier: 0.07 });
    expect(other.supplier.code).toBe("XYZ");
    expect(other.lines.join("\n")).toContain("60601");
    expect(other.lines.join("\n")).toContain("publishes 12 pending SKU(s)");
    expect(other.warnings).toEqual([]);
  });

  it("warns about placeholder multipliers, an inconsistent cost multiplier, missing origins and nothing to publish", () => {
    expect(terms().warnings.join("\n")).toContain("placeholders");
    expect(terms({ costMultiplier: 0.3, baseMultiplier: 0.23, freightMultiplier: 0.07 }).warnings.join("\n")).toContain("does not equal");
    expect(terms({ warehouseZips: [] }).warnings.join("\n")).toContain("No freight origin ZIPs");
    expect(terms({ warehouseZips: null }).warnings.join("\n")).toContain("No freight origin ZIPs");
    expect(terms({ pendingSkuCount: 0 }).warnings.join("\n")).toContain("no pending SKUs");
  });
});
