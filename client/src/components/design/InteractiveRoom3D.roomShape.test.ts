import { describe, expect, it } from "vitest";
import { activeThreeDRoomGeometry, openingTransform, type InteractiveRoomScene } from "./InteractiveRoom3D";
import type { RoomData, WallOpening } from "@/lib/design";

const lSceneShape: NonNullable<InteractiveRoomScene["roomShape"]> = {
  id: "l_shape",
  name: "L-Shape",
  defaultDimensions: { width: 156, depth: 144, ceilingHeight: 96 },
  geometryTemplate: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }] },
};

describe("active 2D room geometry in 3D", () => {
  it("keeps a normal current room rectangular even if the prior starter layout was L-shaped", () => {
    expect(activeThreeDRoomGeometry({ width: 144, depth: 120 }, lSceneShape)).toBeNull();
  });

  it("uses explicitly persisted polygon vertices for a customer-defined L-shaped room", () => {
    const vertices = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 144, y: 0 }, { id: "c", x: 144, y: 60 }, { id: "d", x: 60, y: 60 }, { id: "e", x: 60, y: 120 }, { id: "f", x: 0, y: 120 }];
    expect(activeThreeDRoomGeometry({ width: 144, depth: 120, vertices }, lSceneShape)).toEqual({ vertices });
  });

  it("does not turn an open connected wall path into a falsely closed 3D floor polygon", () => {
    const vertices = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 101, y: 0 }, { id: "c", x: 156.1543, y: 55.1543 }];
    expect(activeThreeDRoomGeometry({ width: 156.1543, depth: 55.1543, vertices, openWallPath: true }, lSceneShape)).toBeNull();
  });

	  it("places and faces an opening on its exact custom wall instead of the rectangular room bound", () => {
	    const room: RoomData = {
	      width: 156.154,
	      depth: 55.154,
	      ceilingHeight: 96,
	      openWallPath: true,
	      vertices: [
	        { id: "a", x: 0, y: 0 },
	        { id: "b", x: 101, y: 0 },
	        { id: "c", x: 156.154, y: 55.154 },
	      ],
	      customWalls: [
	        { id: "wall-1", startVertexId: "a", endVertexId: "b", label: "Wall 1" },
	        { id: "wall-2", startVertexId: "b", endVertexId: "c", label: "Wall 2", lockedAngle: 45 },
	      ],
	    };
	    const opening = {
	      uid: "opening-1",
	      kind: "door",
	      label: "Door 36\"",
	      side: "wall-2" as any,
	      offset: 12,
	      width: 36,
	      height: 80,
	      sill: 0,
	    } satisfies WallOpening;

	    const transform = openingTransform(opening, room);
	    expect(transform.x).toBeCloseTo(122.171, 3);
	    expect(transform.z).toBeCloseTo(21.256, 3);
	    expect(transform.rotation).toBeCloseTo(Math.PI * 7 / 4, 5);
	  });
});
