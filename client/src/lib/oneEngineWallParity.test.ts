import { describe, expect, it } from "vitest";
import { appendWallBuilderSegment, wallBuilderRoomGeometry, type WallBuilderSegment } from "./polygonRoom";
import {
  cabinetWallMovePreview,
  placedPlanCenter,
  roundToEighth,
  seatedWallRunFrame,
  wallPlacementAt,
  wallRunDistanceToPoint,
  wallRunFrame,
  type PlacedCabinet,
  type RoomData,
} from "./design";

function drawnRoom(): RoomData {
  let segments: WallBuilderSegment[] = [];
  segments = appendWallBuilderSegment(segments, 100, "start");
  segments = appendWallBuilderSegment(segments, 60, "right90");
  const result = wallBuilderRoomGeometry(segments);
  if (!result.room) throw new Error(result.error ?? "Expected a measured room path");
  return { ...result.room, ceilingHeight: 96 };
}

/**
 * Phase 1 of the one-system rule: the Continuous Wall Builder and the 3D
 * Designer share ONE wall-run model and ONE along-wall engine. The standard
 * room's top wall is a 100" run; the drawn room's first wall is the same 100"
 * run. Offsets, seam snapping, 1/8" rounding, magnet reach and failures must
 * agree exactly because they are the same engine call.
 */
describe("Phase 1 one-engine parity: B12, B36, W3030 on a standard wall and a Wall Builder wall", () => {
  const STANDARD: RoomData = { width: 100, depth: 120, ceilingHeight: 96 };
  const DRAWN = drawnRoom();
  const drawnWall = DRAWN.customWalls![0]!.id;
  const ROOMS = [
    ["standard room", STANDARD, "top"],
    ["Wall Builder room", DRAWN, drawnWall],
  ] as const;
  const SAMPLES = [
    { code: "B12", placement: "base" as const, width: 12, depth: 24, height: 34.5 },
    { code: "B36", placement: "base" as const, width: 36, depth: 24, height: 34.5 },
    { code: "W3030", placement: "wall" as const, width: 30, depth: 12, height: 30 },
  ];
  type Sample = typeof SAMPLES[number];
  const seat = (sample: Sample, room: RoomData, wall: string, along: number, uid = sample.code): PlacedCabinet => {
    const spot = wallPlacementAt(along, sample.width, sample.depth, wall as never, room);
    return {
      uid,
      cabinetId: 1,
      masterCode: sample.code,
      description: sample.code,
      placement: sample.placement,
      x: spot.x,
      y: spot.y,
      width: sample.width,
      depth: sample.depth,
      height: sample.height,
      rotation: spot.rotation,
      wallId: spot.wallId,
      wallOffset: spot.wallOffset,
    };
  };
  const summary = (cabinet: PlacedCabinet | null, room: RoomData) => {
    if (!cabinet) return null;
    const frame = seatedWallRunFrame(cabinet, room);
    return {
      wallOffset: roundToEighth(cabinet.wallOffset ?? Number.NaN),
      width: cabinet.width,
      depth: cabinet.depth,
      height: cabinet.height,
      seated: Boolean(frame),
      // Distance from the body centre to the wall line: exactly half the depth
      // means the back is flush to the wall.
      inset: frame ? roundToEighth(wallRunDistanceToPoint(frame, placedPlanCenter(cabinet))) : null,
    };
  };

  it.each(SAMPLES)("$code: a standard wall carries the same wallId/wallOffset run model as a drawn wall", (sample) => {
    const standard = wallPlacementAt(24, sample.width, sample.depth, "top", STANDARD);
    const drawn = wallPlacementAt(24, sample.width, sample.depth, drawnWall as never, DRAWN);
    expect(standard).toMatchObject({ wallId: "top", wallOffset: 24 });
    expect(drawn).toMatchObject({ wallId: drawnWall, wallOffset: 24 });
    expect(wallRunFrame("top", STANDARD)).toMatchObject({ kind: "cardinal", length: 100 });
    expect(wallRunFrame(drawnWall, DRAWN)).toMatchObject({ kind: "custom", length: 100 });
  });

  it.each(SAMPLES)("$code: drag magnet, exact drag, nudge and run-end clamp give identical 1/8-inch offsets in both rooms", (sample) => {
    const results = ROOMS.map(([label, room, wall]) => {
      const frame = wallRunFrame(wall, room)!;
      // Same-layer neighbour: a base beside bases, an upper beside uppers.
      const neighbour = sample.placement === "wall"
        ? seat({ code: "W2430", placement: "wall", width: 24, depth: 12, height: 30 }, room, wall, 0, "neighbour")
        : seat({ code: "B24", placement: "base", width: 24, depth: 24, height: 34.5 }, room, wall, 0, "neighbour");
      const mover = seat(sample, room, wall, 60);
      // Drag request: body 2.3" past the neighbour's end along the run.
      const requestedAlong = 24 + 2.3;
      const point = {
        x: frame.start.x + frame.tangent.x * (requestedAlong + sample.width / 2) + frame.inward.x * (sample.depth / 2) - sample.width / 2,
        y: frame.start.y + frame.tangent.y * (requestedAlong + sample.width / 2) + frame.inward.y * (sample.depth / 2) - sample.depth / 2,
      };
      const drag = cabinetWallMovePreview(mover, point, room, [neighbour], [], { magnet: true, seamToleranceIn: 0.5 });
      const exact = cabinetWallMovePreview(mover, point, room, [neighbour], [], { magnet: false, exact: true });
      const nudge = cabinetWallMovePreview(mover, { x: mover.x, y: mover.y }, room, [neighbour], [], { magnet: false, exact: true, target: { wallId: wall, wallOffset: 60.125 } });
      const end = cabinetWallMovePreview(mover, { x: mover.x, y: mover.y }, room, [neighbour], [], { magnet: false, exact: true, target: { wallId: wall, wallOffset: 500 } });
      return {
        label,
        drag: { failure: drag.failure, ...summary(drag.candidate, room) },
        exact: summary(exact.candidate, room),
        nudge: summary(nudge.candidate, room),
        end: summary(end.candidate, room),
      };
    });
    const [standard, drawn] = results;
    // Magnet: 2.3" from the neighbour is within reach; seats flush at 24".
    expect(standard!.drag).toEqual({ failure: null, wallOffset: 24, width: sample.width, depth: sample.depth, height: sample.height, seated: true, inset: sample.depth / 2 });
    // Exact drag keeps the 1/8" grid: 26.3 → 26.25.
    expect(standard!.exact?.wallOffset).toBe(26.25);
    // Nudge: explicit +1/8" from 60.
    expect(standard!.nudge?.wallOffset).toBe(60.125);
    // Run end: overshoot clamps to length - width.
    expect(standard!.end?.wallOffset).toBe(100 - sample.width);
    // And the Wall Builder room is identical in every measured value.
    expect({ ...drawn!, label: "x" }).toEqual({ ...standard!, label: "x" });
  });

  it("both rooms report the same failure when the run has no clear opening", () => {
    const results = ROOMS.map(([, room, wall]) => {
      const filled = [0, 36, 64].map((along, index) => seat(SAMPLES[1]!, room, wall, along, `fill-${index}`));
      const mover = seat(SAMPLES[1]!, room, wall, 0, "mover");
      const result = cabinetWallMovePreview(mover, { x: mover.x, y: mover.y }, room, filled, [], { magnet: true, wallId: wall });
      return { candidate: result.candidate, failure: result.failure };
    });
    expect(results[0]).toEqual({ candidate: null, failure: "no-opening" });
    expect(results[1]).toEqual(results[0]);
  });

  it("a floor cabinet dragged beyond the 6-inch wall magnet stays free-floating in both rooms (standard-room behaviour preserved)", () => {
    for (const [, room, wall] of ROOMS) {
      const frame = wallRunFrame(wall, room)!;
      const mover = seat(SAMPLES[1]!, room, wall, 30);
      // 40" into the room from the wall line: clearly off the wall.
      const point = { x: mover.x + frame.inward.x * 40, y: mover.y + frame.inward.y * 40 };
      const result = cabinetWallMovePreview(mover, point, room, [], [], { magnet: true });
      expect(result.candidate).toBeNull();
      expect(result.failure).toBe("no-wall");
    }
  });
});
