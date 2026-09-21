import { describe, expect, it } from "vitest";
import {
  DOOR_COLOR_SPECTRUM_PAGE_SIZE,
  doorColorSpectrumGradient,
  doorColorSpectrumPage,
  doorColorSpectrumPageCount,
  orderDoorStylesByColor,
} from "./doorColorSpectrum";

const styles = [
  { id: 1, styleCode: "NOIR", ourName: "Noir Black", color: "Tricorn Black", featuredRank: 1 },
  { id: 2, styleCode: "WHITE", ourName: "Bright White", color: "Snowbound", featuredRank: 4 },
  { id: 3, styleCode: "NAVY", ourName: "Deep Blue", color: "Naval", featuredRank: 2 },
  { id: 4, styleCode: "CREAM", ourName: "Soft Cream", color: "Creamy", featuredRank: 3 },
] as const;

describe("door color spectrum", () => {
  it("orders real door samples from lightest through the deep finishes", () => {
    expect(orderDoorStylesByColor(styles).map((style) => style.styleCode)).toEqual([
      "WHITE",
      "CREAM",
      "NAVY",
      "NOIR",
    ]);
  });

  it("keeps six cabinet color lines in each customer-facing page", () => {
    const manyStyles = Array.from({ length: 13 }, (_, index) => ({
      id: index + 1,
      ourName: `Style ${index + 1}`,
      color: index < 6 ? "Snowbound" : index < 10 ? "Naval" : "Tricorn Black",
    }));
    expect(DOOR_COLOR_SPECTRUM_PAGE_SIZE).toBe(6);
    expect(doorColorSpectrumPageCount(manyStyles)).toBe(3);
    expect(doorColorSpectrumPage(manyStyles, 0)).toHaveLength(6);
    expect(doorColorSpectrumPage(manyStyles, 1)).toHaveLength(6);
    expect(doorColorSpectrumPage(manyStyles, 2)).toHaveLength(1);
  });

  it("draws the continuous rail from the ordered door sample colors", () => {
    const gradient = doorColorSpectrumGradient(orderDoorStylesByColor(styles));
    expect(gradient).toContain("#f4f2ec 0%");
    expect(gradient).toContain("#2a2a2c 100%");
  });
});
