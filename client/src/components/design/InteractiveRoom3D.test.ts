import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addCabinet, cornerDrawerFrontLayout, describedOvenSpecification, diagonalCornerFootprintVertices, diagonalCornerFrontWidth, dimensions, doorProfileKind, existingCabinetTransform, existingCabinetSku, freestandingRangeHeightProfile, hasPersistedTwoDScene, lCornerCarcassParts, openingTransform, quoteMaterialDetails, rangeCooktopLayout, rangeHoodGeometry, rangeHoodSceneStatus, rangeOvenFrontLayout, resolvedCatalogFinish, resolvedThreeDCountertopFinish, resolvedThreeDDoorProfile, resolvedThreeDDoorSampleUrl, resolvedThreeDDrawerRows, resolvedThreeDFaceLayout, resolvedThreeDOvenLayout, resolvedThreeDSpecialtyProfile, savedRangeHoodTransform, sceneCabinetColor, shouldRenderCountertopOverSceneItem, shouldRenderPlacedDesign, shouldRenderSavedSceneCabinet, sinkFaucetTransform, sinkFixtureTransform, singleOvenTowerAssembly, threeDApplianceFrontVisualUrl, threeDCameraDistanceLimits, threeDCountertopDepthIn, threeDDoorMaterialFallback, threeDMaterialStatusText, threeDPlacedWall, threeDPlanSyncText, threeDRoomFacingRotation, threeDSceneInputDiagnostics, threeDSceneRevisionKey, threeDSceneVisibilityContract, threeDShakerFramePose, threeDShakerRailThickness, threeDVisibleMaterialMode, triangleCornerFootprintVertices, triangleCornerFrontPose, triangleCornerFrontWidth, THREE_D_DRAWER_REVEAL_DEPTH, THREE_D_EXPORT_SIZE, THREE_D_WALL_DEPTH_WRITE, THREE_D_WALL_OPACITY, type InteractiveRoomScene } from "./InteractiveRoom3D";
import { furnitureTransform, islandZoneTransform, ponyWallTransform } from "./InteractiveRoom3D";
import { threeDDesignParitySnapshot } from "./InteractiveRoom3D";
import { resolvedThreeDCountertopFinish, shouldEmitThreeDPresentation, threeDPresentationEmissionKey } from "./InteractiveRoom3D";
import { threeDCornerBodyDimensions } from "./InteractiveRoom3D";
import { placedCornerGeometryKind } from "@/lib/design";
import { ovenOpeningGeometry } from "@/lib/ovenOpening";

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

  it("uses the saved 2D countertop color unless a presentation-only 3D override is explicitly stored", () => {
    expect(resolvedThreeDCountertopFinish(undefined, "#2c2f33", baseScene)).toBe("#2c2f33");
    expect(resolvedThreeDCountertopFinish({ cabinetFinish: "catalog", countertopFinish: "#b9824a" }, "#2c2f33", baseScene)).toBe("#b9824a");
    expect(resolvedThreeDCountertopFinish(undefined, null, baseScene)).toBe("#e9e7e2");
  });

  it("does not re-emit an unchanged presentation back to the parent preview state", () => {
    const emitted = threeDPresentationEmissionKey("catalog", "#2c2f33");
    expect(shouldEmitThreeDPresentation(null, "catalog", "#2c2f33")).toBe(true);
    expect(shouldEmitThreeDPresentation(emitted, "catalog", "#2c2f33")).toBe(false);
    expect(shouldEmitThreeDPresentation(emitted, "#49604a", "#2c2f33")).toBe(true);
    expect(shouldEmitThreeDPresentation(emitted, "catalog", "#111111")).toBe(true);
  });

  it("carries the exact selected 2D door sample into catalog-finish 3D cabinet faces", () => {
    expect(resolvedThreeDDoorSampleUrl("catalog", "/manus-storage/silva-shaker.png")).toBe("/manus-storage/silva-shaker.png");
    expect(resolvedThreeDDoorSampleUrl("#75523e", "/manus-storage/silva-shaker.png")).toBeNull();
    expect(resolvedThreeDDoorSampleUrl("#75523e", "/manus-storage/silva-shaker.png", true)).toBe("/manus-storage/silva-shaker.png");
  });

  it("uses the active saved Shaker profile when a persisted room intentionally carries neutral material metadata", () => {
    expect(baseScene.materials?.cabinet.doorStyle).toBeNull();
    expect(resolvedThreeDDoorProfile(baseScene, { doorStyle: "Shaker", doorPanelType: null })).toEqual({
      doorStyle: "Shaker",
      doorPanelType: null,
    });
    expect(resolvedThreeDDoorProfile(baseScene, null)).toEqual(baseScene.materials?.cabinet);
  });

  it("keeps cabinet faces visibly calibrated when a selected 2D door image fails to load", () => {
    expect(threeDDoorMaterialFallback("#b8874e")).toEqual({ color: "#b8874e", map: null });
  });

  it("maps supplied original visuals to their supported 3D appliance fronts without assigning them to unrelated appliances", () => {
    expect(threeDApplianceFrontVisualUrl({ masterCode: "RANGE-30", catalogImageUrl: "/manus-storage/original-range.webp" }))
      .toBe("/manus-storage/original-range.webp");
    expect(threeDApplianceFrontVisualUrl({ masterCode: "HOOD-30", catalogImageUrl: "/manus-storage/original-hood.webp" }))
      .toBe("/manus-storage/original-hood.webp");
    expect(threeDApplianceFrontVisualUrl({ masterCode: "FRIDGE-36", catalogImageUrl: "/manus-storage/fridge.webp" }))
      .toBe("/manus-storage/fridge.webp");
    expect(threeDApplianceFrontVisualUrl({ masterCode: "DW-24", catalogImageUrl: "/manus-storage/dishwasher.webp" }))
      .toBe("/manus-storage/dishwasher.webp");
    expect(threeDApplianceFrontVisualUrl({ masterCode: "MW-30", catalogImageUrl: "/manus-storage/microwave.webp" }))
      .toBe("/manus-storage/microwave.webp");
    expect(threeDApplianceFrontVisualUrl({ masterCode: "WINE-24", catalogImageUrl: "/manus-storage/wine.webp" })).toBeNull();
  });

  it("adds original 3D visual fronts without changing catalog envelopes or appliance mounting", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 1, cabinetId: 1, masterCode: "RANGE-30", description: "30 inch range", placementType: "appliance",
      width: 30, height: 36, depth: 25, mountBottom: 0, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/original-range.webp",
    }, null, {}, 144, 120, "#6b7567", "#eeeeee");
    addCabinet(root, {
      distributorSkuId: 2, cabinetId: 2, masterCode: "HOOD-30", description: "30 inch hood", placementType: "appliance",
      width: 30, height: 18, depth: 18, mountBottom: 66, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/original-hood.webp",
    }, null, {}, 144, 120, "#6b7567", "#eeeeee");
    addCabinet(root, {
      distributorSkuId: 3, cabinetId: 3, masterCode: "FRIDGE-36", description: "36 inch refrigerator", placementType: "appliance",
      width: 36, height: 70, depth: 30, mountBottom: 0, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/original-fridge.webp",
    }, null, {}, 144, 120, "#6b7567", "#eeeeee");
    addCabinet(root, {
      distributorSkuId: 4, cabinetId: 4, masterCode: "DW-24", description: "24 inch dishwasher", placementType: "appliance",
      width: 24, height: 34.5, depth: 24, mountBottom: 0, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/original-dishwasher.webp",
    }, null, {}, 144, 120, "#6b7567", "#eeeeee");
    addCabinet(root, {
      distributorSkuId: 5, cabinetId: 5, masterCode: "MW-30", description: "30 inch over-range microwave", placementType: "appliance",
      width: 30, height: 17, depth: 15, mountBottom: 54, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/original-microwave.webp",
    }, null, {}, 144, 120, "#6b7567", "#eeeeee");
    const visualPlanes: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.originalProductVisual) visualPlanes.push(node); });

    expect(visualPlanes).toHaveLength(5);
    expect(visualPlanes.map((node) => node.userData.originalProductVisualUrl)).toEqual([
      "/manus-storage/original-range.webp", "/manus-storage/original-hood.webp", "/manus-storage/original-fridge.webp",
      "/manus-storage/original-dishwasher.webp", "/manus-storage/original-microwave.webp",
    ]);
    expect(visualPlanes.map((node) => node.userData.catalogEnvelope)).toEqual([
      expect.objectContaining({ widthIn: 30, heightIn: 36, depthIn: 25, mountBottomIn: 0 }),
      expect.objectContaining({ widthIn: 30, heightIn: 18, depthIn: 18, mountBottomIn: 66 }),
      expect.objectContaining({ widthIn: 36, heightIn: 70, depthIn: 30, mountBottomIn: 0 }),
      expect.objectContaining({ widthIn: 24, heightIn: 34.5, depthIn: 24, mountBottomIn: 0 }),
      expect.objectContaining({ widthIn: 30, heightIn: 17, depthIn: 15, mountBottomIn: 54 }),
    ]);
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

  it("orients every cabinet and appliance front toward the usable room side of its wall", () => {
    const room = { width: 144, depth: 120, ceilingHeight: 96 };
    const placedAt = (wall: "back" | "front" | "left" | "right", appliance = false) => ({
      uid: `${wall}-${appliance ? "appliance" : "cabinet"}`,
      cabinetId: 1,
      masterCode: appliance ? "FRIDGE-36" : "B-24",
      description: appliance ? "Refrigerator" : "Base cabinet",
      placement: appliance ? "appliance" : "base",
      x: wall === "left" ? 0 : wall === "right" ? 120 : 48,
      y: wall === "back" ? 0 : wall === "front" ? 96 : 36,
      width: wall === "left" || wall === "right" ? 24 : appliance ? 36 : 24,
      depth: wall === "left" || wall === "right" ? 24 : 24,
      height: appliance ? 70 : 34.5,
      rotation: 0,
    }) as never;
    const expected = { back: 0, front: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };

    for (const wall of ["back", "front", "left", "right"] as const) {
      const cabinet = placedAt(wall);
      const appliance = placedAt(wall, true);
      expect(threeDPlacedWall(cabinet, room)).toBe(wall);
      expect(threeDRoomFacingRotation(cabinet, room)).toBeCloseTo(expected[wall], 12);
      expect(existingCabinetTransform(cabinet, room).rotation).toBeCloseTo(expected[wall], 12);
      expect(existingCabinetTransform(appliance, room).rotation).toBeCloseTo(expected[wall], 12);
    }
  });

  it("uses the persisted 2D plan instead of starter suggestions for any saved entity, not only cabinets", () => {
    expect(hasPersistedTwoDScene({ placed: [], openings: [], sinks: [], island: null, furniture: [], ponyWalls: [] })).toBe(false);
    expect(hasPersistedTwoDScene({ placed: [], openings: [{ uid: "window" } as never], sinks: [], island: null, furniture: [], ponyWalls: [] })).toBe(true);
    expect(hasPersistedTwoDScene({ placed: [], openings: [], sinks: [], island: { x: 0, y: 0, width: 48, depth: 24 }, furniture: [], ponyWalls: [] })).toBe(true);
  });

  it("maps persisted island, pony-wall, and furniture coordinates into the same inch-based 3D positions", () => {
    expect(islandZoneTransform({ x: 36, y: 48, width: 72, depth: 36 })).toMatchObject({
      x: 6,
      z: 5.5,
      baseWidth: 6,
      baseDepth: 3,
      counterWidth: 6.125,
      counterDepth: 3.125,
    });
    expect(ponyWallTransform({ x: 12, y: 24, width: 48, depth: 6, height: 42 })).toEqual({
      x: 3,
      y: 1.75,
      z: 2.25,
      width: 4,
      depth: 0.5,
      height: 3.5,
    });
    expect(furnitureTransform({ x: 24, y: 36, rotation: 90 } as never, 48, 30)).toEqual({
      x: 4,
      z: 4.25,
      rotation: Math.PI / 2,
    });
  });

  it("retains every persisted 2D entity alongside its deterministic 3D conversion contract", () => {
    const cabinet = {
      uid: "contract-base", cabinetId: 5, masterCode: "B-24", description: "Base Cabinet", placement: "base",
      x: 12, y: 24, width: 24, depth: 24, height: 34.5, rotation: 0, numberOfDoors: 2, numberOfDrawers: 1,
      customProfile: "standard_base", drawerLayout: JSON.stringify([{ count: 1, height: 6 }]), styleId: 330001,
    } as never;
    const snapshot = threeDDesignParitySnapshot({
      roomOverride: { width: 144, depth: 120, ceilingHeight: 96 },
      placed: [cabinet],
      openings: [{ uid: "window", kind: "window", label: "Window", side: "top", offset: 36, width: 30, height: 36, sill: 42 } as never],
      sinks: [{ uid: "sink", type: "single", x: 24, y: 48, width: 30, depth: 22, faucet: true } as never],
      island: { x: 36, y: 48, width: 72, depth: 36 },
      furniture: [{ uid: "unknown-furniture", defId: "unknown", x: 60, y: 60, rotation: 90 } as never],
      ponyWalls: [{ uid: "pony", x: 24, y: 36, width: 48, depth: 6, height: 42 } as never],
      catalogDoorSampleUrl: "/manus-storage/door-sample.png",
      catalogFinishOverride: "#f6f4ef",
      catalogFinishName: "Aspen White",
      catalogCountertopName: "Black Granite",
      catalogCountertopColor: "#2c2f33",
      initialPresentation: { cabinetFinish: "#f6f4ef", countertopFinish: "#2c2f33" },
    });

    expect(snapshot).toMatchObject({
      room: { width: 144, depth: 120, ceilingHeight: 96 },
      materials: {
        doorSampleUrl: "/manus-storage/door-sample.png",
        cabinetColor: "#f6f4ef",
        cabinetName: "Aspen White",
        countertopName: "Black Granite",
        countertopColor: "#2c2f33",
        presentation: { cabinetFinish: "#f6f4ef", countertopFinish: "#2c2f33" },
      },
      cabinets: [{ source: cabinet, footprint: { w: 24, d: 24 }, transform: { x: 24, z: 36, rotation: 0, bottom: 0 }, countertopSupported: true }],
      openings: [{ source: { uid: "window" }, transform: { x: 51, z: 0.06, rotation: 0 } }],
      sinks: [{ source: { uid: "sink" }, transform: { x: 3.25 } }],
      island: { source: { x: 36, y: 48, width: 72, depth: 36 }, transform: { x: 6, z: 5.5 } },
      furniture: [{ source: { uid: "unknown-furniture", rotation: 90 }, definition: null, transform: null }],
      ponyWalls: [{ source: { uid: "pony" }, transform: { x: 4, y: 1.75, z: 3.25 } }],
    });
    expect(snapshot.sinks[0]!.transform.z).toBeCloseTo(59 / 12, 12);
    expect(snapshot.cabinets[0]!.sku).toMatchObject({ masterCode: "B-24", numberOfDoors: 2, numberOfDrawers: 1, graphicType: "standard_base" });
  });

  it("forces the active WebGL preview to rebuild whenever any saved 2D scene input changes", () => {
    const room = { width: 144, depth: 120 };
    const base = threeDSceneRevisionKey(room, [], [], [], null, [], [], "sample-a");
    const cabinet = { uid: "cab", cabinetId: 1, masterCode: "B-24", description: "Base", placement: "base", x: 0, y: 0, width: 24, depth: 24, rotation: 0 } as never;
    const opening = { uid: "window", kind: "window", side: "top", offset: 0, width: 30, height: 30, sillHeight: 36 } as never;
    const sink = { uid: "sink", type: "single_bowl", x: 24, y: 0, width: 30, depth: 20, faucet: true } as never;
    const furniture = { uid: "table", defId: "table-48", x: 48, y: 60, rotation: 90 } as never;
    const ponyWall = { uid: "pony", x: 24, y: 24, width: 48, depth: 6, height: 42 } as never;
    expect(threeDSceneRevisionKey(room, [cabinet], [], [], null, [], [], "sample-a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [opening], [], null, [], [], "sample-a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [sink], null, [], [], "sample-a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], null, [], [], "sample-b")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], null, [], [], "sample-a", "black-granite")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], null, [], [], "sample-a", null, "#49604a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], { x: 48, y: 48, width: 60, depth: 30 }, [], [], "sample-a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], null, [furniture], [], "sample-a")).not.toBe(base);
    expect(threeDSceneRevisionKey(room, [], [], [], null, [], [ponyWall], "sample-a")).not.toBe(base);
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

  it("uses the saved room ceiling when a short wall cabinet is top-aligned in 3D", () => {
    const shortWall = {
      uid: "short-wall", cabinetId: 11, masterCode: "W-30-24", description: "24 inch Wall Cabinet", placement: "wall",
      x: 0, y: 0, width: 30, depth: 12, height: 24, rotation: 0,
    } as never;
    expect(existingCabinetTransform(shortWall, { ceilingHeight: 108 })).toMatchObject({ bottom: 72 });
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

  it("uses the shared 2D footprint for every corner family while preserving mesh-local quarter turns", () => {
    const blind = {
      uid: "blind", cabinetId: 1, masterCode: "BBC-36", description: "Blind Corner Base",
      placement: "base", x: 0, y: 0, width: 36, depth: 6, height: 34.5, rotation: 90,
    } as never;
    const lCorner = {
      uid: "easy-reach", cabinetId: 2, masterCode: "ERB-33", description: "Easy Reach Corner",
      placement: "base", x: 36, y: 0, width: 33, depth: 24, height: 34.5, rotation: 0,
    } as never;
    const endReturn = {
      uid: "end-return", cabinetId: 3, masterCode: "BEC-24", description: "Base End Cabinet",
      placement: "base", x: 72, y: 0, width: 24, depth: 24, height: 34.5, rotation: 90,
    } as never;

    expect(threeDCornerBodyDimensions(blind)).toEqual({ width: 36, depth: 24 });
    expect(existingCabinetTransform(blind)).toMatchObject({ x: 12, z: 18, rotation: Math.PI / 2 });
    expect(existingCabinetSku(blind)).toMatchObject({ width: 36, depth: 24 });
    expect(threeDCornerBodyDimensions(lCorner)).toEqual({ width: 36, depth: 36 });
    expect(existingCabinetSku(lCorner)).toMatchObject({ width: 36, depth: 36 });
    expect(threeDCornerBodyDimensions(endReturn)).toEqual({ width: 24, depth: 24 });
    expect(existingCabinetSku(endReturn)).toMatchObject({ width: 24, depth: 24 });
  });

  it("audits every supported corner family through its shared 2D shape, 3D front, and countertop contract", () => {
    const room = { width: 144, depth: 144, ceilingHeight: 96 } as never;
    const families = [
      { uid: "triangle", cabinetId: 1, masterCode: "BTC-24", description: "Triangle Corner Base", placement: "base", x: 0, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0, cornerType: "triangle", numberOfDoors: 2, numberOfDrawers: 0 },
      { uid: "blind", cabinetId: 2, masterCode: "BBC-36", description: "Blind Corner Base", placement: "base", x: 108, y: 0, width: 36, depth: 24, height: 34.5, rotation: 90, cornerType: "blind-corner", numberOfDoors: 1, numberOfDrawers: 0 },
      { uid: "diagonal", cabinetId: 3, masterCode: "WDC2430", description: "Diagonal Wall Corner", placement: "wall", x: 0, y: 0, width: 24, depth: 12, height: 30, rotation: 0, cornerType: "diagonal", numberOfDoors: 2, numberOfDrawers: 0 },
      { uid: "l-corner", cabinetId: 4, masterCode: "LS3612", description: "Lazy Susan Base", placement: "base", x: 108, y: 108, width: 36, depth: 24, height: 34.5, rotation: 180, cornerType: "lazy-susan", numberOfDoors: 2, numberOfDrawers: 0 },
      { uid: "wall-l-corner", cabinetId: 5, masterCode: "WLS2424", description: "Wall Lazy Susan", placement: "wall", x: 108, y: 108, width: 24, depth: 12, height: 30, rotation: 180, cornerType: "lazy-susan", numberOfDoors: 2, numberOfDrawers: 0 },
      { uid: "corner-drawer", cabinetId: 6, masterCode: "CDB36", description: "Corner Drawer Base", placement: "base", x: 0, y: 108, width: 36, depth: 24, height: 34.5, rotation: 270, cornerType: "l-shape", numberOfDoors: 0, numberOfDrawers: 3 },
      { uid: "end-return", cabinetId: 7, masterCode: "BEC-24", description: "Base End Cabinet", placement: "base", x: 54, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0, numberOfDoors: 2, numberOfDrawers: 0 },
    ] as never[];
    const expectedKinds = ["triangle", "blind-corner", "diagonal", "l-shape", "l-shape", "corner-drawer", "base-end"];
    expect(families.map(placedCornerGeometryKind)).toEqual(expectedKinds);
    expect(families.map((record) => existingCabinetTransform(record, room).rotation)).toEqual([
      0,
      Math.PI / 2,
      0,
      Math.PI,
      Math.PI,
      Math.PI * 1.5,
      0,
    ]);
    const root = new THREE.Group();
    for (const record of families) {
      const sku = existingCabinetSku(record);
      expect(sku.cornerGeometryKind).toBe(placedCornerGeometryKind(record));
      addCabinet(root, sku, null, {}, room.width, room.depth, "#7e8d72", "#f8f8f6", undefined, existingCabinetTransform(record, room));
    }
    const nodes: THREE.Object3D[] = [];
    root.traverse((node) => nodes.push(node));
    expect(nodes.filter((node) => node.userData.triangleCornerWedge)).toHaveLength(1);
    expect(nodes.filter((node) => node.userData.triangleDoor)).toHaveLength(2);
    expect(nodes.filter((node) => node.userData.triangleCornerCountertop)).toHaveLength(1);
    expect(nodes.filter((node) => node.userData.blindCornerBody)).toHaveLength(1);
    expect(nodes.filter((node) => node.userData.blindCornerCountertop)).toHaveLength(1);
    expect(nodes.filter((node) => node.userData.diagonalCornerWedge)).toHaveLength(1);
    const lCornerDoors = nodes.filter((node) => node.userData.lCornerDoor) as THREE.Mesh[];
    expect(lCornerDoors).toHaveLength(4);
    const wallLCorner = root.children.find((node) => node.userData.masterCode === "WLS2424")!;
    const wallLegs = wallLCorner.children.filter((node) => node.userData.lCornerCarcass) as THREE.Mesh[];
    expect(wallLegs.map((leg) => (leg.geometry as THREE.BoxGeometry).parameters).map((parameters) => Math.min(parameters.width, parameters.depth)).sort()).toEqual([1, 1]);
    expect(nodes.filter((node) => node.userData.cornerDrawerFace)).toHaveLength(3);
    expect(nodes.filter((node) => node.userData.nonCornerEndReturnDoor)).toHaveLength(2);
    expect(nodes.filter((node) => node.userData.nonCornerEndReturnBody)).toHaveLength(1);
    expect(nodes.filter((node) => node.userData.endReturnCountertop)).toHaveLength(1);
    expect(nodes.filter((node) => node.userData.lCornerCountertop)).toHaveLength(4);
    expect(triangleCornerFootprintVertices(2, 2)).toEqual([{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }]);
    expect(triangleCornerFrontWidth(24, 24)).toBeCloseTo(Math.hypot(24, 24), 12);
  });

  it("preserves a legacy triangle-corner's exact non-square shared 2D envelope in its 3D wedge", () => {
    const legacyTriangle = {
      uid: "legacy-btc30", cabinetId: 8, masterCode: "BTC-30", description: "Triangle Corner Base",
      placement: "base", x: 0, y: 0, width: 30, depth: 24, height: 34.5, rotation: 0,
      cornerType: "triangle", numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    expect(placedCornerGeometryKind(legacyTriangle)).toBe("triangle");
    expect(existingCabinetTransform(legacyTriangle)).toEqual({ x: 15, z: 12, rotation: 0, bottom: 0 });
    expect(existingCabinetSku(legacyTriangle)).toMatchObject({ width: 30, depth: 24, cornerGeometryKind: "triangle" });
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
    expect(placedCornerGeometryKind(wdc)).toBe("diagonal");
    expect(mapped).toMatchObject({ masterCode: "WDC2442", width: 24, depth: 24, cornerType: "diagonal" });
    expect(resolvedThreeDSpecialtyProfile(mapped)).toEqual({ kind: "diagonal-corner", pattern: null });
    expect(diagonalCornerFootprintVertices(2, 2)).toEqual([
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 1 },
    ]);
  });

  it("uses the 17-inch diagonal front created by two 12-inch WDC returns", () => {
    expect(diagonalCornerFrontWidth(24, 24)).toBeCloseTo(Math.hypot(12, 12), 8);
    expect(diagonalCornerFrontWidth(24, 24)).toBeCloseTo(16.97056275, 6);
  });

  it("maps LS3612 through the restored saved 36-inch L-corner conversion as its 2D footprint", () => {
    const ls36 = {
      uid: "ls36", cabinetId: 3612, masterCode: "LS3612", description: "36 inch Lazy Susan Base Cabinet",
      placement: "base", x: 0, y: 0, width: 36, depth: 24, height: 34.5, rotation: 0,
      numberOfDoors: 2, numberOfDrawers: 0, cornerType: "lazy-susan",
    } as never;
    const mapped = existingCabinetSku(ls36);
    expect(placedCornerGeometryKind(ls36)).toBe("l-shape");
    expect(mapped).toMatchObject({ masterCode: "LS3612", width: 36, depth: 36, cornerType: "l-shape" });
    expect(resolvedThreeDSpecialtyProfile(mapped)).toEqual({ kind: "l-corner", pattern: null });
    const lShape = lCornerCarcassParts(3, 3);
    expect(lShape).toMatchObject({
      backLeg: { width: 3, depth: 2 },
      sideLeg: { width: 2, depth: 1 },
    });
    expect(lShape.backLeg.width).toBe(36 / 12);
    expect(lShape.backLeg.depth).toBe(24 / 12);
    expect(lShape.backLeg.width - lShape.sideLeg.width).toBe(12 / 12);
  });

  it("uses the LS36 36-by-36 L envelope for CDB36 while retaining CDB’s corner-drawer front", () => {
    const cdb36 = {
      uid: "cdb36", cabinetId: 9390027, masterCode: "CDB36", description: '36" Corner Drawer Base Cabinet',
      placement: "base", x: 0, y: 0, width: 36, depth: 24, height: 34.5, rotation: 0,
      numberOfDoors: 0, numberOfDrawers: 3, cornerType: "l-shape",
    } as never;
    const ls36 = {
      uid: "ls36", cabinetId: 3612, masterCode: "LS3612", description: "36 inch Lazy Susan Base Cabinet",
      placement: "base", x: 0, y: 0, width: 36, depth: 24, height: 34.5, rotation: 0,
      numberOfDoors: 2, numberOfDrawers: 0, cornerType: "lazy-susan",
    } as never;
    const cdbSku = existingCabinetSku(cdb36);
    const lsSku = existingCabinetSku(ls36);
    expect(cdbSku).toMatchObject({ width: 36, depth: 36, height: 34.5 });
    expect(lsSku).toMatchObject({ width: 36, depth: 36, height: 34.5 });
    expect(resolvedThreeDSpecialtyProfile(cdbSku)).toEqual({ kind: "corner-drawer", pattern: null });
    expect(resolvedThreeDSpecialtyProfile(lsSku)).toEqual({ kind: "l-corner", pattern: null });
  });

  it("mounts persisted LS3612 doors and Shaker rails on the restored two-leg L-corner face", () => {
    const ls36 = {
      uid: "live-ls36", cabinetId: 9390049, masterCode: "LS3612", description: "36 inch Lazy Susan Base Cabinet",
      placement: "base", x: 0, y: 0, width: 36, depth: 24, height: 34.5, rotation: 0,
      numberOfDoors: 2, numberOfDrawers: 0, cornerType: "lazy-susan",
    } as never;
    const root = new THREE.Group();
    addCabinet(root, existingCabinetSku(ls36), null, {}, 144, 120, "#f2f0ea", "#ffffff", { doorStyle: "Shaker", doorPanelType: null }, existingCabinetTransform(ls36));
    const lCornerDoors: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.lCornerDoor) lCornerDoors.push(node); });
    const texturedSideSkins: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.selectedStyleSideSkin) texturedSideSkins.push(node); });

    expect(lCornerDoors).toHaveLength(2);
    expect(texturedSideSkins).toHaveLength(2);
    expect(lCornerDoors.every((door) => door.userData.cabinetFront === true)).toBe(true);
    expect(texturedSideSkins.every((skin) => skin.userData.cabinetFront !== true)).toBe(true);
    expect(texturedSideSkins.every((skin) => {
      const material = (skin as THREE.Mesh).material as THREE.MeshStandardMaterial;
      return material.userData.selectedFinishSideSkin === true
        && material.userData.usesDoorImage === false
        && material.map === null;
    })).toBe(true);
    expect(lCornerDoors.map((door) => door.userData.lCornerDoor).sort()).toEqual(["back-leg", "side-leg"]);
    expect(lCornerDoors.map((door) => door.rotation.y).sort((a, b) => a - b)).toEqual([0, Math.PI / 2]);
    root.updateMatrixWorld(true);
    const cabinet = root.children.find((node) => node.userData.masterCode === "LS3612")!;
    const cabinetPosition = new THREE.Vector3();
    cabinet.getWorldPosition(cabinetPosition);
    for (const door of lCornerDoors) {
      const doorPosition = new THREE.Vector3();
      door.getWorldPosition(doorPosition);
      expect(Math.abs(doorPosition.z - cabinetPosition.z)).toBeLessThanOrEqual(1.55);
    }
    for (const door of lCornerDoors) {
      const mesh = door as THREE.Mesh;
      expect((mesh.geometry as THREE.BoxGeometry).parameters.width).toBeCloseTo(12 / 12 - 0.09, 12);
    }
    const shakerFrames: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.selectedStyleFace === "shaker") shakerFrames.push(node); });
    expect(shakerFrames.length).toBeGreaterThan(0);
    const interiorEdgeLines: THREE.Object3D[] = [];
    root.traverse((node) => { if (node instanceof THREE.LineSegments) interiorEdgeLines.push(node); });
    expect(interiorEdgeLines).toHaveLength(0);
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

  it("uses the existing single-oven 2D drawer contract despite stale saved drawer rows", () => {
    const layout = resolvedThreeDOvenLayout({
      height: 84, numberOfDoors: 2, numberOfDrawers: 3, doorHeight: 18,
      drawerLayout: JSON.stringify([{ count: 1, height: 6 }, { count: 2, height: 5 }]),
      openingType: "middle", ovenType: "single",
    });
    expect(layout.doorZone).toBe(19.5 / 12);
    expect(layout.drawerRows).toEqual([
      { count: 1, height: 11 / 12 },
      { count: 1, height: 11 / 12 },
      { count: 1, height: 11 / 12 },
    ]);
    expect(layout.openingHeight).toBeCloseTo(27 / 12, 12);
    expect(layout.openingPosition).toBe("middle");
  });

  it("restores the two-door single-oven bridge when a legacy saved tower reports zero doors", () => {
    const layout = resolvedThreeDOvenLayout({
      height: 84,
      numberOfDoors: 0,
      numberOfDrawers: 3,
      openingType: "middle",
      ovenType: "single",
    });
    expect(layout.doorCount).toBe(2);
    expect(layout.doorZone).toBe(19.5 / 12);
    expect(layout.openingHeight).toBe(27 / 12);
  });

  it("uses the 21-inch standard-face boundary in 3D while keeping the diagonal wall corner’s two-door specialty face", () => {
    expect(resolvedThreeDFaceLayout({ width: 21, numberOfDoors: null }).doorCount).toBe(1);
    expect(resolvedThreeDFaceLayout({ width: 22, numberOfDoors: null }).doorCount).toBe(2);
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -2430,
      cabinetId: 2430,
      masterCode: "WDC2430",
      description: '24" Wall Diagonal Corner Cabinet',
      placementType: "wall",
      width: 24,
      height: 30,
      depth: 24,
      numberOfDoors: 0,
      numberOfDrawers: 0,
      cornerType: "diagonal",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    const diagonalDoors: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.diagonalDoor) diagonalDoors.push(node); });
    expect(diagonalDoors).toHaveLength(2);
  });

  it("uses Cabinet Config face facts without interpreting generic labels into a different 3D construction", () => {
    expect(resolvedThreeDFaceLayout({
      width: 30,
      description: '30" Double Door Two Drawer Base Cabinet',
      numberOfDoors: 0,
      numberOfDrawers: 0,
    })).toMatchObject({ doorCount: 2, drawerCount: 2 });
    expect(resolvedThreeDFaceLayout({
      width: 30,
      description: "Base Cabinet",
      numberOfDoors: 2,
      numberOfDrawers: 1,
    })).toMatchObject({ doorCount: 2, drawerCount: 1 });
  });

  it("uses the exact remaining 84-, 90-, and 96-inch height for the single-oven two-door bridge", () => {
    expect(singleOvenTowerAssembly(84)).toMatchObject({ baseHeightIn: 34.5, ovenHeightIn: 27, fillerHeightIn: 3, bridgeHeightIn: 19.5 });
    expect(singleOvenTowerAssembly(90).bridgeHeightIn).toBe(25.5);
    expect(singleOvenTowerAssembly(96).bridgeHeightIn).toBe(31.5);
  });

  it("centers a 27-inch single-oven opening inside a 30-inch cabinet enclosure", () => {
    expect(ovenOpeningGeometry(30, "single")).toEqual({ width: 27, horizontalInset: 1.5 });
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -30,
      cabinetId: 30,
      masterCode: "O309024",
      description: '30" Single Oven Cabinet',
      placementType: "tall",
      width: 30,
      height: 90,
      depth: 24,
      numberOfDoors: 2,
      numberOfDrawers: 3,
      ovenType: "single",
      openingType: "middle",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");

    const ovenOpenings: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.ovenOpeningWidthIn != null) ovenOpenings.push(node);
    });
    expect(ovenOpenings).toHaveLength(1);
    expect(ovenOpenings[0]!.userData).toMatchObject({ ovenOpeningWidthIn: 27, singleOvenInsetIn: 1.5 });
    expect((ovenOpenings[0]!.geometry as THREE.BoxGeometry).parameters.width).toBeCloseTo(27 / 12, 12);
    expect(ovenOpenings[0]!.position.x).toBe(0);
  });

  it("uses one 11-inch bottom drawer for a double-oven tower without applying single-oven defaults", () => {
    const layout = resolvedThreeDOvenLayout({
      height: 90, numberOfDoors: 2, numberOfDrawers: 1, doorHeight: 20, drawerHeight: 6,
      openingType: "bottom", ovenType: "double",
    });
    expect(layout.ovenCount).toBe(2);
    expect(layout.openingPosition).toBe("bottom");
    expect(layout.drawerRows).toEqual([{ count: 1, height: 11 / 12 }]);
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
    expect(layout.drawerRows).toEqual([{ count: 1, height: expect.closeTo(11 / 12, 12) }]);
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

  it("keeps every wall cabinet's saved 2D center while turning its front into the room", () => {
    const room = { width: 144, depth: 120, ceilingHeight: 96 } as never;
    const fixtures = [
      { uid: "top", cabinetId: 1, masterCode: "B-24", description: "Back wall", placement: "base", x: 30, y: 0, width: 24, depth: 12, height: 34.5, rotation: 180, expected: { x: 42, z: 6, rotation: 0 } },
      { uid: "bottom", cabinetId: 2, masterCode: "B-24", description: "Front wall", placement: "base", x: 30, y: 108, width: 24, depth: 12, height: 34.5, rotation: 0, expected: { x: 42, z: 114, rotation: Math.PI } },
      { uid: "left", cabinetId: 3, masterCode: "B-24", description: "Left wall", placement: "base", x: 0, y: 30, width: 24, depth: 12, height: 34.5, rotation: 270, expected: { x: 6, z: 42, rotation: Math.PI / 2 } },
      { uid: "right", cabinetId: 4, masterCode: "B-24", description: "Right wall", placement: "base", x: 132, y: 30, width: 24, depth: 12, height: 34.5, rotation: 90, expected: { x: 138, z: 42, rotation: -Math.PI / 2 } },
    ] as never[];
    fixtures.forEach((fixture) => {
      const transform = existingCabinetTransform(fixture, room);
      expect(transform).toMatchObject({ ...fixture.expected, bottom: 0 });
    });
  });

  it("does not invent a range hood in 3D when the saved 2D appliance plan contains only a range", () => {
    expect(rangeHoodSceneStatus([{ masterCode: "RANGE-30" } as never])).toEqual({ hasRange: true, hasRangeHood: false, needs2DPlacement: true });
    expect(rangeHoodSceneStatus([{ masterCode: "RANGE-30" } as never, { masterCode: "HOOD-30" } as never])).toEqual({ hasRange: true, hasRangeHood: true, needs2DPlacement: false });
  });

  it("retains the active hood, refrigerator, and supported countertop run in the deterministic visibility contract", () => {
    const room = { width: 144, depth: 145, ceilingHeight: 96 };
    const contract = threeDSceneVisibilityContract([
      { uid: "hood", cabinetId: 0, masterCode: "HOOD-30", description: "Range Hood", placement: "appliance", x: 3.5, y: 45, width: 30, depth: 18, height: 18, rotation: 90, mountBottom: 66 },
      { uid: "fridge", cabinetId: 0, masterCode: "FRIDGE-36", description: "Refrigerator", placement: "appliance", x: 0.75, y: 108, width: 36, depth: 30, height: 72, rotation: 90 },
      { uid: "dw", cabinetId: 0, masterCode: "DW-24", description: "Dishwasher", placement: "appliance", x: 24, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0 },
      { uid: "range", cabinetId: 0, masterCode: "RANGE-30", description: "Range", placement: "appliance", x: 0, y: 45, width: 30, depth: 25, height: 36, rotation: 90, mountBottom: 0 },
    ] as never, room);

    expect(contract.hood).toMatchObject({ masterCode: "HOOD-30", transform: { x: 12.5, z: 60, bottom: 66 }, geometry: { width: 2.5, depth: 1.5, height: 1.5 } });
    expect(contract.tall).toMatchObject([{ masterCode: "FRIDGE-36", transform: { x: 15.75, z: 126, bottom: 0 } }]);
    expect(contract.countertopSupport).toEqual(["DW-24"]);
  });

  it("preserves the mobile scene’s visible hood, tall enclosure, and continuous dishwasher-supported surface", () => {
    const contract = threeDSceneVisibilityContract([
      { uid: "hood", cabinetId: 0, masterCode: "HOOD-30", description: "Range Hood", placement: "appliance", x: 3.5, y: 45, width: 30, depth: 18, height: 18, rotation: 90, mountBottom: 66 },
      { uid: "tall", cabinetId: 0, masterCode: "FRIDGE-36", description: "Refrigerator", placement: "appliance", x: 0.75, y: 108, width: 36, depth: 30, height: 72, rotation: 90 },
      { uid: "dishwasher", cabinetId: 0, masterCode: "DW-24", description: "Dishwasher", placement: "appliance", x: 24, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0 },
      { uid: "range", cabinetId: 0, masterCode: "RANGE-30", description: "Range", placement: "appliance", x: 0, y: 45, width: 30, depth: 25, height: 36, rotation: 90, mountBottom: 0 },
    ] as never, { width: 144, depth: 145, ceilingHeight: 96 });

    expect(contract.hood?.transform.bottom).toBe(66);
    expect(contract.tall).toHaveLength(1);
    expect(contract.tall[0]!.transform.bottom).toBe(0);
    expect(contract.countertopSupport).toEqual(["DW-24"]);
    expect(shouldRenderCountertopOverSceneItem("appliance", "RANGE-30")).toBe(false);
  });

  it("places a saved 2D window at its exact wall offset in the 3D room", () => {
    expect(openingTransform({
      uid: "window-1", kind: "window", label: "Window", side: "top", offset: 42, width: 36, height: 36, sill: 42,
    }, 144, 120)).toEqual({ x: 60, z: 0.06, rotation: 0 });
  });

  it("places a saved sink basin and faucet at the same 2D countertop coordinates", () => {
    const sink = {
      uid: "sink-1", type: "single_bowl", x: 24, y: 48, width: 30, depth: 22, faucet: true,
    } as never;
    const transform = sinkFixtureTransform(sink);
    const faucet = sinkFaucetTransform(sink);
    expect(transform.x).toBe(3.25);
    expect(transform.z).toBeCloseTo(4.916666666666667, 12);
    expect(transform.countertopTop).toBeCloseTo(3, 12);
    expect(faucet.z).toBeLessThan(transform.z);
    expect(faucet.z).toBeCloseTo(4.348333333333334, 12);
  });

  it("uses a 24¼-inch countertop depth on every standard supported base run", () => {
    expect(threeDCountertopDepthIn(24)).toBe(24.25);
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -24, cabinetId: 24, masterCode: "DW-24", description: "Dishwasher", placementType: "appliance",
      width: 24, height: 30, depth: 24, numberOfDoors: 0, numberOfDrawers: 0,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 48, z: 12, rotation: 0, bottom: 0 });
    let countertop: THREE.Mesh | null = null;
    root.traverse((node) => { if (node instanceof THREE.Mesh && node.userData.dishwasherCountertopSupport) countertop = node; });
    expect(countertop).not.toBeNull();
    expect(((countertop!.geometry as THREE.BoxGeometry).parameters.depth) * 12).toBeCloseTo(24.25, 8);
  });

  it("mounts a saved range hood directly to the wall without a cabinet-finish backing box", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -30, cabinetId: 30, masterCode: "HOOD-30", description: "30 inch Range Hood", placementType: "appliance",
      width: 30, height: 18, depth: 18, numberOfDoors: 0, numberOfDrawers: 0, mountBottom: 66,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 36, z: 12, rotation: 0, bottom: 66 });
    const hoodRoot = root.children[0]!;
    const canopies: THREE.Object3D[] = [];
    const cabinetBackings: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.rangeHoodCanopy) canopies.push(node);
      if (node.userData.selectedStyleSideSkin) cabinetBackings.push(node);
    });
    expect(hoodRoot.userData.wallMountedAppliance).toBe(true);
    expect(hoodRoot.userData.noCabinetBacking).toBe(true);
    expect(canopies).toHaveLength(1);
    expect(cabinetBackings).toHaveLength(0);
  });

  it("extends the countertop over a saved dishwasher but not over tall or wall scene items", () => {
    expect(shouldRenderCountertopOverSceneItem("appliance", "DW-24")).toBe(true);
    expect(shouldRenderCountertopOverSceneItem("appliance", "WINE-24")).toBe(true);
    expect(shouldRenderCountertopOverSceneItem("base", "B-33")).toBe(true);
    expect(shouldRenderCountertopOverSceneItem("base", "RANGE-30")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("base", "FILL-3", "3 inch Filler")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("base", "REP2496", "Refrigerator End Panel")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("base", "FRIDGE-36", "36 inch Refrigerator")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("appliance", "RANGE-30")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("wall", "W-30-42")).toBe(false);
    expect(shouldRenderCountertopOverSceneItem("tall", "B-33")).toBe(false);
  });

  it("centers the range oven face and reserves a measured lower storage drawer", () => {
    const layout = rangeOvenFrontLayout(3);
    expect(layout.openingHeight).toBeCloseTo(1.62, 12);
    expect(layout.openingCenterY).toBeGreaterThan(0);
    expect(layout.drawerHeight).toBeCloseTo(0.42, 12);
    expect(layout.drawerCenterY).toBeCloseTo(-1.25, 12);
  });

  it("renders a physical cooktop and four burners with a 34½-inch finished-floor cooking surface", () => {
    const cooktop = rangeCooktopLayout(30 / 12, 25 / 12, 36 / 12);
    expect(cooktop.cooktopWidth).toBeCloseTo(2.38, 12);
    expect(cooktop.cooktopDepth).toBeCloseTo((25 / 12) - 0.12, 12);
    expect(cooktop.cookingSurfaceY).toBeCloseTo(1.375, 12);
    expect(cooktop.topY + cooktop.cooktopThickness / 2).toBeCloseTo(1.375, 12);
    expect(cooktop.burnerCenters).toHaveLength(4);
    expect(cooktop.burnerCenters[0]?.x).toBeCloseTo(-0.5712, 12);
    expect(cooktop.burnerCenters[0]?.z).toBeCloseTo(-0.45156666666666667, 12);
  });

  it("uses a 47-inch backguard top above the shared 34½-inch freestanding range cooktop", () => {
    const profile = freestandingRangeHeightProfile(0, 36 / 12);
    expect(profile.cookingSurfaceIn).toBe(34.5);
    expect(profile.backguardTopIn).toBe(47);
    expect(profile.backguardHeight * 12).toBeCloseTo(12.5, 8);
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

  it("keeps diagonal and end-return Shaker frames in the same angled pose as their specialty door faces", () => {
    expect(threeDShakerFramePose(-0.4, 0, 0.066, Math.PI / 4)).toEqual({ x: -0.4, y: 0, z: 0.066, rotationY: Math.PI / 4 });
    expect(threeDShakerFramePose(0.4, 0, 0.066, -Math.PI / 4)).toEqual({ x: 0.4, y: 0, z: 0.066, rotationY: -Math.PI / 4 });
  });

  it("physically builds selected-style Shaker frame groups on standard, tall, diagonal, and end-return faces", () => {
    const profile = { doorStyle: "Shaker", doorPanelType: "Recessed Panel" };
    const fixtures = [
      { masterCode: "B-24", description: "Base Cabinet", placementType: "base", width: 24, height: 34.5, depth: 24, numberOfDoors: 2, numberOfDrawers: 1, expectedRotations: [0, 0, 0] },
      { masterCode: "T-24", description: "Tall Cabinet", placementType: "tall", width: 24, height: 84, depth: 24, numberOfDoors: 2, numberOfDrawers: 0, expectedRotations: [0, 0] },
      { masterCode: "WDC2430", description: "Diagonal Wall Corner", placementType: "wall", width: 24, height: 30, depth: 24, numberOfDoors: 2, numberOfDrawers: 0, cornerType: "diagonal", expectedRotations: [Math.PI / 4, Math.PI / 4] },
      { masterCode: "BEC-24", description: "Base End Cabinet", placementType: "base", width: 24, height: 34.5, depth: 24, numberOfDoors: 2, numberOfDrawers: 0, customProfile: "base_end_return", expectedRotations: [-Math.PI / 4, Math.PI / 4] },
    ];

    for (const fixture of fixtures) {
      const root = new THREE.Group();
      addCabinet(root, fixture as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", profile);
      const frames: THREE.Object3D[] = [];
      root.traverse((node) => {
        if (node.userData.physicalRails) frames.push(node);
      });
      expect(frames).toHaveLength(fixture.expectedRotations.length);
      expect(frames.map((frame) => frame.rotation.y)).toEqual(fixture.expectedRotations);
      expect(frames.every((frame) => frame.children.filter((child) => child.userData.physicalRail).length === 4)).toBe(true);
    }
  });

  it("builds a legacy WDC2430 as one flush diagonal side-skin wedge with two angled front doors, never a generic wall panel", () => {
    const legacyWdc2430 = existingCabinetSku({
      uid: "legacy-wdc2430",
      cabinetId: 9390172,
      masterCode: "WDC2430",
      description: '24" x 30" Wall Diagonal Corner Cabinet',
      category: "Wall",
      placement: "wall",
      x: 0,
      y: 0,
      width: 24,
      height: 30,
      depth: 12,
      rotation: 0,
      cornerType: null,
      numberOfDoors: 0,
      numberOfDrawers: 0,
    } as never);
    const root = new THREE.Group();
    addCabinet(root, legacyWdc2430, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "Recessed Panel" });

    const wedges: THREE.Object3D[] = [];
    const doors: THREE.Object3D[] = [];
    const genericFrontPanels: THREE.Object3D[] = [];
    const unexpectedMeshes: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.diagonalCornerWedge) wedges.push(node);
      if (node.userData.diagonalDoor) doors.push(node);
      if (node.userData.cabinetFront && !node.userData.diagonalDoor) genericFrontPanels.push(node);
      if (
        node instanceof THREE.Mesh &&
        !node.userData.diagonalCornerWedge &&
        !node.userData.diagonalDoor &&
        !node.userData.physicalRail
      ) {
        unexpectedMeshes.push(node);
      }
    });

    expect(legacyWdc2430).toMatchObject({ width: 24, depth: 24, cornerType: "diagonal" });
    expect(wedges).toHaveLength(1);
    expect(wedges[0]!.userData.selectedStyleSideSkin).toBe(true);
    root.updateMatrixWorld(true);
    const sideSkinBounds = new THREE.Box3().setFromObject(wedges[0]!);
    expect(sideSkinBounds.max.x - sideSkinBounds.min.x).toBeCloseTo(2, 8);
    expect(sideSkinBounds.max.z - sideSkinBounds.min.z).toBeCloseTo(2, 8);
    expect(sideSkinBounds.max.y - sideSkinBounds.min.y).toBeCloseTo(30 / 12, 8);
    expect(doors).toHaveLength(2);
    expect(doors.map((door) => door.rotation.y)).toEqual([Math.PI / 4, Math.PI / 4]);
    expect(genericFrontPanels).toHaveLength(0);
    expect(unexpectedMeshes).toHaveLength(0);
  });

  it("builds AW1230 as a 12-by-12 angled wall wedge with one side-hinged diagonal door and two adjustable shelves configured", () => {
    const aw1230 = existingCabinetSku({
      uid: "aw1230",
      cabinetId: 9360146,
      masterCode: "AW1230",
      description: '12" Single Door Wall Cabinet with 2 Adjustable Shelves',
      category: "Wall",
      placement: "wall",
      x: 0,
      y: 0,
      width: 12,
      height: 30,
      depth: 12,
      rotation: 0,
      cornerType: null,
      customProfile: "wall_angle",
      numberOfDoors: 1,
      numberOfDrawers: 0,
      adjustableShelfCount: 2,
    } as never);
    const root = new THREE.Group();
    addCabinet(root, aw1230, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "Recessed Panel" });
    const wedges: THREE.Object3D[] = [];
    const doors: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.angledWallWedge) wedges.push(node);
      if (node.userData.angledWallDoor) doors.push(node);
    });
    expect(aw1230).toMatchObject({ width: 12, depth: 12, cornerType: "diagonal" });
    expect(wedges).toHaveLength(1);
    expect(doors).toHaveLength(1);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(wedges[0]!);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(1, 8);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(1, 8);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(30 / 12, 8);
    const pose = triangleCornerFrontPose(1, 1);
    const angledDoor = doors[0] as THREE.Mesh;
    expect(angledDoor.rotation.y).toBeCloseTo(pose.rotation, 8);
    expect(angledDoor.position.x).toBeCloseTo(pose.x, 8);
    expect(angledDoor.position.z).toBeCloseTo(pose.z, 8);
    expect(angledDoor.userData.flushPhysicalFace).toBe(true);
    // The door's 0.052ft depth has a 0.026ft half-depth. Its inner surface
    // remains just outside the triangular hypotenuse instead of penetrating it.
    expect(pose.x * pose.normalX + pose.z * pose.normalZ).toBeGreaterThan(0.026);
  });

  it("normalizes saved BA-24 and BEC-24 records into the supplied rear-apex two-24-inch-side diagram form without refreshed profile metadata", () => {
    for (const masterCode of ["BA-24", "BEC-24"]) {
      const sku = {
        distributorSkuId: -24,
        cabinetId: 24,
        masterCode,
        description: '24" Base End Cabinet',
        placementType: "base",
        width: 24,
        height: 34.5,
        depth: 24,
        numberOfDoors: 2,
        numberOfDrawers: 0,
        cornerType: null,
      } as never;
      expect(resolvedThreeDSpecialtyProfile(sku)).toEqual({ kind: "end-return", pattern: null });
      const root = new THREE.Group();
      addCabinet(root, sku, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
      const returnFaces: THREE.Object3D[] = [];
      root.traverse((node) => { if (node.userData.nonCornerEndReturnDoor) returnFaces.push(node); });
      expect(returnFaces).toHaveLength(2);
      expect(returnFaces.map((face) => face.userData.nonCornerEndReturnDoor).sort()).toEqual(["left", "right"]);
      expect(returnFaces.map((face) => ((face as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width)).toEqual([
        expect.closeTo(8.45 / 12, 6), expect.closeTo(8.45 / 12, 6),
      ]);
      expect(returnFaces.map((face) => face.userData.doorWidthIn)).toEqual([
        expect.closeTo(8.45, 6), expect.closeTo(8.45, 6),
      ]);
      expect(returnFaces.map((face) => face.rotation.y)).toEqual([-Math.PI / 4, Math.PI / 4]);
      expect(returnFaces.every((face) => face.userData.attachedEndFront)).toBe(true);
      expect(returnFaces.every((face) => face.userData.referenceFaceSideIn === 24)).toBe(true);
      for (const apex of returnFaces.map((face) => face.userData.sharedExteriorApex as { x: number; z: number })) {
        expect(apex.x).toBeCloseTo(0, 8);
        expect(apex.z).toBeCloseTo(Math.SQRT2, 8);
      }
      const measuredFrontDoor = returnFaces.find((face) => face.userData.nonCornerEndReturnDoor === "left")!;
      const measuredRightDoor = returnFaces.find((face) => face.userData.nonCornerEndReturnDoor === "right")!;
      // Each short door is attached beside the shared exterior apex. The
      // 24-inch values label rear construction sides, not 24-inch doors.
      const shortDoorCenterOffset = 8.45 / 12 * Math.SQRT1_2 / 2;
      const flushFaceOffset = 0.029 * Math.SQRT1_2;
      expect(measuredFrontDoor.position.x).toBeCloseTo(-shortDoorCenterOffset - flushFaceOffset, 6);
      expect(measuredFrontDoor.position.z).toBeCloseTo(Math.SQRT2 - shortDoorCenterOffset + flushFaceOffset, 6);
      expect(measuredRightDoor.position.x).toBeCloseTo(shortDoorCenterOffset + flushFaceOffset, 6);
      expect(measuredRightDoor.position.z).toBeCloseTo(Math.SQRT2 - shortDoorCenterOffset + flushFaceOffset, 6);
      expect(measuredFrontDoor.rotation.y).toBeCloseTo(-Math.PI / 4, 6);
      expect(measuredRightDoor.rotation.y).toBeCloseTo(Math.PI / 4, 6);
      expect(measuredFrontDoor.userData.flushPhysicalFace).toBe(true);
      expect(measuredRightDoor.userData.flushPhysicalFace).toBe(true);
      const toeKicks: THREE.Object3D[] = [];
      const counters: THREE.Object3D[] = [];
      root.traverse((node) => {
        if (node.userData.baseToeKick) toeKicks.push(node);
        if (node.userData.endReturnCountertop) counters.push(node);
      });
      expect(toeKicks).toHaveLength(2);
      expect(toeKicks.map((kick) => kick.userData.attachedEndFrontToeKick).sort()).toEqual(["left", "right"]);
      expect(toeKicks.every((kick) => kick.userData.toeKickFaceWidthIn === 24 && kick.userData.toeKickHeightIn === 4.5)).toBe(true);
      expect(toeKicks.every((kick) => kick.userData.toeKickRecessIn === 3)).toBe(true);
      expect(toeKicks.map((kick) => ((kick as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width)).toEqual([
        expect.closeTo(24 / 12, 6), expect.closeTo(24 / 12, 6),
      ]);
      const frontKick = toeKicks.find((kick) => kick.userData.attachedEndFrontToeKick === "left") as THREE.Mesh;
      const rightKick = toeKicks.find((kick) => kick.userData.attachedEndFrontToeKick === "right") as THREE.Mesh;
      expect(frontKick.rotation.y).toBeCloseTo(-Math.PI / 4, 8);
      expect(rightKick.rotation.y).toBeCloseTo(Math.PI / 4, 8);
      expect(counters).toHaveLength(1);
      expect(counters[0]!.userData.nonCornerEndReturnCountertop).toBe(true);
      expect(counters[0]!.userData.diagramDefinedRearApexCountertop).toBe(true);
      const counterMesh = counters[0] as THREE.Mesh;
      expect(counterMesh.geometry.type).toBe("ExtrudeGeometry");
      const carcasses: THREE.Mesh[] = [];
      root.traverse((node) => {
        if (node.userData.nonCornerEndReturnBody && node instanceof THREE.Mesh) carcasses.push(node);
      });
      expect(carcasses).toHaveLength(1);
      expect(carcasses[0]!.userData.diagramDefinedRearApexBody).toBe(true);
      expect(carcasses[0]!.userData.sideLengthIn).toBe(24);
      expect(carcasses[0]!.visible).toBe(true);
      expect((carcasses[0] as THREE.Mesh).geometry.type).toBe("ExtrudeGeometry");
      expect(returnFaces).toHaveLength(2);
      expect(returnFaces.every((face) => face.userData.doorWidthIn === 8.45)).toBe(true);
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(carcasses[0]!);
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(24 / 12 * Math.SQRT2, 6);
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(24 / 12 * Math.SQRT2, 6);
      const leftDoor = returnFaces.find((face) => face.userData.nonCornerEndReturnDoor === "left")!;
      const rightDoor = returnFaces.find((face) => face.userData.nonCornerEndReturnDoor === "right")!;
      expect(leftDoor.rotation.y).toBeCloseTo(-Math.PI / 4, 6);
      expect(rightDoor.rotation.y).toBeCloseTo(Math.PI / 4, 6);
      expect(leftDoor.userData.attachedEndFront).toBe(true);
      expect(rightDoor.userData.attachedEndFront).toBe(true);
    }
  });

  it("keeps a saved BEC-24 on its placement record while rendering the diagram-defined rear-apex two-face end form", () => {
    const base = {
      uid: "base-run-24", cabinetId: 11, masterCode: "B-24", description: '24" Base Cabinet', placement: "base",
      x: 0, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0, numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    const bec = {
      uid: "bec-run-end", cabinetId: 9390014, masterCode: "BEC-24", description: '24" Base End Cabinet — 45° Angled Front', placement: "base",
      x: 24, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0, numberOfDoors: 2, numberOfDrawers: 0,
      customProfile: "base_end_return",
    } as never;
    expect(existingCabinetTransform(base)).toMatchObject({ x: 12, z: 12, rotation: 0, bottom: 0 });
    expect(existingCabinetTransform(bec)).toMatchObject({ x: 36, z: 12, rotation: 0, bottom: 0 });

    const root = new THREE.Group();
    addCabinet(root, existingCabinetSku(base), null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, existingCabinetTransform(base));
    addCabinet(root, existingCabinetSku(bec), null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, existingCabinetTransform(bec));
    const standardBodies: THREE.Mesh[] = [];
    const becBodies: THREE.Mesh[] = [];
    const becDoors: THREE.Object3D[] = [];
    const becFrontGroups: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.nonCornerEndReturnBody && node instanceof THREE.Mesh) becBodies.push(node);
      if (node.userData.nonCornerEndReturnDoor) becDoors.push(node);
      if (node.userData.becAttachedTwoFaceEnd) becFrontGroups.push(node);
      if (node.userData.selectedStyleSideSkin && !node.userData.nonCornerEndReturnBody && node instanceof THREE.Mesh) standardBodies.push(node);
    });
    expect(becBodies).toHaveLength(1);
    expect(becDoors).toHaveLength(2);
    expect(becFrontGroups).toHaveLength(1);
    expect(becFrontGroups[0]!.userData.separateProjectedThirdFace).toBe(false);
    root.updateMatrixWorld(true);
    const becBounds = new THREE.Box3().setFromObject(becBodies[0]!);
    expect(becBounds.max.x - becBounds.min.x).toBeCloseTo(24 / 12 * Math.SQRT2, 6);
    expect(becBounds.max.z - becBounds.min.z).toBeCloseTo(24 / 12 * Math.SQRT2, 6);
    const leftDoor = becDoors.find((door) => door.userData.nonCornerEndReturnDoor === "left")!;
    const rightDoor = becDoors.find((door) => door.userData.nonCornerEndReturnDoor === "right")!;
    const leftApex = leftDoor.localToWorld(new THREE.Vector3(8.45 / 12 / 2, 0, 0));
    const rightApex = rightDoor.localToWorld(new THREE.Vector3(-8.45 / 12 / 2, 0, 0));
    expect(leftApex.distanceTo(rightApex)).toBeLessThan(0.08);
    expect(becDoors.every((door) => door.userData.doorWidthIn === 8.45 && door.userData.referenceFaceSideIn === 24 && door.userData.attachedEndFront)).toBe(true);
  });

  it("renders a pantry as two two-door sets split by a 54-inch lower door section", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -90,
      cabinetId: 90,
      masterCode: "PANTRY-2490",
      description: '24" x 90" Pantry Cabinet',
      placementType: "tall",
      width: 24,
      height: 90,
      depth: 24,
      numberOfDoors: 4,
      numberOfDrawers: 0,
      cornerType: null,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    const lower: THREE.Object3D[] = [];
    const upper: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.pantryDoorSet === "lower") lower.push(node);
      if (node.userData.pantryDoorSet === "upper") upper.push(node);
    });
    expect(lower).toHaveLength(2);
    expect(upper).toHaveLength(2);
    expect(((lower[0] as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.height).toBeCloseTo(54 / 12 - 0.025, 12);
  });

  it("keeps a standard wall cabinet’s selected-finish side skin on the saved 24-by-12 carcass envelope", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -24,
      cabinetId: 24,
      masterCode: "W-24-30",
      description: '24" x 30" Wall Cabinet',
      placementType: "wall",
      width: 24,
      height: 30,
      depth: 12,
      numberOfDoors: 2,
      numberOfDrawers: 0,
      cornerType: null,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 24, z: 12, rotation: Math.PI / 2 });

    const sideSkins: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.selectedStyleSideSkin) sideSkins.push(node);
    });

    expect(sideSkins).toHaveLength(1);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(sideSkins[0]!);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(1, 8);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(2, 8);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(30 / 12, 8);
  });

  it("builds every standard base cabinet above a recessed four-and-a-half-inch toe kick", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -33,
      cabinetId: 33,
      masterCode: "B-33",
      description: '33" Base Cabinet',
      placementType: "base",
      width: 33,
      height: 34.5,
      depth: 24,
      numberOfDoors: 2,
      numberOfDrawers: 0,
      cornerType: null,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");

    let toeKick: THREE.Mesh | null = null;
    let carcass: THREE.Mesh | null = null;
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.baseToeKick) toeKick = node;
      if (node.userData.selectedStyleSideSkin && !node.userData.baseToeKick) carcass = node;
    });
    expect(toeKick).not.toBeNull();
    expect(toeKick!.userData.toeKickHeightIn).toBe(4.5);
    expect(toeKick!.userData.toeKickRecessIn).toBe(3);
    root.updateMatrixWorld(true);
    const toeKickBounds = new THREE.Box3().setFromObject(toeKick!);
    const carcassBounds = new THREE.Box3().setFromObject(carcass!);
    expect(toeKickBounds.min.y).toBeCloseTo(0, 8);
    expect(toeKickBounds.max.y).toBeCloseTo(4.5 / 12, 8);
    expect(carcassBounds.max.z - toeKickBounds.max.z).toBeCloseTo(3 / 12, 8);
    expect(((carcass!.geometry as THREE.BoxGeometry).parameters.height)).toBeCloseTo(30 / 12, 8);
  });

  it("adds a four-and-a-half-inch toe kick to every cabinet that rests on the floor, including tall and floor-dropped wall profiles", () => {
    const root = new THREE.Group();
    const floorFixtures = [
      { masterCode: "B-24", description: '24" Base', placementType: "base", width: 24, height: 34.5, depth: 24 },
      { masterCode: "PANTRY-24", description: '24" Pantry', placementType: "tall", width: 24, height: 84, depth: 24 },
      { masterCode: "W-2430", description: '24" Wall Cabinet Floor Mounted', placementType: "wall", width: 24, height: 30, depth: 12 },
    ];
    floorFixtures.forEach((fixture, index) => {
      addCabinet(root, { distributorSkuId: -140 - index, cabinetId: 140 + index, numberOfDoors: 2, numberOfDrawers: 0, cornerType: null, ...fixture } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 18 + index * 30, z: 12, rotation: 0, bottom: index === 2 ? 0 : 4.5 });
    });
    const kicks: THREE.Mesh[] = [];
    const floorCabinets: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.floorStandingCabinet) floorCabinets.push(node);
      if (node instanceof THREE.Mesh && node.userData.floorStandingToeKick) kicks.push(node);
    });
    expect(floorCabinets).toHaveLength(3);
    expect(kicks).toHaveLength(3);
    root.updateMatrixWorld(true);
    kicks.forEach((kick) => {
      const bounds = new THREE.Box3().setFromObject(kick);
      expect(kick.userData.toeKickHeightIn).toBe(4.5);
      expect(kick.userData.toeKickRecessIn).toBe(3);
      expect(bounds.min.y).toBeCloseTo(0, 8);
      expect(bounds.max.y).toBeCloseTo(4.5 / 12, 8);
    });

    const raisedWallRoot = new THREE.Group();
    addCabinet(raisedWallRoot, { distributorSkuId: -150, cabinetId: 150, masterCode: "W-2430", description: '24" Wall Cabinet', placementType: "wall", width: 24, height: 30, depth: 12, numberOfDoors: 2, numberOfDrawers: 0 } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 18, z: 12, rotation: 0, bottom: 54 });
    const raisedKicks: THREE.Object3D[] = [];
    raisedWallRoot.traverse((node) => { if (node.userData.floorStandingToeKick) raisedKicks.push(node); });
    expect(raisedKicks).toHaveLength(0);
  });

  it("keeps a floor dishwasher flush in its 2D base opening with a matching toe kick and supported countertop", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -24,
      cabinetId: 24,
      masterCode: "DW-24",
      description: '24" Built-In Dishwasher',
      placementType: "appliance",
      width: 24,
      height: 34.5,
      depth: 24,
      numberOfDoors: 0,
      numberOfDrawers: 0,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 48, z: 12, rotation: 0, bottom: 0 });

    let dishwasherKick: THREE.Mesh | null = null;
    let dishwasherFace: THREE.Mesh | null = null;
    let dishwasherOpening: THREE.Mesh | null = null;
    let countertop: THREE.Mesh | null = null;
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.dishwasherToeKick) dishwasherKick = node;
      if (node.userData.dishwasherFlushFace) dishwasherFace = node;
      if (node.userData.dishwasherOpening) dishwasherOpening = node;
      if (node.userData.dishwasherCountertopSupport) countertop = node;
    });
    expect(dishwasherKick).not.toBeNull();
    expect(dishwasherFace).not.toBeNull();
    expect(dishwasherOpening).not.toBeNull();
    expect(countertop).not.toBeNull();
    root.updateMatrixWorld(true);
    const kickBounds = new THREE.Box3().setFromObject(dishwasherKick!);
    const faceBounds = new THREE.Box3().setFromObject(dishwasherFace!);
    const counterBounds = new THREE.Box3().setFromObject(countertop!);
    expect(kickBounds.min.y).toBeCloseTo(0, 8);
    expect(kickBounds.max.y).toBeCloseTo(4.5 / 12, 8);
    expect(faceBounds.min.y).toBeCloseTo(4.5 / 12, 8);
    expect(faceBounds.max.y).toBeCloseTo(34.5 / 12, 8);
    // The dishwasher opening spans the full appliance face with a 0.14-foot visual inset.
    expect(((dishwasherOpening!.geometry as THREE.BoxGeometry).parameters.width)).toBeCloseTo((24 / 12) - 0.14, 8);
    expect(counterBounds.min.y).toBeCloseTo(34.5 / 12, 8);
    expect(counterBounds.max.y).toBeCloseTo(36 / 12, 8);
  });

  it("renders a range as a freestanding floor appliance rather than a cabinet box", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -30,
      cabinetId: 30,
      masterCode: "RANGE-30",
      description: '30" Freestanding Gas Range',
      placementType: "appliance",
      width: 30,
      height: 36,
      depth: 25,
      numberOfDoors: 0,
      numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/range-test-front.webp",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 48, z: 12, rotation: 0, bottom: 0 });

    let chassis: THREE.Mesh | null = null;
    let toeRecess: THREE.Mesh | null = null;
    let cooktopSurface: THREE.Mesh | null = null;
    let backguard: THREE.Mesh | null = null;
    const feet: THREE.Mesh[] = [];
    const visibleFrontFeet: THREE.Mesh[] = [];
    const cabinetSkins: THREE.Mesh[] = [];
    const productFronts: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.freestandingRangeChassis) chassis = node;
      if (node.userData.freestandingRangeToeRecess) toeRecess = node;
      if (node.userData.rangeCooktop) cooktopSurface = node;
      if (node.userData.rangeBackguard) backguard = node;
      if (node.userData.freestandingRangeFoot) feet.push(node);
      if (node.userData.visibleFreestandingRangeFoot) visibleFrontFeet.push(node);
      if (node.userData.selectedStyleSideSkin) cabinetSkins.push(node);
      if (node.userData.originalProductVisual) productFronts.push(node);
    });

    expect(chassis).not.toBeNull();
    expect(toeRecess).not.toBeNull();
    expect(cooktopSurface).not.toBeNull();
    expect(backguard).not.toBeNull();
    expect(feet).toHaveLength(4);
    expect(visibleFrontFeet).toHaveLength(2);
    expect(cabinetSkins).toHaveLength(0);
    expect(productFronts).toHaveLength(1);
    expect(productFronts[0]!.userData.catalogEnvelope).toMatchObject({ widthIn: 30, heightIn: 36, depthIn: 25, mountBottomIn: 0 });
    expect(productFronts[0]!.userData).toMatchObject({ freestandingRangeProductVisual: true });
    expect(productFronts[0]!.userData.rangeFootClearanceIn).toBeGreaterThan(0);

    root.updateMatrixWorld(true);
    const chassisBounds = new THREE.Box3().setFromObject(chassis!);
    const cooktopBounds = new THREE.Box3().setFromObject(cooktopSurface!);
    const backguardBounds = new THREE.Box3().setFromObject(backguard!);
    const footBounds = feet.reduce(
      (bounds, foot) => bounds.union(new THREE.Box3().setFromObject(foot)),
      new THREE.Box3().makeEmpty(),
    );
    expect(footBounds.min.y).toBeCloseTo(0, 8);
    expect(footBounds.max.y).toBeCloseTo(chassisBounds.min.y, 6);
    expect(cooktopBounds.max.y).toBeCloseTo(34.5 / 12, 6);
    expect(backguardBounds.max.y).toBeCloseTo(47 / 12, 6);
    expect(backguard!.userData.rangeBackguardTopIn).toBe(47);
    expect(chassis!.userData.rangeFloorClearanceIn).toBeGreaterThan(0);
  });

  it("preserves the saved tall-appliance height, dishwasher-spanning counter, and 66-inch range-hood mount in the actual scene meshes", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -36, cabinetId: 36, masterCode: "FRIDGE-36", description: "36 inch Refrigerator",
      placementType: "appliance", width: 36, height: 70, depth: 30, numberOfDoors: 0, numberOfDrawers: 0,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 18, z: 18, rotation: 0, bottom: 0 });
    addCabinet(root, {
      distributorSkuId: -24, cabinetId: 24, masterCode: "DW-24", description: "24 inch Dishwasher",
      placementType: "appliance", width: 24, height: 34.5, depth: 24, numberOfDoors: 0, numberOfDrawers: 0,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 66, z: 12, rotation: 0, bottom: 0 });
    addCabinet(root, {
      distributorSkuId: -30, cabinetId: 30, masterCode: "HOOD-30", description: "30 inch Range Hood",
      placementType: "appliance", width: 30, height: 18, depth: 18, mountBottom: 66, numberOfDoors: 0, numberOfDrawers: 0,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 108, z: 12, rotation: 0, bottom: 66 });

    const fridge = root.children.find((node) => node.userData.masterCode === "FRIDGE-36")!;
    const dishwasher = root.children.find((node) => node.userData.masterCode === "DW-24")!;
    const hood = root.children.find((node) => node.userData.masterCode === "HOOD-30")!;
    let dishwasherCounter: THREE.Mesh | null = null;
    let hoodCanopy: THREE.Object3D | null = null;
    root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.dishwasherCountertopSupport) dishwasherCounter = node;
      if (node.userData.rangeHoodCanopy) hoodCanopy = node;
    });
    root.updateMatrixWorld(true);

    const fridgeBounds = new THREE.Box3().setFromObject(fridge);
    const dishwasherBounds = new THREE.Box3().setFromObject(dishwasher);
    const dishwasherCounterBounds = new THREE.Box3().setFromObject(dishwasherCounter!);
    const hoodBounds = new THREE.Box3().setFromObject(hood);
    expect(fridge.userData.catalogApplianceEnvelope).toMatchObject({ heightIn: 70, mountBottomIn: 0 });
    expect(fridgeBounds.max.y - fridgeBounds.min.y).toBeCloseTo(70 / 12, 6);
    expect(dishwasherCounter).not.toBeNull();
    expect(dishwasherCounterBounds.min.x).toBeCloseTo(dishwasherBounds.min.x, 8);
    expect(dishwasherCounterBounds.max.x).toBeCloseTo(dishwasherBounds.max.x, 8);
    expect(dishwasherCounterBounds.min.y).toBeCloseTo(34.5 / 12, 8);
    expect(hood.userData.catalogApplianceEnvelope).toMatchObject({ mountBottomIn: 66, heightIn: 18 });
    expect(hoodBounds.min.y).toBeCloseTo(66 / 12, 8);
    expect(hoodBounds.max.y).toBeCloseTo(84 / 12, 6);
    expect(hoodCanopy).not.toBeNull();
  });

  it("keeps a configured microwave opening within its exact 27-by-17 Cabinet Config envelope", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -27,
      cabinetId: 27,
      masterCode: "BMC-30",
      description: '30" Microwave Base Cabinet',
      placementType: "base",
      width: 30,
      height: 34.5,
      depth: 24,
      numberOfDoors: 0,
      numberOfDrawers: 1,
      openingType: "top",
      openingWidth: 27,
      openingHeight: 17,
      drawerHeight: 12,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    const openings: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.configuredOpening) openings.push(node); });
    expect(openings).toHaveLength(1);
    expect(openings[0]!.userData.openingWidthIn).toBeCloseTo(27, 12);
    expect(openings[0]!.userData.openingHeightIn).toBeCloseTo(17, 12);
  });

  it("uses distinct configured envelopes for wall and base microwave cabinets", () => {
    const fixtures = [
      { masterCode: "BMC-30", description: "Microwave Base Cabinet", placementType: "base", width: 30, height: 34.5, depth: 24, openingWidth: 27, openingHeight: 17 },
      { masterCode: "WMC-24", description: "Microwave Wall Cabinet", placementType: "wall", width: 24, height: 30, depth: 12, openingWidth: 22, openingHeight: 14 },
    ] as const;
    for (const fixture of fixtures) {
      const root = new THREE.Group();
      addCabinet(root, {
        distributorSkuId: -71,
        cabinetId: 71,
        ...fixture,
        numberOfDoors: 0,
        numberOfDrawers: 1,
        openingType: "top",
        drawerHeight: 8,
      } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
      const openings: THREE.Object3D[] = [];
      root.traverse((node) => { if (node.userData.configuredOpening) openings.push(node); });
      expect(openings).toHaveLength(1);
      expect(openings[0]!.userData.openingWidthIn).toBeCloseTo(fixture.openingWidth, 12);
      expect(openings[0]!.userData.openingHeightIn).toBeCloseTo(fixture.openingHeight, 12);
    }
  });

  it("normalizes legacy range and refrigerator base records into appliance meshes so the saved cooktop and fridge face cannot disappear", () => {
    const range = existingCabinetSku({
      uid: "legacy-range", cabinetId: 30, masterCode: "RANGE-30", description: "30 inch Range",
      placement: "base", x: 36, y: 0, width: 30, depth: 25, height: 36, rotation: 0,
    } as never);
    const fridge = existingCabinetSku({
      uid: "legacy-fridge", cabinetId: 31, masterCode: "FRIDGE-30", description: "30 inch Refrigerator",
      placement: "base", x: 72, y: 0, width: 30, depth: 24, height: 84, rotation: 0,
    } as never);
    expect(range.placementType).toBe("appliance");
    expect(fridge.placementType).toBe("appliance");

    const root = new THREE.Group();
    addCabinet(root, range, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    addCabinet(root, fridge, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    const cooktops: THREE.Object3D[] = [];
    const burners: THREE.Object3D[] = [];
    const refrigeratorDoors: THREE.Object3D[] = [];
    const refrigeratorFreezers: THREE.Object3D[] = [];
    const accidentalToeKicks: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.rangeCooktop) cooktops.push(node);
      if (node.userData.rangeBurner) burners.push(node);
      if (node.userData.applianceCode === "FRIDGE-30" && node.userData.refrigeratorDoor) refrigeratorDoors.push(node);
      if (node.userData.applianceCode === "FRIDGE-30" && node.userData.refrigeratorFreezer) refrigeratorFreezers.push(node);
      if (node.userData.baseToeKick) accidentalToeKicks.push(node);
    });
    expect(cooktops).toHaveLength(1);
    expect(burners).toHaveLength(4);
    expect(refrigeratorDoors).toHaveLength(2);
    expect(refrigeratorDoors.map((door) => door.userData.refrigeratorDoor).sort()).toEqual(["left", "right"]);
    expect(refrigeratorFreezers).toHaveLength(1);
    expect(accidentalToeKicks).toHaveLength(0);
  });

  it("preserves catalog envelopes for refrigerator, range, hood, microwave, dishwasher, and wine appliances", () => {
    const fixtures = [
      { masterCode: "FRIDGE-30", width: 30, height: 84, depth: 24, mountBottom: 0, rotation: 0 },
      { masterCode: "RANGE-30", width: 30, height: 36, depth: 25, mountBottom: 0, rotation: 0 },
      { masterCode: "HOOD-30", width: 30, height: 18, depth: 18, mountBottom: 66, rotation: 0 },
      { masterCode: "MW-30", width: 30, height: 17, depth: 15, mountBottom: 54, rotation: 0 },
      { masterCode: "DW-24", width: 24, height: 34.5, depth: 24, mountBottom: 0, rotation: 0 },
      { masterCode: "WINE-24", width: 24, height: 34.5, depth: 24, mountBottom: 0, rotation: 0 },
    ] as const;
    for (const fixture of fixtures) {
      const root = new THREE.Group();
      addCabinet(root, {
        distributorSkuId: -87,
        cabinetId: 87,
        description: fixture.masterCode,
        placementType: "appliance",
        x: 0,
        y: 0,
        ...fixture,
        numberOfDoors: 0,
        numberOfDrawers: 0,
      } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
      const applianceRoot = root.children[0]!;
      expect(applianceRoot.userData.catalogApplianceEnvelope).toMatchObject({
        widthIn: fixture.width,
        heightIn: fixture.height,
        depthIn: fixture.depth,
        mountBottomIn: fixture.mountBottom,
        rotation: fixture.rotation,
      });
    }
  });

  it("centers the active saved hood on its range and suppresses the overlapping microwave placeholder", () => {
    const range = {
      uid: "active-range", cabinetId: 0, masterCode: "RANGE-30", description: 'Range / Stove 30"',
      placement: "appliance", width: 30, height: 36, depth: 25, rotation: 90, x: 0, y: 45,
    } as never;
    const hood = {
      uid: "active-hood", cabinetId: 0, masterCode: "HOOD-30", description: 'Range Hood 30"',
      placement: "appliance", width: 30, height: 18, depth: 18, rotation: 90, x: 3.5, y: 45, mountBottom: 66,
    } as never;
    const microwave = {
      uid: "legacy-over-range-microwave", cabinetId: 0, masterCode: "MW-30", description: 'Over-Range Microwave 30"',
      placement: "appliance", width: 30, height: 17, depth: 15, rotation: 90, x: 0, y: 45, mountBottom: 54,
    } as never;
    const room = { width: 144, depth: 145, ceilingHeight: 96 } as never;
    const hoodTransform = savedRangeHoodTransform(hood, [range, hood, microwave], room);
    const rangeTransform = existingCabinetTransform(range, room);

    expect(hoodTransform.z).toBeCloseTo(rangeTransform.z, 12);
    expect(shouldRenderSavedSceneCabinet(range, [range, hood, microwave])).toBe(true);
    expect(shouldRenderSavedSceneCabinet(hood, [range, hood, microwave])).toBe(true);
    expect(shouldRenderSavedSceneCabinet(microwave, [range, hood, microwave])).toBe(false);
  });

  it("reconstructs design 8190001's persisted base run, range, hood, and refrigerator without generic fallbacks", () => {
    const room = { width: 144, depth: 145, ceilingHeight: 96 } as never;
    const placed = [
      { uid: "active-range", cabinetId: 0, masterCode: "RANGE-30", description: 'Range / Stove 30"', placement: "appliance", width: 30, height: 36, depth: 25, rotation: 90, x: 0, y: 45 },
      { uid: "active-hood", cabinetId: 0, masterCode: "HOOD-30", description: 'Range Hood 30"', placement: "appliance", width: 30, height: 18, depth: 18, rotation: 90, x: 3.5, y: 45, mountBottom: 66 },
      { uid: "active-fridge", cabinetId: 0, masterCode: "FRIDGE-36", description: 'Refrigerator 36"', placement: "appliance", width: 36, height: 72, depth: 30, rotation: 90, x: 0.75, y: 108 },
      { uid: "cdb36", cabinetId: 0, masterCode: "CDB36", description: "Corner Drawer Base", placement: "base", width: 36, height: 34.5, depth: 36, rotation: 0, x: 36, y: 0 },
      { uid: "db18", cabinetId: 0, masterCode: "DB-18-3", description: "Drawer Base", placement: "base", width: 18, height: 34.5, depth: 24, rotation: 0, x: 72, y: 0 },
      { uid: "sb36", cabinetId: 0, masterCode: "SB-36", description: "Sink Base", placement: "base", width: 36, height: 34.5, depth: 24, rotation: 0, x: 90, y: 0 },
      { uid: "db30", cabinetId: 0, masterCode: "DB-30-3", description: "Drawer Base", placement: "base", width: 30, height: 34.5, depth: 24, rotation: 0, x: 0, y: 84 },
      { uid: "b33", cabinetId: 0, masterCode: "B-33", description: "Base Cabinet", placement: "base", width: 33, height: 34.5, depth: 24, rotation: 0, x: 30, y: 84 },
    ] as never[];
    const root = new THREE.Group();
    for (const record of placed) {
      const sku = existingCabinetSku(record);
      addCabinet(root, sku, null, {}, room.width, room.depth, "#8a9ba8", "#f8f8f6", undefined, existingCabinetTransform(record, room));
    }
    const toeKicks: THREE.Object3D[] = [];
    const applianceRoots: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.baseToeKick) toeKicks.push(node);
      if (node.userData.catalogApplianceEnvelope) applianceRoots.push(node);
    });
    // CDB36 is an L-corner: it contributes 2 leg toe kicks instead of 1 rectangular one.
    // The 5 base cabinets therefore produce 6 toe-kick meshes (CDB36×2 + DB-18×1 + SB-36×1 + DB-30×1 + B-33×1).
    expect(toeKicks).toHaveLength(6);
    expect(applianceRoots).toHaveLength(3);
    expect(applianceRoots.map((node) => node.userData.masterCode)).toEqual(expect.arrayContaining(["RANGE-30", "HOOD-30", "FRIDGE-36"]));
    expect(applianceRoots.find((node) => node.userData.masterCode === "HOOD-30")!.userData.catalogApplianceEnvelope.mountBottomIn).toBe(66);
  });
});
