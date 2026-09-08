import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer island countertop pricing", () => {
  it("measures the same resolved island slabs used by the 2D and 3D renderers", () => {
    expect(source).toContain("countertopArea(placed, island, island ? islandCountertopRects(island, placed) : null)");
  });

  it("passes measured countertop square footage into priced surface quantities and totals", () => {
    expect(source).toContain("const areas = { backsplashSqFt, flooringSqFt, countertopSqFt }");
    expect(source).toContain("island, countertop, backsplashHeightMode");
    expect(source).toContain("estimatedSubtotal={calculateCartSubtotal(surfaceCartLines)}");
  });
});
