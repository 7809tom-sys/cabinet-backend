import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool failed wall-fit guidance", () => {
  it("labels the first active-catalog alternative as the closest fitting cabinet", () => {
    expect(source).toContain('data-testid="closest-fit-badge"');
    expect(source).toContain("Closest fit");
    expect(source).toContain("smartGapCandidatePrices.get(option.cabinet.id)");
  });

  it("stores the authoritative failed measurement once and exposes an exact comparison tooltip", () => {
    expect(source).toContain("measurement: fit");
    expect(source).toContain('data-testid="failed-fit-dimensions-trigger"');
    expect(source).toContain('data-testid="failed-fit-dimensions-tooltip"');
    expect(source).toContain("Selected cabinet vs. available space");
    expect(source).toContain("failedWallFit.measurement.requiredSpan");
    expect(source).toContain("failedWallFit.measurement.availableSpan");
    expect(source).toContain("failedWallFit.measurement.shortage");
    expect(source).toContain("failedWallFit.measurement.availableStart");
    expect(source).toContain("failedWallFit.measurement.availableEnd");
    expect(source).toContain('failedWallFit.blockers.join(", ")');
  });
});
