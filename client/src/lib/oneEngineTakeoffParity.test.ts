import { describe, expect, it } from "vitest";
import { appendWallBuilderSegment, wallBuilderRoomGeometry, type WallBuilderSegment } from "./polygonRoom";
import { threeDCrownPerimeterSegments } from "@/components/design/InteractiveRoom3D";
import { crownTakeoffFromExposedSegments } from "./crownTakeoff";
import {
  cabinetTakeoffWallId, crownLinearInches, lightRailTakeoff, syncWallRunOffsets,
  toeKickLinearInches, wallCabinetVerticalMoveLimit, wallCeiling, wallPlacementAt,
  type PlacedCabinet, type RoomData,
} from "./design";

function drawnRoom(turn: "right90" | "right45" = "right90"): RoomData {
  let segments: WallBuilderSegment[] = [];
  segments = appendWallBuilderSegment(segments, 100, "start");
  segments = appendWallBuilderSegment(segments, 60, turn);
  const result = wallBuilderRoomGeometry(segments);
  if (!result.room) throw new Error(result.error ?? "invalid room");
  return { ...result.room, ceilingHeight: 96 };
}
function cabinet(room: RoomData, wall: string, code: string, placement: "base" | "wall", width: number, depth: number, offset = 25): PlacedCabinet {
  const spot = wallPlacementAt(offset, width, depth, wall as never, room);
  return { ...spot, uid: `${code}-${offset}`, cabinetId: 1, masterCode: code, description: code,
    placement, width, depth, height: placement === "wall" ? 30 : 34.5 };
}
const STANDARD: RoomData = { width: 100, depth: 120, ceilingHeight: 96 };
const DRAWN = drawnRoom();
const ROOMS = [["standard", STANDARD, "top"], ["drawn", DRAWN, DRAWN.customWalls![0]!.id]] as const;

describe("Phase 2 shared takeoffs when wall seating metadata is cleared", () => {
  it("production crown, toe kick, and light rail totals match on rotated and inward-moved cabinets", () => {
    const totals = ROOMS.map(([, room, wall]) => {
      const upper = cabinet(room, wall, "W3030", "wall", 30, 12);
      const base = cabinet(room, wall, "B36", "base", 36, 24, 60);
      const states = [
        syncWallRunOffsets([{ ...upper, rotation: 90 }, { ...base, rotation: 45 }], room),
        syncWallRunOffsets([{ ...upper, y: upper.y + 1 }, { ...base, y: base.y + 1 }], room),
      ];
      return states.map(([w, b]) => ({
        crown: crownTakeoffFromExposedSegments(threeDCrownPerimeterSegments([w!], room)).totalLinearInches,
        crownWidthEstimate: crownLinearInches([w!], room),
        toeKick: toeKickLinearInches([b!]),
        lightRail: lightRailTakeoff([w!], room).totalLinearInches,
      }));
    });
    expect(totals[1]).toEqual(totals[0]);
    for (const row of totals[0]!) {
      expect(row).toMatchObject({ crownWidthEstimate: 33, toeKick: 36, lightRail: 58 });
      expect(row.crown).toBeGreaterThan(0);
    }
  });
  for (const [label, room, wall] of ROOMS) {
    it(`${label}: rotated W3030 still counts 30 crown, 30+24 light rail; rotated B36 still counts 36 toe kick`, () => {
      const upper = cabinet(room, wall, "W3030", "wall", 30, 12);
      const base = cabinet(room, wall, "B36", "base", 36, 24, 60);
      const [rotatedUpper, rotatedBase] = syncWallRunOffsets([
        { ...upper, rotation: 90 }, { ...base, rotation: 45 },
      ], room);
      expect(rotatedUpper!.wallId).toBeUndefined();
      expect(rotatedBase!.wallId).toBeUndefined();
      expect(cabinetTakeoffWallId(rotatedUpper!, room)).toBe(wall);
      expect(crownLinearInches([rotatedUpper!], room)).toBe(33);
      const renderedCrown = crownTakeoffFromExposedSegments(threeDCrownPerimeterSegments([rotatedUpper!], room));
      expect(renderedCrown.totalLinearInches).toBeGreaterThan(0);
      expect(toeKickLinearInches([rotatedBase!])).toBe(36);
      expect(lightRailTakeoff([rotatedUpper!], room)).toMatchObject({
        exposedLinearInches: 54, installationAllowanceInches: 4, totalLinearInches: 58, assemblies: 1,
      });
    });
    it(`${label}: W3030 and B36 pulled 1 inch from the wall retain their material takeoff, not stale wall seating`, () => {
      const upper = cabinet(room, wall, "W3030", "wall", 30, 12);
      const base = cabinet(room, wall, "B36", "base", 36, 24, 60);
      const [movedUpper, movedBase] = syncWallRunOffsets([
        { ...upper, y: upper.y + 1 }, { ...base, y: base.y + 1 },
      ], room);
      expect(movedUpper!.wallId).toBeUndefined();
      expect(movedBase!.wallId).toBeUndefined();
      expect(cabinetTakeoffWallId(movedUpper!, room)).toBe(wall);
      expect(crownLinearInches([movedUpper!], room)).toBe(33);
      const renderedCrown = crownTakeoffFromExposedSegments(threeDCrownPerimeterSegments([movedUpper!], room));
      expect(renderedCrown.totalLinearInches).toBeGreaterThan(0);
      expect(toeKickLinearInches([movedBase!])).toBe(36);
      expect(lightRailTakeoff([movedUpper!], room)).toMatchObject({
        exposedLinearInches: 54, installationAllowanceInches: 4, totalLinearInches: 58, assemblies: 1,
      });
    });
    it(`${label}: seated adjacent W3030s share a side and each B36 counts catalog width`, () => {
      const uppers = [cabinet(room, wall, "W3030", "wall", 30, 12, 0), cabinet(room, wall, "W3030", "wall", 30, 12, 30)];
      const bases = [cabinet(room, wall, "B36", "base", 36, 24, 0), cabinet(room, wall, "B36", "base", 36, 24, 36)];
      expect(crownLinearInches(uppers, room)).toBe(63);
      expect(toeKickLinearInches(bases)).toBe(72);
      expect(lightRailTakeoff(uppers, room)).toMatchObject({ exposedLinearInches: 84, installationAllowanceInches: 4, totalLinearInches: 88, assemblies: 1 });
    });
  }
  it("catalog B36 at a 45° run counts 36 inches of toe kick, not the rotated bounding box", () => {
    const room = drawnRoom("right45");
    const wall = room.customWalls![1]!.id;
    const b36 = cabinet(room, wall, "B36", "base", 36, 24, 11);
    expect(toeKickLinearInches([b36])).toBe(36);
  });
  it("a drawn wall's own 108-inch height governs wall ceiling and upper vertical limit", () => {
    const room = drawnRoom();
    const wall = room.customWalls![0]!;
    wall.height = 108;
    const upper = cabinet(room, wall.id, "W3030", "wall", 30, 12);
    expect(wallCeiling(room, wall.id as never)).toEqual({ high: 108, low: 108 });
    expect(wallCabinetVerticalMoveLimit(upper, room).ceiling).toBe(108);
  });
});
