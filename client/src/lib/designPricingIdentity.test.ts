import { describe, expect, it } from "vitest";
import { currentCatalogPricingCabinetId } from "./designPricingIdentity";

describe("currentCatalogPricingCabinetId", () => {
  it("uses the active catalog record with the exact saved master code", () => {
    expect(currentCatalogPricingCabinetId(
      { cabinetId: 1001, masterCode: "SB-33" },
      new Map([["SB-33", 9390063]]),
    )).toBe(9390063);
  });

  it("keeps the saved cabinet identity when no exact active master-code match exists", () => {
    expect(currentCatalogPricingCabinetId(
      { cabinetId: 1001, masterCode: "SB-33" },
      new Map([["SB-36", 9390099]]),
    )).toBe(1001);
  });
});
