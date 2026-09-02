import { useEffect, useState } from "react";
import { Trash2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, AlignCenterHorizontal } from "lucide-react";
import { clampOpening, formatEighthInches, wallLength, wallCeilingMin, type WallOpening, type RoomData } from "@/lib/design";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  opening: WallOpening;
  room: RoomData;
  onChange: (o: WallOpening) => void;
  onDelete: () => void;
  movementIncrementIn?: number;
}

// Inline editor shown in the contextual row when a door/window is selected.
// Lets the user type an exact width (and a height for windows) in inches,
// in addition to dragging the resize handle on the canvas. Doors keep a fixed
// 80" tall standard, so only windows expose a height field.
//
// It ALSO exposes a "Position on wall" control — nudge left/right buttons, a
// numeric "from corner" inches field, and a Center button — so the opening can
// be moved precisely without dragging. Dragging is hard on a phone, so these
// tap targets are the reliable way to reposition a door/window there.
export function OpeningSizeEditor({ opening, room, onChange, onDelete, movementIncrementIn = 1 }: Props) {
  const { t } = useLanguage();
  // Windows and cased openings expose Height + Sill (sizeable like a doorway);
  // doors stay a standard 80" tall so only their width is editable.
  const showHeightSill = opening.kind === "window" || opening.kind === "opening";
  const wallLen = Math.round(wallLength(opening.side, room));
  const maxW = wallLen;
  // The largest valid offset keeps the whole opening on the wall.
  const maxOffset = Math.max(0, Math.round(wallLen - opening.width));
  const wallCeilingIn = wallCeilingMin(room, opening.side);
  const moveIncrement = Math.max(0.125, Math.round(movementIncrementIn * 8) / 8);
  const moveIncrementLabel = Math.abs(moveIncrement - 1) < 0.001 ? "1 inch" : formatEighthInches(moveIncrement);

  // Local text state so the user can clear/retype without the value snapping
  // back mid-edit. We commit (clamped) on blur or Enter.
  const [widthText, setWidthText] = useState(String(Math.round(opening.width)));
  const [heightText, setHeightText] = useState(String(Math.round(opening.height)));
  const [sillText, setSillText] = useState(String(Math.round(opening.sill)));
  const [offsetText, setOffsetText] = useState(String(Math.round(opening.offset)));

  // Re-sync when a different opening is selected or the canvas drag changes it.
  useEffect(() => {
    setWidthText(String(Math.round(opening.width)));
    setHeightText(String(Math.round(opening.height)));
    setSillText(String(Math.round(opening.sill)));
    setOffsetText(String(Math.round(opening.offset)));
  }, [opening.uid, opening.width, opening.height, opening.sill, opening.offset]);

  const commitWidth = () => {
    const n = parseFloat(widthText);
    if (Number.isFinite(n) && n > 0) {
      onChange(clampOpening({ ...opening, width: Math.min(Math.max(6, n), maxW) }, room));
    } else {
      setWidthText(String(Math.round(opening.width)));
    }
  };
  const commitHeight = () => {
    const n = parseFloat(heightText);
    if (Number.isFinite(n) && n > 0) {
      onChange(clampOpening({ ...opening, height: Math.min(Math.max(6, n), 120) }, room));
    } else {
      setHeightText(String(Math.round(opening.height)));
    }
  };
  const commitSill = () => {
    const n = parseFloat(sillText);
    if (Number.isFinite(n) && n >= 0) {
      onChange(clampOpening({ ...opening, sill: n }, room));
    } else {
      setSillText(String(Math.round(opening.sill)));
    }
  };
  const nudgeSill = (delta: number) => {
    const nextOpening = clampOpening({ ...opening, sill: opening.sill + delta }, room);
    const nextSill = nextOpening.sill;
    onChange(nextOpening);
    setSillText(String(Math.round(nextSill)));
  };

  // ── Position on wall ──────────────────────────────────────────────────────
  // `offset` is inches from the wall's start corner (left for top/bottom walls,
  // top for left/right walls). clampOpening keeps it on the wall.
  const setOffset = (raw: number) => {
    const next = clampOpening({ ...opening, offset: raw }, room);
    onChange(next);
    setOffsetText(String(Math.round(next.offset)));
  };
  const nudge = (delta: number) => setOffset(opening.offset + delta);
  const commitOffset = () => {
    const n = parseFloat(offsetText);
    if (Number.isFinite(n) && n >= 0) {
      setOffset(n);
    } else {
      setOffsetText(String(Math.round(opening.offset)));
    }
  };
  const centerOnWall = () => setOffset(Math.max(0, (wallLen - opening.width) / 2));

  const fieldClass =
    "w-16 rounded-md border border-border bg-white px-2 py-1 text-[11px] text-[#1a2744] focus:outline-none focus:ring-1 focus:ring-[#a87f33]";
  const nudgeBtnClass =
    "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-[#1a2744] transition-colors hover:bg-[#a87f33] hover:text-white active:scale-95 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#1a2744]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-muted-foreground">
        {t("dt_op_selected")}{" "}
        <span className="font-semibold text-foreground">{opening.label}</span>
      </span>
      <div className="h-4 w-px bg-border" />
      <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {t("dt_op_width")}
        <input
          type="number"
          inputMode="decimal"
          min={6}
          max={maxW}
          value={widthText}
          onChange={(e) => setWidthText(e.target.value)}
          onBlur={commitWidth}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={fieldClass}
        />
        <span className="text-foreground/60">{t("dt_op_in")}</span>
      </label>
      {showHeightSill && (
        <>
          <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {t("dt_op_height")}
            <input
              type="number"
              inputMode="decimal"
              min={6}
              max={120}
              value={heightText}
              onChange={(e) => setHeightText(e.target.value)}
              onBlur={commitHeight}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={fieldClass}
            />
            <span className="text-foreground/60">{t("dt_op_in")}</span>
          </label>
          <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {t("dt_op_sill")}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={Math.max(0, wallCeilingIn - opening.height)}
              value={sillText}
              onChange={(e) => setSillText(e.target.value)}
              onBlur={commitSill}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={fieldClass}
            />
            <span className="text-foreground/60">{t("dt_op_in")}</span>
          </label>
          <div className="flex items-center gap-1" aria-label="Window vertical position">
            <button
              type="button"
              onClick={() => nudgeSill(-moveIncrement)}
              disabled={opening.sill <= 0.001}
              title={`Move window down ${moveIncrementLabel}`}
              aria-label={`Move window down ${moveIncrementLabel}`}
              className={nudgeBtnClass}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => nudgeSill(moveIncrement)}
              disabled={opening.sill >= wallCeilingIn - opening.height - 0.001}
              title={`Move window up ${moveIncrementLabel}`}
              aria-label={`Move window up ${moveIncrementLabel}`}
              className={nudgeBtnClass}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      <div className="h-4 w-px bg-border" />

      {/* Position on wall — nudge / type / center. Easy to tap on a phone. */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">{t("dt_op_position")}</span>
        <button
          type="button"
          onClick={() => nudge(-moveIncrement)}
          disabled={opening.offset <= 0.001}
          title={t("dt_op_move_left")}
          aria-label={t("dt_op_move_left")}
          className={nudgeBtnClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={maxOffset}
          value={offsetText}
          onChange={(e) => setOffsetText(e.target.value)}
          onBlur={commitOffset}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          title={t("dt_op_from_corner")}
          aria-label={t("dt_op_from_corner")}
          className={fieldClass}
        />
        <span className="text-foreground/60 text-[11px]">{t("dt_op_in")}</span>
        <button
          type="button"
          onClick={() => nudge(moveIncrement)}
          disabled={opening.offset >= maxOffset - 0.001}
          title={t("dt_op_move_right")}
          aria-label={t("dt_op_move_right")}
          className={nudgeBtnClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={centerOnWall}
          title={t("dt_op_center")}
          aria-label={t("dt_op_center")}
          className={nudgeBtnClass}
        >
          <AlignCenterHorizontal className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onDelete}
        title={t("dt_op_delete_title")}
        className="flex items-center gap-1 rounded-md border border-destructive/40 bg-white px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive hover:text-white"
      >
        <Trash2 className="h-3 w-3" /> {t("dt_op_delete")}
      </button>
    </div>
  );
}
