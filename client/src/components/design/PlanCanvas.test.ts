import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { FLOOR_PLAN_ZOOM_MAX, FLOOR_PLAN_ZOOM_MIN, PlanCanvas, clampFloorPlanZoom, formatFloorPlanDimension, nearestIslandFaceInRect, parallelWallLabelAngleDeg, peninsulaCatalogDropHitRadiusIn, planCabinetClipPath, planCornerGeometry, planOpeningWallFrame, planTapeMeasure, snapPlanMeasurePoint } from "./PlanCanvas";
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

describe("peninsula catalog drop reach", () => {
  it("recognizes a range held against either cabinet face instead of only the wall center line", () => {
    // A 25-inch-deep range reaches 18½ inches: its 12½-inch body half-depth
    // plus the shared six-inch wall magnet. This covers the inside face shown
    // in the range-through-peninsula report while retaining the touch target.
    expect(peninsulaCatalogDropHitRadiusIn(25, 4)).toBe(18.5);
    expect(peninsulaCatalogDropHitRadiusIn(0, 4)).toBe(10);
  });
});

describe("plan corner geometry", () => {
  it("keeps an AW wall-end wedge in the cabinet's local wall-run frame instead of aiming it at the nearest room corner", () => {
    const aw = {
      ...base,
      uid: "aw1230-middle-of-run",
      masterCode: "AW1230",
      description: '12" × 30" × 12" Angled Wall End Cabinet',
      placement: "wall" as const,
      x: 60,
      y: 0,
      width: 12,
      depth: 12,
      height: 30,
      wallId: "top" as const,
      wallOffset: 60,
      customProfile: "wall_angle",
    };
    expect(planCornerGeometry(aw)).toMatchObject({ isCorner: false, isDiagonal: false });
    expect(planCabinetClipPath(aw, { width: 144, depth: 120, ceilingHeight: 96 })).toBe("polygon(0 0, 100% 0, 100% 100%)");
  });

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

describe("Floor Plan view zoom", () => {
  it("clamps view-only zoom without changing inch geometry", () => {
    expect(clampFloorPlanZoom(-10)).toBe(FLOOR_PLAN_ZOOM_MIN);
    expect(clampFloorPlanZoom(99)).toBe(FLOOR_PLAN_ZOOM_MAX);
    expect(clampFloorPlanZoom(1.126)).toBe(1.13);
    expect(clampFloorPlanZoom(Number.NaN)).toBe(1);
  });

  it("renders zoom-in, zoom-out, and fit controls without coupling them to cabinet placement", () => {
    const markup = renderToStaticMarkup(
      createElement(LanguageProvider, null, createElement(PlanCanvas, {
        room: { width: 144, depth: 120, ceilingHeight: 96 },
        cabinets: [], selectedUid: null, onSelect: () => undefined, onMove: () => undefined,
      })),
    );

    expect(markup).toContain('data-testid="floor-plan-canvas"');
    expect(markup).toContain('data-floor-plan-zoom="1"');
    expect(markup).toContain('data-testid="floor-plan-zoom-out"');
    expect(markup).toContain('data-testid="floor-plan-zoom-in"');
    expect(markup).toContain('data-testid="floor-plan-zoom-fit"');
    expect(markup).toContain('data-testid="floor-plan-zoom-value"');
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
	    expect(markup).toContain('data-testid="custom-wall-mitered-outline"');
	    expect(markup).toContain('data-testid="custom-wall-context-target"');
	    expect(markup).toContain('data-testid="custom-wall-length-bubble"');
	    expect(markup).toContain('rotate(45)');
	    expect(markup).toContain('Right-click Wall 1 for Attributes');
	    expect(markup).toMatch(/data-testid="custom-wall-context-target"[^>]*stroke-linecap="butt"/);
    expect(markup).not.toContain('data-testid="room-wall-top"');
    expect(markup).not.toContain('data-testid="room-wall-right"');
  });

  it("keeps wall-size bubbles parallel to a run without turning their text upside down", () => {
    expect(parallelWallLabelAngleDeg(60, 60)).toBe(45);
    expect(parallelWallLabelAngleDeg(0, 72)).toBe(90);
    expect(parallelWallLabelAngleDeg(-60, 60)).toBe(-45);
    expect(parallelWallLabelAngleDeg(-72, 0)).toBe(0);
  });

  it("formats annotation values in the selected display units without changing inch geometry", () => {
    expect(formatFloorPlanDimension(101, "imperial")).toBe('101"');
    expect(formatFloorPlanDimension(101, "metric")).toBe("2565 mm");
    expect(formatFloorPlanDimension(0.625, "metric")).toBe("16 mm");
  });

  it("renders display-only outer and run dimension lines on a measured 45-degree wall", () => {
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
    const cabinet = {
      ...base,
      uid: "dimension-b36",
      masterCode: "B36",
      description: "36 inch Base Cabinet",
      width: 36,
      depth: 24,
      height: 34.5,
      x: 0,
      y: 0,
      wallId: "wall-1",
      wallOffset: 0,
    } as PlacedCabinet;
    const markup = renderToStaticMarkup(createElement(LanguageProvider, null, createElement(PlanCanvas, {
      room, cabinets: [cabinet], selectedUid: null, onSelect: () => undefined, onMove: () => undefined,
      showWallLayer: true, autoDimensions: true,
    })));

    expect(markup).toContain('data-testid="floor-plan-live-dimensions"');
    expect(markup).toContain('data-testid="floor-dimension-wall-wall-1"');
    expect(markup).toContain('data-testid="floor-dimension-wall-wall-2"');
    expect(markup).toContain('data-testid="floor-dimension-run-wall-1-base-0"');
    expect(markup).not.toContain('data-testid="custom-wall-length-bubble"');
  });

  it("keeps live cabinet, opening, and wall dimensions on exterior drafting rails", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

    expect(source).toContain("const baseRailOffsetIn = 3;");
    expect(source).toContain("const wallRailOffsetIn = 6;");
    expect(source).toContain("const openingRailOffsetIn = 8.5;");
    expect(source).toContain("const outerRailOffsetIn = 11;");
    expect(source).toContain("const wallStart = wallPoint(frame, segment.start);");
    expect(source).toContain("const wallEnd = wallPoint(frame, segment.start + segment.length);");
    expect(source).toContain("const PADDING = autoDimensions && measurementBubblesVisible ? 104 : 48;");
  });

  it("uses saved label appearance and marks exterior rails as manually draggable", () => {
    const room: RoomData = {
      width: 120,
      depth: 96,
      ceilingHeight: 96,
      dimensionLabelStyle: { fontSizePx: 14, color: "#c026d3" },
      dimensionAdjustments: { "wall:top": { alongIn: 4, outsideIn: 3 } },
    };
    const markup = renderToStaticMarkup(createElement(LanguageProvider, null, createElement(PlanCanvas, {
      room, cabinets: [], selectedUid: null, onSelect: () => undefined, onMove: () => undefined,
      showWallLayer: true, autoDimensions: true, onDimensionAdjustmentChange: () => undefined,
    })));

    expect(markup).toContain('data-dimension-key="wall:top"');
    expect(markup).toContain('font-size="14"');
    expect(markup).toContain('fill="#c026d3"');
    expect(markup).toContain("cursor-grab");
  });

  it("renders exterior, run, and room-size dimensions in saved metric units", () => {
    const room: RoomData = {
      width: 120,
      depth: 96,
      ceilingHeight: 96,
      dimensionLabelStyle: { unitSystem: "metric" },
    };
    const cabinet = {
      ...base,
      uid: "metric-b36",
      masterCode: "B36",
      description: "36 inch Base Cabinet",
      width: 36,
      depth: 24,
      height: 34.5,
      x: 0,
      y: 72,
      wallId: "bottom",
      wallOffset: 0,
    } as PlacedCabinet;
    const markup = renderToStaticMarkup(createElement(LanguageProvider, null, createElement(PlanCanvas, {
      room, cabinets: [cabinet], selectedUid: null, onSelect: () => undefined, onMove: () => undefined,
      showWallLayer: true, autoDimensions: true,
    })));

    expect(markup).toContain("3048 mm");
    expect(markup).toContain("914 mm");
    expect(markup).toContain("2438 mm");
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

describe("cabinet attribute gestures", () => {
  it("keeps one cabinet click available for selection and drag while right-click and double-click edit", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

    expect(source).toContain("// Double-tap / double-click → open the attributes editor.");
    expect(source).toContain("onOpenAttributes(p.uid);");
    expect(source).toContain("onContextMenu={(event) => {");
    expect(source).toContain("onOpenAttributes(p.uid);");
    expect(source).toContain("onDoubleClick={");
    expect(source).toContain("setDragUid(p.uid);");
  });
});

describe("refrigerator magnetic preview wiring", () => {
  it("keeps selected refrigerator source parts out of their own drag blockers and uses the shared panel envelope", () => {
    const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

    expect(source).toContain("refrigeratorMagneticSnapEnvelope(cabinet, cabinets, room)");
    expect(source).toContain("configuredRefrigeratorAssemblyMembers(cabinets, cabinet, room)");
    expect(source).toContain("!refrigeratorMemberUids.has(c.uid)");
    expect(source).toContain("magneticEnvelope: refrigeratorEnvelope");
  });
});

describe("plan placement assistance wiring", () => {
	 it("keeps canvas measurement bubbles light and puts measured-plan rotation on the drawing surface", () => {
	   const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");
	   expect(source).toContain('data-testid="floor-plan-action-rail"');
	   expect(source).toContain('flex max-w-[calc(100%-1.5rem)] flex-nowrap items-center justify-end gap-1 whitespace-nowrap');
	   expect(source).toContain('max-w-[calc(100%-1.5rem)]');
	   expect(source).toContain('flex shrink-0 flex-nowrap items-center gap-1');
	   expect(source).toContain('className="h-1.5 w-12 accent-[#1a2744] disabled:cursor-not-allowed"');
	   expect(source).toContain('onToggleWallLayer?: () => void;');
	   expect(source).toContain('data-testid="floor-plan-wall-layer-toggle"');
	   expect(source).toContain('<span className="max-[300px]:hidden sm:hidden">Walls</span>');
	   expect(source).toContain('<RotateCw className="h-4 w-4" /> <span className="max-[300px]:hidden">Rotate</span>');
	   expect(source).toContain('data-testid="rotate-custom-drawing"');
	   expect(source).toContain('aria-label="Rotate the complete measured drawing 90 degrees clockwise"');
	   expect(source).toContain('bg-white/98 px-2 py-1 text-center text-[10px] font-semibold text-slate-950');
	   expect(source).toContain('font-extrabold text-slate-950 shadow-sm whitespace-nowrap');
	 });

	 it("offers one upper-right control that hides every Floor Plan measurement layer without changing the room", () => {
	   const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");
	   expect(source).toContain('data-testid="floor-plan-measurement-bubbles-toggle"');
	   expect(source).toContain('data-testid="floor-plan-measurement-opacity-slider"');
	   expect(source).toContain('data-testid="floor-plan-measurement-opacity-value"');
	   expect(source).toContain('aria-label="Measurement bubble opacity"');
	   expect(source).toContain('min={25}');
	   expect(source).toContain('max={100}');
	   expect(source).toContain('setMeasurementBubbleOpacity');
	   expect(source).toContain('Hide all Floor Plan measurement bubbles for a cleaner drawing');
	   expect(source).toContain('measurementBubblesVisible && autoDimensions');
	   expect(source).toContain('measurementBubblesVisible && dragTape');
	   expect(source).toContain('measurementBubblesVisible && measure');
	   expect(source).toContain('measurementBubblesVisible && xTicks.map');
	   expect(source).toContain('measurementBubblesVisible && yTicks.map');
	   expect(source).toContain('style={measurementBubbleStyle}');
	   expect(source).toContain('data-testid={`live-gap-dimension-bubble-${segment.side}`}');
	   expect(source).toContain('const clearanceFontSize');
	   expect(source).toContain('fillOpacity={0.98}');
	   expect(source).toContain('const label = formatDisplayDimension(segment.value);');
	 });

	  it("shows exact dimensions and flush-seam requirements when hovering DB24 or a dishwasher", () => {
	    const db24 = {
	      ...base,
	      uid: "db24-placement-detail",
	      masterCode: "3-DB24",
	      description: "24 inch three drawer base",
	      width: 24,
	      depth: 25.4,
	      height: 34.5,
	    } as PlacedCabinet;
	    const dishwasher = {
	      ...base,
	      uid: "dishwasher-placement-detail",
	      masterCode: "DW-24",
	      description: "Dishwasher 24 inch",
	      placement: "appliance",
	      width: 24,
	      depth: 24,
	      height: 34.5,
	    } as PlacedCabinet;
	    const markup = renderToStaticMarkup(
	      createElement(LanguageProvider, null, createElement(PlanCanvas, {
	        room: { width: 144, depth: 120, ceilingHeight: 96 },
	        cabinets: [db24, dishwasher], selectedUid: null, onSelect: () => undefined, onMove: () => undefined,
	        showWallLayer: true,
	      })),
	    );

	    expect(markup).toContain('data-placement-detail-tooltip="true"');
	    expect(markup).toContain("DB24 drawer base");
	    expect(markup).toContain("Dishwasher");
	    expect(markup).toContain("flush edge contact is allowed");
	  });

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
		    expect(source).toContain("Tape {formatDisplayDimension(measure.distIn)}");
		    expect(source).toContain("Point-to-point · X {formatDisplayDimension(measure.dx)} · Y {formatDisplayDimension(measure.dy)}");
		    expect(source).toContain("Use the catalog fit banner for usable cabinet clearance");
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

	  it("renders a 45-degree island guide in the same rotated frame as its cabinet assembly", () => {
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
	          island: { x: 36, y: 36, width: 72, depth: 48, rotation: 45, activeFace: "front" },
	          activeIslandFace: "front",
	          onSelectIslandFace: () => undefined,
	          onOpenIslandAttributes: () => undefined,
	        }),
	      ),
	    );
	    const zoneTag = markup.match(/<div[^>]*data-testid="island-work-zone"[^>]*>/)?.[0] ?? "";
	    expect(zoneTag).toContain("rotate(45deg)");
	    expect(zoneTag).toContain("transform-origin:50% 50%");
	  });
});
