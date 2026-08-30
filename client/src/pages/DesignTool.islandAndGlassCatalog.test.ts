import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("DesignTool island scene and glass catalog wiring", () => {
  it("routes normal catalog placement to the selected island face and enables the required automatic slab", () => {
	  expect(source).toContain("targetIslandFace ?? (islandPlacementMode ? islandFace : null)");
	  expect(source).not.toContain("islandPlacementMode && x == null && y == null");
    expect(source).toContain("nextIslandFacePlacement(newCab, island, requestedIslandFace, prev)");
    expect(source).toContain("setCountertop(true)");
    expect(source).toContain('data-testid="island-placement-active-indicator"');
    expect(source).toContain("Place on walls");
  });

	it("synchronizes the active placement face when an existing island cabinet is selected", () => {
	  expect(source).toContain("inferredIslandFace(cabinet, island)");
	  expect(source).toContain("setIslandPlacementMode(true)");
	  expect(source).toContain("setIsland((current) => current ? { ...current, activeFace: face } : current)");
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
    expect(source).toContain("const addOnCode = `PGWDC${match[1]}`");
    expect(source).toContain("glassDoorCatalogProduct(addOnCode)");
    expect(source).toContain("sourceCabinetId: Number(item.id)");
  });
});
