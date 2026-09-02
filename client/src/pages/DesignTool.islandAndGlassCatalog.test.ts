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

	  it("exposes real PG wall cabinets and base-plus-PGWDC corner glass choices without inventing combined SKUs", () => {
    expect(source).toContain('label: "Glass Door Wall Cabinets"');
    expect(source).toContain('label: "Glass Door Corner Wall Cabinets"');
	    expect(source).toContain("buildGlassCornerCatalogChoices(");
	    expect(source).toContain("c.displayMasterCode ?? c.masterCode");
	    expect(source).toContain("sourceCabinetId: Number(item.id)");
	  });
});
