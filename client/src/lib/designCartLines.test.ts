import { describe, expect, it } from "vitest";
import { buildDesignCabinetCartLines, buildDesignPreviewPricingLines, bundleCabinetPricingSignature, calculateCartSubtotal, lockDesignCartLinesToPackageTotal } from "./designCartLines";
import { appendRefrigeratorEnclosurePlacements, CUSTOM_SIZE_FEE, type PlacedCabinet } from "@/lib/design";

const bec = {
  uid: "bec-one",
  cabinetId: 9450022,
  masterCode: "BEC-24",
  description: '24" Base End Angle Cabinet',
  category: "Base",
  placement: "base",
  x: 0,
  y: 0,
  width: 24,
  depth: 24,
  rotation: 0,
} as PlacedCabinet;

describe("designer cabinet cart lines", () => {
  it("preserves the verified BA-24 source unit price and total for BEC-24", () => {
    const verifiedAshfordPrice = 365.95;
    const lines = buildDesignCabinetCartLines({
      placed: [bec, { ...bec, uid: "bec-two", x: 24 }],
      styleId: 330001,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: () => verifiedAshfordPrice,
    });

    expect(lines).toEqual([
      expect.objectContaining({
        masterCode: "BEC-24",
        distributorId: 210001,
        styleId: 330001,
        unitPrice: verifiedAshfordPrice,
        qty: 2,
      }),
    ]);
    expect(calculateCartSubtotal(lines)).toBe(731.9);
  });

  it.each(["wholesale", "contractor", "homeowner"] as const)("marks every %s design line as price-locked at the designer-to-cart handoff", (tier) => {
    const lines = buildDesignCabinetCartLines({
      placed: [bec],
      styleId: 330001,
      distributorId: 210001,
      tier,
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: () => 365.95,
    });

    expect(lines).toEqual([
      expect.objectContaining({
        tier,
        unitPrice: 365.95,
        priceLocked: true,
      }),
    ]);
  });

  it("keeps visual-only appliance placements out of launch design commerce", () => {
    const visualRange = {
      uid: "range-one",
      cabinetId: 1,
      masterCode: "RANGE-30",
      description: '30" Visual Range',
      category: "Appliances",
      placement: "appliance",
      x: 24,
      y: 0,
      width: 30,
      depth: 25,
      rotation: 0,
      catalogImageUrl: "/manus-storage/original-range.webp",
    } as PlacedCabinet;
    const lines = buildDesignCabinetCartLines({
      placed: [bec, visualRange],
      styleId: 330001,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: () => 365.95,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ masterCode: "BEC-24", qty: 1 });
    expect(calculateCartSubtotal(lines)).toBe(365.95);
  });

  it("keeps B-18 on the cart and invoice handoff after a conflicting refrigerator panel is rejected", () => {
    const b18 = { ...bec, uid: "b18-fridge-neighbor", cabinetId: 1801, masterCode: "B-18", description: '18" Base Cabinet', width: 18 } as PlacedCabinet;
    const fridge = { ...bec, uid: "fridge-36", cabinetId: 3601, masterCode: "FRIDGE-36", description: '36" Refrigerator', placement: "appliance", x: 18, width: 36, depth: 30, height: 70 } as PlacedCabinet;
    const leftPanel = { ...bec, uid: "left-repv", cabinetId: 9601, masterCode: "REPV-96", description: "Refrigerator End Panel", placement: "tall", customProfile: "refrigerator-end-panel", x: 17.25, width: 0.75, depth: 30, height: 96 } as PlacedCabinet;
    const rightPanel = { ...leftPanel, uid: "right-repv", cabinetId: 9602, x: 54 } as PlacedCabinet;
    const enclosure = appendRefrigeratorEnclosurePlacements([b18, fridge], [leftPanel, rightPanel], fridge.uid);
    const lines = buildDesignCabinetCartLines({
      placed: enclosure.placed,
      styleId: 330001,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: () => 100,
    });

    expect(enclosure.rejected.map((item) => item.uid)).toEqual([leftPanel.uid]);
    expect(lines.map((line) => line.masterCode)).toEqual(["B-18", "REPV-96"]);
    expect(lines.find((line) => line.masterCode === "B-18")).toMatchObject({ qty: 1, unitPrice: 100, priceLocked: true });
    expect(lines.map((line) => line.masterCode)).not.toContain("FRIDGE-36");
  });

  it("locks loaded bundle lines to the verified package total without changing catalog source prices", () => {
    const secondCabinet = { ...bec, uid: "bec-other", masterCode: "B-30", description: '30" Base Cabinet', x: 24 } as PlacedCabinet;
    const lines = buildDesignCabinetCartLines({
      placed: [bec, secondCabinet],
      styleId: 330001,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: (cabinet) => cabinet.masterCode === "BEC-24" ? 7000 : 6000,
    });
    const locked = lockDesignCartLinesToPackageTotal(lines, 4116.84);
    expect(calculateCartSubtotal(locked)).toBe(4116.84);
    expect(locked.every((line) => line.priceLocked)).toBe(true);
    expect(bundleCabinetPricingSignature([bec, secondCabinet], 330001)).toBe(bundleCabinetPricingSignature([secondCabinet, bec], 330001));
  });

  it("keeps the 3D cabinet-design subtotal aligned with discounts and custom-size fees while excluding visual appliances", () => {
    const discountedBec = { ...bec, discountPct: -10 } as PlacedCabinet;
    const customBec = { ...bec, uid: "custom-bec", width: 25, nominalWidth: 24 } as PlacedCabinet;
    const visualRange = { ...bec, uid: "range-one", masterCode: "RANGE-30", placement: "appliance" } as PlacedCabinet;
    const lines = buildDesignPreviewPricingLines({
      placed: [discountedBec, customBec, visualRange],
      styleId: 330001,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: () => 100,
    });
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.masterCode)).not.toContain("RANGE-30");
    expect(calculateCartSubtotal(lines)).toBe(90 + 100 + CUSTOM_SIZE_FEE);
  });

  it("keeps an unpriced placed cabinet in the 3D order lines as a pending-price item", () => {
    const pendingSinkBase = {
      ...bec,
      uid: "sink-base-pending",
      masterCode: "SB-33",
      description: '33" Sink Base Cabinet',
    } as PlacedCabinet;
    const lines = buildDesignPreviewPricingLines({
      placed: [bec, pendingSinkBase],
      styleId: 330001,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: (cabinet) => cabinet.masterCode === "SB-33" ? null : 365.95,
    });

    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "SB-33", unitPrice: null, qty: 1 }),
    ]));
    expect(calculateCartSubtotal(lines)).toBe(365.95);
  });

  it("keeps the exact placed-cabinet UIDs on 3D preview price lines so a selected SB-33 reads its own price", () => {
    const pricedSinkBase = {
      ...bec,
      uid: "selected-sb-33",
      masterCode: "SB-33",
      description: '33" Sink Base Cabinet',
    } as PlacedCabinet;
    const lines = buildDesignPreviewPricingLines({
      placed: [pricedSinkBase],
      styleId: 330006,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330006, "Greek Villa"]]),
      unitPriceFor: () => 375.89,
    });

    expect(lines).toEqual([
      expect.objectContaining({
        masterCode: "SB-33",
        unitPrice: 375.89,
        placementUids: ["selected-sb-33"],
      }),
    ]);
  });

  it("keeps the exact Cinder Core Madison W-30-24 price identity aligned between 3D and cart/invoice lines", () => {
    const w3024 = {
      ...bec,
      uid: "placed-w-30-24",
      cabinetId: 9390138,
      masterCode: "W-30-24",
      description: '30" Double Door Wall Cabinet',
      category: "Wall",
      placement: "wall",
      width: 30,
      height: 24,
      depth: 12,
      styleId: 330022,
    } as PlacedCabinet;
    const exactHomeownerPrice = 298.49;
    const common = {
      placed: [w3024],
      styleId: 330022,
      distributorId: 210002,
      tier: "homeowner" as const,
      styleNameById: new Map([[330022, "Cinder Core (Madison)"]]),
      unitPriceFor: () => exactHomeownerPrice,
    };
    const cartLines = buildDesignCabinetCartLines(common);
    const previewLines = buildDesignPreviewPricingLines(common);

    expect(cartLines).toEqual([
      expect.objectContaining({
        masterCode: "W-30-24",
        styleId: 330022,
        styleLabel: "Cinder Core (Madison)",
        distributorId: 210002,
        tier: "homeowner",
        unitPrice: exactHomeownerPrice,
        priceLocked: true,
        qty: 1,
      }),
    ]);
    expect(previewLines).toEqual([
      expect.objectContaining({
        masterCode: "W-30-24",
        styleId: 330022,
        distributorId: 210002,
        tier: "homeowner",
        unitPrice: exactHomeownerPrice,
        placementUids: ["placed-w-30-24"],
      }),
    ]);
    expect(calculateCartSubtotal(cartLines)).toBe(calculateCartSubtotal(previewLines));
  });
});
