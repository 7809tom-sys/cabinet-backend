/**
 * IslandElevationView — front-elevation preview for island cabinets.
 *
 * Island cabinets live in room-space (p.x, p.y) and are NOT assigned to any
 * WallSide by cabinetWall(). Instead we detect them with isOnIsland() and
 * project them onto a virtual "front face" of the island rectangle.
 *
 * The island is always wider than it is deep, so the "front face" is the side
 * parallel to the island's width axis (horizontal). We sort island cabinets by
 * their x-coordinate and use (p.x - island.x) as posAlong so they line up
 * left-to-right across the island width.
 *
 * This component intentionally reuses the same CSS rendering primitives as
 * ElevationView (same colors, same door/drawer logic) without touching the
 * 4-wall model.
 */
import {
  PlacedCabinet, RoomData, STD, elevationBox,
  FinishColors, DEFAULT_FINISH_COLORS,
  type DoorPanelKind,
  countertopMaterial, DEFAULT_COUNTERTOP_MATERIAL_ID,
  isOnIsland, placedFootprint, bearsCountertop,
  isSinkBaseCabinet, isBlindCorner, resolveSwing,
  isRangeOrOven, isStacker, wallCabinetTopLine,
  DEFAULT_CEILING_HEIGHT,
} from "@/lib/design";
import {
  type HardwareStyleId,
  hardwareStyle as resolveHardwareStyle,
  doorCountForCabinet,
  drawerCountForCabinet,
  displayDrawerCount,
} from "@/lib/hardware";
import { resolveDoorDrawerCounts, cabinetDrawingType, type CabinetDrawingType } from "@/lib/cabinetGraphics";
import { useRef, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Sub-components (copied from ElevationView for self-containment) ─────────

function RecessedPanel({
  inset, face, edge, raised, doorSampleUrl,
}: { inset: number; face: string; edge: string; raised?: boolean; doorSampleUrl?: string | null }) {
  return (
    <div
      className="absolute"
      style={{
        inset,
        boxShadow: raised
          ? `0 1px 0 rgba(255,255,255,0.5), 0 -1px 0 ${edge}55, inset 0 1px 2px rgba(0,0,0,0.18)`
          : `inset 0 2px 4px rgba(0,0,0,0.24), 0 0 0 0.5px ${edge}66`,
        ...(doorSampleUrl
          ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
          : {}),
      }}
    />
  );
}

function DoorFront({
  kind, edge, face, doors, drawers, isWall, doorSampleUrl, cabinetType, blindOnLeft, cabinetHeightIn,
}: {
  kind: DoorPanelKind; edge: string; face: string;
  doors: number; drawers: number; isWall: boolean;
  doorSampleUrl?: string | null;
  cabinetType: CabinetDrawingType | null;
  blindOnLeft: boolean;
  cabinetHeightIn: number;
}) {
  const railBevel: React.CSSProperties = {
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 ${edge}55, inset 1px 0 0 rgba(255,255,255,0.2), inset -1px 0 0 ${edge}44`,
  };
  switch (kind) {
    case "slab":
      return (
        <div
          className="absolute inset-[1.5px] rounded-[2px]"
          style={{
            ...(doorSampleUrl ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -2px 3px rgba(0,0,0,0.14), 0 0 0 1px ${edge}44`,
          }}
        />
      );
    case "double-shaker":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <div className="absolute left-[6px] right-[6px] top-[6px] bottom-[50.5%]">
            <RecessedPanel inset={0} face={face} edge={edge} doorSampleUrl={doorSampleUrl} />
          </div>
          <div className="absolute left-[6px] right-[6px] top-[50.5%] bottom-[6px]">
            <RecessedPanel inset={0} face={face} edge={edge} doorSampleUrl={doorSampleUrl} />
          </div>
        </div>
      );
    case "raised":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <RecessedPanel inset={6} face={face} edge={edge} raised doorSampleUrl={doorSampleUrl} />
        </div>
      );
    case "beaded":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <div
            className="absolute inset-[5px] rounded-[1px]"
            style={{
              boxShadow: `inset 0 2px 4px rgba(0,0,0,0.24), 0 0 0 0.5px ${edge}66`,
              ...(doorSampleUrl
                ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                : { backgroundImage: `repeating-linear-gradient(90deg, color-mix(in srgb, ${face} 90%, #000) 0px, color-mix(in srgb, ${face} 90%, #000) 2px, color-mix(in srgb, ${face} 78%, #000) 2.5px, color-mix(in srgb, ${face} 90%, #000) 3px, color-mix(in srgb, ${face} 90%, #000) 4px)` }),
            }}
          />
        </div>
      );
    case "inset":
      return (
        <div
          className="absolute inset-[2px] rounded-[2px]"
          style={{ boxShadow: `0 0 0 1px ${edge}77, inset 1px 1px 0 rgba(255,255,255,0.22), inset -1px -1px 1px rgba(0,0,0,0.18)` }}
        >
          <RecessedPanel inset={5} face={face} edge={edge} doorSampleUrl={doorSampleUrl} />
        </div>
      );
    case "slim-shaker":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <RecessedPanel inset={3} face={face} edge={edge} doorSampleUrl={doorSampleUrl} />
        </div>
      );
    case "shaker":
    default:
      return (
        <div className="absolute inset-0" style={railBevel}>
          <RecessedPanel inset={6} face={face} edge={edge} doorSampleUrl={doorSampleUrl} />
        </div>
      );
  }
}

function HardwareOverlay({
  doors, drawers, doorPiece, drawerPiece, accent, handleSide,
}: {
  doors: number; drawers: number;
  doorPiece: "knob" | "pull" | "none";
  drawerPiece: "knob" | "pull" | "cup" | "none";
  accent: string;
  handleSide?: "left" | "right" | null;
}) {
  const metal = `linear-gradient(135deg, color-mix(in srgb, ${accent} 55%, #ffffff) 0%, ${accent} 38%, color-mix(in srgb, ${accent} 70%, #000000) 72%, color-mix(in srgb, ${accent} 88%, #ffffff) 100%)`;
  const metalShadow = "0 1px 1.5px rgba(0,0,0,0.35), inset 0 0.5px 0 rgba(255,255,255,0.55)";
  const piece = (kind: "knob" | "pull" | "cup", key: string, topPct: number, isDoor?: boolean) => {
    const hSide = isDoor ? handleSide : null;
    if (kind === "knob") {
      const leftPos = hSide === "left" ? "18%" : hSide === "right" ? "82%" : "50%";
      return (
        <div key={key} className="absolute rounded-full"
          style={{ left: leftPos, top: `${topPct}%`, width: 5, height: 5, marginLeft: -2.5, background: metal, boxShadow: metalShadow, zIndex: 8 }}
        />
      );
    }
    if (kind === "pull") {
      const pullStyle = isDoor && hSide
        ? hSide === "left"
          ? { left: "8%", width: "18%", top: `${topPct}%`, height: 3, background: metal, boxShadow: metalShadow, zIndex: 8 }
          : { right: "8%", width: "18%", top: `${topPct}%`, height: 3, background: metal, boxShadow: metalShadow, zIndex: 8 }
        : { left: "30%", right: "30%", top: `${topPct}%`, height: 3, background: metal, boxShadow: metalShadow, zIndex: 8 };
      return <div key={key} className="absolute" style={pullStyle} />;
    }
    if (kind === "cup") {
      return (
        <div key={key} className="absolute"
          style={{ left: "25%", right: "25%", top: `${topPct}%`, height: 5, marginTop: -2.5, background: metal, borderRadius: "0 0 50% 50%", boxShadow: metalShadow, zIndex: 8 }}
        />
      );
    }
    return null;
  };
  const items: React.ReactNode[] = [];
  if (doors > 0 && doorPiece !== "none") {
    const topPct = 50;
    items.push(piece(doorPiece as "knob" | "pull", `door-0`, topPct, true));
  }
  if (drawers > 0 && drawerPiece !== "none") {
    const drawerH = 100 / (drawers + (doors > 0 ? 1 : 0));
    for (let i = 0; i < drawers; i++) {
      const topPct = (doors > 0 ? drawerH : 0) + drawerH * i + drawerH / 2;
      items.push(piece(drawerPiece as "knob" | "pull" | "cup", `drawer-${i}`, topPct));
    }
  }
  return <>{items}</>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  room: RoomData;
  cabinets: PlacedCabinet[];
  island: { x: number; y: number; width: number; depth: number };
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  countertopMaterialId?: string | null;
  finish?: FinishColors;
  crown?: boolean;
  toeKick?: boolean;
  batten?: boolean;
  lightRail?: boolean;
  panelKind?: DoorPanelKind;
  hardwareStyleId?: HardwareStyleId | null;
  finishFor?: (cab: PlacedCabinet) => FinishColors;
  panelKindFor?: (cab: PlacedCabinet) => DoorPanelKind;
  doorSampleUrlFor?: (cab: PlacedCabinet) => string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CROWN_HEIGHT_IN = 3.5;
const TOE_KICK_HEIGHT_IN = 4.5;
const LIGHT_RAIL_HEIGHT_IN = 1.5;
const BATTEN_WIDTH_IN = 1.5;
const OVERHANG_IN = 1.5;
const THICKNESS_IN = 1.5;
const TOL = 2;

// ─── Component ────────────────────────────────────────────────────────────────

export function IslandElevationView({
  room, cabinets, island, selectedUid, onSelect,
  countertopMaterialId = null,
  finish = DEFAULT_FINISH_COLORS,
  crown = false, toeKick = false, batten = false, lightRail = false,
  panelKind = "shaker", hardwareStyleId = null,
  finishFor, panelKindFor, doorSampleUrlFor,
}: Props) {
  const { t } = useLanguage();
  const hw = resolveHardwareStyle(hardwareStyleId);
  const ref = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const PADDING = 40;

  // The island's width is the "wall" span for this elevation.
  const planSpan = island.width;
  // Use the room ceiling height for the wall box height.
  const WALL_TOTAL_HEIGHT = room.ceilingHeight ?? DEFAULT_CEILING_HEIGHT;

  // Filter cabinets that are on the island.
  const islandCabinets = cabinets.filter((c) => isOnIsland(c, island));

  // Sort by x position (left to right along the island front face).
  const sorted = [...islandCabinets].sort((a, b) => {
    const order: Record<string, number> = { tall: 0, base: 1, appliance: 1, wall: 2 };
    const byType = (order[a.placement] ?? 1) - (order[b.placement] ?? 1);
    if (byType !== 0) return byType;
    return a.x - b.x;
  });

  // posAlong: offset from the island's left edge.
  const posAlong = (p: PlacedCabinet) => p.x - island.x;
  const sizeAlong = (p: PlacedCabinet) => placedFootprint(p).w;

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

  const renderCabinetBox = (p: PlacedCabinet) => {
    const fp = placedFootprint(p);
    const cabSizeAlong = fp.w;
    const cabPosAlong = posAlong(p);
    const { bottom, height } = elevationBox(p, room);
    const isWall = p.placement === "wall";
    const isAppliance = p.placement === "appliance";
    const isSelected = p.uid === selectedUid;
    const cabFinish = finishFor ? finishFor(p) : finish;
    const cabPanelKind = panelKindFor ? panelKindFor(p) : panelKind;
    const cabDoorSampleUrl = !isAppliance && doorSampleUrlFor ? doorSampleUrlFor(p) : null;
    const faceFill = isAppliance
      ? "linear-gradient(115deg, #eef1f5 0%, #d3d9e1 22%, #c2c9d4 52%, #d9dee6 78%, #c8cfd8 100%)"
      : `linear-gradient(180deg, color-mix(in srgb, ${cabFinish.face} 88%, #ffffff) 0%, ${cabFinish.face} 40%, ${cabFinish.face} 62%, color-mix(in srgb, ${cabFinish.face} 90%, #000000) 100%)`;
    const edgeColor = isAppliance ? "#6b7280" : cabFinish.edge;
    const resolvedCounts = !isAppliance ? resolveDoorDrawerCounts(p) : { doors: 0, drawers: 0 };
    const cabType: CabinetDrawingType | null = !isAppliance ? cabinetDrawingType(p) : null;
    const isBlind = isBlindCorner(p.masterCode, p.description);
    const blindLeft = isBlind ? (cabPosAlong <= 2) : true;

    return (
      <div
        key={p.uid}
        onClick={(e) => { e.stopPropagation(); onSelect(p.uid); }}
        className="absolute cursor-pointer"
        style={{
          left: cabPosAlong * ppi,
          width: cabSizeAlong * ppi,
          bottom: bottom * ppi,
          height: height * ppi,
          background: faceFill,
          border: isSelected ? "2px solid #1a2744" : `1px solid ${edgeColor}`,
          borderRadius: 2,
          boxShadow: isSelected
            ? "0 0 0 3px rgba(212,167,90,0.55), 0 6px 14px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 10px rgba(0,0,0,0.16)"
            : "0 3px 7px rgba(15,23,42,0.20), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 9px rgba(0,0,0,0.14)",
          transition: "left 80ms ease-out",
          zIndex: 2,
        }}
        title={`${p.masterCode} — ${p.description}`}
      >
        <div className="w-full h-full relative">
          {!isAppliance && (
            <DoorFront
              kind={cabPanelKind}
              edge={edgeColor}
              face={cabFinish.face}
              doors={resolvedCounts.doors || doorCountForCabinet(p)}
              drawers={resolvedCounts.drawers || displayDrawerCount(p)}
              isWall={isWall}
              doorSampleUrl={cabDoorSampleUrl}
              cabinetType={cabType}
              blindOnLeft={blindLeft}
              cabinetHeightIn={height}
            />
          )}
          {!isAppliance && hw.id !== "none" && (
            <HardwareOverlay
              doors={resolvedCounts.doors || doorCountForCabinet(p)}
              drawers={resolvedCounts.drawers || drawerCountForCabinet(p)}
              doorPiece={hw.doorPiece}
              drawerPiece={hw.drawerPiece}
              accent="#1a2744"
              handleSide={
                p.handleSide === "left" || p.handleSide === "right"
                  ? p.handleSide
                  : resolveSwing(p) === "left" ? "right"
                  : resolveSwing(p) === "right" ? "left"
                  : null
              }
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
            <span className="text-[8px] font-bold truncate px-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
              style={{ color: isAppliance ? "#1a2744" : cabFinish.label }}>
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
      className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#dde6f0] to-[#eef1f5] select-none touch-none"
      onClick={() => onSelect(null)}
    >
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: wallPxW,
          height: wallPxH + PADDING,
        }}
      >
        {/* Floor plane */}
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            bottom: 0,
            height: PADDING,
            background: "repeating-linear-gradient(90deg, #d8bd97 0px, #cbae86 3px, #d8bd97 6px, #d2b389 9px), linear-gradient(180deg, #d8bd97 0%, #c2a271 100%)",
            borderTop: "3px solid #8a6f49",
            boxShadow: "inset 0 6px 10px -6px rgba(0,0,0,0.35)",
          }}
        />
        {/* Contact shadow */}
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: PADDING - 2,
            height: 8,
            left: 0,
            width: wallPxW,
            background: "linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0) 100%)",
          }}
        />

        {/* Wall box */}
        <div
          className="absolute"
          style={{
            width: wallPxW,
            height: wallPxH,
            left: 0,
            bottom: PADDING,
            background: "linear-gradient(to bottom, #f7f9fc 0%, #eef2f7 100%)",
            borderLeft: "2px solid #1a2744",
            borderRight: "2px solid #1a2744",
            borderTop: "2px solid #1a2744",
          }}
        >
          <div className="absolute left-0 right-0 bottom-0 border-b-[3px] border-[#1a2744]" />

          {/* Toe kick overlay on base cabinets */}
          {toeKick && sorted
            .filter((p) => (p.placement === "base" || p.placement === "tall") && p.cabinetId !== 0)
            .map((p) => {
              const cabSizeAlong = sizeAlong(p);
              const cabPosAlong = posAlong(p);
              const cabFinish = finishFor ? finishFor(p) : finish;
              return (
                <div
                  key={`tk-${p.uid}`}
                  className="absolute"
                  style={{
                    left: cabPosAlong * ppi,
                    width: cabSizeAlong * ppi,
                    bottom: 0,
                    height: Math.max(2, TOE_KICK_HEIGHT_IN * ppi),
                    background: `linear-gradient(180deg, ${cabFinish.edge} 0%, color-mix(in srgb, ${cabFinish.edge} 80%, #000) 100%)`,
                    zIndex: 4,
                  }}
                />
              );
            })}

          {/* Floor contact shadows */}
          {sorted
            .filter((p) => (p.placement === "base" || p.placement === "tall" || p.placement === "appliance") && p.cabinetId !== 0)
            .map((p) => {
              const cabSizeAlong = sizeAlong(p);
              const cabPosAlong = posAlong(p);
              return (
                <div
                  key={`floorshadow-${p.uid}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: cabPosAlong * ppi - 2,
                    width: cabSizeAlong * ppi + 4,
                    bottom: -2,
                    height: Math.max(4, 4 * ppi),
                    background: "radial-gradient(ellipse at center bottom, rgba(15,23,42,0.30) 0%, rgba(15,23,42,0.12) 55%, transparent 80%)",
                    zIndex: 0,
                  }}
                />
              );
            })}

          {/* Cabinet boxes */}
          {sorted.map((p) => renderCabinetBox(p))}

          {/* Countertop slab per base cabinet */}
          {(() => {
            const ct = countertopMaterial(countertopMaterialId ?? DEFAULT_COUNTERTOP_MATERIAL_ID);
            const slabFill = `linear-gradient(180deg, color-mix(in srgb, ${ct.fill} 82%, #ffffff) 0%, ${ct.fill} 45%, color-mix(in srgb, ${ct.fill} 88%, #000000) 100%)`;
            const thickPx = Math.max(2, STD.COUNTERTOP_THICKNESS * ppi);
            return sorted
              .filter((p) => p.placement === "base" && p.cabinetId !== 0)
              .map((p) => {
                const cabSizeAlong = sizeAlong(p);
                const cabPosAlong = posAlong(p);
                return (
                  <div
                    key={`ct-${p.uid}`}
                    className="absolute z-20 pointer-events-none"
                    style={{
                      left: cabPosAlong * ppi,
                      width: cabSizeAlong * ppi,
                      bottom: STD.COUNTERTOP_HEIGHT * ppi,
                      height: thickPx,
                      background: slabFill,
                      borderTop: `1px solid color-mix(in srgb, ${ct.fill} 60%, #ffffff)`,
                      borderBottom: `1px solid ${ct.edge}`,
                      boxShadow: "0 2px 4px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.55)",
                    }}
                  />
                );
              });
          })()}

          {/* Merged countertop spans (for bearsCountertop cabinets) */}
          {countertopMaterialId && (() => {
            const mat = countertopMaterial(countertopMaterialId);
            const isBridgeable = (p: PlacedCabinet) =>
              bearsCountertop(p) ||
              (p.placement === "appliance" && /^(DW|WINE)[-_]?\d/i.test(p.masterCode ?? ""));
            const spans = sorted
              .filter(isBridgeable)
              .map((p) => {
                const cabSizeAlong = sizeAlong(p);
                const cabPosAlong = posAlong(p);
                return { start: cabPosAlong, end: cabPosAlong + cabSizeAlong };
              })
              .sort((a, b) => a.start - b.start);
            if (spans.length === 0) return null;
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
                    key={`ctr${i}`}
                    className="absolute z-20 pointer-events-none rounded-[1px]"
                    style={{
                      left: (r.start - OVERHANG_IN) * ppi,
                      width: (r.end - r.start + OVERHANG_IN * 2) * ppi,
                      bottom: STD.COUNTERTOP_HEIGHT * ppi,
                      height: THICKNESS_IN * ppi,
                      background: mat.speckle
                        ? `linear-gradient(180deg, color-mix(in srgb, ${mat.fill} 80%, #ffffff) 0%, ${mat.fill} 45%, color-mix(in srgb, ${mat.fill} 90%, #000000) 100%)`
                        : `linear-gradient(180deg, color-mix(in srgb, ${mat.fill} 82%, #ffffff) 0%, ${mat.fill} 55%, color-mix(in srgb, ${mat.fill} 88%, #000000) 100%)`,
                      borderTop: `1px solid color-mix(in srgb, ${mat.fill} 60%, #ffffff)`,
                      borderBottom: `1px solid ${mat.edge}`,
                      boxShadow: "0 2px 4px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.55)",
                    }}
                  />
                ))}
              </>
            );
          })()}

          {/* Crown molding */}
          {crown && sorted.filter((p) => p.placement === "wall").map((p) => {
            const cabSizeAlong = sizeAlong(p);
            const cabPosAlong = posAlong(p);
            const { bottom, height } = elevationBox(p, room);
            const cabF = finishFor ? finishFor(p) : finish;
            return (
              <div
                key={`crown-${p.uid}`}
                className="absolute"
                style={{
                  left: cabPosAlong * ppi - 2,
                  width: cabSizeAlong * ppi + 4,
                  bottom: (bottom + height) * ppi,
                  height: Math.max(3, CROWN_HEIGHT_IN * ppi),
                  background: cabF.face,
                  borderTop: `1.5px solid ${cabF.edge}`,
                  borderRadius: "2px 2px 0 0",
                  zIndex: 3,
                }}
              />
            );
          })}

          {/* Light rail */}
          {lightRail && sorted.filter((p) => p.placement === "wall").map((p) => {
            const cabSizeAlong = sizeAlong(p);
            const cabPosAlong = posAlong(p);
            const { bottom } = elevationBox(p, room);
            const cabF = finishFor ? finishFor(p) : finish;
            return (
              <div
                key={`lr-${p.uid}`}
                className="absolute"
                style={{
                  left: cabPosAlong * ppi - 1,
                  width: cabSizeAlong * ppi + 2,
                  bottom: (bottom - LIGHT_RAIL_HEIGHT_IN) * ppi,
                  height: Math.max(2, LIGHT_RAIL_HEIGHT_IN * ppi),
                  background: cabF.face,
                  borderBottom: `1px solid ${cabF.edge}`,
                  borderRadius: "0 0 2px 2px",
                  zIndex: 3,
                }}
              />
            );
          })}

          {/* Batten seam strips */}
          {batten && sorted
            .filter((p) => p.cabinetId !== 0)
            .map((p, i, arr) => {
              if (i === arr.length - 1) return null;
              const next = arr[i + 1];
              const pAlong = posAlong(p);
              const pSize = sizeAlong(p);
              const nextAlong = posAlong(next);
              const pEnd = pAlong + pSize;
              if (Math.abs(nextAlong - pEnd) > 1.5) return null;
              const { bottom, height } = elevationBox(p, room);
              const nextBox = elevationBox(next, room);
              const top = Math.max(bottom + height, nextBox.bottom + nextBox.height);
              const base = Math.min(bottom, nextBox.bottom);
              const widthPx = Math.max(3, BATTEN_WIDTH_IN * ppi);
              const cabF = finishFor ? finishFor(p) : finish;
              return (
                <div
                  key={`batten-${p.uid}`}
                  className="absolute"
                  style={{
                    left: pEnd * ppi - widthPx / 2,
                    width: widthPx,
                    bottom: base * ppi,
                    height: (top - base) * ppi,
                    background: cabF.edge,
                    borderRadius: "2px",
                    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.15)",
                    zIndex: 5,
                  }}
                />
              );
            })}

          {/* Faucet above sink base */}
          {sorted.filter((p) => isSinkBaseCabinet(p)).map((p) => {
            const cabSizeAlong = sizeAlong(p);
            const cabPosAlong = posAlong(p);
            const centerX = (cabPosAlong + cabSizeAlong / 2) * ppi;
            const riserH = 8 * ppi;
            const spoutW = 4 * ppi;
            const spoutThick = Math.max(2, 1.5 * ppi);
            const riserThick = Math.max(2, 1.5 * ppi);
            const knobR = Math.max(3, 1.5 * ppi);
            const svgW = spoutW + knobR * 3;
            const svgH = riserH + knobR * 2 + 4;
            return (
              <svg
                key={`faucet-${p.uid}`}
                className="absolute pointer-events-none"
                style={{
                  left: centerX - svgW / 2,
                  bottom: (STD.COUNTERTOP_HEIGHT + STD.COUNTERTOP_THICKNESS) * ppi,
                  width: svgW,
                  height: svgH,
                  overflow: "visible",
                  zIndex: 26,
                }}
              >
                <rect x={svgW / 2 - riserThick / 2} y={0} width={riserThick} height={riserH} fill="#8a9bb0" rx={1} />
                <rect x={svgW / 2 - spoutW} y={riserH * 0.15} width={spoutW} height={spoutThick} fill="#8a9bb0" rx={1} />
                <circle cx={svgW / 2 - spoutW} cy={riserH * 0.15 + spoutThick / 2} r={Math.max(2, 2 * ppi)} fill="#6b7d90" />
                <circle cx={svgW / 2 + knobR * 1.2} cy={riserH * 0.5} r={knobR} fill="#c0ccd8" stroke="#8a9bb0" strokeWidth={1} />
              </svg>
            );
          })}

          {/* Empty state */}
          {sorted.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center px-6">
              No island cabinets placed yet. Add base cabinets to the island zone in Bird's-Eye view.
            </div>
          )}
        </div>
      </div>

      {/* Island label pill */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-medium text-[#1a2744] bg-white/80 px-3 py-1 rounded-full shadow-sm">
        Island — Front View ({Math.round(island.width)}" wide)
      </div>
    </div>
  );
}
