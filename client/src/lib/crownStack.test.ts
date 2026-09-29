import { describe, expect, it } from "vitest";
import { crownEligibleCabinets, type PlacedCabinet, type RoomData } from "./design";

const room: RoomData = { width: 144, depth: 120 };

function wallCabinet(overrides: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "wall",
    cabinetId: 1,
    masterCode: "W2430",
    description: "24 inch Wall Cabinet",
    placement: "wall",
    x: 0,
    y: 0,
    width: 24,
    depth: 12,
    height: 30,
    mountBottom: 54,
    rotation: 0,
    ...overrides,
  };
}

describe("stacked glass wall cabinet crown eligibility", () => {
  it("removes crown from both boxes when the top glass stacker reaches the ceiling", () => {
    const lower = wallCabinet({ uid: "lower", masterCode: "W2430" });
    const glassStacker = wallCabinet({
      uid: "glass-stacker",
      masterCode: "W2412GD",
      description: "24 inch Wall Glass Door Cabinet",
      height: 12,
      mountBottom: 84,
      stackedOnCabinetUid: lower.uid,
    });

    expect(crownEligibleCabinets([lower, glassStacker], room).map((cabinet) => cabinet.uid)).toEqual([]);
  });

  it("does not suppress lower-cabinet crown when a glass cabinet is not physically stacked on its top", () => {
    const lower = wallCabinet({ uid: "lower", masterCode: "W2430" });
    const elevatedGlass = wallCabinet({
      uid: "elevated-glass",
      masterCode: "W2412GD",
      description: "24 inch Wall Glass Door Cabinet",
      height: 12,
      mountBottom: 86,
      stackedOnCabinetUid: lower.uid,
    });

    expect(crownEligibleCabinets([lower, elevatedGlass], room).map((cabinet) => cabinet.uid)).toEqual(["lower"]);
  });

  it("keeps crown on the top stacker when the local ceiling has the full three-inch clearance", () => {
    const tallRoom: RoomData = { width: 144, depth: 120, ceilingHeight: 108 };
    const lower = wallCabinet({ uid: "lower", masterCode: "W2430" });
    const glassStacker = wallCabinet({
      uid: "glass-stacker",
      masterCode: "W2412GD",
      description: "24 inch Wall Glass Door Cabinet",
      height: 12,
      mountBottom: 84,
      stackedOnCabinetUid: lower.uid,
    });

    expect(crownEligibleCabinets([lower, glassStacker], tallRoom).map((cabinet) => cabinet.uid)).toEqual(["glass-stacker"]);
  });
});
