import { describe, expect, it } from "vitest";
import { miteredFillerPrismGeometry } from "./InteractiveRoom3D";

describe("miteredFillerPrismGeometry", () => {
  it("creates a true diagonal cut on the requested start end", () => {
    const geometry = miteredFillerPrismGeometry(3, 42, 0.75, "start");
    const positions = Array.from(geometry.getAttribute("position").array as Float32Array);

    expect(geometry.getIndex()?.count).toBe(36);
    // First front corner is shifted right by the 45° cut, while the rear start
    // corner remains at full width: this is a mitered prism, not a rotated box.
    expect(positions[0]).toBeCloseTo(-0.75);
    expect(positions[9]).toBeCloseTo(-1.5);
    geometry.dispose();
  });

  it("mirrors the diagonal cut at the requested end", () => {
    const geometry = miteredFillerPrismGeometry(3, 42, 0.75, "end");
    const positions = Array.from(geometry.getAttribute("position").array as Float32Array);

    expect(positions[3]).toBeCloseTo(0.75);
    expect(positions[6]).toBeCloseTo(1.5);
    geometry.dispose();
  });
});
