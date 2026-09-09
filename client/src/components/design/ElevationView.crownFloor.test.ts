import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Elevation crown eligibility wiring", () => {
  it("uses the shared physical crown rule instead of a nullable mountBottom shortcut", () => {
    const source = readFileSync(new URL("./ElevationView.tsx", import.meta.url), "utf8");

    expect(source).toContain(".filter((p) => isCrownEligibleCabinet(p, room))");
    expect(source).not.toContain('.filter((p) => p.placement === "wall" && p.mountBottom == null)\n    .map((p) => {\n      const footprint = placedFootprint(p);');
  });
});
