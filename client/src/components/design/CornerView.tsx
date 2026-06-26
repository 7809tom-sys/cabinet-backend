import {
  PlacedCabinet, RoomData, WallOpening, FinishColors, DEFAULT_FINISH_COLORS,
  type DoorPanelKind, type WallSide,
  isCornerCabinet, cabinetWall, cornerRotationForPlaced,
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

  // The plan rotation (0/90/180/270) that maps to each of the four corners,
  // matching cornerRotationForPlaced (back-left=0, back-right=90,
  // front-right=180, front-left=270).
  const CORNER_ROTATION: Record<CornerId, number> = {
    "top-left": 0, "top-right": 90, "bottom-right": 180, "bottom-left": 270,
  };

  // Corner cabinets (lazy-Susan / diagonal / blind) that physically sit in the
  // corner currently being viewed. A corner cabinet wraps BOTH walls, but it is
  // "owned" by just one wall via cabinetWall(); we draw it in place on its owning
  // half and as a seam ghost on the other half so it visibly spans the corner.
  const cornerCabsHere = cabinets.filter(
    (c) =>
      isCornerCabinet(c.masterCode, c.description) &&
      cornerRotationForPlaced(c, room) === CORNER_ROTATION[corner]
  );
  // For each half, the seam ghosts are the corner cabinets NOT owned by that
  // half's wall (the owning wall already draws them in their real position).
  const seamForLeft = cornerCabsHere.filter((c) => cabinetWall(c, room) !== left);
  const seamForRight = cornerCabsHere.filter((c) => cabinetWall(c, room) !== right);

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
          <ElevationView {...sharedProps} wall={left} mirror hideSwitcher seamCabinets={seamForLeft} />
        </div>
        {/* Corner seam — the vertical line where the two walls meet. */}
        <div className="w-[3px] shrink-0 bg-[#1a2744]/70 z-20 shadow-[0_0_10px_rgba(26,39,68,0.35)]" />
        {/* Right half — normal orientation. */}
        <div className="relative flex-1 min-w-0">
          <ElevationView {...sharedProps} wall={right} hideSwitcher seamCabinets={seamForRight} />
        </div>
      </div>

      {/* ── Flat-shaded depth cues (no perspective math) ──────────────────────
          A cheap way to make the two flat wall panels read as a real 3D corner:
          (1) directional gradients on each half so the two walls read as lit
          from different angles and visibly fold into the seam (left wall in
          shadow, right wall brighter), (2) a strong contact shadow down the
          seam, (3) a grounded floor plane, and (4) a soft ceiling shade. All
          pure CSS overlays — pointer-events-none so clicks still reach the
          cabinets — and cost virtually nothing to render. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex">
        {/* Left wall: clearly in shadow, deepening hard toward the seam. */}
        <div className="flex-1 bg-gradient-to-r from-[#1a2744]/[0.04] to-[#1a2744]/[0.32]" />
        <div className="w-[3px] shrink-0" />
        {/* Right wall: lit/brighter, with a gentler shade toward the seam. */}
        <div className="flex-1 bg-gradient-to-l from-white/[0.10] to-[#1a2744]/[0.18]" />
      </div>
      {/* Seam contact shadow — strong vertical band straddling the corner line. */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-16 -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(26,39,68,0.45),transparent_72%)]" />
      {/* Ceiling shade: a soft darker band at the very top so the corner reads
          as an enclosed room, not an open panel. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[8%] bg-gradient-to-b from-[#1a2744]/14 to-transparent" />
      {/* Floor plane: a grounded band at the bottom with a defined contact edge
          so cabinets sit on a surface instead of floating against the wall. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[18%] bg-gradient-to-t from-[#1a2744]/28 via-[#1a2744]/10 to-transparent" />
      {/* Floor contact line — a crisp horizontal edge where wall meets floor. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[18%] z-10 h-px bg-[#1a2744]/25" />

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
