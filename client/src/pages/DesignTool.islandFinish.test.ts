import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("DesignTool island finish routing", () => {
  it("routes Island setup through valid finish options and the island-only scope", () => {
    expect(source).toContain("cabinetFinishOptions={islandCabinetFinishOptions}");
    expect(source).toContain('applyCabinetFinishScope(resized.placed, nextIsland, styleId, draft.cabinetStyleId ?? styleId, "island")');
    expect(source).toContain("if (islandForPlacement.cabinetStyleId != null) newCab.styleId = islandForPlacement.cabinetStyleId");
  });

  it("asks perimeter Apply to all users whether to preserve or include the island", () => {
    expect(source).toContain("Where should this cabinet color be applied?");
    expect(source).toContain('data-testid="apply-finish-non-island-only"');
    expect(source).toContain('commitSelectedFinishScope(finishApplyScopePrompt.targetStyleId, "non-island")');
    expect(source).toContain('data-testid="apply-finish-include-island"');
    expect(source).toContain('commitSelectedFinishScope(finishApplyScopePrompt.targetStyleId, "all")');
  });
});
