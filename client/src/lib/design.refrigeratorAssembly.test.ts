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
	 refrigeratorBayVerificationMetrics,
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

	 it("reports the exact opening, panel clearance, and cap centering from persisted bay members", () => {
	   const fridge = item({ uid: "proof-fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, depth: 24, height: 70 });
	   const leftPanel = item({ uid: "proof-left", masterCode: "REPV2496", description: "Refrigerator End Panel", placement: "tall", x: 22.75, width: 0.75, depth: 25.5, height: 96, refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "left-panel" });
	   const rightPanel = item({ uid: "proof-right", masterCode: "REPV2496", description: "Refrigerator End Panel", placement: "tall", x: 60.5, width: 0.75, depth: 25.5, height: 96, refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "right-panel" });
	   const cap = item({ uid: "proof-cap", masterCode: "W3624", description: "36 inch Wall Cabinet", placement: "wall", x: 24, width: 36, depth: 12, height: 24, mountBottom: 72, refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "bridge" });
	   expect(refrigeratorBayVerificationMetrics([fridge, leftPanel, rightPanel, cap], fridge, room)).toEqual({
	     refrigeratorWidth: 36,
	     openingWidth: 37,
	     leftGap: 0.5,
	     rightGap: 0.5,
	     bridgeCenterOffset: 0,
	     hasLeftPanel: true,
	     hasRightPanel: true,
	   });
	 });

	 it("keeps a source-priced refrigerator cap filler short at the refrigerator upper datum", () => {
	   const fridge = item({ uid: "cap-filler-fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, y: 0, width: 36, depth: 30, height: 70 });
	   const cap = item({ uid: "cap-filler-cap", masterCode: "WR3612", description: "Refrigerator Wall Cabinet", placement: "wall", x: 24, y: 0, width: 36, depth: 24, height: 12, mountBottom: 72, refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "bridge" });
	   const filler = item({ uid: "cap-filler-left", masterCode: "F342", description: "Cabinet Filler", placement: "wall", x: 23.5, y: 0, width: 0.5, depth: 24, height: 12, mountBottom: 72, refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "bridge-left-filler" });

	   const normalized = normalizeRefrigeratorBayUppers([fridge, cap, filler], room);
	   expect(normalized.find((entry) => entry.uid === filler.uid)).toMatchObject({ height: 12, mountBottom: 72 });
	 });

	 it("does not invent panels when a standard full-width upper is installed at the 72-inch refrigerator datum", () => {
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
	   expect(normalizedFridge.refrigeratorPanelMode).toBe("none");
	   expect(missingRefrigeratorPanelRoles(normalized, normalizedFridge, room)).toEqual([]);
	 });

	 it("does not treat an ordinary 54-inch wall cabinet as a refrigerator enclosure cap", () => {
	   const fridge = item({ uid: "ordinary-fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, y: 0, width: 36, depth: 30, height: 70 });
	   const ordinaryUpper = item({ uid: "ordinary-upper", masterCode: "W-36-30", placement: "wall", x: 24, y: 0, width: 36, depth: 12, height: 30, mountBottom: 54 });

	   expect(refrigeratorAssemblyMemberRole(ordinaryUpper, fridge, room)).toBeNull();
	   expect(missingRefrigeratorPanelRoles([fridge, ordinaryUpper], fridge, room)).toEqual([]);
	 });

	  it("keeps a legacy refrigerator's actually saved panel selection without upgrading it", () => {
    const legacyWithoutPanels = backWallLegacyAssembly().filter((entry) => entry.uid !== "right-panel");
    const legacyFridge = legacyWithoutPanels.find((entry) => entry.uid === "fridge")!;
    const normalized = normalizeRefrigeratorBayUppers(legacyWithoutPanels, room);
    const normalizedFridge = normalized.find((entry) => entry.uid === legacyFridge.uid)!;

	    expect(normalizedFridge.refrigeratorPanelMode).toBe("none");
	    expect(missingRefrigeratorPanelRoles(normalized, normalizedFridge, room)).toEqual([]);

	    const explicitRightOnly = legacyWithoutPanels.map((entry) => entry.uid === legacyFridge.uid
	      ? { ...entry, refrigeratorPanelMode: "right" as const }
	      : entry);
	    const preservedRightOnly = normalizeRefrigeratorBayUppers(explicitRightOnly, room);
	    const preservedFridge = preservedRightOnly.find((entry) => entry.uid === legacyFridge.uid)!;
	    expect(preservedFridge.refrigeratorPanelMode).toBe("right");
	    expect(missingRefrigeratorPanelRoles(preservedRightOnly, preservedFridge, room)).toEqual(["right-panel"]);

    const explicitNone = normalized.map((entry) => entry.uid === normalizedFridge.uid
      ? { ...entry, refrigeratorPanelMode: "none" as const }
      : entry);
    expect(missingRefrigeratorPanelRoles(explicitNone, explicitNone.find((entry) => entry.uid === normalizedFridge.uid)!, room)).toEqual([]);
  });

	  it("keeps a saved right-only refrigerator panel and centers the bridge over the exact refrigerator span", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const fridge = normalized.find((entry) => entry.uid === "fridge")!;
    const bridge = normalized.find((entry) => entry.refrigeratorAssemblyRole === "bridge")!;
	    const rightPanel = normalized.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")!;

	    expect(fridge.refrigeratorPanelMode).toBe("right");
	    expect(bridge).toMatchObject({ x: 24, y: 0, width: 36, mountBottom: 72, refrigeratorAssemblyId: "fridge" });
	    expect(rightPanel).toMatchObject({ x: 60.5, y: 0, width: 0.75, height: 96, refrigeratorAssemblyId: "fridge" });
	    expect(hasCollision(bridge, normalized.filter((entry) => entry.uid !== bridge.uid))).toBe(false);
  });

	  it("treats an explicitly saved refrigerator side strip as a finished end panel, not an enclosure gap or filler", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const panels = normalized.filter((entry) => entry.refrigeratorAssemblyId === "fridge" && /panel$/i.test(entry.refrigeratorAssemblyRole ?? ""));
    const fridge = normalized.find((entry) => entry.uid === "fridge")!;

	    expect(fridge).toMatchObject({ width: 36, refrigeratorPanelMode: "right" });
	    expect(panels).toHaveLength(1);
	    expect(panels.map((panel) => panel.width)).toEqual([0.75]);
	    expect(panels.every((panel) => panel.customProfile === "refrigerator-end-panel" && panel.subCategory === "Refrigerator End Panel")).toBe(true);
	    expect(fridge.width + panels.reduce((total, panel) => total + panel.width, 0)).toBeCloseTo(36.75);
  });

	  it("does not move a saved refrigerator to add an unselected left panel", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(true), room);
    expect(normalized.find((entry) => entry.uid === "neighbor")).toMatchObject({ x: 0, width: 24 });
	    expect(normalized.find((entry) => entry.uid === "fridge")).toMatchObject({ x: 24 });
	    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "bridge")).toMatchObject({ x: 24 });
	    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toBeUndefined();
    expect(normalized.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ x: 60.5 });
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
	    expect(restored.find((entry) => entry.uid === "fridge")?.refrigeratorPanelMode).toBe("right");
	    expect(restored.filter((entry) => entry.refrigeratorAssemblyId === "fridge").map((entry) => entry.refrigeratorAssemblyRole).sort()).toEqual([
	      "bridge",
	      "right-panel",
    ]);
  });

	  it("moves the refrigerator, centered bridge, and explicitly selected panel together", () => {
    const normalized = normalizeRefrigeratorBayUppers(backWallLegacyAssembly(), room);
    const fridge = normalized.find((entry) => entry.uid === "fridge")!;
    const moved = commitRefrigeratorAssemblyCandidate(normalized, fridge.uid, { ...fridge, x: 40 }, room)!;
    expect(moved.find((entry) => entry.uid === fridge.uid)).toMatchObject({ x: 40 });
    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "bridge")).toMatchObject({ x: 40 });
	    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toBeUndefined();
	    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ x: 76.5 });
	  });

	  it("moves a complete refrigerator bay together on a 45-degree Continuous Wall Builder run", () => {
	    const diagonalRoom: RoomData = {
	      width: 220,
	      depth: 220,
	      ceilingHeight: 96,
	      vertices: [{ id: "start", x: 0, y: 0 }, { id: "end", x: 160, y: 160 }],
	      customWalls: [{ id: "wall-45", startVertexId: "start", endVertexId: "end", lockedAngle: 45 }],
	      openWallPath: true,
	    };
	    const fridge = item({
	      uid: "group-fridge", masterCode: "FRIDGE-36", description: "Refrigerator 36\"", placement: "appliance",
	      width: 36, depth: 30, height: 70, refrigeratorPanelMode: "both", ...wallPlacementAt(20, 36, 30, "wall-45", diagonalRoom),
	    });
	    const bridge = item({
	      uid: "group-bridge", masterCode: "WR3612", description: "Refrigerator Wall Cabinet", placement: "wall",
	      width: 36, depth: 24, height: 12, mountBottom: 72, refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: "bridge",
	      ...wallPlacementAt(20, 36, 24, "wall-45", diagonalRoom),
	    });
	    const panel = (uid: string, role: "left-panel" | "right-panel", along: number) => item({
	      uid, masterCode: "REP2496", description: "Refrigerator End Panel", placement: "tall", width: 0.75, depth: 24, height: 84,
	      customProfile: "refrigerator-end-panel", refrigeratorAssemblyId: fridge.uid, refrigeratorAssemblyRole: role,
	      ...wallPlacementAtUnbounded(along, 0.75, 24, "wall-45", diagonalRoom),
	    });
	    const movedSpot = wallPlacementAt(40, 36, 30, "wall-45", diagonalRoom);
	    const moved = commitRefrigeratorAssemblyCandidate(
	      [fridge, bridge, panel("group-left", "left-panel", 19.25), panel("group-right", "right-panel", 56.75)],
	      fridge.uid,
	      { ...fridge, ...movedSpot },
	      diagonalRoom,
	    )!;

	    expect(moved.find((entry) => entry.uid === fridge.uid)).toMatchObject({ wallId: "wall-45", wallOffset: 40 });
	    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "bridge")).toMatchObject({ wallId: "wall-45", wallOffset: 40, mountBottom: 72, height: 12 });
	    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "left-panel")).toMatchObject({ wallId: "wall-45", wallOffset: 38.75, depth: 24, height: 84 });
	    expect(moved.find((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toMatchObject({ wallId: "wall-45", wallOffset: 76.5, depth: 24, height: 84 });

	    const outOfBoundsSpot = wallPlacementAt(0, 36, 30, "wall-45", diagonalRoom);
	    expect(commitRefrigeratorAssemblyCandidate(
	      [fridge, bridge, panel("group-left-boundary", "left-panel", 19.25), panel("group-right-boundary", "right-panel", 56.75)],
	      fridge.uid,
	      { ...fridge, ...outOfBoundsSpot },
	      diagonalRoom,
	    )).toBeNull();
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

describe("refrigerator enclosure on a short drawn wall", () => {
  it("rejects both requested panels instead of committing a partial bay when the right panel would leave the run", () => {
    // 72-inch 45° Wall Builder wall: B24 at 11–35, fridge at 36–72 (flush to the run end).
    const room: RoomData = {
      width: 220, depth: 220, ceilingHeight: 96, openWallPath: true,
      vertices: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 72 * Math.SQRT1_2, y: 72 * Math.SQRT1_2 }],
      customWalls: [{ id: "short45", startVertexId: "a", endVertexId: "b", lockedAngle: 45 }],
    };
    const wall = "short45";
    const b24 = item({ uid: "b24", masterCode: "B24", width: 24, depth: 24, ...wallPlacementAt(11, 24, 24, wall, room) });
    const fridge = item({ uid: "fr", masterCode: "FRIDGE-36", placement: "appliance", width: 36, depth: 30, height: 70, refrigeratorPanelMode: "both", ...wallPlacementAt(36, 36, 30, wall, room) });
    const cap = item({ uid: "cap", masterCode: "WR3612", placement: "wall", width: 36, depth: 24, height: 12, mountBottom: 72, refrigeratorAssemblyId: "fr", refrigeratorAssemblyRole: "bridge", ...wallPlacementAt(36, 36, 24, wall, room) });
    const panel = (uid: string, role: "left-panel" | "right-panel", along: number) => item({
      uid, masterCode: "REPV3096", placement: "tall", width: 0.75, depth: 24, height: 84, customProfile: "refrigerator-end-panel",
      refrigeratorAssemblyId: "fr", refrigeratorAssemblyRole: role, ...wallPlacementAtUnbounded(along, 0.75, 24, wall, room),
    });
    const fitted = fitRefrigeratorEnclosurePlacements([b24, fridge], [cap, panel("lp", "left-panel", 34.75), panel("rp", "right-panel", 72.5)], "fr", room);
    // No shift can satisfy both panels on a 72-inch run, so nothing is shifted…
    expect(fitted.shiftIn).toBe(0);
    expect(fitted.existing.find((entry) => entry.uid === "fr")?.wallOffset).toBe(36);
    const result = appendRefrigeratorEnclosurePlacements(fitted.existing, fitted.additions, "fr", room);
    // …and BOTH panels are reported, not silently folded back onto the run.
    expect(result.rejected.map((entry) => entry.uid).sort()).toEqual(["lp", "rp"]);
    expect(result.placed.some((entry) => entry.refrigeratorAssemblyRole === "right-panel")).toBe(false);
    expect(result.panelConflicts.map(({ panel: p, cabinet }) => `${p.uid}:${cabinet.masterCode}`)).toEqual(["lp:B24"]);
  });
});
