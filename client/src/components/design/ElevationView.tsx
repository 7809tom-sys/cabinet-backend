import {
  PlacedCabinet, RoomData, STD, elevationBox, rotatedSize, WallOpening,
  FinishColors, DEFAULT_FINISH_COLORS, CROWN_HEIGHT_IN, TOE_KICK_HEIGHT_IN, BATTEN_WIDTH_IN, LIGHT_RAIL_HEIGHT_IN,
  type DoorPanelKind, type WallSide, cabinetWall,
  countertopMaterial, roomCeiling, bearsCountertop,
  wallCeiling, wallCeilingIsSloped,
  backsplashMaterial,
} from "@/lib/design";
import {
  type HardwareStyleId,
  hardwareStyle as resolveHardwareStyle,
  doorCountForCabinet,
  drawerCountForCabinet,
  displayDrawerCount,
} from "@/lib/hardware";
import { useRef, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  room: RoomData;
  cabinets: PlacedCabinet[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  // Which physical wall to view, in plan terms (top/bottom/left/right).
  // Back-compat: "front" maps to bottom, "back" maps to top.
  wall: WallSide | "front" | "back";
  // Optional: lets the user flip the displayed wall straight from the elevation
  // panel (a compact Back/Front/Left/Right switcher) instead of going back to
  // the top toolbar. When omitted, the switcher is hidden.
  onSelectWall?: (side: WallSide) => void;
  // When set, draw a thin colored countertop band on top of the base run at the
  // 36" counter line, colored by the chosen material. null/undefined = no band.
  countertopMaterialId?: string | null;
  // When set, draw a backsplash texture between the countertop (36") and wall
  // cabinet bottom (54"). null/undefined = no backsplash drawn.
  backsplashMaterialId?: string | null;
  openings?: WallOpening[];
  finish?: FinishColors;
  crown?: boolean;
  toeKick?: boolean;
  batten?: boolean;
  lightRail?: boolean;
  panelKind?: DoorPanelKind;
  // Optional per-cabinet finish + door-panel resolvers for TWO-TONE designs.
  // When provided, each cabinet draws in its own finish/panel; otherwise the
  // single `finish`/`panelKind` props apply to every cabinet.
  finishFor?: (cab: PlacedCabinet) => FinishColors;
  panelKindFor?: (cab: PlacedCabinet) => DoorPanelKind;
  // When this elevation is rendered inside a horizontally-mirrored container
  // (the left half of CornerView), set `mirror` so text labels are counter-
  // flipped to stay readable. `hideSwitcher` removes the inner wall picker so
  // CornerView can show its own corner picker instead.
  mirror?: boolean;
  hideSwitcher?: boolean;
  // Decorative hardware spec to draw on the fronts (knob / pull / cup). When
  // omitted or "none", no hardware is drawn.
  hardwareStyleId?: HardwareStyleId | null;
  // Corner cabinets that physically wrap THIS corner but are owned by the
  // adjoining wall. CornerView injects them so a lazy-Susan / diagonal / blind
  // corner unit is drawn on BOTH walls, pinned to the seam (corner end of the
  // wall = posAlong 0). These are render-only ghosts of the real placed cabinet.
  seamCabinets?: PlacedCabinet[];
}

export function ElevationView({
  room, cabinets, selectedUid, onSelect, wall, onSelectWall, countertopMaterialId = null, backsplashMaterialId = null, openings = [],
  finish = DEFAULT_FINISH_COLORS, crown = false, toeKick = false, batten = false, lightRail = false,
  panelKind = "shaker", mirror = false, hideSwitcher = false,
  hardwareStyleId = null,
  finishFor, panelKindFor, seamCabinets = [],
}: Props) {
  const { t } = useLanguage();
  const hw = resolveHardwareStyle(hardwareStyleId);
  // Counter-flip transform for text so labels read correctly when this whole
  // elevation sits inside a scaleX(-1) container.
  const textFlip: React.CSSProperties | undefined = mirror ? { transform: "scaleX(-1)" } : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const PADDING = 40;

  // Normalize legacy "front"/"back" to plan WallSide values.
  const side: WallSide =
    wall === "front" ? "bottom" : wall === "back" ? "top" : (wall as WallSide);

  // Resolve this wall's ceiling (flat or sloped). The wall box is drawn to the
  // HIGH end so a sloped ceiling has room; the slope itself is drawn as an
  // overlay below the box top. heightLeft/heightRight are the ceiling heights at
  // the visually LEFT and RIGHT ends of this elevation. `wallCeilingAt` works in
  // plan order (start->end); when this view is mirrored (CornerView left wall)
  // the on-screen left/right are swapped, so we flip them back for display.
  const wc = wallCeiling(room, side);
  const sloped = wallCeilingIsSloped(room, side);
  const ceilHigh = wc.high;
  // Plan-order start/end heights.
  const startH = (wc.slopeFrom ?? "start") === "start" ? wc.high : wc.low;
  const endH = (wc.slopeFrom ?? "start") === "start" ? wc.low : wc.high;
  const heightLeft = mirror ? endH : startH;
  const heightRight = mirror ? startH : endH;
  // Wall height shown in the elevation tracks the room's real ceiling height,
  // drawn to the high end so a 9ft/10ft (or sloped) ceiling shows more wall.
  const WALL_TOTAL_HEIGHT = ceilHigh;
  const WALL_LABELS: Record<WallSide, string> = {
    top: t("plan_wall_back"), bottom: t("plan_wall_front"), left: t("plan_wall_left"), right: t("plan_wall_right"),
  };
  const horizontal = side === "top" || side === "bottom";
  const planSpan = horizontal ? room.width : room.depth;

  // Only show cabinets that actually sit on the wall being viewed, so other
  // walls' cabinets don't bleed into this elevation.
  const onThisWall = cabinets.filter((c) => cabinetWall(c, room) === side);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const availW = el.clientWidth - PADDING * 2;
      const availH = el.clientHeight - PADDING * 2;
      const fitPpi = Math.min(availW / planSpan, availH / WALL_TOTAL_HEIGHT);
      setPpi(Math.max(1.5, Math.min(fitPpi, 7)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [planSpan, WALL_TOTAL_HEIGHT]);

  const wallPxW = planSpan * ppi;
  const wallPxH = WALL_TOTAL_HEIGHT * ppi;

  const sorted = [...onThisWall].sort((a, b) => {
    const order: Record<string, number> = { tall: 0, base: 1, appliance: 1, wall: 2 };
    return (order[a.placement] ?? 1) - (order[b.placement] ?? 1);
  });

  // Openings on the wall being viewed.
  const viewOpenings = openings.filter((o) => o.side === side);

  // Draw a single cabinet/appliance face box. Shared by the main run and by the
  // seam (corner) cabinets injected from CornerView. When `seam` is set the box
  // is pinned to the corner end of the wall (posAlong 0), drawn as a render-only
  // ghost of a corner cabinet that physically wraps this corner.
  const renderCabinetBox = (p: PlacedCabinet, seam = false) => {
    const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
    const posAlong = seam ? 0 : (horizontal ? p.x : p.y);
    const { bottom, height } = elevationBox(p, room);
    const isWall = p.placement === "wall";
    const isAppliance = p.placement === "appliance";
    const isSelected = p.uid === selectedUid;
    const cabFinish = finishFor ? finishFor(p) : finish;
    const cabPanelKind = panelKindFor ? panelKindFor(p) : panelKind;
    const faceFill = isAppliance
      ? "linear-gradient(to bottom, #d9dee6 0%, #c2c9d4 100%)"
      : cabFinish.face;
    const edgeColor = isAppliance ? "#6b7280" : cabFinish.edge;

    return (
      <div
        key={seam ? `${p.uid}-seam` : p.uid}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(p.uid);
        }}
        className="absolute cursor-pointer flex flex-col items-center justify-center overflow-hidden"
        style={{
          left: posAlong * ppi,
          width: sizeAlong * ppi,
          bottom: bottom * ppi,
          height: height * ppi,
          background: faceFill,
          border: isSelected
            ? "2px solid #1a2744"
            : `1.5px solid ${edgeColor}`,
          boxShadow: isSelected ? "0 0 0 3px rgba(212,167,90,0.5)" : undefined,
          opacity: seam ? 0.96 : undefined,
        }}
        title={`${p.masterCode} — ${p.description}`}
      >
        <div className="w-full h-full relative">
          {!isAppliance && (
            <DoorFront
              kind={cabPanelKind}
              edge={edgeColor}
              face={cabFinish.face}
              doors={doorCountForCabinet(p)}
              drawers={displayDrawerCount(p)}
              isWall={isWall}
            />
          )}
          {!isAppliance && hw.id !== "none" && (
            <HardwareOverlay
              doors={doorCountForCabinet(p)}
              drawers={drawerCountForCabinet(p)}
              doorPiece={hw.doorPiece}
              drawerPiece={hw.drawerPiece}
              accent="#1a2744"
            />
          )}
          {/* Hinge indicator intentionally removed — no hardware shown */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[8px] font-bold truncate px-0.5" style={{ color: isAppliance ? "#1a2744" : cabFinish.label, ...textFlip }}>
              {p.masterCode}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#dde6f0] to-[#eef1f5] select-none"
      onClick={() => onSelect(null)}
    >
      <div
        className="absolute"
        style={{
          width: wallPxW,
          height: wallPxH,
          left: "50%",
          bottom: PADDING,
          transform: "translateX(-50%)",
          background: "linear-gradient(to bottom, #f7f9fc 0%, #eef2f7 100%)",
          borderLeft: "2px solid #1a2744",
          borderRight: "2px solid #1a2744",
          borderTop: "2px solid #1a2744",
        }}
      >
        <div className="absolute left-0 right-0 bottom-0 border-b-[3px] border-[#1a2744]" />
        {/* Sloped ceiling overlay: when this wall has an angled ceiling, shade the
            dead space above the slope line (outside the room) and draw the slope
            as a solid ceiling line. The wall box height equals the HIGH end, so
            the slope drops from the high corner down to (ceilHigh-low) above the
            box bottom on the low side. */}
        {sloped && (() => {
          const W = wallPxW;
          const H = wallPxH;
          // y from the TOP of the box for each end (0 = box top = high ceiling).
          const yLeft = (ceilHigh - heightLeft) * ppi;
          const yRight = (ceilHigh - heightRight) * ppi;
          return (
            <svg
              className="absolute inset-0 pointer-events-none overflow-visible"
              width={W}
              height={H}
              style={{ left: 0, top: 0 }}
            >
              {/* Dead space above the ceiling (outside the room). */}
              <polygon
                points={`0,0 ${W},0 ${W},${yRight} 0,${yLeft}`}
                fill="#c9d2de"
                opacity={0.85}
              />
              {/* Hatch to read clearly as "outside / above ceiling". */}
              <polygon
                points={`0,0 ${W},0 ${W},${yRight} 0,${yLeft}`}
                fill="url(#slopeHatch)"
              />
              <defs>
                <pattern id="slopeHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#8a98ad" strokeWidth="1" opacity="0.5" />
                </pattern>
              </defs>
              {/* The sloped ceiling line itself. */}
              <line x1={0} y1={yLeft} x2={W} y2={yRight} stroke="#1a2744" strokeWidth={3} />
            </svg>
          );
        })()}
        {/* Ceiling line label so the chosen ceiling height is visible at a glance.
            Shows both ends when the ceiling is sloped. */}
        <div className="absolute -top-[14px] right-0 text-[9px] font-medium text-[#1a2744]/70" style={textFlip}>
          {sloped
            ? t("dt_ev_ceiling_slope", { hi: Math.round(ceilHigh), lo: Math.round(Math.min(heightLeft, heightRight)) })
            : t("dt_ev_ceiling", { n: Math.round(WALL_TOTAL_HEIGHT) })}
        </div>
        <div
          className="absolute left-0 right-0 border-b border-dashed border-[#b08d57]/40"
          style={{ bottom: STD.COUNTERTOP_HEIGHT * ppi }}
        />

        {/* Countertop band: a thin colored slab sitting on top of the base run,
            its top edge on the 36" counter line, colored by the chosen material.
            Drawn as one band PER CONTIGUOUS RUN of base cabinets only — appliances
            (refrigerator, range, dishwasher) and tall cabinets are excluded so the
            counter never appears to run through the fridge or bridge an appliance
            gap. */}
        {countertopMaterialId && (() => {
          const mat = countertopMaterial(countertopMaterialId);
          const THICKNESS_IN = 1.5;
          const OVERHANG_IN = 0.75; // a little nosing past the cabinet faces
          const TOL = 1.5; // inches: treat near-touching base cabinets as one run
          // Base-cabinet spans along this wall, sorted by start position.
          const spans = sorted
            .filter((p) => bearsCountertop(p))
            .map((p) => {
              const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
              const posAlong = horizontal ? p.x : p.y;
              return { start: posAlong, end: posAlong + sizeAlong };
            })
            .sort((a, b) => a.start - b.start);
          if (spans.length === 0) return null;
          // Merge adjacent/overlapping spans into contiguous runs; a gap larger
          // than TOL (e.g. where the fridge sits) breaks the counter.
          const runs: { start: number; end: number }[] = [];
          for (const s of spans) {
            const last = runs[runs.length - 1];
            if (last && s.start <= last.end + TOL) {
              last.end = Math.max(last.end, s.end);
            } else {
              runs.push({ start: s.start, end: s.end });
            }
          }
          return (
            <>
              {runs.map((r, i) => (
                <div
                  key={`ct${i}`}
                  className="absolute z-20 pointer-events-none rounded-[1px]"
                  style={{
                    left: (r.start - OVERHANG_IN) * ppi,
                    width: (r.end - r.start + OVERHANG_IN * 2) * ppi,
                    bottom: STD.COUNTERTOP_HEIGHT * ppi,
                    height: THICKNESS_IN * ppi,
                    background: mat.fill,
                    borderTop: `1px solid ${mat.edge}`,
                    borderBottom: `1px solid ${mat.edge}`,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                  }}
                  title={t("dt_ev_countertop", { material: mat.name })}
                />
              ))}
            </>
          );
        })()}

        {/* Backsplash: fills the zone between countertop (36") and wall cabinet
            bottom (54"). Only drawn on walls that have at least one base cabinet
            run (same spans as the countertop). */}
        {backsplashMaterialId && (() => {
          const bsMat = backsplashMaterial(backsplashMaterialId);
          const BACKSPLASH_BOTTOM = STD.COUNTERTOP_HEIGHT + STD.COUNTERTOP_THICKNESS; // ~37.5"
          const BACKSPLASH_TOP = STD.WALL_MOUNT_BOTTOM; // 54"
          const BACKSPLASH_HEIGHT = BACKSPLASH_TOP - BACKSPLASH_BOTTOM;
          const TOL = 1.5;
          const spans = sorted
            .filter((p) => bearsCountertop(p))
            .map((p) => {
              const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
              const posAlong = horizontal ? p.x : p.y;
              return { start: posAlong, end: posAlong + sizeAlong };
            })
            .sort((a, b) => a.start - b.start);
          if (spans.length === 0) return null;
          const runs: { start: number; end: number }[] = [];
          for (const s of spans) {
            const last = runs[runs.length - 1];
            if (last && s.start <= last.end + TOL) last.end = Math.max(last.end, s.end);
            else runs.push({ start: s.start, end: s.end });
          }
          const tileWPx = Math.max(8, (bsMat.pattern === "subway" ? 16 : bsMat.pattern === "mosaic" ? 5 : 12) * ppi / 12);
          const tileHPx = Math.max(6, (bsMat.pattern === "subway" ? 8 : bsMat.pattern === "mosaic" ? 5 : 12) * ppi / 12);
          const bgImage = bsMat.pattern === "subway"
            ? `repeating-linear-gradient(0deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx}px), repeating-linear-gradient(90deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileWPx}px)`
            : bsMat.pattern === "mosaic"
            ? `repeating-linear-gradient(0deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx}px), repeating-linear-gradient(90deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileWPx}px)`
            : bsMat.pattern === "large-format"
            ? `repeating-linear-gradient(0deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx * 2}px), repeating-linear-gradient(90deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileWPx * 2}px)`
            : bsMat.pattern === "herringbone"
            ? `repeating-linear-gradient(45deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx}px), repeating-linear-gradient(-45deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx}px)`
            : bsMat.pattern === "hexagon"
            ? `radial-gradient(circle at 50% 50%, ${bsMat.grout} 1px, transparent 1px)`
            : undefined;
          return (
            <>
              {runs.map((r, i) => (
                <div
                  key={`bs${i}`}
                  className="absolute z-10 pointer-events-none"
                  style={{
                    left: r.start * ppi,
                    width: (r.end - r.start) * ppi,
                    bottom: BACKSPLASH_BOTTOM * ppi,
                    height: BACKSPLASH_HEIGHT * ppi,
                    background: bsMat.fill,
                    backgroundImage: bgImage,
                    backgroundSize: bsMat.pattern === "hexagon" ? `${tileWPx}px ${tileHPx}px` : undefined,
                    borderTop: `1px solid ${bsMat.grout}`,
                    borderBottom: `1px solid ${bsMat.grout}`,
                    opacity: 0.85,
                  }}
                  title={`Backsplash: ${bsMat.name}`}
                />
              ))}
            </>
          );
        })()}

        {sorted.map((p) => renderCabinetBox(p))}

        {/* Corner cabinets that wrap this corner from the adjoining wall, drawn
            pinned to the seam so a lazy-Susan / diagonal / blind unit shows on
            BOTH walls of the corner view. */}
        {seamCabinets.map((p) => renderCabinetBox(p, true))}

        {sorted
          .filter((p) => p.placement === "base" && p.cabinetId !== 0)
          .map((p) => {
            const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
            const posAlong = horizontal ? p.x : p.y;
            return (
              <div
                key={`ct-${p.uid}`}
                className="absolute bg-[#3a3a3a]"
                style={{
                  left: posAlong * ppi - 1,
                  width: sizeAlong * ppi + 2,
                  bottom: STD.COUNTERTOP_HEIGHT * ppi,
                  height: Math.max(2, STD.COUNTERTOP_THICKNESS * ppi),
                }}
              />
            );
          })}

        {/* Crown molding: band across the top of each wall cabinet */}
        {crown && sorted.filter((p) => p.placement === "wall").map((p) => {
          const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const { bottom, height } = elevationBox(p, room);
          return (
            <div
              key={`crown-${p.uid}`}
              className="absolute"
              style={{
                left: posAlong * ppi - 2,
                width: sizeAlong * ppi + 4,
                bottom: (bottom + height) * ppi,
                height: Math.max(3, CROWN_HEIGHT_IN * ppi),
                background: finish.edge,
                borderTop: `1.5px solid ${finish.label === "#f8fafc" || finish.label === "#f5f5f5" ? finish.edge : "#1a2744"}`,
                borderRadius: "2px 2px 0 0",
                zIndex: 3,
              }}
              title={t("dt_ev_crown")}
            />
          );
        })}

        {/* Light rail: slim valance strip under the bottom edge of each wall
            cabinet (hides under-cabinet lighting). */}
        {lightRail && sorted.filter((p) => p.placement === "wall").map((p) => {
          const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const { bottom } = elevationBox(p, room);
          return (
            <div
              key={`lightrail-${p.uid}`}
              className="absolute"
              style={{
                left: posAlong * ppi + 1,
                width: sizeAlong * ppi - 2,
                bottom: (bottom - LIGHT_RAIL_HEIGHT_IN) * ppi,
                height: Math.max(2, LIGHT_RAIL_HEIGHT_IN * ppi),
                background: finish.edge,
                borderBottom: `1px solid ${finish.label === "#f8fafc" || finish.label === "#f5f5f5" ? finish.edge : "#1a2744"}`,
                borderRadius: "0 0 2px 2px",
                zIndex: 3,
              }}
              title={t("dt_ev_light_rail")}
            />
          );
        })}

        {/* Toe kick: recessed dark strip under base & tall cabinets */}
        {toeKick && sorted.filter((p) => (p.placement === "base" || p.placement === "tall") && p.cabinetId !== 0).map((p) => {
          const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
          const posAlong = horizontal ? p.x : p.y;
          return (
            <div
              key={`toe-${p.uid}`}
              className="absolute bg-[#2a2a2a]"
              style={{
                left: posAlong * ppi + 3,
                width: sizeAlong * ppi - 6,
                bottom: 0,
                height: Math.max(2, TOE_KICK_HEIGHT_IN * ppi),
                zIndex: 4,
              }}
              title={t("dt_ev_toe_kick")}
            />
          );
        })}

        {/* Batten molding: slim vertical strip covering the seam between two
            edge-to-edge cabinets on this wall. */}
        {batten && sorted
          .filter((p) => p.cabinetId !== 0)
          .map((p, i, arr) => {
            if (i === arr.length - 1) return null;
            const next = arr[i + 1];
            const pAlong = horizontal ? p.x : p.y;
            const pSize = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
            const nextAlong = horizontal ? next.x : next.y;
            const pEnd = pAlong + pSize;
            // Only draw where the two cabinets actually touch (within 1.5").
            if (Math.abs(nextAlong - pEnd) > 1.5) return null;
            const { bottom, height } = elevationBox(p, room);
            const nextBox = elevationBox(next, room);
            const top = Math.max(bottom + height, nextBox.bottom + nextBox.height);
            const base = Math.min(bottom, nextBox.bottom);
            const widthPx = Math.max(3, BATTEN_WIDTH_IN * ppi);
            return (
              <div
                key={`batten-${p.uid}`}
                className="absolute"
                style={{
                  left: pEnd * ppi - widthPx / 2,
                  width: widthPx,
                  bottom: base * ppi,
                  height: (top - base) * ppi,
                  background: finish.edge,
                  borderRadius: "2px",
                  boxShadow: "0 0 0 0.5px rgba(0,0,0,0.15)",
                  zIndex: 5,
                }}
                title={t("dt_ev_batten")}
              />
            );
          })}

        {/* Doors & windows on this wall, drawn at their sill height */}
        {viewOpenings.map((o) => {
          const isDoor = o.kind === "door";
          const isOpening = o.kind === "opening";
          // A cased opening is a hole in the wall: render it as an open gap
          // (light recessed fill, dashed casing) with no door slab or glazing.
          return (
            <div
              key={`ev-${o.uid}`}
              className="absolute flex items-center justify-center overflow-hidden"
              style={{
                left: o.offset * ppi,
                width: o.width * ppi,
                bottom: o.sill * ppi,
                height: o.height * ppi,
                background: isDoor
                  ? "linear-gradient(to bottom, #b07f4d 0%, #8a5f33 100%)"
                  : isOpening
                  ? "linear-gradient(to bottom, #f3f4f6 0%, #e2e5e9 100%)"
                  : "linear-gradient(to bottom, rgba(160,205,235,0.85) 0%, rgba(126,180,214,0.85) 100%)",
                border: isOpening ? "2px dashed #5a6770" : "2px solid #1a2744",
                borderRadius: 2,
                zIndex: 5,
              }}
              title={`${o.label} (${Math.round(o.width)}" × ${Math.round(o.height)}")`}
            >
              {o.kind === "window" && (
                <div className="absolute inset-1 border border-[#1a2744]/40">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#1a2744]/40" />
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-[#1a2744]/40" />
                </div>
              )}
              <span className={`relative text-[8px] font-bold drop-shadow ${isOpening ? "text-[#3a4047]" : "text-white"}`}>
                {isDoor ? t("dt_ev_door") : isOpening ? t("dt_ev_open") : t("dt_ev_window")}
              </span>
            </div>
          );
        })}
      </div>

      {/* Wall switcher: flip the displayed wall straight from the elevation
          panel. Falls back to a static label when no handler is provided. */}
      {hideSwitcher ? null : onSelectWall ? (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/85 px-1.5 py-1 rounded-full shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("dt_ev_wall")}</span>
          {((["top", "left", "bottom", "right"] as WallSide[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onSelectWall(w)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                w === side
                  ? "bg-[#1a2744] text-white"
                  : "text-[#1a2744] hover:bg-[#1a2744]/10"
              }`}
            >
              {WALL_LABELS[w]}
            </button>
          )))}
        </div>
      ) : (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-medium text-[#1a2744] bg-white/80 px-3 py-1 rounded-full">
          {t("dt_ev_wall_elevation", { wall: WALL_LABELS[side] })}
        </div>
      )}

      {sorted.length === 0 && viewOpenings.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center px-6" style={textFlip}>
          {t("dt_ev_empty", { wall: WALL_LABELS[side].toLowerCase() })}
        </div>
      )}
    </div>
  );
}

// Decorative-hardware overlay. Draws the chosen hardware on a single front box:
// a door region (top) plus a stacked drawer region split into N equal drawers.
// Pieces are tiny CSS shapes positioned by percentage so they scale with zoom.
//   knob → small filled circle   pull → short horizontal bar   cup → half-moon
function HardwareOverlay({
  doors, drawers, doorPiece, drawerPiece, accent,
}: {
  doors: number;
  drawers: number;
  doorPiece: "knob" | "pull" | "none";
  drawerPiece: "knob" | "pull" | "cup" | "none";
  accent: string;
}) {
  const piece = (kind: "knob" | "pull" | "cup", key: string, topPct: number) => {
    if (kind === "knob") {
      return (
        <div
          key={key}
          className="absolute rounded-full"
          style={{ left: "50%", top: `${topPct}%`, width: 4, height: 4, marginLeft: -2, background: accent, zIndex: 8 }}
        />
      );
    }
    if (kind === "pull") {
      return (
        <div
          key={key}
          className="absolute rounded-full"
          style={{ left: "30%", right: "30%", top: `${topPct}%`, height: 2.5, background: accent, zIndex: 8 }}
        />
      );
    }
    // cup pull: a small half-moon (rounded bottom) bin pull
    return (
      <div
        key={key}
        className="absolute"
        style={{
          left: "34%", right: "34%", top: `${topPct}%`, height: 4,
          borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
          border: `1.5px solid ${accent}`, borderTop: "none", zIndex: 8,
        }}
      />
    );
  };

  const pieces: React.ReactNode[] = [];
  // Drawers stack from the top; doors fill the remainder below. When both are
  // present we give the top portion to the drawer stack (typical drawer base).
  const hasDrawers = drawers > 0 && drawerPiece !== "none";
  const hasDoors = doors > 0 && doorPiece !== "none";
  // Vertical share for the drawer band (rest goes to doors). All-drawer = 100%.
  const drawerBand = hasDrawers ? (hasDoors ? 45 : 100) : 0;

  if (hasDrawers) {
    for (let i = 0; i < drawers; i++) {
      // Center each drawer's pull within its slice of the drawer band.
      const sliceH = drawerBand / drawers;
      const center = sliceH * i + sliceH / 2;
      pieces.push(piece(drawerPiece as "knob" | "pull" | "cup", `dr-${i}`, center));
    }
  }
  if (hasDoors) {
    // Knob/pull near the bottom inner corner of the door band.
    const doorTop = drawerBand + (100 - drawerBand) * (doorPiece === "knob" ? 0.12 : 0.5);
    for (let i = 0; i < Math.min(doors, 2); i++) {
      pieces.push(piece(doorPiece as "knob" | "pull", `do-${i}`, doorTop));
    }
  }

  return <>{pieces}</>;
}

// One door/drawer face panel rendered in the chosen door style. Used both for
// the door region and for each individual drawer front so a drawer base reads
// as a real stack of drawer fronts rather than one big door.
function StylePanel({ kind, edge, face, drawer = false }: { kind: DoorPanelKind; edge: string; face: string; drawer?: boolean }) {
  const stroke = `${edge}99`;
  // Drawers always read as a slim single recessed panel regardless of the door
  // style (drawer fronts don't get raised/beaded treatments in this model),
  // except slab which stays flat.
  if (drawer) {
    if (kind === "slab") {
      return <div className="absolute inset-[1.5px] rounded-[1px]" style={{ border: `1px solid ${edge}55` }} />;
    }
    return (
      <>
        <div className="absolute inset-[2px] border rounded-[1px]" style={{ borderColor: stroke }} />
        <div className="absolute inset-[4px] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
      </>
    );
  }
  return <DoorFront kind={kind} edge={edge} face={face} />;
}

// Lightweight door-front detail overlay that reflects the active door style so a
// placed cabinet visibly changes appearance when the user switches styles. When
// `drawers` > 0 it splits the face into a top drawer band (one front per drawer)
// and a door region below, so drawer bases show their real drawer fronts.
function DoorFront({ kind, edge, face, doors, drawers, isWall }: { kind: DoorPanelKind; edge: string; face: string; doors?: number; drawers?: number; isWall?: boolean }) {
  const drawerCount = drawers ?? 0;
  const doorCount = doors ?? 0;
  // When a cabinet has drawers, draw the drawer stack + (optional) door region.
  if (drawerCount > 0) {
    const hasDoors = doorCount > 0;
    // Drawer band height: all-drawer cabinets fill the face; mixed bases give a
    // generous slice to drawers (top) and the rest to the door(s) below.
    const drawerBandPct = hasDoors ? 42 : 100;
    const sliceH = drawerBandPct / drawerCount;
    return (
      <>
        {Array.from({ length: drawerCount }).map((_, i) => (
          <div
            key={`drw-${i}`}
            className="absolute left-0 right-0"
            style={{ top: `${sliceH * i}%`, height: `${sliceH}%` }}
          >
            <StylePanel kind={kind} edge={edge} face={face} drawer />
          </div>
        ))}
        {hasDoors && (
          <div className="absolute left-0 right-0" style={{ top: `${drawerBandPct}%`, bottom: 0 }}>
            <StylePanel kind={kind} edge={edge} face={face} />
          </div>
        )}
      </>
    );
  }
  void isWall;
  const stroke = `${edge}99`;
  // For multi-door cabinets, split the face into N side-by-side door panels
  // separated by a center stile. Each panel gets its own style treatment.
  const numDoors = Math.max(1, doorCount);
  if (numDoors > 1) {
    const doorWidthPct = 100 / numDoors;
    return (
      <>
        {Array.from({ length: numDoors }).map((_, i) => (
          <div
            key={`door-${i}`}
            className="absolute top-0 bottom-0"
            style={{ left: `${doorWidthPct * i}%`, width: `${doorWidthPct}%` }}
          >
            {/* stile between doors */}
            {i > 0 && (
              <div
                className="absolute top-0 bottom-0 left-0"
                style={{ width: 2, background: stroke }}
              />
            )}
            <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} />
          </div>
        ))}
      </>
    );
  }
  return <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} />;
}

// Renders a single door panel in the chosen style. Used by DoorFront for each
// individual door in a multi-door cabinet.
function SingleDoorPanel({ kind, edge, face, stroke }: { kind: DoorPanelKind; edge: string; face: string; stroke: string }) {
  const frame = (
    <div className="absolute inset-[3px] border rounded-[1px]" style={{ borderColor: stroke }} />
  );
  switch (kind) {
    case "slab":
      return <div className="absolute inset-[2px] rounded-[1px]" style={{ border: `1px solid ${edge}55` }} />;
    case "double-shaker":
      return (
        <>
          {frame}
          <div className="absolute left-[7px] right-[7px] top-[7px] bottom-[51%] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
          <div className="absolute left-[7px] right-[7px] top-[51%] bottom-[7px] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
        </>
      );
    case "raised":
      return (
        <>
          {frame}
          <div
            className="absolute inset-[7px] rounded-[1px]"
            style={{
              border: `1px solid ${stroke}`,
              boxShadow: `inset 0 0 0 1px ${face}, inset 1px 1px 2px ${edge}55`,
            }}
          />
        </>
      );
    case "beaded":
      return (
        <>
          {frame}
          <div
            className="absolute inset-[5px]"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 3px, ${edge}44 3px, ${edge}44 4px)`,
            }}
          />
        </>
      );
    case "inset":
      return (
        <>
          <div className="absolute inset-[2px] rounded-[1px]" style={{ border: `1px solid ${edge}55` }} />
          <div className="absolute inset-[6px] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
        </>
      );
    case "shaker":
    default:
      return (
        <>
          {frame}
          <div className="absolute inset-[7px] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
        </>
      );
  }
}
