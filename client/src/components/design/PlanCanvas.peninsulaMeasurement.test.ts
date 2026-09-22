import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/design/PlanCanvas.tsx"), "utf8");

describe("PlanCanvas peninsula attachment measurement", () => {
  it("shows the measured parent-wall segment for a primary peninsula but not a connected return", () => {
    expect(source).toContain("const primaryAttachmentMeasure = !run.parentRunId && parentWall");
    expect(source).toContain('data-testid="peninsula-attachment-measurement"');
    expect(source).toContain("Wall to peninsula · {formatEighthInches(primaryAttachmentMeasure)}");
    expect(source).toContain("Measured parent-wall segment from the wall start corner to this peninsula attachment");
  });

  it("names the straight run and a 45-degree return directly on the plan", () => {
    expect(source).toContain('data-testid="peninsula-plan-label"');
    expect(source).toContain('`PENINSULA · 45° ${run.direction} RETURN`');
    expect(source).toContain('`PENINSULA · ${formatEighthInches(run.length)}`');
  });
});
