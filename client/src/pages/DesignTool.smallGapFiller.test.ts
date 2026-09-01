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
	  expect(source).toContain("applySmallGapFiller(automaticSmallGapFillerMode(smallGapFillerPrompt))");
	  expect(source).toContain("Auto-fill {smallGapFillerDefinition?.masterCode");
    expect(source).toContain("Fill the remaining");
    expect(source).toContain("Split left / right");
    expect(source).toContain("All on left");
    expect(source).toContain("All on right");
    expect(source).toContain("Leave space open");
  });

  it("opens the same catalog-backed filler dialog from a manual selected-cabinet action", () => {
    expect(source).toContain("const requestSmallGapFiller = useCallback");
    expect(source).toContain("findSmallGapFillerOpportunity(room, placed, openings, cabinetUid)");
    expect(source).toContain("catalogFillerForGap(catalogFillers, opportunity.remaining, opportunity.layer)");
    expect(source).toContain("setSmallGapFillerPrompt(opportunity)");
    expect(source).toContain("installedSmallGapFillerEditOpportunity(room, placed, openings, cabinetUid, island)");
    expect(source).toContain("findIslandSmallGapFillerOpportunity(islandMember, placed, cabinetUid)");
    expect(source).toContain("islandFacePlacement(cabinet, island, opportunity.islandFace, layout.cabinetStart)");
    expect(source).toContain("fills the measured ${formatEighthInches(fit.availableSpan)} opening. No filler is needed.");
    expect(source.match(/onRequestFiller=\{requestFillerAction\}/g)).toHaveLength(2);
    expect(source).toContain("if (!openFillerAttributes(uid)) requestSmallGapFiller(uid)");
    expect(source).toContain("if (openFillerAttributes(uid)) return");
    expect(source).toContain("<FillerAttributesDialog");
    expect(source).toContain("onApply={applyFillerAttributes}");
    expect(source).toContain("onRemove={removeFillerFromAttributes}");
  });

	  it("preserves exact placement and one purchased filler identity", () => {
    expect(source).toContain("smallGapFillerLayout(opportunity, mode)");
    expect(source).toContain('fillerBillingRole: index === 0 ? "primary" : "secondary"');
	    expect(source).toContain("appendSmallGapFillerPlacement(workingPlaced, movedCabinet, pieces)");
	    expect(source).toContain("fillerForCabinetUid: cabinet.uid");
	    expect(source).toContain("opportunity.replacingFillerGroupId ?? `filler-group-${makeUid()}`");
		    expect(source).toContain("removePlacedCabinetWithRequiredBlindCornerFiller(prev, selectedUid)");
	  });
});
