import { describe, expect, it } from "vitest";
import { countertopSurfaces, countertopSurfacePlanPolygon } from "./design";
import designs from "./fixtures/peninsula45Return.json";

const d: any = (designs as any).design;
const area = (pts: { x: number; y: number }[]) =>
  Math.abs(pts.reduce((s, p, i) => { const n = pts[(i + 1) % pts.length]!; return s + p.x * n.y - n.x * p.y; }, 0)) / 2;

describe("peninsula + 45 degree return void fill", () => {
  it("bridges the empty wedge between the run end slab and the return slab", () => {
    const surfaces = countertopSurfaces(d.placed, d.room);
    const polys = surfaces
      .filter((s) => s.peninsulaRunId || s.peninsulaRunIds)
      .map((s) => countertopSurfacePlanPolygon(s));
    // a slab spans the seam point between the 9" slab (x=83) and the return (82.3,115.4)
    const bridge = polys.find((p) => p.some((q) => Math.abs(q.x - 83) < 0.2 && Math.abs(q.y - 156.3) < 0.2)
      && p.some((q) => Math.abs(q.x - 53.6) < 0.2 && Math.abs(q.y - 144.1) < 0.2));
    expect(bridge).toBeTruthy();
    expect(area(bridge!)).toBeGreaterThan(300);
  });

  it("the bridge only fills the void (about 610 sq in), nothing stacked", () => {
    const polys = countertopSurfaces(d.placed, d.room).map((s) => countertopSurfacePlanPolygon(s));
    const bridges = polys.filter((p) => p.some((q) => Math.abs(q.x - 53.6) < 0.2 && Math.abs(q.y - 144.1) < 0.2) && area(p) < 700 && area(p) > 500);
    expect(bridges.length).toBe(1);
  });
});
