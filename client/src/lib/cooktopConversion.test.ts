import { describe, expect, it } from "vitest";
import {
  convertLegacyCooktopPlacements,
  type DesignCabinet,
  type PlacedCabinet,
} from "./design";

const base = (overrides: Partial<PlacedCabinet> = {}) => ({
  uid: "sb-36",
  cabinetId: 36,
  masterCode: "SB36",
  description: "36 inch sink base",
  category: "Base",
  subCategory: "Sink Base",
  placement: "base",
  x: 0,
  y: 0,
  width: 36,
  depth: 24,
  height: 34.5,
  sinkTopType: "gas",
  sinkTopProductId: 902,
  rangeTopImageUrl: "/gas.jpg",
  ...overrides,
}) as PlacedCabinet;

const standardBase = ({ width = 36 } = {}) => ({
  id: 101,
  masterCode: `B${width}`,
  description: `${width} inch standard base`,
  category: "Base",
  subCategory: "Base Cabinet",
  placement: "base",
  width,
  depth: 24,
  height: 34.5,
}) as unknown as DesignCabinet;

describe("convertLegacyCooktopPlacements", () => {
  it("converts gas/electric/smooth-top modes to a standard base plus opening appliance", () => {
    for (const type of ["gas", "electric", "smooth-top"] as const) {
      const result = convertLegacyCooktopPlacements([base({ sinkTopType: type })], [standardBase()]);
      expect(result.convertedCabinetUids.has("sb-36")).toBe(true);
      expect(result.placed).toHaveLength(2);
      expect(result.placed[0]).toMatchObject({ placement: "base", masterCode: "B36", sinkTopType: null });
      expect(result.placed[1]).toMatchObject({
        placement: "appliance",
        applianceRole: "countertop-opening",
        applianceProductId: 902,
        description: type === "smooth-top" ? "Smooth-top cooktop" : `${type[0].toUpperCase()}${type.slice(1)} cooktop`,
      });
    }
  });

  it("is idempotent and does not create a second appliance", () => {
    const once = convertLegacyCooktopPlacements([base()], [standardBase()]);
    const twice = convertLegacyCooktopPlacements(once.placed, [standardBase()]);
    expect(twice.placed).toEqual(once.placed);
    expect(twice.convertedCabinetUids.size).toBe(0);
  });

  it("marks an unresolved width conflict instead of inventing a standard box", () => {
    const result = convertLegacyCooktopPlacements([base({ width: 33 })], [standardBase()]);
    expect(result.placed).toHaveLength(1);
    expect(result.placed[0]).toMatchObject({ cooktopConversionStatus: "unresolved-standard-base", masterCode: "SB36" });
    expect(result.convertedCabinetUids.size).toBe(0);
  });
});
