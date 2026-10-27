import { describe, expect, it } from "vitest";
import { designerCabinetReadinessBySku } from "./designerCabinetReadiness";

const masters = [
  { masterCode: "B-24", isActive: true, showInDesigner: true, designerEligible: true, conflictStatus: "ok" },
  { masterCode: "W-30", isActive: true, showInDesigner: false, designerEligible: true, conflictStatus: "ok" },
  { masterCode: "B-18", isActive: true, showInDesigner: true, designerEligible: false, conflictStatus: "ok" },
];

describe("designerCabinetReadinessBySku", () => {
  it("uses the same approved alias and canonical master gate as the Designer palette", () => {
    const readiness = designerCabinetReadinessBySku(
      [{
        skuId: 1,
        sourceMasterCode: "B24",
        isAvailable: true,
        isPublished: true,
        listPrice: "100",
        yourCost: null,
        sourceConflictStatus: "ok",
      }],
      [{ aliasCode: "B24", masterCode: "B-24" }],
      masters,
    );

    expect(readiness.get(1)).toEqual({
      isCompliant: true,
      reason: null,
      canonicalMasterCode: "B-24",
    });
  });

  it("explains every noncompliant source SKU without guessing a cabinet replacement", () => {
    const readiness = designerCabinetReadinessBySku(
      [
        { skuId: 1, sourceMasterCode: "B-24", isAvailable: false, isPublished: true, listPrice: "100", yourCost: null, sourceConflictStatus: "ok" },
        { skuId: 2, sourceMasterCode: "W-30", isAvailable: true, isPublished: true, listPrice: "100", yourCost: null, sourceConflictStatus: "ok" },
        { skuId: 3, sourceMasterCode: "UNKNOWN", isAvailable: true, isPublished: true, listPrice: "100", yourCost: null, sourceConflictStatus: "ok" },
        { skuId: 4, sourceMasterCode: "B-24", isAvailable: true, isPublished: true, listPrice: null, yourCost: "0", sourceConflictStatus: "ok" },
        { skuId: 5, sourceMasterCode: "B-18", isAvailable: true, isPublished: true, listPrice: "80", yourCost: null, sourceConflictStatus: "ok" },
      ],
      [],
      masters,
    );

    expect(readiness.get(1)).toMatchObject({ isCompliant: false, reason: "supplier SKU is unavailable", canonicalMasterCode: "B-24" });
    expect(readiness.get(2)).toMatchObject({ isCompliant: false, reason: "canonical cabinet is not enabled for Designer", canonicalMasterCode: "W-30" });
    expect(readiness.get(3)).toMatchObject({ isCompliant: false, reason: "no approved canonical cabinet master", canonicalMasterCode: null });
    expect(readiness.get(4)).toMatchObject({ isCompliant: false, reason: "positive source price is missing", canonicalMasterCode: "B-24" });
    expect(readiness.get(5)).toMatchObject({ isCompliant: false, reason: "canonical cabinet is not eligible for the 3D Designer", canonicalMasterCode: "B-18" });
  });
});
