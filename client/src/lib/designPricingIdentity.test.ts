import { describe, expect, it } from "vitest";
import { activeCatalogPricingIdsByMasterCode, currentCatalogPricingCabinetId } from "./designPricingIdentity";

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

  it("keeps the persisted ID when duplicate active records share a master code", () => {
    const identities = activeCatalogPricingIdsByMasterCode([
      { id: 101, masterCode: "SB-33" },
      { id: 202, masterCode: "SB-33" },
    ]);
    expect(identities.get("SB-33")).toBeNull();
    expect(currentCatalogPricingCabinetId({ cabinetId: 17, masterCode: "SB-33" }, identities)).toBe(17);
  });
});
