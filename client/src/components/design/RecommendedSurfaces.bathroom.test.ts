import { describe, expect, it } from "vitest";
import {
  BATHROOM_RECOMMENDED_SECTIONS,
  RECOMMENDED_SECTIONS,
} from "./RecommendedSurfaces";

describe("RecommendedSurfaces bathroom palette", () => {
  it("exposes the source-backed bathroom fixture families", () => {
    expect(BATHROOM_RECOMMENDED_SECTIONS.map((section) => section.role)).toEqual([
      "bathroom-sink",
      "bathroom-faucet",
      "toilet-bidet",
      "bathtub",
      "shower-door",
      "shower-surround",
      "shower-system",
    ]);
  });

  it("keeps kitchen sink and faucet recommendation roles out of the bathroom palette", () => {
    const bathroomRoles = new Set(BATHROOM_RECOMMENDED_SECTIONS.map((section) => section.role));
    expect(bathroomRoles.has("sink")).toBe(false);
    expect(bathroomRoles.has("faucet")).toBe(false);
    expect(RECOMMENDED_SECTIONS.map((section) => section.role)).toContain("sink");
    expect(RECOMMENDED_SECTIONS.map((section) => section.role)).toContain("faucet");
  });
});
