import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool small-gap filler workflow", () => {
  it("queues a catalog-backed opportunity after successful normal placement", () => {
	    expect(source).toContain("queueSmallGapFillerOpportunity(committedRun, finalCab.uid)");
	    expect(source).toContain('finalCab.placement !== "appliance" || isRangeOrOven(finalCab.masterCode)');
	    expect(source).toContain("!isBlindCorner(finalCab.masterCode, finalCab.description)");
    expect(source).toContain("findSmallGapFillerOpportunity(room, nextPlaced, openings, cabinetUid)");
    const queueStart = source.indexOf("const queueSmallGapFillerOpportunity");
    const queueEnd = source.indexOf("}, [openings, room]);", queueStart) + "}, [openings, room]);".length;
    const queueSource = source.slice(queueStart, queueEnd);
    expect(queueSource).toContain("setSmallGapFillerPrompt(opportunity)");
    expect(queueSource).not.toContain("catalogFillerForGap");
  });

  it("does not exclude a successfully placed affiliate range from the measured filler prompt", () => {
    const placementStart = source.indexOf("// ── Now do all state updates and side effects exactly once");
    const placementEnd = source.indexOf("const placedCabinet =", placementStart);
    const placementSource = source.slice(placementStart, placementEnd);
    expect(placementSource).toContain('finalCab.placement !== "appliance" || isRangeOrOven(finalCab.masterCode)');
	    expect(placementSource).toContain("queueSmallGapFillerOpportunity(committedRun, finalCab.uid)");
  });

	  it("offers leave-open, split, left, and right outcomes", () => {
	  expect(source).toContain('data-testid="small-gap-filler-auto"');
	  expect(source).toContain("applySmallGapFiller(automaticSmallGapFillerMode(smallGapFillerPrompt), undefined, selectedSmallGapFillerCut)");
	  expect(source).toContain("Use suggested placement · {smallGapFillerDefinition?.masterCode");
	    expect(source).toContain("Choose filler placement");
	    expect(source).toContain("Where should this");
	    expect(source).toContain("Split evenly");
	    expect(source).toContain('data-testid="small-gap-filler-left"');
	    expect(source).toContain('data-testid="small-gap-filler-right"');
	    expect(source).toContain("cuts and inserts the selected size at that exact zero-overlap seam");
	    expect(source).toContain("Leave space open");
	  });

	  it("allows a bounded custom cut and sends inserted filler UIDs to the 3D transition", () => {
	    expect(source).toContain('data-testid="small-gap-filler-custom-width"');
	    expect(source).toContain("Custom cut width");
	    expect(source).toContain("selectedSmallGapFillerCut >= SMALL_GAP_FILLER_MIN_IN");
	    expect(source).toContain("selectedSmallGapFillerCut <= smallGapFillerPrompt.remaining");
	    expect(source).toContain("applySmallGapFiller(\"left\", undefined, selectedSmallGapFillerCut)");
	    expect(source).toContain("setFillerInsertionTransition({ uids: pieces.map((piece) => piece.uid), key: Date.now() })");
	    expect(source.match(/fillerInsertionTransition=\{fillerInsertionTransition\}/g)).toHaveLength(2);
	  });

	  it("highlights the selected filler placement and recommends the full measured seam", () => {
	    expect(source).toContain("const smallGapFillerPlanPreview = useMemo<PlacedCabinet[]>");
	    expect(source).toContain("fillerGapPreview={smallGapFillerPlanPreview}");
	    expect(source.match(/fillerGapPreview=\{smallGapFillerPlanPreview\}/g)).toHaveLength(2);
	    expect(source).toContain("optimalSmallGapFillerCut(smallGapFillerPrompt)");
	    expect(source).toContain('data-testid="small-gap-filler-optimal-suggestion"');
	    expect(source).toContain("Use optimal size");
	    expect(source).toContain("The gold highlighted gap on the plan shows the current choice");
	    expect(source).toContain("setSmallGapFillerPreviewMode(\"split\")");
	  });

	  it("rechecks the committed run before applying a filler so an exact-fit replacement cannot use a stale prompt", () => {
	    const applyStart = source.indexOf("const applySmallGapFiller = useCallback");
	    const applyEnd = source.indexOf("const previewSmartGap", applyStart);
	    const applySource = source.slice(applyStart, applyEnd);
	    expect(applySource).toContain("const committedPlaced = placedRef.current");
	    expect(applySource).toContain("findSmallGapFillerOpportunity(room, committedPlaced, openings, requestedCabinet.uid)");
	    expect(applySource).toContain("Choose an installable filler cut from");
	    expect(applySource).toContain("placedRef.current = result.placed");
	  });

  it("opens the same catalog-backed filler dialog from a manual selected-cabinet action", () => {
    expect(source).toContain("const requestSmallGapFiller = useCallback");
    expect(source).toContain("findSmallGapFillerOpportunity(room, placed, openings, cabinetUid)");
    expect(source).toContain("catalogFillerForGap(catalogFillers, opportunity.remaining, opportunity.layer)");
    expect(source).toContain("setSmallGapFillerPrompt(opportunity)");
    expect(source).toContain("installedSmallGapFillerEditOpportunity(room, placed, openings, cabinetUid, island)");
    expect(source).toContain("findIslandSmallGapFillerOpportunity(islandMember, placed, cabinetUid)");
	    expect(source).toContain("islandFacePlacement(cabinet, island, cutOpportunity.islandFace, layout.cabinetStart)");
    expect(source).toContain("fills the measured ${formatEighthInches(fit.availableSpan)} opening. No filler is needed.");
    expect(source.match(/onRequestFiller=\{requestFillerAction\}/g)).toHaveLength(2);
    expect(source).toContain("if (!openFillerAttributes(uid)) requestSmallGapFiller(uid)");
    expect(source).toContain("if (openFillerAttributes(uid)) return");
    expect(source).toContain("<FillerAttributesDialog");
    expect(source).toContain("onApply={applyFillerAttributes}");
    expect(source).toContain("onRemove={removeFillerFromAttributes}");
  });

	  it("preserves exact placement and one purchased filler identity", () => {
	  expect(source).toContain("smallGapFillerLayout(cutOpportunity, mode)");
	  expect(source).toContain('fillerBillingRole: index === 0 ? "primary" : "secondary"');
		  expect(source).toContain("appendSmallGapFillerPlacement(workingPlaced, movedCabinet, pieces)");
		  expect(source).toContain("fillerForCabinetUid: cutOpportunity.boundedCabinetUids");
		  expect(source).toContain("piece.side === \"left\" ? cutOpportunity.boundedCabinetUids[0] : cutOpportunity.boundedCabinetUids[1]");
		  expect(source).toContain("cutOpportunity.replacingFillerGroupId ?? `filler-group-${makeUid()}`");
		    expect(source).toContain("removeCabinetAndReleaseVoid(selectedUid)");
		  });
});
