import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool blind-corner pull prompt", () => {
  it("asks for a valid pull before placing a blind corner rather than silently committing the six-inch default", () => {
    const start = source.indexOf("const addCabinet = useCallback");
    const end = source.indexOf("const addManualFiller", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const add = source.slice(start, end);

    expect(add).toContain("setBlindCornerPullPrompt");
    expect(add).toContain("blindPullOverride");
    expect(add).toContain("blindCornerPullPlacement");
    expect(add).toContain("newCab.blindPull = requestedPull");
  });

  it("renders an accessible modal with the measured pull request and an explicit no-placement cancel action", () => {
    expect(source).toContain('data-testid="blind-corner-pull-dialog"');
    expect(source).toContain("How far should this blind corner pull from the wall?");
    expect(source).toContain('data-testid="blind-corner-pull-input"');
    expect(source).toContain("Cancel placement");
    expect(source).toContain("Place blind corner");
  });
});
