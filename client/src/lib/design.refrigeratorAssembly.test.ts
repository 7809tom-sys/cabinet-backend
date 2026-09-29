import { describe, expect, it } from "vitest";
import {
  appendRefrigeratorEnclosurePlacements,
  commitRefrigeratorAssemblyCandidate,
  fitRefrigeratorEnclosurePlacements,
  hasCollision,
  missingRefrigeratorPanelRoles,
  normalizeRefrigeratorBayUppers,
	 refrigeratorAssemblyMemberRole,
	 refrigeratorBayRunMetrics,
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
	 it("uses the source refrigerator width plus half-inch clearance at both panel sides", () => {
	   const fridge = backWallLegacyAssembly()[0]!;
	   const metrics = refrigeratorBayRunMetrics(fridge, room);
	   expect(metrics).toMatchObject({
	     refrigeratorWidth: 36,
	     openingWidth: 37,
	     refrigeratorCenter: 42,
	     openingStart: 23.5,
	     openingEnd: 60.5,
	   });
	 });

	 it("recovers both source-backed side panels when a standard full-width upper is installed at the 72-inch refrigerator datum", () => {
	   const fridge = item({
	     uid: "generic-cap-fridge",
	     masterCode: "FRIDGE-36",
	     description: 'Refrigerator 36"',
	     placement: "appliance",
	     x: 24,
	     y: 0,
	     width: 36,
	     depth: 30,
	     height: 70,
	   });
	   const ordinaryLookingCap = item({
	     uid: "generic-cap-upper",
	     masterCode: "W-36-24",
	     description: '36" Double Door Wall Cabinet',
	     placement: "wall",
	     x: 24,
	     y: 0,
	     width: 36,
	     depth: 12,
	     height: 24,
	     mountBottom: 72,
	   });
	   const normalized = normalizeRefrigeratorBayUppers([fridge, ordinaryLookingCap], room);
	   const normalizedFridge = normalized.find((entry) => entry.uid === fridge.uid)!;

	   expect(refrigeratorAssemblyMemberRole(ordinaryLookingCap, fridge, room)).toBe("bridge");
	   expect(normalizedFridge.refrigeratorPanelMode).toBe("both");
	   expect(missingRefrigeratorPanelRoles(normalized, normalizedFridge, room)).toEqual(["left-panel", "right-panel"]);
	 });

	 it("does not treat an ordinary 54-inch wall cabinet as a refrigerator enclosure cap", () => {
	   const fridge = item({ uid: "ordinary-fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, y: 0, width: 36, depth: 30, height: 70 });
	   const ordinaryUpper = item({ uid: "ordinary-upper", masterCode: "W-36-30", placement: "wall", x: 24, y: 0, width: 36, depth: 12, height: 30, mountBottom: 54 });

	   expect(refrigeratorAssemblyMemberRole(ordinaryUpper, fridge, room)).toBeNull();
	   expect(missingRefrigeratorPanelRoles([fridge, ordinaryUpper], fridge, room)).toEqual([]);
	 });

  it("identifies both missing source panels for a legacy built-in refrigerator while preserving an explicit no-panel choice", () => {
    const legacyWithoutPanels = backWallLegacyAssembly().filter((entry) => entry.uid !== "right-panel");
    const legacyFridge = legacyWithoutPanels.find((entry) => entry.uid === "fridge")!;
    const normalized = normalizeRefrigeratorBayUppers(legacyWithoutPanels, room);
    const normalizedFridge = normalized.find((entry) => entry.uid === legacyFridge.uid)!;

    expect(normalizedFridge.refrigeratorPanelMode).toBe("both");
    expect(missingRefrigeratorPanelRoles(normalized, normalizedFridge, room)).toEqual(["left-panel", "right-panel"]);

    const staleRightOnly = legacyWithoutPanels.map((entry) => entry.uid === legacyFridge.uid
      ? { ...entry, refrigeratorPanelMode: "right" as const }
      : entry);
    const repairedRightOnly = normalizeRefrigeratorBayUppers(staleRightOnly, room);
    const repairedFridge = repairedRightOnly.find((entry) => entry.uid === legacyFridge.uid)!;
    expect(repairedFridge.refrigeratorPanelMode).toBe("both");
    expect(missingRefrigeratorPanelRoles(repairedRightOnly, repairedFridge, room)).toEqual(["left-panel", "right-panel"]);

    const explicitNone = normalized.map((entry) => entry.uid === normalizedFridge.uid
      ? { ...entry, refrigeratorPanelMode: "none" as const }
      : entry);
    expect(missingRefrigeratorPanelRoles(explicitNone, explicitNone.find((entry) => entry.uid === normalizedFridge.uid)!, room)).toEqual([]);
  });

  it("repairs a legacy missing left panel and centers the bridge over the exact refrigerator span", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const fridge = normalized.find((entry) => entry.uid === "fridge")!;
    const bridge = normalized.find((entry) => entry.refrigeratorAssemblyRole === "bridge")!;
    const leftPanel = normalized.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")!;
    const rightPanel = normalized.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")!;

    expect(fridge.refrigeratorPanelMode).toBe("both");
    expect(bridge).toMatchObject({ x: 24, y: 0, width: 36, mountBottom: 72, refrigeratorAssemblyId: "fridge" });
    expect(leftPanel).toMatchObject({ x: 22.75, y: 0, width: 0.75, height: 96, refrigeratorAssemblyId: "fridge" });
    expect(rightPanel).toMatchObject({ x: 60.5, y: 0, width: 0.75, height: 96, refrigeratorAssemblyId: "fridge" });
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
    expect(normalized.find((entry) => entry.uid === "fridge")).toMatchObject({ x: 25.25 });
    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "bridge")).toMatchObject({ x: 25.25 });
    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toMatchObject({ x: 24 });
    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ x: 61.75 });
  });

  it("creates panel space when a refrigerator is between touching cabinet columns", () => {
    const fridge = item({
      uid: "tight-fridge",
      masterCode: "FRIDGE-36",
      description: "Refrigerator 36\"",
      placement: "appliance",
      x: 30,
      y: 0,
      width: 36,
      depth: 30,
      height: 70,
      rotation: 0,
      refrigeratorPanelMode: "both",
    });
    const leftUpper = item({ uid: "left-upper", masterCode: "U308424", placement: "tall", x: 0, y: 0, width: 30, depth: 24, height: 84, rotation: 0 });
    const rightBase = item({ uid: "right-base", masterCode: "B30", placement: "base", x: 66, y: 0, width: 30, depth: 24, height: 34.5, rotation: 0 });
    const rightUpper = item({ uid: "right-upper", masterCode: "W3030", placement: "wall", x: 66, y: 0, width: 30, depth: 12, height: 30, rotation: 0, mountBottom: 54 });
    const bridge = item({
      uid: "tight-bridge",
      masterCode: "WR3612",
      description: "Refrigerator Wall Cabinet 36\"",
      placement: "wall",
      x: 30,
      y: 0,
      width: 36,
      depth: 24,
      height: 24,
      rotation: 0,
      mountBottom: 72,
      refrigeratorAssemblyId: fridge.uid,
      refrigeratorAssemblyRole: "bridge",
    });
    const panel = (uid: string, role: "left-panel" | "right-panel", x: number) => item({
      uid,
      masterCode: "REPV-2496",
      description: "Refrigerator End Panel",
      placement: "tall",
      x,
      y: 0,
      width: 0.75,
      depth: 30,
      height: 96,
      rotation: 0,
      customProfile: "refrigerator-end-panel",
      refrigeratorAssemblyId: fridge.uid,
      refrigeratorAssemblyRole: role,
    });
    const additions = [bridge, panel("tight-left", "left-panel", 29.25), panel("tight-right", "right-panel", 66)];
    const fitted = fitRefrigeratorEnclosurePlacements(
      [leftUpper, rightBase, rightUpper, fridge],
      additions,
      fridge.uid,
      room,
    );
    const enclosure = appendRefrigeratorEnclosurePlacements(
      fitted.existing,
      fitted.additions,
      fridge.uid,
      room,
    ).placed;

    expect(enclosure.find((entry) => entry.uid === leftUpper.uid)).toMatchObject({ x: 0 });
    expect(enclosure.find((entry) => entry.uid === fridge.uid)).toMatchObject({ x: 30.75, width: 36 });
    expect(enclosure.find((entry) => entry.uid === bridge.uid)).toMatchObject({ x: 30.75, width: 36, mountBottom: 72 });
    expect(enclosure.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toMatchObject({ x: 30, width: 0.75 });
    expect(enclosure.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ x: 66.75, width: 0.75 });
    expect(enclosure.find((entry) => entry.uid === rightBase.uid)).toMatchObject({ x: 67.5 });
    expect(enclosure.find((entry) => entry.uid === rightUpper.uid)).toMatchObject({ x: 67.5 });
    expect(enclosure).toHaveLength(7);
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
    expect(normalized.find((entry) => entry.uid === "right-left")).toMatchObject({ x: 114, y: 22.75 });
    expect(normalized.find((entry) => entry.uid === "right-right")).toMatchObject({ x: 114, y: 60.5 });
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
    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toMatchObject({ x: 38.75 });
    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ x: 76.5 });
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
    const neighborSpot = wallPlacementAt(37.5, 24, 24, "diagonal", diagonalRoom);
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
    const neighbor = item({
      uid: "diagonal-neighbor",
      masterCode: "B24",
      description: "Base Cabinet 24\"",
      placement: "base",
      width: 24,
      depth: 24,
      height: 34.5,
      ...neighborSpot,
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
      [fridge, neighbor],
      [bridge, panel("diagonal-left", "left-panel", leftSpot), panel("diagonal-right", "right-panel", rightSpot)],
      fridge.uid,
      diagonalRoom,
    );
    const enclosure = appendRefrigeratorEnclosurePlacements(fitted.existing, fitted.additions, fridge.uid, diagonalRoom).placed;
    const fittedFridge = enclosure.find((entry) => entry.uid === fridge.uid)!;
    const fittedBridge = enclosure.find((entry) => entry.refrigeratorAssemblyRole === "bridge")!;
    const leftPanel = enclosure.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")!;
    const rightPanel = enclosure.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")!;

    expect(fittedFridge.wallOffset).toBeCloseTo(0.75);
    expect(fittedBridge).toMatchObject({ width: 36, wallOffset: 0.75 });
    expect(leftPanel.wallOffset).toBeCloseTo(0);
    expect(rightPanel.wallOffset).toBeCloseTo(36.75);
    expect(enclosure.find((entry) => entry.uid === neighbor.uid)?.wallOffset).toBeCloseTo(37.5);
    expect(enclosure).toHaveLength(5);
  });
});
