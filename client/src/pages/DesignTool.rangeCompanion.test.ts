import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool range companion workflow", () => {
  it("asks before adding the matching bridge and over-range microwave when a new range has no assigned hood", () => {
    const addStart = source.indexOf("const addCabinet = useCallback");
    const commitStart = source.indexOf("placedRef.current = committedRun;", addStart);
    const promptStart = source.indexOf("const proposal = hasAssignedVentilation", commitStart);

    expect(promptStart).toBeGreaterThan(commitStart);
    expect(source.slice(promptStart, promptStart + 700)).toContain("rangeCompanionProposal(finalCab, room, wallCabPoolRef.current, appliancePalette)");
    expect(source).toContain("No range hood assigned");
    expect(source).toContain("Yes — add bridge and microwave");
    expect(source).toContain("No — keep the range as placed");
  });

  it("revalidates active source availability and collision-clears both additions before changing the plan", () => {
    const actionStart = source.indexOf("const addApprovedRangeCompanions = useCallback");
    const actionEnd = source.indexOf("// Manual filler", actionStart);
    const actionSource = source.slice(actionStart, actionEnd);

    expect(actionSource).toContain("bridgeStillAvailable");
    expect(actionSource).toContain("microwaveStillAvailable");
    expect(actionSource).toContain("alreadyAssigned");
    expect(actionSource).toContain("appendCollisionFreePlacements(placedRef.current, [microwave, bridge], room)");
    expect(actionSource).toContain("Existing cabinets were left unchanged.");
    expect(actionSource).toContain("setRangeCompanionPrompt(null)");
  });

  it("does not describe a synthetic appliance as a priced cabinet source", () => {
    const previewStart = source.indexOf("data-testid=\"range-companion-source-preview\"");
    const previewSource = source.slice(previewStart, previewStart + 1400);

    expect(previewSource).toContain("No existing cabinet will be moved or replaced");
    expect(previewSource).not.toContain("price will be added");
  });
});
