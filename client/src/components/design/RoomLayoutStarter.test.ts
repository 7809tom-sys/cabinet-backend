import { describe, expect, it } from "vitest";
import { roomFromSeededShape } from "./RoomLayoutStarter";

describe("roomFromSeededShape", () => {
  it("keeps the seeded rectangle in the standard RoomData format", () => {
    const room = roomFromSeededShape({
      id: "rectangle",
      roomType: "kitchen",
      name: "Rectangle",
      description: null,
      geometryTemplate: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
      defaultDimensions: { width: 144, depth: 120, ceilingHeight: 96 },
    });
    expect(room).toMatchObject({ width: 144, depth: 120, ceilingHeight: 96 });
    expect(room.vertices).toBeUndefined();
  });

  it("turns a seeded L-shape template into a scaled editable polygon", () => {
    const room = roomFromSeededShape({
      id: "l_shape",
      roomType: "kitchen",
      name: "L-Shape",
      description: null,
      geometryTemplate: {
        vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }],
        walls: ["back", "right", "inside-a", "inside-b", "left", "front"],
      },
      defaultDimensions: { width: 156, depth: 144, ceilingHeight: 96 },
    });
    expect(room.vertices).toHaveLength(6);
    expect(room.customWalls).toHaveLength(6);
    expect(room.vertices?.[2]).toMatchObject({ x: 156, y: 72 });
  });
});
