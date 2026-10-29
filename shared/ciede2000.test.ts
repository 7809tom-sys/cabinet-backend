import { describe, expect, it } from "vitest";
import { deltaE2000, deltaE2000Hex, labFromHex } from "./ciede2000";
import { SHERWIN_WILLIAMS_COLORS, sherwinWilliamsColor } from "./sherwinWilliamsColors";

describe("CIEDE2000", () => {
  it("is zero for the same color and matches Sharma pair 1", () => {
    const white = labFromHex("#ffffff");
    expect(white && deltaE2000(white, white)).toBe(0);
    const delta = deltaE2000(
      { L: 50, a: 2.6772, b: -79.7751 },
      { L: 50, a: 0, b: -82.7485 },
    );
    expect(delta).toBeCloseTo(2.0425, 3);
    expect(deltaE2000Hex("#000000", "#ffffff")).toBeGreaterThan(50);
  });
});

describe("Sherwin-Williams table", () => {
  it("stores the published hex and a Lab computed from it", () => {
    const iron = sherwinWilliamsColor("SW 7069");
    expect(iron?.hex).toBe("#434341");
    expect(iron?.name).toBe("Iron Ore");
    expect(iron?.source).toContain("sherwin-williams.com");
    expect(iron?.lab.L).toBeGreaterThan(0);
    expect(sherwinWilliamsColor("sw7015")?.hex).toBe("#ccc9c0");
    expect(sherwinWilliamsColor("7005")?.hex).toBe("#edece6");
    expect(SHERWIN_WILLIAMS_COLORS.length).toBeGreaterThan(0);
  });
});
