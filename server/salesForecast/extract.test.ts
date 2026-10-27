import { describe, expect, it } from "vitest";
import { countertopArea, toeKickLinearInches, trimPiecesNeeded, type PlacedCabinet } from "../../client/src/lib/design";
import { crownTakeoffFromExposedSegments } from "../../client/src/lib/crownTakeoff";
import { countertopSlabSquareFeet } from "../../client/src/lib/surfaceCartLines";
import { distributorScope, PELICAN_SCOPE } from "../../shared/vendorFulfillment";
import { extractDesignLines, type StyleFact } from "./extract";

function base(uid: string, x: number, extra: Partial<PlacedCabinet> = {}): PlacedCabinet {
  return {
    uid,
    cabinetId: 1,
    masterCode: "B24",
    description: "Base 24",
    placement: "base",
    x,
    y: 0,
    width: 24,
    depth: 24,
    height: 34.5,
    rotation: 0,
    ...extra,
  } as PlacedCabinet;
}

const styles = new Map<number, StyleFact>([
  [1, { id: 1, name: "White Shaker", doorStyle: "Shaker", color: "White", distributorId: 11 }],
  [2, { id: 2, name: "Grey Shaker", doorStyle: "Shaker", color: "Grey", distributorId: 22 }],
]);
const distributors = new Map([
  [11, { id: 11, name: "Line A", seriesName: "Series A" }],
  [22, { id: 22, name: "Line B", seriesName: "Series B" }],
]);

describe("forecast takeoff", () => {
  it("counts countertop slabs with the designer slab size", () => {
    const placed = [base("a", 0), base("b", 24), base("c", 48)];
    const area = countertopArea(placed, null);
    const slab = countertopSlabSquareFeet('126" x 63"');
    expect(slab).toBeCloseTo(55.125, 3);
    const lines = extractDesignLines({
      id: 5,
      selectedStyleId: 1,
      selectedDistributorId: 11,
      placedCabinets: placed,
      selectedSurfaces: [{ id: 9, name: "Calacatta", category: "Quartz Slab", size: '126" x 63"' }],
    }, {
      styles,
      distributors,
      skus: new Map(),
      pelican: new Map([[9, { id: 9, name: "Calacatta", category: "Quartz Slab", size: '126" x 63"', listPrice: 400, vendorWholesale: 200, categoryMarkupBps: 0 }]]),
    });
    const counter = lines.find((line) => line.sku === "PEL-9");
    expect(counter?.scope).toBe(PELICAN_SCOPE);
    expect(counter?.quantity).toBe(Math.ceil(area.squareFeet / slab!));
    expect(counter?.estimated).toBe(true);
    expect(counter?.note).toMatch(/sq ft/);
  });

  it("gives a filler the adjoining cabinet color and supplier", () => {
    const lines = extractDesignLines({
      id: 6,
      selectedStyleId: 1,
      selectedDistributorId: 11,
      placedCabinets: [
        { ...base("owner", 0), cabinetId: 3, styleId: 2, masterCode: "B24" },
        { ...base("fill", 24), uid: "fill", cabinetId: 4, masterCode: "F3", description: "Filler", width: 3, fillerForCabinetUid: "owner", styleId: 1 },
      ],
    }, { styles, distributors, skus: new Map(), pelican: new Map() });
    const filler = lines.find((line) => line.sku === "F3");
    expect(filler?.scope).toBe(distributorScope(22));
    expect(filler?.color).toBe("Grey");
  });

  it("keeps trim with the cabinet distributor and uses the 4 inch crown allowance", () => {
    const wall = { ...base("w", 0), placement: "wall" as const, width: 12, masterCode: "W1230" };
    const takeoff = crownTakeoffFromExposedSegments([
      { start: { x: 0, z: 0 }, end: { x: 12, z: 0 } },
      { start: { x: 12, z: 0 }, end: { x: 12, z: 12 } },
    ]);
    expect(takeoff.miterAllowanceInches).toBe(8);
    const lines = extractDesignLines({
      id: 7,
      selectedDistributorId: 11,
      selectedStyleId: 1,
      placedCabinets: [base("a", 0), wall],
      trimSettings: { crown: true, toeKick: true },
    }, { styles, distributors, skus: new Map(), pelican: new Map() });
    const crown = lines.find((line) => line.sku === "CROWN");
    expect(crown?.scope).toBe(distributorScope(11));
    expect(crown?.note).toMatch(/miter allowance/);
    const toe = lines.find((line) => line.sku === "TK-8");
    expect(toe?.quantity).toBe(trimPiecesNeeded(toeKickLinearInches([base("a", 0), wall] as PlacedCabinet[])).pieces);
  });

  it("does not infer crown when trim settings are absent, and still estimates toe kick", () => {
    const lines = extractDesignLines({
      id: 8,
      selectedDistributorId: 11,
      selectedStyleId: 1,
      placedCabinets: [base("a", 0), { ...base("w", 30), placement: "wall", masterCode: "W1230" }],
    }, { styles, distributors, skus: new Map(), pelican: new Map() });
    expect(lines.some((line) => line.sku === "CROWN")).toBe(false);
    expect(lines.some((line) => line.sku === "TK-8" && line.estimated)).toBe(true);
  });

  it("leaves a cabinet with no supplier unassigned", () => {
    const lines = extractDesignLines({
      id: 9,
      placedCabinets: [{ ...base("a", 0), styleId: null }],
    }, { styles, distributors, skus: new Map(), pelican: new Map() });
    expect(lines[0]?.scope).toBeNull();
    expect(lines[0]?.color).toBe("unspecified");
  });
});
