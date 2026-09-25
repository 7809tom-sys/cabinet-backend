import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM, appendCollisionFreePlacements, cabinetPlacementCollisionDetail, type PlacedCabinet, wallLength, wallPlacementAt } from "@/lib/design";
import { buildDesignCabinetCartLines, buildDesignPreviewPricingLines } from "@/lib/designCartLines";
import { automaticAngledWallFiller, measuredAngledWallTransition } from "./angledWallFiller";

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

function cabinet(
  uid: string,
  wallId: string,
  offset: number,
  placement: "wall" | "base" = "wall",
  width = 24,
): PlacedCabinet {
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
  masterCode: "BF18",
  description: '18" Base Filler',
  category: "Filler",
  subCategory: "Filler",
  width: "18",
  height: "34.5",
  depth: "24",
  catalogImageUrl: null,
};

describe("automaticAngledWallFiller", () => {
  it("measures and fills both the rear and visible face gaps instead of making a thin one-edge strip", () => {
    const diagonalLength = wallLength("diagonal" as any, room);
    const neighbor = cabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = cabinet("new", "straight", 3);

    const measurement = measuredAngledWallTransition(newlyPlaced, room, [neighbor, newlyPlaced]);
    expect(measurement).toMatchObject({
      rearGapIn: 3,
      frontGapIn: 6.5,
      requiredStockWidthIn: 6.5,
      depthIn: 12,
      neighborUid: "neighbor",
    });
    expect(measurement?.footprint).toHaveLength(4);

    const resolution = automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [wallFiller], () => "transition-filler", 7);

    expect(resolution).toMatchObject({ gapIn: 6.5, rearGapIn: 3, frontGapIn: 6.5, miterAt: "start" });
    expect(resolution?.filler).toMatchObject({
      cabinetId: 99,
      masterCode: "WF1242",
      width: 3,
      nominalWidth: 12,
      fillerTotalWidth: 6.5,
      fillerMiterAngle: 45,
      fillerMiteredEnd: "start",
      fillerTransitionKind: "angled-wedge",
      fillerTransitionNeighborUid: "neighbor",
      fillerTransitionRearWidthIn: 3,
      fillerTransitionFrontWidthIn: 6.5,
      fillerTransitionStockWidthIn: 12,
      fillerIndependentCabinetSupport: true,
    });
    expect(resolution?.filler.description).toContain('3" rear / 6.5" face');
    expect(resolution?.filler.fillerTransitionPlanFootprint).toHaveLength(4);
    expect(cabinetPlacementCollisionDetail(resolution!.filler, [neighbor, newlyPlaced], room)).toBeNull();
    const committed = appendCollisionFreePlacements([neighbor, newlyPlaced], [resolution!.filler], room);
    expect(committed.rejected).toEqual([]);
    expect(committed.placed).toHaveLength(3);
    const blockingWallCabinet = cabinet("blocking", "straight", 0, "wall", 3);
    expect(cabinetPlacementCollisionDetail(resolution!.filler, [blockingWallCabinet], room)).not.toBeNull();
  });

  it("uses the same full-depth transition contract for square base cabinets", () => {
    const diagonalLength = wallLength("diagonal" as any, room);
    const neighbor = cabinet("base-neighbor", "diagonal", diagonalLength - 24, "base");
    const newlyPlaced = cabinet("base-new", "straight", 3, "base");
    const resolution = automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [baseFiller], () => "base-transition", 7);

    expect(resolution).toMatchObject({ rearGapIn: 3, frontGapIn: 15.625, gapIn: 15.625 });
    expect(resolution?.filler).toMatchObject({
      placement: "base",
      cabinetId: 199,
      masterCode: "BF18",
      height: 34.5,
      depth: 24,
      fillerTransitionKind: "angled-wedge",
      fillerTotalWidth: 15.625,
    });
    expect(cabinetPlacementCollisionDetail(resolution!.filler, [neighbor, newlyPlaced], room)).toBeNull();
  });

  it("price-locks exactly one real catalog filler at the authoritative resolved unit price", () => {
    const diagonalLength = wallLength("diagonal" as any, room);
    const neighbor = cabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = cabinet("new", "straight", 3);
    const resolution = automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [wallFiller], () => "transition-filler", 7)!;
    const common = {
      placed: [resolution.filler],
      styleId: 7,
      distributorId: 21,
      tier: "homeowner" as const,
      styleNameById: new Map([[7, "Selected line"]]),
      unitPriceFor: (placed: PlacedCabinet) => placed.cabinetId === wallFiller.id ? 88.5 : null,
    };

    expect(buildDesignCabinetCartLines(common)).toEqual([
      expect.objectContaining({ masterCode: "WF1242", qty: 1, unitPrice: 88.5, priceLocked: true }),
    ]);
    expect(buildDesignPreviewPricingLines(common)).toEqual([
      expect.objectContaining({ masterCode: "WF1242", qty: 1, unitPrice: 88.5, placementUids: ["transition-filler"] }),
    ]);
  });

  it("does not fabricate trim for a normal 90-degree wall join", () => {
    const ninetyRoom = {
      ...room,
      customWalls: room.customWalls.map((wall) => wall.id === "diagonal" ? { ...wall, lockedAngle: undefined } : wall),
    };
    const diagonalLength = wallLength("diagonal" as any, ninetyRoom);
    const neighbor = cabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = cabinet("new", "straight", 3);

    expect(automaticAngledWallFiller(newlyPlaced, ninetyRoom, [neighbor, newlyPlaced], [wallFiller], () => "transition-filler", null)).toBeNull();
  });

  it("does not invent a filler when the selected line lacks stock that covers the larger measured edge", () => {
    const diagonalLength = wallLength("diagonal" as any, room);
    const neighbor = cabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = cabinet("new", "straight", 3);
    const undersized = { ...wallFiller, id: 100, masterCode: "WF342", width: "3", description: '3" x 42" Wall Filler' };

    expect(automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [undersized], () => "transition-filler", null)).toBeNull();
  });
});
