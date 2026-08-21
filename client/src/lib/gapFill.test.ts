import { describe, it, expect } from "vitest";
import { gapFillCandidatesByWidth, smartGapCatalogOptions, smartGapRecommendation } from "./design";

// Minimal palette rows for the pure candidate-selection helper.
type Row = Parameters<typeof gapFillCandidatesByWidth>[0][number];
const row = (masterCode: string, width: number, subCategory = "", isCornerCabinet = false): Row => ({
  masterCode,
  width: String(width),
  subCategory,
  isCornerCabinet,
});

describe("gapFillCandidatesByWidth", () => {
  it("keys one representative cabinet per standard width", () => {
    const map = gapFillCandidatesByWidth([
      row("B12", 12),
      row("B15", 15),
      row("B24", 24),
    ]);
    expect(map.size).toBe(3);
    expect(map.get(12)?.masterCode).toBe("B12");
    expect(map.get(24)?.masterCode).toBe("B24");
  });

  it("prefers a plain base box over a sink/specialty/corner unit at the same width", () => {
    const map = gapFillCandidatesByWidth([
      row("SB24", 24, "Sink Base"),
      row("BLS24", 24, "Blind corner", true),
      row("B24", 24, "Base Cabinet"),
    ]);
    // B24 (rank 0) should win over SB24 (2) and the corner (4).
    expect(map.get(24)?.masterCode).toBe("B24");
  });

  it("falls back to a sink base when no plain base exists at that width", () => {
    const map = gapFillCandidatesByWidth([
      row("SB30", 30, "Sink Base"),
      row("LS36", 36, "Lazy Susan", true),
    ]);
    expect(map.get(30)?.masterCode).toBe("SB30");
    // corner-only width still surfaces (nothing better exists)
    expect(map.get(36)?.masterCode).toBe("LS36");
  });

  it("ignores widths outside the 9-48 inch standard range", () => {
    const map = gapFillCandidatesByWidth([
      row("B6", 6),
      row("B9", 9),
      row("B48", 48),
      row("B54", 54),
    ]);
    expect(map.has(6)).toBe(false);
    expect(map.has(54)).toBe(false);
    expect(map.has(9)).toBe(true);
    expect(map.has(48)).toBe(true);
  });

  it("rounds fractional widths to the nearest inch key", () => {
    const map = gapFillCandidatesByWidth([row("B24", 23.75)]);
    expect(map.get(24)?.masterCode).toBe("B24");
  });

  it("returns an empty map for an empty pool", () => {
    expect(gapFillCandidatesByWidth([]).size).toBe(0);
  });

  it("offers only active-style catalog options for under-60-inch gaps without automatic placement", () => {
    const candidates = gapFillCandidatesByWidth([row("B24", 24), row("B30", 30), row("B36", 36)]);
    expect(smartGapRecommendation({ length: 5 }, candidates)).toMatchObject({ kind: "filler", remaining: 5 });
    expect(smartGapRecommendation({ length: 38 }, candidates)).toMatchObject({ kind: "cabinet-with-filler", cabinet: { masterCode: "B36" }, remaining: 2 });
    expect(smartGapRecommendation({ length: 48 }, candidates)).toMatchObject({ kind: "cabinet", cabinet: { masterCode: "B36" }, remaining: 12 });
    expect(smartGapRecommendation({ length: 60 }, candidates)).toBeNull();
  });

  it("returns every catalog cabinet that fits a smart gap so the user can filter by cabinet type or price", () => {
    const options = smartGapCatalogOptions({ length: 38 }, [row("B24", 24), row("SB30", 30, "Sink Base"), row("DB36", 36, "Drawer Base"), row("B42", 42)]);
    expect(options.map((option) => option.cabinet.masterCode)).toEqual(["DB36", "SB30", "B24"]);
    expect(options[0]).toMatchObject({ remaining: 2, needsFiller: true });
  });
});
