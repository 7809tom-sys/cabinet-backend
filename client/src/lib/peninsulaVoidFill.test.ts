import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addThreeDPeninsulaCountertops } from "@/components/design/InteractiveRoom3D";
import { freestandingBody, freestandingBodyCorners } from "./freestandingRun";
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

  it("renders that same fill in 3D at the plan coordinates, not at the parent run origin", () => {
    const root = new THREE.Group();
    addThreeDPeninsulaCountertops(root, d.room, d.placed, "#ffffff");
    const fills = (root.children as THREE.Mesh[]).filter((mesh) => mesh.userData.peninsulaCountertop && mesh.geometry.type === "ExtrudeGeometry")
      .filter((mesh) => {
        const box = new THREE.Box3().setFromObject(mesh);
        return box.min.x * 12 > 53 && box.min.x * 12 < 54 && box.max.x * 12 > 82 && box.max.x * 12 < 84
          && box.min.z * 12 < 116 && box.max.z * 12 > 156;
      });
    expect(fills).toHaveLength(1);
  });

  it("does not stop the run at the 24-inch dishwasher beneath the countertop", () => {
    const surfaces = countertopSurfaces(d.placed, d.room).filter((s) => s.peninsulaRunId === d.room.peninsulaRuns[0].id);
    const x = 144, y = 135; // centre of the installed DW-24 in this saved run
    const overDishwasher = surfaces.some((surface) => {
      const polygon = countertopSurfacePlanPolygon(surface);
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i]!, b = polygon[j]!;
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    });
    expect(overDishwasher).toBe(true);
  });

  it("covers every corner of the real rotated 3DB24 cabinet, not just its diagonal slab centre", () => {
    const cabinet = d.placed.find((item: { masterCode: string }) => item.masterCode === "3DB24");
    const body = freestandingBodyCorners(freestandingBody(cabinet));
    const slabs = countertopSurfaces(d.placed, d.room).filter((s) => s.peninsulaRunId)
      .map((s) => countertopSurfacePlanPolygon(s));
    const center = { x: body.reduce((sum, p) => sum + p.x, 0) / 4, y: body.reduce((sum, p) => sum + p.y, 0) / 4 };
    for (const corner of body) {
      // Nudge a body boundary point into the cabinet for an unambiguous ray cast.
      const point = { x: corner.x * 0.999 + center.x * 0.001, y: corner.y * 0.999 + center.y * 0.001 };
      expect(slabs.some((polygon) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i]!, b = polygon[j]!;
          if ((a.y > point.y) !== (b.y > point.y)
            && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside;
      })).toBe(true);
    }
  });

  it("still bridges the 45-degree void after draft restoration seats both fitted fillers on the parent run", () => {
    const restored = d.placed.map((cabinet: { uid: string; masterCode: string }) => cabinet.masterCode === "WF642"
      ? { ...cabinet, wallId: d.room.peninsulaRuns[0].id,
        wallOffset: cabinet.uid.endsWith("_3") ? 96 : 98, depth: 24,
        peninsulaSide: "left", mountBottom: 0 }
      : cabinet);
    const surfaces = countertopSurfaces(restored, d.room);
    const bridge = surfaces.find((surface) => surface.peninsulaRunId
      && surface.areaInches! > 500 && surface.areaInches! < 700
      && countertopSurfacePlanPolygon(surface).some((p) => Math.abs(p.x - 53.6) < 0.2 && Math.abs(p.y - 144.1) < 0.2));
    expect(bridge).toBeTruthy();
    const scene = new THREE.Group();
    addThreeDPeninsulaCountertops(scene, d.room, restored, "#ffffff");
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(81 / 12, 5, 131 / 12), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObjects(scene.children, true).some((hit) =>
      hit.object.userData.peninsulaCountertop && Math.abs(hit.point.y * 12 - 36) < 0.01)).toBe(true);
  });
});
