import { describe, expect, it } from "vitest";
import { styleImageRetryUrl } from "./ResilientStyleImage";

describe("failed cabinet-style image retry", () => {
  it("retries the identical authentic extensionless room-scene path through a fresh URL", () => {
    const url = "/manus-storage/media-library/1785260582020_classic_cream_room_scene_18c5ad57";
    expect(styleImageRetryUrl(url, "first")).toBe(`${url}?cd-image-retry-nonce=first`);
    expect(styleImageRetryUrl(url, "second")).toBe(`${url}?cd-image-retry-nonce=second`);
  });

  it("preserves an existing query rather than changing a style's source", () => {
    expect(styleImageRetryUrl("/manus-storage/style-image?size=full", "one two")).toBe("/manus-storage/style-image?size=full&cd-image-retry-nonce=one%20two");
    expect(styleImageRetryUrl("data:image/png;base64,abc", "ignored")).toBe("data:image/png;base64,abc");
  });
});
