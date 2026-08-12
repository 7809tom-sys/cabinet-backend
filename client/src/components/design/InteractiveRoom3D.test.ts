import { describe, expect, it } from "vitest";
import { dimensions, existingCabinetTransform, sceneCabinetColor, type InteractiveRoomScene } from "./InteractiveRoom3D";

const baseScene: InteractiveRoomScene = {
  roomShape: { id: "l_shape", name: "L-Shape", defaultDimensions: { width: 156, depth: 144, ceilingHeight: 96 }, geometryTemplate: { vertices: [] } },
  layout: { id: "kitchen_l_standard", name: "Standard L Kitchen" },
  suggestions: [],
  materials: { cabinet: { publicName: null, name: "Sample", color: null, finish: null, doorStyle: null, doorPanelType: null }, defaults: { floor: "#b89778", countertop: "#e9e7e2", backsplash: "#d9d5cc", wall: "#efece6" } },
};

describe("interactive 3D room scene helpers", () => {
  it("reads seeded room dimensions while preserving safe defaults", () => {
    expect(dimensions({ width: 156, depth: 144, ceilingHeight: 96 })).toEqual({ width: 156, depth: 144, ceilingHeight: 96 });
    expect(dimensions({ width: 0 })).toEqual({ width: 144, depth: 120, ceilingHeight: 96 });
  });

  it("uses a verified hex style color before applying finish-name fallbacks", () => {
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "#1a2744" } } })).toBe("#1a2744");
    expect(sceneCabinetColor({ ...baseScene, materials: { ...baseScene.materials!, cabinet: { ...baseScene.materials!.cabinet, color: "Sage", finish: "Painted" } } })).toBe("#78826b");
  });

  it("preserves a placed cabinet’s current 2D location and wall mounting height", () => {
    expect(existingCabinetTransform({
      uid: "wall-1", cabinetId: 10, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 24, y: 0, width: 30, depth: 12, height: 30, rotation: 0, mountBottom: 60,
    })).toEqual({ x: 39, z: 6, rotation: 0, bottom: 60 });
  });
});
