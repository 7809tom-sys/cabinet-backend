import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM, appendCollisionFreePlacements, cabinetPlacementCollisionDetail, type PlacedCabinet, wallLength, wallPlacementAt } from "@/lib/design";
import { buildDesignCabinetCartLines, buildDesignPreviewPricingLines } from "@/lib/designCartLines";
import { automaticAngledWallFiller, angledWallTransitionFootprint, measuredAngledWallTransition } from "./angledWallFiller";

const room = {
  ...DEFAULT_ROOM,
  width: 180,
  depth: 180,
  vertices: [
    { id: "v1", x: 0, y: 0 },
    { id: "v2", x: 60, y: 60 },
    { id: "v3", x: 60, y: 180 },
    { id: "v4", x: 0, y: 180 },
  ],
  customWalls: [
    { id: "diagonal", startVertexId: "v1", endVertexId: "v2", lockedAngle: 45 as const },
    { id: "straight", startVertexId: "v2", endVertexId: "v3" },
    { id: "return", startVertexId: "v3", endVertexId: "v4" },
    { id: "close", startVertexId: "v4", endVertexId: "v1" },
  ],
};

function cabinet(uid: string, wallId: string, offset: number, placement: "wall" | "base" = "wall", width = 24): PlacedCabinet {
  const depth = placement === "wall" ? 12 : 24;
  const height = placement === "wall" ? 42 : 34.5;
  const spot = wallPlacementAt(offset, width, depth, wallId as any, room);
  return {
    uid,
    cabinetId: 10,
    masterCode: placement === "wall" ? "W-2442" : "B-24",
    description: placement === "wall" ? '24" x 42" Wall Cabinet' : '24" Base Cabinet',
    placement,
    x: spot.x,
    y: spot.y,
    width,
    depth,
    height,
    rotation: spot.rotation,
    wallId,
    wallOffset: spot.wallOffset,
    mountBottom: placement === "wall" ? 54 : 0,
    numberOfDoors: 2,
    numberOfDrawers: placement === "wall" ? 0 : 1,
  };
}

const wallFiller = {
  id: 99,
  masterCode: "WF1242",
  description: '12" x 42" Wall Filler',
  category: "Filler",
  subCategory: "Filler",
  width: "12",
  height: "42",
  depth: "12",
  catalogImageUrl: null,
};

const baseFiller = {
  id: 199,
  masterCode: "BF-12",
  description: '12" x 34.5" Base Filler',
  category: "Filler",
  subCategory: "Filler",
  width: "12",
  height: "34.5",
  depth: "24",
  catalogImageUrl: null,
};

function polygonArea(points: Array<{ x: number; y: number }>) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function pair(placement: "wall" | "base") {
  const diagonalLength = wallLength("diagonal" as any, room);
  const neighbor = cabinet(`${placement}-neighbor`, "diagonal", diagonalLength - 24, placement);
  const newlyPlaced = cabinet(`${placement}-new`, "straight", 3, placement);
  return { neighbor, newlyPlaced };
}

describe("automaticAngledWallFiller", () => {
  it("builds two front-only, 45°-mitered wall-filler pieces instead of a deep wedge at the rear of the run", () => {
    const { neighbor, newlyPlaced } = pair("wall");
    const measurement = measuredAngledWallTransition(newlyPlaced, room, [neighbor, newlyPlaced]);
    expect(measurement).toMatchObject({
      rearGapIn: 3,
      neighborRearGapIn: 0,
      frontGapIn: 6.5,
      ownerFrontCutIn: 2,
      neighborFrontCutIn: 5,
      requiredStockWidthIn: 5,
      depthIn: 12,
      neighborUid: "wall-neighbor",
    });

    let number = 0;
    const resolution = automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [wallFiller], () => `front-wall-${++number}`, 7)!;
    expect(resolution).toMatchObject({ ownerGapIn: 2, neighborGapIn: 5, miterAt: "start" });
    expect(resolution.fillers.map((filler) => ({
      cabinetId: filler.cabinetId,
      masterCode: filler.masterCode,
      placement: filler.placement,
      nominalWidth: filler.nominalWidth,
      fillerTransitionKind: filler.fillerTransitionKind,
      fillerBillingRole: filler.fillerBillingRole,
      fillerMiterAngle: filler.fillerMiterAngle,
      fillerTransitionPiece: filler.fillerTransitionPiece,
    }))).toEqual([
      { cabinetId: 99, masterCode: "WF1242", placement: "wall", nominalWidth: 12, fillerTransitionKind: "front-miter-pair", fillerBillingRole: "primary", fillerMiterAngle: 45, fillerTransitionPiece: "owner" },
      { cabinetId: 99, masterCode: "WF1242", placement: "wall", nominalWidth: 12, fillerTransitionKind: "front-miter-pair", fillerBillingRole: "primary", fillerMiterAngle: 45, fillerTransitionPiece: "neighbor" },
    ]);
    expect(resolution.fillers[0].width).toBeCloseTo(1.9705627485, 8);
    expect(resolution.fillers[1].width).toBeCloseTo(4.9705627485, 8);
    for (const filler of resolution.fillers) {
      const footprint = angledWallTransitionFootprint(filler, room, [neighbor, newlyPlaced, ...resolution.fillers]);
      expect(footprint).toHaveLength(4);
      // A 3/4-inch-deep 45° board stays at the cabinet front; it never uses
      // the full 12-inch wall depth.
      expect(polygonArea(footprint!)).toBeGreaterThan(0);
      expect(polygonArea(footprint!)).toBeLessThan(filler.width * 0.75);
      expect(cabinetPlacementCollisionDetail(filler, [neighbor, newlyPlaced], room)).toBeNull();
    }
    expect(appendCollisionFreePlacements([neighbor, newlyPlaced], resolution.fillers, room).rejected).toEqual([]);
  });

  it("uses the same two-piece, front-only miter rule for base cabinets", () => {
    const { neighbor, newlyPlaced } = pair("base");
    let number = 0;
    const resolution = automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [baseFiller], () => `front-base-${++number}`, 7)!;
    expect(resolution).toMatchObject({ ownerGapIn: 7, neighborGapIn: 10 });
    expect(resolution.fillers.map((filler) => ({
      placement: filler.placement,
      masterCode: filler.masterCode,
      height: filler.height,
      depth: filler.depth,
      fillerTransitionKind: filler.fillerTransitionKind,
      fillerTransitionPiece: filler.fillerTransitionPiece,
    }))).toEqual([
      { placement: "base", masterCode: "BF-12", height: 34.5, depth: 24, fillerTransitionKind: "front-miter-pair", fillerTransitionPiece: "owner" },
      { placement: "base", masterCode: "BF-12", height: 34.5, depth: 24, fillerTransitionKind: "front-miter-pair", fillerTransitionPiece: "neighbor" },
    ]);
    expect(resolution.fillers[0].width).toBeCloseTo(6.941125497, 8);
    expect(resolution.fillers[1].width).toBeCloseTo(9.941125497, 8);
    for (const filler of resolution.fillers) {
      const footprint = angledWallTransitionFootprint(filler, room, [neighbor, newlyPlaced, ...resolution.fillers]);
      expect(polygonArea(footprint!)).toBeGreaterThan(0);
      expect(polygonArea(footprint!)).toBeLessThan(filler.width * 0.75);
      expect(cabinetPlacementCollisionDetail(filler, [neighbor, newlyPlaced], room)).toBeNull();
    }
    expect(appendCollisionFreePlacements([neighbor, newlyPlaced], resolution.fillers, room).rejected).toEqual([]);
  });

  it("price-locks both real front filler pieces at the authoritative selected-line unit price", () => {
    const { neighbor, newlyPlaced } = pair("wall");
    let number = 0;
    const resolution = automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [wallFiller], () => `front-price-${++number}`, 7)!;
    const common = {
      placed: resolution.fillers,
      styleId: 7,
      distributorId: 21,
      tier: "homeowner" as const,
      styleNameById: new Map([[7, "Selected line"]]),
      unitPriceFor: (placed: PlacedCabinet) => placed.cabinetId === wallFiller.id ? 88.5 : null,
    };
    expect(buildDesignCabinetCartLines(common)).toEqual([
      expect.objectContaining({ masterCode: "WF1242", qty: 2, unitPrice: 88.5, priceLocked: true }),
    ]);
    expect(buildDesignPreviewPricingLines(common)).toEqual([
      expect.objectContaining({ masterCode: "WF1242", qty: 2, unitPrice: 88.5, placementUids: ["front-price-1", "front-price-2"] }),
    ]);
  });

  it("does not fabricate a pair at a normal 90-degree wall join", () => {
    const ninetyRoom = { ...room, customWalls: room.customWalls.map((wall) => wall.id === "diagonal" ? { ...wall, lockedAngle: undefined } : wall) };
    const diagonalLength = wallLength("diagonal" as any, ninetyRoom);
    const neighbor = cabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = cabinet("new", "straight", 3);
    expect(automaticAngledWallFiller(newlyPlaced, ninetyRoom, [neighbor, newlyPlaced], [wallFiller], () => "front-pair", null)).toBeNull();
  });

  it("does not invent a pair when the selected line lacks stock for either measured front cut", () => {
    const { neighbor, newlyPlaced } = pair("wall");
    const undersized = { ...wallFiller, id: 100, masterCode: "WF-4", width: "4", description: '4" x 42" Wall Filler' };
    expect(automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [undersized], () => "front-pair", null)).toBeNull();
  });
});
