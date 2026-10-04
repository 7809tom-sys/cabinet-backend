import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addThreeDPeninsulaCountertops } from "@/components/design/InteractiveRoom3D";
import { countertopSurfaces, countertopSurfacePlanPolygon, STD, type PlacedCabinet, type RoomData } from "./design";
import fixture from "./fixtures/peninsula45Return.json";

const saved = (fixture as any).design as { room: RoomData; placed: PlacedCabinet[] };
const room: RoomData = {
  ...saved.room,
  peninsulaRuns: saved.room.peninsulaRuns!.map((run) => ({ ...run, height: 42, countertopPonyWallBarOverhang: 15 as const })),
};

function slabBounds(mesh: THREE.Mesh) {
  return new THREE.Box3().setFromObject(mesh);
}

describe("raised pony wall bar", () => {
  it("keeps the 36-inch prep level and puts a separate 15-inch bar above a 42-inch wall", () => {
    const surfaces = countertopSurfaces(saved.placed, room).filter((s) => s.peninsulaRunId);
    const lower = surfaces.filter((s) => !s.raisedPonyWallBarTop);
    const upper = surfaces.filter((s) => s.raisedPonyWallBarTop);
    expect(lower.length).toBeGreaterThan(0);
    expect(upper).toHaveLength(1); // the straight and 45° bars have one mitered outline
    expect(upper[0]?.peninsulaRunIds).toHaveLength(2);
    expect(lower.every((s) => s.topElevationIn == null)).toBe(true);
    expect(upper.every((s) => s.topElevationIn === 42 + STD.COUNTERTOP_THICKNESS && s.ponyWallBarOverhangIn === 15)).toBe(true);
    // On a straight wall the bar reaches 4.5" across drywall, then 15" past it.
    const straightRoom = { ...room, peninsulaRuns: [room.peninsulaRuns![0]!] };
    const straight = countertopSurfaces(saved.placed, straightRoom).find((s) => s.raisedPonyWallBarTop);
    expect(straight).toBeTruthy();
    const outline = countertopSurfacePlanPolygon(straight!);
    expect(Math.hypot(outline[0]!.x - outline[3]!.x, outline[0]!.y - outline[3]!.y)).toBeCloseTo(19.5, 3);
  });

  it("renders upper and lower slabs at distinct heights rather than cutting the lower top through the wall", () => {
    const root = new THREE.Group();
    addThreeDPeninsulaCountertops(root, room, saved.placed, "#ffffff");
    const slabs = root.children.filter((item): item is THREE.Mesh => item instanceof THREE.Mesh && Boolean(item.userData.peninsulaCountertop));
    const upper = slabs.filter((mesh) => mesh.userData.raisedPonyWallBarTop);
    const lower = slabs.filter((mesh) => !mesh.userData.raisedPonyWallBarTop);
    expect(upper.length).toBeGreaterThan(0);
    expect(lower.length).toBeGreaterThan(0);
    expect(upper.every((mesh) => Math.abs(slabBounds(mesh).min.y * 12 - 42) < 0.01)).toBe(true);
    expect(lower.every((mesh) => Math.abs(slabBounds(mesh).max.y * 12 - STD.COUNTERTOP_HEIGHT) < 0.01)).toBe(true);
  });

  it("does not add a raised top to a standard-height peninsula", () => {
    const surfaces = countertopSurfaces(saved.placed, saved.room);
    expect(surfaces.some((s) => s.raisedPonyWallBarTop)).toBe(false);
  });
});
