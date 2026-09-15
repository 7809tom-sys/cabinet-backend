import { describe, expect, it } from "vitest";
import { fixtureBelongsToCabinet, makeSinkForCabinet, type PlacedCabinet } from "./design";

describe("sink fixture cabinet ownership", () => {
  const sinkBase = {
    uid: "sink-base-36",
    cabinetId: 1,
    masterCode: "SB-36",
    placement: "base",
    x: 24,
    y: 0,
    width: 36,
    depth: 24,
    height: 34.5,
    rotation: 0,
  } as PlacedCabinet;

  it("retains exact sink-base ownership when a linked fixture projects beyond the cabinet footprint", () => {
    const attached = { ...makeSinkForCabinet("farmhouse", sinkBase, { width: 120, depth: 120, ceilingHeight: 96 }), x: 21 };
    expect(fixtureBelongsToCabinet(attached, sinkBase)).toBe(true);
  });

  it("keeps the footprint check only as a fallback for a legacy unlinked fixture", () => {
    const legacy = { ...makeSinkForCabinet("single", sinkBase, { width: 120, depth: 120, ceilingHeight: 96 }), cabinetUid: undefined };
    expect(fixtureBelongsToCabinet(legacy, sinkBase)).toBe(true);
  });
});
