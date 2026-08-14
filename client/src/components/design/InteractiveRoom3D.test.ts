import { describe, expect, it } from "vitest";
import { dimensions, doorProfileKind, existingCabinetTransform, openingTransform, quoteMaterialDetails, resolvedCatalogFinish, resolvedThreeDDoorSampleUrl, resolvedThreeDFaceLayout, sceneCabinetColor, shouldRenderPlacedDesign, THREE_D_EXPORT_SIZE, type InteractiveRoomScene } from "./InteractiveRoom3D";

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

  it("uses the active catalog door-style finish when scene metadata is sparse", () => {
    expect(resolvedCatalogFinish(baseScene, "#49604a")).toBe("#49604a");
    expect(resolvedCatalogFinish(baseScene, "Aero Sage")).toBe(sceneCabinetColor(baseScene));
  });

  it("carries the exact selected 2D door sample into catalog-finish 3D cabinet faces", () => {
    expect(resolvedThreeDDoorSampleUrl("catalog", "/manus-storage/silva-shaker.png")).toBe("/manus-storage/silva-shaker.png");
    expect(resolvedThreeDDoorSampleUrl("#75523e", "/manus-storage/silva-shaker.png")).toBeNull();
    expect(resolvedThreeDDoorSampleUrl("#75523e", "/manus-storage/silva-shaker.png", true)).toBe("/manus-storage/silva-shaker.png");
  });

  it("renders placed 2D cabinets instead of starter suggestions whenever a design exists", () => {
    expect(shouldRenderPlacedDesign([])).toBe(false);
    expect(shouldRenderPlacedDesign([{ uid: "base-1" } as never])).toBe(true);
  });

  it("preserves a placed cabinet’s current 2D location and wall mounting height", () => {
    expect(existingCabinetTransform({
      uid: "wall-1", cabinetId: 10, masterCode: "W3030", description: "Wall Cabinet", placement: "wall",
      x: 24, y: 0, width: 30, depth: 12, height: 30, rotation: 0, mountBottom: 60,
    })).toEqual({ x: 39, z: 6, rotation: 0, bottom: 60 });
  });

  it("preserves a BMC microwave base's configured top opening, zero doors, and one drawer in 3D", () => {
    expect(resolvedThreeDFaceLayout({
      placementType: "base",
      openingType: "top",
      numberOfDoors: 0,
      numberOfDrawers: 1,
    })).toEqual({ hasConfiguredOpening: true, doorCount: 0, drawerCount: 1 });
  });

  it("places a saved 2D window at its exact wall offset in the 3D room", () => {
    expect(openingTransform({
      uid: "window-1", kind: "window", label: "Window", side: "top", offset: 42, width: 36, height: 36, sill: 42,
    }, 144, 120)).toEqual({ x: 60, z: 0.06, rotation: 0 });
  });

  it("uses a high-resolution PNG export size suitable for design sharing", () => {
    expect(THREE_D_EXPORT_SIZE).toEqual({ width: 2000, height: 1400 });
  });

  it("writes the active catalog cabinet and countertop names when quote previews stay at their defaults", () => {
    expect(quoteMaterialDetails({
      cabinetPreview: "Catalog finish",
      countertopPreview: "Quartz",
      catalogFinishName: "Aero Sage (Preston)",
      catalogCountertopName: "Pelican Calacatta Laza Quartz",
    })).toEqual({ cabinet: "Aero Sage (Preston)", countertop: "Pelican Calacatta Laza Quartz" });
  });

  it("recognizes Shaker, raised-panel, and flat-panel cabinet door geometry", () => {
    expect(doorProfileKind("Shaker", null)).toBe("shaker");
    expect(doorProfileKind("Raised Panel", null)).toBe("raised");
    expect(doorProfileKind("Slab", "Flat Panel")).toBe("flat");
  });
});
