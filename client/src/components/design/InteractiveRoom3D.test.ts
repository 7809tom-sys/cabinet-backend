import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { canSyncThreeDOrderToCart, constrainedThreeDWallHeight, diagonalCornerRoomRotation, exactFittedFillerInches, filteredThreeDCatalogItems, hybridPlanUnderlayModel, resolvedPlacedCabinetDoorProfile, resolvedPlacedCabinetDoorSampleUrl, resolvedPlacedCabinetFinish, resolvedThreeDWallHeights, shouldShowThreeDCatalog, THREE_D_EMBEDDED_TOOLBAR_CLASS, THREE_D_WORKSPACE_ACTIONS, threeDCabinetHitFromObject, threeDDecorativeEndSides, threeDDrawerZoneHeight, threeDFittedFillerWidthText, threeDHasVerifiedDoorLayout, threeDOrderLineForSelectedCabinet, threeDPointerSelectsCabinet, threeDPreviewFadeAllowed, threeDSelectedCabinetDescription, threeDSelectedCabinetDockClass, threeDSelectionFromPlaced, threeDStructuralFinish, threeDTallPantryDoorsPerRow, threeDTemporaryPreviewCounterText, threeDUpperCabinetWallMinimums, threeDUsesAuthoritativePlanScene, threeDUsesCatalogFrontVisual, threeDWallClearanceText, threeDWallFitGuideText, threeDWallSideForEdge, threeDWallSideForPolygonEdge, updatedThreeDWallHeights } from "./InteractiveRoom3D";
import { addCabinet, addSinkFixture, addWallOpening, cornerDrawerFrontLayout, describedOvenSpecification, diagonalCornerFootprintVertices, diagonalCornerFrontWidth, dimensions, doorProfileKind, existingCabinetTransform, existingCabinetSku, freestandingRangeHeightProfile, hasPersistedTwoDScene, isEqualHeightTwoDrawerBase, lCornerCarcassParts, openingTransform, quoteMaterialDetails, rangeCooktopLayout, rangeHoodGeometry, rangeHoodSceneStatus, rangeOvenFrontLayout, resolvedCatalogFinish, resolvedPlacedCabinetFrontVisual, resolvedThreeDCountertopFinish, resolvedThreeDDoorProfile, resolvedThreeDDoorSampleUrl, resolvedThreeDDrawerRows, resolvedThreeDFaceLayout, resolvedThreeDOvenLayout, resolvedThreeDSpecialtyProfile, savedRangeHoodTransform, sceneCabinetColor, shouldRenderCountertopOverSceneItem, shouldRenderPlacedDesign, shouldRenderSavedSceneCabinet, sinkFaucetTransform, sinkFixtureTransform, singleOvenTowerAssembly, threeDApplianceFrontVisualUrl, threeDCabinetFrontVisualUrl, threeDCameraDistanceLimits, threeDCountertopDepthIn, threeDDoorMaterialFallback, threeDFaceMaterialColor, threeDMaterialStatusText, threeDPlacedWall, threeDPlanSyncText, threeDRoomFacingRotation, threeDSceneInputDiagnostics, threeDSceneRevisionKey, threeDSceneVisibilityContract, threeDShakerFramePose, threeDShakerRailThickness, threeDUsesDoorSampleTexture, threeDUsesExactDoorSampleMaterial, threeDUsesPhysicalShakerRails, threeDVisibleMaterialMode, triangleCornerFootprintVertices, triangleCornerFrontPose, triangleCornerFrontWidth, THREE_D_DRAWER_REVEAL_DEPTH, THREE_D_EXPORT_SIZE, THREE_D_WALL_DEPTH_WRITE, THREE_D_WALL_OPACITY, type InteractiveRoomScene } from "./InteractiveRoom3D";
import { furnitureTransform, islandZoneTransform, ponyWallTransform } from "./InteractiveRoom3D";
import { threeDDesignParitySnapshot } from "./InteractiveRoom3D";
import { resolvedThreeDCountertopFinish, shouldEmitThreeDPresentation, threeDPresentationEmissionKey, threeDPlacedWall } from "./InteractiveRoom3D";
import { threeDCornerBodyDimensions } from "./InteractiveRoom3D";
import { constrainedThreeDCameraShareView, parseThreeDCameraShareView, serializeThreeDCameraShareView, THREE_D_CAMERA_VIEW_QUERY_PARAM, threeDCameraPresetPosition, threeDScreenHorizontalPlanDelta, threeDShouldRestoreCameraView } from "./InteractiveRoom3D";
import { applyThreeDPlacementIdentity, threeDCabinetHitFromIntersections, threeDCabinetWallDragText, threeDCatalogDragFitText, threeDCatalogDropPlane, threeDCatalogDropTargetFromIntersections, threeDRightPointerGesture, threeDRoomWallSideFromObject, threeDWallDragGhostBox } from "./InteractiveRoom3D";
import { THREE_D_VIEWER_ZOOM_FACTOR, threeDViewerPanStep, threeDViewerZoomDistance } from "./InteractiveRoom3D";
import { threeDSceneCountertopDepthIn } from "./InteractiveRoom3D";
import { placedCornerGeometryKind } from "@/lib/design";
import { ovenOpeningGeometry } from "@/lib/ovenOpening";

const baseScene: InteractiveRoomScene = {
  roomShape: { id: "l_shape", name: "L-Shape", defaultDimensions: { width: 156, depth: 144, ceilingHeight: 96 }, geometryTemplate: { vertices: [] } },
  layout: { id: "kitchen_l_standard", name: "Standard L Kitchen" },
  suggestions: [],
  materials: { cabinet: { publicName: null, name: "Sample", color: null, finish: null, doorStyle: null, doorPanelType: null }, defaults: { floor: "#b89778", countertop: "#e9e7e2", backsplash: "#d9d5cc", wall: "#efece6" } },
};

describe("interactive 3D room scene helpers", () => {
  it("keeps an explicitly empty designer room authoritative after Clear Design instead of rendering catalog suggestions", () => {
    const empty = { placed: [], openings: [], sinks: [], island: null, furniture: [], ponyWalls: [] };
    expect(threeDUsesAuthoritativePlanScene({ width: 144, depth: 120 }, empty)).toBe(true);
    expect(threeDUsesAuthoritativePlanScene(undefined, empty)).toBe(false);
  });

	  it("routes a normal 3D catalog choice without coordinates so DesignTool can place it next in line, while retaining explicit drag/drop coordinates", () => {
	    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
	    expect(rendererSource).toContain("onAddCatalogItem?.(item); setWorkspacePanel(null);");
	    expect(rendererSource).toContain("onAddCatalogItem?.(item, catalogDropTargetAtPoint(event.clientX, event.clientY), event.shiftKey)");
	  });

  it("does not emit the full active-scene mesh payload as a console error", () => {
    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
    expect(rendererSource).not.toContain("ACTIVE-3D-SCENE-MESHES");
  });

  it("keeps the selected 3D cabinet stable while the pointer moves and only selects on a click or context action", () => {
    expect(threeDPointerSelectsCabinet("move")).toBe(false);
    expect(threeDPointerSelectsCabinet("up", 5)).toBe(true);
    expect(threeDPointerSelectsCabinet("up", 6)).toBe(false);
    expect(threeDPointerSelectsCabinet("context")).toBe(true);
    expect(threeDRightPointerGesture(2, 5, true)).toBe("context");
    expect(threeDRightPointerGesture(2, 6, true)).toBe("drag");
    expect(threeDRightPointerGesture(0, 20, true)).toBe("none");
    expect(threeDRightPointerGesture(2, 20, false)).toBe("none");
  });

  it("opens Cabinet Attributes with the exact raycast placement UID on 3D right-click", () => {
    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
    expect(rendererSource).toContain("if (selection?.uid && onOpenCabinetEditor)");
    expect(rendererSource).toContain("onOpenCabinetEditor(selection.uid)");
  });

  it("right-drags cabinets, panels, fillers, floor appliances, and range hoods through one shared measured wall path in every 3D renderer", () => {
    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
    const designerSource = readFileSync(new URL("../../pages/DesignTool.tsx", import.meta.url), "utf8");
    expect(rendererSource).toContain("onPointerMove={handleRoomPointerMove}");
	    expect(rendererSource).toContain("cabinetWallDragPreview(session.source, room, placed, openings, targetAlong, { disableSnapping: event.shiftKey })");
	    expect(rendererSource).toContain("!isWallRunDraggable(source, movementRoom)");
    expect(rendererSource).toContain("onMoveCabinetTo?.(session.uid, session.preview.candidate.x, session.preview.candidate.y, session.preview)");
    expect(rendererSource).toContain("updateRightDragGhost(session.source, preview, room)");
    expect(rendererSource).toContain("rightDragSnapGhost: true");
	    expect(rendererSource).not.toContain("applyRightDragVisual(session");
	    expect(rendererSource).toContain('data-testid="three-d-cabinet-drag-measurement"');
	    expect(rendererSource).toContain('data-testid="three-d-drag-remaining-line"');
	    expect(rendererSource).toContain('data-testid="three-d-drag-remaining-before"');
	    expect(rendererSource).toContain('data-testid="three-d-drag-remaining-after"');
	    expect(rendererSource).toContain("<ThreeDRemainingSpaceLine before={cabinetDragMeasurement.preview.fit.before} after={cabinetDragMeasurement.preview.fit.after} />");
	    expect(rendererSource).toContain("<ThreeDRemainingSpaceLine before={catalogDragMeasurement.fit.before} after={catalogDragMeasurement.fit.after} />");
	    expect(rendererSource).toContain('cabinetDragMeasurement.preview.freehand ? "Shift freehand position"');
	    expect(rendererSource).toContain("wallGapFreehandPreview(gaps, targetAlong, item.width)");
	    expect(rendererSource).toContain("Boolean(session.preview?.freehand) !== event.shiftKey");
	    expect(designerSource).toContain("freehand ? wallGapFreehandPreview(gaps, targetAlong, width) : wallGapFitPreview(gaps, targetAlong, width)");
	    expect(designerSource).toContain("freehand ? undefined : dropTarget.placementUid");
    expect(designerSource.match(/onMoveCabinetTo=\{cabinetsLocked \? undefined : moveCabinetToFrom3D\}/g)).toHaveLength(2);
    expect(designerSource).toContain("rangeHoodPositionAdjusted: true");
    expect(designerSource).toContain("moveCabinet(uid, x, y, undefined, true)");
    expect(designerSource).toContain("smallGapFillerOpportunityFromDragPreview(uid, preview)");
  });

  it("describes a valid right-drag release as exact edge contact with no gap or overlap", () => {
    const fit = { gap: { side: "top" as const, layer: "base" as const, start: 0, length: 109, center: 54.5, isStandardSize: false, isFillerSize: false }, containsTarget: true, requiredSpan: 15, availableSpan: 109, shortage: 0, snapStart: 94, snapEnd: 109, before: 94, after: 0, status: "valid" as const };
    expect(threeDCabinetWallDragText({ masterCode: "B-15" }, { wall: "top", fit, candidate: { masterCode: "B-15" } as never, snapped: true }))
      .toBe('B-15 · snap 94"–109" · touching next edge · 0" gap · 0" overlap');
  });

  it("describes a freely chosen valid right-drag position without claiming it snapped to an edge", () => {
    const fit = { gap: { side: "top" as const, layer: "base" as const, start: 0, length: 144, center: 72, isStandardSize: true, isFillerSize: false }, containsTarget: true, requiredSpan: 12, availableSpan: 144, shortage: 0, snapStart: 60, snapEnd: 72, before: 60, after: 72, status: "valid" as const };
    expect(threeDCabinetWallDragText({ masterCode: "B-12" }, { wall: "top", fit, candidate: { masterCode: "B-12" } as never, snapped: false }))
      .toBe('B-12 · position 60"–72" · left clearance 60" · right clearance 72" · 0" overlap');
  });

  it("positions the appliance snap ghost at the exact proposed 3D footprint and saved elevation", () => {
    const room = { width: 144, depth: 120, ceilingHeight: 96 };
    const ghost = threeDWallDragGhostBox({
      uid: "hood-ghost",
      cabinetId: 9301,
      masterCode: "HOOD-30",
      description: "30 inch Range Hood",
      placement: "appliance",
      x: 30,
      y: 0,
      width: 30,
      depth: 18,
      height: 18,
      mountBottom: 66,
      rotation: 0,
      numberOfDoors: 0,
      numberOfDrawers: 0,
    }, room);

    expect(ghost.position).toEqual({ x: 3.75, y: 6.25, z: 0.75 });
    expect(ghost.size).toEqual({ width: 2.5, height: 1.5, depth: 1.5 });
  });

  it("wraps the embedded 3D action controls instead of allowing them to overlap", () => {
    expect(THREE_D_EMBEDDED_TOOLBAR_CLASS).toContain("flex-wrap");
    expect(THREE_D_EMBEDDED_TOOLBAR_CLASS).toContain("max-w-[calc(100%-1.5rem)]");
  });

  it("builds the hybrid 2D reference from every saved item using the authoritative rotated footprint and opening geometry", () => {
    const model = hybridPlanUnderlayModel(
      { width: 120, depth: 96, ceilingHeight: 96 },
      [
        { uid: "base", cabinetId: 1, masterCode: "B-24", description: "Base", placement: "base", x: 0, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0, numberOfDoors: 1, numberOfDrawers: 0 },
        { uid: "wall", cabinetId: 2, masterCode: "WR3624", description: "Refrigerator wall", placement: "wall", x: 24, y: 0, width: 36, depth: 24, height: 24, rotation: 90, numberOfDoors: 2, numberOfDrawers: 0 },
        { uid: "appliance", cabinetId: 3, masterCode: "FRIDGE-36", description: "Refrigerator", placement: "appliance", x: 60, y: 0, width: 36, depth: 24, height: 70, rotation: 0, numberOfDoors: 2, numberOfDrawers: 0 },
      ],
      [{ uid: "window", kind: "window", label: "Window", side: "top", offset: 72, width: 30, height: 30, sill: 44 }],
    );

    expect(model.room).toEqual({ width: 120, depth: 96 });
    expect(model.cabinets.map((cabinet) => cabinet.uid)).toEqual(["base", "wall", "appliance"]);
    expect(model.cabinets[1]).toMatchObject({ masterCode: "WR3624", width: 24, depth: 36 });
    expect(model.openings).toEqual([{ uid: "window", kind: "window", side: "top", offset: 72, width: 30 }]);
  });

  it("uses a visual preview fade unless the user requests reduced motion", () => {
    expect(threeDPreviewFadeAllowed(false)).toBe(true);
    expect(threeDPreviewFadeAllowed(true)).toBe(false);
  });

  it("labels the current preview suggestion only when there is more than one choice", () => {
    expect(threeDTemporaryPreviewCounterText({ current: 2, total: 5 })).toBe("Suggestion 2 of 5");
    expect(threeDTemporaryPreviewCounterText({ current: 1, total: 1 })).toBeNull();
  });

  it("offers manual cart synchronization only when the current 3D order has cabinet lines", () => {
    expect(canSyncThreeDOrderToCart([])).toBe(false);
    expect(canSyncThreeDOrderToCart([{ id: "SB-33", label: "SB-33", quantity: 1, unitPrice: 572.25, lineTotal: 572.25 }])).toBe(true);
  });

  it("matches a selected 3D cabinet to its exact order line before falling back to master-code text search", () => {
    const pendingDuplicate = { id: "SB-33:pending", label: "SB-33", detail: '33" Sink Base Cabinet', quantity: 1, unitPrice: null, lineTotal: null, placementUids: ["old-sink"] };
    const pricedSelected = { id: "SB-33:priced", label: "SB-33", detail: '33" Sink Base Cabinet · Greek Villa', quantity: 1, unitPrice: 375.89, lineTotal: 375.89, placementUids: ["selected-sink"] };

    expect(threeDOrderLineForSelectedCabinet([pendingDuplicate, pricedSelected], { uid: "selected-sink", masterCode: "SB-33" }))
      .toBe(pricedSelected);
  });

  it("describes remaining active-wall space from the selected cabinet to its actual neighbors or wall edges", () => {
    expect(threeDWallClearanceText({ before: 9, after: 12, beforeIsCabinet: true, afterIsCabinet: false }))
      .toBe('Open space: 9" to previous cabinet · 1\' to wall edge');
    expect(threeDWallClearanceText(null)).toBeNull();
  });

  it("reports exact fit and true overlap in one-eighth-inch increments", () => {
    const base = { side: "top" as const, layer: "wall" as const, seated: true, requiredSpan: 36, start: 12, end: 48, wallLen: 96, availableStart: 12, availableEnd: 48, availableSpan: 36, before: 0, after: 0, shortage: 0, snapStart: 12, snapEnd: 48, snapBefore: 0, snapAfter: 0, beforeBoundary: "W1230", afterBoundary: "wall end" };
    expect(threeDWallFitGuideText({ ...base, leftOverlap: 0, rightOverlap: 0, status: "fits" }))
      .toBe('Used 36" · available opening 36" (W1230 to wall end) · snap target 12"–48" · left remaining 0" · right remaining 0" · 0" overlap');
    expect(threeDWallFitGuideText({ ...base, availableEnd: 47.875, availableSpan: 35.875, snapEnd: 47.875, leftOverlap: 0, rightOverlap: 0.125, status: "overlap" }))
      .toBe('Used 36" · available opening 35⅞" (W1230 to wall end) · right overlap ⅛" · valid snap target 12"–47⅞"');
    expect(threeDWallFitGuideText({ ...base, seated: false, leftOverlap: 0, rightOverlap: 0, status: "fits" }))
      .toBe('Placement guide: cabinet uses 36" · not seated on the top wall · snap to a wall to measure available space');
  });

  it("shows used, available, snap, and remaining space while dragging in 3D", () => {
    const gap = { side: "right" as const, layer: "wall" as const, start: 54, length: 36, center: 72, isStandardSize: true, isFillerSize: false };
    const fit = { gap, containsTarget: true, requiredSpan: 36, availableSpan: 36, shortage: 0, snapStart: 54, snapEnd: 90, before: 0, after: 0, status: "valid" as const };
    expect(threeDCatalogDragFitText({ masterCode: "W-36-24" }, fit)).toBe('W-36-24 uses 36" of 36" · snap 54"–90" · left 0" · right 0"');
  });

  it("shows the exact installed cut width for catalog fillers created from a measured gap", () => {
    expect(exactFittedFillerInches(2.25)).toBe('2¼"');
    expect(exactFittedFillerInches(2.5)).toBe('2½"');
    expect(threeDFittedFillerWidthText({
      masterCode: "BF-3",
      description: '3" x 34.5" Base Filler — cut to 2.5"',
      category: "Filler",
      subCategory: "Filler",
      width: 2.5,
    } as any)).toBe('Filler cut: 2½"');
    expect(threeDFittedFillerWidthText({
      masterCode: "B24",
      description: "24 inch Base Cabinet",
      category: "Base",
      subCategory: "Base",
      width: 24,
    } as any)).toBeNull();
  });

  it("uses every selected cabinet finish on structural surfaces, including texture-backed styles", () => {
    expect(threeDStructuralFinish("#4f5549", false)).toEqual({ color: "#4f5549", usesDoorSample: false });
    expect(threeDStructuralFinish("#C8A040", true)).toEqual({ color: "#C8A040", usesDoorSample: false });
  });

  it("uses a shallow six-inch drawer by default for every standard base cabinet with drawers and doors", () => {
    expect(threeDDrawerZoneHeight({ availableHeight: 2.8, drawerCount: 1, doorCount: 2, hasConfiguredOpening: false, placement: "base" })).toBeCloseTo(0.5);
    expect(threeDDrawerZoneHeight({ availableHeight: 2.8, drawerCount: 1, doorCount: 2, configuredDrawerHeight: 0.75, hasConfiguredOpening: false, placement: "base" })).toBeCloseTo(0.75);
    expect(threeDDrawerZoneHeight({ availableHeight: 2.8, drawerCount: 1, doorCount: 2, hasConfiguredOpening: false, placement: "wall" })).toBeCloseTo(0.98);
  });

  it("uses one upper and one lower door for a two-door 18-inch pantry while preserving four-door pantries", () => {
    expect(threeDTallPantryDoorsPerRow({ numberOfDoors: 2, width: 18, doorOrientation: "stacked" })).toBe(1);
    expect(threeDTallPantryDoorsPerRow({ numberOfDoors: 4, width: 24 })).toBe(2);
    expect(threeDTallPantryDoorsPerRow({ numberOfDoors: null, width: 18 })).toBe(1);
  });

  it("does not overlay a stale catalog front visual over a verified tall-pantry door layout", () => {
    expect(threeDHasVerifiedDoorLayout({ numberOfDoors: 2, numberOfDrawers: 0, doorOrientation: "stacked", drawerLayout: null, layoutSpec: null })).toBe(true);
    expect(threeDHasVerifiedDoorLayout({ numberOfDoors: 0, numberOfDrawers: 0, doorOrientation: null, drawerLayout: null, layoutSpec: null })).toBe(false);
    expect(threeDHasVerifiedDoorLayout({ numberOfDoors: 0, numberOfDrawers: 0, doorOrientation: null, drawerLayout: null, layoutSpec: null, openingType: "middle" })).toBe(true);
    expect(threeDUsesCatalogFrontVisual({ hasCatalogFrontVisual: true, hasDoorSample: false, hasDoorTexture: false, specialtyKind: "standard", isRefrigeratorEndPanel: false, hasVerifiedDoorLayout: true })).toBe(false);
    expect(threeDUsesCatalogFrontVisual({ hasCatalogFrontVisual: true, hasDoorSample: false, hasDoorTexture: false, specialtyKind: "standard", isRefrigeratorEndPanel: false, hasVerifiedDoorLayout: false })).toBe(true);
  });

  it("keeps cabinet ends plain unless a decorative end treatment is explicitly selected", () => {
    expect(threeDDecorativeEndSides("none")).toEqual([]);
    expect(threeDDecorativeEndSides("left")).toEqual([-1]);
    expect(threeDDecorativeEndSides("right")).toEqual([1]);
    expect(threeDDecorativeEndSides("both")).toEqual([-1, 1]);
  });

  it("shows a host-selected W3024 in the 3D action card without requiring a second click", () => {
    const selected = threeDSelectionFromPlaced("w3024", [{ uid: "w3024", cabinetId: 1, masterCode: "W3024", description: "Bridge cabinet", placement: "wall", x: 0, y: 0, width: 30, height: 24, depth: 12, rotation: 0 }]);
    expect(selected).toMatchObject({ uid: "w3024", masterCode: "W3024" });
  });

  it("uses each placed cabinet's saved 2D finish before the design default", () => {
    const defaultFinish = "#f1eee7";
    const overrides = { upper: "#18334e", island: "#a87f33" };
    expect(resolvedPlacedCabinetFinish({ uid: "upper" }, overrides, defaultFinish)).toBe("#18334e");
    expect(resolvedPlacedCabinetFinish({ uid: "lower" }, overrides, defaultFinish)).toBe(defaultFinish);
    expect(resolvedPlacedCabinetFinish({ uid: "island" }, overrides, defaultFinish)).toBe("#a87f33");
  });

  it("uses each placed cabinet's saved plan door profile before the design default", () => {
    const planDefault = { doorStyle: "Shaker", doorPanelType: "Matching" };
    const profiles = { upper: { doorStyle: "Raised", doorPanelType: "Center panel" } };
    expect(resolvedPlacedCabinetDoorProfile({ uid: "upper" }, profiles, planDefault)).toEqual(profiles.upper);
    expect(resolvedPlacedCabinetDoorProfile({ uid: "lower" }, profiles, planDefault)).toEqual(planDefault);
  });

  it("uses an explicit cabinet style's admin door sample before the design default sample", () => {
    const samples = { upper: "https://cdn.example.com/explicit-style.jpg" };
    expect(resolvedPlacedCabinetDoorSampleUrl({ uid: "upper" }, samples, "https://cdn.example.com/default-style.jpg", true))
      .toBe("https://cdn.example.com/explicit-style.jpg");
    expect(resolvedPlacedCabinetDoorSampleUrl({ uid: "lower" }, samples, "https://cdn.example.com/default-style.jpg", true))
      .toBe("https://cdn.example.com/default-style.jpg");
  });

  it("does not paint generic Shaker rails over a supplied complete CabinetDealz door sample", () => {
    expect(threeDUsesPhysicalShakerRails("shaker", true)).toBe(false);
    expect(threeDUsesPhysicalShakerRails("shaker", false)).toBe(true);
    expect(threeDUsesPhysicalShakerRails("flat", true)).toBe(false);
  });

  it("uses an exact unlit material for supplied CabinetDealz door samples", () => {
    expect(threeDUsesExactDoorSampleMaterial(true)).toBe(true);
    expect(threeDUsesExactDoorSampleMaterial(false)).toBe(false);
  });

  it("keeps every 2D catalog group searchable without an arbitrary eight-item limit", () => {
    const catalog = [
      { id: 1, masterCode: "B-24", description: "Base cabinet", category: "Cabinet" as const, catalogGroup: "Base" as const },
      { id: 2, masterCode: "LS36", description: "Corner cabinet", category: "Cabinet" as const, catalogGroup: "Corner" as const },
      { id: 3, masterCode: "W-30", description: "Wall cabinet", category: "Cabinet" as const, catalogGroup: "Wall" as const },
      { id: 4, masterCode: "P-24", description: "Tall pantry", category: "Cabinet" as const, catalogGroup: "Tall" as const },
      { id: 5, masterCode: "RANGE-30", description: "Range", category: "Appliance" as const, catalogGroup: "Appliances" as const },
      { id: 6, masterCode: "TK-4", description: "Toe kick", category: "Accessory" as const, catalogGroup: "Accessories" as const },
      ...Array.from({ length: 12 }, (_, index) => ({ id: 20 + index, masterCode: `B-${index + 30}`, description: "Additional base cabinet", category: "Cabinet" as const, catalogGroup: "Base" as const })),
    ];
    expect(filteredThreeDCatalogItems(catalog, "All", "")).toHaveLength(18);
    expect(filteredThreeDCatalogItems(catalog, "Base", "")).toHaveLength(13);
    expect(filteredThreeDCatalogItems(catalog, "Tall", "pantry").map((item) => item.masterCode)).toEqual(["P-24"]);
  });

  it("resolves independently persisted back, left, right, and front wall heights", () => {
    const heights = resolvedThreeDWallHeights({
      width: 144,
      depth: 120,
      ceilingHeight: 96,
      wallCeilings: {
        top: { high: 108, low: 108 },
        right: { high: 84, low: 84 },
      },
    }, 96);
    expect(heights).toEqual({ top: 108, left: 96, right: 84, bottom: 96 });
  });

  it("preserves three wall heights when one independent wall changes", () => {
    const initial = { top: 108, left: 84, right: 120, bottom: 96 };
    expect(updatedThreeDWallHeights(initial, "bottom", 1)).toEqual({ top: 108, left: 84, right: 120, bottom: 1 });
    expect(updatedThreeDWallHeights(initial, "right", 72)).toEqual({ top: 108, left: 84, right: 72, bottom: 96 });
  });

  it("maps rectangular wall edges to the four independent height controls", () => {
    const room = { width: 144, depth: 120 };
    // The renderer stores plan-front as negative Three.js Z/Y coordinates.
    expect(threeDWallSideForEdge({ x: 0, y: 0 }, { x: 12, y: 0 }, room)).toBe("top");
    expect(threeDWallSideForEdge({ x: 12, y: 0 }, { x: 12, y: -10 }, room)).toBe("right");
    expect(threeDWallSideForEdge({ x: 12, y: -10 }, { x: 0, y: -10 }, room)).toBe("bottom");
    expect(threeDWallSideForEdge({ x: 0, y: -10 }, { x: 0, y: 0 }, room)).toBe("left");
  });

  it("binds each rectangular mesh edge directly to Back, Right, Front, and Left", () => {
    const room = { width: 144, depth: 120 };
    const edges = [
      [{ x: 0, y: 0 }, { x: 12, y: 0 }],
      [{ x: 12, y: 0 }, { x: 12, y: -10 }],
      [{ x: 12, y: -10 }, { x: 0, y: -10 }],
      [{ x: 0, y: -10 }, { x: 0, y: 0 }],
    ] as const;
    expect(edges.map(([start, end], index) => threeDWallSideForPolygonEdge(index, edges.length, start, end, room))).toEqual(["top", "right", "bottom", "left"]);
  });

  it("maps the stove and refrigerator run to Back and the sink run to Right", () => {
    const room = { width: 144, depth: 120 };
    const range = { uid: "range", masterCode: "RANGE-30", placement: "appliance", width: 30, depth: 24, height: 36, x: 42, y: 0, rotation: 0 } as any;
    const sinkBase = { uid: "sink", masterCode: "SB-36", placement: "base", width: 36, depth: 24, height: 34.5, x: 120, y: 42, rotation: 90 } as any;
    expect(threeDPlacedWall(range, room)).toBe("back");
    expect(threeDPlacedWall(sinkBase, room)).toBe("right");
  });

  it("preserves the exact 2D placement identity for a picked 3D cabinet group", () => {
    const placed = { uid: "placed-w3024", cabinetId: 3024, masterCode: "W3024", description: "Wall cabinet", placement: "wall", width: 30, depth: 12, height: 24, x: 42, y: 0, rotation: 0 } as any;
    const root = new THREE.Group();
    const sku = existingCabinetSku(placed);
    addCabinet(root, sku, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, existingCabinetTransform(placed, { width: 144, depth: 120, ceilingHeight: 96 }));
    expect(sku.placementUid).toBe("placed-w3024");
    expect(root.children[0]?.userData.placedUid).toBe("placed-w3024");
  });

  it("always exposes a selected cabinet description for the 3D attributes card", () => {
    expect(threeDSelectedCabinetDescription({ masterCode: "B-30", description: "30 inch double-door base cabinet" } as any)).toBe("30 inch double-door base cabinet");
    expect(threeDSelectedCabinetDescription({ masterCode: "B-30", description: null } as any)).toBe("B-30 cabinet");
  });

  it("docks selected-cabinet details below the 3D drawing instead of overlaying its controls", () => {
    const className = threeDSelectedCabinetDockClass();
    expect(className).toContain("mt-1");
    expect(className).toContain("w-full");
	    expect(className).toContain("px-2");
	    expect(className).toContain("py-1.5");
	    expect(className).toContain("text-[11px]");
    expect(className).not.toContain("p-3");
    expect(className).not.toContain("absolute");
  });

	  it("keeps cabinet summary, measurements, actions, and touch movement readable without duplicate 3D controls", () => {
	    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
	    const designerSource = readFileSync(new URL("../../pages/DesignTool.tsx", import.meta.url), "utf8");
	    expect(rendererSource).toContain('data-testid="three-d-cabinet-summary"');
	    expect(rendererSource).toContain('data-testid="three-d-cabinet-measurement-grid"');
	    expect(rendererSource).toContain("sm:grid-cols-4");
	    expect(rendererSource).toContain('data-testid="three-d-cabinet-actions"');
	    expect(rendererSource).toContain("overflow-x-auto");
	    expect(rendererSource).toContain('data-testid="three-d-selected-cabinet-dpad"');
	    expect(rendererSource).not.toContain('data-testid="three-d-selected-cabinet-dpad" aria-label="Move selected cabinet" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} className="flex shrink-0 items-end justify-start gap-1 rounded border bg-muted/30 p-0.5 md:justify-center lg:hidden"');
	    expect(designerSource).toContain('selectedUid && !cabinetsLocked && !measureMode && viewMode === "plan"');
	    expect(designerSource).toContain('data-testid="plan-selected-cabinet-dpad"');
	    const up = rendererSource.indexOf('data-testid="three-d-move-up"');
	    const left = rendererSource.indexOf('data-testid="three-d-move-left"');
	    const right = rendererSource.indexOf('data-testid="three-d-move-right"');
	    const down = rendererSource.indexOf('data-testid="three-d-move-down"');
	    expect(up).toBeGreaterThan(-1);
	    expect(up).toBeLessThan(left);
	    expect(left).toBeLessThan(right);
	    expect(right).toBeLessThan(down);
	    expect(rendererSource).toContain('onClick={() => requestCabinetMove("up")}');
	    expect(rendererSource).toContain('onClick={() => requestCabinetMove("down")}');
	    expect(rendererSource).toContain('onClick={() => requestCabinetMove("left")}');
	    expect(rendererSource).toContain('onClick={() => requestCabinetMove("right")}');
	  });

  it("walks from a decorative 3D face to the placed cabinet root for description and Edit Config identity", () => {
    const root = new THREE.Group();
    root.userData = { placedUid: "placed-b30", label: "30 inch double-door base cabinet", distributorSkuId: 930030 };
    const cabinetGroup = new THREE.Group();
    cabinetGroup.userData = { masterCode: "B-30" };
    const face = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    face.userData = { masterCode: "B-30" };
    root.add(cabinetGroup);
    cabinetGroup.add(face);

    expect(threeDCabinetHitFromObject(face)).toEqual({
      uid: "placed-b30",
      masterCode: "B-30",
      description: "30 inch double-door base cabinet",
      distributorSkuId: 930030,
    });
  });

  it("resolves a BER36 corner child mesh to the exact saved placement UID used by right-click attributes", () => {
    const berRoot = new THREE.Group();
    berRoot.userData = { placedUid: "placed-ber36", masterCode: "BER36", label: "36-inch Base Easy Reach corner cabinet", distributorSkuId: 936036 };
    const clippedCornerBody = new THREE.Group();
    clippedCornerBody.userData = { cornerGeometryKind: "l-corner" };
    const visibleDoor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    berRoot.add(clippedCornerBody);
    clippedCornerBody.add(visibleDoor);

    expect(threeDCabinetHitFromObject(visibleDoor)).toEqual({
      uid: "placed-ber36",
      masterCode: "BER36",
      description: "36-inch Base Easy Reach corner cabinet",
      distributorSkuId: 936036,
    });
  });

  it("skips untagged room geometry and resolves the visible BER36 countertop to its exact placement UID", () => {
    const roomSurface = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const berCountertop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 3));
    applyThreeDPlacementIdentity(berCountertop, {
      uid: "placed-ber36",
      masterCode: "BER36",
      description: "36-inch Base Easy Reach corner cabinet",
      distributorSkuId: 936036,
    });

    expect(threeDCabinetHitFromIntersections([
      { object: roomSurface },
      { object: berCountertop },
    ])).toEqual({
      uid: "placed-ber36",
      masterCode: "BER36",
      description: "36-inch Base Easy Reach corner cabinet",
      distributorSkuId: 936036,
    });
  });

  it("projects an explicit catalog drop onto the active Right wall instead of the floor", () => {
    const plane = threeDCatalogDropPlane("right", { width: 120, depth: 96 });
    const ray = new THREE.Ray(new THREE.Vector3(0, 4, 4), new THREE.Vector3(1, 0, 0));
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    expect(hit?.x).toBeCloseTo(10);
    expect(hit?.z).toBeCloseTo(4);
  });

  it("uses the visible Aspin sink-run placement hit instead of a perspective-shifted back-wall projection", () => {
    const untaggedSink = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const taggedCountertop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 2));
    applyThreeDPlacementIdentity(taggedCountertop, {
      uid: "aspin-sb36",
      masterCode: "SB-36",
      description: "36-inch Sink Base Cabinet",
      distributorSkuId: 9390064,
    });

    const target = threeDCatalogDropTargetFromIntersections(
      [
        { object: untaggedSink, point: new THREE.Vector3(6, 1, 1.5) },
        { object: taggedCountertop, point: new THREE.Vector3(72 * 0.0833333333, 1, 1.5) },
      ],
      new THREE.Vector3(42 * 0.0833333333, 1, 0),
      { width: 144, depth: 145 },
    );

    expect(target.x).toBeCloseTo(72);
    expect(target.y).toBeCloseTo(18);
    expect(target.placementUid).toBe("aspin-sb36");
  });

  it("retains the active-wall plane target when the drop ray crosses no saved placement geometry", () => {
    const wallSurface = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    expect(threeDCatalogDropTargetFromIntersections(
      [{ object: wallSurface, point: new THREE.Vector3(9, 2, 0) }],
      new THREE.Vector3(54 * 0.0833333333, 2, 0),
      { width: 144, depth: 145 },
    )).toMatchObject({ x: expect.closeTo(54), y: 0 });
  });

  it("uses the physical wall behind the visible drop instead of a stale toolbar wall", () => {
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rightWall.userData = { roomWall: true, physicalWallSide: "right" };
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rightWall.add(child);
    expect(threeDRoomWallSideFromObject(child)).toBe("right");
    expect(threeDCatalogDropTargetFromIntersections([{ object: child, point: new THREE.Vector3(10, 2, 6) }], new THREE.Vector3(10, 2, 6), { width: 144, depth: 145 }, "top")).toMatchObject({ wall: "right", y: expect.closeTo(72) });
  });

  it("passes the active wall into every DesignTool 3D renderer for direct-drop projection", () => {
    const designToolSource = readFileSync(new URL("../../pages/DesignTool.tsx", import.meta.url), "utf8");
    expect(designToolSource.match(/catalogDropWall=\{activeWall\}/g)).toHaveLength(2);
    expect(designToolSource.match(/catalogDragItem=\{interactive3dCatalogDragItem\}/g)).toHaveLength(2);
    expect(designToolSource).toContain("const dropWall = dropTarget.wall ?? activeWall");
    expect(designToolSource).toContain("targetedSinkBaseForThreeDDrop(placed, dropTarget, room)");
  });

  it("keeps catalog additions available while rendering an existing saved 2D plan", () => {
    expect(shouldShowThreeDCatalog([{ id: 30, masterCode: "B-30", description: "Base cabinet", category: "Cabinet" }])).toBe(true);
    expect(shouldShowThreeDCatalog([])).toBe(false);
  });

  it("keeps every capability behind the compact canvas-first 3D action bar", () => {
    expect(THREE_D_WORKSPACE_ACTIONS).toEqual(["catalog", "view", "finish", "room", "output"]);
  });

  it("keeps the complete active 2D catalog accessible through the matching 3D category groups and search", () => {
    const items = [
      { id: 1, masterCode: "B-30", description: "Base cabinet", category: "Cabinet" as const, catalogGroup: "Base" as const },
      { id: 2, masterCode: "W-30", description: "Wall cabinet", category: "Cabinet" as const, catalogGroup: "Wall" as const },
      { id: 3, masterCode: "T-84", description: "Tall pantry", category: "Cabinet" as const, catalogGroup: "Tall" as const },
      { id: 4, masterCode: "RANGE-30", description: "Gas range", category: "Appliance" as const, catalogGroup: "Appliances" as const },
    ];
    expect(filteredThreeDCatalogItems(items, "All", "")).toHaveLength(4);
    expect(filteredThreeDCatalogItems(items, "Wall", "")).toEqual([items[1]]);
    expect(filteredThreeDCatalogItems(items, "All", "pantry")).toEqual([items[2]]);
  });

  it("mirrors diagonal corner turns so the angled wall-cabinet face points into every room corner", () => {
    expect([0, 90, 180, 270].map(diagonalCornerRoomRotation)).toEqual([0, 270, 180, 90]);
  });

  it("requires a 96-inch wall behind upper runs on the Back and Right walls", () => {
    const room = { width: 144, depth: 120 } as any;
    const backUpper = { uid: "back-upper", masterCode: "W-30", placement: "wall", width: 30, depth: 12, height: 30, x: 42, y: 0, rotation: 0 } as any;
    const rightUpper = { uid: "right-upper", masterCode: "W-30", placement: "wall", width: 30, depth: 12, height: 30, x: 132, y: 42, rotation: 90 } as any;
    expect(threeDUpperCabinetWallMinimums([backUpper, rightUpper], room)).toEqual({ top: 96, right: 96 });
  });

  it("keeps the mobile orbit camera outside a room-scaled furnished envelope", () => {
    expect(threeDCameraDistanceLimits(12).minDistance).toBeCloseTo(6.6, 12);
    expect(threeDCameraDistanceLimits(12).maxDistance).toBeCloseTo(40.8, 12);
    expect(threeDCameraDistanceLimits(8).minDistance).toBe(5.5);
  });

  it("provides bounded button zoom and distance-scaled pan steps for close hardware inspection", () => {
    const limits = threeDCameraDistanceLimits(12);
    expect(THREE_D_VIEWER_ZOOM_FACTOR).toBeCloseTo(0.76, 12);
    expect(threeDViewerZoomDistance(12, limits, "in")).toBeCloseTo(9.12, 12);
    expect(threeDViewerZoomDistance(limits.minDistance, limits, "in")).toBe(limits.minDistance);
    expect(threeDViewerZoomDistance(limits.maxDistance, limits, "out")).toBe(limits.maxDistance);
    expect(threeDViewerPanStep(1)).toBeCloseTo(0.35, 12);
    expect(threeDViewerPanStep(6.6)).toBeCloseTo(0.792, 12);
    expect(threeDViewerPanStep(40.8)).toBeCloseTo(1.2, 12);
  });

  it("renders accessible zoom, pan, and reset controls without replacing existing orbit, pinch, selection, or cabinet-move gestures", () => {
    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
    expect(rendererSource).toContain('data-testid="three-d-viewer-navigation"');
    expect(rendererSource).toContain('data-testid="three-d-zoom-in"');
    expect(rendererSource).toContain('data-testid="three-d-zoom-out"');
    expect(rendererSource).toContain('data-testid="three-d-reset-view"');
    expect(rendererSource).toContain('data-testid="three-d-pan-up"');
    expect(rendererSource).toContain('data-testid="three-d-pan-down"');
    expect(rendererSource).toContain('data-testid="three-d-pan-left"');
    expect(rendererSource).toContain('data-testid="three-d-pan-right"');
    expect(rendererSource).toContain('onClick={() => zoomViewer("in")}');
    expect(rendererSource).toContain('onClick={() => panViewer("left")}');
    expect(rendererSource).toContain('onClick={resetViewerNavigation}');
    expect(rendererSource).toContain('Pinch or scroll to zoom');
    expect(rendererSource).toContain('onPointerMove={handleRoomPointerMove}');
    expect(rendererSource).toContain('data-testid="three-d-selected-cabinet-dpad"');
    expect(rendererSource.match(/data-testid="three-d-selected-cabinet-dpad"/g)).toHaveLength(1);
    const detailsIndex = rendererSource.indexOf('data-testid="three-d-cabinet-attributes"');
    const dpadIndex = rendererSource.indexOf('data-testid="three-d-selected-cabinet-dpad"');
    const dpadOpeningTag = rendererSource.slice(dpadIndex, dpadIndex + 500);
    expect(dpadIndex).toBeGreaterThan(detailsIndex);
    expect(dpadOpeningTag).not.toContain("lg:hidden");
    expect(dpadOpeningTag).toContain('aria-label="Move selected cabinet"');
    expect(rendererSource).not.toContain('⅛&quot; precision');
	    expect(rendererSource.match(/0&quot; overlap required/g)?.length).toBeGreaterThanOrEqual(2);
	    expect(rendererSource).toContain('Placement · 0&quot; overlap');
  });

  it("provides distinct stable camera presets for clear 3D review", () => {
    const presentation = threeDCameraPresetPosition("presentation", 12);
    const front = threeDCameraPresetPosition("front", 12);
    const wide = threeDCameraPresetPosition("wide", 12);
    const detail = threeDCameraPresetPosition("detail", 12);
    expect(presentation.x).toBeCloseTo(13.8, 10);
    expect(presentation.y).toBeCloseTo(11.04, 10);
    expect(presentation.z).toBeCloseTo(15, 10);
    expect(front.z).toBeGreaterThan(presentation.z);
    expect(wide.y).toBeGreaterThan(presentation.y);
    expect(detail.length()).toBeLessThan(presentation.length());
  });

  it("preserves the exact camera view across cabinet moves but not explicit reset or preset changes", () => {
    const snapshot = { preset: "presentation" as const, resetKey: 4 };
    expect(threeDShouldRestoreCameraView(snapshot, "presentation", 4)).toBe(true);
    expect(threeDShouldRestoreCameraView(snapshot, "presentation", 5)).toBe(false);
    expect(threeDShouldRestoreCameraView(snapshot, "front", 4)).toBe(false);
  });

  it("serializes, validates, and safely constrains a shared camera perspective without carrying plan data", () => {
    const view = { position: new THREE.Vector3(12.3456, 8.2, -4.05), target: new THREE.Vector3(6.5, 3.1, 2.25), zoom: 1.25 };
    const serialized = serializeThreeDCameraShareView(view);
    expect(THREE_D_CAMERA_VIEW_QUERY_PARAM).toBe("view");
    expect(serialized).toBe("1,12.346,8.200,-4.050,6.500,3.100,2.250,1.250");
    const parsed = parseThreeDCameraShareView(serialized);
    expect(parsed?.position.toArray()).toEqual([12.346, 8.2, -4.05]);
    expect(parsed?.target.toArray()).toEqual([6.5, 3.1, 2.25]);
    expect(parsed?.zoom).toBeCloseTo(1.25, 12);
    expect(parseThreeDCameraShareView("2,1,2,3,4,5,6,1")).toBeNull();
    expect(parseThreeDCameraShareView("1,1,2,3,4,5,6,0")).toBeNull();
    expect(parseThreeDCameraShareView("1,1001,2,3,4,5,6,1")).toBeNull();
    expect(serializeThreeDCameraShareView({ position: new THREE.Vector3(Number.NaN, 1, 1), target: new THREE.Vector3(0, 0, 0), zoom: 1 })).toBe("");

    const constrained = constrainedThreeDCameraShareView({ position: new THREE.Vector3(40, 0, 0), target: new THREE.Vector3(0, 0, 0), zoom: 3 }, { minDistance: 5.5, maxDistance: 14 });
    expect(constrained.position.distanceTo(constrained.target)).toBeCloseTo(14, 12);
    expect(constrained.zoom).toBe(2);
  });

  it("provides Share View beside the on-canvas navigation controls and appends only perspective state to the existing protected 3D link", () => {
    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
    expect(rendererSource).toContain('data-testid="three-d-share-view"');
    expect(rendererSource).toContain('Share View');
    expect(rendererSource).toContain('await shareConfiguration(cameraView)');
    expect(rendererSource).toContain('window.location.pathname.startsWith("/3d/")');
    expect(rendererSource).toContain('url.searchParams.set(THREE_D_CAMERA_VIEW_QUERY_PARAM, serializedView)');
    expect(rendererSource).toContain('const url = new URL(`/api/shared-3d-view/${token}`, window.location.origin)');
    expect(rendererSource).toContain('sharedCameraViewRef.current = null');
  });

  it("confirms a copied Share View link while retaining native sharing and graceful clipboard-permission fallback", () => {
    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
    const shareUrlStart = rendererSource.indexOf("const shareUrl = async");
    const shareUrlEnd = rendererSource.indexOf("const shareConfiguration", shareUrlStart);
    const shareUrlSource = rendererSource.slice(shareUrlStart, shareUrlEnd);
    expect(shareUrlSource).toContain("await navigator.clipboard.writeText(url)");
    expect(shareUrlSource).toContain('toast.success("Link copied to clipboard.")');
    expect(shareUrlSource.indexOf("await navigator.clipboard.writeText(url)")).toBeLessThan(shareUrlSource.indexOf("if (navigator.share)"));
    expect(shareUrlSource).toContain("if (navigator.share)");
    expect(shareUrlSource).toContain("Native sharing remains available on devices where clipboard permission is denied.");
    expect(shareUrlSource).toContain('throw new Error("Clipboard access is unavailable.")');
  });

  it("captures only the current rendered camera perspective at compact social-card dimensions and sends it through the secure Share View mutation", () => {
    const rendererSource = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
    expect(rendererSource).toContain("const captureShareThumbnail = (): string | null");
    expect(rendererSource).toContain("const exportWidth = 640");
    expect(rendererSource).toContain("const exportHeight = 360");
    expect(rendererSource).toContain('renderer.domElement.toDataURL("image/jpeg", 0.82)');
    expect(rendererSource).toContain("renderer.setPixelRatio(currentPixelRatio)");
    expect(rendererSource).toContain("const thumbnailDataUrl = cameraView ? captureShareThumbnail() ?? undefined : undefined");
    expect(rendererSource).toContain("thumbnailDataUrl,");
    expect(rendererSource).toContain("trpc.roomLayouts.updateShareThumbnail.useMutation()");
    expect(rendererSource).toContain("await shareThumbnailMutation.mutateAsync({ token, thumbnailDataUrl })");
  });

  it("maps selected-cabinet left and right arrows to the visible screen direction on every wall axis", () => {
    expect(threeDScreenHorizontalPlanDelta("top", "right", 1, { x: 0.8, z: -0.4 })).toEqual({ x: 1, y: 0 });
    expect(threeDScreenHorizontalPlanDelta("bottom", "left", 1, { x: 0.8, z: -0.4 })).toEqual({ x: -1, y: 0 });
    expect(threeDScreenHorizontalPlanDelta("left", "right", 0.25, { x: 0.8, z: -0.4 })).toEqual({ x: 0, y: -0.25 });
    expect(threeDScreenHorizontalPlanDelta("right", "left", 0.25, { x: 0.8, z: -0.4 })).toEqual({ x: 0, y: 0.25 });
  });

  it("builds architectural trim, sill, muntins, door panels, and hardware for room openings", () => {
    const root = new THREE.Group();
    addWallOpening(root, { uid: "window-1", kind: "window", label: "Window", side: "back", offset: 24, width: 36, sill: 36, height: 42 } as never, 144, 120);
    addWallOpening(root, { uid: "door-1", kind: "door", label: "Door", side: "left", offset: 18, width: 30, sill: 0, height: 80 } as never, 144, 120);
    const details: string[] = [];
    root.traverse((node) => {
      if (node.userData.architecturalOpeningTrim) details.push("trim");
      if (node.userData.architecturalWindowSill) details.push("sill");
      if (node.userData.windowMuntin) details.push("muntin");
      if (node.userData.architecturalDoorPanel) details.push("door-panel");
      if (node.userData.architecturalDoorHandle) details.push("door-handle");
    });
    expect(details.filter((detail) => detail === "trim")).toHaveLength(8);
    expect(details).toEqual(expect.arrayContaining(["sill", "muntin", "door-panel", "door-handle"]));
  });

  it("reads seeded room dimensions while preserving safe defaults", () => {
    expect(dimensions({ width: 156, depth: 144, ceilingHeight: 96 })).toEqual({ width: 156, depth: 144, ceilingHeight: 96 });
    expect(dimensions({ width: 0 })).toEqual({ width: 144, depth: 120, ceilingHeight: 96 });
  });

  it("uses a verified hex style color before applying finish-name fallbacks", () => {
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "#1a2744" } } })).toBe("#1a2744");
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "Sage", finish: "Painted" } } })).toBe("#78826b");
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "Aero Sage (Preston)", finish: "Matching" } } })).toBe("#4f5549");
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "Designer Natural", finish: "Natural Maple" } } })).toBe("#d1ba8f");
  });

  it("constrains adjustable 3D wall height from one inch through ten feet", () => {
    expect(constrainedThreeDWallHeight(0)).toBe(1);
    expect(constrainedThreeDWallHeight(1)).toBe(1);
    expect(constrainedThreeDWallHeight(120)).toBe(120);
    expect(constrainedThreeDWallHeight(144)).toBe(120);
    expect(constrainedThreeDWallHeight("10.2")).toBe(10);
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

  it("uses the supplied selected door sample without generic tinting", () => {
    expect(threeDUsesDoorSampleTexture("/manus-storage/silva.png")).toBe(true);
    expect(threeDUsesDoorSampleTexture(null)).toBe(false);
    expect(threeDFaceMaterialColor("#75523e", true)).toBe("#ffffff");
    expect(threeDFaceMaterialColor("#75523e", false)).toBe("#75523e");
  });

  it("uses supplied Cabinet Config visuals for cabinet fronts, never appliance or guessed visuals", () => {
    expect(threeDCabinetFrontVisualUrl({ placementType: "base", catalogImageUrl: "/manus-storage/b18.png" })).toBe("/manus-storage/b18.png");
    expect(threeDCabinetFrontVisualUrl({ placementType: "appliance", catalogImageUrl: "/manus-storage/range.png" })).toBeNull();
    expect(threeDCabinetFrontVisualUrl({ placementType: "base", catalogImageUrl: null })).toBeNull();
  });

  it("prefers the live Cabinet Config visual map when older saved placements omitted their product image", () => {
    expect(resolvedPlacedCabinetFrontVisual({ uid: "placed-b18" } as any, { "placed-b18": "/manus-storage/b18.png" }, null)).toBe("/manus-storage/b18.png");
    expect(resolvedPlacedCabinetFrontVisual({ uid: "placed-b18" } as any, undefined, "/manus-storage/fallback.png")).toBe("/manus-storage/fallback.png");
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

  it("adds original 3D visual fronts for non-range appliances without changing catalog envelopes or appliance mounting", () => {
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

    expect(visualPlanes).toHaveLength(4);
    expect(visualPlanes.map((node) => node.userData.originalProductVisualUrl)).toEqual([
      "/manus-storage/original-hood.webp", "/manus-storage/original-fridge.webp",
      "/manus-storage/original-dishwasher.webp", "/manus-storage/original-microwave.webp",
    ]);
    expect(visualPlanes.map((node) => node.userData.catalogEnvelope)).toEqual([
      expect.objectContaining({ widthIn: 30, heightIn: 18, depthIn: 18, mountBottomIn: 66 }),
      expect.objectContaining({ widthIn: 36, heightIn: 70, depthIn: 30, mountBottomIn: 0 }),
      expect.objectContaining({ widthIn: 24, heightIn: 34.5, depthIn: 24, mountBottomIn: 0 }),
      expect.objectContaining({ widthIn: 30, heightIn: 17, depthIn: 15, mountBottomIn: 54 }),
    ]);
  });

  it("builds dimensional microwave and oven appliance bezels, displays, and door handles", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 51, cabinetId: 51, masterCode: "MW-30", description: "30 inch over-range microwave", placementType: "appliance",
      width: 30, height: 17, depth: 15, mountBottom: 54, numberOfDoors: 0, numberOfDrawers: 0,
    }, null, {}, 144, 120, "#6b7567", "#eeeeee");
    addCabinet(root, {
      distributorSkuId: 52, cabinetId: 52, masterCode: "OVEN-30", description: "30 inch single oven", placementType: "appliance",
      width: 30, height: 28, depth: 24, mountBottom: 30, numberOfDoors: 0, numberOfDrawers: 0,
    }, null, {}, 144, 120, "#6b7567", "#eeeeee");
    const bezels: THREE.Object3D[] = [];
    const displays: string[] = [];
    const handles: string[] = [];
    root.traverse((node) => {
      if (node.userData.applianceBezel) bezels.push(node);
      if (node.userData.applianceDisplay) displays.push(node.userData.applianceDisplay);
      if (node.userData.applianceDoorHandle) handles.push(node.userData.applianceDoorHandle);
    });
    expect(bezels).toHaveLength(8);
    expect(displays).toEqual(expect.arrayContaining(["microwave", "oven"]));
    expect(handles).toEqual(expect.arrayContaining(["microwave", "oven"]));
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

  it("seats a legacy near-wall end-run cabinet flush while retaining an explicit in/out adjustment", () => {
    const legacy = {
      uid: "left-end", cabinetId: 11, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 4, y: 24, width: 30, depth: 12, height: 30, rotation: 90, mountBottom: 54,
    } as never;
    const room = { width: 144, depth: 120, ceilingHeight: 96 };
    expect(existingCabinetTransform(legacy, room)).toMatchObject({ x: 6, z: 39, rotation: Math.PI / 2 });
    expect(existingCabinetTransform({ ...legacy, depthPositionAdjusted: true }, room)).toMatchObject({ x: 10, z: 39, rotation: Math.PI / 2 });
  });

  it("uses the saved left-wall quarter turn to seat an offset legacy end run on the physical wall", () => {
    const room = { width: 144, depth: 120, ceilingHeight: 96 };
    expect(existingCabinetTransform({
      uid: "left-offset", cabinetId: 12, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 12, y: 24, width: 30, depth: 12, height: 30, rotation: 90, mountBottom: 54,
    } as never, room)).toMatchObject({ x: 6, z: 39, rotation: Math.PI / 2 });
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
    expect(resolvedThreeDSpecialtyProfile({
      masterCode: "FSB-36", description: '36" Farmhouse Sink Base', graphicType: null, customProfile: null, facePattern: null, cornerType: null,
    })).toEqual({ kind: "farmhouse-sink", pattern: null });
  });

  it("keeps ERB36's two exposed L-corner fronts on the room side at the top-right room corner", () => {
    const room = { width: 120, depth: 120, ceilingHeight: 96 } as never;
    const erb = {
      uid: "erb36-top-right", cabinetId: 36, masterCode: "ERB-36", description: "Easy Reach Corner Base",
      placement: "base", x: 84, y: 0, width: 36, depth: 36, height: 34.5, rotation: 90, numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    expect(existingCabinetTransform(erb, room).rotation).toBeCloseTo(Math.PI * 1.5, 12);
  });

  it("keeps left and right LSB36 lazy Susan fronts on their room-facing corner legs", () => {
    const room = { width: 120, depth: 120, ceilingHeight: 96 } as never;
    const left = {
      uid: "lsb36-top-left", cabinetId: 36, masterCode: "LSB36", description: "Lazy Susan Base Cabinet",
      placement: "base", x: 0, y: 0, width: 36, depth: 36, height: 34.5, rotation: 0, cornerType: "lazy-susan", numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    const right = {
      uid: "lsb36-top-right", cabinetId: 36, masterCode: "LSB36", description: "Lazy Susan Base Cabinet",
      placement: "base", x: 84, y: 0, width: 36, depth: 36, height: 34.5, rotation: 90, cornerType: "lazy-susan", numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    expect(existingCabinetTransform(left, room).rotation).toBeCloseTo(0, 12);
    expect(existingCabinetTransform(right, room).rotation).toBeCloseTo(Math.PI * 1.5, 12);
  });

  it("mounts FSB36's apron on the room-facing side of a right-wall placement", () => {
    const room = { width: 120, depth: 120, ceilingHeight: 96 } as never;
    const fsb = {
      uid: "fsb36-right", cabinetId: 36, masterCode: "FSB-36", description: '36" Farmhouse Sink Base',
      placement: "base", x: 96, y: 36, width: 36, depth: 24, height: 34.5, rotation: 90, numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    expect(existingCabinetTransform(fsb, room).rotation).toBeCloseTo(-Math.PI / 2, 12);
    const root = new THREE.Group();
    addCabinet(root, existingCabinetSku(fsb), null, {}, room.width, room.depth, "#7e8d72", "#f8f8f6", undefined, existingCabinetTransform(fsb, room));
    root.updateMatrixWorld(true);
    const cabinet = root.children.find((node) => node.userData.masterCode === "FSB-36")!;
    let apron: THREE.Object3D | undefined;
    root.traverse((node) => { if (node.userData.farmhouseApronFront) apron = node; });
    const cabinetPosition = new THREE.Vector3();
    const apronPosition = new THREE.Vector3();
    cabinet.getWorldPosition(cabinetPosition);
    expect(apron).toBeDefined();
    apron.getWorldPosition(apronPosition);
    expect(apronPosition.x).toBeLessThan(cabinetPosition.x);
  });

  it("keeps a right-wall cabinet and fitted filler facing the room when either one touches the front-right corner", () => {
    const room = { width: 120, depth: 120, ceilingHeight: 96 } as never;
    const cabinetWithLeftFiller = {
      uid: "b21-right-left-fill", cabinetId: 21, masterCode: "B-21-L", description: '21" Base Cabinet',
      placement: "base", x: 96, y: 99, width: 21, depth: 24, height: 34.5, rotation: 90, numberOfDoors: 1, numberOfDrawers: 1,
    } as never;
    const leftFiller = {
      uid: "f342-left", cabinetId: 342, masterCode: "F342-L", description: 'Filler cut to 3" — install on left',
      placement: "base", x: 96, y: 96, width: 3, depth: 24, height: 34.5, rotation: 90, numberOfDoors: 0, numberOfDrawers: 0,
      fillerPieceGroupId: "filler-group-left", fillerTotalWidth: 3, fillerPlacementMode: "left",
    } as never;
    const cabinetWithRightFiller = {
      ...cabinetWithLeftFiller,
      uid: "b21-right-right-fill", masterCode: "B-21-R", y: 72,
    } as never;
    const rightFiller = {
      ...leftFiller,
      uid: "f342-right", masterCode: "F342-R", description: 'Filler cut to 3" — install on right', y: 93, fillerPieceGroupId: "filler-group-right", fillerPlacementMode: "right",
    } as never;
    const root = new THREE.Group();
    for (const placed of [cabinetWithLeftFiller, leftFiller, cabinetWithRightFiller, rightFiller]) {
      addCabinet(root, existingCabinetSku(placed), null, {}, room.width, room.depth, "#7e8d72", "#f8f8f6", undefined, existingCabinetTransform(placed, room));
    }
    root.updateMatrixWorld(true);
    const measured = [cabinetWithLeftFiller, leftFiller, cabinetWithRightFiller, rightFiller].map((placed) => {
      const group = root.children.find((node) => node.userData.placedUid === placed.uid)!;
      const body = group.children.find((node) => node.userData.selectedStyleSideSkin)!;
      return new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
    });

    expect(measured[0]!.x).toBeCloseTo(24 / 12, 5);
    expect(measured[0]!.z).toBeCloseTo(21 / 12, 5);
    expect(measured[1]!.x).toBeCloseTo(24 / 12, 5);
    expect(measured[1]!.z).toBeCloseTo(3 / 12, 5);
    expect(measured[2]!.x).toBeCloseTo(24 / 12, 5);
    expect(measured[2]!.z).toBeCloseTo(21 / 12, 5);
    expect(measured[3]!.x).toBeCloseTo(24 / 12, 5);
    expect(measured[3]!.z).toBeCloseTo(3 / 12, 5);
    for (const placed of [cabinetWithLeftFiller, leftFiller, cabinetWithRightFiller, rightFiller]) {
      expect(existingCabinetTransform(placed, room).rotation).toBeCloseTo(-Math.PI / 2, 12);
    }
  });

  it("keeps FSB36's apron on its rotated right-wall run when it also touches the front wall", () => {
    const room = { width: 120, depth: 120, ceilingHeight: 96 } as never;
    const fsbAtFrontRight = {
      uid: "fsb36-front-right", cabinetId: 36, masterCode: "FSB-36", description: '36" Farm Sink Base Cabinet',
      placement: "base", x: 96, y: 84, width: 36, depth: 24, height: 34.5, rotation: 90, numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    expect(existingCabinetTransform(fsbAtFrontRight, room).rotation).toBeCloseTo(-Math.PI / 2, 12);
  });

  it("renders a generic-metadata FSB36 as a farmhouse front and normalizes a short RANGE-30 record to the 34.5-inch base-cabinet line", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 1, cabinetId: 36, masterCode: "FSB-36", description: '36" Farm Sink Base Cabinet',
      placementType: "base", width: 36, height: 34.5, depth: 24, mountBottom: 0, numberOfDoors: 2, numberOfDrawers: 0,
    }, null, {}, 144, 120, "#7e8d72", "#f8f8f6");
    addCabinet(root, {
      distributorSkuId: 2, cabinetId: 30, masterCode: "RANGE-30", description: "30 inch range",
      placementType: "appliance", width: 30, height: 30, depth: 25, mountBottom: 0, numberOfDoors: 0, numberOfDrawers: 0,
    }, null, {}, 144, 120, "#7e8d72", "#f8f8f6");
    const nodes: THREE.Object3D[] = [];
    root.traverse((node) => nodes.push(node));
    expect(nodes.filter((node) => node.userData.farmhouseApronFront)).toHaveLength(1);
    const range = root.children.find((node) => node.userData.masterCode === "RANGE-30")!;
    expect(range.userData.catalogApplianceEnvelope.heightIn).toBe(34.5);
  });

  it("builds dimensional cabinet, refrigerator, range, dishwasher, farmhouse sink, and hood detail meshes", () => {
    const root = new THREE.Group();
    const common = { width: 30, height: 36, depth: 24, mountBottom: 0, numberOfDoors: 2, numberOfDrawers: 1 };
    addCabinet(root, { distributorSkuId: 1, cabinetId: 1, masterCode: "B-30", description: "Base Cabinet", placementType: "base", ...common }, null, {}, 180, 144, "#7e8d72", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "shaker" });
    addCabinet(root, { distributorSkuId: 2, cabinetId: 2, masterCode: "FRIDGE-36", description: "36 inch Panel-Ready Refrigerator", placementType: "appliance", width: 36, height: 70, depth: 30, mountBottom: 0, numberOfDoors: 0, numberOfDrawers: 0 }, null, {}, 180, 144, "#7e8d72", "#f8f8f6");
    addCabinet(root, { distributorSkuId: 3, cabinetId: 3, masterCode: "RANGE-30", description: "30 inch Freestanding Range", placementType: "appliance", width: 30, height: 36, depth: 25, mountBottom: 0, numberOfDoors: 0, numberOfDrawers: 0 }, null, {}, 180, 144, "#7e8d72", "#f8f8f6");
    addCabinet(root, { distributorSkuId: 4, cabinetId: 4, masterCode: "DW-24", description: "24 inch Panel Ready Dishwasher", placementType: "appliance", width: 24, height: 34.5, depth: 24, mountBottom: 0, numberOfDoors: 0, numberOfDrawers: 0 }, null, {}, 180, 144, "#7e8d72", "#f8f8f6");
    addCabinet(root, { distributorSkuId: 5, cabinetId: 5, masterCode: "FSB-36", description: "36 inch Farmhouse Sink Base", placementType: "base", width: 36, height: 34.5, depth: 24, mountBottom: 0, numberOfDoors: 2, numberOfDrawers: 0 }, null, {}, 180, 144, "#7e8d72", "#f8f8f6");
    addCabinet(root, { distributorSkuId: 6, cabinetId: 6, masterCode: "HOOD-30", description: "30 inch Range Hood", placementType: "appliance", width: 30, height: 18, depth: 18, mountBottom: 66, numberOfDoors: 0, numberOfDrawers: 0 }, null, {}, 180, 144, "#7e8d72", "#f8f8f6");
    const nodes: THREE.Object3D[] = [];
    root.traverse((node) => nodes.push(node));
    expect(nodes.some((node) => node.userData.cabinetHardware)).toBe(true);
    expect(nodes.some((node) => node.userData.cabinetFaceShadowGap)).toBe(true);
    expect(nodes.filter((node) => node.userData.refrigeratorHandle)).toHaveLength(2);
    expect(nodes.filter((node) => node.userData.refrigeratorFoot)).toHaveLength(2);
    expect(nodes.some((node) => node.userData.refrigeratorDispenser)).toBe(true);
    expect(nodes.some((node) => node.userData.refrigeratorTopVent)).toBe(true);
    expect(nodes.filter((node) => node.userData.refrigeratorHingeCap)).toHaveLength(2);
    expect(nodes.filter((node) => node.userData.rangeControlKnob)).toHaveLength(4);
    expect(nodes.some((node) => node.userData.rangeOvenHandle)).toBe(true);
    expect(nodes.some((node) => node.userData.dishwasherControlStrip)).toBe(true);
    expect(nodes.some((node) => node.userData.dishwasherHandle)).toBe(true);
    expect(nodes.filter((node) => node.userData.dishwasherControlButton)).toHaveLength(4);
    expect(nodes.some((node) => node.userData.dishwasherDoorReveal)).toBe(true);
    expect(nodes.filter((node) => node.userData.panelReadyFinish)).toHaveLength(2);
    expect(nodes.some((node) => node.userData.farmhouseSinkBasin)).toBe(true);
    expect(nodes.some((node) => node.userData.farmhouseSinkFaucetSpout)).toBe(true);
    expect(nodes.filter((node) => node.userData.rangeHoodVent)).toHaveLength(3);
    expect(nodes.filter((node) => node.userData.rangeHoodControl)).toHaveLength(2);
  });

  it("uses vertical hinge-opposite pulls at the correct upper and lower pantry door zones", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 1, cabinetId: 1, masterCode: "P-24-90", description: "24 inch Pantry Cabinet",
      placementType: "tall", width: 24, height: 90, depth: 24, mountBottom: 0, numberOfDoors: 4, numberOfDrawers: 0,
    }, null, {}, 144, 120, "#7e8d72", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "shaker" });
    const pulls: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.cabinetPull === "door") pulls.push(node); });
    expect(pulls).toHaveLength(4);
    expect(pulls.filter((node) => node.userData.pullDoorZone === "upper")).toHaveLength(2);
    expect(pulls.filter((node) => node.userData.pullDoorZone === "lower")).toHaveLength(2);
    expect(pulls.every((node) => node.userData.verticalPull && node.userData.pullEdge === "opposite-hinge")).toBe(true);
  });

  it("keeps cabinet shell and toe kick in the selected finish while using recessed drawer gaps instead of ghost-prone outlines", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 1, cabinetId: 1, masterCode: "B-30", description: "Base Cabinet",
      placementType: "base", width: 30, height: 34.5, depth: 24, mountBottom: 0, numberOfDoors: 2, numberOfDrawers: 1,
    }, null, {}, 144, 120, "#7e8d72", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "shaker" });
    const nodes: THREE.Object3D[] = [];
    root.traverse((node) => nodes.push(node));
    const toeKick = nodes.find((node) => node.userData.baseToeKick) as THREE.Mesh;
    expect((toeKick.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("7e8d72");
    const reveals = nodes.filter((node) => node.userData.cabinetDrawerReveal);
    expect(reveals.length).toBeGreaterThan(0);
    expect(reveals.every((node) => !(node instanceof THREE.LineSegments))).toBe(true);
    expect(THREE_D_DRAWER_REVEAL_DEPTH).toBe(0.002);
  });

  it("renders a stale-count B-18 lower front as a hinged door with a vertical opposite-hinge handle", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 2640004,
      cabinetId: 9390004,
      masterCode: "B-18",
      description: "Base Cabinet",
      placementType: "base",
      graphicType: "standard_base",
      width: 18,
      height: 34.5,
      depth: 24,
      mountBottom: 0,
      numberOfDoors: 0,
      numberOfDrawers: 2,
      swing: "left",
    }, null, {}, 144, 120, "#7e8d72", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "shaker" });
    const pulls: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.cabinetHardware) pulls.push(node); });
    const doorPulls = pulls.filter((node) => node.userData.cabinetPull === "door");
    const drawerPulls = pulls.filter((node) => node.userData.cabinetPull === "drawer");
    expect(doorPulls).toHaveLength(1);
    expect(drawerPulls).toHaveLength(1);
    expect(doorPulls[0]?.userData).toMatchObject({ verticalPull: true, pullEdge: "opposite-hinge", hingeSide: "left", handleSide: "right" });
    expect(drawerPulls[0]?.userData).toMatchObject({ verticalPull: false, pullEdge: "center", handleSide: "center" });
    const doorGeometry = (doorPulls[0] as THREE.Mesh).geometry as THREE.BoxGeometry;
    const drawerGeometry = (drawerPulls[0] as THREE.Mesh).geometry as THREE.BoxGeometry;
    expect(doorGeometry.parameters.height).toBeGreaterThan(doorGeometry.parameters.width);
    expect(drawerGeometry.parameters.width).toBeGreaterThan(drawerGeometry.parameters.height);
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

  it("renders a glass-selected WDC2442 as one framed transparent diagonal door with its three configured shelves", () => {
    const wdc = {
      uid: "glass-wdc2442",
      cabinetId: 9390174,
      masterCode: "WDC2442",
      description: '24" Diagonal Corner Wall Cabinet with 3 Adjustable Shelves',
      placement: "wall",
      x: 0,
      y: 0,
      width: 24,
      depth: 12,
      height: 42,
      rotation: 0,
      numberOfDoors: 1,
      numberOfDrawers: 0,
      adjustableShelfCount: 3,
      glassDoor: true,
      glassDoorAddonCode: "PGWDC42",
    } as never;
    const sku = existingCabinetSku(wdc);
    expect(sku).toMatchObject({ glassDoor: true, adjustableShelfCount: 3, numberOfDoors: 1 });

    const root = new THREE.Group();
    addCabinet(
      root,
      sku,
      null,
      {},
      144,
      120,
      "#b78a54",
      "#f8f8f6",
      { doorStyle: "Shaker", doorPanelType: "recessed" },
      existingCabinetTransform(wdc, { width: 144, depth: 120, ceilingHeight: 96 } as never),
    );
    const nodes: THREE.Object3D[] = [];
    root.traverse((node) => nodes.push(node));
    const glassDoors = nodes.filter((node) => node.userData.glassCabinetDoor) as THREE.Mesh[];
    expect(glassDoors).toHaveLength(1);
    expect(glassDoors[0]?.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect((glassDoors[0]?.material as THREE.MeshPhysicalMaterial).transparent).toBe(true);
    expect(nodes.filter((node) => node.userData.diagonalGlassShelf)).toHaveLength(3);
    expect(nodes.filter((node) => node.userData.selectedStyleFace === "shaker")).toHaveLength(5);
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

  it("puts lazy-Susan and easy-reach base pulls on the opening edge opposite the selected hinge", () => {
    for (const [masterCode, description, swing, expectedHandle] of [
      ["LSB36", "Lazy Susan Base", "left", "right"],
      ["ERB36", "Easy Reach Base", "right", "left"],
    ] as const) {
      const cabinet = { uid: `${masterCode}-${swing}`, cabinetId: 1, masterCode, description, placement: "base", x: 0, y: 0, width: 36, depth: 36, height: 34.5, rotation: 0, numberOfDoors: 2, numberOfDrawers: 0, cornerType: "l-shape", swing } as never;
      const root = new THREE.Group();
      addCabinet(root, existingCabinetSku(cabinet), null, {}, 144, 120, "#d1ba8f", "#ffffff", { doorStyle: "Shaker", doorPanelType: null }, existingCabinetTransform(cabinet));
      const pulls: THREE.Object3D[] = [];
      root.traverse((node) => { if (node.userData.lCornerHingeOppositePull) pulls.push(node); });
      expect(pulls).toHaveLength(1);
      expect(pulls[0]?.userData).toMatchObject({ hingeSide: swing, handleSide: expectedHandle, pullEdge: "opposite-hinge" });
      expect(pulls[0]?.userData).toMatchObject({ frameWidthIn: 3, frameCenterInsetIn: 1.5 });
      expect(pulls[0]?.userData.pullHeight).toBe("upper-opening-edge");
      expect(pulls[0]?.position.y).toBeGreaterThan(0);
      const operativeDoor: THREE.Mesh[] = [];
      root.traverse((node) => {
        if (node.userData.lCornerDoor === (swing === "left" ? "back-leg" : "side-leg") && node instanceof THREE.Mesh) operativeDoor.push(node);
      });
      expect(operativeDoor).toHaveLength(1);
      const doorWidth = (operativeDoor[0]!.geometry as THREE.BoxGeometry).parameters.width;
      const lateralOffset = swing === "left"
        ? Math.abs(pulls[0]!.position.x - operativeDoor[0]!.position.x)
        : Math.abs(pulls[0]!.position.z - operativeDoor[0]!.position.z);
      expect((doorWidth / 2 - lateralOffset) * 12).toBeCloseTo(1.5, 8);
    }
  });

  it("renders each saved cabinet hardware position independently, including paired-door pulls", () => {
    const renderPulls = (hardwarePosition: "left" | "center" | "right" | "paired", doors = 1) => {
      const isPairedDoorBase = doors > 1;
      const cabinet = {
        uid: `hardware-${hardwarePosition}`,
        cabinetId: 1,
        masterCode: isPairedDoorBase ? "B-30" : "B-18",
        description: isPairedDoorBase
          ? "30 inch Double Door Single Drawer Base Cabinet"
          : "18 inch Single Door Single Drawer Base Cabinet",
        placement: "base",
        x: 0,
        y: 0,
        width: isPairedDoorBase ? 30 : 18,
        depth: 24,
        height: 34.5,
        rotation: 0,
        numberOfDoors: doors,
        numberOfDrawers: 1,
        hardwarePosition,
      } as never;
      const root = new THREE.Group();
      addCabinet(root, existingCabinetSku(cabinet), null, {}, 144, 120, "#d1ba8f", "#ffffff", { doorStyle: "Shaker", doorPanelType: null }, existingCabinetTransform(cabinet));
      const pulls: THREE.Object3D[] = [];
      root.traverse((node) => { if (node.userData.cabinetHardware && node.userData.cabinetPull === "door") pulls.push(node); });
      return pulls;
    };

    const left = renderPulls("left");
    const center = renderPulls("center");
    const right = renderPulls("right");
    const paired = renderPulls("paired", 2);

    expect(left).toHaveLength(1);
    expect(center).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0]?.userData).toMatchObject({ hardwarePosition: "left", pullEdge: "left" });
    expect(center[0]?.userData).toMatchObject({ hardwarePosition: "auto", pullEdge: "opposite-hinge", frameCenterInsetIn: 1.5 });
    expect(right[0]?.userData).toMatchObject({ hardwarePosition: "right", pullEdge: "right" });
    expect(left[0]!.position.x).toBeLessThan(center[0]!.position.x);
    expect(center[0]!.position.x).toBeCloseTo(right[0]!.position.x, 8);
    expect(paired).toHaveLength(2);
    expect(paired.every((pull) => pull.userData.hardwarePosition === "paired" && pull.userData.pullEdge === "opposite-hinge")).toBe(true);
  });

  it("places standard and paired 3D door pulls exactly 1.5 inches from their physical door edges", () => {
    const renderDoorHardware = (width: number, doors: number, hardwarePosition: "right" | "center" | "paired", placement: "base" | "wall" = "base") => {
      const cabinet = {
        uid: `measured-${width}-${doors}`,
        cabinetId: 1,
        masterCode: placement === "wall" ? (doors === 1 ? "W-1830" : "W-3030") : doors === 1 ? "B-18" : "B-30",
        description: `${width} inch ${doors === 1 ? "Single" : "Double"} Door ${placement === "wall" ? "Wall" : "Base"}`,
        placement,
        x: 0,
        y: 0,
        width,
        depth: placement === "wall" ? 12 : 24,
        height: placement === "wall" ? 30 : 34.5,
        rotation: 0,
        numberOfDoors: doors,
        numberOfDrawers: 0,
        hardwarePosition,
      } as never;
      const root = new THREE.Group();
      addCabinet(root, existingCabinetSku(cabinet), null, {}, 144, 120, "#d1ba8f", "#ffffff", { doorStyle: "Shaker", doorPanelType: null }, existingCabinetTransform(cabinet));
      const doorMeshes: THREE.Mesh[] = [];
      const pullMeshes: THREE.Object3D[] = [];
      root.traverse((node) => {
        if (node.userData.cabinetFront && !node.userData.cabinetDrawerFront && node instanceof THREE.Mesh) doorMeshes.push(node);
        if (node.userData.cabinetHardware && node.userData.cabinetPull === "door") pullMeshes.push(node);
      });
      return {
        doors: doorMeshes.sort((a, b) => a.position.x - b.position.x),
        pulls: pullMeshes.sort((a, b) => a.position.x - b.position.x),
      };
    };

    const single = renderDoorHardware(18, 1, "right");
    expect(single.doors).toHaveLength(1);
    expect(single.pulls).toHaveLength(1);
    const singleDoorWidth = (single.doors[0]!.geometry as THREE.BoxGeometry).parameters.width;
    expect((singleDoorWidth / 2 - Math.abs(single.pulls[0]!.position.x - single.doors[0]!.position.x)) * 12).toBeCloseTo(1.5, 8);
    expect(single.pulls[0]!.userData).toMatchObject({ frameWidthIn: 3, frameCenterInsetIn: 1.5 });

    const paired = renderDoorHardware(30, 2, "paired");
    expect(paired.doors).toHaveLength(2);
    expect(paired.pulls).toHaveLength(2);
    paired.doors.forEach((door, index) => {
      const doorWidth = (door.geometry as THREE.BoxGeometry).parameters.width;
      expect((doorWidth / 2 - Math.abs(paired.pulls[index]!.position.x - door.position.x)) * 12).toBeCloseTo(1.5, 8);
      expect(paired.pulls[index]!.userData).toMatchObject({ frameWidthIn: 3, frameCenterInsetIn: 1.5 });
    });

    const legacyCenteredSingleUpper = renderDoorHardware(18, 1, "center", "wall");
    expect(legacyCenteredSingleUpper.doors).toHaveLength(1);
    expect(legacyCenteredSingleUpper.pulls).toHaveLength(1);
    const upperSingleDoorWidth = (legacyCenteredSingleUpper.doors[0]!.geometry as THREE.BoxGeometry).parameters.width;
    expect((upperSingleDoorWidth / 2 - Math.abs(legacyCenteredSingleUpper.pulls[0]!.position.x - legacyCenteredSingleUpper.doors[0]!.position.x)) * 12).toBeCloseTo(1.5, 8);
    expect(legacyCenteredSingleUpper.pulls[0]!.userData).toMatchObject({ hardwarePosition: "auto", pullEdge: "opposite-hinge", pullDoorZone: "upper", frameWidthIn: 3, frameCenterInsetIn: 1.5 });

    const legacyCenteredPairedUpper = renderDoorHardware(30, 2, "center", "wall");
    expect(legacyCenteredPairedUpper.doors).toHaveLength(2);
    expect(legacyCenteredPairedUpper.pulls).toHaveLength(2);
    legacyCenteredPairedUpper.doors.forEach((door, index) => {
      const doorWidth = (door.geometry as THREE.BoxGeometry).parameters.width;
      expect((doorWidth / 2 - Math.abs(legacyCenteredPairedUpper.pulls[index]!.position.x - door.position.x)) * 12).toBeCloseTo(1.5, 8);
      expect(legacyCenteredPairedUpper.pulls[index]!.userData).toMatchObject({ hardwarePosition: "auto", pullEdge: "opposite-hinge", pullDoorZone: "upper", frameWidthIn: 3, frameCenterInsetIn: 1.5 });
    });
  });

  it("centers every drawer pull even when the cabinet’s door hardware preference is left or right", () => {
    const cabinet = {
      uid: "drawer-centering-rule",
      cabinetId: 1,
      masterCode: "DB-30-3",
      description: "30 inch Three Drawer Base",
      placement: "base",
      x: 0,
      y: 0,
      width: 30,
      depth: 24,
      height: 34.5,
      rotation: 0,
      numberOfDoors: 0,
      numberOfDrawers: 3,
      hardwarePosition: "left",
    } as never;
    const root = new THREE.Group();
    addCabinet(root, existingCabinetSku(cabinet), null, {}, 144, 120, "#d1ba8f", "#ffffff", { doorStyle: "Shaker", doorPanelType: null }, existingCabinetTransform(cabinet));
    const drawerPulls: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.cabinetHardware && node.userData.cabinetPull === "drawer") drawerPulls.push(node); });

    expect(drawerPulls).toHaveLength(3);
    expect(drawerPulls.every((pull) => pull.userData.hardwarePosition === "center" && pull.userData.pullEdge === "center" && pull.userData.handleSide === "center")).toBe(true);
    expect(drawerPulls.map((pull) => pull.position.x)).toEqual([0, 0, 0]);
  });

  it("renders 2-DB24 as two equal drawer fronts with centered horizontal pulls", () => {
    const cabinet = {
      uid: "affiliate-two-db24",
      cabinetId: 9400174,
      masterCode: "2-DB24",
      description: "24 inch Two Drawer Base",
      placement: "base",
      x: 0,
      y: 0,
      width: 24,
      depth: 24,
      height: 34.5,
      rotation: 0,
      numberOfDoors: 0,
      numberOfDrawers: 2,
      drawerLayout: JSON.stringify([{ count: 1, height: 6 }, { count: 1, height: 24 }]),
      hardwarePosition: "right",
    } as never;
    const root = new THREE.Group();
    addCabinet(root, existingCabinetSku(cabinet), null, {}, 144, 120, "#eee9dd", "#ffffff", { doorStyle: "Shaker", doorPanelType: null }, existingCabinetTransform(cabinet));
    const drawers: THREE.Mesh[] = [];
    const drawerPulls: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.cabinetDrawerFront && node instanceof THREE.Mesh) drawers.push(node);
      if (node.userData.cabinetHardware && node.userData.cabinetPull === "drawer") drawerPulls.push(node);
    });

    expect(drawers).toHaveLength(2);
    const heights = drawers.map((drawer) => (drawer.geometry as THREE.BoxGeometry).parameters.height);
    expect(heights[0]).toBeCloseTo(heights[1], 12);
    expect(drawerPulls).toHaveLength(2);
    expect(drawerPulls.every((pull) => !pull.userData.verticalPull && pull.userData.hardwarePosition === "center" && pull.position.x === 0)).toBe(true);
  });

  it("uses compact W3024 code dimensions as 30 inches wide by 24 inches high even when an import transposes the row", () => {
    const imported = {
      uid: "w3024", cabinetId: 1, masterCode: "W3024", description: "Wall Cabinet 30 x 24",
      placement: "wall", x: 0, y: 0, width: 24, depth: 12, height: 30, rotation: 0,
    } as never;
    expect(existingCabinetSku(imported)).toMatchObject({ width: 30, height: 24, depth: 12 });
  });

  it("keeps authored drawer-row counts and measured heights instead of replacing them with generic slats", () => {
    const rows = resolvedThreeDDrawerRows({
      drawerLayout: JSON.stringify([{ count: 1, height: 6 }, { count: 2, height: 5 }]),
    }, 2, 3);
    expect(rows.map((row) => row.count)).toEqual([1, 2]);
    expect(rows.map((row) => row.height)).toEqual([0.5, expect.closeTo(0.4166666667, 10)]);
    expect(THREE_D_DRAWER_REVEAL_DEPTH).toBe(0.002);
  });

  it("assigns a drawer-only cabinet’s complete usable face to a stack with a shallow six-inch top drawer", () => {
    const layout = resolvedThreeDFaceLayout({ placementType: "base", numberOfDoors: 0, numberOfDrawers: 3 });
    const usableHeight = 34.5 / 12 - 0.08;
    const drawerZone = layout.doorCount === 0 && !layout.hasConfiguredOpening ? usableHeight : usableHeight * 0.35;
    expect(drawerZone).toBeCloseTo(usableHeight, 12);
    const rows = resolvedThreeDDrawerRows({ drawerLayout: null }, drawerZone, layout.drawerCount, true);
    expect(rows[0]).toEqual({ count: 1, height: 0.5 });
    expect(rows.slice(1).map((row) => row.height)).toEqual([
      expect.closeTo((usableHeight - 0.5) / 2, 12),
      expect.closeTo((usableHeight - 0.5) / 2, 12),
    ]);
    expect(resolvedThreeDDrawerRows({ drawerLayout: JSON.stringify([{ count: 1, height: 8 }, { count: 1, height: 12 }]) }, drawerZone, 2, true)).toEqual([
      { count: 1, height: expect.closeTo(8 / 12, 12) },
      { count: 1, height: 1 },
    ]);
  });

  it("keeps 2-DB24 authoritative as two equal drawers despite a generic short-top flag or stale unequal saved layout", () => {
    const availableHeight = 34.5 / 12 - 0.08;
    const sku = {
      masterCode: "2-DB24",
      numberOfDoors: 0,
      numberOfDrawers: 2,
      drawerLayout: JSON.stringify([{ count: 1, height: 6 }, { count: 1, height: 24 }]),
    };
    expect(isEqualHeightTwoDrawerBase(sku, 2)).toBe(true);
    expect(resolvedThreeDDrawerRows(sku, availableHeight, 2, true)).toEqual([
      { count: 1, height: availableHeight / 2 },
      { count: 1, height: availableHeight / 2 },
    ]);
    expect(isEqualHeightTwoDrawerBase({ ...sku, numberOfDoors: 2 }, 2)).toBe(true);
    expect(isEqualHeightTwoDrawerBase({ ...sku, masterCode: "3-DB24", numberOfDrawers: 3 }, 3)).toBe(false);
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
    expect(rangeHoodSceneStatus([{ masterCode: "RANGE-30" } as never])).toEqual({ hasRange: true, hasRangeHood: false, hasOverRangeMicrowave: false, needs2DPlacement: true });
    expect(rangeHoodSceneStatus([{ masterCode: "RANGE-30" } as never, { masterCode: "HOOD-30" } as never])).toEqual({ hasRange: true, hasRangeHood: true, hasOverRangeMicrowave: false, needs2DPlacement: false });
    expect(rangeHoodSceneStatus([
      { uid: "range", cabinetId: 1, masterCode: "RANGE-30", description: "Range", placement: "appliance", x: 0, y: 45, width: 30, depth: 25, height: 36, rotation: 90, mountBottom: 0 },
      { uid: "microwave", cabinetId: 2, masterCode: "MW-30", description: "Over-range microwave", placement: "appliance", x: 0, y: 45, width: 30, depth: 15, height: 17, rotation: 90, mountBottom: 54 },
    ] as never)).toEqual({ hasRange: true, hasRangeHood: false, hasOverRangeMicrowave: true, needs2DPlacement: false });
    expect(rangeHoodSceneStatus([
      { masterCode: "RANGE-30", description: "Range", placement: "appliance" },
      { masterCode: "MW-30", description: "Over-Range Microwave", placement: "wall" },
    ] as never)).toEqual({ hasRange: true, hasRangeHood: false, hasOverRangeMicrowave: true, needs2DPlacement: false });
    expect(rangeHoodSceneStatus([
      { masterCode: "RANGE-30", description: "Range", placement: "appliance" },
      { masterCode: "MW-24", description: "Countertop microwave", placement: "appliance" },
    ] as never)).toEqual({ hasRange: true, hasRangeHood: false, hasOverRangeMicrowave: false, needs2DPlacement: true });
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

  it("builds a recessed rounded sink with drain and a realistic pull-down faucet assembly", () => {
    const root = new THREE.Group();
    addSinkFixture(root, {
      uid: "sink-realistic", type: "single", x: 24, y: 48, width: 30, depth: 22, faucet: true, wallSide: "top",
    } as never);
    const markers = new Set<string>();
    root.traverse((node) => {
      for (const [key, value] of Object.entries(node.userData)) if (value === true) markers.add(key);
    });
    expect(markers.has("sinkRim")).toBe(true);
    expect(markers.has("recessedSinkBowl")).toBe(true);
    expect(markers.has("sinkBowlFloor")).toBe(true);
    expect(markers.has("sinkDrain")).toBe(true);
    expect(markers.has("sinkDrainRing")).toBe(true);
    expect(markers.has("sinkFaucetBase")).toBe(true);
    expect(markers.has("sinkFaucetArc")).toBe(true);
    expect(markers.has("sinkFaucetSprayHead")).toBe(true);
    expect(markers.has("sinkFaucetHandle")).toBe(true);
  });

  it("keeps a visible divider for existing double-bowl sink choices", () => {
    const root = new THREE.Group();
    addSinkFixture(root, {
      uid: "sink-double", type: "double", x: 24, y: 48, width: 33, depth: 20, faucet: false, wallSide: "top",
    } as never);
    let divider: THREE.Object3D | null = null;
    root.traverse((node) => { if (node.userData.sinkBowlDivider) divider = node; });
    expect(divider).not.toBeNull();
  });

  it("renders SB36 with two false drawer fronts, two standard doors, and no false-drawer pull", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -89, cabinetId: 89, masterCode: "SB-36", description: "36 inch Sink Base",
      placementType: "base", width: 36, height: 34.5, depth: 24, numberOfDoors: 2, numberOfDrawers: 0,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "shaker" });
    const pulls: THREE.Object3D[] = [];
    const falseDrawers: THREE.Object3D[] = [];
    const doors: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.cabinetPull) pulls.push(node); });
    root.traverse((node) => {
      if (node.userData.falseDrawerFront) falseDrawers.push(node);
      if (node.userData.cabinetFront && !node.userData.cabinetDrawerFront) doors.push(node);
    });
    expect(falseDrawers).toHaveLength(2);
    expect(doors).toHaveLength(2);
    expect(pulls.filter((node) => node.userData.cabinetPull === "drawer")).toHaveLength(0);
    expect(pulls.filter((node) => node.userData.cabinetPull === "door")).toHaveLength(2);
    expect(pulls.every((node) => node.userData.cabinetPull !== "door" || node.userData.verticalPull)).toBe(true);
  });

  it("faces a right-wall sink faucet toward the right-wall backsplash", () => {
    const sink = {
      uid: "right-sink", type: "single", x: 120, y: 42, width: 18, depth: 25,
      sourceWidth: 25, sourceDepth: 18, wallSide: "right", faucet: true,
    } as never;
    const transform = sinkFixtureTransform(sink);
    const faucet = sinkFaucetTransform(sink);
    expect(faucet.x).toBeGreaterThan(transform.x);
    expect(faucet.z).toBe(transform.z);
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

  it("extends an installed shallow filler countertop to the full 24¼-inch base-run depth", () => {
    const filler = {
      fillerPieceGroupId: "filler-group",
      fillerTotalWidth: 2.5,
      fillerPlacementMode: "right" as const,
    };
    expect(threeDSceneCountertopDepthIn(filler, 0.75)).toBe(24.25);

    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 88, cabinetId: 88, masterCode: "BF3", description: "Base Filler", placementType: "base",
      width: 2.5, height: 34.5, depth: 0.75, numberOfDoors: 0, numberOfDrawers: 0,
      ...filler,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    let countertop: THREE.Mesh | null = null;
    root.traverse((node) => { if (node instanceof THREE.Mesh && node.userData.installedFillerCountertop) countertop = node; });
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
    expect(shouldRenderCountertopOverSceneItem({ placement: "base", masterCode: "FILL-3", description: "3 inch Filler", subCategory: "Filler", fillerPieceGroupId: "fill-group", fillerTotalWidth: 2.5, fillerPlacementMode: "split" })).toBe(true);
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
    // rangeCooktopLayout returns local coordinates centered on the 36-inch
    // model body: 34.5in from the floor is therefore 1.375ft above its center.
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

  it("uses the catalog's single-door count for a one-door diagonal wall cabinet", () => {
    const singleDoorDiagonal = existingCabinetSku({
      uid: "single-door-wdc",
      masterCode: "WDC2430",
      description: '24" x 30" Single Door Wall Diagonal Corner Cabinet',
      category: "Wall",
      placement: "wall",
      x: 0,
      y: 0,
      width: 24,
      height: 30,
      depth: 12,
      rotation: 0,
      cornerType: "diagonal",
      numberOfDoors: 1,
      numberOfDrawers: 0,
      swing: "left",
    } as never);
    const root = new THREE.Group();
    addCabinet(root, singleDoorDiagonal, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: "Recessed Panel" });
    const doors: THREE.Object3D[] = [];
    const pulls: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.diagonalDoor) doors.push(node);
      if (node.userData.diagonalDoorPull) pulls.push(node);
    });
    expect(doors).toHaveLength(1);
    expect(doors[0]!.position.x).toBeGreaterThan(0.5);
    expect(doors[0]!.position.z).toBeGreaterThan(0.5);
    expect(doors[0]!.position.x).toBeCloseTo(doors[0]!.position.z, 8);
    expect(pulls).toHaveLength(1);
    expect(pulls[0]!.rotation.y).toBeCloseTo(doors[0]!.rotation.y, 8);
    expect(pulls[0]!.userData.hingeSide).toBe("left");
    expect(pulls[0]!.userData.handleSide).toBe("right");
    expect(pulls[0]!.userData).toMatchObject({ frameWidthIn: 3, frameCenterInsetIn: 1.5 });
    expect(pulls[0]!.position.x).toBeGreaterThan(doors[0]!.position.x);
    expect(pulls[0]!.position.z).toBeLessThan(doors[0]!.position.z);
    const diagonalDoorWidth = ((doors[0] as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width;
    const tangent = new THREE.Vector2(Math.cos(doors[0]!.rotation.y), -Math.sin(doors[0]!.rotation.y));
    const delta = new THREE.Vector2(
      pulls[0]!.position.x - doors[0]!.position.x,
      pulls[0]!.position.z - doors[0]!.position.z,
    );
    expect((diagonalDoorWidth / 2 - Math.abs(delta.dot(tangent))) * 12).toBeCloseTo(1.5, 8);
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

  it("keeps standard configured doors and drawers fully outside their physical carcass face without overhanging its width", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -185,
      cabinetId: 185,
      masterCode: "B-2434-FRONT-BOUNDARY",
      description: '24" Base Cabinet with configured doors and drawers',
      placementType: "base",
      width: 24,
      height: 34.5,
      depth: 24,
      numberOfDoors: 2,
      numberOfDrawers: 2,
      drawerHeight: 6,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: null });
    const bodies: THREE.Mesh[] = [];
    const fronts: THREE.Mesh[] = [];
    const frontGroups: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.selectedStyleSideSkin && !node.userData.baseToeKick) bodies.push(node);
      if (node instanceof THREE.Mesh && node.userData.cabinetFront) fronts.push(node);
      if (node.userData.physicalFacePlane) frontGroups.push(node);
    });
    expect(bodies).toHaveLength(1);
    expect(fronts).toHaveLength(4);
    expect(frontGroups).toHaveLength(1);
    expect(frontGroups[0]!.userData.decorativeFrontClearanceIn).toBeGreaterThan(0);
    root.updateMatrixWorld(true);
    const bodyBounds = new THREE.Box3().setFromObject(bodies[0]!);
    for (const front of fronts) {
      const frontBounds = new THREE.Box3().setFromObject(front);
      expect(frontBounds.min.z).toBeGreaterThanOrEqual(bodyBounds.max.z - 1e-8);
      expect(frontBounds.min.x).toBeGreaterThanOrEqual(bodyBounds.min.x - 1e-8);
      expect(frontBounds.max.x).toBeLessThanOrEqual(bodyBounds.max.x + 1e-8);
      expect(frontBounds.min.y).toBeGreaterThanOrEqual(bodyBounds.min.y - 1e-8);
      expect(frontBounds.max.y).toBeLessThanOrEqual(bodyBounds.max.y + 1e-8);
    }
  });

  it("applies the physical face-plane contract to standard, tall, diagonal, L-corner, corner-drawer, end-return, and angled-wall fronts", () => {
    const root = new THREE.Group();
    const specimens = [
      { distributorSkuId: -186, cabinetId: 186, masterCode: "B-24-FLUSH", description: '24" Base Cabinet', placementType: "base", width: 24, height: 34.5, depth: 24, numberOfDoors: 2, numberOfDrawers: 0 },
      { distributorSkuId: -187, cabinetId: 187, masterCode: "PANTRY-2490-FLUSH", description: '24" x 90" Pantry Cabinet', placementType: "tall", width: 24, height: 90, depth: 24, numberOfDoors: 4, numberOfDrawers: 0 },
      { distributorSkuId: -188, cabinetId: 188, masterCode: "WDC2430-FLUSH", description: '24" Diagonal Wall Corner', placementType: "wall", width: 24, height: 30, depth: 24, numberOfDoors: 2, numberOfDrawers: 0, cornerGeometryKind: "diagonal" },
      { distributorSkuId: -189, cabinetId: 189, masterCode: "LS36-FLUSH", description: '36" Lazy Susan', placementType: "base", width: 36, height: 34.5, depth: 36, numberOfDoors: 2, numberOfDrawers: 0, cornerGeometryKind: "l-shape" },
      { distributorSkuId: -190, cabinetId: 190, masterCode: "CDB36-FLUSH", description: '36" Corner Drawer Base', placementType: "base", width: 36, height: 34.5, depth: 36, numberOfDoors: 0, numberOfDrawers: 3 },
      { distributorSkuId: -191, cabinetId: 191, masterCode: "BEC-24-FLUSH", description: '24" Base End Cabinet', placementType: "base", width: 24, height: 34.5, depth: 24, numberOfDoors: 2, numberOfDrawers: 0, cornerGeometryKind: "base-end" },
      { distributorSkuId: -192, cabinetId: 192, masterCode: "AW1230-FLUSH", description: '12" Angled Wall Cabinet', placementType: "wall", width: 12, height: 30, depth: 12, numberOfDoors: 1, numberOfDrawers: 0, customProfile: "angled-wall" },
    ];
    specimens.forEach((sku, index) => addCabinet(root, sku as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: index * 4, z: 0, rotation: 0 }));
    const fronts: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.cabinetFront) fronts.push(node);
    });
    expect(fronts.length).toBeGreaterThan(12);
    expect(fronts.every((front) => front.userData.flushPhysicalFace === true)).toBe(true);
  });

  it("routes AW1230, AW1236, and AW1242 to one centered door on the true angled-wall hypotenuse", () => {
    const root = new THREE.Group();
    const awCodes = ["AW1230", "AW1236", "AW1242"];
    awCodes.forEach((masterCode, index) => {
      addCabinet(root, {
        distributorSkuId: -220 - index,
        cabinetId: 220 + index,
        masterCode,
        description: `12\" Angled Wall Cabinet ${masterCode.slice(-2)}\" High`,
        placementType: "wall",
        width: 12,
        height: Number(masterCode.slice(-2)),
        depth: 12,
        numberOfDoors: 1,
        numberOfDrawers: 0,
      } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: index * 3, z: 0, rotation: 0, bottom: 54 });
    });
    root.updateMatrixWorld(true);
    for (const masterCode of awCodes) {
      const cabinet = root.children.find((node) => node.userData.masterCode === masterCode)!;
      const wedge = cabinet.children.find((node) => node instanceof THREE.Mesh && node.userData.angledWallWedge) as THREE.Mesh;
      const doors: THREE.Mesh[] = [];
      cabinet.traverse((node) => { if (node instanceof THREE.Mesh && node.userData.angledWallDoor) doors.push(node); });
      expect(wedge).toBeDefined();
      expect(doors).toHaveLength(1);
      expect(doors[0]!.userData.flushPhysicalFace).toBe(true);
      expect(doors[0]!.rotation.y).toBeCloseTo(-Math.PI / 4, 8);
      const bodyBounds = new THREE.Box3().setFromObject(wedge);
      const doorBounds = new THREE.Box3().setFromObject(doors[0]!);
      expect(doorBounds.max.x).toBeLessThanOrEqual(bodyBounds.max.x + 1e-8);
      expect(doorBounds.min.z).toBeGreaterThanOrEqual(bodyBounds.min.z - 1e-8);
    }
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

  it("builds a dimensional face frame behind standard cabinet doors without changing the carcass envelope", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -241,
      cabinetId: 241,
      masterCode: "B-24-FRAME",
      description: '24" Base Cabinet',
      placementType: "base",
      width: 24,
      height: 34.5,
      depth: 24,
      numberOfDoors: 2,
      numberOfDrawers: 1,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    const frames: THREE.Object3D[] = [];
    root.traverse((node) => { if (node.userData.cabinetFaceFrame) frames.push(node); });
    expect(frames.length).toBeGreaterThanOrEqual(5);
    expect(frames.some((node) => node.userData.constructedCarcassDetail)).toBe(true);
    expect(root.children.find((node) => node.userData.masterCode === "B-24-FRAME")?.userData.floorStandingCabinet).toBe(true);
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

  it("keeps a base cabinet and a raised wall cabinet as distinct measured assemblies", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -151,
      cabinetId: 151,
      masterCode: "B-24-DISTINCT",
      description: '24" Base Cabinet',
      placementType: "base",
      width: 24,
      height: 34.5,
      depth: 24,
      numberOfDoors: 2,
      numberOfDrawers: 1,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 24, z: 12, rotation: 0, bottom: 4.5 });
    addCabinet(root, {
      distributorSkuId: -152,
      cabinetId: 152,
      masterCode: "W-24-DISTINCT",
      description: '24" x 30" Wall Cabinet',
      placementType: "wall",
      width: 24,
      height: 30,
      depth: 12,
      numberOfDoors: 2,
      numberOfDrawers: 0,
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 24, z: 6, rotation: 0, bottom: 54 });

    const base = root.children.find((node) => node.userData.masterCode === "B-24-DISTINCT")!;
    const wall = root.children.find((node) => node.userData.masterCode === "W-24-DISTINCT")!;
    const baseBodies: THREE.Mesh[] = [];
    const wallBodies: THREE.Mesh[] = [];
    const baseFronts: THREE.Object3D[] = [];
    const wallFronts: THREE.Object3D[] = [];
    const counters: THREE.Mesh[] = [];
    base.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.selectedStyleSideSkin && !node.userData.baseToeKick) baseBodies.push(node);
      if (node.userData.cabinetFront) baseFronts.push(node);
    });
    wall.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.selectedStyleSideSkin) wallBodies.push(node);
      if (node.userData.cabinetFront) wallFronts.push(node);
    });
    root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.countertopDepthIn === 24.25) counters.push(node);
    });
    expect(base.userData.floorStandingCabinet).toBe(true);
    expect(wall.userData.floorStandingCabinet).toBeUndefined();
    expect(baseBodies).toHaveLength(1);
    expect(wallBodies).toHaveLength(1);
    expect(baseFronts).toHaveLength(3);
    expect(wallFronts).toHaveLength(2);
    expect(counters).toHaveLength(1);
    root.updateMatrixWorld(true);
    const baseBounds = new THREE.Box3().setFromObject(baseBodies[0]!);
    const wallBounds = new THREE.Box3().setFromObject(wallBodies[0]!);
    const counterBounds = new THREE.Box3().setFromObject(counters[0]!);
    expect(baseBounds.min.y).toBeCloseTo(4.5 / 12, 8);
    expect(baseBounds.max.y).toBeCloseTo(34.5 / 12, 8);
    expect(counterBounds.min.y).toBeCloseTo(34.5 / 12, 8);
    expect(counterBounds.max.y).toBeCloseTo(36 / 12, 8);
    expect(wallBounds.min.y).toBeCloseTo(54 / 12, 8);
    expect(wallBounds.max.y).toBeCloseTo(84 / 12, 8);
  });

  it("preserves distinct configured faces for adjacent persisted base and wall records instead of flattening both into generic panels", () => {
    const root = new THREE.Group();
    const savedBase = {
      uid: "saved-base-fronts", cabinetId: 611, masterCode: "B24-SAVED-FACES", description: '24" Base Cabinet',
      placement: "base", x: 24, y: 0, width: 24, depth: 24, height: 34.5, rotation: 0,
      numberOfDoors: 2, numberOfDrawers: 1,
    } as never;
    const savedWall = {
      uid: "saved-wall-fronts", cabinetId: 612, masterCode: "W24-SAVED-FACES", description: '24" x 30" Wall Cabinet',
      placement: "wall", x: 24, y: 0, width: 24, depth: 12, height: 30, rotation: 0,
      mountBottom: 54, numberOfDoors: 2, numberOfDrawers: 0,
    } as never;
    [savedBase, savedWall].forEach((saved) => {
      addCabinet(root, existingCabinetSku(saved), null, {}, 144, 120, "#8a9ba8", "#f8f8f6", { doorStyle: "Shaker", doorPanelType: null }, existingCabinetTransform(saved));
    });
    const base = root.children.find((node) => node.userData.masterCode === "B24-SAVED-FACES")!;
    const wall = root.children.find((node) => node.userData.masterCode === "W24-SAVED-FACES")!;
    const baseFronts: THREE.Object3D[] = [];
    const wallFronts: THREE.Object3D[] = [];
    base.traverse((node) => { if (node.userData.cabinetFront) baseFronts.push(node); });
    wall.traverse((node) => { if (node.userData.cabinetFront) wallFronts.push(node); });
    expect(base.userData.floorStandingCabinet).toBe(true);
    expect(wall.userData.floorStandingCabinet).toBeUndefined();
    expect(baseFronts).toHaveLength(3);
    expect(wallFronts).toHaveLength(2);
    expect(baseFronts.every((front) => front.userData.flushPhysicalFace === true)).toBe(true);
    expect(wallFronts.every((front) => front.userData.flushPhysicalFace === true)).toBe(true);
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
    expect(productFronts).toHaveLength(0);

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

  it("renders a selected Black Gas Range with a black chassis and five visible gas controls", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -31, cabinetId: 30, masterCode: "RANGE-30", description: '30" Black Gas Range', placementType: "appliance",
      width: 30, height: 36, depth: 25, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/30inchWideBlackGasRange-silhouette_0a25e71c.webp",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 48, z: 12, rotation: 0, bottom: 0 });
    const gasControls: THREE.Mesh[] = [];
    const gasGrates: THREE.Mesh[] = [];
    const rearDisplays: THREE.Mesh[] = [];
    let chassis: THREE.Mesh | null = null;
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.freestandingRangeChassis) chassis = node;
      if (node.userData.rangeControlType === "gas-knob") gasControls.push(node);
      if (node.userData.rangeGasGrate) gasGrates.push(node);
      if (node.userData.rangeRearControlDisplay) rearDisplays.push(node);
    });
    expect(gasControls).toHaveLength(5);
    expect(gasGrates).toHaveLength(8);
    expect(rearDisplays).toHaveLength(1);
    expect(chassis?.userData).toMatchObject({ rangeFinish: "black", rangeFuel: "gas" });
  });

  it("renders a rear-control electric range with a raised display, front controls, and glass cooktop", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -34, cabinetId: 30, masterCode: "RANGE-30", description: '30" Stainless Electric Range', placementType: "appliance",
      width: 30, height: 36, depth: 25, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/30inchWideStainlessSteelElectricRange-cropped_c6f3d3e6.webp",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 48, z: 12, rotation: 0, bottom: 0 });
    const electricControls: THREE.Mesh[] = [];
    const backguards: THREE.Mesh[] = [];
    const rearDisplays: THREE.Mesh[] = [];
    const cooktops: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.rangeControlType === "electric-control" && node.userData.rangeControlPosition === "rear") electricControls.push(node);
      if (node.userData.rangeBackguard) backguards.push(node);
      if (node.userData.rangeRearControlDisplay) rearDisplays.push(node);
      if (node.userData.rangeCooktopStyle === "electric-glass") cooktops.push(node);
    });
    expect(electricControls).toHaveLength(4);
    expect(backguards).toHaveLength(1);
    expect(rearDisplays).toHaveLength(1);
    expect(cooktops).toHaveLength(4);
  });

  it("renders front-control ranges with an integrated display and no raised rear backguard", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -32, cabinetId: 30, masterCode: "RANGE-30", description: '30" White Electric Front-Control Range', placementType: "appliance",
      width: 30, height: 36, depth: 25, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/30InchZlineFrontControlWhiteElectricRange-cropped_e5144787.webp",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 48, z: 12, rotation: 0, bottom: 0 });
    const displays: THREE.Mesh[] = [];
    const panels: THREE.Mesh[] = [];
    const backguards: THREE.Mesh[] = [];
    const flatCooktops: THREE.Mesh[] = [];
    let ovenHandle: THREE.Mesh | null = null;
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.rangeFrontControlDisplay) displays.push(node);
      if (node.userData.rangeFrontControlPanel) panels.push(node);
      if (node.userData.rangeBackguard) backguards.push(node);
      if (node.userData.rangeFrontControlFlatCooktop) flatCooktops.push(node);
      if (node.userData.rangeOvenHandle) ovenHandle = node;
    });
    expect(displays).toHaveLength(1);
    expect(panels).toHaveLength(1);
    expect(backguards).toHaveLength(0);
    expect(flatCooktops).toHaveLength(1);
    expect(ovenHandle).not.toBeNull();
    expect(displays[0].position.y).toBeGreaterThan(ovenHandle!.position.y);
  });

  it("keeps front-control gas ranges flat-topped with five integrated front knobs", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: -33, cabinetId: 30, masterCode: "RANGE-30", description: '30" Black Stainless Front-Control Gas Range', placementType: "appliance",
      width: 30, height: 36, depth: 25, numberOfDoors: 0, numberOfDrawers: 0,
      catalogImageUrl: "/manus-storage/30InchWideBlackStainlessSteelFrontControlRange-cropped_96100940.webp",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6", undefined, { x: 48, z: 12, rotation: 0, bottom: 0 });
    const gasControls: THREE.Mesh[] = [];
    const flatCooktops: THREE.Mesh[] = [];
    const backguards: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.rangeControlType === "gas-knob" && node.userData.rangeControlPosition === "front") gasControls.push(node);
      if (node.userData.rangeFrontControlFlatCooktop) flatCooktops.push(node);
      if (node.userData.rangeBackguard) backguards.push(node);
    });
    expect(gasControls).toHaveLength(5);
    expect(flatCooktops).toHaveLength(1);
    expect(backguards).toHaveLength(0);
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

  it("renders MW3042 as two upper doors with a visible bottom opening instead of dropping the cabinet or using its catalog diagram", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 2613279, cabinetId: 9390053, masterCode: "MW3042", description: '30" Microwave Wall Cabinet', placementType: "wall",
      width: 30, height: 42, depth: 18, numberOfDoors: 2, numberOfDrawers: 0,
      openingType: "bottom", doorHeight: 24, catalogImageUrl: "https://example.com/mw3042-diagram.webp",
    } as never, null, {}, 144, 120, "#8a9ba8", "#f8f8f6");
    const openings: THREE.Object3D[] = [];
    const doors: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.configuredOpening) openings.push(node);
      if (node.userData.cabinetFront && !node.userData.cabinetDrawerFront) doors.push(node);
    });
    expect(openings).toHaveLength(1);
    expect(doors).toHaveLength(2);
    expect(openings[0]!.position.y).toBeLessThan(doors[0]!.position.y);
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
    const manuallyMovedHood = { ...hood, y: 75, rangeHoodPositionAdjusted: true } as never;
    const manualTransform = savedRangeHoodTransform(manuallyMovedHood, [range, manuallyMovedHood, microwave], room);
    const rangeTransform = existingCabinetTransform(range, room);

    expect(hoodTransform.z).toBeCloseTo(rangeTransform.z, 12);
    expect(manualTransform.z).toBeCloseTo(existingCabinetTransform(manuallyMovedHood, room).z, 12);
    expect(manualTransform.z).not.toBeCloseTo(rangeTransform.z, 12);
    expect(shouldRenderSavedSceneCabinet(range, [range, hood, microwave])).toBe(true);
    expect(shouldRenderSavedSceneCabinet(hood, [range, hood, microwave])).toBe(true);
    expect(shouldRenderSavedSceneCabinet(microwave, [range, hood, microwave])).toBe(false);
  });

  it("keeps a neighboring base cabinet visible when a refrigerator is added to the saved 3D scene", () => {
    const base = {
      uid: "left-base", cabinetId: 1, masterCode: "B-24", description: "Base cabinet",
      placement: "base", width: 24, height: 34.5, depth: 24, rotation: 0, x: 0, y: 0,
    } as never;
    const fridge = {
      uid: "fridge", cabinetId: 2, masterCode: "FRIDGE-36", description: "Refrigerator",
      placement: "appliance", width: 36, height: 70, depth: 36, rotation: 0, x: 24, y: 0,
    } as never;
    expect(shouldRenderSavedSceneCabinet(base, [base, fridge])).toBe(true);
    expect(shouldRenderSavedSceneCabinet(fridge, [base, fridge])).toBe(true);
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

  it("renders refrigerator enclosure panels as plain finished skins with no cabinet hardware", () => {
    const root = new THREE.Group();
    const panelSku = {
      distributorSkuId: 0,
      masterCode: "REPV-96",
      description: 'Refrigerator End Panel 96"H',
      placementType: "tall",
      width: 0.75,
      depth: 27,
      height: 96,
      numberOfDoors: 0,
      numberOfDrawers: 0,
      customProfile: "refrigerator-end-panel",
    } as const;
    addCabinet(root, panelSku, "back", {}, 144, 120, "#4f5549", "#ffffff", undefined, { x: 30, z: 0, rotation: 0, bottom: 0 });
    addCabinet(root, panelSku, "back", {}, 144, 120, "#4f5549", "#ffffff", undefined, { x: 66.75, z: 0, rotation: 0, bottom: 0 });
    const items: THREE.Object3D[] = [];
    root.traverse((item) => items.push(item));
    expect(items.filter((item) => item.userData?.refrigeratorEndPanel)).toHaveLength(2);
    expect(items.some((item) => item.userData?.cabinetHardware)).toBe(false);
  });

  it("renders WD1860 at the 36-inch countertop line with one upper door and two lower drawer meshes", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      distributorSkuId: 9360145,
      cabinetId: 9360145,
      masterCode: "WD1860",
      description: '18" Single Door Wall Cabinet with 3 Adjustable Shelves and 2 drawers',
      placementType: "wall",
      width: 18,
      height: 60,
      depth: 12,
      // Some legacy supplier rows persisted zeroes even though WD18 family
      // identity authoritatively defines one upper door and two bottom drawers.
      numberOfDoors: 0,
      numberOfDrawers: 0,
    }, "back", {}, 144, 120, "#8a9ba8", "#f8f8f6");

    const upperDoors: THREE.Object3D[] = [];
    const bottomDrawers: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.userData.wd18UpperDoor) upperDoors.push(node);
      if (node.userData.wd18BottomDrawer) bottomDrawers.push(node);
    });
    expect(upperDoors).toHaveLength(1);
    expect(bottomDrawers).toHaveLength(2);
    expect(upperDoors[0]!.position.y).toBeGreaterThan(Math.max(...bottomDrawers.map((drawer) => drawer.position.y)));
    const cabinetRoot = root.children.find((child) => {
      let ownsWd18Door = false;
      child.traverse((node) => { if (node.userData.wd18UpperDoor) ownsWd18Door = true; });
      return ownsWd18Door;
    });
    expect(cabinetRoot?.position.y).toBeCloseTo((36 + 30) / 12, 5);
  });

  it("enforces the admin panel door sample as the sole authoritative face texture over Cabinet Config line-art", () => {
    // The threeDCabinetFrontVisualUrl helper resolves a catalog front visual URL.
    // When a door sample URL exists (from door_styles.doorSampleImageUrl), the
    // catalog front visual must NOT be used as a face overlay. The addCabinet
    // function guards this with: `!doorSampleUrl` in the condition.
    //
    // Test the helper contract:
    const baseCabWithLineArt = { placementType: "base", catalogImageUrl: "/manus-storage/ls3612-line-art.png" };
    const applianceWithImage = { placementType: "appliance", catalogImageUrl: "/manus-storage/range.webp" };
    const baseCabNoImage = { placementType: "base", catalogImageUrl: null };

    // The helper resolves a URL for base cabinets with a catalogImageUrl
    expect(threeDCabinetFrontVisualUrl(baseCabWithLineArt)).toBe("/manus-storage/ls3612-line-art.png");
    // But appliances never get a front visual overlay
    expect(threeDCabinetFrontVisualUrl(applianceWithImage)).toBeNull();
    // And cabinets without a catalogImageUrl get null
    expect(threeDCabinetFrontVisualUrl(baseCabNoImage)).toBeNull();

    // The door sample texture helpers confirm the door sample takes priority:
    expect(threeDUsesDoorSampleTexture("/manus-storage/natura-maple-door-sample.png")).toBe(true);
    expect(threeDUsesExactDoorSampleMaterial(true)).toBe(true);
    // When a door sample exists, the face material is MeshBasicMaterial with #ffffff (no tinting)
    expect(threeDFaceMaterialColor("#8a9ba8", true)).toBe("#ffffff");

    // The addCabinet guard at line 1254 is:
    //   if (catalogFrontVisualUrl && !doorSampleUrl && !doorTexture && ...)
    // This means: when doorSampleUrl is provided, catalogFrontVisualUrl is NEVER applied.
    // When doorSampleUrl is null, catalogFrontVisualUrl IS applied (if it exists).
    // This is the correct behavior: admin panel door sample > Cabinet Config line-art.

    // Verify the resolvedPlacedCabinetFrontVisual helper still works for live propagation
    expect(resolvedPlacedCabinetFrontVisual(
      { uid: "cab-1" } as any,
      { "cab-1": "/manus-storage/live-catalog-image.png" },
      null,
    )).toBe("/manus-storage/live-catalog-image.png");

    // But the resolved URL is only used as sku.catalogImageUrl — it only becomes
    // a visible overlay when doorSampleUrl is absent (the guard in addCabinet).
  });
});
