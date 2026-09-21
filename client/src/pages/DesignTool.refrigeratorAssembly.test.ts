import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

function sourceBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function refrigeratorTransaction() {
  const start = source.indexOf("const applyFridgeSurround = useCallback");
  const end = source.indexOf('// ── One-click "Built-in Refrigerator + Pantry End" preset', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Design Tool refrigerator assembly transactions", () => {
  it("persists the requested panel mode plus bridge and left/right member roles", () => {
    const transaction = refrigeratorTransaction();
    expect(transaction).toContain("refrigeratorPanelMode: opts.panels");
    expect(transaction).toContain('refrigeratorAssemblyRole: "bridge"');
    expect(transaction).toContain('refrigeratorAssemblyRole: leftEdge ? "left-panel" : "right-panel"');
    expect(transaction).toContain("refrigeratorAssemblyId: fridge.uid");
  });

  it("removes stale enclosure members and commits one normalized authoritative assembly", () => {
    const transaction = refrigeratorTransaction();
    expect(transaction).toContain("const existingAssemblyUids = new Set(");
    expect(transaction).toContain(".filter((item) => !existingAssemblyUids.has(item.uid) && item.uid !== refrigeratorCabinetToReplace?.uid)");
    expect(transaction).toContain("const committedPreview = normalizeRefrigeratorBayUppers(previewResult.placed, room)");
    expect(transaction).toContain("placedRef.current = committedPreview");
    expect(transaction).toContain("setPlaced(() => committedPreview)");
  });

  it("uses the refrigerator's measured wall offset for an over-fridge cabinet and both panels", () => {
    const transaction = refrigeratorTransaction();
    expect(transaction).toContain("const fridgeStart = wallRunOffset(configuredFridge, side, room)");
    expect(transaction).toContain("const fw = wallRunSpan(configuredFridge, side, room)");
    expect(transaction).toContain("const fridgeCenterAlong = fridgeStart + fw / 2");
    expect(transaction).toContain("along = leftEdge ? fridgeStart - pThick : fridgeStart + fw");
  });

  it("keeps a fractional refrigerator end-panel thickness fractional in the final enclosure", () => {
    const transaction = refrigeratorTransaction();
    expect(transaction).toContain("const pThick = refrigeratorEndPanelThickness(panelRow.width, inferredDepth)");
    expect(transaction).not.toContain("const rawPanelW = parseFloat(String(panelRow.width ?? \"\"))");
  });

  it("does not turn a repeated FRIDGE-36 click into a second appliance", () => {
    const placement = sourceBetween("const addCabinet = useCallback", "const placeOnRecommendedWall");
    expect(placement).toContain("const requestedRefrigerator = isRefrigerator");
    expect(placement).toContain("const duplicate = prev.find((item) => isRefrigerator(item)");
    expect(placement).toContain("refrigerator already placed. Select the existing refrigerator");
    expect(placement).toContain("setSelectedUid(duplicate.uid)");
  });

  it("routes wall-drag, keyboard nudge, D-pad, and exact depth moves through the shared assembly commit", () => {
    expect(source.match(/commitRefrigeratorAssemblyCandidate\(/g)?.length).toBeGreaterThanOrEqual(3);
    const moveStart = source.indexOf("const moveCabinet = useCallback");
    const moveEnd = source.indexOf("const swingSelected", moveStart);
    const nudgeStart = source.indexOf("const nudgeSelected = useCallback");
    const nudgeEnd = source.indexOf("// Raise/lower the selected WALL cabinet", nudgeStart);
    const dpadStart = source.indexOf("const moveCabinetFrom3D = useCallback");
    const dpadEnd = source.indexOf("// Clear the override", dpadStart);
    expect(source.slice(moveStart, moveEnd)).toContain("commitRefrigeratorAssemblyCandidate(prev, uid, movedCabinet, room)");
    expect(source.slice(nudgeStart, nudgeEnd)).toContain("commitRefrigeratorAssemblyCandidate(prev, selectedUid, candidate, room)");
    expect(source.slice(dpadStart, dpadEnd)).toContain("commitRefrigeratorAssemblyCandidate(prev, uid, candidate, room)");
  });
});
