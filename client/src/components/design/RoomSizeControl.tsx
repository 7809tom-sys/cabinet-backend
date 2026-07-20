import { useState, useEffect } from "react";
import { Maximize, Pencil, Ruler, Check, ChevronDown, Pentagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  RoomData, inchesToFeetInches, parseLengthToInches, clampRoomInches,
  roomCeiling, CEILING_HEIGHT_PRESETS, MIN_CEILING_HEIGHT, MAX_CEILING_HEIGHT,
  type WallSide, type WallCeiling, wallCeiling, clampCeilingHeight,
} from "@/lib/design";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  room: RoomData;
  onChange: (room: RoomData) => void;
  drawMode: boolean;
  onToggleDraw: () => void;
  /** Whether the room is currently in polygon (custom shape) mode. */
  isPolygon?: boolean;
  /** Toggle polygon editing mode. */
  onTogglePolygon?: () => void;
}

const PRESETS: { label: string; width: number; depth: number }[] = [
  { label: "10 × 8", width: 120, depth: 96 },
  { label: "10 × 10", width: 120, depth: 120 },
  { label: "12 × 10", width: 144, depth: 120 },
  { label: "12 × 12", width: 144, depth: 144 },
  { label: "16 × 12", width: 192, depth: 144 },
];

// The four walls in display order, with their plan-side key.
const WALLS: { side: WallSide; labelKey: "dt_rs_back_wall" | "dt_rs_side_wall" | "plan_wall_left" | "plan_wall_right" }[] = [
  { side: "top", labelKey: "dt_rs_back_wall" },
  { side: "bottom", labelKey: "dt_rs_side_wall" },
  { side: "left", labelKey: "plan_wall_left" },
  { side: "right", labelKey: "plan_wall_right" },
];

// Display inches as a clean tape-measure string, e.g. 126 -> 10' 6"
function toTapeString(totalInches: number): string {
  const { feet, inches } = inchesToFeetInches(totalInches);
  if (inches === 0) return `${feet}'`;
  return `${feet}' ${inches}"`;
}

export function RoomSizeControl({ room, onChange, drawMode, onToggleDraw, isPolygon, onTogglePolygon }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [showPerWall, setShowPerWall] = useState(
    () => !!room.wallCeilings && Object.keys(room.wallCeilings).length > 0,
  );

  // Single tape-measure field per wall, seeded from the current room and kept in
  // sync whenever the room changes externally (mouse-draw / package preload).
  const [wStr, setWStr] = useState(() => toTapeString(room.width));
  const [dStr, setDStr] = useState(() => toTapeString(room.depth));
  const [cStr, setCStr] = useState(() => toTapeString(roomCeiling(room)));
  // Local draft of per-wall ceiling overrides (undefined = use room default).
  const [perWall, setPerWall] = useState<Partial<Record<WallSide, WallCeiling>>>(
    () => ({ ...(room.wallCeilings ?? {}) }),
  );

  useEffect(() => {
    setWStr(toTapeString(room.width));
    setDStr(toTapeString(room.depth));
    setCStr(toTapeString(roomCeiling(room)));
    setPerWall({ ...(room.wallCeilings ?? {}) });
  }, [room.width, room.depth, room.ceilingHeight, room.wallCeilings]);

  const wParsed = parseLengthToInches(wStr);
  const dParsed = parseLengthToInches(dStr);
  const cParsed = parseLengthToInches(cStr);
  const wValid = wParsed != null;
  const dValid = dParsed != null;
  const cValid =
    cParsed != null && cParsed >= MIN_CEILING_HEIGHT && cParsed <= MAX_CEILING_HEIGHT;

  const apply = () => {
    if (!wValid || !dValid || !cValid) return;
    // Keep only meaningful per-wall overrides (a wall whose values actually
    // differ from the room default OR is sloped). Flat walls equal to the
    // default are dropped so they keep tracking the room ceiling.
    const flat = Math.round(cParsed!);
    const cleaned: Partial<Record<WallSide, WallCeiling>> = {};
    for (const { side } of WALLS) {
      const wc = perWall[side];
      if (!wc) continue;
      const high = clampCeilingHeight(wc.high);
      const low = clampCeilingHeight(wc.low);
      const isSloped = Math.abs(high - low) > 0.5;
      if (!isSloped && high === flat) continue; // tracks default — drop
      cleaned[side] = isSloped
        ? { high: Math.max(high, low), low: Math.min(high, low), slopeFrom: wc.slopeFrom ?? "start" }
        : { high, low: high };
    }
    onChange({
      width: clampRoomInches(wParsed!),
      depth: clampRoomInches(dParsed!),
      ceilingHeight: flat,
      wallCeilings: Object.keys(cleaned).length ? cleaned : undefined,
    });
    setOpen(false);
  };

  const wDisp = inchesToFeetInches(room.width);
  const dDisp = inchesToFeetInches(room.depth);
  const fmt = (v: { feet: number; inches: number }) =>
    v.inches === 0 ? `${v.feet}'` : `${v.feet}'${v.inches}"`;

  // Effective ceiling shown on the trigger uses the room default.
  const roomDefault = Math.round(cParsed ?? roomCeiling(room));

  const setWallMode = (side: WallSide, mode: "default" | "flat" | "sloped") => {
    setPerWall((prev) => {
      const next = { ...prev };
      if (mode === "default") {
        delete next[side];
      } else if (mode === "flat") {
        const cur = next[side] ?? wallCeiling(room, side);
        const h = clampCeilingHeight(cur.high);
        next[side] = { high: h, low: h };
      } else {
        const cur = next[side] ?? wallCeiling(room, side);
        const high = clampCeilingHeight(cur.high);
        const low = clampCeilingHeight(
          Math.abs(cur.high - cur.low) > 0.5 ? cur.low : Math.max(MIN_CEILING_HEIGHT, high - 24),
        );
        next[side] = { high: Math.max(high, low), low: Math.min(high, low), slopeFrom: cur.slopeFrom ?? "start" };
      }
      return next;
    });
  };

  const updateWall = (side: WallSide, patch: Partial<WallCeiling>) => {
    setPerWall((prev) => {
      const cur = prev[side] ?? wallCeiling(room, side);
      return { ...prev, [side]: { ...cur, ...patch } };
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            title={t("dt_room_label_h", { w: fmt(wDisp), d: fmt(dDisp), h: fmt(inchesToFeetInches(roomCeiling(room))) })}
          >
            <Maximize className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto" align="start">
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

            {/* Per-wall / sloped ceiling section */}
            <div className="rounded-md border border-border">
              <button
                type="button"
                onClick={() => setShowPerWall((v) => !v)}
                className="flex w-full items-center justify-between px-2.5 py-2 text-left"
              >
                <span className="text-[11px] font-semibold text-foreground">{t("dt_rs_per_wall_ceiling")}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showPerWall ? "rotate-180" : ""}`} />
              </button>
              {showPerWall && (
                <div className="space-y-2.5 border-t border-border px-2.5 py-2.5">
                  <p className="text-[10px] text-muted-foreground">{t("dt_rs_per_wall_hint")}</p>
                  {WALLS.map(({ side, labelKey }) => (
                    <WallCeilingRow
                      key={side}
                      label={t(labelKey)}
                      wc={perWall[side]}
                      roomDefault={roomDefault}
                      onMode={(m) => setWallMode(side, m)}
                      onUpdate={(patch) => updateWall(side, patch)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dt_rs_quick_presets")}</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => onChange({ width: p.width, depth: p.depth, ceilingHeight: roomCeiling(room), wallCeilings: room.wallCeilings })}
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


    </div>
  );
}

// One wall's ceiling editor: default / flat / sloped, with inch inputs.
function WallCeilingRow({
  label, wc, roomDefault, onMode, onUpdate,
}: {
  label: string;
  wc: WallCeiling | undefined;
  roomDefault: number;
  onMode: (mode: "default" | "flat" | "sloped") => void;
  onUpdate: (patch: Partial<WallCeiling>) => void;
}) {
  const { t } = useLanguage();
  const isSloped = !!wc && Math.abs(wc.high - wc.low) > 0.5;
  const mode: "default" | "flat" | "sloped" = !wc ? "default" : isSloped ? "sloped" : "flat";

  const pill = (active: boolean) =>
    `rounded px-1.5 py-0.5 text-[10px] transition-colors ${
      active ? "bg-[#1a2744] text-white" : "border border-border hover:bg-muted/60"
    }`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] text-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <button type="button" className={pill(mode === "default")} onClick={() => onMode("default")}>
            {t("dt_rs_uses_default")}
          </button>
          <button type="button" className={pill(mode === "flat")} onClick={() => onMode("flat")}>
            {t("dt_rs_wall_flat")}
          </button>
          <button type="button" className={pill(mode === "sloped")} onClick={() => onMode("sloped")}>
            {t("dt_rs_wall_sloped")}
          </button>
        </div>
      </div>

      {mode === "default" && (
        <p className="text-[10px] text-muted-foreground">{roomDefault}&quot;</p>
      )}

      {mode === "flat" && wc && (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={Math.round(wc.high)}
            onChange={(e) => {
              const v = Number(e.target.value);
              onUpdate({ high: v, low: v });
            }}
            className="h-7 w-20 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">in</span>
        </div>
      )}

      {mode === "sloped" && wc && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">{t("dt_rs_wall_high")}</Label>
              <Input
                type="number"
                value={Math.round(wc.high)}
                onChange={(e) => onUpdate({ high: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">{t("dt_rs_wall_low")}</Label>
              <Input
                type="number"
                value={Math.round(wc.low)}
                onChange={(e) => onUpdate({ low: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">{t("dt_rs_high_side")}:</span>
            <button
              type="button"
              className={pill((wc.slopeFrom ?? "start") === "start")}
              onClick={() => onUpdate({ slopeFrom: "start" })}
            >
              {t("dt_rs_high_left")}
            </button>
            <button
              type="button"
              className={pill((wc.slopeFrom ?? "start") === "end")}
              onClick={() => onUpdate({ slopeFrom: "end" })}
            >
              {t("dt_rs_high_right")}
            </button>
          </div>
        </div>
      )}
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

// ─── Inline variant (for mobile sheet — no Popover wrapper) ──────────────────
// Renders the dimension form directly so the user sees the fields immediately
// without needing to tap an extra trigger button.
interface InlineProps {
  room: RoomData;
  onChange: (room: RoomData) => void;
  /** Called after the user taps Apply so the parent can close the sheet. */
  onApplied?: () => void;
}

export function RoomSizeInline({ room, onChange, onApplied }: InlineProps) {
  const { t } = useLanguage();
  const [showPerWall, setShowPerWall] = useState(
    () => !!room.wallCeilings && Object.keys(room.wallCeilings).length > 0,
  );
  const [wStr, setWStr] = useState(() => toTapeString(room.width));
  const [dStr, setDStr] = useState(() => toTapeString(room.depth));
  const [cStr, setCStr] = useState(() => toTapeString(roomCeiling(room)));
  const [perWall, setPerWall] = useState<Partial<Record<WallSide, WallCeiling>>>(
    () => ({ ...(room.wallCeilings ?? {}) }),
  );

  useEffect(() => {
    setWStr(toTapeString(room.width));
    setDStr(toTapeString(room.depth));
    setCStr(toTapeString(roomCeiling(room)));
    setPerWall({ ...(room.wallCeilings ?? {}) });
  }, [room.width, room.depth, room.ceilingHeight, room.wallCeilings]);

  const wParsed = parseLengthToInches(wStr);
  const dParsed = parseLengthToInches(dStr);
  const cParsed = parseLengthToInches(cStr);
  const wValid = wParsed != null;
  const dValid = dParsed != null;
  const cValid =
    cParsed != null && cParsed >= MIN_CEILING_HEIGHT && cParsed <= MAX_CEILING_HEIGHT;

  const apply = () => {
    if (!wValid || !dValid || !cValid) return;
    const flat = Math.round(cParsed!);
    const cleaned: Partial<Record<WallSide, WallCeiling>> = {};
    for (const { side } of WALLS) {
      const wc = perWall[side];
      if (!wc) continue;
      const high = clampCeilingHeight(wc.high);
      const low = clampCeilingHeight(wc.low);
      const isSloped = Math.abs(high - low) > 0.5;
      if (!isSloped && high === flat) continue;
      cleaned[side] = isSloped
        ? { high: Math.max(high, low), low: Math.min(high, low), slopeFrom: wc.slopeFrom ?? "start" }
        : { high, low: high };
    }
    onChange({
      width: clampRoomInches(wParsed!),
      depth: clampRoomInches(dParsed!),
      ceilingHeight: flat,
      wallCeilings: Object.keys(cleaned).length ? cleaned : undefined,
    });
    onApplied?.();
  };

  const setWallMode = (side: WallSide, mode: "default" | "flat" | "sloped") => {
    setPerWall((prev) => {
      const next = { ...prev };
      if (mode === "default") {
        delete next[side];
      } else if (mode === "flat") {
        const cur = next[side] ?? wallCeiling(room, side);
        const h = clampCeilingHeight(cur.high);
        next[side] = { high: h, low: h };
      } else {
        const cur = next[side] ?? wallCeiling(room, side);
        const high = clampCeilingHeight(cur.high);
        const low = clampCeilingHeight(
          Math.abs(cur.high - cur.low) > 0.5 ? cur.low : Math.max(MIN_CEILING_HEIGHT, high - 24),
        );
        next[side] = { high: Math.max(high, low), low: Math.min(high, low), slopeFrom: cur.slopeFrom ?? "start" };
      }
      return next;
    });
  };

  const updateWall = (side: WallSide, patch: Partial<WallCeiling>) => {
    setPerWall((prev) => {
      const cur = prev[side] ?? wallCeiling(room, side);
      return { ...prev, [side]: { ...cur, ...patch } };
    });
  };

  const roomDefault = Math.round(cParsed ?? roomCeiling(room));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Ruler className="h-4 w-4 mt-0.5 text-[#a87f33] shrink-0" />
        <div>
          <div className="text-sm font-semibold text-foreground">{t("dt_rs_measure_title")}</div>
          <p className="text-[11px] text-muted-foreground">
            {t("dt_rs_measure_hint")} <span className="font-medium">10' 6"</span>, <span className="font-medium">126"</span>, <span className="font-medium">120 1/2</span>.
          </p>
        </div>
      </div>

      <div className="space-y-3">
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

      {/* Per-wall / sloped ceiling section */}
      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setShowPerWall((v) => !v)}
          className="flex w-full items-center justify-between px-2.5 py-2 text-left"
        >
          <span className="text-[11px] font-semibold text-foreground">{t("dt_rs_per_wall_ceiling")}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showPerWall ? "rotate-180" : ""}`} />
        </button>
        {showPerWall && (
          <div className="space-y-2.5 border-t border-border px-2.5 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t("dt_rs_per_wall_hint")}</p>
            {WALLS.map(({ side, labelKey }) => (
              <WallCeilingRow
                key={side}
                label={t(labelKey)}
                wc={perWall[side]}
                roomDefault={roomDefault}
                onMode={(m) => setWallMode(side, m)}
                onUpdate={(patch) => updateWall(side, patch)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick presets */}
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dt_rs_quick_presets")}</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange({ width: p.width, depth: p.depth, ceilingHeight: roomCeiling(room), wallCeilings: room.wallCeilings })}
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
        className="w-full h-10 bg-[#1a2744] text-white hover:bg-[#243456] gap-1.5"
      >
        <Check className="h-4 w-4" /> {t("dt_rs_apply")}
      </Button>
      <p className="text-[10px] text-muted-foreground text-center">
        {t("dt_rs_tip")}
      </p>
    </div>
  );
}
