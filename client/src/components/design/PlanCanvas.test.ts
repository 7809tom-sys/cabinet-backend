import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { PlanCanvas, nearestIslandFaceInRect, planCornerGeometry, planOpeningWallFrame, planTapeMeasure, snapPlanMeasurePoint } from "./PlanCanvas";
import type { PlacedCabinet, RoomData, WallOpening } from "@/lib/design";

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

describe("user measured open wall paths", () => {
  it("renders the custom wall shell and suppresses the four implicit rectangle walls", () => {
    const room = {
      width: 156.154,
      depth: 55.154,
      ceilingHeight: 96,
      openWallPath: true,
      vertices: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 101, y: 0 },
        { id: "c", x: 156.154, y: 55.154 },
      ],
      customWalls: [
        { id: "wall-1", startVertexId: "a", endVertexId: "b", label: "Wall 1" },
        { id: "wall-2", startVertexId: "b", endVertexId: "c", label: "Wall 2", lockedAngle: 45 as const },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(PlanCanvas, {
          room,
          cabinets: [],
          selectedUid: null,
          onSelect: () => undefined,
          onMove: () => undefined,
          showWallLayer: true,
          activeWall: "wall-1" as any,
          onSelectWall: () => undefined,
          onOpenWallSettings: () => undefined,
        }),
      ),
    );

    expect(markup).toContain('aria-label="User measured walls"');
    expect(markup).toContain('data-testid="custom-wall-context-target"');
    expect(markup).toContain('Right-click Wall 1 for Attributes');
    expect(markup).not.toContain('data-testid="room-wall-top"');
    expect(markup).not.toContain('data-testid="room-wall-right"');
  });

  it("routes right-click and double-click wall gestures to the existing attributes dialog", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

    expect(source).toContain("const onWallContextMenu = (event: React.MouseEvent, side: WallSide) => {");
    expect(source).toContain("onOpenWallSettings?.(side);");
    expect(source).toContain('data-testid="custom-wall-context-target"');
    expect(source).toContain("onContextMenu={(event) => onWallContextMenu(event, wall.id as WallSide)}");
    expect(source).toContain("onContextMenu={(event) => onWallContextMenu(event, side)}");
  });

	  it("positions an opening on its assigned diagonal custom wall instead of the graph boundary", () => {
	    const room: RoomData = {
	      width: 156.154,
	      depth: 55.154,
	      ceilingHeight: 96,
	      openWallPath: true,
	      vertices: [
	        { id: "a", x: 0, y: 0 },
	        { id: "b", x: 101, y: 0 },
	        { id: "c", x: 156.154, y: 55.154 },
	      ],
	      customWalls: [
	        { id: "wall-1", startVertexId: "a", endVertexId: "b", label: "Wall 1" },
	        { id: "wall-2", startVertexId: "b", endVertexId: "c", label: "Wall 2", lockedAngle: 45 },
	      ],
	    };
	    const opening = {
	      uid: "opening-1",
	      kind: "opening",
	      label: "Cased Opening 36\"",
	      side: "wall-2" as any,
	      offset: 12,
	      width: 36,
	      height: 80,
	      sill: 0,
	    } satisfies WallOpening;

	    const frame = planOpeningWallFrame(opening, room);
	    expect(frame).not.toBeNull();
	    expect(frame!.angleDeg).toBeCloseTo(45, 3);
	    expect(frame!.centerX).toBeCloseTo(122.213, 3);
	    expect(frame!.centerY).toBeCloseTo(21.213, 3);
  });
});

describe("window attributes gestures", () => {
  it("opens the exact window editor on right-click, double-click, and keyboard activation", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

    expect(source).toContain("onOpenWindowAttributes?: (uid: string) => void;");
    expect(source).toContain("if (e.button === 2) return;");
    expect(source).toContain("onContextMenu={(event) => openOpeningAttributes(event, o)}");
    expect(source).toContain("onDoubleClick={(event) => openOpeningAttributes(event, o)}");
    expect(source).toContain('data-testid={o.kind === "window" ? "plan-window-attributes-target"');
    expect(source).toContain("onOpenWindowAttributes?.(opening.uid);");
  });

  it("renders an accessible window edit target rather than a drag-only element", () => {
    const opening: WallOpening = {
      uid: "window-36",
      kind: "window",
      label: "Window 36\"",
      side: "top",
      offset: 30,
      width: 36,
      height: 36,
      sill: 42,
    };
    const markup = renderToStaticMarkup(
      createElement(LanguageProvider, null, createElement(PlanCanvas, {
        room: { width: 144, depth: 120, ceilingHeight: 96 },
        cabinets: [], selectedUid: null, onSelect: () => undefined, onMove: () => undefined,
        showWallLayer: true, openings: [opening], onSelectOpening: () => undefined,
        onOpenWindowAttributes: () => undefined,
      })),
    );

    expect(markup).toContain('data-testid="plan-window-attributes-target"');
    expect(markup).toContain('aria-label="Window 36&quot;. Right-click, double-click, or press Enter to edit."');
  });

  it("highlights the exact selected wall endpoint while a window distance is being measured", () => {
    const opening: WallOpening = {
      uid: "window-reference",
      kind: "window",
      label: "Window 36\"",
      side: "top",
      offset: 30,
      width: 36,
      height: 36,
      sill: 42,
    };
    const markup = renderToStaticMarkup(
      createElement(LanguageProvider, null, createElement(PlanCanvas, {
        room: { width: 144, depth: 120, ceilingHeight: 96 },
        cabinets: [], selectedUid: null, onSelect: () => undefined, onMove: () => undefined,
        showWallLayer: true, openings: [opening],
        openingMeasurementReference: { openingUid: "window-reference", reference: "end" },
      })),
    );

    expect(markup).toContain('data-testid="window-measurement-reference-marker"');
    expect(markup).toContain("Wall end / right");
    expect(markup).toContain("left:576px;top:0");
  });

  it("shows a paired green canvas confirmation when a sink base has snapped beneath its window", () => {
    const opening: WallOpening = {
      uid: "sink-window", kind: "window", label: "Sink window", side: "top",
      offset: 54, width: 36, height: 36, sill: 42,
    };
    const sinkBase = {
      ...base,
      uid: "sb36-window-centered",
      masterCode: "SB36",
      description: "Sink Base 36",
      x: 54,
      y: 0,
      width: 36,
      depth: 24,
    } as PlacedCabinet;
    const markup = renderToStaticMarkup(
      createElement(LanguageProvider, null, createElement(PlanCanvas, {
        room: { width: 144, depth: 120, ceilingHeight: 96 },
        cabinets: [sinkBase], selectedUid: sinkBase.uid, onSelect: () => undefined, onMove: () => undefined,
        showWallLayer: true, openings: [opening],
        sinkWindowSnap: { cabinetUid: sinkBase.uid, openingUid: opening.uid, key: 1 },
      })),
    );

    expect(markup).toContain('data-sink-window-snap-confirmed="true"');
    expect(markup).toContain('data-testid="sink-window-snap-cabinet-indicator"');
    expect(markup).toContain('data-testid="sink-window-snap-window-indicator"');
    expect(markup).toContain("Centered to window");
    expect(markup).toContain("Sink aligned");
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
	    expect(source).toContain("automaticSnapping ? wallGapFitPreview(gaps, targetAlong, width) : wallGapFreehandPreview(gaps, targetAlong, width)");
    expect(source).toContain("onDropNew(e.clientX, e.clientY, rect, ppi, !automaticSnapping, targetWall)");
	    expect(source).toContain("hold Shift for freehand");
	  });
});

describe("plan countertop material scopes", () => {
  it("renders visible island countertop fragments from the island material while perimeter runs retain the wall material", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");
    expect(source).toContain("islandCountertopVisibleRects(island, cabinets)");
    expect(source).toContain('data-countertop-scope={s.kind === "island" ? "island" : "perimeter"}');
    expect(source).toContain('s.kind === "island" ? islandCountertopMaterialId ?? countertopMaterialId : countertopMaterialId');
  });

  it("rotates an attached sink around its own center using the owning cabinet angle", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");
    expect(source).toContain('transform: s.planRotation ? `rotate(${s.planRotation}deg)` : undefined');
    expect(source).toContain('transformOrigin: "50% 50%"');
  });

  it("clips connected peninsula slabs to the shared miter polygon instead of stacking rectangles", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");
    expect(source).toContain("clipPath: s.polygon");
    expect(source).toContain("s.polygon.map((point)");
  });
});

describe("island work-zone face selection", () => {
  it("selects the nearest outward island run on every edge", () => {
    const rect = { width: 240, height: 160 };
    expect(nearestIslandFaceInRect({ x: 8, y: 80 }, rect)).toBe("left");
    expect(nearestIslandFaceInRect({ x: 232, y: 80 }, rect)).toBe("right");
    expect(nearestIslandFaceInRect({ x: 120, y: 8 }, rect)).toBe("back");
    expect(nearestIslandFaceInRect({ x: 120, y: 152 }, rect)).toBe("front");
  });

  it("renders an accessible island selector with right-click and keyboard attributes wiring", () => {
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
          island: { x: 36, y: 36, width: 72, depth: 48, activeFace: "front" },
          activeIslandFace: "front",
          onSelectIslandFace: () => undefined,
          onOpenIslandAttributes: () => undefined,
        }),
      ),
    );
    expect(markup).toContain('data-testid="island-work-zone"');
    expect(markup).toContain("active front face");
    expect(markup).toContain('tabindex="0"');
	  const zoneTag = markup.match(/<div[^>]*data-testid="island-work-zone"[^>]*>/)?.[0];
	  expect(zoneTag).toBeDefined();
	  expect(zoneTag).toContain("background:transparent");
	  expect(zoneTag).not.toContain("rgba(212,167,90,0.10)");
  });
});
