import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("DesignTool island scene and glass catalog wiring", () => {
	it("routes every normal and 3D catalog placement to the selected island face when Island mode is active", () => {
		expect(source).toContain("targetIslandFace ?? (islandPlacementModeRef.current ? islandFaceRef.current : null)");
		expect(source).not.toContain("islandPlacementMode && x == null && y == null");
		  expect(source).toContain("if (island && islandPlacementModeRef.current)");
		  expect(source).toContain("addCabinet(cabinet, undefined, undefined, forceAccessory, 0, false, undefined, islandFaceRef.current)");
		  expect(source).toContain("nextIslandFacePlacement(newCab, island, requestedIslandFace, prev)");
		  expect(source).toContain("const islandPlacementModeRef = useRef(false);");
		  expect(source).toContain('setPlacementTarget("island")');
		  expect(source).toContain("islandFaceRef.current = islandFace;");
		  expect(source).toContain("islandPlacementModeRef.current = islandPlacementMode;");
		  expect(source).toContain("const prev = placedRef.current;");
		  expect(source).toContain("const islandPlacementModeRef = useRef(false);");
	    expect(source).toContain("setCountertop(true)");
	    expect(source).toContain('data-testid="island-placement-active-indicator"');
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

	it("offers an empty opposite island face instead of moving an occupied run when a selected face cannot fit a cabinet", () => {
	  expect(source).toContain("alternateIslandFaceRecommendation");
	  expect(source).toContain("Clear opposite island face found");
	  expect(source).toContain("const oppositeCandidate = nextIslandFacePlacement(newCab, island, oppositeFace, prev)");
	  expect(source).toContain("setAlternateIslandFaceRecommendation({");
	  expect(source).toContain('setPlacementTarget("island", recommendation.face)');
	  expect(source).toContain("The existing island run will remain unchanged.");
	});

	it("opens Island setup with an accurate depth requirement before placing a shallow opposing wall cabinet", () => {
	  expect(source).toContain("const minimumOpposingIslandDepth = STD.BASE_DEPTH + Math.max(0, Number(newCab.depth) || STD.WALL_DEPTH)");
	  expect(source).toContain("isShallowIslandWallCabinet && island.depth + COLLISION_EPSILON_IN < minimumOpposingIslandDepth");
	  expect(source).toContain("setIslandAttributesOpen(true)");
	  expect(source).toContain("48 inches if you want a 12-inch seating overhang");
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
