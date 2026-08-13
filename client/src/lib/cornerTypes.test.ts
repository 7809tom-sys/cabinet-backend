import { describe, expect, it } from "vitest";
import {
  diagonalCornerClipPath,
  isBlindCorner,
  isDiagonalCorner,
  isLCornerCabinet,
  placedFootprint,
} from "./design";
import type { PlacedCabinet } from "./design";

describe("configured corner cabinet types", () => {
  it("keeps a diagonal corner distinct from a rectangular blind corner", () => {
    expect(isDiagonalCorner("DCB-36", "36 inch Diagonal Corner Base")).toBe(true);
    expect(isBlindCorner("DCB-36", "36 inch Diagonal Corner Base")).toBe(false);
    expect(isLCornerCabinet("DCB-36", "36 inch Diagonal Corner Base")).toBe(false);
    expect(isDiagonalCorner("BEC-24", "24 inch Base Angle Cabinet (End of Run)")).toBe(false);

    expect(isBlindCorner("BBC-36", "36 inch Blind Corner Base")).toBe(true);
    expect(isDiagonalCorner("BBC-36", "36 inch Blind Corner Base")).toBe(false);
    expect(isLCornerCabinet("BBC-36", "36 inch Blind Corner Base")).toBe(false);
  });

  it("uses a clipped square footprint for diagonal corners and rectangular footprint for blind corners", () => {
    const diagonal = {
      uid: "dc",
      masterCode: "DCB-36",
      description: "36 inch Diagonal Corner Base",
      width: 36,
      depth: 24,
      x: 0,
      y: 0,
      rotation: 0,
      placement: "base",
    } as PlacedCabinet;
    const blind = { ...diagonal, uid: "bbc", masterCode: "BBC-36", description: "36 inch Blind Corner Base" };

    expect(placedFootprint(diagonal)).toEqual({ w: 36, d: 36 });
    expect(placedFootprint(blind)).toEqual({ w: 36, d: 24 });
    expect(diagonalCornerClipPath(0)).toContain("polygon");
  });

  it("keeps BEC-24 as an end-of-run footprint, not a diagonal or blind corner", () => {
    const bec = {
      uid: "bec",
      masterCode: "BEC-24",
      description: '24" Base End Angle Cabinet',
      width: 24,
      depth: 24,
      x: 0,
      y: 0,
      rotation: 0,
      placement: "base",
      cornerType: "triangle",
    } as PlacedCabinet;

    expect(isDiagonalCorner(bec.masterCode, bec.description)).toBe(false);
    expect(isBlindCorner(bec.masterCode, bec.description)).toBe(false);
    expect(placedFootprint(bec)).toEqual({ w: 24, d: 24 });
  });
});
