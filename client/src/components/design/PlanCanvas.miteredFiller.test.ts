import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

describe("PlanCanvas angled wall filler", () => {
  it("keeps legacy one-edge 45-degree filler rendering compatible", () => {
    expect(source).toContain("isMiteredAngledWallFiller");
    expect(source).toContain("miterClipPath");
    expect(source).toContain("data-angled-wall-mitered-filler");
    expect(source).toContain("45° MITER FILLER");
  });

  it("draws a new transition from its exact rear and visible face edges", () => {
    expect(source).toContain("angledWallTransitionFootprint");
    expect(source).toContain("fillerTransitionPlanFootprint");
    expect(source).toContain("transitionClipPath");
    expect(source).toContain("data-angled-wall-transition-filler");
    expect(source).toContain("45° TRANSITION");
    expect(source).toContain("both cabinets remain independently supported");
  });

  it("keeps normal cabinet clipping for every non-transition placement", () => {
    expect(source).toContain(": planCabinetClipPath(p, room)");
  });
});
