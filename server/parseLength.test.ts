import { describe, it, expect } from "vitest";
import { parseLengthToInches } from "../client/src/lib/design";

describe("parseLengthToInches (tape-measure entry)", () => {
  it("parses bare inches", () => {
    expect(parseLengthToInches("126")).toBe(126);
    expect(parseLengthToInches('126"')).toBe(126);
  });

  it("parses feet only", () => {
    expect(parseLengthToInches("10'")).toBe(120);
    expect(parseLengthToInches("10 ft")).toBe(120);
    expect(parseLengthToInches("10 feet")).toBe(120);
  });

  it("parses feet and inches", () => {
    expect(parseLengthToInches("10' 6\"")).toBe(126);
    expect(parseLengthToInches("10'6")).toBe(126);
    expect(parseLengthToInches("10 ft 6 in")).toBe(126);
  });

  it("parses fractions and mixed numbers", () => {
    expect(parseLengthToInches("120 1/2")).toBe(120.5);
    expect(parseLengthToInches("1/2")).toBe(0.5);
    expect(parseLengthToInches("10' 6 1/2\"")).toBe(126.5);
    expect(parseLengthToInches("6-1/2")).toBe(6.5);
  });

  it("parses decimals", () => {
    expect(parseLengthToInches("8.5'")).toBe(102);
    expect(parseLengthToInches("102.5")).toBe(102.5);
  });

  it("returns null for garbage / empty", () => {
    expect(parseLengthToInches("")).toBeNull();
    expect(parseLengthToInches("abc")).toBeNull();
    expect(parseLengthToInches("0")).toBeNull();
    expect(parseLengthToInches("1/0")).toBeNull();
  });
});
