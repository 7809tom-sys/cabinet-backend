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
});
