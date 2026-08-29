import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Design Tool vertical wall-cabinet movement", () => {
  it("repairs a pointer-near wall-run seam before validating an up or down move", () => {
    const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
    expect(source).toContain("repairWallCabinetPlanSeamForVerticalMove");
    const repairCall = "repairWallCabinetPlanSeamForVerticalMove({ ...cabinet, mountBottom: nextBottom }, room, peers, openings)";
    const repairIndex = source.indexOf(repairCall);
    expect(repairIndex).toBeGreaterThan(-1);
    const verticalMoveCallback = source.slice(repairIndex, repairIndex + 2400);
    expect(verticalMoveCallback).toContain("shouldBlockPlacementCollision(candidate, peers, customPlacementMode)");
    expect(verticalMoveCallback.indexOf(repairCall)).toBeLessThan(
      verticalMoveCallback.indexOf("shouldBlockPlacementCollision(candidate, peers, customPlacementMode)"),
    );
  });
});
