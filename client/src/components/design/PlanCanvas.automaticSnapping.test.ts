import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/components/design/PlanCanvas.tsx"), "utf8");

describe("PlanCanvas automatic replacement placement", () => {
  it("uses the explicit toolbar snapping choice rather than an incidental Shift key for catalog drops", () => {
    expect(source).toContain("automaticSnapping = true");
    expect(source).toContain("setCatalogDragFreehand(!automaticSnapping)");
    expect(source).toContain("onDropNew(e.clientX, e.clientY, roomEl.getBoundingClientRect(), ppi, !automaticSnapping)");
  });

  it("labels the entire highlighted opening with its clear measured span", () => {
	    expect(source).toContain('data-testid="catalog-drag-clear-span"');
	    expect(source).toContain("Clear span · {formatEighthInches(gap.length)}");
	  });

	  it("recommends the largest compatible exact catalog fit and makes an undersized opening visibly red", () => {
	    expect(source).toContain('data-testid="catalog-drag-best-fit"');
	    expect(source).toContain("Perfect fit · ${suggestedFit.cabinet.masterCode}");
	    expect(source).toContain('data-testid="catalog-drag-too-large"');
	    expect(source).toContain('data-too-large={tooLarge ? "true" : "false"}');
	  });
});
