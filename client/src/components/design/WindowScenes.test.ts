import { describe, expect, it } from "vitest";
import { windowSceneAssetUrl, WINDOW_SCENE_ASSETS } from "./InteractiveRoom3D";

describe("Designer window scenes", () => {
  it("maps the real reference scenes to stored photographic assets", () => {
    expect(windowSceneAssetUrl("garden")).toBe(WINDOW_SCENE_ASSETS.garden);
    expect(windowSceneAssetUrl("woodland")).toBe(WINDOW_SCENE_ASSETS.woodland);
    expect(windowSceneAssetUrl("coastal")).toBe(WINDOW_SCENE_ASSETS.coastal);
  });

  it("keeps procedural scenes as safe fallbacks", () => {
    expect(windowSceneAssetUrl("daylight")).toBeNull();
    expect(windowSceneAssetUrl("suburban")).toBeNull();
    expect(windowSceneAssetUrl("privacy")).toBeNull();
  });
});
