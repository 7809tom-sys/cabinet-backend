import { describe, expect, it } from "vitest";
import { buildPreSavePlanReview } from "./preSavePlanReview";
import type { PlacedCabinet, RoomData } from "./design";

const room = { width: 144, depth: 120, ceilingHeight: 96 } as RoomData;

function cabinet(partial: Partial<PlacedCabinet> & Pick<PlacedCabinet, "uid" | "masterCode" | "placement">): PlacedCabinet {
  return {
    cabinetId: 1,
    description: partial.masterCode,
    category: "Base",
    subCategory: null,
    x: 0,
    y: 0,
    width: 24,
    depth: 24,
    height: 34.5,
    rotation: 0,
    ...partial,
  } as PlacedCabinet;
}

describe("pre-save plan review", () => {
  it("finds a measured filler opportunity, missing refrigerator upper, and unresolved placement without changing the plan", () => {
    const nearFullBase = cabinet({ uid: "base", masterCode: "B-34", placement: "base", width: 34 });
    const floorBlocker = cabinet({ uid: "blocker", masterCode: "DW-24", placement: "appliance", x: 36, width: 24 });
    const refrigerator = cabinet({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 72, width: 36, height: 70 });
    const placed = [nearFullBase, floorBlocker, refrigerator];

    const review = buildPreSavePlanReview({
      room,
      placed,
      openings: [],
      island: null,
      catalogFillers: [{ id: 8, masterCode: "BF-3", description: "3 inch Base Filler", category: "Filler", subCategory: null, width: "3", height: "34.5", depth: "24", catalogImageUrl: null }],
      conflictUids: new Set(["blocker"]),
    });

    expect(review.findings).toHaveLength(3);
    expect(review.findings.map((finding) => finding.action.kind)).toEqual(["filler", "refrigerator", "issue"]);
    expect(review.findings[0]).toMatchObject({ title: 'Finish a 2" gap with BF-3', action: { kind: "filler", fillerCode: "BF-3" } });
    expect(review.findings[1]).toMatchObject({ action: { kind: "refrigerator", refrigeratorUid: "fridge" } });
    expect(review.findings[2]).toMatchObject({ action: { kind: "issue", cabinetUid: "blocker" } });
    expect(placed).toHaveLength(3);
  });

  it("does not recommend an over-refrigerator cabinet when a dedicated bridge is already present", () => {
    const refrigerator = cabinet({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 36, width: 36, height: 70 });
    const bridge = cabinet({ uid: "bridge", masterCode: "WR3624", placement: "wall", x: 36, width: 36, height: 24, refrigeratorAssemblyId: "fridge", refrigeratorAssemblyRole: "bridge" });
    const review = buildPreSavePlanReview({ room, placed: [refrigerator, bridge], openings: [], island: null, catalogFillers: [], conflictUids: new Set() });

    expect(review.findings).toEqual([]);
  });
});
