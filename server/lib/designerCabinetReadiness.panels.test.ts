import { describe, expect, it } from "vitest";
import { designerCabinetReadinessBySku, designerMasterReadinessByCode } from "./designerCabinetReadiness";

const panelMasters = [
  {
    masterCode: "BP2496",
    isActive: true,
    showInDesigner: true,
    designerEligible: true,
    conflictStatus: "ok",
    description: "Base Panel — 24\" W x 96\" H x 3/4\" D",
    category: "Panels",
    subCategory: "Panels",
    placementType: null,
    numberOfDoors: 0,
    numberOfDrawers: 0,
  },
  {
    masterCode: "BEP(DWR)3",
    isActive: true,
    showInDesigner: true,
    designerEligible: true,
    conflictStatus: "ok",
    description: "Dishwasher Return Panel",
    category: "Panels",
    subCategory: "Panels",
    placementType: null,
    numberOfDoors: 0,
    numberOfDrawers: 0,
  },
  {
    masterCode: "B24",
    isActive: true,
    showInDesigner: true,
    designerEligible: true,
    conflictStatus: "ok",
    description: "24\" Base Cabinet",
    category: "Base",
    subCategory: "Standard Base",
    placementType: "base",
    numberOfDoors: 2,
    numberOfDrawers: 0,
  },
];

const sku = (over: Partial<Parameters<typeof designerCabinetReadinessBySku>[0][number]> & { skuId: number; sourceMasterCode: string }) => ({
  isAvailable: true,
  isPublished: true,
  listPrice: "100",
  yourCost: null,
  sourceConflictStatus: "ok",
  ...over,
});

describe("designer readiness names the Designer surface", () => {
  it("reports BP and DWR panels as Panels-tab items, not base boxes", () => {
    const readiness = designerCabinetReadinessBySku(
      [sku({ skuId: 1, sourceMasterCode: "BP2496" }), sku({ skuId: 2, sourceMasterCode: "BEP(DWR)3" })],
      [],
      panelMasters,
    );
    expect(readiness.get(1)).toEqual({ isCompliant: true, reason: null, canonicalMasterCode: "BP2496", designerSurface: "panels" });
    expect(readiness.get(2)).toEqual({ isCompliant: true, reason: null, canonicalMasterCode: "BEP(DWR)3", designerSurface: "panels" });
  });

  it("keeps ordinary cabinets on their own tab", () => {
    const readiness = designerCabinetReadinessBySku([sku({ skuId: 3, sourceMasterCode: "B24" })], [], panelMasters);
    expect(readiness.get(3)).toMatchObject({ isCompliant: true, designerSurface: "base" });
  });

  it("names the missing-price reason that makes the Designer hide a panel", () => {
    const readiness = designerCabinetReadinessBySku(
      [
        // No positive price for this style/distributor — the palette drops it.
        sku({ skuId: 1, sourceMasterCode: "BP2496", listPrice: null, yourCost: "0" }),
        // Price present but the supplier row is unpublished.
        sku({ skuId: 2, sourceMasterCode: "BEP(DWR)3", isPublished: false }),
      ],
      [],
      panelMasters,
    );
    expect(readiness.get(1)).toMatchObject({
      isCompliant: false,
      reason: "positive source price is missing",
      canonicalMasterCode: "BP2496",
      designerSurface: "panels",
    });
    expect(readiness.get(2)).toMatchObject({
      isCompliant: false,
      reason: "supplier SKU is not published",
      designerSurface: "panels",
    });
  });
});

describe("designerMasterReadinessByCode collapses SKUs per Cabinet Config row", () => {
  it("stays ready when any one SKU for the style is orderable", () => {
    const byMaster = designerMasterReadinessByCode(
      [
        sku({ skuId: 1, sourceMasterCode: "BP2496", listPrice: null, yourCost: "0", sourceStyleId: 10 }),
        sku({ skuId: 2, sourceMasterCode: "BP2496", sourceStyleId: 11 }),
      ],
      [],
      panelMasters,
    );
    expect(byMaster.get("BP2496")).toMatchObject({
      isCompliant: true,
      reason: null,
      designerSurface: "panels",
      skuCount: 2,
      compliantSkuCount: 1,
    });
  });

  it("carries the first exclusion reason and the surface so Cabinet Config can explain the hide", () => {
    const byMaster = designerMasterReadinessByCode(
      [sku({ skuId: 1, sourceMasterCode: "BEP(DWR)3", isAvailable: false })],
      [],
      panelMasters,
    );
    expect(byMaster.get("BEP(DWR)3")).toMatchObject({
      isCompliant: false,
      reason: "supplier SKU is unavailable",
      designerSurface: "panels",
      skuCount: 1,
      compliantSkuCount: 0,
    });
  });

  it("follows an approved alias so a priced SKU filed under DWR3 makes BEP(DWR)3 ready", () => {
    const byMaster = designerMasterReadinessByCode(
      [sku({ skuId: 1, sourceMasterCode: "DWR3" })],
      [{ aliasCode: "DWR3", masterCode: "BEP(DWR)3" }],
      panelMasters,
    );
    expect(byMaster.get("BEP(DWR)3")).toMatchObject({
      isCompliant: true,
      designerSurface: "panels",
    });
  });
});
