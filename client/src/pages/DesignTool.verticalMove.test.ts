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

  it("commits horizontal D-pad movement exactly instead of snapping it back to the original seam", () => {
    const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
	    const callbackStart = source.indexOf("const moveCabinetFrom3D = useCallback");
	    const callbackSource = source.slice(callbackStart, callbackStart + 5200);
	    expect(callbackStart).toBeGreaterThan(-1);
	    expect(callbackSource).toContain("x: Math.round((cabinet.x + delta.x) * 8) / 8");
	    expect(callbackSource).not.toContain("snapCabinetSeamOverlap(");
	    expect(callbackSource).toContain("cannot move ${direction}; it would extend beyond the room boundary");
	    expect(callbackSource).toContain("shouldBlockPlacementCollision(candidate, peers, customPlacementMode)");
	  });

	  it("computes one synchronous host result, advances the live placement ref before rendering, and does not remount the 3D viewer for placement changes", () => {
	    const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
	    const callbackStart = source.indexOf("const moveCabinetFrom3D = useCallback");
	    const callbackSource = source.slice(callbackStart, callbackStart + 7000);
	    expect(callbackSource).toContain(": ThreeDCabinetMoveResult =>");
	    expect(callbackSource).toContain("const prev = placedRef.current;");
	    expect(callbackSource).toContain("placedRef.current = nextPlaced;");
	    expect(callbackSource.indexOf("placedRef.current = nextPlaced;")).toBeLessThan(callbackSource.indexOf("setPlaced(nextPlaced);"));
	    expect(callbackSource).toContain('status: "moved"');
	    expect(callbackSource).toContain('status: "blocked"');
	    expect(source).not.toContain("key={interactive3dRevision}");
	    expect(source).not.toContain("const interactive3dRevision = useMemo");
	  });
});
