import { describe, expect, it } from "vitest";
import live from "./__fixtures__/wizard45LiveTurn.json";
import saved from "./__fixtures__/wizard45RaisedBarSaved.json";
import { countertopSurfaces, countertopSurfacePlanPolygon } from "./design";

type P = { x: number; y: number };
const inside = (pt: P, poly: readonly P[]) => {
  let hit = false;
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const a = poly[k]!, b = poly[m]!;
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};
const slabs = (fx: any) => countertopSurfaces(fx.placed, fx.room, null, []) as any[];
const polys = (list: any[]) => list.map((s) => countertopSurfacePlanPolygon(s) as P[]);

describe("Wizard 45-degree step bar: notch at the outer turn is closed by a clean mitre", () => {
  // Saved design 14970001: straight leg along y=90 (back at y=90), 45-degree return to the right.
  // The back edge of the straight leg and the back edge of the diagonal meet at (122, 90).
  const APEX = { x: 122, y: 90 };

  it("joins the raised strips at the mitre even when the straight bar is split by a gap", () => {
    const raised = polys(slabs(live).filter((s) => s.raisedBar));
    const touching = raised.filter((poly) => poly.some((p) => Math.hypot(p.x - APEX.x, p.y - APEX.y) < 0.3));
    expect(touching.length).toBe(2);
  });

  it("covers the old open triangle (111,90)-(122,90)-(129.8,97.8) at the lower level", () => {
    const lower = polys(slabs(live).filter((s) => !s.raisedBar));
    const centroid = { x: (111 + 122 + 129.8) / 3, y: (90 + 90 + 97.8) / 3 };
    expect(lower.some((poly) => inside(centroid, poly))).toBe(true);
  });

  it("puts nothing past the mitre apex: no lower-level piece reaches behind the cabinets", () => {
    const lower = polys(slabs(live).filter((s) => !s.raisedBar)).flat();
    for (const p of lower) expect(p.y).toBeGreaterThanOrEqual(90 - 0.05);
    // and nothing sticks out beyond the apex along the back edge line y=90
    const nearBack = lower.filter((p) => Math.abs(p.y - 90) < 0.05 && p.x > 100);
    for (const p of nearBack) expect(p.x).toBeLessThanOrEqual(APEX.x + 0.05);
  });

  it("leaves no uncovered gap between the lower top and the raised strips around the turn", () => {
    const all = slabs(live);
    const lower = polys(all.filter((s) => !s.raisedBar));
    const raised = polys(all.filter((s) => s.raisedBar));
    // sample the small neighbourhood of the turn on a fine grid: any point that is inside the
    // outer mitre triangle must be covered by the lower top or a raised strip
    const tri = [{ x: 111, y: 90 }, APEX, { x: 129.8, y: 97.8 }];
    for (let ix = 0; ix <= 20; ix += 1) {
      for (let iy = 0; iy <= 20; iy += 1) {
        const u = ix / 20, v = iy / 20;
        if (u + v > 0.95) continue;
        const pt = { x: tri[0]!.x + u * (tri[1]!.x - tri[0]!.x) + v * (tri[2]!.x - tri[0]!.x), y: tri[0]!.y + u * (tri[1]!.y - tri[0]!.y) + v * (tri[2]!.y - tri[0]!.y) };
        const covered = lower.some((poly) => inside(pt, poly)) || raised.some((poly) => inside(pt, poly));
        expect(covered, `uncovered at ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).toBe(true);
      }
    }
  });

  it("keeps the earlier single-piece Wizard fixture unchanged: no triangle, one shared mitre", () => {
    const all = slabs(saved);
    const raised = polys(all.filter((s) => s.raisedBar));
    expect(raised.length).toBe(2);
    const [a, b] = raised;
    const shared = a!.filter((p) => b!.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.05));
    expect(shared.length).toBe(2);
  });
});
