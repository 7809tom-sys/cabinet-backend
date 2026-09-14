import { describe, expect, it } from "vitest";
import type { DesignCabinet, PlacedCabinet, RoomData } from "./design";
import { applyGlassStackerBulkPlacement, glassStackerBulkPlacementCandidates } from "./glassStackerBulkPlacement";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };

function wall(uid: string, masterCode: string, width: number, extra: Partial<PlacedCabinet> = {}): PlacedCabinet {
  return {
    uid,
    cabinetId: 1,
    masterCode,
    description: "Wall cabinet",
    placement: "wall",
    x: 0,
    y: 0,
    width,
    depth: 12,
    height: 30,
    rotation: 0,
    ...extra,
  };
}

function catalog(masterCode: string, width: number): DesignCabinet {
  return {
    id: width,
    masterCode,
    description: "Glass stacker cabinet",
    placement: "wall",
    width,
    depth: 12,
    height: 12,
  } as DesignCabinet;
}

describe("glass stacker bulk placement", () => {
  it("finds matching catalog glass stackers for other eligible wall cabinets", () => {
    const firstParent = wall("parent-30", "W3030", 30, { x: 0 });
    const secondParent = wall("parent-24", "W2430", 24, { x: 30 });
    const source = wall("source", "W3012GD", 30, {
      description: "Glass stacker cabinet",
      x: 0,
      height: 12,
      glassDoor: true,
      mountBottom: 84,
      stackedOnCabinetUid: firstParent.uid,
    });
    const candidates = glassStackerBulkPlacementCandidates(
      [firstParent, secondParent, source],
      source.uid,
      room,
      [catalog("W3012GD", 30), catalog("W2412GD", 24)],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      parentUid: secondParent.uid,
      parentCode: "W2430",
      stacker: { masterCode: "W2412GD", x: 30, mountBottom: 84, stackedOnCabinetUid: secondParent.uid, glassDoor: true },
    });
  });

  it("skips wall cabinets that already have a stacker, are open units, or have no matching glass stacker", () => {
    const firstParent = wall("first", "W3030", 30, { x: 0 });
    const existingStacker = wall("existing", "W3012GD", 30, { description: "Glass stacker cabinet", height: 12, glassDoor: true, mountBottom: 84, stackedOnCabinetUid: firstParent.uid });
    const openUnit = wall("open", "W2430", 24, { x: 30, noDoor: true });
    expect(glassStackerBulkPlacementCandidates([firstParent, existingStacker, openUnit], existingStacker.uid, room, [catalog("W3012GD", 30)])).toEqual([]);
  });

  it("uses the placed stacker as a same-width catalog-safe fallback while the matching wall-cabinet pool is unavailable", () => {
    const firstParent = wall("first", "W2430", 24, { x: 0 });
    const secondParent = wall("second", "W2430", 24, { x: 24 });
    const source = wall("source", "W2412GD", 24, {
      description: "Glass door wall cabinet",
      x: 0,
      height: 12,
      glassDoor: true,
      mountBottom: 84,
      stackedOnCabinetUid: firstParent.uid,
    });
    const candidates = glassStackerBulkPlacementCandidates([firstParent, secondParent, source], source.uid, room, []);
    expect(candidates).toEqual([
      expect.objectContaining({
        parentUid: secondParent.uid,
        stacker: expect.objectContaining({
          cabinetId: source.cabinetId,
          masterCode: source.masterCode,
          x: secondParent.x,
          mountBottom: 84,
          stackedOnCabinetUid: secondParent.uid,
        }),
      }),
    ]);
  });

  it("adds one new stacker per still-unoccupied parent and gives each a fresh uid", () => {
    const parent = wall("parent", "W2430", 24, { x: 30 });
    const candidate = {
      parentUid: parent.uid,
      parentCode: parent.masterCode,
      stacker: wall("preview", "W2412GD", 24, { x: 30, description: "Glass stacker cabinet", height: 12, glassDoor: true, mountBottom: 84, stackedOnCabinetUid: parent.uid }),
    };
    expect(applyGlassStackerBulkPlacement([parent], [candidate], () => "new-stacker")).toEqual([
      parent,
      expect.objectContaining({ uid: "new-stacker", masterCode: "W2412GD", stackedOnCabinetUid: parent.uid }),
    ]);
  });
});
