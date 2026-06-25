import { useState } from "react";
import { Check, Palette, Pencil, X } from "lucide-react";
import { DoorStyleSwatch, type DoorStyleLike } from "@/components/DoorStyleSwatch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─────────────────────────────────────────────────────────────────────────────
// ColorSlotButton
// One of the two "color" (door-style) buttons in the Design Tool. The HIGHLIGHTED
// (active) slot is the door style that newly-placed cabinets are painted in, so a
// member can place the perimeter in Color 1, then switch to Color 2 for the island
// to build a two-tone kitchen. Clicking the body selects the slot; the small edit
// affordance opens a picker to set/change which door style this slot holds.
// ─────────────────────────────────────────────────────────────────────────────

type StyleOption = { id: number; ourName: string | null };

interface ColorSlotButtonProps {
  label: string;
  slot: "A" | "B";
  active: boolean;
  /** The door style currently assigned to this slot, or null if unset. */
  style: (DoorStyleLike & { id?: number }) | null;
  /** All selectable door styles (already scoped to the locked supply line). */
  styles: StyleOption[];
  /** Make this slot the active color. */
  onSelect: () => void;
  /** Assign a door style id to this slot. */
  onPick: (styleId: number) => void;
  /** Remove this slot's color (only offered for the optional second color). */
  onClear?: () => void;
}

export function ColorSlotButton({
  label,
  active,
  style,
  styles,
  onSelect,
  onPick,
  onClear,
}: ColorSlotButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const name = style?.ourName ?? null;
  const hasStyle = style != null;

  return (
    <div
      className={[
        "relative rounded-lg border p-2 text-left transition-all",
        active
          ? "border-[#d4a75a] bg-[#d4a75a]/10 ring-2 ring-[#d4a75a] shadow-sm"
          : "border-border bg-white hover:border-[#d4a75a]/60",
      ].join(" ")}
    >
      {/* Active check badge */}
      {active && (
        <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#d4a75a] text-white shadow">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}

      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {hasStyle && onClear && (
          <button
            type="button"
            title="Remove this color"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="text-muted-foreground hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Body: clicking selects this slot as the active color */}
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2"
      >
        <div className="h-10 w-8 shrink-0 overflow-hidden rounded border border-border bg-white">
          {hasStyle ? (
            <DoorStyleSwatch style={style} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Palette className="h-4 w-4" />
            </div>
          )}
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-foreground">
            {name ?? "Set door style"}
          </span>
          <span className="block text-[10px] text-muted-foreground">
            {active ? "Active — new cabinets use this" : hasStyle ? "Click to use" : "Optional second color"}
          </span>
        </span>
      </button>

      {/* Picker: set / change the door style this slot holds */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-[#1a2744] hover:underline"
          >
            <Pencil className="h-3 w-3" />
            {hasStyle ? "Change door style" : "Choose door style"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          <div className="max-h-64 overflow-y-auto">
            {styles.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                No door styles available.
              </div>
            ) : (
              styles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onPick(s.id); setPickerOpen(false); }}
                  className={[
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] hover:bg-accent",
                    style?.id === s.id ? "bg-accent font-semibold" : "",
                  ].join(" ")}
                >
                  <span className="truncate">{s.ourName ?? `Style #${s.id}`}</span>
                  {style?.id === s.id && <Check className="h-3.5 w-3.5 text-[#d4a75a]" />}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default ColorSlotButton;
