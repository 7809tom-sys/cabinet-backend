import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool direct corner cabinet drops", () => {
  it("routes a dropped ERB36 through the nearest real measured-corner resolver instead of raw X/Y placement", () => {
    const start = source.indexOf("const handleDropNew = useCallback");
    const end = source.indexOf("const placePeninsulaFitRecommendation", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handler = source.slice(start, end);

    expect(handler).toContain("const requiresRoomCorner = !forceAccessory");
    expect(handler).toContain("isCornerCabinet(data.masterCode, data.description)");
    expect(handler).toContain("nextAvailableRoomCornerPlacement({");
    expect(handler).toContain("}, dropWall, room, placedRef.current, center)");
    expect(handler).toContain("corner-drop-preview-${data.id}");
    expect(handler).toContain("wallId: cornerSpot.wallId as WallSide");
    expect(handler).toContain("wallOffset: cornerSpot.wallOffset ?? 0");
  });

  it("aligns a selected wall cabinet directly above the selected ERB36 corner base", () => {
    const addStart = source.indexOf("const addCabinet = useCallback");
    const addEnd = source.indexOf("const addManualFiller", addStart);
    expect(addStart).toBeGreaterThan(-1);
    expect(addEnd).toBeGreaterThan(addStart);
    const addPath = source.slice(addStart, addEnd);

    expect(addPath).toContain("selectedCornerBaseWallPlacement(selectedLowerTarget, room, width, depth, height, prev, openings)");
    expect(addPath).toContain("} else if (selectedCornerUpperSpot) {");
    expect(addPath).toContain("spot = selectedCornerUpperSpot;");
    expect(addPath).toContain("aligned directly above ${selectedCornerBaseTarget.masterCode}'s corner");
  });

  it("shows a dedicated warning tooltip when a snapped blind corner is protected", () => {
    expect(source).toContain('data-testid="blind-corner-protection-tooltip"');
    expect(source).toContain("Blind corner is locked — its required filler and adjoining leg stay protected.");
    expect(source).toContain("(?:BBC|WBC|BBL|BBR|WBL|WBR)");
  });
});
