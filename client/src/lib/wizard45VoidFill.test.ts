import { describe, expect, it } from "vitest";
import saved from "./__fixtures__/wizard45Saved.json";
import { countertopSurfaces, countertopSurfacePlanPolygon } from "./design";

const countertopPolygonArea = (poly: { x: number; y: number }[]) =>
  Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]!; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;

describe("Wizard 45-degree peninsula lower countertop", () => {
  it("fills only the small outer miter wedge, never a slab across open floor", () => {
    const lows = countertopSurfaces(saved.placed as any, saved.room as any).filter((s: any) => !s.raisedBar);
    const total = lows.reduce((sum: number, s: any) => sum + countertopPolygonArea(countertopSurfacePlanPolygon(s)), 0);
    // Two legs of 48x24 (25.5in wide) plus a small wedge; the buggy fill added a ~1,500 sq in slab.
    expect(total).toBeLessThan(2800);
    expect(total).toBeGreaterThan(2400);
  });
});
