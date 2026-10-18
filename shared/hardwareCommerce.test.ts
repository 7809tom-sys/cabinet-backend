import { describe, expect, it } from "vitest";
import {
  hardwareAffiliateCommissionCents,
  hardwareCheckoutEligibility,
  hardwareProfileIsComplete,
  hardwareRetailCents,
} from "./hardwareCommerce";

const completeProfile = {
  enabled: true,
  originZip: "30303",
  packageLengthIn: "18.00",
  packageWidthIn: "12.00",
  packageHeightIn: "8.00",
  packageWeightLbs: "20.00",
  maxUnitsPerPackage: 40,
  standaloneShippingCents: 1895,
  sourceReference: "Hardware Resources approved rate sheet 2026-10-17",
};

describe("Hardware Resources commerce policy", () => {
  it("uses supplier list as default retail and allows an affiliate to add, not subtract, markup", () => {
    expect(hardwareRetailCents("9.80", 0)).toBe(980);
    expect(hardwareRetailCents("9.80", 2_500)).toBe(1_225);
    expect(hardwareRetailCents("9.80", -500)).toBe(980);
    expect(hardwareRetailCents(null, 0)).toBeNull();
  });

  it("pays the approved 25% only on hardware merchandise, never standalone shipping", () => {
    expect(hardwareAffiliateCommissionCents(1_225)).toBe(306);
    expect(hardwareAffiliateCommissionCents(1_225 + 1_895)).toBe(780);
    // Callers pass the merchandise subtotal only, so $18.95 shipping never enters this calculation.
    expect(hardwareAffiliateCommissionCents(1_225)).not.toBe(780);
  });

  it("keeps checkout disabled until every verified one-package shipping fact is stored", () => {
    expect(hardwareProfileIsComplete(completeProfile)).toBe(true);
    expect(hardwareProfileIsComplete({ ...completeProfile, sourceReference: "" })).toBe(false);
    expect(hardwareProfileIsComplete({ ...completeProfile, enabled: false })).toBe(false);
  });

  it("applies free hardware shipping with qualifying kitchen merchandise even before a standalone profile exists", () => {
    expect(hardwareCheckoutEligibility({ profile: null, hardwareUnits: 56, containsKitchenMerchandise: true }))
      .toMatchObject({ eligible: true, shippingCents: 0, promotionApplied: true });
    expect(hardwareCheckoutEligibility({ profile: { ...completeProfile, enabled: false }, hardwareUnits: 56, containsKitchenMerchandise: true }))
      .toMatchObject({ eligible: true, shippingCents: 0, promotionApplied: true });
    expect(hardwareCheckoutEligibility({ profile: null, hardwareUnits: 2, containsKitchenMerchandise: false }))
      .toMatchObject({ eligible: false, promotionApplied: false });
    expect(hardwareCheckoutEligibility({ profile: completeProfile, hardwareUnits: 2, containsKitchenMerchandise: false }))
      .toMatchObject({ eligible: true, shippingCents: 1_895, promotionApplied: false });
    expect(hardwareCheckoutEligibility({ profile: completeProfile, hardwareUnits: 41, containsKitchenMerchandise: true }))
      .toMatchObject({ eligible: true, shippingCents: 0, promotionApplied: true });
    expect(hardwareCheckoutEligibility({ profile: completeProfile, hardwareUnits: 41, containsKitchenMerchandise: false }))
      .toMatchObject({ eligible: false, promotionApplied: false });
  });
});
