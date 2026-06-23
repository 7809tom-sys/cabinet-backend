import {
  PlacedCabinet, RoomData, STD, elevationBox, rotatedSize, WallOpening,
  FinishColors, DEFAULT_FINISH_COLORS, CROWN_HEIGHT_IN, TOE_KICK_HEIGHT_IN, BATTEN_WIDTH_IN,
  type DoorPanelKind, type WallSide, cabinetWall, resolveSwing,
} from "@/lib/design";
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
  openings?: WallOpening[];
  finish?: FinishColors;
  crown?: boolean;
  toeKick?: boolean;
  batten?: boolean;
  panelKind?: DoorPanelKind;
}

export function ElevationView({
  room, cabinets, selectedUid, onSelect, wall, onSelectWall, openings = [],
  finish = DEFAULT_FINISH_COLORS, crown = false, toeKick = false, batten = false,
  panelKind = "shaker",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const PADDING = 40;
  const WALL_TOTAL_HEIGHT = 96;

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
  }, [planSpan]);

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
        <div
          className="absolute left-0 right-0 border-b border-dashed border-[#b08d57]/40"
          style={{ bottom: STD.COUNTERTOP_HEIGHT * ppi }}
        />

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
                  <span className="text-[8px] font-bold truncate px-0.5" style={{ color: isAppliance ? "#1a2744" : finish.label }}>
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
                  : "linear-gradient(to bottom, rgba(160,205,235,0.85) 0%, rgba(126,180,214,0.85) 100%)",
                border: "2px solid #1a2744",
                borderRadius: 2,
                zIndex: 5,
              }}
              title={`${o.label} (${Math.round(o.width)}" × ${Math.round(o.height)}")`}
            >
              {!isDoor && (
                <div className="absolute inset-1 border border-[#1a2744]/40">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#1a2744]/40" />
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-[#1a2744]/40" />
                </div>
              )}
              <span className="relative text-[8px] font-bold text-white drop-shadow">
                {isDoor ? "DOOR" : "WINDOW"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Wall switcher: flip the displayed wall straight from the elevation
          panel. Falls back to a static label when no handler is provided. */}
      {onSelectWall ? (
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
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center px-6">
          Nothing on the {WALL_LABELS[side].toLowerCase()} wall yet. Switch the active wall above, or place cabinets on this wall in the plan view.
        </div>
      )}
    </div>
  );
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
