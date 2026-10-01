import { describe, expect, it } from "vitest";
import {
  appendRefrigeratorEnclosurePlacements,
  commitIndependentCabinetCandidate,
  normalizeRefrigeratorBayUppers,
  refrigeratorBayRunMetrics,
  refrigeratorBayVerificationMetrics,
  type PlacedCabinet,
  type RoomData,
  wallPlacementAt,
} from "./design";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };

function item(overrides: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "item",
    cabinetId: 1,
    masterCode: "B24",
    description: "Cabinet",
    placement: "base",
    x: 0,
    y: 0,
    width: 24,
    depth: 24,
    height: 34.5,
    rotation: 0,
    ...overrides,
  };
}

function selectedParts() {
  const fridge = item({
    uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance",
    x: 24, width: 36, depth: 30, height: 70,
    refrigeratorPanelMode: "both", refrigeratorOptionsChosen: true,
  });
  const left = item({
    uid: "left", masterCode: "REPV2496", placement: "tall", x: 22.75,
    width: 0.75, depth: 24, height: 84, customProfile: "refrigerator-end-panel",
    refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "left-panel",
  });
  const right = item({
    uid: "right", masterCode: "REPV2496", placement: "tall", x: 60.5,
    width: 0.75, depth: 24, height: 84, customProfile: "refrigerator-end-panel",
    refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "right-panel",
  });
  const cap = item({
    uid: "cap", masterCode: "WR3612", placement: "wall", x: 24,
    width: 36, depth: 24, height: 12, mountBottom: 72,
    refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "bridge",
  });
  return { fridge, left, right, cap };
}

describe("independent refrigerator catalog parts", () => {
  it("uses the source refrigerator width plus half-inch clearance at both panel sides", () => {
    const { fridge } = selectedParts();
    expect(refrigeratorBayRunMetrics(fridge, room)).toMatchObject({
      refrigeratorWidth: 36,
      openingWidth: 37,
      refrigeratorCenter: 42,
      openingStart: 23.5,
      openingEnd: 60.5,
    });
  });

  it("reports exact source-part measurements without changing their positions", () => {
    const { fridge, left, right, cap } = selectedParts();
    expect(refrigeratorBayVerificationMetrics([fridge, left, right, cap], fridge, room)).toEqual({
      refrigeratorWidth: 36,
      openingWidth: 37,
      leftGap: 0.5,
      rightGap: 0.5,
      bridgeCenterOffset: 0,
      hasLeftPanel: true,
      hasRightPanel: true,
    });
  });

  it("does not infer, create, resize, or reposition parts while normalizing a saved design", () => {
    const { fridge, left, cap } = selectedParts();
    const ordinaryUpper = item({ uid: "ordinary", masterCode: "W3030", placement: "wall", x: 80, width: 30, height: 30, mountBottom: 54 });
    const saved = [fridge, left, cap, ordinaryUpper];
    expect(normalizeRefrigeratorBayUppers(saved, room)).toBe(saved);
    expect(normalizeRefrigeratorBayUppers(saved, room)).toEqual(saved);
  });

  it("moves only the refrigerator selected by the user", () => {
    const { fridge, left, right, cap } = selectedParts();
    const moved = { ...fridge, x: 48, wallOffset: 48 };
    const result = commitIndependentCabinetCandidate([fridge, left, right, cap], moved);
    expect(result.find((part) => part.uid === fridge.uid)).toEqual(moved);
    expect(result.find((part) => part.uid === left.uid)).toBe(left);
    expect(result.find((part) => part.uid === right.uid)).toBe(right);
    expect(result.find((part) => part.uid === cap.uid)).toBe(cap);
  });

  it("rejects an explicitly selected end panel that extends beyond a drawn wall without moving the refrigerator", () => {
    const short45: RoomData = {
      width: 220,
      depth: 220,
      ceilingHeight: 96,
      openWallPath: true,
      vertices: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 72 * Math.SQRT1_2, y: 72 * Math.SQRT1_2 }],
      customWalls: [{ id: "short45", startVertexId: "a", endVertexId: "b", lockedAngle: 45 }],
    };
    const fridge = item({
      uid: "short-fridge", masterCode: "FRIDGE-36", placement: "appliance",
      width: 36, depth: 30, height: 70, wallOffset: 36,
      ...wallPlacementAt(36, 36, 30, "short45", short45),
    });
    const right = item({
      uid: "short-right", masterCode: "REPV3096", placement: "tall",
      width: 0.75, depth: 24, height: 84, customProfile: "refrigerator-end-panel",
      refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "right-panel",
      // Deliberately request a span past 72 in; the shared append path rejects it.
      ...wallPlacementAt(71.25, 0.75, 24, "short45", short45), wallOffset: 72,
    });
    const result = appendRefrigeratorEnclosurePlacements([fridge], [right], fridge.uid, short45);
    expect(result.placed).toEqual([fridge]);
    expect(result.rejected).toEqual([right]);
    expect(result.placed[0].wallOffset).toBe(36);
  });
});
