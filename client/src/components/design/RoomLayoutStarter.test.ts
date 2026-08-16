import { describe, expect, it } from "vitest";
import { GUIDED_ROOM_WORKFLOW_STEPS, guidedRoomWorkflowStepState, numberedLayoutTile, roomFromSeededShape, type SeededLayout } from "./RoomLayoutStarter";

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

  it("keeps the guided flow in floorplan, layout, design, summary order", () => {
    expect(GUIDED_ROOM_WORKFLOW_STEPS.map(({ label }) => label)).toEqual(["Floorplan", "Pick a layout", "Design your kitchen", "Summary"]);
    expect(guidedRoomWorkflowStepState(3, 2)).toEqual({ active: false, complete: true });
    expect(guidedRoomWorkflowStepState(3, 3)).toEqual({ active: true, complete: false });
    expect(guidedRoomWorkflowStepState(3, 4)).toEqual({ active: false, complete: false });
  });

  it("gives real layouts stable one-based tile numbers", () => {
    const layouts: SeededLayout[] = [
      { id: "one-wall", roomShapePresetId: "rectangle", name: "One-Wall", description: null, minimumWidth: 96, minimumDepth: 96 },
      { id: "l-kitchen", roomShapePresetId: "rectangle", name: "L Kitchen", description: null, minimumWidth: 120, minimumDepth: 120 },
    ];
    expect(numberedLayoutTile(layouts, "one-wall")).toBe(1);
    expect(numberedLayoutTile(layouts, "l-kitchen")).toBe(2);
    expect(numberedLayoutTile(layouts, "missing")).toBeNull();
  });
});
