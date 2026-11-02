import { describe, expect, it } from "vitest";
import { deltaE2000Hex } from "./ciede2000";
import { analyzeSwatchPixels, type SwatchPixels } from "./swatchColor";

function fill(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): SwatchPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height, channels: 4 };
}

describe("analyzeSwatchPixels", () => {
  it("reads a flat gray door and ignores the studio border and a glare spot", () => {
    const image = fill(80, 100, (x, y) => {
      if (x < 6 || y < 6 || x >= 74 || y >= 94) return [237, 237, 237];
      if (x > 36 && x < 44 && y > 40 && y < 48) return [255, 255, 255];
      return [138, 140, 142];
    });
    const color = analyzeSwatchPixels(image);
    expect(color).not.toBeNull();
    expect(color!.finishCategory).toBe("paint");
    expect(deltaE2000Hex(color!.hex, "#8a8c8e")).toBeLessThan(4);
    expect(color!.shades).toHaveLength(4);
    expect(color!.hex).not.toBe("#ededed");
  });

  it("reads a striped wood face as a stain and keeps four shades in that hue", () => {
    const image = fill(80, 100, (x, y) => {
      if (x < 5 || y < 5 || x >= 75 || y >= 95) return [237, 237, 237];
      return x % 6 < 3 ? [196, 154, 99] : [107, 74, 42];
    });
    const color = analyzeSwatchPixels(image);
    expect(color).not.toBeNull();
    expect(color!.finishCategory).toBe("stain");
    expect(color!.grainContrast).toBeGreaterThan(3);
    expect(deltaE2000Hex(color!.lightHex, color!.darkHex)!).toBeGreaterThan(8);
    expect(color!.shades).toHaveLength(4);
    const lightL = deltaE2000Hex(color!.lightHex, "#ffffff")!;
    const darkL = deltaE2000Hex(color!.darkHex, "#ffffff")!;
    expect(lightL).toBeLessThan(darkL);
  });

  it("returns null for a tiny image", () => {
    expect(analyzeSwatchPixels(fill(4, 4, () => [0, 0, 0]))).toBeNull();
  });
});
