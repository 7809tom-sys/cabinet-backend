import { describe, expect, it } from "vitest";
import { optionalPositiveFreightId } from "./freight";

describe("optionalPositiveFreightId", () => {
  it("preserves real catalog IDs", () => {
    expect(optionalPositiveFreightId(210002)).toBe(210002);
  });

  it("converts legacy zero, negative, and missing IDs to null", () => {
    expect(optionalPositiveFreightId(0)).toBeNull();
    expect(optionalPositiveFreightId(-404)).toBeNull();
    expect(optionalPositiveFreightId(null)).toBeNull();
    expect(optionalPositiveFreightId(undefined)).toBeNull();
  });
});
