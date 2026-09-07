import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/design/IslandAttributesDialog.tsx"), "utf8");

describe("IslandAttributesDialog waterfall prompt", () => {
  it("asks for an optional physical left or right island waterfall end", () => {
    expect(source).toContain('data-testid="island-waterfall-prompt"');
    expect(source).toContain("Add a waterfall?");
    expect(source).toContain('value="left"');
    expect(source).toContain('value="right"');
    expect(source).toContain('waterfallEnd: value as "none" | "left" | "right"');
  });
});
