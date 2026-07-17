import { useState, useEffect } from "react";
import { Maximize, Pencil, Ruler, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
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

// ── Unit conversion helpers ──────────────────────────────────────────────────
const INCHES_PER_CM = 1 / 2.54;
const CM_PER_INCH = 2.54;

/** Inches → display string in the active unit system */
function toDisplayString(totalInches: number, metric: boolean): string {
  if (metric) {
    const cm = Math.round(totalInches * CM_PER_INCH);
    return `${cm} cm`;
  }
  const { feet, inches } = inchesToFeetInches(totalInches);
  if (inches === 0) return `${feet}'`;
  return `${feet}' ${inches}"`;
}

/** Parse a user-typed string to inches. Accepts:
 *  - Imperial: "10' 6"", "126"", "10.5'", "120 1/2"
 *  - Metric:   "305 cm", "3.05 m", "305", "3.05"
 *  Returns null if unparseable.
 */
function parseToInches(raw: string, metric: boolean): number | null {
  const s = raw.trim();
  if (!s) return null;

  if (metric) {
    // Accept "305 cm", "3.05 m", or bare number (treated as cm)
    const mMatch = s.match(/^([\d.]+)\s*m$/i);
    if (mMatch) return parseFloat(mMatch[1]) * 100 * INCHES_PER_CM;
    const cmMatch = s.match(/^([\d.]+)\s*(?:cm)?$/i);
    if (cmMatch) return parseFloat(cmMatch[1]) * INCHES_PER_CM;
    return null;
  }

  // Delegate to the existing imperial parser
  return parseLengthToInches(s);
}

const METRIC_STORAGE_KEY = "dt_use_metric";

export function RoomSizeControl({ room, onChange, drawMode, onToggleDraw }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [showPerWall, setShowPerWall] = useState(
    () => !!room.wallCeilings && Object.keys(room.wallCeilings).length > 0,
  );

  // Metric toggle — persisted so the user's preference survives page reloads.
  const [metric, setMetric] = useState<boolean>(() => {
    try { return localStorage.getItem(METRIC_STORAGE_KEY) === "1"; } catch { return false; }
  });
  const toggleMetric = (v: boolean) => {
    setMetric(v);
    try { localStorage.setItem(METRIC_STORAGE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
    // Re-seed the text fields in the new unit
    setWStr(toDisplayString(room.width, v));
    setDStr(toDisplayString(room.depth, v));
    setCStr(toDisplayString(roomCeiling(room), v));
  };

  // Single field per dimension, seeded from the current room.
  const [wStr, setWStr] = useState(() => toDisplayString(room.width, metric));
  const [dStr, setDStr] = useState(() => toDisplayString(room.depth, metric));
  const [cStr, setCStr] = useState(() => toDisplayString(roomCeiling(room), metric));
  // Local draft of per-wall ceiling overrides (undefined = use room default).
  const [perWall, setPerWall] = useState<Partial<Record<WallSide, WallCeiling>>>(
    () => ({ ...(room.wallCeilings ?? {}) }),
  );

  // Re-seed fields when the room changes externally (draw / package preload).
  useEffect(() => {
    setWStr(toDisplayString(room.width, metric));
    setDStr(toDisplayString(room.depth, metric));
    setCStr(toDisplayString(roomCeiling(room), metric));
    setPerWall({ ...(room.wallCeilings ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.width, room.depth, room.ceilingHeight, room.wallCeilings]);

  const wParsed = parseToInches(wStr, metric);
  const dParsed = parseToInches(dStr, metric);
  const cParsed = parseToInches(cStr, metric);
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
    setOpen(false);
  };

  // Trigger label (desktop only — mobile shows icon only)
  const wDisp = inchesToFeetInches(room.width);
  const dDisp = inchesToFeetInches(room.depth);
  const fmt = (v: { feet: number; inches: number }) =>
    v.inches === 0 ? `${v.feet}'` : `${v.feet}'${v.inches}"`;

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

  // Placeholder text for input fields
  const fieldPlaceholder = metric ? "e.g. 305 cm" : t("dt_rs_field_eg");

  // Ceiling preset labels
  const ceilPresetLabel = (h: number) =>
    metric ? `${Math.round(h * CM_PER_INCH)} cm` : `${h / 12}' (${h}")`;

  // Quick preset labels
  const presetLabel = (p: typeof PRESETS[0]) => {
    if (metric) {
      const wCm = Math.round(p.width * CM_PER_INCH);
      const dCm = Math.round(p.depth * CM_PER_INCH);
      return `${wCm} × ${dCm} cm`;
    }
    return t("dt_rs_ft", { label: p.label });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* Mobile: icon-only button; Desktop: full label button */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Maximize className="h-3.5 w-3.5" />
            <span className="hidden lg:inline text-xs">{t("dt_room_label_h", { w: fmt(wDisp), d: fmt(dDisp), h: fmt(inchesToFeetInches(roomCeiling(room))) })}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto" align="start">
          <div className="space-y-3">
            {/* Header row: title + metric toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <Ruler className="h-4 w-4 mt-0.5 text-[#a87f33] shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-foreground">{t("dt_rs_measure_title")}</div>
                  <p className="text-[11px] text-muted-foreground">
                    {metric
                      ? "Enter measurements in cm or m (e.g. 305 cm, 3.05 m)"
                      : <>{t("dt_rs_measure_hint")} <span className="font-medium">10' 6"</span>, <span className="font-medium">126"</span>, <span className="font-medium">120 1/2</span>.</>
                    }
                  </p>
                </div>
              </div>
              {/* ft/in ↔ metric toggle */}
              <div className="flex flex-col items-center gap-0.5 shrink-0 ml-2">
                <Switch
                  checked={metric}
                  onCheckedChange={toggleMetric}
                  aria-label="Toggle metric units"
                  className="scale-90"
                />
                <span className="text-[10px] text-muted-foreground font-medium">
                  {metric ? "Metric" : "ft / in"}
                </span>
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
                metric={metric}
                placeholder={fieldPlaceholder}
              />
              <WallField
                label={t("dt_rs_side_wall")}
                value={dStr}
                onChange={setDStr}
                onEnter={apply}
                parsed={dParsed}
                valid={dValid}
                metric={metric}
                placeholder={fieldPlaceholder}
              />
              <WallField
                label={t("dt_rs_ceiling")}
                value={cStr}
                onChange={setCStr}
                onEnter={apply}
                parsed={cParsed}
                valid={cValid}
                metric={metric}
                placeholder={fieldPlaceholder}
                hint={metric
                  ? `Range: ${Math.round(MIN_CEILING_HEIGHT * CM_PER_INCH)}–${Math.round(MAX_CEILING_HEIGHT * CM_PER_INCH)} cm`
                  : t("dt_rs_ceiling_hint", { min: MIN_CEILING_HEIGHT, max: MAX_CEILING_HEIGHT })
                }
              />
              {/* Ceiling height presets */}
              <div className="flex flex-wrap gap-1">
                {CEILING_HEIGHT_PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setCStr(toDisplayString(h, metric))}
                    className={`rounded-md border px-2 py-1 text-[11px] transition-colors hover:bg-muted/60 ${
                      Math.round(cParsed ?? -1) === h ? "border-[#1a2744] bg-[#1a2744]/5 font-medium" : "border-border"
                    }`}
                  >
                    {ceilPresetLabel(h)}
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

            {/* Quick room presets */}
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dt_rs_quick_presets")}</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      onChange({ width: p.width, depth: p.depth, ceilingHeight: roomCeiling(room), wallCeilings: room.wallCeilings });
                      setWStr(toDisplayString(p.width, metric));
                      setDStr(toDisplayString(p.depth, metric));
                    }}
                    className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted/60 transition-colors"
                  >
                    {presetLabel(p)}
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={onToggleDraw}
            aria-label={t("dt_rs_draw_room")}
            className={`hidden lg:flex w-7 h-7 shrink-0 ${
              drawMode
                ? "bg-[#d4a75a] text-[#1a2744] border-[#d4a75a] hover:bg-[#c89945]"
                : ""
            }`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-semibold">{t("dt_rs_draw_room")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Click and drag on the canvas to draw the room outline</p>
        </TooltipContent>
      </Tooltip>


    </div>
  );
}

// ── Per-wall ceiling editor ──────────────────────────────────────────────────
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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">High</span>
              <Input
                type="number"
                value={Math.round(wc.high)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdate({ high: Math.max(v, wc.low) });
                }}
                className="h-7 w-16 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Low</span>
              <Input
                type="number"
                value={Math.round(wc.low)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdate({ low: Math.min(v, wc.high) });
                }}
                className="h-7 w-16 text-xs"
              />
            </div>
            <span className="text-[10px] text-muted-foreground">in</span>
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

// ── Single dimension input field ─────────────────────────────────────────────
function WallField({
  label, value, onChange, onEnter, parsed, valid, hint, metric, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  parsed: number | null;
  valid: boolean;
  hint?: string;
  metric: boolean;
  placeholder: string;
}) {
  const { t } = useLanguage();
  const showError = value.trim().length > 0 && !valid;

  // Confirmation string shown below the field when valid
  const confirmStr = valid && parsed != null
    ? metric
      ? `= ${Math.round(parsed * 2.54)} cm  /  ${inchesToFeetInches(parsed).feet}' ${inchesToFeetInches(parsed).inches || ""}"`
      : t("dt_rs_field_eq", { inches: Math.round(parsed * 100) / 100, tape: (() => { const { feet, inches } = inchesToFeetInches(parsed); return inches === 0 ? `${feet}'` : `${feet}' ${inches}"`; })() })
    : null;

  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
        placeholder={placeholder}
        inputMode="text"
        className={`h-9 text-sm ${showError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
      />
      <div className="h-3.5 text-[10px] leading-none">
        {confirmStr ? (
          <span className="text-emerald-600">{confirmStr}</span>
        ) : showError ? (
          <span className="text-red-500">{hint ? hint : t("dt_rs_field_err")}</span>
        ) : null}
      </div>
    </div>
  );
}
