import { useState, useEffect } from "react";
import { Maximize, Pencil, Ruler, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  RoomData, inchesToFeetInches, parseLengthToInches, clampRoomInches,
  roomCeiling, CEILING_HEIGHT_PRESETS, MIN_CEILING_HEIGHT, MAX_CEILING_HEIGHT,
} from "@/lib/design";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  room: RoomData;
  onChange: (room: RoomData) => void;
  drawMode: boolean;
  onToggleDraw: () => void;
}

const PRESETS: { label: string; width: number; depth: number }[] = [
  { label: "10 × 8", width: 120, depth: 96 },
  { label: "10 × 10", width: 120, depth: 120 },
  { label: "12 × 10", width: 144, depth: 120 },
  { label: "12 × 12", width: 144, depth: 144 },
  { label: "16 × 12", width: 192, depth: 144 },
];

// Display inches as a clean tape-measure string, e.g. 126 -> 10' 6"
function toTapeString(totalInches: number): string {
  const { feet, inches } = inchesToFeetInches(totalInches);
  if (inches === 0) return `${feet}'`;
  return `${feet}' ${inches}"`;
}

export function RoomSizeControl({ room, onChange, drawMode, onToggleDraw }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  // Single tape-measure field per wall, seeded from the current room and kept in
  // sync whenever the room changes externally (mouse-draw / package preload).
  const [wStr, setWStr] = useState(() => toTapeString(room.width));
  const [dStr, setDStr] = useState(() => toTapeString(room.depth));
  const [cStr, setCStr] = useState(() => toTapeString(roomCeiling(room)));

  useEffect(() => {
    setWStr(toTapeString(room.width));
    setDStr(toTapeString(room.depth));
    setCStr(toTapeString(roomCeiling(room)));
  }, [room.width, room.depth, room.ceilingHeight]);

  const wParsed = parseLengthToInches(wStr);
  const dParsed = parseLengthToInches(dStr);
  const cParsed = parseLengthToInches(cStr);
  const wValid = wParsed != null;
  const dValid = dParsed != null;
  const cValid =
    cParsed != null && cParsed >= MIN_CEILING_HEIGHT && cParsed <= MAX_CEILING_HEIGHT;

  const apply = () => {
    if (!wValid || !dValid || !cValid) return;
    onChange({
      width: clampRoomInches(wParsed!),
      depth: clampRoomInches(dParsed!),
      ceilingHeight: Math.round(cParsed!),
    });
    setOpen(false);
  };

  const wDisp = inchesToFeetInches(room.width);
  const dDisp = inchesToFeetInches(room.depth);
  const fmt = (v: { feet: number; inches: number }) =>
    v.inches === 0 ? `${v.feet}'` : `${v.feet}'${v.inches}"`;

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Maximize className="h-3.5 w-3.5" />
            <span className="text-xs">{t("dt_room_label", { w: fmt(wDisp), d: fmt(dDisp) })}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Ruler className="h-4 w-4 mt-0.5 text-[#a87f33] shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground">{t("dt_rs_measure_title")}</div>
                <p className="text-[11px] text-muted-foreground">
                  {t("dt_rs_measure_hint")} <span className="font-medium">10' 6"</span>, <span className="font-medium">126"</span>, <span className="font-medium">120 1/2</span>.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <WallField
                label={t("dt_rs_back_wall")}
                value={wStr}
                onChange={setWStr}
                onEnter={apply}
                parsed={wParsed}
                valid={wValid}
              />
              <WallField
                label={t("dt_rs_side_wall")}
                value={dStr}
                onChange={setDStr}
                onEnter={apply}
                parsed={dParsed}
                valid={dValid}
              />
              <WallField
                label={t("dt_rs_ceiling")}
                value={cStr}
                onChange={setCStr}
                onEnter={apply}
                parsed={cParsed}
                valid={cValid}
                hint={t("dt_rs_ceiling_hint", { min: MIN_CEILING_HEIGHT, max: MAX_CEILING_HEIGHT })}
              />
              <div className="flex flex-wrap gap-1">
                {CEILING_HEIGHT_PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setCStr(toTapeString(h))}
                    className={`rounded-md border px-2 py-1 text-[11px] transition-colors hover:bg-muted/60 ${
                      Math.round(cParsed ?? -1) === h ? "border-[#1a2744] bg-[#1a2744]/5 font-medium" : "border-border"
                    }`}
                  >
                    {h / 12}&apos; ({h}&quot;)
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dt_rs_quick_presets")}</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => onChange({ width: p.width, depth: p.depth, ceilingHeight: roomCeiling(room) })}
                    className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted/60 transition-colors"
                  >
                    {t("dt_rs_ft", { label: p.label })}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={apply}
              disabled={!wValid || !dValid || !cValid}
              className="w-full h-9 bg-[#1a2744] text-white hover:bg-[#243456] gap-1.5"
            >
              <Check className="h-4 w-4" /> {t("dt_rs_apply")}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              {t("dt_rs_tip")}
            </p>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="sm"
        onClick={onToggleDraw}
        title={t("dt_rs_draw_title")}
        className={`h-8 gap-1.5 ${drawMode ? "bg-[#d4a75a] text-[#1a2744] border-[#d4a75a] hover:bg-[#c89945]" : ""}`}
      >
        <Pencil className="h-3.5 w-3.5" /> {t("dt_rs_draw_room")}
      </Button>
    </div>
  );
}

function WallField({
  label, value, onChange, onEnter, parsed, valid, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  parsed: number | null;
  valid: boolean;
  hint?: string;
}) {
  const { t } = useLanguage();
  const showError = value.trim().length > 0 && !valid;
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
        placeholder={t("dt_rs_field_eg")}
        inputMode="text"
        className={`h-9 text-sm ${showError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
      />
      <div className="h-3.5 text-[10px] leading-none">
        {valid && parsed != null ? (
          <span className="text-emerald-600">{t("dt_rs_field_eq", { inches: Math.round(parsed * 100) / 100, tape: toTapeString(parsed) })}</span>
        ) : showError ? (
          <span className="text-red-500">{hint ? hint : t("dt_rs_field_err")}</span>
        ) : null}
      </div>
    </div>
  );
}
