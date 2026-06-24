import {
  PlacedCabinet, RoomData, STD, elevationBox, rotatedSize, WallOpening,
  FinishColors, DEFAULT_FINISH_COLORS, CROWN_HEIGHT_IN, TOE_KICK_HEIGHT_IN, BATTEN_WIDTH_IN, LIGHT_RAIL_HEIGHT_IN,
  type DoorPanelKind, type WallSide, cabinetWall, resolveSwing,
  countertopMaterial, roomCeiling,
} from "@/lib/design";
import {
  type HardwareStyleId,
  hardwareStyle as resolveHardwareStyle,
  doorCountForCabinet,
  drawerCountForCabinet,
} from "@/lib/hardware";
import { useRef, useEffect, useState } from "react";

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
  openings?: WallOpening[];
  finish?: FinishColors;
  crown?: boolean;
  toeKick?: boolean;
  batten?: boolean;
  lightRail?: boolean;
  panelKind?: DoorPanelKind;
  // When this elevation is rendered inside a horizontally-mirrored container
  // (the left half of CornerView), set `mirror` so text labels are counter-
  // flipped to stay readable. `hideSwitcher` removes the inner wall picker so
  // CornerView can show its own corner picker instead.
  mirror?: boolean;
  hideSwitcher?: boolean;
  // Decorative hardware spec to draw on the fronts (knob / pull / cup). When
  // omitted or "none", no hardware is drawn.
  hardwareStyleId?: HardwareStyleId | null;
}

export function ElevationView({
  room, cabinets, selectedUid, onSelect, wall, onSelectWall, countertopMaterialId = null, openings = [],
  finish = DEFAULT_FINISH_COLORS, crown = false, toeKick = false, batten = false, lightRail = false,
  panelKind = "shaker", mirror = false, hideSwitcher = false,
  hardwareStyleId = null,
}: Props) {
  const hw = resolveHardwareStyle(hardwareStyleId);
  // Counter-flip transform for text so labels read correctly when this whole
  // elevation sits inside a scaleX(-1) container.
  const textFlip: React.CSSProperties | undefined = mirror ? { transform: "scaleX(-1)" } : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const PADDING = 40;
  // Wall height shown in the elevation tracks the room's real ceiling height,
  // so a 9ft/10ft ceiling shows more wall above the uppers than a standard 8ft.
  const WALL_TOTAL_HEIGHT = roomCeiling(room);

  // Normalize legacy "front"/"back" to plan WallSide values.
  const side: WallSide =
    wall === "front" ? "bottom" : wall === "back" ? "top" : (wall as WallSide);
  const WALL_LABELS: Record<WallSide, string> = {
    top: "Back", bottom: "Front", left: "Left", right: "Right",
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
        {/* Ceiling line label so the chosen ceiling height is visible at a glance. */}
        <div className="absolute -top-[14px] right-0 text-[9px] font-medium text-[#1a2744]/70" style={textFlip}>
          {`Ceiling ${Math.round(WALL_TOTAL_HEIGHT)}\"`}
        </div>
        <div
          className="absolute left-0 right-0 border-b border-dashed border-[#b08d57]/40"
          style={{ bottom: STD.COUNTERTOP_HEIGHT * ppi }}
        />

        {/* Countertop band: a thin colored slab sitting on top of the base run,
            its top edge on the 36" counter line, colored by the chosen material.
            Spans the leftmost-to-rightmost base/appliance extent on this wall. */}
        {countertopMaterialId && (() => {
          const baseRun = sorted.filter(
            (p) => p.placement === "base" || p.placement === "appliance"
          );
          if (baseRun.length === 0) return null;
          const extents = baseRun.map((p) => {
            const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
            const posAlong = horizontal ? p.x : p.y;
            return { start: posAlong, end: posAlong + sizeAlong };
          });
          const left = Math.min(...extents.map((e) => e.start));
          const right = Math.max(...extents.map((e) => e.end));
          const mat = countertopMaterial(countertopMaterialId);
          const THICKNESS_IN = 1.5;
          const OVERHANG_IN = 0.75; // a little nosing past the cabinet faces
          return (
            <div
              className="absolute z-20 pointer-events-none rounded-[1px]"
              style={{
                left: (left - OVERHANG_IN) * ppi,
                width: (right - left + OVERHANG_IN * 2) * ppi,
                bottom: STD.COUNTERTOP_HEIGHT * ppi,
                height: THICKNESS_IN * ppi,
                background: mat.fill,
                borderTop: `1px solid ${mat.edge}`,
                borderBottom: `1px solid ${mat.edge}`,
                boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
              }}
              title={`${mat.name} countertop`}
            />
          );
        })()}

        {sorted.map((p) => {
          const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const { bottom, height } = elevationBox(p);
          const isWall = p.placement === "wall";
          const isAppliance = p.placement === "appliance";
          const isSelected = p.uid === selectedUid;
          const faceFill = isAppliance
            ? "linear-gradient(to bottom, #d9dee6 0%, #c2c9d4 100%)"
            : finish.face;
          const edgeColor = isAppliance ? "#6b7280" : finish.edge;

          return (
            <div
              key={p.uid}
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
              }}
              title={`${p.masterCode} — ${p.description}`}
            >
              <div className="w-full h-full relative">
                {/* Door-style-specific front treatment (skipped for appliances) */}
                {!isAppliance && (
                  <DoorFront kind={panelKind} edge={edgeColor} face={finish.face} />
                )}
                {/* Decorative hardware (knobs / pulls / cup pulls) reflecting the
                    chosen hardware spec. Doors get the door piece; drawers get
                    the drawer piece. Skipped for appliances and style "none". */}
                {!isAppliance && hw.id !== "none" && (
                  <HardwareOverlay
                    doors={doorCountForCabinet(p)}
                    drawers={drawerCountForCabinet(p)}
                    doorPiece={hw.doorPiece}
                    drawerPiece={hw.drawerPiece}
                    accent="#1a2744"
                  />
                )}
                {/* Hinge-side marker: a slim vertical bar on the hinge edge so the
                    shop reads Left vs Right swing on the elevation too. */}
                {!isAppliance && (() => {
                  const sw = resolveSwing(p);
                  if (sw !== "left" && sw !== "right") return null;
                  return (
                    <div
                      className="absolute top-[12%] bottom-[12%] z-10 rounded"
                      style={{
                        [sw === "left" ? "left" : "right"]: 1,
                        width: 2.5,
                        background: "#1a2744",
                      } as React.CSSProperties}
                      title={sw === "left" ? "Left hinge" : "Right hinge"}
                    />
                  );
                })()}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] font-bold truncate px-0.5" style={{ color: isAppliance ? "#1a2744" : finish.label, ...textFlip }}>
                    {p.masterCode}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

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
          const { bottom, height } = elevationBox(p);
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
              title="Crown molding"
            />
          );
        })}

        {/* Light rail: slim valance strip under the bottom edge of each wall
            cabinet (hides under-cabinet lighting). */}
        {lightRail && sorted.filter((p) => p.placement === "wall").map((p) => {
          const sizeAlong = horizontal ? rotatedSize(p).w : rotatedSize(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const { bottom } = elevationBox(p);
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
              title="Light rail molding"
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
              title="Toe kick"
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
            const { bottom, height } = elevationBox(p);
            const nextBox = elevationBox(next);
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
                title='Batten molding (BAM) 3/4" × 3/16"'
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
                {isDoor ? "DOOR" : isOpening ? "OPEN" : "WINDOW"}
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
          <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Wall</span>
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
          {WALL_LABELS[side]} Wall Elevation
        </div>
      )}

      {sorted.length === 0 && viewOpenings.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center px-6" style={textFlip}>
          Nothing on the {WALL_LABELS[side].toLowerCase()} wall yet. Switch the active wall above, or place cabinets on this wall in the plan view.
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

// Lightweight door-front detail overlay that reflects the active door style so a
// placed cabinet visibly changes appearance when the user switches styles.
function DoorFront({ kind, edge, face }: { kind: DoorPanelKind; edge: string; face: string }) {
  const stroke = `${edge}99`;
  const frame = (
    <div className="absolute inset-[3px] border rounded-[1px]" style={{ borderColor: stroke }} />
  );
  switch (kind) {
    case "slab":
      // Flat slab: a single thin reveal, no inner panel.
      return <div className="absolute inset-[2px] rounded-[1px]" style={{ border: `1px solid ${edge}55` }} />;
    case "double-shaker":
      // Two stacked recessed panels.
      return (
        <>
          {frame}
          <div className="absolute left-[7px] right-[7px] top-[7px] bottom-[51%] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
          <div className="absolute left-[7px] right-[7px] top-[51%] bottom-[7px] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
        </>
      );
    case "raised": {
      // Beveled raised center panel.
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
    }
    case "beaded":
      // Vertical bead board lines inside the frame.
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
      // Thin inset reveal + recessed panel.
      return (
        <>
          <div className="absolute inset-[2px] rounded-[1px]" style={{ border: `1px solid ${edge}55` }} />
          <div className="absolute inset-[6px] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
        </>
      );
    case "shaker":
    default:
      // Single recessed Shaker panel.
      return (
        <>
          {frame}
          <div className="absolute inset-[7px] rounded-[1px]" style={{ border: `1px solid ${stroke}` }} />
        </>
      );
  }
}
