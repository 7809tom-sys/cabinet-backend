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
});
