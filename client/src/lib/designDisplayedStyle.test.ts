import { describe, expect, it } from "vitest";
import { displayedStyleId } from "./design";

describe("displayedStyleId", () => {
  it("applies the active selected finish across placed cabinets in a one-finish design", () => {
    expect(displayedStyleId({ styleId: 42 }, 7, false)).toBe(7);
    expect(displayedStyleId({ styleId: 99 }, 7, false)).toBe(7);
  });

  it("preserves a per-cabinet finish only after a distinct two-tone style is active", () => {
    expect(displayedStyleId({ styleId: 42 }, 7, true)).toBe(42);
    expect(displayedStyleId({ styleId: null }, 7, true)).toBe(7);
  });
});
