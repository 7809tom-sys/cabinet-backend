import { useState } from "react";
import { Check, Palette, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { DoorStyleSwatch, type DoorStyleLike } from "@/components/DoorStyleSwatch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { styleDisplayName } from "@/lib/styleDisplayName";

// ─────────────────────────────────────────────────────────────────────────────
// ColorSlotButton
// One of the two "color" (door-style) buttons in the Design Tool. The HIGHLIGHTED
// (active) slot is the door style that newly-placed cabinets are painted in, so a
// member can place the perimeter in Color 1, then switch to Color 2 for the island
// to build a two-tone kitchen. Clicking the body selects the slot; the small edit
// affordance opens a picker to set/change which door style this slot holds.
//
// MOBILE NOTE: on touch / small screens the style list is shown in a full-width
// BOTTOM SHEET, not a Popover. A Radix Popover anchored to a tiny trigger near the
// bottom of a phone screen could only grow ~10 rows tall and its internal scroll
// gesture was being captured by the canvas behind it ("only see ~10 styles, won't
// scroll"). A bottom Sheet is full-height and natively touch-scrollable, so the
// entire A→Z lineup is reachable on every mobile browser.
// ─────────────────────────────────────────────────────────────────────────────

type StyleOption = { id: number; ourName: string | null; aliasName?: string | null };

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
  /** When true, blocks the picker from opening (e.g. cabinets locked, or Color 1 not yet set). */
  disabled?: boolean;
  /** Tooltip shown when the user tries to open a disabled picker. */
  disabledReason?: string;
}

export function ColorSlotButton({
  label,
  active,
  style,
  styles,
  onSelect,
  onPick,
  onClear,
  disabled = false,
  disabledReason,
}: ColorSlotButtonProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile(1024);
  const [pickerOpen, setPickerOpen] = useState(false);
  const name = style ? (styleDisplayName(style as { ourName?: string | null; aliasName?: string | null }) || null) : null;
  const hasStyle = style != null;

  // Shared list of selectable styles, reused by both the Popover (desktop) and
  // the Sheet (mobile) so behavior stays identical.
  const StyleList = ({ rowClass }: { rowClass?: string }) =>
    styles.length === 0 ? (
      <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
        {t("dt_cs_none_available")}
      </div>
    ) : (
      <>
        {styles.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onPick(s.id);
              setPickerOpen(false);
            }}
            className={[
              "flex w-full items-center justify-between rounded px-2 text-left hover:bg-accent",
              rowClass ?? "py-1.5 text-[12px]",
              style?.id === s.id ? "bg-accent font-semibold" : "",
            ].join(" ")}
          >
            <span className="truncate">
              {styleDisplayName(s) || t("dt_cs_style_num", { id: s.id })}
            </span>
            {style?.id === s.id && (
              <Check className="h-4 w-4 shrink-0 text-[#d4a75a]" />
            )}
          </button>
        ))}
      </>
    );

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
            title={t("dt_cs_remove_color")}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
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
            {name ?? t("dt_cs_set_style")}
          </span>
          <span className="block text-[10px] text-muted-foreground">
            {active
              ? t("dt_cs_active")
              : hasStyle
                ? t("dt_cs_click_use")
                : t("dt_cs_optional_second")}
          </span>
        </span>
      </button>

      {/* The trigger looks identical on desktop & mobile; only what it opens differs. */}
      {isMobile ? (
        <>
          <button
            type="button"
            onClick={() => {
              if (disabled) { toast.info(disabledReason ?? "Set Color 1 first before choosing Color 2."); return; }
              setPickerOpen(true);
            }}
            className={[
              "mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium hover:underline",
              disabled ? "text-muted-foreground opacity-50 cursor-not-allowed" : "text-[#1a2744]",
            ].join(" ")}
          >
            <Pencil className="h-3 w-3" />
            {hasStyle ? t("dt_cs_change_style") : t("dt_cs_choose_style")}
          </button>
          <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
            <SheetContent
              side="bottom"
              className="flex max-h-[85vh] flex-col rounded-t-2xl p-0"
            >
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle className="text-base">
                  {hasStyle ? t("dt_cs_change_style") : t("dt_cs_choose_style")}
                </SheetTitle>
              </SheetHeader>
              <div
                className="flex-1 overflow-y-auto overscroll-contain px-3 py-2"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <StyleList rowClass="py-3 text-[15px] border-b border-border/40 last:border-0" />
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={disabled ? false : pickerOpen} onOpenChange={(o) => { if (disabled) { toast.info(disabledReason ?? "Set Color 1 first before choosing Color 2."); return; } setPickerOpen(o); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={() => { if (disabled) { toast.info(disabledReason ?? "Set Color 1 first before choosing Color 2."); } }}
              className={[
                "mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium hover:underline",
                disabled ? "text-muted-foreground opacity-50 cursor-not-allowed" : "text-[#1a2744]",
              ].join(" ")}
            >
              <Pencil className="h-3 w-3" />
              {hasStyle ? t("dt_cs_change_style") : t("dt_cs_choose_style")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" collisionPadding={12} className="w-56 p-1">
            <div
              className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain touch-pan-y"
              style={{ WebkitOverflowScrolling: "touch" }}
              onWheelCapture={(e) => e.stopPropagation()}
            >
              <StyleList />
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export default ColorSlotButton;
