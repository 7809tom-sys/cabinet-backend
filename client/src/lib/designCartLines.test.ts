import { describe, expect, it } from "vitest";
import { buildDesignCabinetCartLines, buildDesignPreviewPricingLines, bundleCabinetPricingSignature, calculateCartSubtotal, lockDesignCartLinesToPackageTotal } from "./designCartLines";
import { CUSTOM_SIZE_FEE, type PlacedCabinet } from "@/lib/design";

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
});
