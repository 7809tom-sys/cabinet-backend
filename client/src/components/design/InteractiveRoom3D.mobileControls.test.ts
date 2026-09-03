import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");

describe("3D cabinet movement controls on mobile", () => {
  it("keeps every directional action, including Down, in a single mobile row above the bottom navigation", () => {
    const dpadStart = source.indexOf('data-testid="three-d-selected-cabinet-dpad"');
    const dpadEnd = source.indexOf('data-testid="three-d-cabinet-actions"', dpadStart);
    const dpad = source.slice(dpadStart, dpadEnd);

    expect(dpadStart).toBeGreaterThan(-1);
    expect(dpad).toContain('grid-cols-5 gap-0.5 max-md:[&>span]:hidden md:grid-cols-3');
    expect(dpad).toContain('testId="three-d-move-up"');
    expect(dpad).toContain('testId="three-d-move-left"');
    expect(dpad).toContain('testId="three-d-move-right"');
    expect(dpad).toContain('testId="three-d-move-down"');
    expect(dpad).toContain('max-md:rounded-r-md');
  });
});
