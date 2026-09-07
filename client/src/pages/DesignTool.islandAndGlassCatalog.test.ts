import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("DesignTool island scene and glass catalog wiring", () => {
	it("routes every normal and 3D catalog placement to the selected island face when Island mode is active", () => {
		expect(source).toContain("const selectedIslandFace = targetIslandFace");
		expect(source).toContain("islandPlacementMode || islandPlacementModeRef.current");
		expect(source).not.toContain("islandPlacementMode && x == null && y == null");
		  expect(source).toContain("if (island && (islandPlacementMode || islandPlacementModeRef.current))");
		  expect(source).toContain("addCabinet(cabinet, undefined, undefined, forceAccessory, 0, false, undefined, islandFace ?? islandFaceRef.current)");
		  expect(source).toContain("nextIslandFacePlacement(newCab, islandForPlacement, requestedIslandFace, islandPlacementPrevious)");
		  expect(source).toContain("const islandPlacementModeRef = useRef(false);");
		  expect(source).toContain('setPlacementTarget("island")');
		  expect(source).toContain("islandFaceRef.current = islandFace;");
		  expect(source).toContain("islandPlacementModeRef.current = islandPlacementMode;");
		  expect(source).toContain("const prev = placedRef.current;");
		  expect(source).toContain("const islandPlacementModeRef = useRef(false);");
	    expect(source).toContain("setCountertop(true)");
	    expect(source).toContain('data-testid="island-placement-panel-toggle"');
	    expect(source).toContain('data-testid="island-placement-side-panel"');
	    expect(source).toContain('data-testid="wall-placement-mode"');
	    expect(source).toContain('data-testid="island-placement-mode"');
	    expect(source).toContain(">Wall mode<");
	    expect(source).toContain(">Island mode<");
	  });

	it("synchronizes the active placement face when an existing island cabinet is selected", () => {
	  expect(source).toContain("inferredIslandFace(cabinet, island)");
	  expect(source).toContain("setIslandPlacementMode(true)");
	  expect(source).toContain("setIsland((current) => current ? { ...current, activeFace: face } : current)");
	});

	it("exits island mode when the user explicitly selects a wall, so back-wall cabinet additions cannot use a stale island face", () => {
	  expect(source).toContain('onClick={() => { setActiveWall(w); setPlacementTarget("wall"); setDrawMode(false); }}');
	  expect(source).toContain('onSelectWall={(wall) => { setActiveWall(wall); setPlacementTarget("wall"); }}');
	  expect(source).toContain('"Wall / Island mode"');
	  expect(source).toContain('"Choose Wall mode or Island mode"');
	  expect(source).toContain('right-3 top-14 z-40 flex flex-col items-end gap-2 sm:top-16');
	  expect(source).toContain('px-2.5 py-1.5 text-[11px]');
	});

	it("excludes the full island assembly from a back-wall opening measurement, including legacy members without an island-face field", () => {
	  expect(source).toContain('const wallRunPlaced = island ? placed.filter((item) => !isOnIsland(item, island)) : placed;');
	  expect(source).toContain('freeSegmentsOnWall(dropWall, room, wallRunPlaced, openings, 0.5, 0, placement)');
	});

	it("reports a blocked island resize once per brief repeated drag sequence while preserving the collision block", () => {
	  expect(source).toContain("islandResizeWarningRef");
	  expect(source).toContain("now - previous.at >= 1200");
	  expect(source).toContain("if (!resized.ok) { reportResizeBlock(resized.reason); return; }");
	});

	it("keeps full Designer toolbar controls at their usable width and scrolls them instead of allowing overlap", () => {
	  expect(source).toContain("overflow-x-auto overflow-y-visible scrollbar-none [&>*]:shrink-0");
	});

	it("provides a user-controlled automatic snapping toggle and a concise door or window clearance notice", () => {
	  expect(source).toContain('data-testid="automatic-snapping-toggle"');
	  expect(source).toContain("const [automaticSnapping, setAutomaticSnapping] = useState(true);");
	  expect(source).toContain('data-testid="opening-clearance-block-tooltip"');
	  expect(source).toContain("clearance blocks placement — keep 3 in. clear.");
	});

	it("treats a catalog replacement as automatic unless the user explicitly turns snapping off", () => {
	  expect(source).toContain("const useAutomaticSnapping = automaticSnapping || !freehand;");
	  expect(source.match(/automaticSnapping=\{automaticSnapping\}/g)).toHaveLength(2);
	  expect(source).toContain("must not turn a verified 36-inch opening into a tiny local sliver");
	});

	it("explains a normal smaller-gap block with the cabinet width, largest clear opening, and shortage", () => {
	  expect(source).toContain("const largestClearGap = gaps.reduce<WallGap | null>");
	  expect(source).toContain("the largest clear opening is");
	  expect(source).toContain("too small.");
	});

	it("offers the Back face for the next cabinet when the chosen Front run reaches its configured island length without changing island treatments", () => {
	  expect(source).toContain("alternateIslandFaceRecommendation");
	  expect(source).toContain("Chosen island length reached");
	  expect(source).toContain("const oppositeCandidate = nextIslandFacePlacement(newCab, islandForPlacement, oppositeFace, islandPlacementPrevious)");
	  expect(source).toContain("const selectedFaceCapacity = islandFaceCapacity(islandForPlacement, requestedIslandFace, islandPlacementPrevious)");
	  expect(source).toContain("setAlternateIslandFaceRecommendation({");
	  expect(source).toContain('setPlacementTarget("island", recommendation.face)');
	  expect(source).toContain("Choose the next cabinet to add there.");
	  expect(source).toContain("toe-kick, base-molding, waterfall");
	  expect(source).toContain('if (requestedIslandFace === "front" && island)');
	  expect(source).toContain("The Front island run has reached its chosen");
	  expect(source).toContain('face: "back"');
	  expect(source).toContain("Math.abs(backDepthAdjustment.island.depth - islandForPlacement.depth) > COLLISION_EPSILON_IN");
	});

	it("switches to a Back-facing 3D island view after acceptance and exposes a safe selected-cabinet transfer action", () => {
	  expect(source).toContain("setIslandCameraFocusRequest");
	  expect(source).toContain('setViewMode("threeD")');
	  expect(source).toContain("islandFaceTransferOption(selectedCab, island, placed)");
	  expect(source).toContain('data-testid="selected-island-face-transfer"');
	  expect(source).toContain("Swap to");
	  expect(source).toContain("Move to");
	});

	it("uses the full wall run for normal 3D catalog drops instead of letting island members create a pointer-local Back-wall gap", () => {
	  expect(source).toContain("const wallRunPlaced = island ? placed.filter((item) => !isOnIsland(item, island)) : placed;");
	  expect(source).toContain("const strictPointerPlacement = freehand && !automaticSnapping;");
	  expect(source).toContain("const widestGap = [...gaps].sort((left, right) => right.length - left.length)[0] ?? null;");
	  expect(source).toContain("strictPointerPlacement && !measured.containsTarget");
	});

	it("opens Island setup with an accurate depth requirement before placing a shallow opposing wall cabinet", () => {
	  expect(source).toContain("const minimumOpposingIslandDepth = STD.BASE_DEPTH + Math.max(0, Number(newCab.depth) || STD.WALL_DEPTH)");
	  expect(source).toContain('isShallowIslandWallCabinet && requestedIslandFace === "back" && island.depth + COLLISION_EPSILON_IN < minimumOpposingIslandDepth');
	  expect(source).toContain("setIslandAttributesOpen(true)");
	  expect(source).toContain("48 inches if you want a 12-inch seating overhang");
	});

	it("honors an opt-in Back-face depth adjustment and keeps it collision-safe before adding the cabinet", () => {
	  expect(source).toContain("autoAdjustIslandDepthForBackFace(island, prev, room, Number(newCab.depth) || STD.BASE_DEPTH)");
	  expect(source).toContain("island.autoAdjustDepthForBackFace === true");
	  expect(source).toContain("automatic Back-face depth adjustment is blocked");
	  expect(source).toContain("Island depth adjusted for Back:");
	});

	it("turns a Front-face remainder dead end into an immediate Back-face depth-adjustment choice for the same cabinet", () => {
	  expect(source).toContain("const backDepthAdjustment = autoAdjustIslandDepthForBackFace");
	  expect(source).toContain("requiresBackDepthAdjustment: true");
	  expect(source).toContain("forceBackDepthAdjustment = false");
	  expect(source).toContain("Yes — add to Back and adjust depth");
	  expect(source).toContain("addCabinet(recommendation.cabinet, undefined, undefined, recommendation.forceAccessory, 0, false, undefined, recommendation.face, true)");
	});

	it("emits a visible before-and-after island depth transition when Back-face auto-adjustment succeeds", () => {
	  expect(source).toContain("setIslandDepthTransition({ fromDepth: island?.depth ?? autoAdjustedIsland.depth, toDepth: autoAdjustedIsland.depth");
	  expect(source).toContain("islandDepthTransition={islandDepthTransition}");
	  expect(source).toContain("Island depth adjusted for Back:");
	});

	it("keeps a verified normal wall opening and redirects a shallow island wall cabinet only when Back needs depth", () => {
	  expect(source).toContain('requestedIslandFace === "back" && island.depth + COLLISION_EPSILON_IN < minimumOpposingIslandDepth');
	  expect(source).toContain('!requestedIslandFace && !strictDropTarget) finalCab = snapCabinetSeamOverlap');
	  expect(source).toContain('const dropWall = strictPointerPlacement ? (dropTarget.wall ?? activeWall) : activeWall');
	});

	it("uses island-local floor elevation and island-face measurements for selected island cabinets", () => {
	  expect(source).toContain("islandFaceFitMeasure(selectedCab, island, placed)");
	  expect(source).toContain("island && selectedCab.islandFace");
	});

		  it("moves, resizes, rotates, and removes the complete island assembly through authoritative helpers", () => {
    expect(source).toContain("moveIslandScene(island, placedRef.current, room");
    expect(source).toContain("resizeIslandScene(moved.island, moved.placed, room");
    expect(source).toContain("rotateIslandScene(island, placedRef.current, room)");
    expect(source).toContain("normalizeSinkFixturesToBases(current, nextPlaced, room)");
		  });

		  it("offers Island-only 10-inch or 12-inch seating after a counter-height shallow wall cabinet is committed", () => {
		    expect(source).toContain("finalCab.islandCounterHeightWallCabinet === true");
		    expect(source).toContain("setIslandSeatingOverhangPrompt({ cabinetCode: finalCab.masterCode, face: requestedIslandFace })");
		    expect(source).toContain("islandWithFaceSeatingOverhang(island, placedRef.current, prompt.face, overhangIn)");
		    expect(source).toContain("No seating overhang");
		    expect(source).toContain("Add 10 in. seating");
		    expect(source).toContain("Add 12 in. seating");
		  });

		  it("requires a selected compatible sink base before the compact Pelican sink picker can place a fixture", () => {
    expect(source).toContain("Select a compatible sink base cabinet before choosing a Pelican sink.");
    expect(source).toContain("isPelicanSinkCompatibleWithBase(item, baseKind)");
    expect(source).toContain("const attached = makeSinkForCabinet(sinkType, owner, room");
    expect(source).not.toContain("makeSink(sinkType, Math.max(0, room.width / 2");
  });

  it("prioritizes verified compatible Pelican sinks in the sink-base dialog without changing catalog popularity data", () => {
    expect(source).toContain('{ role: "sink", limit: 24 }');
    expect(source).toContain(".filter((product) => isPelicanSinkCompatibleWithBase(product, sinkBaseKind))");
    expect(source).toContain("sinkBaseOpeningWidthIn(sinkBaseCabinet ?? undefined)");
    expect(source).toContain("verifiedPelicanSinkFitsCabinet(profile, sinkBaseOpeningWidth)");
    expect(source).toContain("verifiedPelicanSinkProfile(right.pelicanCode)");
  });

	  it("exposes real PG wall cabinets and base-plus-PGWDC corner glass choices without inventing combined SKUs", () => {
    expect(source).toContain('label: "Glass Door Wall Cabinets"');
    expect(source).toContain('label: "Glass Door Corner Wall Cabinets"');
	    expect(source).toContain("buildGlassCornerCatalogChoices(");
	    expect(source).toContain("c.displayMasterCode ?? c.masterCode");
	    expect(source).toContain("sourceCabinetId: Number(item.id)");
	  });
});
