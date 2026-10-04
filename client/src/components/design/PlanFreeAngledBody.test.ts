import { describe, expect, it } from "vitest";
import designer from "@/lib/fixtures/designerU45Draft.json";
import wallBuilder from "@/lib/fixtures/wallBuilderU45Draft.json";
import { planCabinetRenderFrame } from "./PlanCanvas";

describe("plan draws free 45 degree cabinets rotated like the Wall Builder", () => {
  it("gives the Designer's angled cabinets the same rotated body frame as the Wall Builder's", () => {
    const d: any = designer.placed, w: any = wallBuilder.placed;
    for (const i of [5, 6]) {
      const a = planCabinetRenderFrame(d[i]); const b = planCabinetRenderFrame(w[i]);
      expect(a.lockedAngledRun).toBe(true);
      expect(a.bodyW).toBeCloseTo(b.bodyW, 3);
      expect(a.bodyD).toBeCloseTo(b.bodyD, 3);
      expect(a.bodyLeft - 20).toBeCloseTo(b.bodyLeft, 2);
      expect(a.bodyTop - 20).toBeCloseTo(b.bodyTop, 2);
    }
  });
  it("leaves quarter-turn free cabinets unrotated", () => {
    expect(planCabinetRenderFrame((designer.placed as any)[0]).lockedAngledRun).toBe(false);
  });
});
