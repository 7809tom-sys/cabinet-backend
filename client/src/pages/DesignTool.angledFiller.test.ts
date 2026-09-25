import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool automatic angled front-miter workflow", () => {
  it("resolves source-backed two-piece front miter fillers before the placement transaction commits for base and wall runs", () => {
    const addStart = source.indexOf("const addCabinet = useCallback");
    const measureStart = source.indexOf("const requiredTransition = measuredAngledWallTransition", addStart);
    const fillerStart = source.indexOf("const angledFiller = automaticAngledWallFiller", measureStart);
    const commitStart = source.indexOf("placedRef.current = committedRun;", fillerStart);

    expect(measureStart).toBeGreaterThan(addStart);
    expect(fillerStart).toBeGreaterThan(measureStart);
    expect(fillerStart).toBeLessThan(commitStart);
    const workflow = source.slice(measureStart, commitStart);
    expect(source.slice(addStart, measureStart)).toContain('finalCab.placement === "wall" || finalCab.placement === "base"');
    expect(workflow).toContain("catalogFillers");
    expect(workflow).toContain("angledFiller.fillers.map");
    expect(workflow).toContain("appendCollisionFreePlacements(committedRun, angledFiller.fillers, room)");
    expect(workflow).toContain("angledFiller.fillers.every");
    expect(workflow).toContain("setFillerInsertionTransition({ uids: angledFiller.fillers.map");
    expect(workflow).toContain("front filler A");
    expect(workflow).toContain("and B");
    expect(workflow).toContain("mitered together at 45°");
    expect(workflow).toContain("both cabinets remain independently supported");
  });

  it("blocks the cabinet transaction when either real front filler stock or either positive authorized price is missing", () => {
    const workflowStart = source.indexOf("const requiredTransition = measuredAngledWallTransition");
    const workflow = source.slice(workflowStart, workflowStart + 3000);
    expect(workflow).toContain("requiredTransition && !angledFiller");
    expect(workflow).toContain("front 45° filler cuts were not added");
    expect(workflow).toContain("const sourcePrices = angledFiller.fillers.map");
    expect(workflow).toContain("sourcePrices.some");
    expect(workflow).toContain("each selected-line 45° filler piece requires a positive authorized price");
    expect(workflow).toContain("return;");
    expect(workflow).not.toContain("makeFiller(");
    expect(workflow).not.toContain('masterCode: "FILL');
  });
});
