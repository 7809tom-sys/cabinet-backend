import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { PlanCanvas, planCornerGeometry } from "./PlanCanvas";
import type { PlacedCabinet } from "@/lib/design";

const base = {
  uid: "cabinet",
  cabinetId: 9450022,
  placement: "base",
  x: 0,
  y: 0,
  width: 24,
  depth: 24,
  rotation: 0,
  category: "Base",
} as const;

describe("plan corner geometry", () => {
  it("uses BEC-24's explicit end-angle Config while excluding it from true-corner geometry", () => {
    const result = planCornerGeometry({
      ...base,
      masterCode: "BEC-24",
      description: '24" Base End Cabinet — 45° Angled Front',
      customProfile: "end-angle",
      cornerType: "triangle",
    } as PlacedCabinet);

    expect(result).toEqual({
      isEndAngle: true,
      isEndReturn: false,
      isCorner: false,
      isTriangle: false,
      isDiagonal: false,
      isBlind: false,
      isConfiguredL: false,
    });
  });

  it("keeps BA-24 and BEC-24 on the same non-corner angled-end plan path", () => {
    for (const masterCode of ["BA-24", "BEC-24"]) {
      const result = planCornerGeometry({
        ...base,
        masterCode,
        description: '24" Base End Cabinet — 45° Angled Front',
        customProfile: "end-angle",
        cornerType: "triangle",
      } as PlacedCabinet);
      expect(result).toMatchObject({ isEndAngle: true, isEndReturn: false, isCorner: false, isTriangle: false });
    }
  });

  it("continues to use the appropriate corner path for a true configured diagonal cabinet", () => {
    const result = planCornerGeometry({
      ...base,
      masterCode: "DCB-36",
      description: '36" Diagonal Corner Base',
      cornerType: "diagonal",
    } as PlacedCabinet);

    expect(result.isEndAngle).toBe(false);
    expect(result.isCorner).toBe(true);
    expect(result.isDiagonal).toBe(true);
  });

  it("renders BEC-24 as a 24-by-24 angled end cabinet without a true-corner wedge", () => {
    const bec = {
      ...base,
      uid: "bec-live",
      masterCode: "BEC-24",
      description: '24" Base End Cabinet — 45° Angled Front',
      customProfile: "end-angle",
      cornerType: "triangle",
    } as PlacedCabinet;
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(PlanCanvas, {
          room: { width: 144, depth: 120, ceilingHeight: 96 },
          cabinets: [bec],
          selectedUid: null,
          onSelect: () => undefined,
          onMove: () => undefined,
          showWallLayer: true,
        }),
      ),
    );
    const cabinetTag = markup.match(/<div[^>]*title="BEC-24 —[^>]*>/)?.[0];

    expect(cabinetTag).toBeDefined();
    expect(cabinetTag).not.toContain("clip-path");
    expect(cabinetTag).toContain("width:96px");
    expect(cabinetTag).toContain("height:96px");
    expect(markup).toContain('data-end-angle="true"');
    expect(markup).toContain('aria-label="24 by 24 base end cabinet with 45 degree angled front"');
  });
});
