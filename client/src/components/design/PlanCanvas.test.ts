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
  it("keeps BEC-24 rectangular in plan even when the supplier record carries triangle", () => {
    const result = planCornerGeometry({
      ...base,
      masterCode: "BEC-24",
      description: '24" Base End Angle Cabinet',
      cornerType: "triangle",
    } as PlacedCabinet);

    expect(result).toEqual({
      isEndAngle: true,
      isCorner: false,
      isTriangle: false,
      isDiagonal: false,
      isBlind: false,
      isConfiguredL: false,
    });
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

  it("does not render a triangle clip path for BEC-24 in the actual plan canvas", () => {
    const bec = {
      ...base,
      uid: "bec-live",
      masterCode: "BEC-24",
      description: '24" Base End Angle Cabinet',
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
  });
});
