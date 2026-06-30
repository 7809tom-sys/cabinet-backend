import { useMemo, useState } from "react";
import { Check, ChevronDown, Palette, Pencil, X } from "lucide-react";
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
// entire lineup is reachable on every mobile browser.
//
// GROUPING: instead of one long flat list of every door style, styles are grouped
// by their distributor (supply line) into a one-open-at-a-time accordion. Headers
// use the NEUTRAL white-label distributor label only (never the hidden supplier
// brand). Opening one line collapses the others so the picker stays compact.
// ─────────────────────────────────────────────────────────────────────────────

type StyleOption = {
  id: number;
  ourName: string | null;
  aliasName?: string | null;
  thumbnailImageUrl?: string | null;
  doorSampleImageUrl?: string | null;
  distributorId?: number | null;
};

/** Neutral, customer-safe distributor label (no hidden supplier brand). */
export type DistributorLabel = { id: number; name: string | null };

interface ColorSlotButtonProps {
  label: string;
  slot: "A" | "B";
  active: boolean;
  /** The door style currently assigned to this slot, or null if unset. */
  style: (DoorStyleLike & { id?: number }) | null;
  /** All selectable door styles (already scoped to the locked supply line). */
  styles: StyleOption[];
  /** Neutral distributor labels for grouping headers (from trpc.distributors.list). */
  distributors?: DistributorLabel[];
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

interface StyleGroup {
  distributorId: number | null;
  label: string;
  styles: StyleOption[];
}

export function ColorSlotButton({
  label,
  active,
  style,
  styles,
  distributors,
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

  // Map distributorId → neutral label for the group headers.
  const labelById = useMemo(() => {
    const m = new Map<number, string>();
    (distributors ?? []).forEach((d) => {
      if (d.name) m.set(d.id, d.name);
    });
    return m;
  }, [distributors]);

  // Group the styles by distributor (supply line). Groups are ordered by their
  // neutral label so the list is stable; styles inside keep their incoming order.
  const groups = useMemo<StyleGroup[]>(() => {
    const byDist = new Map<number | null, StyleOption[]>();
    for (const s of styles) {
      const key = s.distributorId ?? null;
      const arr = byDist.get(key);
      if (arr) arr.push(s);
      else byDist.set(key, [s]);
    }
    const out: StyleGroup[] = [];
    byDist.forEach((list, distributorId) => {
      const label =
        distributorId != null
          ? labelById.get(distributorId) ?? t("dt_cs_line_fallback", { id: distributorId })
          : t("dt_cs_line_other");
      out.push({ distributorId, label, styles: list });
    });
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [styles, labelById, t]);

  // Which distributor group is currently expanded (one at a time). Defaults to
  // the group that holds the selected style, else the first group.
  const selectedDistId = useMemo(() => {
    const sid = (style as { id?: number } | null)?.id;
    if (sid == null) return undefined;
    return styles.find((s) => s.id === sid)?.distributorId ?? null;
  }, [style, styles]);

  const [openGroup, setOpenGroup] = useState<number | null | undefined>(undefined);
  // Resolve the effective open group: explicit user choice wins, else the group
  // with the selected style, else the first group.
  const effectiveOpen =
    openGroup !== undefined
      ? openGroup
      : selectedDistId !== undefined
        ? selectedDistId
        : groups[0]?.distributorId ?? null;

  // Card-grid of door styles within one open distributor group.
  const StyleGrid = ({ list, cols }: { list: StyleOption[]; cols: 2 | 3 }) => (
    <div className={`grid gap-2 p-1 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {list.map((s) => {
        const isSelected = (style as { id?: number } | null)?.id === s.id;
        const sName = styleDisplayName(s) || t("dt_cs_style_num", { id: s.id });
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onPick(s.id);
              setPickerOpen(false);
            }}
            title={sName}
            className={[
              "relative flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition-all",
              "hover:border-[#d4a75a]/70 hover:bg-accent/60 active:scale-[0.97]",
              isSelected
                ? "border-[#d4a75a] bg-[#d4a75a]/10 ring-1 ring-[#d4a75a] shadow-sm"
                : "border-border bg-white",
            ].join(" ")}
          >
            <div className="w-full aspect-[10/13] overflow-hidden rounded">
              <DoorStyleSwatch
                style={s as Parameters<typeof DoorStyleSwatch>[0]["style"]}
                className="h-full w-full"
              />
            </div>
            <span className={`w-full truncate text-[10px] leading-tight ${isSelected ? "font-semibold text-[#1a2744]" : "text-muted-foreground"}`}>
              {sName}
            </span>
            {isSelected && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#d4a75a] text-white shadow">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Accordion: one distributor line open at a time.
  const StyleList = ({ cols = 2 }: { cols?: 2 | 3 }) =>
    styles.length === 0 ? (
      <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
        {t("dt_cs_none_available")}
      </div>
    ) : groups.length <= 1 ? (
      // Only one supply line in scope — no need for accordion chrome.
      <StyleGrid list={groups[0]?.styles ?? styles} cols={cols} />
    ) : (
      <div className="space-y-1">
        {groups.map((g) => {
          const isOpen = effectiveOpen === g.distributorId;
          const hasSelected = g.styles.some(
            (s) => (style as { id?: number } | null)?.id === s.id
          );
          return (
            <div key={String(g.distributorId)} className="rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : g.distributorId)}
                aria-expanded={isOpen}
                className={[
                  "flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors",
                  isOpen ? "bg-[#d4a75a]/10" : "bg-muted/40 hover:bg-muted/70",
                ].join(" ")}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[12px] font-semibold text-foreground">{g.label}</span>
                  {hasSelected && (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#d4a75a] text-white">
                      <Check className="h-2 w-2" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                  {t("dt_cs_group_count", { count: g.styles.length })}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border bg-white">
                  <StyleGrid list={g.styles} cols={cols} />
                </div>
              )}
            </div>
          );
        })}
      </div>
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
                <StyleList cols={3} />
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
          <PopoverContent align="start" side="bottom" collisionPadding={12} className="w-64 p-1">
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
