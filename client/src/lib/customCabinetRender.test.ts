import { describe, expect, it } from "vitest";
import { resolveCustomCabinetRender } from "./customCabinetRender";

describe("resolveCustomCabinetRender", () => {
  it("uses a saved generic drawing before a vector fallback", () => {
    expect(resolveCustomCabinetRender("wine-rack", "https://example.com/wine-rack.webp", false)).toBe("generic-image");
  });

  it("uses a vector fallback when a custom rule has no saved image", () => {
    expect(resolveCustomCabinetRender("knee-drawer", null, false)).toBe("vector-profile");
  });

  it("keeps standard and appliance faces out of custom profile overrides", () => {
    expect(resolveCustomCabinetRender("standard", "https://example.com/a.webp", false)).toBe("standard");
    expect(resolveCustomCabinetRender("hood-wall-chimney", "https://example.com/a.webp", true)).toBe("standard");
  });
});
