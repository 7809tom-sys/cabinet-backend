import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Layers, Palette, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { DoorStyleSwatch, type DoorStyleLike } from "@/components/DoorStyleSwatch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
// Sheet removed — mobile picker is now inline to avoid nested-Sheet Chrome bug
import { useIsMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { styleDisplayName } from "@/lib/styleDisplayName";
import { groupStylesByDistributor } from "@/lib/groupStylesByDistributor";

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
  styleCode?: string | null;
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
  /** When set, the LineChooser shows a "Current series" badge on the locked distributor's row. */
  lockedDistributorId?: number | null;
}

interface StyleGroup {
  distributorId: number | null;
  label: string;
  styles: StyleOption[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SeriesSwitcher — compact single-row series selector for mobile.
// Shows only the active series name as a pill. Tapping it opens an inline
// dropdown of all series so the user can switch without losing grid space.
// ─────────────────────────────────────────────────────────────────────────────
function SeriesSwitcher({
  groups,
  effectiveGroup,
  onChoose,
  activeStyle,
}: {
  groups: StyleGroup[];
  effectiveGroup: number | null | undefined;
  onChoose: (distId: number | null) => void;
  activeStyle: { id?: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const activeGroupItem = groups.find((g) => g.distributorId === effectiveGroup) ?? groups[0];
  const previewStyle = activeGroupItem?.styles.find((s) => s.thumbnailImageUrl || s.doorSampleImageUrl);
  const previewUrl = previewStyle?.thumbnailImageUrl || previewStyle?.doorSampleImageUrl;

  return (
    <div className="border-b border-border">
      {/* Compact pill row — always visible, shows active series */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors active:scale-[0.99]"
      >
        {previewUrl && (
          <div className="h-7 w-5 shrink-0 overflow-hidden rounded border border-border">
            <img src={previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          </div>
        )}
        <span className="flex-1 min-w-0 text-left">
          <span className="text-[11px] text-muted-foreground font-medium">Series: </span>
          <span className="text-[12px] font-bold text-foreground">{activeGroupItem?.label ?? "—"}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* Expandable series list — only visible when open */}
      {open && (
        <div className="border-t border-border bg-white">
          {groups.map((g) => {
            const isActive = effectiveGroup === g.distributorId;
            const gPreviewStyle = g.styles.find((s) => s.thumbnailImageUrl || s.doorSampleImageUrl);
            const gPreviewUrl = gPreviewStyle?.thumbnailImageUrl || gPreviewStyle?.doorSampleImageUrl;
            const hasSelected = g.styles.some((s) => (activeStyle as { id?: number } | null)?.id === s.id);
            return (
              <button
                key={String(g.distributorId)}
                type="button"
                onClick={() => { onChoose(g.distributorId); setOpen(false); }}
                className={[
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:scale-[0.99]",
                  isActive
                    ? "bg-[#1a2744]/8 border-l-2 border-[#1a2744]"
                    : "hover:bg-muted/40 border-l-2 border-transparent",
                ].join(" ")}
              >
                {gPreviewUrl ? (
                  <div className="h-8 w-6 shrink-0 overflow-hidden rounded border border-border">
                    <img src={gPreviewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                  </div>
                ) : (
                  <div className="h-8 w-6 shrink-0 rounded border border-border bg-muted/30" />
                )}
                <span className="flex-1 min-w-0">
                  <span className={`block truncate text-[13px] font-semibold ${isActive ? "text-[#1a2744]" : "text-foreground"}`}>
                    {g.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {g.styles.length} {g.styles.length === 1 ? "style" : "styles"}
                  </span>
                </span>
                {(isActive || hasSelected) && (
                  <Check className="h-4 w-4 shrink-0 text-[#d4a75a]" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
  lockedDistributorId,
}: ColorSlotButtonProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile(1024);
  const [pickerOpen, setPickerOpen] = useState(false);
  const name = style ? (styleDisplayName(style as { ourName?: string | null; aliasName?: string | null }) || null) : null;
  const hasStyle = style != null;

  // Group the styles by distributor (supply line) via the shared, unit-tested
  // helper. Groups are ordered by their neutral label so the list is stable;
  // styles inside keep their incoming order.
  const groups = useMemo<StyleGroup[]>(
    () =>
      groupStylesByDistributor(styles, distributors ?? [], {
        fallback: (id) => t("dt_cs_line_fallback", { id }),
        other: t("dt_cs_line_other"),
      }),
    [styles, distributors, t],
  );

  // Which distributor group is currently expanded (one at a time). Defaults to
  // the group that holds the selected style, else the first group.
  const selectedDistId = useMemo(() => {
    const sid = (style as { id?: number } | null)?.id;
    if (sid == null) return undefined;
    return styles.find((s) => s.id === sid)?.distributorId ?? null;
  }, [style, styles]);

  // Distributor-first flow: the picker opens on a list of SUPPLY LINES; choosing
  // one drills into that line's door-style grid. `chosenGroup` is the line the
  // user has drilled into (null = still on the line list). When a style is
  // already selected we deep-link straight into its line; when only one line is
  // in scope (e.g. slot B, or a locked design) we skip the chooser entirely.
  const onlyOneGroup = groups.length <= 1;
  const [chosenGroup, setChosenGroup] = useState<number | null | undefined>(undefined);
  // Effective drilled-in line: explicit choice wins; otherwise auto-enter when
  // there's a single line OR a style is already selected.
  const effectiveGroup =
    chosenGroup !== undefined
      ? chosenGroup
      : onlyOneGroup
        ? groups[0]?.distributorId ?? null
        : selectedDistId !== undefined
          ? selectedDistId
          : null;

  // Reset to the line list each time the picker is (re)opened, unless we should
  // deep-link into a line (single line, or an already-selected style).
  useEffect(() => {
    if (!pickerOpen) return;
    setChosenGroup(undefined);
  }, [pickerOpen]);

  const activeGroup = groups.find((g) => g.distributorId === effectiveGroup) ?? null;

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
            {s.styleCode && (
              <a
                href={`/family/${encodeURIComponent(s.styleCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-[#1a2744]/70 hover:text-[#d4a75a] hover:underline transition-colors"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                {t("dt_cs_view_collection")}
              </a>
            )}
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

  // The list of SUPPLY LINES to choose from (step 1). Each row shows the neutral
  // line label + how many door styles it carries.
  const LineChooser = () => (
    <div className="space-y-1.5">
      <p className="px-1 pb-1 text-[11px] leading-snug text-muted-foreground">
        {t("dt_cs_pick_line_help")}
      </p>
      {groups.map((g) => {
        const hasSelected = g.styles.some(
          (s) => (style as { id?: number } | null)?.id === s.id
        );
        const isLocked = lockedDistributorId != null && g.distributorId === lockedDistributorId;
        return (
          <button
            key={String(g.distributorId)}
            type="button"
            onClick={() => setChosenGroup(g.distributorId)}
            className={[
              "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-all active:scale-[0.99]",
              hasSelected || isLocked
                ? "border-[#d4a75a] bg-[#d4a75a]/10"
                : "border-border bg-white hover:border-[#d4a75a]/60 hover:bg-accent/50",
            ].join(" ")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Layers className="h-4 w-4 shrink-0 text-[#d4a75a]" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-foreground">{g.label}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {isLocked
                    ? t("dt_cs_current_series")
                    : t("dt_cs_group_count", { count: g.styles.length })}
                </span>
              </span>
              {(hasSelected || isLocked) && (
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#d4a75a] text-white">
                  <Check className="h-2 w-2" strokeWidth={3} />
                </span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );

  // Flat picker: show all available styles directly with no supply-line drill-down.
  const StyleList = ({ cols = 2 }: { cols?: 2 | 3 }) =>
    styles.length === 0 ? (
      <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
        {t("dt_cs_none_available")}
      </div>
    ) : (
      <StyleGrid list={styles} cols={cols} />
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
          {/* On mobile we render the picker INLINE (no nested Sheet) to avoid
              Chrome's nested-Sheet pointer-event capture bug where taps on
              items inside a second Sheet opened from within a first Sheet are
              silently swallowed. The inline accordion expands below the button
              and collapses when a style is picked or the button is tapped again. */}
          <button
            type="button"
            onClick={() => {
              if (disabled) { toast.info(disabledReason ?? "Set Color 1 first before choosing Color 2."); return; }
              setPickerOpen((prev) => !prev);
            }}
            className={[
              "mt-2 w-full flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors",
              disabled
                ? "border-border text-muted-foreground opacity-50 cursor-not-allowed bg-muted/30"
                : hasStyle
                  ? "border-[#d4a75a]/60 text-[#1a2744] bg-[#d4a75a]/10 hover:bg-[#d4a75a]/20"
                  : "border-[#d4a75a] text-white bg-[#1a2744] hover:bg-[#1a2744]/90",
            ].join(" ")}
          >
            <Pencil className="h-3.5 w-3.5" />
            {pickerOpen ? "Close" : hasStyle ? t("dt_cs_change_style") : t("dt_cs_choose_style")}
          </button>
          {pickerOpen && (
            <div
              className="mt-2 rounded-lg border border-border bg-white overflow-hidden"
              style={{ maxHeight: "60vh" }}
            >
              {/* Series switcher — compact single-row pill showing only the active
                  series. Tapping it expands a dropdown list so the user can switch.
                  This keeps the style grid tall and visible by default. */}
              {groups.length > 1 && (
                <SeriesSwitcher
                  groups={groups}
                  effectiveGroup={effectiveGroup}
                  onChoose={(distId) => setChosenGroup(distId)}
                  activeStyle={style as { id?: number } | null}
                />
              )}
              {/* Style grid for the active series */}
              <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: groups.length > 1 ? "calc(60vh - 44px)" : "calc(60vh - 8px)", WebkitOverflowScrolling: "touch" }}>
                {activeGroup ? (
                  <div className="px-2 py-2">
                    <StyleGrid list={activeGroup.styles} cols={3} />
                  </div>
                ) : (
                  <div className="px-2 py-2">
                    <LineChooser />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <Popover open={disabled ? false : pickerOpen} onOpenChange={(o) => { if (disabled) { toast.info(disabledReason ?? "Set Color 1 first before choosing Color 2."); return; } setPickerOpen(o); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={() => { if (disabled) { toast.info(disabledReason ?? "Set Color 1 first before choosing Color 2."); } }}
              className={[
                "mt-2 w-full flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors",
                disabled
                  ? "border-border text-muted-foreground opacity-50 cursor-not-allowed bg-muted/30"
                  : hasStyle
                    ? "border-[#d4a75a]/60 text-[#1a2744] bg-[#d4a75a]/10 hover:bg-[#d4a75a]/20"
                    : "border-[#d4a75a] text-white bg-[#1a2744] hover:bg-[#1a2744]/90",
              ].join(" ")}
            >
              <Pencil className="h-3.5 w-3.5" />
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
