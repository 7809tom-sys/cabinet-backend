import { describe, expect, it } from "vitest";
import saved from "./__fixtures__/wizard45RaisedBarSaved.json";
import { countertopSurfaces, countertopSurfacePlanPolygon } from "./design";
describe("Wizard 45-degree raised bar outer corner", () => {
  it("adds no triangular corner wedge to the raised bar; only the two strips remain", () => {
    const raised = countertopSurfaces(saved.placed as any, saved.room as any).filter((s: any) => s.raisedBar);
    expect(raised.length).toBe(2);
    expect(raised.every((s: any) => countertopSurfacePlanPolygon(s).length === 4)).toBe(true);
  });
  it("leaves the lower countertop exactly as built (3 slabs)", () => {
    const lows = countertopSurfaces(saved.placed as any, saved.room as any).filter((s: any) => !s.raisedBar);
    expect(lows.length).toBe(3);
  });
});
import { readFileSync } from "node:fs";
describe("corbels are optional", () => {
  it("3D draws corbels only when the run opts in", () => {
    const src = readFileSync("client/src/components/design/InteractiveRoom3D.tsx", "utf8");
    expect(src).toContain("run.countertopRaisedBarCorbels ? raisedBarCorbelPlan(");
    const wiz = readFileSync("client/src/pages/DesignTool.tsx", "utf8");
    expect(wiz).toContain("countertopRaisedBarCorbels: draft.corbels === true");
  });
});
