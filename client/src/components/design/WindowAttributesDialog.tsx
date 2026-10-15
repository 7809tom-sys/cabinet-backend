import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clampOpening, type RoomData, type WallOpening } from "@/lib/design";
import type { WindowConstructionStyle, WindowFrameStyle, WindowSceneKind } from "./InteractiveRoom3D";
import { OpeningSizeEditor } from "./OpeningSizeEditor";

type WindowGridStyle = NonNullable<WallOpening["windowGridStyle"]>;

const WINDOW_SCENE_OPTIONS: Array<{ value: WindowSceneKind; label: string }> = [
  { value: "garden", label: "Garden photo" },
  { value: "woodland", label: "Woodland photo" },
  { value: "coastal", label: "Coastal photo" },
  { value: "urban", label: "Urban photo" },
  { value: "mountain", label: "Mountain photo" },
  { value: "night", label: "Night photo" },
  { value: "city-skyline", label: "City skyline" },
  { value: "desert", label: "Desert" },
  { value: "snow", label: "Snowy mountain" },
  { value: "seasonal-garden", label: "Seasonal garden" },
  { value: "autumn-woodland", label: "Autumn woodland" },
  { value: "daylight", label: "Daylight fallback" },
  { value: "suburban", label: "Suburban fallback" },
  { value: "privacy", label: "Privacy glass" },
];

const WINDOW_GRID_OPTIONS: Array<{ value: WindowGridStyle; label: string }> = [
  { value: "scene-default", label: "Scene default" },
  { value: "none", label: "Clear glass — no grid" },
  { value: "1x0", label: "One vertical only" },
  { value: "2x0", label: "Two vertical only" },
  { value: "3x0", label: "Three vertical only" },
  { value: "0x1", label: "One horizontal only" },
  { value: "0x2", label: "Two horizontal only" },
  { value: "0x3", label: "Three horizontal only" },
  { value: "1x1", label: "One vertical × one horizontal" },
  { value: "2x1", label: "Two vertical × one horizontal" },
  { value: "2x2", label: "Two vertical × two horizontal" },
  { value: "3x2", label: "Three vertical × two horizontal" },
];

const WINDOW_SIZE_PRESETS = [
  { value: "24x36", label: '24″ W × 36″ H — narrow' },
  { value: "30x36", label: '30″ W × 36″ H — standard' },
  { value: "36x36", label: '36″ W × 36″ H — square' },
  { value: "36x48", label: '36″ W × 48″ H — portrait' },
  { value: "48x36", label: '48″ W × 36″ H — landscape' },
  { value: "48x48", label: '48″ W × 48″ H — wide square' },
  { value: "60x48", label: '60″ W × 48″ H — picture' },
] as const;

const WINDOW_SILL_PRESETS = [
  { value: "37.5", label: 'Countertop line — 37½″' },
  { value: "39", label: 'Low over-sink — 39″' },
  { value: "42", label: 'Typical over-sink — 42″' },
  { value: "44", label: 'Raised over-sink — 44″' },
  { value: "48", label: 'High sill — 48″' },
] as const;

export type WindowAttributesDialogProps = {
  opening: WallOpening | null;
  room: RoomData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (opening: WallOpening) => void;
  onDelete: (uid: string) => void;
  onPositionReferenceFocusChange?: (reference: { openingUid: string; reference: "start" | "end" } | null) => void;
};

export function WindowAttributesDialog({ opening, room, open, onOpenChange, onChange, onDelete, onPositionReferenceFocusChange }: WindowAttributesDialogProps) {
  const [movementText, setMovementText] = useState("1");
  const parsedMovement = Number(movementText);
  const movementIncrementIn = Number.isFinite(parsedMovement)
    ? Math.max(0.125, Math.min(48, Math.round(parsedMovement * 8) / 8))
    : 1;
  if (!opening || opening.kind !== "window") return null;
  const updateAppearance = (patch: Partial<Pick<WallOpening, "windowSceneKind" | "windowFrameStyle" | "windowConstructionStyle" | "windowGridStyle">>) => {
    onChange({ ...opening, ...patch });
  };
  const currentSizePreset = WINDOW_SIZE_PRESETS.find((preset) => preset.value === `${opening.width}x${opening.height}`)?.value ?? "custom";
  const currentSillPreset = WINDOW_SILL_PRESETS.find((preset) => Number(preset.value) === opening.sill)?.value ?? "custom";
  const applySizePreset = (value: string) => {
    if (value === "custom") return;
    const [width, height] = value.split("x").map(Number);
    if (Number.isFinite(width) && Number.isFinite(height)) onChange(clampOpening({ ...opening, width, height }, room));
  };
  const applySillPreset = (value: string) => {
    if (value === "custom") return;
    const sill = Number(value);
    if (Number.isFinite(sill)) onChange(clampOpening({ ...opening, sill }, room));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86dvh] overflow-y-auto sm:max-w-2xl" data-testid="window-attributes-dialog">
        <DialogHeader>
          <DialogTitle>Window attributes</DialogTitle>
          <DialogDescription>
            Enter its exact position from the selected wall’s start corner, or move it by a measured increment toward that wall’s start or end. All measurements are in inches.
          </DialogDescription>
        </DialogHeader>
        <label className="grid max-w-[14rem] gap-1.5 text-sm font-medium">
          Exact movement increment in inches
          <input
            type="number"
            inputMode="decimal"
            min="0.125"
            max="48"
            step="0.125"
            aria-label="Window movement distance in inches"
            value={movementText}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setMovementText(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <section className="grid gap-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/20" aria-labelledby="window-appearance-heading">
          <div>
            <h3 id="window-appearance-heading" className="text-sm font-semibold">Window appearance</h3>
            <p className="text-xs text-muted-foreground">These choices are saved on this window only. Use them to keep multiple windows realistic and visually distinct.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-medium">
              Scene
              <select
                aria-label="Window scene for this window"
                value={opening.windowSceneKind ?? "garden"}
                onChange={(event) => updateAppearance({ windowSceneKind: event.target.value as WindowSceneKind })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {WINDOW_SCENE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Frame finish
              <select
                aria-label="Window frame finish for this window"
                value={opening.windowFrameStyle ?? "white"}
                onChange={(event) => updateAppearance({ windowFrameStyle: event.target.value as WindowFrameStyle })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="wood">Wood</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Construction / style
              <select
                aria-label="Window construction style for this window"
                value={opening.windowConstructionStyle ?? "picture"}
                onChange={(event) => updateAppearance({ windowConstructionStyle: event.target.value as WindowConstructionStyle })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="picture">Picture</option>
                <option value="double-hung">Double-hung</option>
                <option value="casement">Casement</option>
                <option value="slider">Slider</option>
                <option value="french-cottage">French / Cottage</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Mullion / grid
              <select
                aria-label="Window mullion grid for this window"
                value={opening.windowGridStyle ?? "scene-default"}
                onChange={(event) => updateAppearance({ windowGridStyle: event.target.value as WindowGridStyle })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {WINDOW_GRID_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label className="grid max-w-sm gap-1.5 text-sm font-medium">
            Common window proportion
            <select
              aria-label="Common window proportion"
              value={currentSizePreset}
              onChange={(event) => applySizePreset(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="custom">Custom size — use width and height below</option>
              {WINDOW_SIZE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
            </select>
          </label>
          <label className="grid max-w-sm gap-1.5 text-sm font-medium">
            Common over-sink sill height
            <select
              aria-label="Common over-sink sill height"
              value={currentSillPreset}
              onChange={(event) => applySillPreset(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="custom">Custom sill height — use the sill field below</option>
              {WINDOW_SILL_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground">The selected photograph, architectural frame, glass reflection, sill, and mullion grid are rendered together in 3D.</p>
        </section>
        <div className="rounded-lg border bg-muted/20 p-3">
          <OpeningSizeEditor opening={opening} room={room} onChange={onChange} onDelete={() => onDelete(opening.uid)} movementIncrementIn={movementIncrementIn} onPositionReferenceFocusChange={onPositionReferenceFocusChange} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
