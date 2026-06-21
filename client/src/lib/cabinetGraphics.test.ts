import { describe, it, expect } from "vitest";
import {
  cabinetDrawingType,
  slugify,
  cabinetImageSlug,
  cabinetAltText,
  type CabinetLike,
} from "./cabinetGraphics";

describe("cabinetDrawingType", () => {
  it("classifies an all-drawer base as drawer-base", () => {
    const cab: CabinetLike = {
      masterCode: "DB-12-3",
      description: '12" Three Drawer Base Cabinet',
      category: "Base",
      subCategory: "Drawer Base",
      width: "12",
      numberOfDoors: 0,
      numberOfDrawers: 3,
    };
    expect(cabinetDrawingType(cab)).toBe("drawer-base");
  });

  it("classifies a sink base as sink-base", () => {
    const cab: CabinetLike = {
      masterCode: "SB-36",
      description: '36" Sink Base Cabinet',
      category: "Base",
      subCategory: "Sink Base",
      width: "36",
      numberOfDoors: 2,
    };
    expect(cabinetDrawingType(cab)).toBe("sink-base");
  });

  it("classifies a standard door base as standard-door", () => {
    const cab: CabinetLike = {
      masterCode: "B-18",
      description: '18" Base Cabinet',
      category: "Base",
      subCategory: "Base",
      width: "18",
      numberOfDoors: 1,
      numberOfDrawers: 1,
    };
    expect(cabinetDrawingType(cab)).toBe("standard-door");
  });

  it("classifies a glass wall cabinet as glass-door", () => {
    const cab: CabinetLike = {
      masterCode: "W-30-GD",
      description: '30" Wall Cabinet with Glass Door',
      category: "Wall",
      width: "30",
      numberOfDoors: 2,
    };
    expect(cabinetDrawingType(cab)).toBe("glass-door");
  });

  it("classifies a blind/diagonal corner as blind-corner", () => {
    const cab: CabinetLike = {
      masterCode: "DCW-24-30",
      description: "Diagonal Corner Wall Cabinet",
      category: "Wall",
      width: "24",
      isCornerCabinet: true,
    };
    expect(cabinetDrawingType(cab)).toBe("blind-corner");
  });

  it("classifies an appliance garage before generic wall logic", () => {
    const cab: CabinetLike = {
      masterCode: "AG-24",
      description: '24" Appliance Garage with Tambour Door',
      category: "Wall",
      width: "24",
    };
    expect(cabinetDrawingType(cab)).toBe("appliance-garage");
  });

  it("classifies crown molding as accessory-strip", () => {
    const cab: CabinetLike = {
      masterCode: "CM-96",
      description: "96in Crown Molding",
      category: "Accessory",
      subCategory: "Molding",
    };
    expect(cabinetDrawingType(cab)).toBe("accessory-strip");
  });

  it("classifies an ADA unit as ada", () => {
    const cab: CabinetLike = {
      masterCode: "ADA-B-30",
      description: '30" ADA Base Cabinet',
      category: "ADA",
      width: "30",
      numberOfDoors: 2,
    };
    expect(cabinetDrawingType(cab)).toBe("ada");
  });

  it("classifies a vanity unit as vanity", () => {
    const cab: CabinetLike = {
      masterCode: "VAN-36",
      description: '36" Vanity Cabinet',
      category: "Vanity",
      width: "36",
      numberOfDoors: 2,
    };
    expect(cabinetDrawingType(cab)).toBe("vanity");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Drawer Base 12")).toBe("drawer-base-12");
  });
  it("drops inch marks and collapses repeats", () => {
    expect(slugify('12"  Three  Drawer')).toBe("12-three-drawer");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("--Hello--")).toBe("hello");
  });
});

describe("cabinetImageSlug", () => {
  it("combines description and master code", () => {
    const cab: CabinetLike = {
      masterCode: "DB-12-3",
      description: '12" Three Drawer Base Cabinet',
    };
    expect(cabinetImageSlug(cab)).toBe("12-three-drawer-base-cabinet-db-12-3");
  });
  it("falls back to code when description missing", () => {
    const cab: CabinetLike = { masterCode: "X-9" };
    expect(cabinetImageSlug(cab)).toBe("x-9");
  });
});

describe("cabinetAltText", () => {
  it("includes name, code, and a type-specific detail", () => {
    const cab: CabinetLike = {
      masterCode: "DB-12-3",
      description: '12" Three Drawer Base Cabinet',
      category: "Base",
      subCategory: "Drawer Base",
      width: "12",
      numberOfDrawers: 3,
      numberOfDoors: 0,
    };
    const alt = cabinetAltText(cab);
    expect(alt).toContain("DB-12-3");
    expect(alt).toContain("3-drawer base cabinet");
  });

  it("describes sink base front", () => {
    const cab: CabinetLike = {
      masterCode: "SB-36",
      description: '36" Sink Base',
      category: "Base",
      subCategory: "Sink Base",
      width: "36",
      numberOfDoors: 2,
    };
    expect(cabinetAltText(cab)).toContain("sink base cabinet");
  });
});

describe("cabinetDrawingType — real cabinet families never become accessory strips", () => {
  it("does not classify a Base cabinet described with 'Adjustable Shelf' as accessory", () => {
    const cab: CabinetLike = {
      masterCode: "B-24",
      description: '24" Double Door Single Drawer Base Cabinet with Adjustable Shelf',
      category: "Base",
      subCategory: "Single Door Base",
      width: "24",
      numberOfDoors: 2,
      numberOfDrawers: 1,
    };
    expect(cabinetDrawingType(cab)).toBe("standard-door");
    expect(cabinetAltText(cab)).not.toContain("accessory / trim");
  });

  it("does not classify a Wall cabinet mentioning 'panel' as accessory", () => {
    const cab: CabinetLike = {
      masterCode: "W-30-30",
      description: '30" Double Door Wall Cabinet with Raised Panel Doors',
      category: "Wall",
      subCategory: "Double Door Wall",
      width: "30",
      numberOfDoors: 2,
      numberOfDrawers: 0,
    };
    expect(cabinetDrawingType(cab)).toBe("standard-door");
  });

  it("still classifies a true Accessory filler as accessory-strip", () => {
    const cab: CabinetLike = {
      masterCode: "BF-3",
      description: '3" Base Filler',
      category: "Accessory",
      subCategory: "Trim & Molding",
      width: "3",
      numberOfDoors: 0,
      numberOfDrawers: 0,
    };
    expect(cabinetDrawingType(cab)).toBe("accessory-strip");
  });
});
