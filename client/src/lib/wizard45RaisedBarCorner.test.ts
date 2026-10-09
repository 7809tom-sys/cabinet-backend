import { describe, expect, it } from "vitest";
import saved from "./__fixtures__/wizard45RaisedBarSaved.json";
import { countertopSurfaces, countertopSurfacePlanPolygon } from "./design";
describe("Wizard 45-degree raised bar outer corner", () => {
  it("has a mitered wedge joining the straight and 45-degree back strips", () => {
    const raised = countertopSurfaces(saved.placed as any, saved.room as any).filter((s: any) => s.raisedBar);
    expect(raised.length).toBe(3);
    const wedge = raised.map((s: any) => countertopSurfacePlanPolygon(s)).find((p: any[]) => p.length === 5)!;
    expect(wedge).toBeTruthy();
    expect(wedge.some((p: any) => Math.abs(p.x - 123) < 0.1 && Math.abs(p.y - 65.2) < 0.5)).toBe(true);
  });
});
