import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool automatic angled filler workflow", () => {
  it("resolves a source-backed fitted filler before the placement transaction commits", () => {
    const addStart = source.indexOf("const addCabinet = useCallback");
    const fillerStart = source.indexOf("const angledFiller = automaticAngledWallFiller", addStart);
    const commitStart = source.indexOf("placedRef.current = committedRun;", fillerStart);

    expect(fillerStart).toBeGreaterThan(addStart);
    expect(fillerStart).toBeLessThan(commitStart);
    const workflow = source.slice(fillerStart, commitStart);
    expect(workflow).toContain("catalogFillers");
    expect(workflow).toContain("appendCollisionFreePlacements(committedRun, [angledFiller.filler], room)");
    expect(workflow).toContain("setFillerInsertionTransition");
    expect(workflow).toContain("45° wall seam");
  });

  it("does not insert an unverified generic filler when the selected line lacks one", () => {
    const workflowStart = source.indexOf("const angledFiller = automaticAngledWallFiller");
    const workflow = source.slice(workflowStart, workflowStart + 1200);
    expect(workflow).not.toContain("makeFiller(");
    expect(workflow).not.toContain("masterCode: \"FILL");
  });
});
