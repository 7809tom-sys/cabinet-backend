import { describe, expect, it } from "vitest";
import { APPLIANCES, applianceAppearanceImage, applianceAsDesignCabinet } from "./design";

describe("realistic designer appliance appearances", () => {
  it("offers the supplied 30-inch range visuals without changing the RANGE-30 envelope", () => {
    const ranges = APPLIANCES.filter((item) => item.masterCode === "RANGE-30");

    expect(ranges).toHaveLength(8);
    expect(ranges.every((item) => item.width === 30 && item.depth === 25 && item.elevHeight === 36)).toBe(true);
    expect(ranges.every((item) => item.catalogImageUrl?.startsWith("/manus-storage/"))).toBe(true);
  });

  it("offers the supplied hood visuals at their catalog dimensions and preserves their image when placed", () => {
    const hoods = APPLIANCES.filter((item) => /^HOOD-/.test(item.masterCode));
    const glassHood = hoods.find((item) => item.key === "hood-glass-stainless");
    const hood36 = hoods.find((item) => item.masterCode === "HOOD-36");

    expect(glassHood).toMatchObject({ width: 30, depth: 18, elevBottom: 66, elevHeight: 18 });
    expect(hood36).toMatchObject({ width: 36, depth: 18, elevBottom: 66, elevHeight: 18 });
    expect(applianceAsDesignCabinet(glassHood!).catalogImageUrl).toBe(glassHood?.catalogImageUrl);
  });

  it("gives legacy range and hood placements a supplied default while preserving a chosen visual", () => {
    expect(applianceAppearanceImage("RANGE-30")).toBe(APPLIANCES.find((item) => item.masterCode === "RANGE-30")?.catalogImageUrl);
    expect(applianceAppearanceImage("HOOD-30")).toBe(APPLIANCES.find((item) => item.masterCode === "HOOD-30")?.catalogImageUrl);
    expect(applianceAppearanceImage("RANGE-30", "/manus-storage/customer-choice.webp")).toBe("/manus-storage/customer-choice.webp");
  });
});
