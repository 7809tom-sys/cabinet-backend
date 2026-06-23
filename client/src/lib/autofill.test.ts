import { describe, it, expect } from "vitest";
import { autoFillSpan, candidatesForMode, makeFiller } from "./autofill";
import type { DesignCabinet } from "./design";

function cab(masterCode: string, width: number, placement: DesignCabinet["placement"] = "base", extra: Partial<DesignCabinet> = {}): DesignCabinet {
  return {
    id: 1,
    masterCode,
    description: `${width}" ${masterCode}`,
    category: placement === "base" ? "Base" : "Tall",
    subCategory: null,
    width: String(width),
    height: "34.5",
    depth: "24",
    placement,
    numberOfDoors: 1,
    numberOfDrawers: 0,
    isCornerCabinet: false,
    catalogImageUrl: null,
    ...extra,
  };
}

// A representative kitchen base catalog with common standard widths.
const KITCHEN: DesignCabinet[] = [
  cab("B-12", 12),
  cab("B-15", 15),
  cab("B-18", 18),
  cab("B-24", 24),
  cab("B-30", 30),
  cab("B-36", 36),
  // Items that must be EXCLUDED from straight-run fill:
  cab("BBC-45", 45, "base", { isCornerCabinet: true, description: "45\" Blind Corner Base Cabinet" }),
  cab("BEP-3", 3, "base", { description: "3\" Base Decorative End Panel", subCategory: "Filler" }),
  { ...cab("RANGE-30", 30), placement: "appliance", masterCode: "RANGE-30" },
];

describe("candidatesForMode", () => {
  it("excludes corners, panels, fillers, and appliances from a kitchen run", () => {
    const c = candidatesForMode("kitchen", KITCHEN);
    const codes = c.map((x) => x.masterCode);
    expect(codes).toContain("B-24");
    expect(codes).not.toContain("BBC-45"); // corner
    expect(codes).not.toContain("BEP-3"); // filler/panel
    expect(codes).not.toContain("RANGE-30"); // appliance
  });

  it("sorts candidates widest first", () => {
    const c = candidatesForMode("kitchen", KITCHEN);
    const widths = c.map((x) => parseFloat(x.width!));
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i - 1]).toBeGreaterThanOrEqual(widths[i]);
    }
  });
});

describe("autoFillSpan", () => {
  it("tiles an exact multiple with no filler (72\" = 2×36)", () => {
    const r = autoFillSpan(72, "kitchen", KITCHEN);
    expect(r.fillerInches).toBe(0);
    expect(r.leftoverInches).toBeCloseTo(0, 2);
    expect(r.usedInches).toBeCloseTo(72, 2);
    // Greedy widest-first → two 36" bases.
    expect(r.items.filter((i) => !i.isFiller).map((i) => i.cabinet.masterCode)).toEqual(["B-36", "B-36"]);
  });

  it("covers the full span; used + leftover never exceeds span", () => {
    for (const span of [40, 59, 83, 96, 100, 121, 137]) {
      const r = autoFillSpan(span, "kitchen", KITCHEN);
      expect(r.usedInches).toBeLessThanOrEqual(span + 0.01);
      expect(r.usedInches + r.leftoverInches).toBeCloseTo(span, 1);
    }
  });

  it("adds a filler for a small leftover gap (40\" → 36 + 4 filler)", () => {
    const r = autoFillSpan(40, "kitchen", KITCHEN);
    // 36 fits, leftover 4 → filler (4 < min cabinet 12, within MAX_FILLER 6)
    const fillers = r.items.filter((i) => i.isFiller);
    expect(fillers.length).toBe(1);
    expect(r.fillerInches).toBeCloseTo(4, 2);
    expect(r.leftoverInches).toBeCloseTo(0, 2);
  });

  it("absorbs a sub-threshold leftover as reveal, no filler (37\" → 36, ~1 reveal)", () => {
    const r = autoFillSpan(37, "kitchen", KITCHEN);
    expect(r.items.filter((i) => i.isFiller).length).toBe(0);
    expect(r.fillerInches).toBe(0);
    expect(r.leftoverInches).toBeCloseTo(1, 2);
  });

  it("only ever places valid catalog widths for real cabinets", () => {
    const validWidths = new Set(candidatesForMode("kitchen", KITCHEN).map((c) => parseFloat(c.width!)));
    const r = autoFillSpan(123, "kitchen", KITCHEN);
    for (const it of r.items) {
      if (!it.isFiller) expect(validWidths.has(it.width)).toBe(true);
    }
  });

  it("returns nothing for a span smaller than the smallest filler", () => {
    const r = autoFillSpan(1, "kitchen", KITCHEN);
    expect(r.items.length).toBe(0);
    expect(r.usedInches).toBe(0);
  });

  it("falls back to base/tall for closets when no closet parts exist", () => {
    const r = autoFillSpan(48, "closet", KITCHEN);
    expect(r.items.filter((i) => !i.isFiller).length).toBeGreaterThan(0);
  });
});

describe("makeFiller", () => {
  it("produces an orderable filler with a code and width", () => {
    const f = makeFiller(3.5);
    expect(f.masterCode).toBe("FILL-3.5");
    expect(parseFloat(f.width!)).toBeCloseTo(3.5, 2);
    expect(f.isCornerCabinet).toBe(false);
  });
});
