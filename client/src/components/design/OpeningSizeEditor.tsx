import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { clampOpening, wallLength, type WallOpening, type RoomData } from "@/lib/design";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  opening: WallOpening;
  room: RoomData;
  onChange: (o: WallOpening) => void;
  onDelete: () => void;
}

// Inline editor shown in the contextual row when a door/window is selected.
// Lets the user type an exact width (and a height for windows) in inches,
// in addition to dragging the resize handle on the canvas. Doors keep a fixed
// 80" tall standard, so only windows expose a height field.
export function OpeningSizeEditor({ opening, room, onChange, onDelete }: Props) {
  const { t } = useLanguage();
  // Windows and cased openings expose Height + Sill (sizeable like a doorway);
  // doors stay a standard 80" tall so only their width is editable.
  const showHeightSill = opening.kind === "window" || opening.kind === "opening";
  const maxW = Math.round(wallLength(opening.side, room));

  // Local text state so the user can clear/retype without the value snapping
  // back mid-edit. We commit (clamped) on blur or Enter.
  const [widthText, setWidthText] = useState(String(Math.round(opening.width)));
  const [heightText, setHeightText] = useState(String(Math.round(opening.height)));
  const [sillText, setSillText] = useState(String(Math.round(opening.sill)));

  // Re-sync when a different opening is selected or the canvas drag changes size.
  useEffect(() => {
    setWidthText(String(Math.round(opening.width)));
    setHeightText(String(Math.round(opening.height)));
    setSillText(String(Math.round(opening.sill)));
  }, [opening.uid, opening.width, opening.height, opening.sill]);

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
      onChange({ ...opening, height: Math.min(Math.max(6, n), 120) });
    } else {
      setHeightText(String(Math.round(opening.height)));
    }
  };
  const commitSill = () => {
    const n = parseFloat(sillText);
    if (Number.isFinite(n) && n >= 0) {
      onChange({ ...opening, sill: Math.min(n, 96) });
    } else {
      setSillText(String(Math.round(opening.sill)));
    }
  };

  const fieldClass =
    "w-16 rounded-md border border-border bg-white px-2 py-1 text-[11px] text-[#1a2744] focus:outline-none focus:ring-1 focus:ring-[#a87f33]";

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
              max={96}
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
        </>
      )}
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
