import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { PlanCanvas, planCornerGeometry, planTapeMeasure, snapPlanMeasurePoint } from "./PlanCanvas";
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

describe("plan tape measure", () => {
  const room = { width: 144, depth: 120 };

  it("snaps any tapped point to quarter-inch plan coordinates and keeps it inside the saved room", () => {
    expect(snapPlanMeasurePoint({ x: 12.13, y: 19.88 }, room)).toEqual({ x: 12.25, y: 20 });
    expect(snapPlanMeasurePoint({ x: -4, y: 150 }, room)).toEqual({ x: 0, y: 120 });
  });

  it("reports horizontal, vertical, and straight-line distance between arbitrary plan points", () => {
    expect(planTapeMeasure({ x: 18, y: 24 }, { x: 54, y: 72 })).toEqual({
      dx: 36,
      dy: 48,
      distance: 60,
    });
  });

  it("renders the measure-mode instruction for direct point-to-point measurement", () => {
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(PlanCanvas, {
          room: { width: 144, depth: 120, ceilingHeight: 96 },
          cabinets: [],
          selectedUid: null,
          onSelect: () => undefined,
          onMove: () => undefined,
          showWallLayer: true,
          measureMode: true,
        }),
      ),
    );

    expect(markup).toContain("Tape measure: tap the start point");
  });
});

describe("plan placement assistance wiring", () => {
  it("keeps best fit and measured valid/invalid drag feedback in the shared canvas", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");
    expect(source).toContain('data-testid="smart-gap-place-best"');
    expect(source).toContain('data-testid="catalog-drag-gap-highlight"');
    expect(source).toContain('data-testid="catalog-drag-snap-ghost"');
	    expect(source).toContain('data-testid="catalog-drag-fit-status"');
	    expect(source).toContain('data-testid={`catalog-drag-remaining-${segment.key}`}');
	    expect(source).toContain("formatEighthInches(segment.inches)");
	    expect(source).toContain("bestFitCatalogOption(activeGap, layerCandidates)");
	    expect(source).toContain('data-testid="automatic-filler-size-suggestion"');
	    expect(source).toContain("catalogFillerSuggestion(catalogFillerCandidates, recommendation.remaining, activeGap.layer)");
	    expect(source).toContain("e.shiftKey ? wallGapFreehandPreview(gaps, targetAlong, width)");
	    expect(source).toContain("onDropNew(e.clientX, e.clientY, roomEl.getBoundingClientRect(), ppi, e.shiftKey)");
	    expect(source).toContain("hold Shift for freehand");
	  });
});
