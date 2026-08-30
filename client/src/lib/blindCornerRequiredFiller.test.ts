import { describe, expect, it } from "vitest";
import {
  BLIND_CORNER_FILLER_WIDTH_IN,
  COUNTERTOP_DEPTH_IN,
  blindCornerRearCountertopExtensionIn,
  countertopSurfaces,
  hasCollision,
  placedFootprint,
  type PlacedCabinet,
  type RoomData,
} from "./design";
import { buildRequiredBlindCornerFiller, removePlacedCabinetWithRequiredBlindCornerFiller } from "./blindCornerRequiredFiller";

const room: RoomData = { width: 144, depth: 120 };
const fillerCatalog = [{
  id: 501,
  masterCode: "BF-3",
  description: '3" Base Filler',
  category: "Accessories & Trim",
  subCategory: "Filler",
  width: 3,
  height: 34.5,
  depth: null,
  catalogImageUrl: null,
}];

function bbc(patch: Partial<PlacedCabinet> = {}): PlacedCabinet {
  return {
    uid: "bbc",
    cabinetId: 36,
    masterCode: "BBC-36",
    description: '36" Blind Corner Base Cabinet',
    placement: "base",
    x: 0,
    y: 0,
    width: 36,
    height: 34.5,
    depth: 24,
    rotation: 0,
    numberOfDoors: 1,
    numberOfDrawers: 1,
    swing: "right",
    pullMin: 3,
    pullMax: 6,
    blindPull: 3,
    ...patch,
  };
}

describe("mandatory BBC filler", () => {
	  it.each([
	    ["top-left", bbc({ x: 0, y: 3, rotation: 0 }), 0, 27, 90, "left"],
	    ["top-right", bbc({ x: 108, y: 3, rotation: 0, swing: "left" }), 120, 27, 90, "left"],
	    ["bottom-left", bbc({ x: 0, y: 93, rotation: 0 }), 0, 90, 90, "right"],
	    ["bottom-right", bbc({ x: 108, y: 93, rotation: 0, swing: "left" }), 120, 90, 90, "right"],
	    ["left-top", bbc({ x: 3, y: 0, rotation: 90 }), 27, 0, 0, "left"],
	    ["left-bottom", bbc({ x: 3, y: 84, rotation: 90, swing: "left" }), 27, 96, 0, "left"],
	    ["right-top", bbc({ x: 117, y: 0, rotation: 90, swing: "left" }), 114, 0, 0, "right"],
	    ["right-bottom", bbc({ x: 117, y: 84, rotation: 90 }), 114, 96, 0, "right"],
	  ] as const)("places a catalog-backed three-inch filler on the perpendicular adjoining run at %s", (_label, cabinet, x, y, rotation, fillerPlacementMode) => {
    const result = buildRequiredBlindCornerFiller(cabinet, room, fillerCatalog, () => "required-filler", 330011);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filler).toMatchObject({
      uid: "required-filler",
      cabinetId: 501,
      masterCode: "BF-3",
      x,
      y,
      rotation,
      width: BLIND_CORNER_FILLER_WIDTH_IN,
      depth: 24,
      height: 34.5,
	      styleId: 330011,
	      fillerPlacementMode,
      fillerPieceGroupId: "bbc-required-filler-bbc",
      fillerTotalWidth: 3,
    });
  });

  it("refuses to invent a filler when the selected line has no sellable three-inch source item", () => {
    expect(buildRequiredBlindCornerFiller(bbc(), room, [], () => "none", 330011)).toEqual({
      ok: false,
      reason: "missing-catalog-filler",
    });
  });

	  it.each(["BBC-42", "BBC-48"])("applies the same required filler rule to %s", (masterCode) => {
	    const width = Number(masterCode.split("-")[1]);
	    const cabinet = bbc({ uid: masterCode.toLowerCase(), masterCode, width, nominalWidth: width, x: 0, y: 3 });
	    const result = buildRequiredBlindCornerFiller(cabinet, room, fillerCatalog, () => `${masterCode}-filler`, 330011);
	    expect(result.ok).toBe(true);
	    if (!result.ok) return;
	    expect(result.filler).toMatchObject({ x: 0, y: 27, width: 3, depth: 24, cabinetId: 501, masterCode: "BF-3" });
	  });

  it("fills exactly between the BBC open front and the adjoining cabinet with edge contact and zero physical overlap", () => {
    const cabinet = bbc({ x: 0, y: 3, rotation: 0 });
    const result = buildRequiredBlindCornerFiller(cabinet, room, fillerCatalog, () => "between", 330011);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const adjoining = bbc({
      uid: "neighbor",
      cabinetId: 18,
      masterCode: "B-18",
      description: '18" Base Cabinet',
      x: 0,
      y: 30,
      width: 18,
      rotation: 90,
      numberOfDrawers: 0,
      pullMin: null,
      pullMax: null,
      blindPull: null,
    });
    expect(result.filler.y).toBe(cabinet.y + 24);
    expect(adjoining.y).toBe(result.filler.y + BLIND_CORNER_FILLER_WIDTH_IN);
	    expect(placedFootprint(cabinet)).toEqual({ w: 36, d: 24 });
	    expect(placedFootprint(result.filler)).toEqual({ w: 24, d: 3 });
	    expect(placedFootprint(adjoining)).toEqual({ w: 24, d: 18 });
	    expect(hasCollision(result.filler, [cabinet])).toBe(false);
	    expect(hasCollision(result.filler, [adjoining])).toBe(false);
    expect(hasCollision({ ...adjoining, y: 29 }, [result.filler])).toBe(true);
  });

	  it("removes the BBC and its mandatory filler together when either member is deleted", () => {
	    const cabinet = bbc({ uid: "assembly", x: 0, y: 3 });
	    const required = buildRequiredBlindCornerFiller(cabinet, room, fillerCatalog, () => "assembly-filler", 330011);
	    expect(required.ok).toBe(true);
	    if (!required.ok) return;
	    const neighbor = bbc({ uid: "keep", masterCode: "B-18", description: '18" Base Cabinet', width: 18, x: 60 });
	    const assembly = [cabinet, required.filler, neighbor];
	    expect(removePlacedCabinetWithRequiredBlindCornerFiller(assembly, cabinet.uid)).toEqual([neighbor]);
	    expect(removePlacedCabinetWithRequiredBlindCornerFiller(assembly, required.filler.uid)).toEqual([neighbor]);
	  });

	  it("survives saved-design JSON round-trip with catalog and billing identity intact", () => {
	    const cabinet = bbc({ uid: "saved-bbc", x: 0, y: 3, styleId: 330011 });
	    const required = buildRequiredBlindCornerFiller(cabinet, room, fillerCatalog, () => "saved-bbc-filler", 330011);
	    expect(required.ok).toBe(true);
	    if (!required.ok) return;
	    const restored = JSON.parse(JSON.stringify([cabinet, required.filler])) as PlacedCabinet[];
	    expect(restored[1]).toMatchObject({
	      uid: "saved-bbc-filler",
	      cabinetId: 501,
	      masterCode: "BF-3",
	      styleId: 330011,
	      fillerBillingRole: "primary",
	      fillerPieceGroupId: "bbc-required-filler-saved-bbc",
	      fillerTotalWidth: 3,
	      width: 3,
	      depth: 24,
	    });
	  });
});

describe("pulled BBC countertop wall coverage", () => {
  it.each([
    ["top", bbc({ x: 0, y: 3, rotation: 0 }), { x: 0, y: 0, width: 36, depth: COUNTERTOP_DEPTH_IN + 3 }],
    ["bottom", bbc({ x: 0, y: 93, rotation: 0 }), { x: 0, y: 120 - COUNTERTOP_DEPTH_IN - 3, width: 36, depth: COUNTERTOP_DEPTH_IN + 3 }],
    ["left", bbc({ x: 3, y: 0, rotation: 90 }), { x: 0, y: 0, width: COUNTERTOP_DEPTH_IN + 3, depth: 36 }],
    ["right", bbc({ x: 117, y: 0, rotation: 90 }), { x: 144 - COUNTERTOP_DEPTH_IN - 3, y: 0, width: COUNTERTOP_DEPTH_IN + 3, depth: 36 }],
  ])("extends the countertop back to the %s wall while leaving the cabinet body pulled three inches", (_label, cabinet, expected) => {
    expect(blindCornerRearCountertopExtensionIn(cabinet, room)).toBe(3);
    expect(countertopSurfaces([cabinet], room)[0]).toMatchObject(expected);
  });

	  it.each([
	    ["top", bbc({ x: 0, y: 6, rotation: 0, blindPull: 6 }), { y: 0, depth: COUNTERTOP_DEPTH_IN + 6 }],
	    ["right", bbc({ x: 114, y: 0, rotation: 90, blindPull: 6 }), { x: 144 - COUNTERTOP_DEPTH_IN - 6, width: COUNTERTOP_DEPTH_IN + 6 }],
	  ])("covers the maximum six-inch rear pull at the %s wall", (_label, cabinet, expected) => {
	    expect(blindCornerRearCountertopExtensionIn(cabinet, room)).toBe(6);
	    expect(countertopSurfaces([cabinet], room)[0]).toMatchObject(expected);
	  });
});
