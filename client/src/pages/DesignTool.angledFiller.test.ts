import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool automatic angled transition workflow", () => {
  it("resolves a source-backed full-depth transition before the placement transaction commits", () => {
    const addStart = source.indexOf("const addCabinet = useCallback");
    const measureStart = source.indexOf("const requiredTransition = measuredAngledWallTransition", addStart);
    const fillerStart = source.indexOf("const angledFiller = automaticAngledWallFiller", measureStart);
    const commitStart = source.indexOf("placedRef.current = committedRun;", fillerStart);

    expect(measureStart).toBeGreaterThan(addStart);
    expect(fillerStart).toBeGreaterThan(measureStart);
    expect(fillerStart).toBeLessThan(commitStart);
    const workflow = source.slice(measureStart, commitStart);
		expect(source.slice(addStart, measureStart)).toContain("finalCab.placement === \"wall\" || finalCab.placement === \"base\"");
    expect(workflow).toContain("catalogFillers");
    expect(workflow).toContain("appendCollisionFreePlacements(committedRun, [angledFiller.filler], room)");
    expect(workflow).toContain("setFillerInsertionTransition");
    expect(workflow).toContain("rear /");
    expect(workflow).toContain("face 45° transition");
    expect(workflow).toContain("both cabinets remain independently supported");
  });

  it("blocks both the transition cabinet and filler when real stock or a positive authorized price is missing", () => {
    const workflowStart = source.indexOf("const requiredTransition = measuredAngledWallTransition");
    const workflow = source.slice(workflowStart, workflowStart + 2600);
    expect(workflow).toContain("requiredTransition && !angledFiller");
    expect(workflow).toContain("no real filler stock wide enough");
    expect(workflow).toContain("const sourcePrice = unitPriceFor(angledFiller.filler)");
    expect(workflow).toContain("sourcePrice <= 0");
    expect(workflow).toContain("no positive authorized price");
    expect(workflow).toContain("return;");
    expect(workflow).not.toContain("makeFiller(");
    expect(workflow).not.toContain("masterCode: \"FILL");
  });
});
