import { describe, expect, it } from "vitest";
import { islandFarmhouseSinkElevationGeometry } from "./IslandElevationView";

describe("island farmhouse sink elevation geometry", () => {
  it("keeps a 36-inch FSB apron shallow, counter-mounted, and inset from the cabinet edges", () => {
    const geometry = islandFarmhouseSinkElevationGeometry(36);

    expect(geometry.apronHeightIn).toBe(8.5);
    expect(geometry.apronBottomIn).toBe(26);
    expect(geometry.sideInsetIn).toBe(1.44);
    expect(geometry.apronWidthIn).toBeCloseTo(33.12, 2);
  });
});
