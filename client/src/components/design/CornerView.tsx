import { useState } from "react";
import {
  PlacedCabinet, RoomData, WallOpening, FinishColors, DEFAULT_FINISH_COLORS,
  type DoorPanelKind, type WallSide,
} from "@/lib/design";
import { type HardwareStyleId } from "@/lib/hardware";
import { ElevationView } from "./ElevationView";

// The four kitchen corners, each defined by the two walls that meet there.
// `left` is the wall drawn on the LEFT half (mirrored so its corner end faces
// the seam in the middle); `right` is drawn on the RIGHT half (normal
// orientation, corner end against the seam). This produces the "standing in the
// corner looking out" effect, showing both adjoining walls at once.
export type CornerId = "top-left" | "top-right" | "bottom-right" | "bottom-left";

const CORNERS: Record<CornerId, { label: string; left: WallSide; right: WallSide }> = {
  "top-left": { label: "Back / Left", left: "left", right: "top" },
  "top-right": { label: "Back / Right", left: "top", right: "right" },
  "bottom-right": { label: "Front / Right", left: "right", right: "bottom" },
  "bottom-left": { label: "Front / Left", left: "bottom", right: "left" },
};

const CORNER_ORDER: CornerId[] = ["top-left", "top-right", "bottom-right", "bottom-left"];

interface Props {
  room: RoomData;
  cabinets: PlacedCabinet[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  corner: CornerId;
  onCornerChange: (c: CornerId) => void;
  countertopMaterialId?: string | null;
  openings?: WallOpening[];
  finish?: FinishColors;
  crown?: boolean;
  toeKick?: boolean;
  batten?: boolean;
  lightRail?: boolean;
  panelKind?: DoorPanelKind;
  hardwareStyleId?: HardwareStyleId | null;
}

export function CornerView({
  room, cabinets, selectedUid, onSelect, corner, onCornerChange,
  countertopMaterialId = null, openings = [],
  finish = DEFAULT_FINISH_COLORS, crown = false, toeKick = false, batten = false, lightRail = false,
  panelKind = "shaker", hardwareStyleId = null,
}: Props) {
  const { left, right } = CORNERS[corner];

  const sharedProps = {
    room, cabinets, selectedUid, onSelect,
    countertopMaterialId, openings, finish, crown, toeKick, batten, lightRail, panelKind, hardwareStyleId,
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#dde6f0] to-[#eef1f5]">
      {/* Two-wall corner elevation: left wall mirrored, right wall normal, with a
          vertical seam where the walls meet. */}
      <div className="absolute inset-0 flex">
        {/* Left half — mirror horizontally so the corner end meets the seam. */}
        <div className="relative flex-1 min-w-0" style={{ transform: "scaleX(-1)" }}>
          <ElevationView {...sharedProps} wall={left} mirror hideSwitcher />
        </div>
        {/* Corner seam */}
        <div className="w-[2px] shrink-0 bg-[#1a2744]/60 z-20" />
        {/* Right half — normal orientation. */}
        <div className="relative flex-1 min-w-0">
          <ElevationView {...sharedProps} wall={right} hideSwitcher />
        </div>
      </div>

      {/* The mirrored ElevationView also flips its wall-switcher pill text, so we
          hide those and provide our own corner picker on top. */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white/90 px-1.5 py-1 rounded-full shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Corner</span>
        {CORNER_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCornerChange(c)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              c === corner ? "bg-[#1a2744] text-white" : "text-[#1a2744] hover:bg-[#1a2744]/10"
            }`}
          >
            {CORNERS[c].label}
          </button>
        ))}
      </div>

      {/* Cycle button for quick rotation through all four corners. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const idx = CORNER_ORDER.indexOf(corner);
          onCornerChange(CORNER_ORDER[(idx + 1) % CORNER_ORDER.length]);
        }}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 rounded-full bg-[#1a2744] text-white px-3 py-1.5 text-[11px] font-medium shadow hover:bg-[#243456]"
      >
        Rotate to next corner ↻
      </button>
    </div>
  );
}

export { CORNERS, CORNER_ORDER };
