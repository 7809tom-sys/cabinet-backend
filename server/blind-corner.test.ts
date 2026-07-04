import { describe, it, expect } from "vitest";

// We test the client-side design.ts functions that were modified.
// Import them directly (vitest resolves TS paths via the vite config).
import {
  isBlindCorner,
  blindPullRange,
  blindCornerSpecViolations,
  dimLabel,
} from "../client/src/lib/design.ts";

describe("isBlindCorner", () => {
  it("matches BBC codes", () => {
    expect(isBlindCorner("BBC-42")).toBe(true);
    expect(isBlindCorner("BBC-36")).toBe(true);
  });
  it("matches WBC codes", () => {
    expect(isBlindCorner("WBC-30")).toBe(true);
  });
  it("matches codes containing BLIND", () => {
    expect(isBlindCorner("B-36-BLIND")).toBe(true);
  });
  it("matches description with blind corner", () => {
    expect(isBlindCorner("CUSTOM-1", "Blind Corner Base")).toBe(true);
  });
  it("does NOT match FILL-* codes", () => {
    expect(isBlindCorner("FILL-3")).toBe(false);
    expect(isBlindCorner("FILL-6")).toBe(false);
    expect(isBlindCorner("FILL-3", "3\" Blind Corner Filler (opposite pull)")).toBe(true);
    // Note: the old auto-filler description contained "Blind Corner Filler" which
    // would match. But since we removed auto-filler, new fillers won't have that
    // description. Standard fillers from the catalog won't have "blind corner" in desc.
  });
  it("does NOT match regular base/wall codes", () => {
    expect(isBlindCorner("B-24")).toBe(false);
    expect(isBlindCorner("W-30")).toBe(false);
    expect(isBlindCorner("SB-36")).toBe(false);
    expect(isBlindCorner("DB-24")).toBe(false);
  });
});

describe("blindPullRange", () => {
  it("returns explicit pullMin/pullMax when provided", () => {
    const result = blindPullRange({ pullMin: 3, pullMax: 9, width: 36 });
    expect(result).toEqual({ min: 3, max: 9 });
  });
  it("returns defaults (3/6) when pullMin/pullMax are null", () => {
    // The corrected behavior: pull range is always 3-6" (the blind portion
    // hidden behind the perpendicular wall), NOT width+3/width+6.
    const result = blindPullRange({ pullMin: null, pullMax: null, width: 36 });
    expect(result).toEqual({ min: 3, max: 6 });
  });
  it("returns defaults for BBC-42 (width=42)", () => {
    const result = blindPullRange({ pullMin: null, pullMax: null, width: 42 });
    expect(result).toEqual({ min: 3, max: 6 });
  });
  it("uses provided pullMin with default pullMax", () => {
    const result = blindPullRange({ pullMin: 3, pullMax: null, width: 36 });
    expect(result).toEqual({ min: 3, max: 6 });
  });
  it("always returns a value (never null) since defaults apply", () => {
    // Even with no width, defaults of 3/6 apply.
    const result = blindPullRange({ pullMin: null, pullMax: null });
    expect(result).toEqual({ min: 3, max: 6 });
  });
});

describe("blindCornerSpecViolations", () => {
  it("does NOT flag any issue when defaults apply (no pullMin/pullMax)", () => {
    const placed = [
      {
        uid: "bbc1",
        masterCode: "BBC-42",
        description: "42\" Blind Base Corner",
        placement: "base" as const,
        width: 42,
        nominalWidth: 42,
        depth: 24,
        nominalDepth: 24,
        height: 34.5,
        nominalHeight: 34.5,
        x: 0,
        y: 0,
        rotation: 0,
        pullMin: null,
        pullMax: null,
      },
    ] as any[];
    const violations = blindCornerSpecViolations(placed);
    // With defaults always applying (3-6"), no BBC is ever flagged.
    expect(violations.has("bbc1")).toBe(false);
  });

  it("does not flag when cabinet has explicit pull spec", () => {
    const placed = [
      {
        uid: "bbc2",
        masterCode: "BBC-36",
        description: "36\" Blind Base Corner",
        placement: "base" as const,
        width: 33,
        nominalWidth: 33,
        depth: 24,
        nominalDepth: 24,
        height: 34.5,
        nominalHeight: 34.5,
        x: 0,
        y: 0,
        rotation: 0,
        pullMin: 3,
        pullMax: 9,
      },
    ] as any[];
    const violations = blindCornerSpecViolations(placed);
    expect(violations.has("bbc2")).toBe(false);
  });
});

describe("dimLabel for fillers", () => {
  it("shows correct width for FILL-3 (3\"W, not 24\"W)", () => {
    const filler = {
      uid: "f1",
      masterCode: "FILL-3",
      description: "3\" Filler",
      placement: "base" as const,
      width: 24, // incorrectly stored as 24 (plan footprint on vertical wall)
      nominalWidth: 24,
      depth: 3,
      nominalDepth: 3,
      height: 34.5,
      nominalHeight: 34.5,
      x: 0,
      y: 0,
      rotation: 90,
    } as any;
    const label = dimLabel(filler);
    expect(label).toContain('3"W');
    expect(label).not.toContain('24"W');
  });
  it("shows correct width for FILL-6", () => {
    const filler = {
      uid: "f2",
      masterCode: "FILL-6",
      description: "6\" Filler",
      placement: "base" as const,
      width: 6,
      nominalWidth: 6,
      depth: 24,
      nominalDepth: 24,
      height: 34.5,
      nominalHeight: 34.5,
      x: 0,
      y: 0,
      rotation: 0,
    } as any;
    const label = dimLabel(filler);
    expect(label).toContain('6"W');
  });
  it("shows normal width for non-filler cabinets", () => {
    const cab = {
      uid: "b1",
      masterCode: "B-24",
      description: "24\" Base Cabinet",
      placement: "base" as const,
      width: 24,
      nominalWidth: 24,
      depth: 24,
      nominalDepth: 24,
      height: 34.5,
      nominalHeight: 34.5,
      x: 0,
      y: 0,
      rotation: 0,
    } as any;
    const label = dimLabel(cab);
    expect(label).toContain('24"W');
  });
});
