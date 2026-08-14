import { describe, expect, it } from "vitest";
import { hasCollision, type PlacedCabinet } from "./design";

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
});
