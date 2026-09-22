import { describe, expect, it } from "vitest";
import {
	appendRefrigeratorEnclosurePlacements,
  commitRefrigeratorAssemblyCandidate,
	fitRefrigeratorEnclosurePlacements,
  hasCollision,
  normalizeRefrigeratorBayUppers,
  type PlacedCabinet,
  type RoomData,
	wallPlacementAt,
	wallPlacementAtUnbounded,
} from "./design";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };

function item(overrides: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "item",
    cabinetId: 1,
    masterCode: "B-24",
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

function backWallLegacyAssembly(withNeighbor = false) {
  const fridge = item({
    uid: "fridge",
    cabinetId: 0,
    masterCode: "FRIDGE-36",
    description: 'Refrigerator 36"',
    placement: "appliance",
    x: 24,
    width: 36,
    depth: 30,
    height: 70,
  });
  const bridge = item({
    uid: "bridge",
    cabinetId: 101,
    masterCode: "WR3624",
    description: 'Refrigerator Wall Cabinet 36"',
    placement: "wall",
    x: 30,
    width: 36,
    depth: 24,
    height: 24,
    mountBottom: 54,
  });
  const rightPanel = item({
    uid: "right-panel",
    cabinetId: 102,
    masterCode: "REPV-96",
    description: 'Refrigerator End Panel 96"H',
    subCategory: "Refrigerator End Panel",
    placement: "tall",
    customProfile: "refrigerator-end-panel",
    x: 60,
    width: 0.75,
    depth: 30,
    height: 94,
  });
  const neighbor = item({ uid: "neighbor", x: 0, width: 24 });
  return withNeighbor ? [neighbor, fridge, bridge, rightPanel] : [fridge, bridge, rightPanel];
}

describe("refrigerator assembly reconciliation", () => {
  it("repairs a legacy missing left panel and centers the bridge over the exact refrigerator span", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const fridge = normalized.find((entry) => entry.uid === "fridge")!;
    const bridge = normalized.find((entry) => entry.refrigeratorAssemblyRole === "bridge")!;
    const leftPanel = normalized.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")!;
    const rightPanel = normalized.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")!;

    expect(fridge.refrigeratorPanelMode).toBe("both");
    expect(bridge).toMatchObject({ x: 24, y: 0, width: 36, mountBottom: 72, refrigeratorAssemblyId: "fridge" });
    expect(leftPanel).toMatchObject({ x: 23.25, y: 0, width: 0.75, height: 96, refrigeratorAssemblyId: "fridge" });
    expect(rightPanel).toMatchObject({ x: 60, y: 0, width: 0.75, height: 96, refrigeratorAssemblyId: "fridge" });
    expect(new Set([leftPanel.uid, rightPanel.uid]).size).toBe(2);
    expect(hasCollision(bridge, normalized.filter((entry) => entry.uid !== bridge.uid))).toBe(false);
  });

  it("treats each visible 3/4-inch refrigerator side strip as a finished end panel, not an enclosure gap or filler", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const panels = normalized.filter((entry) => entry.refrigeratorAssemblyId === "fridge" && /panel$/i.test(entry.refrigeratorAssemblyRole ?? ""));
    const fridge = normalized.find((entry) => entry.uid === "fridge")!;

    expect(fridge).toMatchObject({ width: 36, refrigeratorPanelMode: "both" });
    expect(panels).toHaveLength(2);
    expect(panels.map((panel) => panel.width)).toEqual([0.75, 0.75]);
    expect(panels.every((panel) => panel.customProfile === "refrigerator-end-panel" && panel.subCategory === "Refrigerator End Panel")).toBe(true);
    // The intentional enclosure is 36" appliance + two 3/4" architectural
    // skins, not a 42" appliance or an unexplained spacer at its front.
    expect(fridge.width + panels.reduce((total, panel) => total + panel.width, 0)).toBeCloseTo(37.5);
  });

  it("shifts the complete enclosure together to retain the restored left panel without moving an earlier neighbor", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(true), room);
    expect(normalized.find((entry) => entry.uid === "neighbor")).toMatchObject({ x: 0, width: 24 });
    expect(normalized.find((entry) => entry.uid === "fridge")).toMatchObject({ x: 24.75 });
    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "bridge")).toMatchObject({ x: 24.75 });
    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toMatchObject({ x: 24 });
    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ x: 60.75 });
  });

  it("preserves an explicit right-only enclosure instead of inventing a left panel", () => {
    const explicit = backWallLegacyAssembly().map((entry) => entry.uid === "fridge"
      ? { ...entry, refrigeratorPanelMode: "right" as const }
      : entry);
    const normalized = normalizeRefrigeratorBayUppers(explicit, room);
    expect(normalized.filter((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toHaveLength(0);
    expect(normalized.filter((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toHaveLength(1);
  });

  it("aligns a linked right-wall bridge and both panels on the refrigerator run axis", () => {
    const fridge = item({
      uid: "right-fridge",
      cabinetId: 0,
      masterCode: "FRIDGE-36",
      description: "Refrigerator",
      placement: "appliance",
      x: 114,
      y: 24,
      width: 36,
      depth: 30,
      height: 70,
      rotation: 90,
      refrigeratorPanelMode: "both",
    });
    const bridge = item({
      uid: "right-bridge",
      masterCode: "WR3624",
      description: "Refrigerator Wall Cabinet",
      placement: "wall",
      x: 118,
      y: 30,
      width: 36,
      depth: 24,
      height: 24,
      rotation: 90,
      refrigeratorAssemblyId: fridge.uid,
      refrigeratorAssemblyRole: "bridge",
    });
    const panel = (uid: string, role: "left-panel" | "right-panel") => item({
      uid,
      masterCode: "REPV-96",
      description: "Refrigerator End Panel",
      placement: "tall",
      customProfile: "refrigerator-end-panel",
      x: 114,
      y: role === "left-panel" ? 20 : 64,
      width: 0.75,
      depth: 30,
      height: 96,
      rotation: 90,
      refrigeratorAssemblyId: fridge.uid,
      refrigeratorAssemblyRole: role,
    });
    const normalized = normalizeRefrigeratorBayUppers([fridge, bridge, panel("right-left", "left-panel"), panel("right-right", "right-panel")], room);
    expect(normalized.find((entry) => entry.uid === "right-bridge")).toMatchObject({ x: 120, y: 24, mountBottom: 72 });
    expect(normalized.find((entry) => entry.uid === "right-left")).toMatchObject({ x: 114, y: 23.25 });
    expect(normalized.find((entry) => entry.uid === "right-right")).toMatchObject({ x: 114, y: 60 });
  });

  it("keeps assembly ownership and roles through saved-design JSON serialization", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const restored = JSON.parse(JSON.stringify(normalized)) as PlacedCabinet[];
    expect(restored.find((entry) => entry.uid === "fridge")?.refrigeratorPanelMode).toBe("both");
    expect(restored.filter((entry) => entry.refrigeratorAssemblyId === "fridge").map((entry) => entry.refrigeratorAssemblyRole).sort()).toEqual([
      "bridge",
      "left-panel",
      "right-panel",
    ]);
  });

  it("moves the refrigerator, centered bridge, and both panels together as one assembly", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const fridge = normalized.find((entry) => entry.uid === "fridge")!;
    const moved = commitRefrigeratorAssemblyCandidate(normalized, fridge.uid, { ...fridge, x: 40 }, room)!;
    expect(moved.find((entry) => entry.uid === fridge.uid)).toMatchObject({ x: 40 });
    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "bridge")).toMatchObject({ x: 40 });
    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toMatchObject({ x: 39.25 });
    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ x: 76 });
  });

  it("keeps a 36-inch diagonal-wall refrigerator bridge centered and retains both end panels", () => {
    const diagonalRoom: RoomData = {
      width: 180,
      depth: 180,
      ceilingHeight: 96,
      vertices: [
        { id: "start", x: 0, y: 0 },
        { id: "end", x: 144, y: 144 },
      ],
      customWalls: [{ id: "diagonal", startVertexId: "start", endVertexId: "end", label: "Diagonal" }],
      openWallPath: true,
    };
    const fridgeSpot = wallPlacementAt(0, 36, 30, "diagonal", diagonalRoom);
    const bridgeSpot = wallPlacementAt(0, 36, 12, "diagonal", diagonalRoom);
    const leftSpot = wallPlacementAtUnbounded(-0.75, 0.75, 30, "diagonal", diagonalRoom);
    const rightSpot = wallPlacementAt(36, 0.75, 30, "diagonal", diagonalRoom);
    const fridge = item({
      uid: "diagonal-fridge",
      masterCode: "FRIDGE-36",
      description: "Refrigerator 36\"",
      placement: "appliance",
      width: 36,
      depth: 30,
      height: 70,
      refrigeratorPanelMode: "both",
      ...fridgeSpot,
    });
    const bridge = item({
      uid: "diagonal-bridge",
      masterCode: "WR3612",
      description: "Refrigerator Wall Cabinet 36\"",
      placement: "wall",
      width: 36,
      depth: 12,
      height: 24,
      mountBottom: 72,
      refrigeratorAssemblyId: fridge.uid,
      refrigeratorAssemblyRole: "bridge",
      ...bridgeSpot,
    });
    const panel = (uid: string, role: "left-panel" | "right-panel", spot: ReturnType<typeof wallPlacementAt>) => item({
      uid,
      masterCode: "REPV-2496",
      description: "Refrigerator End Panel",
      placement: "tall",
      width: 0.75,
      depth: 30,
      height: 96,
      customProfile: "refrigerator-end-panel",
      refrigeratorAssemblyId: fridge.uid,
      refrigeratorAssemblyRole: role,
      ...spot,
    });

    expect(leftSpot.wallOffset).toBeCloseTo(-0.75);
    const fitted = fitRefrigeratorEnclosurePlacements(
      [fridge],
      [bridge, panel("diagonal-left", "left-panel", leftSpot), panel("diagonal-right", "right-panel", rightSpot)],
      fridge.uid,
      diagonalRoom,
    );
    const enclosure = appendRefrigeratorEnclosurePlacements(fitted.existing, fitted.additions, fridge.uid).placed;
    const fittedFridge = enclosure.find((entry) => entry.uid === fridge.uid)!;
    const fittedBridge = enclosure.find((entry) => entry.refrigeratorAssemblyRole === "bridge")!;
    const leftPanel = enclosure.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")!;
    const rightPanel = enclosure.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")!;

    expect(fittedFridge.wallOffset).toBeCloseTo(0.75);
    expect(fittedBridge).toMatchObject({ width: 36, wallOffset: 0.75 });
    expect(leftPanel.wallOffset).toBeCloseTo(0);
    expect(rightPanel.wallOffset).toBeCloseTo(36.75);
    expect(enclosure).toHaveLength(4);
  });
});
