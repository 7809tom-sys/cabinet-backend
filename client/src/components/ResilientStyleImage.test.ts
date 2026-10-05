import { describe, expect, it } from "vitest";
import { styleImageRetryUrl } from "./ResilientStyleImage";

describe("failed cabinet-style image retry", () => {
  it("retries the identical authentic extensionless room-scene path through a fresh URL", () => {
    const url = "/manus-storage/media-library/1785260582020_classic_cream_room_scene_18c5ad57";
    expect(styleImageRetryUrl(url)).toBe(`${url}?cd-image-retry=1`);
  });

  it("preserves an existing query rather than changing a style's source", () => {
    expect(styleImageRetryUrl("/manus-storage/style-image?size=full")).toBe("/manus-storage/style-image?size=full&cd-image-retry=1");
    expect(styleImageRetryUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
