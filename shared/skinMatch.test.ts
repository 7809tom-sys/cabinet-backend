import { describe, it, expect } from "vitest";
import {
  normalizeSkinPlacement,
  countExposedSides,
  wallSkinCodeForWidth,
  matchingSkinsForCabinet,
  requiresMandatorySkin,
  isUnfinishedExteriorStyleName,
  unfinishedExteriorSkinNote,
} from "./skinMatch";

describe("normalizeSkinPlacement", () => {
  it("maps loose DB values", () => {
    expect(normalizeSkinPlacement("wall")).toBe("wall");
    expect(normalizeSkinPlacement("accessory/trim")).toBe("base");
    expect(normalizeSkinPlacement("Island Base")).toBe("island");
    expect(normalizeSkinPlacement("Tall Pantry")).toBe("tall");
    expect(normalizeSkinPlacement(null)).toBe("base");
    expect(normalizeSkinPlacement(undefined)).toBe("base");
  });
});

describe("countExposedSides", () => {
  it("counts left/right", () => {
    expect(countExposedSides({ left: true }, "wall")).toBe(1);
    expect(countExposedSides({ left: true, right: true }, "base")).toBe(2);
    expect(countExposedSides({}, "base")).toBe(0);
  });
  it("counts back only for islands", () => {
    expect(countExposedSides({ back: true }, "island")).toBe(1);
    expect(countExposedSides({ back: true }, "base")).toBe(0);
    expect(countExposedSides({ left: true, right: true, back: true }, "island")).toBe(3);
  });
});

describe("wallSkinCodeForWidth", () => {
  it("picks the smallest panel that covers the width", () => {
    expect(wallSkinCodeForWidth(12)).toBe("WSV-24");
    expect(wallSkinCodeForWidth(24)).toBe("WSV-24");
    expect(wallSkinCodeForWidth(25)).toBe("WSV-30");
    expect(wallSkinCodeForWidth(30)).toBe("WSV-30");
    expect(wallSkinCodeForWidth(36)).toBe("WSV-36");
    expect(wallSkinCodeForWidth(42)).toBe("WSV-42");
  });
  it("never down-sizes; oversize uses the 42 panel", () => {
    expect(wallSkinCodeForWidth(48)).toBe("WSV-42");
  });
});

describe("matchingSkinsForCabinet", () => {
  it("returns nothing when no side is exposed", () => {
    expect(matchingSkinsForCabinet({ placement: "base", exposed: {} })).toEqual([]);
  });

  it("wall cabinet, one exposed side -> width-sized wall skin x1", () => {
    const r = matchingSkinsForCabinet({ placement: "wall", exposed: { right: true }, widthIn: 30 });
    expect(r).toHaveLength(1);
    expect(r[0].skinCode).toBe("WSV-30");
    expect(r[0].qty).toBe(1);
    expect(r[0].reason).toContain("right");
  });

  it("base cabinet, both ends exposed -> BSV x2", () => {
    const r = matchingSkinsForCabinet({ placement: "base", exposed: { left: true, right: true }, widthIn: 24 });
    expect(r).toHaveLength(1);
    expect(r[0].skinCode).toBe("BSV");
    expect(r[0].qty).toBe(2);
    expect(r[0].reason).toContain("left + right");
  });

  it("tall cabinet exposed -> S-24-96", () => {
    const r = matchingSkinsForCabinet({ placement: "tall", exposed: { left: true }, widthIn: 24 });
    expect(r[0].skinCode).toBe("S-24-96");
    expect(r[0].qty).toBe(1);
  });

  it("island with back+sides exposed -> FPV-42-96 x3", () => {
    const r = matchingSkinsForCabinet({
      placement: "island",
      exposed: { left: true, right: true, back: true },
      widthIn: 36,
    });
    expect(r[0].skinCode).toBe("FPV-42-96");
    expect(r[0].qty).toBe(3);
  });
});

describe("requiresMandatorySkin", () => {
  it("Hickory styles HS + RH are mandatory", () => {
    expect(requiresMandatorySkin("HS")).toBe(true);
    expect(requiresMandatorySkin("rh")).toBe(true);
  });
  it("non-Hickory styles are not mandatory", () => {
    expect(requiresMandatorySkin("SW")).toBe(false);
    expect(requiresMandatorySkin("RW")).toBe(false); // Sylvan Rust BIRCH, not Hickory
    expect(requiresMandatorySkin(null)).toBe(false);
    expect(requiresMandatorySkin(undefined)).toBe(false);
  });
});

describe("isUnfinishedExteriorStyleName", () => {
  it("detects Hickory by display name", () => {
    expect(isUnfinishedExteriorStyleName("Silva Shaker")).toBe(true);
    expect(isUnfinishedExteriorStyleName("Sylvan Rust")).toBe(true);
    expect(isUnfinishedExteriorStyleName("Rustic Hickory")).toBe(true);
    expect(isUnfinishedExteriorStyleName("HICKORY SHAKER")).toBe(true);
  });
  it("ignores non-Hickory names", () => {
    expect(isUnfinishedExteriorStyleName("Extra White")).toBe(false);
    expect(isUnfinishedExteriorStyleName("Maple Natural")).toBe(false);
    expect(isUnfinishedExteriorStyleName(null)).toBe(false);
    expect(isUnfinishedExteriorStyleName(undefined)).toBe(false);
  });
});

describe("unfinishedExteriorSkinNote", () => {
  it("returns a note for Hickory and null otherwise", () => {
    const note = unfinishedExteriorSkinNote("Silva Shaker");
    expect(note).toContain("Silva Shaker");
    expect(note).toContain("matching Hickory skin");
    expect(unfinishedExteriorSkinNote("Extra White")).toBeNull();
  });
});
