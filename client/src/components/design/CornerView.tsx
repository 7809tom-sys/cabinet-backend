import { useState } from "react";
import {
  PlacedCabinet, RoomData, WallOpening, FinishColors, DEFAULT_FINISH_COLORS,
  type DoorPanelKind, type WallSide,
} from "@/lib/design";
import { type HardwareStyleId } from "@/lib/hardware";
import { ElevationView } from "./ElevationView";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SiteStringKey } from "@/lib/i18n/site";

// The four kitchen corners, each defined by the two walls that meet there.
// `left` is the wall drawn on the LEFT half (mirrored so its corner end faces
// the seam in the middle); `right` is drawn on the RIGHT half (normal
// orientation, corner end against the seam). This produces the "standing in the
// corner looking out" effect, showing both adjoining walls at once.
export type CornerId = "top-left" | "top-right" | "bottom-right" | "bottom-left";

const CORNERS: Record<CornerId, { label: string; labelKey: SiteStringKey; left: WallSide; right: WallSide }> = {
  "top-left": { label: "Back / Left", labelKey: "dt_corner_back_left", left: "left", right: "top" },
  "top-right": { label: "Back / Right", labelKey: "dt_corner_back_right", left: "top", right: "right" },
  "bottom-right": { label: "Front / Right", labelKey: "dt_corner_front_right", left: "right", right: "bottom" },
  "bottom-left": { label: "Front / Left", labelKey: "dt_corner_front_left", left: "bottom", right: "left" },
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
  finishFor?: (cab: PlacedCabinet) => FinishColors;
  panelKindFor?: (cab: PlacedCabinet) => DoorPanelKind;
}

export function CornerView({
  room, cabinets, selectedUid, onSelect, corner, onCornerChange,
  countertopMaterialId = null, openings = [],
  finish = DEFAULT_FINISH_COLORS, crown = false, toeKick = false, batten = false, lightRail = false,
  panelKind = "shaker", hardwareStyleId = null,
  finishFor, panelKindFor,
}: Props) {
  const { t } = useLanguage();
  const { left, right } = CORNERS[corner];

  const sharedProps = {
    room, cabinets, selectedUid, onSelect,
    countertopMaterialId, openings, finish, crown, toeKick, batten, lightRail, panelKind, hardwareStyleId,
    finishFor, panelKindFor,
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

      {/* ── Flat-shaded depth cues (no perspective math) ──────────────────────
          A cheap way to make the two flat wall panels read as a real 3D corner:
          (1) a soft directional gradient on each half so the two walls look lit
          from slightly different angles (left wall a touch darker, like an
          interior corner), (2) a stronger contact shadow down the seam where the
          walls meet, and (3) a faint floor plane at the bottom. These are pure
          CSS overlays — pointer-events-none so clicks still reach the cabinets —
          and cost virtually nothing to render. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex">
        {/* Left wall flat shade: darker toward the seam (interior corner). */}
        <div className="flex-1 bg-gradient-to-r from-transparent to-[#1a2744]/12" />
        <div className="w-[2px] shrink-0" />
        {/* Right wall flat shade: darker toward the seam, lighter outward. */}
        <div className="flex-1 bg-gradient-to-l from-transparent to-[#1a2744]/[0.06]" />
      </div>
      {/* Seam contact shadow — soft vertical band straddling the corner line. */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-10 -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(26,39,68,0.18),transparent_70%)]" />
      {/* Floor plane: a faint grounded band at the bottom so cabinets sit on a
          surface instead of floating against the wall. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[14%] bg-gradient-to-t from-[#1a2744]/10 to-transparent" />

      {/* The mirrored ElevationView also flips its wall-switcher pill text, so we
          hide those and provide our own corner picker on top. */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white/90 px-1.5 py-1 rounded-full shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("dt_corner")}</span>
        {CORNER_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCornerChange(c)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              c === corner ? "bg-[#1a2744] text-white" : "text-[#1a2744] hover:bg-[#1a2744]/10"
            }`}
          >
            {t(CORNERS[c].labelKey)}
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
        {t("dt_rotate_next_corner")} ↻
      </button>
    </div>
  );
}

export { CORNERS, CORNER_ORDER };
