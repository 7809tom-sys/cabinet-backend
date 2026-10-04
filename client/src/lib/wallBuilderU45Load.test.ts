import { describe, expect, it } from "vitest";
import draft from "./fixtures/wallBuilderU45Draft.json";
import {
  backfillLegacyWallRuns,
  clampCabinetsToRoom,
  normalizeBlindCornerDoorSides,
  normalizeLCornerDepths,
  normalizeLegacyPeninsulaCabinets,
  removeOverlappingPlacements,
} from "./design";

describe("Wall Builder U-shape with 45-degree leg: restore keeps every cabinet", () => {
  it("loads all 7 cabinets and does not move already-seated ones", () => {
    const room: any = (draft as any).room;
    const input: any[] = (draft as any).placed;
    const repaired = clampCabinetsToRoom(
      backfillLegacyWallRuns(
        normalizeLegacyPeninsulaCabinets(normalizeBlindCornerDoorSides(normalizeLCornerDepths(input), room), room),
        room,
      ),
      room,
    );
    for (const c of repaired) {
      const o = input.find((x) => x.uid === c.uid);
      expect(Math.abs(c.x - o.x)).toBeLessThan(1e-3);
      expect(Math.abs(c.y - o.y)).toBeLessThan(1e-3);
    }
    const swept = removeOverlappingPlacements(repaired, room);
    expect(swept.rejected).toEqual([]);
    expect(swept.placed).toHaveLength(7);
  });
});
