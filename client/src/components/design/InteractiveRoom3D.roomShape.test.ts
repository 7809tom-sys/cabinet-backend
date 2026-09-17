import { describe, expect, it } from "vitest";
import { activeThreeDRoomGeometry, type InteractiveRoomScene } from "./InteractiveRoom3D";

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
});
