import { describe, expect, it } from "vitest";
import { wallPlacementAt, type DesignCabinet, type PlacedCabinet, type RoomData } from "./design";
import { buildMandatoryFourAnchorRefrigeratorBay } from "./fourAnchorRefrigeratorBay";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };

function source(overrides: Partial<DesignCabinet>): DesignCabinet {
  return {
    id: 1,
    masterCode: "W3624",
    description: "36 inch Refrigerator Wall Cabinet",
    category: "Wall",
    subCategory: "Refrigerator Cabinet",
    width: "36",
    height: "24",
    depth: "24",
    placement: "wall",
    numberOfDoors: 2,
    numberOfDrawers: 0,
    isCornerCabinet: false,
    ...overrides,
  };
}

function refrigerator(): PlacedCabinet {
  const spot = wallPlacementAt(48, 36, 30, "top", room);
  return {
    uid: "fridge-36",
    cabinetId: 100,
    masterCode: "FRIDGE-36",
    description: '36″ Refrigerator',
    category: "Appliance",
    subCategory: "Refrigerator",
    placement: "appliance",
    applianceRole: "base-height",
    ...spot,
    width: 36,
    depth: 30,
    height: 70,
    rotation: spot.rotation,
  };
}

describe("mandatory Four-anchor refrigerator bay", () => {
  it("creates exactly two source-priced panels and a matching 36-inch cabinet above with no filler", () => {
    const result = buildMandatoryFourAnchorRefrigeratorBay({
      refrigerator: refrigerator(),
      room,
      caps: [source({ id: 200, masterCode: "W3624", width: "36", height: "24", depth: "24" })],
      endPanels: [source({ id: 201, masterCode: "REP2496", description: "Refrigerator End Panel", category: "Panel", subCategory: "Refrigerator End Panel", width: "0.75", height: "96", depth: "24", placement: "tall", numberOfDoors: 0 })],
      styleId: 9,
      makeUid: (() => { let index = 0; return () => `bay-${++index}`; })(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.additions.map((item) => item.refrigeratorAssemblyRole)).toEqual(["bridge", "left-panel", "right-panel"]);
    expect(result.additions.map((item) => item.masterCode)).toEqual(["W3624", "REP2496", "REP2496"]);
    expect(result.additions.some((item) => /filler/i.test(item.masterCode) || /filler/i.test(item.refrigeratorAssemblyRole ?? ""))).toBe(false);
    expect(result.reservation).toMatchObject({ wall: "top", start: 46.75, end: 85.25 });
  });

  it("uses a source-priced sheet panel when the catalog stores its thin face in depth", () => {
    const result = buildMandatoryFourAnchorRefrigeratorBay({
      refrigerator: refrigerator(),
      room,
      caps: [source({ id: 200, masterCode: "W3624", width: "36", height: "24", depth: "24" })],
      // This real S2496 sheet-panel representation stores its 24-inch installed
      // depth in width and its 3/4-inch thickness in depth. The Four-anchor bay
      // must not call the exact source-priced panel missing.
      endPanels: [source({ id: 201, masterCode: "S2496", description: "Tall Panel — 24 in. W × 96 in. H × 3/4 in. D", category: "Tall", subCategory: "Tall Panels", width: "24", height: "96", depth: "0.75", placement: "tall", numberOfDoors: 0 })],
      styleId: 9,
      makeUid: (() => { let index = 0; return () => `sheet-panel-${++index}`; })(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const panels = result.additions.filter((item) => item.refrigeratorAssemblyRole?.endsWith("panel"));
    expect(panels).toHaveLength(2);
    expect(panels).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "S2496", width: 0.75, depth: 24 }),
    ]));
  });

  it("rejects a Four-anchor refrigerator width other than the mandatory 36-inch bay", () => {
    const result = buildMandatoryFourAnchorRefrigeratorBay({
      refrigerator: { ...refrigerator(), masterCode: "FRIDGE-33", width: 33 },
      room,
      caps: [source({ id: 200 })],
      endPanels: [source({ id: 201, masterCode: "REP2496", category: "Panel", subCategory: "Refrigerator End Panel", width: "0.75", height: "96", depth: "24", placement: "tall", numberOfDoors: 0 })],
      styleId: 9,
      makeUid: () => "unused",
    });

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("36") });
  });
});
