import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM, type DesignCabinet, type PlacedCabinet, wallPlacementAt } from "@/lib/design";
import { rangeCompanionProposal } from "./rangeCompanion";

function cabinet(overrides: Partial<DesignCabinet>): DesignCabinet {
  return {
    id: 1,
    masterCode: "WSC30",
    description: '30" x 6" Double Door Stacker / Bridge Wall Cabinet',
    category: "Wall",
    subCategory: "Bridge / Stacker",
    width: "30",
    height: "6",
    depth: "12",
    placement: "wall",
    numberOfDoors: 2,
    numberOfDrawers: 0,
    isCornerCabinet: false,
    ...overrides,
  };
}

function range(): PlacedCabinet {
  return {
    uid: "range-1",
    cabinetId: 0,
    masterCode: "RANGE-30",
    description: '30" Range',
    placement: "appliance",
    x: 30,
    y: 0,
    width: 30,
    depth: 25,
    height: 36,
    rotation: 0,
    mountBottom: 0,
  };
}

const microwave = cabinet({
  id: 0,
  masterCode: "MW-30",
  description: 'Over-Range Microwave 30"',
  category: "Appliance",
  subCategory: "Appliance",
  width: "30",
  height: "17",
  depth: "15",
  placement: "appliance",
  numberOfDoors: 0,
  mountBottom: 54,
});

describe("rangeCompanionProposal", () => {
  it("uses a matching selected-line bridge and centers both companions above the range", () => {
    const proposal = rangeCompanionProposal(
      range(),
      DEFAULT_ROOM,
      [cabinet(), cabinet({ id: 2, masterCode: "W-3012", subCategory: "Standard Wall", description: '30" x 12" Wall Cabinet', height: "12" })],
      [microwave],
    );

    expect(proposal?.bridge.masterCode).toBe("WSC30");
    expect(proposal?.microwave.masterCode).toBe("MW-30");
    expect(proposal?.microwaveSpot.x).toBe(30);
    expect(proposal?.bridgeSpot.x).toBe(30);
    expect(proposal?.bridgeMountBottom).toBe(78);
  });

  it("does not invent a generic upper when the selected line has no verified bridge source", () => {
    const proposal = rangeCompanionProposal(
      range(),
      DEFAULT_ROOM,
      [cabinet({ id: 2, masterCode: "W-3012", subCategory: "Standard Wall", description: '30" x 12" Wall Cabinet', height: "12" })],
      [microwave],
    );

    expect(proposal).toBeNull();
  });

  it("does not offer a mismatched microwave width", () => {
    const proposal = rangeCompanionProposal(range(), DEFAULT_ROOM, [cabinet()], [microwave, cabinet({ id: 3, masterCode: "MW-36", placement: "appliance", width: "36", height: "17", depth: "15", mountBottom: 54 })]);
    expect(proposal?.microwave.masterCode).toBe("MW-30");
  });

  it("uses the measured wall offset rather than screen x/y on a 45-degree layout", () => {
    const angledRoom = {
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
    const spot = wallPlacementAt(15, 30, 25, "straight" as any, angledRoom);
    const angledRange: PlacedCabinet = { ...range(), ...spot, wallId: "straight", wallOffset: 15 };

    const proposal = rangeCompanionProposal(angledRange, angledRoom, [cabinet()], [microwave]);

    expect(proposal?.bridgeSpot.wallId).toBe("straight");
    expect(proposal?.bridgeSpot.wallOffset).toBe(15);
    expect(proposal?.microwaveSpot.wallId).toBe("straight");
    expect(proposal?.microwaveSpot.wallOffset).toBe(15);
  });
});
