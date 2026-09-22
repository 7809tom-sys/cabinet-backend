import { describe, expect, it } from "vitest";
import {
	makePeninsulaDrywallBackPonyWall,
  makePeninsulaPonyWall,
  peninsulaRunEndpoints,
  ponyWallFitsRoom,
  ponyWallPlanFrame,
  type PeninsulaRun,
  type RoomData,
} from "./design";

const primary: PeninsulaRun = {
  id: "peninsula-primary",
  parentWall: "top",
  startOffset: 72,
  turn: 90,
  direction: "right",
  length: 72,
  height: 34.5,
  label: "Peninsula · straight",
};

const return45: PeninsulaRun = {
  id: "peninsula-return-45",
  parentRunId: primary.id,
  startOffset: 0,
  turn: 45,
  direction: "right",
  length: 36,
  height: 34.5,
  label: "Peninsula end · 45° right",
};

const room: RoomData = {
  width: 180,
  depth: 180,
  ceilingHeight: 96,
  peninsulaRuns: [primary, return45],
};

describe("peninsula-attached pony walls", () => {
  it("snaps the pony wall to the final 45-degree peninsula endpoint", () => {
    const ponyWall = makePeninsulaPonyWall(return45, room, {
      width: 36,
      depth: 6,
      height: 34.5,
      label: "Pony wall · follows 45° right peninsula end",
    });
    const runEnd = peninsulaRunEndpoints(return45, room).end;
    const frame = ponyWallPlanFrame(ponyWall, room);

    expect(ponyWall.peninsulaRunId).toBe(return45.id);
    expect(ponyWall.peninsulaEnd).toBe("end");
    expect(frame.attachedToPeninsula).toBe(true);
    expect(frame.start).toEqual(runEnd);
    expect(frame.radians).toBeCloseTo(peninsulaRunEndpoints(return45, room).radians, 8);
    expect(ponyWallFitsRoom(ponyWall, room)).toBe(true);
  });

	  it("follows a changed parent attachment and length instead of retaining a loose screen position", () => {
    const ponyWall = makePeninsulaPonyWall(return45, room, { width: 24 });
    const movedPrimary = { ...primary, startOffset: 84, length: 60 };
    const movedRoom: RoomData = { ...room, peninsulaRuns: [movedPrimary, { ...return45, parentRunId: movedPrimary.id }] };

    const originalStart = ponyWallPlanFrame(ponyWall, room).start;
    const movedStart = ponyWallPlanFrame(ponyWall, movedRoom).start;

    expect(movedStart).toEqual(peninsulaRunEndpoints(movedRoom.peninsulaRuns![1]!, movedRoom).end);
    expect(movedStart).not.toEqual(originalStart);
	    expect(ponyWallFitsRoom(ponyWall, movedRoom)).toBe(true);
	  });

	  it("keeps a drywall pony wall directly behind the cabinet side and stretches it with the full peninsula run", () => {
	    const ponyWall = makePeninsulaDrywallBackPonyWall(primary, room, { depth: 4.5, height: 40 });
	    const frame = ponyWallPlanFrame(ponyWall, room);
	    const runFrame = peninsulaRunEndpoints(primary, room);
	    const leftNormal = { x: -Math.sin(runFrame.radians), y: Math.cos(runFrame.radians) };

	    expect(ponyWall.peninsulaPlacement).toBe("behind-cabinets");
	    expect(ponyWall.finish).toBe("drywall");
	    expect(frame.width).toBe(primary.length);
	    expect(frame.height).toBe(40);
	    expect(frame.start.x).toBeCloseTo(runFrame.start.x - leftNormal.x * ponyWall.depth / 2, 8);
	    expect(frame.start.y).toBeCloseTo(runFrame.start.y - leftNormal.y * ponyWall.depth / 2, 8);
	    expect(ponyWallFitsRoom(ponyWall, room)).toBe(true);

	    const extended = { ...primary, length: 84 };
	    const extendedRoom: RoomData = { ...room, peninsulaRuns: [extended, return45] };
	    expect(ponyWallPlanFrame(ponyWall, extendedRoom).width).toBe(84);
	  });

	  it("keeps a free-standing legacy pony wall independent of any peninsula run", () => {
    const frame = ponyWallPlanFrame({
      uid: "legacy-pony-wall",
      x: 24,
      y: 36,
      width: 48,
      depth: 6,
      height: 34.5,
    }, room);

    expect(frame.attachedToPeninsula).toBe(false);
    expect(frame.start).toEqual({ x: 24, y: 36 });
    expect(frame.end).toEqual({ x: 72, y: 36 });
  });
});
