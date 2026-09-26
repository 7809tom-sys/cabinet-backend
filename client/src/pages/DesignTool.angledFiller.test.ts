import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool automatic angled front-miter workflow", () => {
  it("resolves source-backed two-piece front miter fillers before the placement transaction commits for every cabinet run", () => {
    const addStart = source.indexOf("const addCabinet = useCallback");
    const measureStart = source.indexOf("const requiredTransition = measuredAngledWallTransition", addStart);
    const fillerStart = source.indexOf("const angledFiller = automaticAngledWallFiller", measureStart);
    const commitStart = source.indexOf("placedRef.current = committedRun;", fillerStart);

    expect(measureStart).toBeGreaterThan(addStart);
    expect(fillerStart).toBeGreaterThan(measureStart);
    expect(fillerStart).toBeLessThan(commitStart);
    const workflow = source.slice(measureStart, commitStart);
    expect(source.slice(addStart, measureStart)).toContain('finalCab.placement === "wall" || finalCab.placement === "base" || finalCab.placement === "tall"');
    expect(workflow).toContain("catalogFillers");
    expect(workflow).toContain("angledFiller.fillers.map");
    expect(workflow).toContain("appendCollisionFreePlacements(committedRun, angledFiller.fillers, room)");
    expect(workflow).toContain("angledFiller.fillers.every");
    expect(workflow).toContain("setFillerInsertionTransition({ uids: angledFiller.fillers.map");
    expect(workflow).toContain("front filler A");
    expect(workflow).toContain("and B");
    expect(workflow).toContain("each cut at 22.5° to form one tight 45° turn");
    expect(workflow).toContain("both cabinets remain independently supported");
  });

	  it("keeps the cabinet transaction active and only blocks a filler piece that lacks an authorized price", () => {
    const workflowStart = source.indexOf("const requiredTransition = measuredAngledWallTransition");
    const workflow = source.slice(workflowStart, workflowStart + 3000);
    expect(workflow).not.toContain("requiredTransition && !angledFiller");
    expect(workflow).not.toContain("front 45° filler cuts were not added");
    expect(workflow).toContain("const sourcePrices = angledFiller.fillers.map");
    expect(workflow).toContain("sourcePrices.some");
    expect(workflow).toContain("each selected-line 45° filler piece requires a positive authorized price");
    expect(workflow).toContain("return;");
    expect(workflow).not.toContain("makeFiller(");
	    expect(workflow).not.toContain('masterCode: "FILL');
	  });

  it("preloads selected-line filler prices and repairs an older saved peninsula after catalog hydration", () => {
	    expect(source).toContain("catalogFillers.filter(isCatalogFiller).forEach");
	    expect(source).toContain("repairMissingAngledWallFillers(");
	    expect(source).toContain("if (!styleId || !priceRows || catalogFillers.length === 0) return;");
	    expect(source).toContain("placedRef.current = repaired.placed;");
	    expect(source).toContain("setFillerInsertionTransition({ uids: repaired.added.map");
	    expect(source).toContain("The open 45° cabinet front was closed with two source-priced fillers joined on one continuous miter.");
  });

  it("keeps both physical miter boards on the invoice with their real per-board cut note", () => {
    expect(source).toContain('const miterCutNote = p.fillerTransitionKind === "front-miter-pair"');
    expect(source).toContain('Mitered ${p.fillerMiterAngle ?? 22.5}° (forms 45° turn)');
    expect(source).toContain('[p.description, sizeNote, miterCutNote, attrNote]');
  });
});
