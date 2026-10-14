import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOW_SCENE_KIND, windowFrameColor, windowSceneAssetUrl, WINDOW_SCENE_ASSETS, WINDOW_SCENE_SOURCES } from "./InteractiveRoom3D";

describe("Designer window scenes", () => {
  it("maps the real reference scenes to stored photographic assets", () => {
    expect(DEFAULT_WINDOW_SCENE_KIND).toBe("garden");
    expect(windowSceneAssetUrl("garden")).toBe(WINDOW_SCENE_ASSETS.garden);
    expect(windowSceneAssetUrl("woodland")).toBe(WINDOW_SCENE_ASSETS.woodland);
    expect(windowSceneAssetUrl("coastal")).toBe(WINDOW_SCENE_ASSETS.coastal);
    expect(windowSceneAssetUrl("urban")).toBe(WINDOW_SCENE_ASSETS.urban);
    expect(windowSceneAssetUrl("mountain")).toBe(WINDOW_SCENE_ASSETS.mountain);
    expect(windowSceneAssetUrl("night")).toBe(WINDOW_SCENE_ASSETS.night);
    expect(windowSceneAssetUrl("city-skyline")).toBe(WINDOW_SCENE_ASSETS["city-skyline"]);
    expect(windowSceneAssetUrl("desert")).toBe(WINDOW_SCENE_ASSETS.desert);
    expect(windowSceneAssetUrl("snow")).toBe(WINDOW_SCENE_ASSETS.snow);
    expect(WINDOW_SCENE_ASSETS.garden).toMatch(/garden-outdoor_.*\.jpg$/);
    expect(WINDOW_SCENE_ASSETS.woodland).toMatch(/woodland-outdoor_.*\.jpg$/);
    expect(WINDOW_SCENE_ASSETS.coastal).toMatch(/coastal-outdoor_.*\.jpg$/);
    expect(WINDOW_SCENE_SOURCES.garden.license).toBe("CC BY-SA 4.0");
    expect(WINDOW_SCENE_SOURCES.woodland.license).toBe("CC0 1.0");
    expect(WINDOW_SCENE_SOURCES.coastal.license).toBe("CC BY-SA 2.0");
    expect(WINDOW_SCENE_SOURCES["city-skyline"].license).toBe("Unsplash License");
    expect(WINDOW_SCENE_SOURCES.desert.license).toBe("Unsplash License");
    expect(WINDOW_SCENE_SOURCES.snow.license).toBe("Pexels License");
  });

  it("keeps procedural scenes as safe fallbacks", () => {
    expect(windowSceneAssetUrl("daylight")).toBeNull();
    expect(windowSceneAssetUrl("suburban")).toBeNull();
    expect(windowSceneAssetUrl("privacy")).toBeNull();
  });

  it("uses distinct architectural frame finishes", () => {
    expect(windowFrameColor("white")).toBe("#f4f0e8");
    expect(windowFrameColor("black")).toBe("#20252b");
    expect(windowFrameColor("wood")).toBe("#8a5a35");
  });
});
