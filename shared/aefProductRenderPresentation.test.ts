import { describe, expect, it } from "vitest";
import { aefProductDiagramCabinet } from "./aefProductRenderPresentation";

describe("source render product diagram projection", () => {
  it("keeps known AEF three-drawer diagrams at printed 7-3/8, 7-3/8, 15 proportions", () => {
    const cabinet = { drawerLayout: null, width: "24", height: "34.75" };
    for (const name of ["three-drawer-source-proportions", "oven-three-drawer-source-proportions", "vanity-three-drawer-source-proportions", "pantry-single-door-three-drawers", "pantry-double-door-three-drawers"]) {
      const result = aefProductDiagramCabinet(cabinet, `/manus-storage/frameless-${name}_abc123.webp`);
      expect(JSON.parse(result.drawerLayout!)).toEqual([{ count: 1, height: 7.375 }, { count: 1, height: 7.375 }, { count: 1, height: 15 }]);
      expect(result.width).toBe("24");
      expect(result.height).toBe("34.75");
    }
    expect(cabinet.drawerLayout).toBeNull();
  });
  it("leaves unrelated render images and saved configuration untouched", () => {
    const cabinet = { drawerLayout: '[{"count":2}]' };
    expect(aefProductDiagramCabinet(cabinet, null)).toBe(cabinet);
    expect(aefProductDiagramCabinet(cabinet, "/framed-three-drawer.webp")).toBe(cabinet);
    expect(aefProductDiagramCabinet(cabinet, "/manus-storage/frameless-single-oven-two-drawers_abc.webp")).toBe(cabinet);
  });
});
