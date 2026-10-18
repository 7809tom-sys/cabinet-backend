import { describe, expect, it } from "vitest";
import { AEF_PROFESSIONAL_ASSETS, effectiveAefCabinetForImage, professionalAefImageFor } from "../scripts/refresh-aef-professional-images";

function sourceCabinet(masterCode: string, category: string) {
  return { id: 1, masterCode, category, numberOfDoors: null, numberOfDrawers: null, height: null, depth: null };
}

describe("professionalAefImageFor", () => {
  it("puts pantry drawer banks below the correct single or double tall doors", () => {
    expect(professionalAefImageFor(sourceCabinet("T2DB1884", "Tall"))).toBe("tallOneDoorTwoDrawerBottom");
    expect(professionalAefImageFor(sourceCabinet("T2DB3084", "Tall"))).toBe("tallTwoDoorTwoDrawerBottom");
    expect(professionalAefImageFor(sourceCabinet("T3DB1884", "Tall"))).toBe("tallOneDoorThreeDrawerBottom");
    expect(professionalAefImageFor(sourceCabinet("T3DB3084", "Tall"))).toBe("tallTwoDoorThreeDrawerBottom");
    expect(professionalAefImageFor(sourceCabinet("T2DBID3084", "Tall"))).toBe("tallTwoDoorTwoDrawerBottom");
  });
  it("uses two doors for the source refrigerator walls, not the legacy one-door render", () => {
    for (const code of ["W301224", "W331224", "W361224", "W361524", "W241824", "W301824", "W331824", "W361824", "W242324", "W302324", "W332324", "W362324"]) {
      expect(professionalAefImageFor({ ...sourceCabinet(code, "Wall"), depth: "24", numberOfDoors: 2 })).toBe("wallRefrigeratorDoubleDoor");
    }
  });
  it("reads supplier-line face counts and dimensions instead of shared framed geometry", () => {
    const input = { ...sourceCabinet("B30FH", "Base"), numberOfDoors: 1, height: "34.5", depth: "12", configJson: JSON.stringify({ numberOfDoors: 2, numberOfDrawers: 0, height: "34.750", depth: "24.000" }) };
    expect(effectiveAefCabinetForImage(input)).toMatchObject({ id: 1, masterCode: "B30FH", numberOfDoors: 2, height: "34.750", depth: "24.000" });
    expect(professionalAefImageFor(input)).toBe("baseFullHeightDoubleDoor");
    expect(input.numberOfDoors).toBe(1);
    expect(professionalAefImageFor({ ...input, configJson: JSON.stringify({ numberOfDoors: 1 }) })).toBe("baseFullHeight");
  });
  it("keeps the four source-distinct single-door products away from framed renders", () => {
    expect(professionalAefImageFor(sourceCabinet("B24S", "Base"))).toBe("baseSingleDoorDrawer");
    expect(professionalAefImageFor(sourceCabinet("SB24S", "Base"))).toBe("baseSingleDoorDrawer");
    expect(professionalAefImageFor(sourceCabinet("W2430S", "Wall"))).toBe("wallSingleDoor");
    expect(professionalAefImageFor(sourceCabinet("VSB24S", "Vanity"))).toBe("vanitySingleDoor");
  });
  it("separates every single/double oven and visible drawer-bank variant", () => {
    for (const height of ["84", "89", "94"]) {
      expect(professionalAefImageFor(sourceCabinet(`TOS2DB30${height}`, "Tall"))).toBe("tallSingleOvenTwoDrawer");
      expect(professionalAefImageFor(sourceCabinet(`TOS2DBID30${height}`, "Tall"))).toBe("tallSingleOvenTwoDrawer");
      expect(professionalAefImageFor(sourceCabinet(`TOS3DB30${height}`, "Tall"))).toBe("tallSingleOvenThreeDrawer");
      expect(professionalAefImageFor(sourceCabinet(`TOD30${height}`, "Tall"))).toBe("tallDoubleOvenOneDrawer");
    }
  });
  it("uses correct standard tall door counts, never invented vanity-tall drawers", () => {
    expect(professionalAefImageFor({ ...sourceCabinet("VT1884", "Tall"), numberOfDoors: 2, numberOfDrawers: 0 })).toBe("tallTwoDoor");
    expect(professionalAefImageFor({ ...sourceCabinet("T3084", "Tall"), numberOfDoors: 4 })).toBe("tallFourDoor");
  });
  it("keeps source-proportioned three-drawer art instead of the equal-front assets", () => {
    expect(AEF_PROFESSIONAL_ASSETS.base3Drawer).toContain("three-drawer-source-proportions");
    expect(AEF_PROFESSIONAL_ASSETS.vanity3Drawer).toContain("three-drawer-source-proportions");
    expect(AEF_PROFESSIONAL_ASSETS.tallSingleOvenThreeDrawer).toContain("three-drawer-source-proportions");
    expect(AEF_PROFESSIONAL_ASSETS.base3Drawer).not.toContain("8a9b4ed4");
    expect(AEF_PROFESSIONAL_ASSETS.baseSingleDoorDrawer).not.toContain("e24450bc");
    expect(AEF_PROFESSIONAL_ASSETS.baseDoubleDoorDrawer).not.toContain("d8606efe");
  });
  it("rejects an invalid source configuration instead of silently showing a framed cabinet", () => {
    expect(() => effectiveAefCabinetForImage({ ...sourceCabinet("B18", "Base"), configJson: "invalid" })).toThrow();
    expect(() => effectiveAefCabinetForImage({ ...sourceCabinet("B18", "Base"), configJson: "[]" })).toThrow();
    expect(() => professionalAefImageFor(sourceCabinet("TOS-UNKNOWN", "Tall"))).toThrow();
  });
  it("keeps panels and mouldings distinct from cabinet images and source-page crops", () => {
    expect(professionalAefImageFor(sourceCabinet("TEP3096", "Accessory"))).toBe("accessoryPanel");
    for (const masterCode of ["OCM8", "BM8", "SM8", "TKC", "TKC-PVC", "CORNER-PVC"]) expect(professionalAefImageFor(sourceCabinet(masterCode, "Accessory"))).toBe("accessoryMoulding");
  });
  it("never adds a false drawer band to full-height base or vanity sink fronts", () => {
    for (const category of ["Base", "Vanity"]) {
      const prefix = category === "Base" ? "SB" : "VSB";
      for (const width of [24, 27, 30, 33, 36]) expect(professionalAefImageFor({ ...sourceCabinet(`${prefix}${width}FH`, category), numberOfDoors: 2, numberOfDrawers: 0 })).toBe("baseFullHeightDoubleDoor");
      expect(professionalAefImageFor({ ...sourceCabinet(`${prefix}24SFH`, category), numberOfDoors: 1, numberOfDrawers: 0 })).toBe("baseFullHeight");
    }
  });
  it("resolves tall vanity source graphics before short vanity fallbacks", () => {
    expect(professionalAefImageFor({ ...sourceCabinet("VT1884", "Vanity"), configJson: JSON.stringify({ graphicType: "tall_2door", numberOfDoors: 2, numberOfDrawers: 0 }) })).toBe("tallTwoDoor");
  });
  it("keeps one-door wall sources away from two-door standard height images", () => {
    for (const code of ["W2130", "W2135", "W2140", "W2423", "W2723", "W3023", "W3323", "W3623"]) expect(professionalAefImageFor({ ...sourceCabinet(code, "Wall"), numberOfDoors: 1, height: "30.25", depth: "13.5" })).toBe("wallSingleDoor");
  });
  it("separates exposed blind corner door counts and accessory identities", () => {
    expect(professionalAefImageFor({ ...sourceCabinet("BBC49/52FH", "Base"), numberOfDoors: 2 })).toBe("baseBlindCornerDoubleDoor");
    expect(professionalAefImageFor({ ...sourceCabinet("WBC33/3630", "Wall"), numberOfDoors: 2 })).toBe("wallBlindCornerDoubleDoor");
    expect(professionalAefImageFor(sourceCabinet("EB10", "Accessory"))).toBe("accessoryEdgeBanding");
    expect(professionalAefImageFor(sourceCabinet("TUK", "Accessory"))).toBe("accessoryTouchUpKit");
  });
  it("preserves the source LSB two-leaf appearance and the range-base false-front recipe", () => {
    expect(professionalAefImageFor({ ...sourceCabinet("LSB33", "Base"), numberOfDoors: 1 })).toBe("baseEasyReach");
    expect(professionalAefImageFor({ ...sourceCabinet("RB3DB24", "Base"), numberOfDrawers: 3 })).toBe("base3Drawer");
  });
});
