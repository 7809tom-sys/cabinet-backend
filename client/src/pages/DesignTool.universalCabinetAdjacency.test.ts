import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing source anchor: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing source anchor: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("universal exact-zero cabinet adjacency routing", () => {
  it.each([
    ["catalog and 3D add", "const addCabinet = useCallback", "const addManualFiller"],
    ["2D drag", "const moveCabinet = useCallback", "const swingSelected"],
	    ["rotation", "const rotateSelected", "const deleteSelected"],
	    ["keyboard and on-canvas nudge", "const nudgeSelected = useCallback", "const adjustMountHeight"],
	    ["width resizing", "const setCustomWidth = useCallback", "const adjustWidth"],
    ["depth resizing", "const setCustomDepth = useCallback", "const adjustDepth"],
  ])("normalizes %s before accepting the resulting cabinet", (_label, start, end) => {
	    expect(sourceBetween(start, end)).toContain("snapCabinetSeamOverlap");
	  });

	  it("keeps an explicit 3D D-pad increment exact while rejecting any resulting positive overlap", () => {
	    const threeDPath = sourceBetween("const moveCabinetFrom3D = useCallback", "const resetMountHeight");
	    expect(threeDPath).not.toContain("snapCabinetSeamOverlap(");
	    expect(threeDPath).toContain("shouldBlockPlacementCollision(candidate, peers, customPlacementMode, room)");
	    expect(threeDPath).toContain("return commit(candidate, delta)");
	  });

  it("does not bypass exact-zero seam normalization when custom placement is active", () => {
    const dragPath = sourceBetween("const moveCabinet = useCallback", "const swingSelected");
    const nudgePath = sourceBetween("const nudgeSelected = useCallback", "const adjustMountHeight");
    const threeDPath = sourceBetween("const moveCabinetFrom3D = useCallback", "const resetMountHeight");
    expect(dragPath).not.toContain("customPlacementMode\n\t\t        ?");
    expect(nudgePath).not.toContain("!customPlacementMode ? snapCabinetSeamOverlap");
    expect(threeDPath).not.toContain("customPlacementMode ? movedCandidate : snapCabinetSeamOverlap");
  });

  it("preserves existing cabinets while configuring a refrigerator and its panels", () => {
    const refrigeratorPath = sourceBetween("const applyFridgeSurround = useCallback", "const [builtinRunArmed");
    expect(refrigeratorPath).toContain("hasCollision(resizedFridge, peers)");
    expect(refrigeratorPath).toContain("fitRefrigeratorEnclosurePlacements(configuredPlaced, toPlace, fridge.uid, room)");
    expect(refrigeratorPath).toContain("appendRefrigeratorEnclosurePlacements(fittedPreview.existing, fittedPreview.additions, fridge.uid, room)");
    expect(refrigeratorPath).toContain("normalizeRefrigeratorBayUppers(previewResult.placed, room)");
    expect(refrigeratorPath).toContain("placedRef.current = committedPreview");
    expect(refrigeratorPath).toContain("retain both end panels and preserve the neighboring cabinet");
    expect(refrigeratorPath).toContain("formatEighthInches(overlapIn)");
    expect(refrigeratorPath).toContain("The existing cabinet was preserved in its exact position.");
    expect(refrigeratorPath).not.toContain("setPlaced((previous) => previous.map((candidate)");
    expect(refrigeratorPath).not.toContain("refrigeratorEndPanelConflict(piece, placed, fridge.uid)");
  });

  it("uses authoritative wall-SKU dimensions for normal add, direct 3D drop, and Smart Gap preview paths", () => {
    expect(sourceBetween("const addCabinet = useCallback", "const addManualFiller")).toContain("resolvedDesignCabinetDimensions(c)");
    expect(sourceBetween("const addFromInteractive3d = useCallback", "const addRangeHoodFromInteractive3d")).toContain("resolvedDesignCabinetDimensions(cabinet)");
    expect(sourceBetween("const previewSmartGap = useCallback", "const threeDPlaced")).toContain("wallCabinetSkuDimensions(candidate.masterCode)");
  });

  it("keeps one-eighth-inch measurement guidance available for selected base and wall cabinets on responsive sheets", () => {
    const measurementState = sourceBetween("const selectedCabWallFit = useMemo", "const selectedCabWallFitText");
    expect(measurementState).toContain('selectedCab.placement === "base"');
    expect(measurementState).toContain('selectedCab.placement === "wall"');
    expect(source).toContain("!selectedCabWallFit?.seated");
    expect(source).toContain('data-testid="mobile-cabinet-fit-guide"');
  });

  it("routes every normal base, wall, tall, and appliance selection through the active wall's next-in-line sequence", () => {
    const addPath = sourceBetween("const addCabinet = useCallback", "const addManualFiller");
    expect(addPath).toContain("paletteActiveWallPlacement(");
    expect(addPath).toContain("refrigeratorAdjacentOpeningPlacement(activeWall, room, prev, openings, width, depth, accPlacement)");
    expect(addPath).toContain("&& !targetCabinetUid");
    expect(addPath).not.toContain("refrigeratorAdjacentSpot = !requestedIslandFace\n\t        && !selectedPlacementTarget");
    expect(addPath).toContain("} else if (refrigeratorAdjacentSpot) {");
    expect(addPath).toContain("selectedSinkBaseWallPlacement(selectedLowerTarget, room, width, depth, height, prev, openings)");
    expect(addPath).toContain("explicitSelectedSinkTarget = true");
    expect(addPath).toContain('accPlacement === "base"');
    expect(addPath).toContain('accPlacement === "wall"');
    expect(addPath).toContain('accPlacement === "tall"');
    expect(addPath).toContain('accPlacement === "appliance"');
    expect(addPath).toContain("preserveResolvedPlacement = true");
    expect(addPath).toContain("ordinaryWallMountBottom({ ...c, placement: accPlacement, height })");
    expect(addPath).toContain("finalCab = snapCabinetSeamOverlap(finalCab, normalizedPrevious)");
    expect(addPath).not.toContain("resolveWallCabinetTargetPlacement");
    expect(addPath).not.toContain("overSinkWindowStart");
    const threeDAddPath = sourceBetween("const addFromInteractive3d = useCallback", "const addRangeHoodFromInteractive3d");
    expect(threeDAddPath).toContain("if (!dropTarget) { addCabinet(cabinet");
    expect(source.match(/onAddCatalogItem=\{addFromInteractive3d\}/g)).toHaveLength(2);
  });

  it("uses the same magnetic measured-wall seam resolver for drag, snap-to-wall, and collision recovery", () => {
    const addPath = sourceBetween("const addCabinet = useCallback", "const addManualFiller");
    const dragPath = sourceBetween("const moveCabinet = useCallback", "const swingSelected");
    const snapToWallPath = sourceBetween("const snapSelectedToWall = useCallback", "const deleteCabinet");
    expect(addPath).toContain("magneticAvailableWallStart(");
    expect(dragPath).toContain("magneticAvailableWallStart(segments, desiredStart, cabinet.width)");
    expect(snapToWallPath).toContain("magneticAvailableWallStart(segments, requestedAlong, selected.width)");
  });

  it("uses the physical 45-degree measured-wall clearance resolver for catalog drops and cabinet moves", () => {
    const threeDAddPath = sourceBetween("const addFromInteractive3d = useCallback", "const addRangeHoodFromInteractive3d");
    const planDropPath = sourceBetween("const handleDropNew = useCallback", "const placePeninsulaFitRecommendation");
    const dragPath = sourceBetween("const moveCabinet = useCallback", "const swingSelected");
    const snapToWallPath = sourceBetween("const snapSelectedToWall = useCallback", "const deleteCabinet");
    expect(threeDAddPath).toContain("firstCollisionFreeCustomWallPlacement(");
    expect(planDropPath).toContain("firstCollisionFreeCustomWallPlacement(");
    expect(dragPath).toContain("firstCollisionFreeCustomWallPlacement(");
    expect(snapToWallPath).toContain("firstCollisionFreeCustomWallPlacement(");
    expect(snapToWallPath).toContain("containingSegment.start + containingSegment.length - selected.width");
    expect(snapToWallPath).toContain("wallOffset: spot.wallOffset ?? along");
    expect(threeDAddPath).toContain("{ wallId: dropWall, wallOffset: spot.wallOffset ?? along");
    expect(planDropPath).toContain("wallOffset: spot.wallOffset ?? measured.snapStart");
  });

  it("keeps AW angled-wall transitions on measured wall-run routing instead of the protected room-corner placer", () => {
    const addPath = sourceBetween("const addCabinet = useCallback", "const addManualFiller");
    const planDropPath = sourceBetween("const handleDropNew = useCallback", "const placePeninsulaFitRecommendation");
    expect(addPath).toContain("requiresRoomCornerPlacement({");
    expect(planDropPath).toContain("requiresRoomCornerPlacement({");
    expect(source).toContain("isProtectedCornerCabinet(cabinet.masterCode, cabinet.description)");
    expect(source).not.toContain("!isBlindCorner(c.masterCode, c.description)\n\t          && isCornerCabinet(c.masterCode, c.description)");
  });
});
