import { describe, expect, it } from "vitest";
import { pricedFunctionalAlternatives, type PlanSwitchSourceCabinet, type PricedPlanSwitchCandidate } from "./planSwitchPricingAlternatives";

const source: PlanSwitchSourceCabinet = {
  cabinetId: 1,
  masterCode: "B-36-2D",
  description: "36 inch two-door base cabinet",
  category: "Base",
  subCategory: "Base Cabinet",
  placementType: "base",
  width: 36,
  height: 34.5,
  depth: 24,
  numberOfDoors: 2,
  numberOfDrawers: 0,
  isCornerCabinet: false,
};

describe("pricedFunctionalAlternatives", () => {
  it("offers a priced three-door base cabinet with the same installed fit and labels the door-count change", () => {
    const alternatives = pricedFunctionalAlternatives(source, [{
      ...source,
      cabinetId: 2,
      masterCode: "B-36-3D",
      description: "36 inch three-door base cabinet",
      numberOfDoors: 3,
      customerPrice: 412.5,
    }]);

    expect(alternatives).toHaveLength(1);
    expect(alternatives[0]).toMatchObject({ masterCode: "B-36-3D", matchKind: "exact_function", doorCountChanged: true });
    expect(alternatives[0].explanation).toContain("2-door to 3-door");
  });

  it("does not suggest a different physical footprint for a standard base cabinet", () => {
    const alternatives = pricedFunctionalAlternatives(source, [{
      ...source,
      cabinetId: 2,
      masterCode: "B-33-3D",
      width: 33,
      numberOfDoors: 3,
      customerPrice: 392,
    }]);

    expect(alternatives).toEqual([]);
  });

  it("offers a verified shelf-corner alternative for an unpriced Lazy Susan without expanding its footprint", () => {
    const lazySusan: PlanSwitchSourceCabinet = {
      ...source,
      cabinetId: 5,
      masterCode: "LS3612",
      category: "Corner",
      subCategory: "Easy Reach",
      width: 36,
      depth: 36,
      numberOfDoors: 1,
    };
    const alternatives = pricedFunctionalAlternatives(lazySusan, [{
      ...source,
      cabinetId: 6,
      masterCode: "BER36",
      description: "36 inch Base Easy Reach Cabinet",
      category: "Base",
      subCategory: "Lazy Susan / Easy Reach",
      width: 36,
      height: 34.5,
      depth: 24,
      numberOfDoors: 1,
      customerPrice: 520,
    }]);

    expect(alternatives).toHaveLength(1);
    expect(alternatives[0]).toMatchObject({ masterCode: "BER36", matchKind: "corner_equivalent" });
    expect(alternatives[0].explanation).toContain("shelf-corner");
  });
});
