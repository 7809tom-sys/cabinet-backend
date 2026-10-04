import { describe, expect, it } from "vitest";
import designer from "@/lib/fixtures/designerU45Draft.json";
import wallBuilder from "@/lib/fixtures/wallBuilderU45Draft.json";
import { existingCabinetTransform } from "./InteractiveRoom3D";

/** Regular Designer U-shape with a free-standing 45 degree peninsula, built 20in off the origin. */
describe("angled free-standing run keeps its seated 3D position", () => {
  it("places every cabinet body exactly where the Wall Builder places the same run", () => {
    const d: any = designer, w: any = wallBuilder;
    for (let i = 0; i < d.placed.length; i += 1) {
      const a: any = existingCabinetTransform(d.placed[i], d.room);
      const b: any = existingCabinetTransform(w.placed[i], w.room);
      // Both rooms use the same wall-relative geometry; only the origin differs by (20, 20).
      expect(a.x - 20).toBeCloseTo(b.x, 2);
      expect(a.z - 20).toBeCloseTo(b.z, 2);
    }
  });
});
