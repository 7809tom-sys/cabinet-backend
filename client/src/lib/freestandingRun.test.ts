import { describe, expect, it } from "vitest";
import { cabinetPlanBodiesIntersect, countertopSurfaces, countertopSurfacePlanPolygon, removeOverlappingPlacements, type PlacedCabinet, type RoomData } from "@/lib/design";
import {
  freestandingChains,
  freestandingChainOutline,
  freestandingBody,
  freestandingBodyCorners,
  snapFreestandingFortyFive,
} from "@/lib/freestandingRun";

const room: RoomData = { width: 192, depth: 144, ceilingHeight: 96 };

function base(uid: string, x: number, y: number, rotation = 0): PlacedCabinet {
  return {
    uid,
    cabinetId: 1,
    masterCode: "B24",
    description: "24\" Base",
    placement: "base",
    x,
    y,
    width: 24,
    depth: 24,
    height: 34.5,
    rotation,
  } as PlacedCabinet;
}

function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

describe("free-standing run countertop (Continuous Wall Builder rule)", () => {
  it("three touching bases in the open room share ONE slab and nothing lands on the wall", () => {
    const placed = [base("a", 40, 70), base("b", 64, 70), base("c", 88, 70)];
    const surfaces = countertopSurfaces(placed, room, null);
    expect(surfaces).toHaveLength(1);
    const slab = surfaces[0]!;
    expect(slab.freestandingMemberUids?.sort()).toEqual(["a", "b", "c"]);
    // Covers the whole run, 25.5 deep (24 + 1.5 front overhang), starting at the back of the cabinets.
    expect(slab.x).toBeCloseTo(40, 3);
    expect(slab.width).toBeCloseTo(72, 3);
    expect(slab.y).toBeCloseTo(70, 3);
    expect(slab.depth).toBeCloseTo(25.5, 3);
    expect(slab.linearInches).toBeCloseTo(72, 3);
  });

  it("a 45° cabinet seated flush at the end of the run joins the same slab with a mitered corner", () => {
    const straight = [base("a", 40, 70), base("b", 64, 70), base("c", 88, 70)];
    // Drop the angled cabinet roughly at the end and let the flush snap seat it.
    const loose = base("d", 110, 79, 45); // flush seat is x=112, y=77 (front corners meet, backs miter)
    const snap = snapFreestandingFortyFive(loose, straight, room, null, 8);
    expect(snap).not.toBeNull();
    const angled = { ...loose, x: snap!.x, y: snap!.y };
    const placed = [...straight, angled];

    // The flush seat survives the load-time collision sweep (true bodies only touch at the miter).
    const restored = removeOverlappingPlacements(placed, room);
    expect(restored.rejected).toEqual([]);
    expect(restored.placed.find((c) => c.uid === "d")!.x).toBeCloseTo(angled.x, 3);
    expect(restored.placed.find((c) => c.uid === "d")!.y).toBeCloseTo(angled.y, 3);

    const chains = freestandingChains(placed, room, null);
    expect(chains).toHaveLength(1);
    expect(chains[0]!.map((body) => body.cabinet.uid)).toEqual(["a", "b", "c", "d"]);

    const outline = freestandingChainOutline(chains[0]!);
    // 4 bodies → back polyline has 5 points, front polyline 5 points, one closed outline.
    expect(outline).toHaveLength(10);

    const surfaces = countertopSurfaces(placed, room, null);
    expect(surfaces).toHaveLength(1);
    const world = countertopSurfacePlanPolygon(surfaces[0]!);

    // Every cabinet's centre sits under the single slab; the slab never reaches the walls.
    for (const cabinet of placed) {
      const body = freestandingBody(cabinet);
      expect(pointInPolygon(body.center, world)).toBe(true);
      // front-overhang point just outside the front face is covered too (continuous front edge)
      const frontMid = { x: body.center.x + body.forward.x * (12 + 0.75), y: body.center.y + body.forward.y * (12 + 0.75) };
      expect(pointInPolygon(frontMid, world)).toBe(true);
    }
    expect(Math.min(...world.map((p) => p.y))).toBeGreaterThan(5);
    expect(Math.max(...world.map((p) => p.x))).toBeLessThan(room.width - 5);

    // The angled cabinet shares a corner with its neighbour (flush, no gap) and the true bodies do not overlap.
    const cCorners = freestandingBodyCorners(freestandingBody(straight[2]!));
    const dCorners = freestandingBodyCorners(freestandingBody(angled));
    const nearest = Math.min(...dCorners.flatMap((p) => cCorners.map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
    expect(nearest).toBeLessThan(0.01);
    expect(cabinetPlanBodiesIntersect(angled, straight[2]!)).toBe(false);
  });

  it("a base against a wall still uses the wall run slab, not a free-standing chain", () => {
    const placed = [base("w", 40, 0)];
    const surfaces = countertopSurfaces(placed, room, null);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.freestandingMemberUids).toBeUndefined();
  });
});
