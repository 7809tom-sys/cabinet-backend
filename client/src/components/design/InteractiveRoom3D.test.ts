import { describe, expect, it } from "vitest";
import { cornerDrawerFrontLayout, describedOvenSpecification, dimensions, doorProfileKind, existingCabinetTransform, existingCabinetSku, hasPersistedTwoDScene, lCornerCarcassParts, openingTransform, quoteMaterialDetails, rangeCooktopLayout, rangeHoodGeometry, rangeHoodSceneStatus, rangeOvenFrontLayout, resolvedCatalogFinish, resolvedThreeDDoorSampleUrl, resolvedThreeDDrawerRows, resolvedThreeDFaceLayout, resolvedThreeDOvenLayout, resolvedThreeDSpecialtyProfile, sceneCabinetColor, shouldRenderCountertopOverSceneItem, shouldRenderPlacedDesign, sinkFixtureTransform, threeDCameraDistanceLimits, threeDDoorMaterialFallback, threeDMaterialStatusText, threeDPlanSyncText, threeDSceneInputDiagnostics, threeDSceneRevisionKey, threeDShakerRailThickness, threeDVisibleMaterialMode, THREE_D_DRAWER_REVEAL_DEPTH, THREE_D_EXPORT_SIZE, THREE_D_WALL_DEPTH_WRITE, THREE_D_WALL_OPACITY, type InteractiveRoomScene } from "./InteractiveRoom3D";

const baseScene: InteractiveRoomScene = {
  roomShape: { id: "l_shape", name: "L-Shape", defaultDimensions: { width: 156, depth: 144, ceilingHeight: 96 }, geometryTemplate: { vertices: [] } },
  layout: { id: "kitchen_l_standard", name: "Standard L Kitchen" },
  suggestions: [],
  materials: { cabinet: { publicName: null, name: "Sample", color: null, finish: null, doorStyle: null, doorPanelType: null }, defaults: { floor: "#b89778", countertop: "#e9e7e2", backsplash: "#d9d5cc", wall: "#efece6" } },
};

describe("interactive 3D room scene helpers", () => {
  it("keeps the mobile orbit camera outside a room-scaled furnished envelope", () => {
    expect(threeDCameraDistanceLimits(12).minDistance).toBeCloseTo(6.6, 12);
    expect(threeDCameraDistanceLimits(12).maxDistance).toBeCloseTo(40.8, 12);
    expect(threeDCameraDistanceLimits(8).minDistance).toBe(5.5);
  });

  it("reads seeded room dimensions while preserving safe defaults", () => {
    expect(dimensions({ width: 156, depth: 144, ceilingHeight: 96 })).toEqual({ width: 156, depth: 144, ceilingHeight: 96 });
    expect(dimensions({ width: 0 })).toEqual({ width: 144, depth: 120, ceilingHeight: 96 });
  });

  it("uses a verified hex style color before applying finish-name fallbacks", () => {
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "#1a2744" } } })).toBe("#1a2744");
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "Sage", finish: "Painted" } } })).toBe("#78826b");
  });

  it("uses the active catalog door-style finish when scene metadata is sparse", () => {
    expect(resolvedCatalogFinish(baseScene, "#49604a")).toBe("#49604a");
    expect(resolvedCatalogFinish(baseScene, "Aero Sage")).toBe(sceneCabinetColor(baseScene));
  });

  it("carries the exact selected 2D door sample into catalog-finish 3D cabinet faces", () => {
    expect(resolvedThreeDDoorSampleUrl("catalog", "/manus-storage/silva-shaker.png")).toBe("/manus-storage/silva-shaker.png");
    expect(resolvedThreeDDoorSampleUrl("#75523e", "/manus-storage/silva-shaker.png")).toBeNull();
    expect(resolvedThreeDDoorSampleUrl("#75523e", "/manus-storage/silva-shaker.png", true)).toBe("/manus-storage/silva-shaker.png");
  });

  it("keeps cabinet faces visibly calibrated when a selected 2D door image fails to load", () => {
    expect(threeDDoorMaterialFallback("#b8874e")).toEqual({ color: "#b8874e", map: null });
  });

  it("renders a selected door sample as texture or calibrated fallback, never an unreported flat-face mode", () => {
    expect(threeDVisibleMaterialMode("/manus-storage/silva.png", "loading")).toBe("selected-texture-loading");
    expect(threeDVisibleMaterialMode("/manus-storage/silva.png", "loaded")).toBe("selected-texture");
    expect(threeDVisibleMaterialMode("/manus-storage/silva.png", "failed")).toBe("calibrated-fallback");
    expect(threeDVisibleMaterialMode(null, "not-requested")).toBe("calibrated-fallback");
  });

  it("renders an explicit visible material status rather than silently describing a selected sample as flat", () => {
    expect(threeDMaterialStatusText("selected-texture", "loaded")).toBe("Cabinet material: selected texture · Door sample texture: loaded");
    expect(threeDMaterialStatusText("calibrated-fallback", "failed")).toBe("Cabinet material: calibrated fallback · Door sample texture: failed");
    expect(threeDMaterialStatusText("calibrated-fallback", "failed")).not.toMatch(/flat/i);
  });

  it("renders placed 2D cabinets instead of starter suggestions whenever a design exists", () => {
    expect(shouldRenderPlacedDesign([])).toBe(false);
    expect(shouldRenderPlacedDesign([{ uid: "base-1" } as never])).toBe(true);
  });

  it("keeps a loaded 2D plan eligible for deterministic 3D rendering before a door style is selected", () => {
    expect(hasPersistedTwoDScene({
      placed: [{ uid: "base-1" } as never],
      openings: [],
      sinks: [],
      island: null,
      furniture: [],
      ponyWalls: [],
    })).toBe(true);
  });

  it("uses the persisted 2D plan instead of starter suggestions for any saved entity, not only cabinets", () => {
    expect(hasPersistedTwoDScene({ placed: [], openings: [], sinks: [], island: null, furniture: [], ponyWalls: [] })).toBe(false);
    expect(hasPersistedTwoDScene({ placed: [], openings: [{ uid: "window" } as never], sinks: [], island: null, furniture: [], ponyWalls: [] })).toBe(true);
    expect(hasPersistedTwoDScene({ placed: [], openings: [], sinks: [], island: { x: 0, y: 0, width: 48, depth: 24 }, furniture: [], ponyWalls: [] })).toBe(true);
  });

  it("forces the active WebGL preview to rebuild whenever any saved 2D scene input changes", () => {
    const room = { width: 144, depth: 120 };
    const base = threeDSceneRevisionKey(room, [], [], [], null, [], [], "sample-a");
    const cabinet = { uid: "cab", cabinetId: 1, masterCode: "B-24", description: "Base", placement: "base", x: 0, y: 0, width: 24, depth: 24, rotation: 0 } as never;
    const opening = { uid: "window", kind: "window", side: "top", offset: 0, width: 30, height: 30, sillHeight: 36 } as never;
    expect(threeDSceneRevisionKey(room, [cabinet], [], [], null, [], [], "sample-a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [opening], [], null, [], [], "sample-a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], null, [], [], "sample-b")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], { x: 48, y: 48, width: 60, depth: 30 }, [], [], "sample-a")).not.toBe(base);
  });

  it("shows the exact active 2D entity inventory in the visible 3D plan-sync status", () => {
    expect(threeDPlanSyncText({
      placed: [{ uid: "cab" } as never],
      openings: [{ uid: "window" } as never],
      sinks: [{ uid: "sink" } as never],
      island: { x: 24, y: 24, width: 48, depth: 24 },
      furniture: [{ uid: "table" } as never],
      ponyWalls: [{ uid: "pony" } as never],
    })).toBe("Plan sync: 1 cabinet items · 1 openings · 1 sinks · 1 island · 1 furniture · 1 pony walls");
  });

  it("preserves a placed cabinet’s current 2D location and wall mounting height", () => {
    expect(existingCabinetTransform({
      uid: "wall-1", cabinetId: 10, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 24, y: 0, width: 30, depth: 12, height: 30, rotation: 0, mountBottom: 60,
    })).toEqual({ x: 39, z: 6, rotation: 0, bottom: 60 });
  });

  it("uses the rotation-aware 2D footprint center so vertical cabinet runs stay flush in 3D", () => {
    expect(existingCabinetTransform({
      uid: "wall-vertical", cabinetId: 11, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 0, y: 24, width: 30, depth: 12, height: 30, rotation: 90, mountBottom: 54,
    })).toEqual({ x: 6, z: 39, rotation: Math.PI / 2, bottom: 54 });
  });

  it("keeps adjacent rotated 2D cabinet edges contiguous with no artificial 3D run gap", () => {
    const first = existingCabinetTransform({
      uid: "run-a", cabinetId: 11, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 0, y: 0, width: 30, depth: 12, height: 30, rotation: 90, mountBottom: 54,
    });
    const second = existingCabinetTransform({
      uid: "run-b", cabinetId: 12, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 0, y: 30, width: 30, depth: 12, height: 30, rotation: 90, mountBottom: 54,
    });
    expect(first.z + 15).toBe(second.z - 15);
  });

  it("preserves a BMC microwave base's configured top opening, zero doors, and one drawer in 3D", () => {
    expect(resolvedThreeDFaceLayout({
      placementType: "base",
      openingType: "top",
      numberOfDoors: 0,
      numberOfDrawers: 1,
    })).toEqual({ hasConfiguredOpening: true, doorCount: 0, drawerCount: 1 });
  });

  it("carries saved end-return and open-front Cabinet Config profiles into 3D specialty geometry", () => {
    expect(resolvedThreeDSpecialtyProfile({
      masterCode: "CDB36", description: "36 inch Corner Drawer Base Cabinet", graphicType: "corner-drawer-base", customProfile: "corner-drawer-base", facePattern: null, cornerType: "l-shape",
    })).toEqual({ kind: "corner-drawer", pattern: null });
    expect(resolvedThreeDSpecialtyProfile({
      masterCode: "BEC-24", description: "Base End Cabinet", graphicType: "base_end_return", customProfile: "end-angle", facePattern: null, cornerType: null,
    })).toEqual({ kind: "end-return", pattern: null });
    expect(resolvedThreeDSpecialtyProfile({
      masterCode: "WRC-30", description: "Wine Rack", graphicType: null, customProfile: null, facePattern: "lattice", cornerType: null,
    })).toEqual({ kind: "face-pattern", pattern: "lattice" });
  });

  it("preserves CDB36’s true 36-inch corner footprint and three-drawer profile from the saved 2D plan", () => {
    const cdb = {
      uid: "saved-cdb36", cabinetId: 9390027, masterCode: "CDB36", description: '36" Corner Drawer Base Cabinet',
      placement: "base", x: 0, y: 0, width: 36, depth: 36, height: 34.5, rotation: 0,
      numberOfDoors: 0, numberOfDrawers: 3, cornerType: "l-shape", customProfile: "corner-drawer-base",
    } as never;
    expect(existingCabinetTransform(cdb)).toEqual({ x: 18, z: 18, rotation: 0, bottom: 0 });
    expect(existingCabinetSku(cdb)).toMatchObject({ width: 36, depth: 36, numberOfDoors: 0, numberOfDrawers: 3, graphicType: "corner-drawer-base" });
    expect(cornerDrawerFrontLayout(3)).toEqual({ cornerMarkerWidth: 0.24, drawerStackWidth: 2.76 });
    expect(lCornerCarcassParts(3, 3)).toMatchObject({
      legWidth: 2,
      legDepth: 2,
      backLeg: { width: 3, depth: 2, x: 0, z: -0.5 },
      sideLeg: { width: 2, depth: 1, x: -0.5, z: 1 },
    });
    expect(Object.values(lCornerCarcassParts(3, 3)).filter((part) => typeof part === "object" && part !== null && "width" in part)).toHaveLength(2);
  });

  it("normalizes an older CDB36 accessible-leg save to the shared 36-inch square 2D corner footprint", () => {
    const legacyCdb = {
      uid: "legacy-cdb36", cabinetId: 9390027, masterCode: "CDB36", description: "Corner Drawer Base Cabinet",
      placement: "base", x: 0, y: 0, width: 36, depth: 24, height: 34.5, rotation: 0,
      numberOfDoors: 0, numberOfDrawers: 3,
    } as never;
    expect(existingCabinetTransform(legacyCdb)).toEqual({ x: 18, z: 18, rotation: 0, bottom: 0 });
    expect(existingCabinetSku(legacyCdb)).toMatchObject({ width: 36, depth: 36, numberOfDoors: 0, numberOfDrawers: 3 });
  });

  it("preserves live saved oven, measured drawer, specialty, and selected door-sample fields in the 3D scene contract", () => {
    const placed = [{
      uid: "live-oven", cabinetId: 9390085, masterCode: "UOC3396", description: '33" x 96" Universal Oven Cabinet - 30" x 39.75" Oven Opening - 2 Doors 3 Drawers',
      placement: "tall", x: 24, y: 0, width: 33, depth: 24, height: 96, rotation: 0,
      numberOfDoors: 0, numberOfDrawers: 0, ovenType: "double", drawerLayout: JSON.stringify([{ count: 1, height: 6 }]), customProfile: "end-angle", facePattern: "lattice",
    }] as never[];
    const contract = threeDSceneInputDiagnostics(placed, "/manus-storage/selected-door.png");
    expect(contract).toMatchObject({ cabinetCount: 1, ovenTowerCount: 1, measuredDrawerCabinetCount: 1, specialtyCabinetCount: 1, doorSampleUrl: "/manus-storage/selected-door.png" });
    expect(contract.mapped[0]).toMatchObject({ masterCode: "UOC3396", ovenType: "double", drawerLayout: JSON.stringify([{ count: 1, height: 6 }]), graphicType: "end-angle", facePattern: "lattice" });
    expect(existingCabinetSku(placed[0])).toMatchObject({ height: 96, width: 33, depth: 24 });
  });

  it("maps mixed saved designs through one 2D-to-3D contract without design-specific scene branches", () => {
    const placed = [
      { uid: "cdb", cabinetId: 1, masterCode: "CDB36", description: "Corner Drawer Base", placement: "base", x: 0, y: 0, width: 36, depth: 36, height: 34.5, rotation: 0, numberOfDoors: 0, numberOfDrawers: 3, cornerType: "l-shape", customProfile: "corner-drawer-base" },
      { uid: "bmc", cabinetId: 2, masterCode: "BMC30", description: "Microwave Base", placement: "base", x: 36, y: 0, width: 30, depth: 24, height: 34.5, rotation: 0, numberOfDoors: 0, numberOfDrawers: 1, openingType: "top" },
      { uid: "dishwasher", cabinetId: 0, masterCode: "DW-24", description: "Dishwasher 24", placement: "appliance", x: 66, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0 },
      { uid: "wall", cabinetId: 3, masterCode: "W-30-42", description: "Wall Cabinet", placement: "wall", x: 0, y: 36, width: 30, depth: 12, height: 42, rotation: 0, mountBottom: 54, numberOfDoors: 2, numberOfDrawers: 0 },
      { uid: "end-return", cabinetId: 4, masterCode: "BEC-24", description: "Base End Cabinet", placement: "base", x: 90, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0, numberOfDoors: 2, numberOfDrawers: 0, customProfile: "base_end_return" },
    ] as never[];
    const diagnostics = threeDSceneInputDiagnostics(placed, "/manus-storage/live-door.png");

    expect(diagnostics).toMatchObject({ cabinetCount: 5, doorSampleUrl: "/manus-storage/live-door.png", specialtyCabinetCount: 2 });
    expect(diagnostics.mapped.map((cabinet) => cabinet.masterCode)).toEqual(["CDB36", "BMC30", "DW-24", "W-30-42", "BEC-24"]);
    expect(resolvedThreeDFaceLayout(diagnostics.mapped[1]!)).toEqual({ hasConfiguredOpening: true, doorCount: 0, drawerCount: 1 });
    expect(resolvedThreeDSpecialtyProfile(diagnostics.mapped[0]!)).toEqual({ kind: "corner-drawer", pattern: null });
    expect(resolvedThreeDSpecialtyProfile(diagnostics.mapped[4]!)).toEqual({ kind: "end-return", pattern: null });
    expect(shouldRenderCountertopOverSceneItem("appliance", diagnostics.mapped[2]!.masterCode)).toBe(true);
    expect(existingCabinetTransform(placed[3])).toMatchObject({ x: 15, z: 42, bottom: 54 });
  });

  it("maps the active WDC2442 wall corner through its shared 24-inch diagonal footprint", () => {
    const wdc = {
      uid: "active-wdc", cabinetId: 2, masterCode: "WDC2442", description: "24 inch Diagonal Wall Corner Cabinet",
      placement: "wall", x: 0, y: 0, width: 24, depth: 12, height: 42, rotation: 0,
      numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    const mapped = existingCabinetSku(wdc);
    expect(mapped).toMatchObject({ masterCode: "WDC2442", width: 24, depth: 24, cornerType: "diagonal" });
    expect(resolvedThreeDSpecialtyProfile(mapped)).toEqual({ kind: "diagonal-corner", pattern: null });
  });

  it("keeps authored drawer-row counts and measured heights instead of replacing them with generic slats", () => {
    const rows = resolvedThreeDDrawerRows({
      drawerLayout: JSON.stringify([{ count: 1, height: 6 }, { count: 2, height: 5 }]),
    }, 2, 3);
    expect(rows.map((row) => row.count)).toEqual([1, 2]);
    expect(rows.map((row) => row.height)).toEqual([0.5, expect.closeTo(5 / 12, 12)]);
    expect(THREE_D_DRAWER_REVEAL_DEPTH).toBe(0.07);
  });

  it("assigns a drawer-only cabinet’s complete usable face to its saved drawer stack", () => {
    const layout = resolvedThreeDFaceLayout({ placementType: "base", numberOfDoors: 0, numberOfDrawers: 3 });
    const usableHeight = 34.5 / 12 - 0.08;
    const drawerZone = layout.doorCount === 0 && !layout.hasConfiguredOpening ? usableHeight : usableHeight * 0.35;
    expect(drawerZone).toBeCloseTo(usableHeight, 12);
    expect(resolvedThreeDDrawerRows({ drawerLayout: null }, drawerZone, layout.drawerCount)).toEqual([
      { count: 1, height: usableHeight / 3 },
      { count: 1, height: usableHeight / 3 },
      { count: 1, height: usableHeight / 3 },
    ]);
  });

  it("calibrates an oven tower from the saved 2D door zone, drawer rows, and middle cut-out", () => {
    const layout = resolvedThreeDOvenLayout({
      height: 84, numberOfDoors: 2, numberOfDrawers: 3, doorHeight: 18,
      drawerLayout: JSON.stringify([{ count: 1, height: 6 }, { count: 2, height: 5 }]),
      openingType: "middle", ovenType: "single",
    });
    expect(layout.doorZone).toBe(1.5);
    expect(layout.drawerRows.map((row) => row.count)).toEqual([1, 2]);
    expect(layout.drawerRows.map((row) => row.height)).toEqual([0.5, expect.closeTo(5 / 12, 12)]);
    expect(layout.openingHeight).toBeCloseTo(4.503333333333333, 12);
    expect(layout.openingPosition).toBe("middle");
  });

  it("preserves a configured double-oven tower and bottom cut-out without applying single-oven defaults", () => {
    const layout = resolvedThreeDOvenLayout({
      height: 90, numberOfDoors: 2, numberOfDrawers: 1, doorHeight: 20, drawerHeight: 6,
      openingType: "bottom", ovenType: "double",
    });
    expect(layout.ovenCount).toBe(2);
    expect(layout.openingPosition).toBe("bottom");
    expect(layout.drawerRows).toEqual([{ count: 1, height: 0.5 }]);
    expect(layout.openingHeight).toBeGreaterThan(0);
  });

  it("calibrates a legacy oven tower from its saved 2D opening, door, and drawer description", () => {
    expect(describedOvenSpecification('33" x 96" Universal Oven Cabinet - 30" x 39.75" Oven Opening - 2 Doors 3 Drawers')).toEqual({
      openingWidth: 30,
      openingHeight: 39.75,
      doorCount: 2,
      drawerCount: 3,
    });
    const layout = resolvedThreeDOvenLayout({
      height: 96,
      description: '33" x 96" Universal Oven Cabinet - 30" x 39.75" Oven Opening - 2 Doors 3 Drawers',
      numberOfDoors: 0,
      numberOfDrawers: 0,
      ovenType: "double",
    });
    expect(layout.doorCount).toBe(2);
    expect(layout.drawerRows).toHaveLength(3);
    expect(layout.openingHeight).toBeCloseTo(39.75 / 12, 12);
  });

  it("keeps a narrow rotated wall cabinet and a mounted range hood at their saved 2D transforms", () => {
    expect(existingCabinetTransform({
      uid: "narrow-wall", cabinetId: 12, masterCode: "W-21-42", description: "21 inch wall cabinet", placement: "wall",
      x: 0, y: 23, width: 21, depth: 12, height: 42, rotation: 90, mountBottom: 54,
    })).toEqual({ x: 6, z: 33.5, rotation: Math.PI / 2, bottom: 54 });
    expect(existingCabinetTransform({
      uid: "hood", cabinetId: 0, masterCode: "HOOD-30", description: "Range Hood", placement: "appliance",
      x: 3.5, y: 45, width: 30, depth: 18, height: 18, rotation: 90, mountBottom: 66,
    })).toEqual({ x: 12.5, z: 60, rotation: Math.PI / 2, bottom: 66 });
    expect(existingCabinetTransform({
      uid: "microwave", cabinetId: 0, masterCode: "MW-30", description: "Over-Range Microwave", placement: "appliance",
      x: 0, y: 45, width: 30, depth: 15, height: 17, rotation: 90, mountBottom: 54,
    })).toEqual({ x: 7.5, z: 60, rotation: Math.PI / 2, bottom: 54 });
    expect(existingCabinetTransform({
      uid: "range", cabinetId: 0, masterCode: "RANGE-30", description: "Range / Stove 30 inch", placement: "appliance",
      x: 0, y: 45, width: 30, depth: 25, height: 36, rotation: 90, mountBottom: 0,
    })).toMatchObject({ x: 12.5, z: 60, rotation: Math.PI / 2, bottom: 0 });
    const hood = rangeHoodGeometry(30, 18, 18);
    expect(hood).toMatchObject({ width: 2.5, depth: 1.5, height: 1.5, chimneyWidth: 1.05 });
    expect(hood.chimneyDepth).toBeCloseTo(0.69, 12);
  });

  it("uses the shared 2D appliance elevation when a legacy saved hood omitted mountBottom", () => {
    expect(existingCabinetTransform({
      uid: "legacy-hood", cabinetId: 0, masterCode: "HOOD-30", description: "Range Hood", placement: "appliance",
      x: 24, y: 0, width: 30, depth: 18, height: 18, rotation: 0,
    })).toEqual({ x: 39, z: 9, rotation: 0, bottom: 66 });
  });

  it("preserves the saved current-design refrigerator width, height, and rotated 2D position in 3D", () => {
    expect(existingCabinetTransform({
      uid: "current-fridge", cabinetId: 0, masterCode: "FRIDGE-36", description: "Refrigerator 36 inch", placement: "appliance",
      x: 0.75, y: 108, width: 36, depth: 30, height: 72, rotation: 90,
    })).toEqual({ x: 15.75, z: 126, rotation: Math.PI / 2, bottom: 0 });
  });

  it("does not invent a range hood in 3D when the saved 2D appliance plan contains only a range", () => {
    expect(rangeHoodSceneStatus([{ masterCode: "RANGE-30" } as never])).toEqual({ hasRange: true, hasRangeHood: false, needs2DPlacement: true });
    expect(rangeHoodSceneStatus([{ masterCode: "RANGE-30" } as never, { masterCode: "HOOD-30" } as never])).toEqual({ hasRange: true, hasRangeHood: true, needs2DPlacement: false });
  });

  it("places a saved 2D window at its exact wall offset in the 3D room", () => {
    expect(openingTransform({
      uid: "window-1", kind: "window", label: "Window", side: "top", offset: 42, width: 36, height: 36, sill: 42,
    }, 144, 120)).toEqual({ x: 60, z: 0.06, rotation: 0 });
  });

  it("places a saved sink basin and faucet at the same 2D countertop coordinates", () => {
    const transform = sinkFixtureTransform({
      uid: "sink-1", type: "single_bowl", x: 24, y: 48, width: 30, depth: 22, faucet: true,
    });
    expect(transform.x).toBe(3.25);
    expect(transform.z).toBeCloseTo(4.916666666666667, 12);
    expect(transform.countertopTop).toBeCloseTo(3.125, 12);
  });

  it("extends the countertop over a saved dishwasher but not over tall or wall scene items", () => {
    expect(shouldRenderCountertopOverSceneItem("appliance", "DW-24")).toBe(true);
    expect(shouldRenderCountertopOverSceneItem("appliance", "WINE-24")).toBe(true);
    expect(shouldRenderCountertopOverSceneItem("base", "B-33")).toBe(true);
    expect(shouldRenderCountertopOverSceneItem("base", "RANGE-30")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("base", "FILL-3", "3 inch Filler")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("appliance", "RANGE-30")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("wall", "W-30-42")).toBe(false);
  });

  it("centers the range oven face and reserves a measured lower storage drawer", () => {
    const layout = rangeOvenFrontLayout(3);
    expect(layout.openingHeight).toBeCloseTo(1.62, 12);
    expect(layout.openingCenterY).toBeGreaterThan(0);
    expect(layout.drawerHeight).toBeCloseTo(0.42, 12);
    expect(layout.drawerCenterY).toBeCloseTo(-1.25, 12);
  });

  it("renders a physical cooktop and four burners from the saved range width and depth", () => {
    const cooktop = rangeCooktopLayout(30 / 12, 25 / 12, 36 / 12);
    expect(cooktop.cooktopWidth).toBeCloseTo(2.38, 12);
    expect(cooktop.cooktopDepth).toBeCloseTo((25 / 12) - 0.12, 12);
    expect(cooktop.topY).toBeCloseTo(1.525, 12);
    expect(cooktop.burnerCenters).toHaveLength(4);
    expect(cooktop.burnerCenters[0]?.x).toBeCloseTo(-0.5712, 12);
    expect(cooktop.burnerCenters[0]?.z).toBeCloseTo(-0.45156666666666667, 12);
  });

  it("uses a high-resolution PNG export size suitable for design sharing", () => {
    expect(THREE_D_EXPORT_SIZE).toEqual({ width: 2000, height: 1400 });
  });

  it("keeps room walls non-occluding so a mobile orbit cannot hide the cabinet run", () => {
    expect(THREE_D_WALL_OPACITY).toBe(0.72);
    expect(THREE_D_WALL_DEPTH_WRITE).toBe(false);
  });

  it("writes the active catalog cabinet and countertop names when quote previews stay at their defaults", () => {
    expect(quoteMaterialDetails({
      cabinetPreview: "Catalog finish",
      countertopPreview: "Quartz",
      catalogFinishName: "Aero Sage (Preston)",
      catalogCountertopName: "Pelican Calacatta Laza Quartz",
    })).toEqual({ cabinet: "Aero Sage (Preston)", countertop: "Pelican Calacatta Laza Quartz" });
  });

  it("recognizes Shaker, raised-panel, and flat-panel cabinet door geometry", () => {
    expect(doorProfileKind("Shaker", null)).toBe("shaker");
    expect(doorProfileKind("Raised Panel", null)).toBe("raised");
    expect(doorProfileKind("Slab", "Flat Panel")).toBe("flat");
  });

  it("uses a physical three-inch rail and stile for twelve- and twenty-one-inch 3D Shaker faces", () => {
    expect(threeDShakerRailThickness(12 / 12, 24 / 12)).toBe(3 / 12);
    expect(threeDShakerRailThickness(21 / 12, 30 / 12)).toBe(3 / 12);
  });
});
