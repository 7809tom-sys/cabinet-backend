import { describe, expect, it } from "vitest";
import { appendCollisionFreePlacements, hasCollision, removeOverlappingPlacements, type PlacedCabinet } from "./design";

function placed(overrides: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "item",
    cabinetId: 1,
    masterCode: "B33",
    description: "Base cabinet",
    placement: "base",
    x: 0,
    y: 0,
    width: 33,
    depth: 24,
    height: 34.5,
    rotation: 0,
    ...overrides,
  } as PlacedCabinet;
}

describe("design placement collision prevention", () => {
  it("rejects a 3DB15 drawer base that overlaps a B33 footprint", () => {
    const b33 = placed({ uid: "b33", masterCode: "B33", x: 0 });
    const drawerBase = placed({ uid: "3db15", masterCode: "3DB15", x: 18, width: 15 });
    expect(hasCollision(drawerBase, [b33])).toBe(true);
  });

  it("allows cabinet runs that merely butt edge-to-edge", () => {
    const b33 = placed({ uid: "b33", masterCode: "B33", x: 0 });
    const drawerBase = placed({ uid: "3db15", masterCode: "3DB15", x: 33, width: 15 });
    expect(hasCollision(drawerBase, [b33])).toBe(false);
  });

  it("rejects an appliance overlapping a base cabinet but preserves the sink-over-sink-base exception", () => {
    const b33 = placed({ uid: "b33", masterCode: "B33", x: 0 });
    const range = placed({ uid: "range", masterCode: "RANGE-30", placement: "appliance", x: 4, width: 30 });
    const sinkBase = placed({ uid: "sb36", masterCode: "SB36", description: "Sink Base 36", x: 0, width: 36 });
    const sink = placed({ uid: "sink", masterCode: "SINK-33", description: "Single bowl sink", placement: "appliance", x: 0, width: 33 });
    expect(hasCollision(range, [b33])).toBe(true);
    expect(hasCollision(sink, [sinkBase])).toBe(false);
  });

  it("does not append a base cabinet into an existing refrigerator opening", () => {
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, height: 70 });
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 24, width: 24 });
    const result = appendCollisionFreePlacements([fridge], [b24]);
    expect(result.placed).toEqual([fridge]);
    expect(result.rejected).toEqual([b24]);
  });

  it("keeps a refrigerator and removes a colliding base from a restored legacy layout", () => {
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 24, width: 24 });
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, height: 70 });
    const result = removeOverlappingPlacements([b24, fridge]);
    expect(result.placed).toEqual([fridge]);
    expect(result.rejected).toEqual([b24]);
  });

  it("allows a base cabinet to butt against the refrigerator opening", () => {
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, height: 70 });
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 0, width: 24 });
    expect(appendCollisionFreePlacements([fridge], [b24]).placed).toEqual([fridge, b24]);
  });
});
