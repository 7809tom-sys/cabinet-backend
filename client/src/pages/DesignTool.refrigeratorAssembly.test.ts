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

	  it("uses shared refrigerator bay metrics for an over-fridge cabinet and both panels", () => {
	    const transaction = refrigeratorTransaction();
	    expect(transaction).toContain("const bay = refrigeratorBayRunMetrics(configuredFridge, room)");
	    expect(transaction).toContain("const fridgeStart = bay.refrigeratorStart");
	    expect(transaction).toContain("const fw = bay.refrigeratorWidth");
	    expect(transaction).toContain("const fridgeCenterAlong = fridgeStart + fw / 2");
	    expect(transaction).toContain("along = leftEdge ? bay.openingStart - pThick : bay.openingEnd");
	  });

  it("uses the true refrigerator run span and preserves a start-side panel for the enclosure fitter", () => {
    const transaction = refrigeratorTransaction();
	    expect(transaction).toContain("const sourceDimensions = wallCabinetSkuDimensions(chosen.masterCode)");
	    expect(transaction).toContain("const aWidth = sourceDimensions?.width");
    expect(transaction).toContain("wallPlacementAtUnbounded(along, pThick, pDepth, side, room)");
    expect(transaction).not.toContain("? opts.bridgeWidth : fp.w");
  });

  it("keeps a fractional refrigerator end-panel thickness fractional in the final enclosure", () => {
    const transaction = refrigeratorTransaction();
	    expect(transaction).toContain("const pThick = refrigeratorEndPanelThickness(panelRow!.width, inferredDepth)");
    expect(transaction).not.toContain("const rawPanelW = parseFloat(String(panelRow.width ?? \"\"))");
  });

	  it("does not turn a repeated FRIDGE-36 click into a second appliance", () => {
    const placement = sourceBetween("const addCabinet = useCallback", "const placeOnRecommendedWall");
    expect(placement).toContain("const requestedRefrigerator = isRefrigerator");
    expect(placement).toContain("const duplicate = prev.find((item) => isRefrigerator(item)");
	    expect(placement).toContain("refrigerator already placed. Its refrigerator attributes are open again");
	    expect(placement).toContain("setSelectedUid(duplicate.uid)");
	    expect(placement).toContain("setFridgeDialog({ fridgeUid: duplicate.uid })");
	  });

	  it("never commits an incomplete selected-panel result when a neighboring cabinet blocks a required panel", () => {
	    const transaction = refrigeratorTransaction();
	    const rejectedPanelGuard = transaction.indexOf("const requestedPanels = toPlace.filter");
	    const commit = transaction.indexOf("const committedPreview = normalizeRefrigeratorBayUppers");
	    expect(rejectedPanelGuard).toBeGreaterThan(-1);
	    expect(commit).toBeGreaterThan(rejectedPanelGuard);
	    expect(transaction).toContain("const rejectedPanels = previewResult.rejected.filter");
	    expect(transaction).toContain("No refrigerator parts were changed.");
	    expect(transaction.slice(rejectedPanelGuard, commit)).toContain("return;");
	  });

	  it("keeps refrigerator panel choices inside the insertion attributes dialog", () => {
	    expect(source).not.toContain("const setRefrigeratorSidePanels = useCallback");
	    expect(source).not.toContain("onSetRefrigeratorSidePanels={setRefrigeratorSidePanels}");
	    expect(source).not.toContain("pendingRefrigeratorPanelToggle");
	    expect(source).toContain("open={!!fridgeDialog}");
	  });

	  it("keeps a correct 72-inch cap while automatic recovery adds only refrigerator end panels", () => {
	    const transaction = refrigeratorTransaction();
	    expect(transaction).toContain("preserveExistingBridge?: boolean");
	    expect(transaction).toContain("const existingBridge = opts.preserveExistingBridge");
	    expect(transaction).toContain('refrigeratorAssemblyRole: "bridge"');
	    expect(transaction).toContain('if (opts.above !== "none" && !existingBridge)');
	  });

	  it("opens the refrigerator attributes dialog before a normal drop builds its source-backed bay", () => {
	    const transaction = refrigeratorTransaction();
	    const placement = sourceBetween("// Refrigerator dialog", "// Oven tall cabinet dialog");
	    expect(placement).toContain("setFridgeDialog({ fridgeUid: finalCab.uid })");
	    expect(placement).toContain("customer must\n\t      // choose its real appliance dimensions, cap, and enclosure panels");
	    expect(source).not.toContain("autoRefrigeratorBayUid");
	    expect(transaction).toContain("const bay = refrigeratorBayRunMetrics(configuredFridge, room)");
	    expect(transaction).toContain("const remainingOpening = Math.max(0, bay.openingWidth - aWidth)");
	    expect(transaction).toContain('addCapFiller("bridge-left-filler", bay.openingStart)');
	    expect(transaction).toContain('addCapFiller("bridge-right-filler", bay.refrigeratorEnd)');
	    expect(transaction).toContain("No source-priced over-refrigerator cabinet is available");
	    expect(transaction).toContain("No source-priced refrigerator end panel is available");
	    expect(transaction).toContain("const catalogCapDepth = sourceDimensions?.depth");
	    expect(transaction).toContain("const aDepth = catalogCapDepth > 0 ? catalogCapDepth : requestedCapDepth");
	    expect(transaction).toContain("const pDepth = sourcePanelDepth");
	    expect(transaction).not.toContain("masterCode: `PANEL-${syntheticPanelHeight}`");
	  });

	  it("preloads source caps and panels into the shared materials price request", () => {
	    const pricePairs = sourceBetween("const pricePairs = useMemo", "const { data: priceRows }");
	    expect(source).toContain("const { data: refrigeratorSurroundCatalog } = trpc.design.surroundForFridge.useQuery");
	    expect(pricePairs).toContain("...(refrigeratorParts?.deepAbove ?? [])");
	    expect(pricePairs).toContain("...(refrigeratorParts?.endPanels ?? [])");
	    expect(pricePairs).toContain("refrigeratorSurroundCatalog");
	    expect(source).toContain("const fridgeSurround = refrigeratorSurroundCatalog;");
	  });

	  it("does not auto-add refrigerator panels to restored designs", () => {
	    expect(source).not.toContain("missingRefrigeratorPanelRoles(placed, candidate, room).length > 0");
	    expect(source).not.toContain("refrigeratorPanelRepairAttemptedRef");
	  });

	  it("moves a refrigerator with its cabinet-above and selected panels on every shared interaction path", () => {
	    const moveStart = source.indexOf("const moveCabinet = useCallback");
	    const moveEnd = source.indexOf("const swingSelected", moveStart);
	    const nudgeStart = source.indexOf("const nudgeSelected = useCallback");
	    const nudgeEnd = source.indexOf("// Raise/lower the selected WALL cabinet", nudgeStart);
	    const dpadStart = source.indexOf("const moveCabinetFrom3D = useCallback");
	    const dpadEnd = source.indexOf("// Clear the override", dpadStart);
	    expect(source.slice(moveStart, moveEnd)).toContain("commitRefrigeratorAssemblyCandidate(workingPrev, uid, movedCabinet, room)");
	    expect(source.slice(nudgeStart, nudgeEnd)).toContain("moveCabinet(");
	    expect(source.slice(dpadStart, dpadEnd)).toContain("commitRefrigeratorAssemblyCandidate(placedWithoutLinkedFiller, uid, candidate, room)");
	    expect(source.slice(dpadStart, dpadEnd)).toContain("commitThreeDCabinetCandidate(placedWithoutLinkedFiller, uid, candidate)");
	  });

	  it("asks whether to delete only the refrigerator or the complete bay", () => {
	    const deletion = sourceBetween("const requestCabinetDeletion = useCallback", "const unlockCornerSnap");
	    expect(deletion).toContain("setRefrigeratorDeletePrompt({ refrigeratorUid: uid, memberUids })");
	    expect(source).toContain('data-testid="refrigerator-delete-dialog"');
	    expect(source).toContain("Remove refrigerator only");
	    expect(source).toContain("Remove complete bay");
	  });

	  it("reopens the same refrigerator options dialog when a placed refrigerator is clicked", () => {
	    const selection = sourceBetween("const selectCabinet = useCallback", "const selectSink = useCallback");
	    const editor = sourceBetween("const openAttributes = useCallback", "const openMobileAttributes = useCallback");
	    expect(selection).toContain("isRefrigerator(cabinet)");
	    expect(selection).toContain("setFridgeDialog({ fridgeUid: cabinet.uid })");
	    expect(editor).toContain("setFridgeDialog({ fridgeUid: uid })");
	    expect(source).toContain("initialChoice={fridgeDialogInitialChoice}");
	  });
});
