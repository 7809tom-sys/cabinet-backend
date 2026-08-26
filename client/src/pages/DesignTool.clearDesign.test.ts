import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

function clearDesignBlock() {
  const start = source.indexOf("const clearCurrentDesign = usePersistFn(() => {");
  const end = source.indexOf("// Sync sheet open state with selection on mobile", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("DesignTool authoritative Clear Design transaction", () => {
  it("clears the plan, all temporary 3D sources, selections, fixtures, warnings, history, and draft persistence together", () => {
    const block = clearDesignBlock();
    for (const required of [
      "smartGapPreviewSessionRef.current = null",
      "undoRedoRef.current.clear()",
      "lastPushedRef.current = emptyPlaced",
      "clearDraft()",
      "setPlaced(emptyPlaced)",
      "setSmartGapPreview([])",
      "setSmartGapPreviewPosition(null)",
      "setPlacementWarning(null)",
      "setFailedWallFit(null)",
      "setOpenings([])",
      "setSinks([])",
      "setFurniture([])",
      "setPonyWalls([])",
      "setAnnotations([])",
      "setSelectedUid(null)",
      "setSelectedOpeningUid(null)",
      "setSelectedSinkUid(null)",
      "setSelectedFurnUid(null)",
      "setSelectedPonyWallUid(null)",
      "setSelectedAnnotationUid(null)",
      "setInteractive3dPresentation(null)",
      "setLoadedBundlePriceLock(null)",
      "setActiveSavedDesignId(null)",
    ]) {
      expect(block).toContain(required);
    }
  });

  it("removes saved-design and bundle route ownership so refresh cannot repopulate the cleared canvas", () => {
    const block = clearDesignBlock();
    expect(block).toContain('url.searchParams.delete("load")');
    expect(block).toContain('url.searchParams.delete("bundleId")');
    expect(block).toContain('window.history.replaceState({}, "", url.toString())');
  });

  it("routes both desktop and phone/tablet clear controls through the same transaction", () => {
    expect(source.match(/onClick=\{clearCurrentDesign\}/g)?.length).toBe(2);
  });
});
