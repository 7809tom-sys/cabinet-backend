import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

describe("PlanCanvas mitered wall filler", () => {
  it("draws a 45-degree fitted filler as a clipped board and labels the cut", () => {
    expect(source).toContain("isMiteredAngledWallFiller");
    expect(source).toContain("miterClipPath");
    expect(source).toContain("data-angled-wall-mitered-filler");
    expect(source).toContain("45° MITER FILLER");
  });

  it("keeps normal cabinet clipping for every non-mitered placement", () => {
    expect(source).toContain(": planCabinetClipPath(p, room)");
  });
});
