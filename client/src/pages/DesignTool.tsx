import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import {
  LayoutGrid, Eye, Trash2, RotateCw, Search, Plus,
  DollarSign, PanelTop, Columns3, Ruler, Square, Download, DoorOpen,
  Boxes, ShoppingCart, MoreHorizontal, Lock, LockOpen, Wand2, X, Sparkles,
  ChevronUp, ChevronDown, ChevronsDown, Check, ScanLine, Printer, Palette, Minus, UserRound, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/useMobile";
import { usePersistFn } from "@/hooks/usePersistFn";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PlacedCabinet, RoomData, DEFAULT_ROOM, DesignCabinet,
  dim, footprintDepth, makeUid, STD, rotatedSize, nextFreeSpot, standardHeight, dimLabel, placedHeight, isCustomWidth, isCustomHeight, isCustomDepth, isCustomSize, customSizeNote, customSizeFee, CUSTOM_SIZE_FEE,
  normalizeLCornerDepths,
  conflictingUids, blindCornerViolations, blindCornerSpecViolations, isBlindCorner, isOnIsland, isCornerCabinet, isAngledWallCabinet,
  isSinkBaseCabinet, placedFootprint, effectiveStyleId, distinctStyleIds, isMixedFinish,
  isPlaceableAccessory, accessoryPlacement, isPanelItem,
  blindCornerAutoFiller,
  resolveSwing, cycleSwing, swingText, hasDoorSwing, DoorSwing,
  // (closet helpers imported separately below)
  APPLIANCES, applianceAsDesignCabinet, appliancesForRoom, ROOM_TYPES, type RoomType,
  WallOpening, WallSide, OPENINGS, OpeningDef, makeOpening,
  finishColors, crownLinearInches, toeKickLinearInches, lightRailLinearInches, inchesToLinearFeet,
  trimPiecesNeeded, countertopArea, battenLinearInches,
  COUNTERTOP_MATERIALS, DEFAULT_COUNTERTOP_MATERIAL_ID, countertopMaterial,
  makeSink, SINK_PRESETS, type SinkFixture, type SinkType,
  blindCornerFillers, snapToWall, snapPosition, nextFreeSpotOnWall,
  clampCabinetsToRoom, clampOpeningsToRoom, clampIslandToRoom,
  resizeRoomByWall, WALL_LABELS, doorPanelKind,
  addOnRecommendations,
  freeSegmentsOnWall, wallPlacementAt, cabinetWall,
  rangeOvenClearanceViolations, RANGE_CLEARANCE_FILLER_IN, autoPlaceRangeFillers,
  wallOpeningClearanceViolations, WALL_OPENING_CLEARANCE_IN, baseOpeningOverlaps,
  elevationBox,
} from "@/lib/design";
import { hickorySkinSuggestions, type HickorySkinSuggestion, exposedEnds, isHickoryStyle } from "@/lib/hickorySkins";
import {
  type HardwareStyleId,
  DEFAULT_HARDWARE_STYLE_ID,
  HARDWARE_STYLES,
  hardwareSchedule,
  hardwarePlacementNote,
} from "@/lib/hardware";
import { normalizePaletteSearch, matchesPaletteSearch } from "@/lib/paletteSearch";
import {
  closetPaletteByCategory, closetPartPrice, isClosetPart, CLOSET_PARTS,
} from "@/lib/closet";
import { autoFillSpan, makeFiller, type FillMode } from "@/lib/autofill";
import { AIChatBox, type Message as AIMessage } from "@/components/AIChatBox";
import { PlanCanvas } from "@/components/design/PlanCanvas";
import { ElevationView } from "@/components/design/ElevationView";
import { CornerView, type CornerId } from "@/components/design/CornerView";
import { EmailGate, type LeadContact } from "@/components/design/EmailGate";
import { DesignActions, exportBuildSheet, type BuildSheetRow } from "@/components/design/DesignActions";
import { RoomSizeControl } from "@/components/design/RoomSizeControl";
import { WallPicker } from "@/components/design/WallPicker";
import { OpeningSizeEditor } from "@/components/design/OpeningSizeEditor";
import { DesignHelp } from "@/components/design/DesignHelp";
import { CountertopQuoteDialog } from "@/components/design/CountertopQuoteDialog";
import { ProDesignerDialog } from "@/components/design/ProDesignerDialog";
import { CabinetDrawing } from "@/components/CabinetDrawing";
import { baseSubGroup, type BaseSubGroup } from "@/lib/cabinetGraphics";
import { CabinetImage } from "@/components/CabinetImage";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { ColorSlotButton } from "@/components/design/ColorSlotButton";
import { CabinetAttributesDialog } from "@/components/design/CabinetAttributesDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSeo } from "@/hooks/useSeo";
import type { SiteStringKey } from "@/lib/i18n/site";

// One wall's worth of a consultant plan (mirrors the server `consult` output).
type ConsultPlanWall = {
  wallId: string;
  wallLabel: string;
  mode: FillMode;
  intent: string;
  items: Array<{ masterCode: string; description: string; width: number; placement: string; isFiller: boolean; cabinetId: number }>;
  usedInches: number;
  leftoverInches: number;
};

type ViewMode = "plan" | "elevation" | "split" | "corner";
type PricingTier = "Wholesale" | "Contractor";

function priceOf(row: { wholesalePrice: string | null; contractorPrice: string | null }, tier: PricingTier): number {
  const v = tier === "Wholesale" ? row.wholesalePrice : row.contractorPrice;
  return v ? parseFloat(v) : 0;
}

// Compact inch stepper for one cabinet dimension (W/H/D). Shows the dimension
// letter, −/+ buttons (1" step), and an exact field; the value turns gold +
// bold when it's a custom size. Used in the selected-cabinet toolbar.
function DimStepper({
  label, value, custom, min, max, onStep, onSet,
}: {
  label: string;
  value: number;
  custom: boolean;
  min: number;
  max: number;
  onStep: (delta: number) => void;
  onSet: (v: number) => void;
}) {
  const { t } = useLanguage();
  const dimName = label === "W" ? t("dt_dim_width") : label === "H" ? t("dt_dim_height") : t("dt_dim_depth");
  return (
    <div className="flex items-center gap-0.5" title={t("dt_dim_unit_title", { name: dimName })}>
      <span className={cn("text-[11px] mr-0.5", custom ? "font-bold text-[var(--color-gold,#c89b3c)]" : "text-muted-foreground")}>{label}</span>
      <Button variant="outline" size="sm" className="h-7 w-6 p-0" title={t("dt_dim_decrease", { label })} onClick={() => onStep(-1)}>
        <Minus className="h-3 w-3" />
      </Button>
      <Input
        type="number"
        step="0.25"
        min={min}
        max={max}
        value={value}
        className={cn("h-7 w-14 text-[11px] text-center px-1", custom && "font-semibold text-[var(--color-gold,#c89b3c)]")}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v > 0) onSet(v);
        }}
        aria-label={t("dt_dim_custom_aria", { label })}
      />
      <Button variant="outline" size="sm" className="h-7 w-6 p-0" title={t("dt_dim_increase", { label })} onClick={() => onStep(1)}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function DesignTool() {
  const { t, lang } = useLanguage();
  useSeo({ title: t("seo_design_t"), description: t("seo_design_d"), lang });
  // Localized wall names (Back/Front/Left/Right) keyed by WallSide.
  const wallLabel: Record<WallSide, string> = {
    top: t("plan_wall_back"), bottom: t("plan_wall_front"), left: t("plan_wall_left"), right: t("plan_wall_right"),
  };
  // Contact gate (email required; name + phone optional)
  const [verified, setVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [verifiedName, setVerifiedName] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const captureLead = trpc.design.captureLead.useMutation();
  const handleVerified = useCallback((contact: LeadContact) => {
    setVerifiedEmail(contact.email);
    setVerifiedName(contact.name ?? "");
    setVerifiedPhone(contact.phone ?? "");
    setVerified(true);
    // Record the lead so a rep has contact info even if the visitor never saves
    // a design or requests a quote. Fire-and-forget — never block entry on it.
    captureLead.mutate({
      email: contact.email,
      name: contact.name,
      phone: contact.phone,
    });
  }, [captureLead]);

  // Optional package to preload (?package=slug), e.g. from a Kitchen Package page.
  const search = useSearch();
  const packageSlug = useMemo(() => new URLSearchParams(search).get("package"), [search]);
  const loadedPackageRef = useRef<string | null>(null);
  // Optional saved design to load (?load=<designId>), e.g. from a CRM deal's
  // "Linked Designs" list. Loads the saved room + placed cabinets + style.
  const loadDesignId = useMemo(() => {
    const v = new URLSearchParams(search).get("load");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [search]);
  const loadedDesignRef = useRef<number | null>(null);
  // Auto-save draft: flips true once we've attempted to restore a saved draft,
  // so the debounced save effect doesn't overwrite the stored draft with the
  // initial empty state before restore runs.
  const draftRestoredRef = useRef(false);
  const { data: packageLayout, isError: packageError } = trpc.packages.layout.useQuery(
    { slug: packageSlug ?? "" },
    { enabled: !!packageSlug && verified, retry: 1 }
  );
  const { data: savedDesign } = trpc.design.byId.useQuery(
    { id: loadDesignId ?? 0 },
    { enabled: loadDesignId != null && verified, retry: 1 }
  );
  const packageErrorRef = useRef(false);

  // Mobile layout: which slide-up panel is open (catalog picker or cart/BOM).
  // Designer is touch-first: treat anything narrower than a small laptop (1024px)
  // as "mobile" so tablets, foldables, and phones in desktop-site mode still get
  // the single-column UI with the bottom toolbar + drawers (never the cramped
  // 3-column desktop view).
  const isMobile = useIsMobile(1024);
  const [mobilePanel, setMobilePanel] = useState<null | "catalog" | "cart">(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("panel");
    return p === "catalog" || p === "cart" ? p : null;
  });

  // Room + placement state
  const [room, setRoom] = useState<RoomData>(DEFAULT_ROOM);
  const [placed, setPlaced] = useState<PlacedCabinet[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "front" ? "elevation" : v === "split" ? "split" : v === "corner" ? "corner" : "plan";
  });
  // Which corner the corner-view camera stands in.
  const [corner, setCorner] = useState<CornerId>("top-left");
  const [showWallLayer, setShowWallLayer] = useState(true);
  const [measureMode, setMeasureMode] = useState(false);
  // Island zone: an optional rectangular guide (inches) marking where island
  // cabinets go. Null when disabled.
  const [island, setIsland] = useState<{ x: number; y: number; width: number; depth: number } | null>(null);
  // Doors & windows: adjustable wall openings.
  const [openings, setOpenings] = useState<WallOpening[]>([]);
  const [selectedOpeningUid, setSelectedOpeningUid] = useState<string | null>(null);
  // Trim toggles rendered in elevation + added to the BOM. These AUTO-APPLY
  // based on the layout (toe kick on any base run, crown + light rail when there
  // are wall cabinets, batten when cabinets share a seam). The user can still
  // override any of them off; trimOverride remembers an explicit user choice so
  // automation never fights the user.
  const [crown, setCrown] = useState(false);
  const [toeKick, setToeKick] = useState(false);
  const [batten, setBatten] = useState(false);
  const [lightRail, setLightRail] = useState(false);
  // Which trims the user has explicitly set (so auto-apply leaves them alone).
  const trimOverride = useRef<{ crown: boolean; toeKick: boolean; batten: boolean; lightRail: boolean }>({
    crown: false, toeKick: false, batten: false, lightRail: false,
  });
  // Countertop tool: measures base + island runs; not auto-priced (quote request).
  const [countertop, setCountertop] = useState(false);
  // Countertop material: when set, a visible slab is drawn over base cabinets.
  const [countertopMaterialId, setCountertopMaterialId] = useState<string>(DEFAULT_COUNTERTOP_MATERIAL_ID);
  // Sink + faucet fixtures placed on the counter.
  const [sinks, setSinks] = useState<SinkFixture[]>([]);
  const [selectedSinkUid, setSelectedSinkUid] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [proDesignerOpen, setProDesignerOpen] = useState(false);
  // Mouse-draw room mode: drag on an empty canvas to draw the room outline.
  const [drawMode, setDrawMode] = useState(false);
  // Active wall: the wall the user has highlighted. New items drop onto it, and
  // it can be dragged on the canvas to resize the room on that side.
  const [activeWall, setActiveWall] = useState<WallSide>("top");
  // Lock state: layoutLocked freezes the whole room/walls/openings/island so the
  // plan can't be nudged while placing cabinets. lockedWalls freezes individual
  // walls. Cabinets can always still be added/moved.
  const [layoutLocked, setLayoutLocked] = useState(false);
  const [lockedWalls, setLockedWalls] = useState<Set<WallSide>>(() => new Set());
  // Add-on accessories added from the "don't forget this" recommendations
  // (touch-up kit, roll-out trays). These are non-spatial BOM line items keyed
  // by cabinetId, so they price + export without cluttering the floor plan.
  const [addedAddOns, setAddedAddOns] = useState<
    { cabinetId: number; masterCode: string; description: string; qty: number }[]
  >([]);

  // Palette filters
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteType, setPaletteType] = useState<"base" | "vanity" | "corner" | "wall" | "wallht" | "tall" | "appliance" | "opening" | "closetparts" | "accessory">("base");
  // Accordion: which palette group headers the user has explicitly collapsed.
  // Keyed by `${paletteType}:${groupLabel}` so collapse state is per-tab. By
  // default every group is OPEN; toggling adds/removes the key here. While
  // searching we force all groups open (handled in render) so no match hides.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Estimate & Build Sheet: collapsible sections (works in both the desktop
  // sidebar and the mobile drawer since both render the same children). The
  // Estimated Total + Export CTA are intentionally NOT collapsible.
  const [collapsedSheet, setCollapsedSheet] = useState<Set<string>>(() => new Set());
  // Tracks which sections the user has explicitly toggled. Sections that the
  // user has NOT touched fall back to a computed default (e.g. the door-style
  // picker and the Details & notes accordion auto-collapse once a door style is
  // picked, to declutter the panel — especially on mobile).
  const [touchedSheet, setTouchedSheet] = useState<Set<string>>(() => new Set());
  const toggleSheetSection = useCallback((key: string) => {
    setTouchedSheet((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    setCollapsedSheet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // Resolve a section's collapsed state: honor the user's explicit toggle once
  // they've touched it, otherwise use `defaultCollapsed`.
  const sheetCollapsed = useCallback(
    (key: string, defaultCollapsed: boolean) =>
      touchedSheet.has(key) ? collapsedSheet.has(key) : defaultCollapsed,
    [touchedSheet, collapsedSheet],
  );

  // Room type: kitchen cabinets (default), bathroom, laundry, closet parts, or other.
  const [roomType, setRoomType] = useState<RoomType>("kitchen");

  // Pricing selectors. `styleId` is the ACTIVE door style — it drives the
  // palette filter, pricing, and the finish stamped onto newly-placed cabinets.
  const [styleId, setStyleId] = useState<number | null>(null);
  // Two-color (two-tone) selector: the design carries up to two door styles —
  // slot A (== styleId when A is active) and slot B. `activeSlot` says which
  // color new cabinets are placed in. Switching the active slot swaps styleId
  // to that slot's style so the whole existing palette/pricing chain follows.
  const [styleA, setStyleA] = useState<number | null>(null);
  const [styleB, setStyleB] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<"A" | "B">("A");
  // Refs mirror the active style + slot B so addCabinet (a stable callback) can
  // stamp the current color without going stale or re-creating on every change.
  const styleIdRef = useRef<number | null>(null);
  const styleBRef = useRef<number | null>(null);
  const [tier, setTier] = useState<PricingTier>("Contractor");
  // Distributor lock: once the base cabinet's finish is chosen the member can
  // "Lock" the design to that style's supply line. While locked, the palette
  // only offers cabinets from that distributor and the finish picker is scoped
  // to door styles within the same supply line (member can still change color,
  // but not jump to another distributor) unless they Unlock to override.
  const [lockedDistributorId, setLockedDistributorId] = useState<number | null>(null);
  // Decorative hardware spec (knobs / pulls / cup pulls). A finishing choice,
  // not a priced catalog SKU: it draws on the fronts and lists a piece count on
  // the build sheet as a note. Defaults to "none".
  const [hardwareStyleId, setHardwareStyleId] = useState<HardwareStyleId>(DEFAULT_HARDWARE_STYLE_ID);

  // Data — door-style-first: members pick a door style; the supply line behind
  // it is resolved server-side and never shown.
  const { data: doorStyles } = trpc.doorStyles.list.useQuery();
  // The distributor (supply line) behind the currently selected style.
  const selectedStyleDistributorId = useMemo(() => {
    const s = (doorStyles ?? []).find(
      (d) => (d as { id: number }).id === styleId
    ) as { distributorId?: number } | undefined;
    return s?.distributorId ?? null;
  }, [doorStyles, styleId]);
  // De-duplicate by display name so the same style isn't listed once per line.
  // When locked, only offer styles from the locked distributor so changing the
  // finish never silently switches supply lines.
  const uniqueDoorStyles = useMemo(() => {
    const map = new Map<string, { id: number; ourName: string | null }>();
    const source = (doorStyles ?? []) as Array<{
      id: number;
      ourName: string | null;
      distributorId?: number;
    }>;
    const scoped =
      lockedDistributorId != null
        ? source.filter((s) => s.distributorId === lockedDistributorId)
        : source;
    for (const s of scoped) {
      const key = (s.ourName || String(s.id)).toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a, b) => (a.ourName || "").localeCompare(b.ourName || ""));
  }, [doorStyles, lockedDistributorId]);
  const { data: paletteCabinets, isLoading: paletteLoadingRaw } =
    trpc.design.placeableCabinets.useQuery(
      {
        placement:
          paletteType === "appliance" || paletteType === "opening" || paletteType === "closetparts"
            ? "base"
            : paletteType === "corner" || paletteType === "vanity"
            ? "base"
            : paletteType === "wallht"
            ? "wall"
            : paletteType === "accessory"
            ? "accessory"
            : paletteType,
        // Narrow to the chosen line + style so only purchasable cabinets show.
        styleId: styleId ?? undefined,
        // When the design is locked to a supply line, every added cabinet must
        // come from that distributor (member can still change color within it).
        distributorId: lockedDistributorId ?? undefined,
      },
      { enabled: paletteType !== "appliance" && paletteType !== "opening" && paletteType !== "closetparts" }
    );
  const paletteLoading = paletteType === "appliance" || paletteType === "opening" || paletteType === "closetparts" ? false : paletteLoadingRaw;

  // A dedicated, full base-cabinet list for the active line, used by the
  // Auto-Fill engine (independent of which palette tab/search is active).
  const { data: autoFillCabinets } = trpc.design.placeableCabinets.useQuery({
    placement: "base",
    styleId: styleId ?? undefined,
    distributorId: lockedDistributorId ?? undefined,
  });

  // The unified "Corner" tab shows BOTH corner base AND corner wall cabinets in
  // one place (grouped into two sections). The base-placement corner cabinets
  // come from the main paletteCabinets query above (placement "base"); this
  // extra query pulls the WALL-placement cabinets so corner WALL cabinets can be
  // merged in. Only runs while the Corner tab is open.
  const { data: cornerWallCabinets } = trpc.design.placeableCabinets.useQuery(
    {
      placement: "wall",
      styleId: styleId ?? undefined,
      distributorId: lockedDistributorId ?? undefined,
    },
    { enabled: paletteType === "corner" }
  );

  // An "Angled Wall" cabinet (AW-*) has a 45° face but is a normal wall-run
  // transition unit — it is NOT a corner cabinet, so it must live on the regular
  // "Wall" tab, not the "Corner" tab. (Its diagonal CANVAS rendering is handled
  // separately by isDiagonalCorner in design.ts and is intentionally left intact.)
  const isAngledWall = useCallback((c: DesignCabinet) => {
    if (c.isCornerCabinet === true) return false; // a true corner unit wins
    if ((c.subCategory || "").toLowerCase().includes("corner")) return false;
    return isAngledWallCabinet(c.masterCode, c.description || undefined);
  }, []);

  // Detect a diagonal/corner WALL cabinet for the dedicated "Corner Wall" tab.
  const isCornerWall = useCallback((c: DesignCabinet) => {
    // Angled wall cabinets are wall-tab items, never corner-tab items.
    if (isAngledWall(c)) return false;
    const sub = (c.subCategory || "").toLowerCase();
    return (
      c.isCornerCabinet === true ||
      sub.includes("corner") ||
      isCornerCabinet(c.masterCode, c.description || undefined)
    );
  }, [isAngledWall]);

  // Detect a corner BASE cabinet (blind corner BBC, lazy susan LSB, easy reach
  // ERB/BER, diagonal corner sink CSB, corner base CB) for the dedicated
  // "Corner Base" tab. Reuses the shared corner detector; within the base
  // placement palette the wall-only corner codes are never present.
  const isCornerBase = useCallback((c: DesignCabinet) => {
    const sub = (c.subCategory || "").toLowerCase();
    const code = (c.masterCode || "").toUpperCase();
    const placement = (c.placement || "").toLowerCase();
    // Only genuine, placeable corner BASE cabinets belong here. Exclude
    // accessories/trim (crown, scribe, end panels, hardware), tiny filler/tray
    // slivers, and the BA-24 end-of-run angled base (not a corner).
    if (placement.includes("accessory") || placement.includes("trim")) return false;
    if (/trim|molding|end panel|hardware|filler|tray|floor/.test(sub)) return false;
    if (code.startsWith("BA-")) return false; // end-of-run angled base, not a corner
    if (/TRAY|FILLER|-FILL|CBT|DCFF|^CM-|^BCM|^OCM|^ACM|^RCM|^COV/.test(code)) return false; // inserts/fillers/molding
    // A real corner base cabinet has meaningful size (not a 3\"-4\" sliver).
    const w = Number(c.width) || 0;
    const h = Number(c.height) || 0;
    if (w < 9 || h < 24) return false;
    const looksCorner =
      c.isCornerCabinet === true ||
      sub.includes("corner") ||
      sub.includes("lazy susan") ||
      sub.includes("easy reach") ||
      isCornerCabinet(c.masterCode, c.description || undefined);
    return looksCorner;
  }, []);

  // Detect a bathroom VANITY cabinet (category=Vanity) so it can be grouped
  // under the dedicated bathroom "Vanity" tab instead of being mixed into the
  // generic Base list. Vanity sink/drawer/full-height bases are all floor
  // (base-placement) cabinets, so without this they'd clutter the Base tab.
  const isVanity = useCallback((c: DesignCabinet) => {
    const cat = (c.category || "").toLowerCase();
    if (cat === "vanity") return true;
    const sub = (c.subCategory || "").toLowerCase();
    const desc = (c.description || "").toLowerCase();
    return sub.includes("vanity") || desc.includes("vanity");
  }, []);

  // Doors & windows handlers.
  const addOpening = useCallback((def: OpeningDef) => {
    setOpenings((prev) => {
      // New openings land on the highlighted active wall; user can drag along any wall edge.
      const o = makeOpening(def, activeWall, room);
      setSelectedOpeningUid(o.uid);
      return [...prev, o];
    });
  }, [room, activeWall]);
  const changeOpening = useCallback((o: WallOpening) => {
    setOpenings((prev) => prev.map((p) => (p.uid === o.uid ? o : p)));
  }, []);
  const deleteOpening = useCallback((uid: string) => {
    setOpenings((prev) => prev.filter((p) => p.uid !== uid));
    setSelectedOpeningUid((cur) => (cur === uid ? null : cur));
  }, []);

  // Appliances/fixtures are a synthetic, client-side catalog (no DB rows),
  // filtered to the current room type (kitchen appliances vs bath/laundry
  // fixtures). Falls back to all appliances for rooms with no fixture set.
  const appliancePalette = useMemo<DesignCabinet[]>(
    () => {
      const forRoom = appliancesForRoom(roomType);
      const set = forRoom.length > 0 ? forRoom : APPLIANCES;
      return set.map(applianceAsDesignCabinet);
    },
    [roomType]
  );

  // Closet parts palette (placeholder products), grouped by category.
  const closetGroups = useMemo(() => closetPaletteByCategory(), []);

  // Filtered palette
  const filteredPalette = useMemo(() => {
    // The "Closet parts" tab shows the modular closet system parts (panels,
    // shelves, hanging, drawers, accessories). Every other tab shows real
    // cabinets/appliances/openings exactly as in kitchen mode, so a closet can
    // hold cabinets and doors too.
    if (paletteType === "closetparts") {
      const s0 = normalizePaletteSearch(paletteSearch);
      const all = closetGroups.flatMap((g) => g.items);
      return all.filter((c) => matchesPaletteSearch(c, s0));
    }
    // The unified "Corner" tab merges corner BASE cabinets (from the base-
    // placement query) with corner WALL cabinets (from the dedicated wall query),
    // de-duplicated by id, so every corner cabinet lives under one tab.
    const source: DesignCabinet[] =
      paletteType === "appliance"
        ? appliancePalette
        : paletteType === "corner"
        ? (() => {
            const merged = [
              ...(((paletteCabinets as DesignCabinet[]) ?? []).filter(isCornerBase)),
              ...(((cornerWallCabinets as DesignCabinet[]) ?? []).filter(isCornerWall)),
            ];
            const seen = new Set<number>();
            return merged.filter((c) => {
              const id = Number(c.id);
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          })()
        : ((paletteCabinets as DesignCabinet[]) ?? []);
    const s = normalizePaletteSearch(paletteSearch);
    return source
      .filter((c) => {
        // The unified Corner tab already merged the right items above; let them
        // all through here (group split happens in groupedPalette).
        if (paletteType === "corner") return true;
        if (paletteType === "wall" || paletteType === "wallht") return !isCornerWall(c);
        // The dedicated "Vanity" tab shows ONLY vanity-category cabinets.
        if (paletteType === "vanity") return isVanity(c);
        // The "Accessories & Trim" tab returns its own server-filtered list
        // (crown/light-rail molding, fillers, end panels, roll-out trays, etc.),
        // so every item passes through here unchanged.
        if (paletteType === "accessory") return true;
        // Plain "Base" excludes corner bases (own tab) AND vanities (own Vanity
        // tab in bathroom mode) so they don't duplicate across tabs.
        if (paletteType === "base") return !isCornerBase(c) && !isVanity(c);
        return true;
      })
      .filter((c) => matchesPaletteSearch(c, s))
      // While searching, lift the per-tab cap so no matching size is hidden.
      .slice(0, s ? 500 : paletteType === "accessory" ? 200 : 80);
  }, [paletteCabinets, cornerWallCabinets, paletteSearch, paletteType, appliancePalette, isCornerWall, isCornerBase, isVanity, closetGroups]);

  // Group the palette by cabinet height so wall cabinets (and others) are easy
  // to find by size — mirrors how pros scan 2020's catalog by height.
  const groupedPalette = useMemo(() => {
    // The Closet-parts tab groups by part category (Panels, Shelves, Hanging…).
    if (paletteType === "closetparts") {
      const s = normalizePaletteSearch(paletteSearch);
      return closetGroups
        .map((g) => ({
          label: g.category,
          items: g.items.filter((c) => matchesPaletteSearch(c, s)),
        }))
        .filter((g) => g.items.length > 0);
    }
    // The Accessories & Trim tab groups by product subCategory (Trim & Molding,
    // Decorative End Panels, Roll-Out Trays, Skin Panels, …) rather than by
    // height, which is meaningless for loose trim/hardware.
    if (paletteType === "accessory") {
      const bySub = new Map<string, DesignCabinet[]>();
      for (const c of filteredPalette) {
        const label = (c.subCategory || "Other").trim() || "Other";
        const arr = bySub.get(label);
        if (arr) arr.push(c);
        else bySub.set(label, [c]);
      }
      return Array.from(bySub.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, items]) => ({ label, items }));
    }
    // The unified Corner tab splits into two fixed sections — Corner Base
    // Cabinets and Corner Wall Cabinets — so every corner type lives under one
    // tab but stays organized by where it mounts.
    if (paletteType === "corner") {
      const cornerBases = filteredPalette.filter((c) => isCornerBase(c));
      const cornerWalls = filteredPalette.filter((c) => !isCornerBase(c));
      const sections: { label: string; items: DesignCabinet[] }[] = [];
      if (cornerBases.length > 0) sections.push({ label: t("dt_pl_grp_corner_base"), items: cornerBases });
      if (cornerWalls.length > 0) sections.push({ label: t("dt_pl_grp_corner_wall"), items: cornerWalls });
      return sections;
    }
    // The "Base" tab is organized by base TYPE (not height): standard door
    // bases first, then drawer bases, then sink bases, then specialty bases —
    // each a collapsible accordion section. Full-height (tall) base cabinets are
    // standard door bases and live in the first "Base Cabinets" group; there is
    // no separate section for them. Empty sections are dropped.
    if (paletteType === "base") {
      const order: { key: BaseSubGroup; labelKey: SiteStringKey }[] = [
        { key: "base", labelKey: "dt_pl_grp_base_std" },
        { key: "drawer", labelKey: "dt_pl_grp_base_drawer" },
        { key: "sink", labelKey: "dt_pl_grp_base_sink" },
        { key: "specialty", labelKey: "dt_pl_grp_base_specialty" },
      ];
      const buckets: Record<BaseSubGroup, DesignCabinet[]> = {
        base: [],
        drawer: [],
        sink: [],
        specialty: [],
      };
      for (const c of filteredPalette) buckets[baseSubGroup(c)].push(c);
      return order
        .map(({ key, labelKey }) => ({ label: t(labelKey), items: buckets[key] }))
        .filter((g) => g.items.length > 0);
    }
    // Every floor-standing BASE cabinet is a standard 34½" tall (the toe-kick +
    // box + countertop reveal is fixed); the stored "height" on some SKUs (spice
    // pull-outs like BSDC-6/SPB-9/SPB-6, diagonal sink floors) is actually the
    // insert/opening size, NOT the cabinet height. So for the base-family tabs we
    // force a single 34½" bucket instead of fragmenting them into bogus 24"/18"/
    // 15"/42" groups. Wall / Wall-by-Height / Tall tabs keep their real heights
    // because grouping by height is meaningful there.
    const isBaseFamilyTab =
      paletteType === "vanity";
    const BASE_STD_HEIGHT = 34.5;
    const groups = new Map<number, DesignCabinet[]>();
    for (const c of filteredPalette) {
      const h = isBaseFamilyTab ? BASE_STD_HEIGHT : dim(c.height, 0);
      const arr = groups.get(h);
      if (arr) arr.push(c);
      else groups.set(h, [c]);
    }
    // Render a height as a clean label: whole inches stay plain (e.g. 42"),
    // common half-inch cabinet heights use a ½ glyph (e.g. 34½").
    const fmtHeight = (h: number) => {
      const whole = Math.floor(h);
      const frac = h - whole;
      if (Math.abs(frac - 0.5) < 0.01) return `${whole}½`;
      if (frac < 0.01) return `${whole}`;
      return h.toFixed(2).replace(/\.?0+$/, "");
    };
    // Tallest first; unknown height (0) sinks to the bottom.
    return Array.from(groups.entries())
      .sort((a, b) => (b[0] || -1) - (a[0] || -1))
      .map(([height, items]) => ({
        // On base-family tabs every box is a standard 34½" base, so an unknown
        // height should still read as the base height (never a stray "Other"
        // group). Only non-base tabs fall back to "Other".
        label: height
          ? t("dt_pl_grp_high", { h: fmtHeight(height) })
          : isBaseFamilyTab
          ? t("dt_pl_grp_high", { h: fmtHeight(BASE_STD_HEIGHT) })
          : t("dt_pl_grp_other"),
        items,
      }));
  }, [filteredPalette, paletteType, paletteSearch, closetGroups, isCornerBase, t]);

  // Pricing for placed cabinets + add-on accessories (appliances carry
  // cabinetId 0 and are unpriced).
  const placedCabinetIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...placed.map((p) => p.cabinetId),
            ...addedAddOns.map((a) => a.cabinetId),
          ].filter((id) => id > 0)
        )
      ),
    [placed, addedAddOns]
  );
  // TWO-TONE pricing: price each cabinet at its EFFECTIVE finish (per-cabinet
  // override, else the design default). Build the distinct (cabinetId, styleId)
  // pairs the design actually uses so we fetch every needed price in one call.
  // Add-ons always price at the design default finish.
  const pricePairs = useMemo(() => {
    if (!styleId) return [] as Array<{ cabinetId: number; styleId: number }>;
    const seen = new Set<string>();
    const pairs: Array<{ cabinetId: number; styleId: number }> = [];
    const push = (cabinetId: number, sid: number) => {
      if (cabinetId <= 0) return;
      const key = `${cabinetId}:${sid}`;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({ cabinetId, styleId: sid });
    };
    placed.forEach((p) => push(p.cabinetId, effectiveStyleId(p, styleId) ?? styleId));
    addedAddOns.forEach((a) => push(a.cabinetId, styleId));
    return pairs;
  }, [placed, addedAddOns, styleId]);

  const { data: priceRows } = trpc.design.priceForCabinetsByStyles.useQuery(
    { pairs: pricePairs },
    { enabled: pricePairs.length > 0 && !!styleId }
  );

  // Price map keyed on `cabinetId:styleId` so a cabinet can resolve to a
  // different price under a different finish.
  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    priceRows?.forEach((r) => m.set(`${r.cabinetId}:${r.styleId}`, priceOf(r, tier)));
    return m;
  }, [priceRows, tier]);

  // Resolve a placed item's unit price at its EFFECTIVE finish. Closet parts
  // carry id=0 (skipped by the cabinet pricing engine) so they price from the
  // placeholder catalog; everything else prices from the DB price map keyed by
  // (cabinetId, effective styleId).
  const unitPriceFor = useCallback(
    (p: { masterCode: string; cabinetId: number; styleId?: number | null }): number | null => {
      if (isClosetPart(p.masterCode)) return closetPartPrice(p.masterCode);
      if (!styleId) return null;
      const sid = effectiveStyleId(p, styleId) ?? styleId;
      const v = priceMap.get(`${p.cabinetId}:${sid}`);
      return v ?? null;
    },
    [priceMap, styleId]
  );

  // Add-on unit price (always at the design default finish).
  const addOnPriceFor = useCallback(
    (cabinetId: number): number => {
      if (!styleId) return 0;
      return priceMap.get(`${cabinetId}:${styleId}`) ?? 0;
    },
    [priceMap, styleId]
  );

  const total = useMemo(
    () =>
      placed.reduce((sum, p) => sum + (unitPriceFor(p) ?? 0), 0) +
      placed.reduce((sum, p) => sum + customSizeFee(p), 0) +
      addedAddOns.reduce((sum, a) => sum + addOnPriceFor(a.cabinetId) * a.qty, 0),
    [placed, addedAddOns, unitPriceFor, addOnPriceFor]
  );

  // ─── Add-on recommendations ("don't forget this") ──────────────────────────
  // Touch-up kit is always recommended; roll-out trays appear once the design
  // has base cabinets. The buyable add-on rows are resolved server-side for the
  // locked style so a recommendation only shows when it's actually orderable.
  const { data: addOns } = trpc.design.findAddOns.useQuery(
    { styleId: styleId ?? 0 },
    { enabled: !!styleId }
  );
  const recommendations = useMemo(() => addOnRecommendations(placed), [placed]);
  // Map each recommendation kind to its resolved buyable row (if any).
  const addOnRowFor = useCallback(
    (kind: string) => {
      if (!addOns) return null;
      if (kind === "touch-up-kit") return addOns.touchUpKit ?? null;
      if (kind === "roll-out-tray")
        return (addOns.rollOutTrays as Array<{ id: number; masterCode: string; description: string }>)[0] ?? null;
      if (kind === "end-panel")
        return (addOns.endPanels as Array<{ id: number; masterCode: string; description: string }> | undefined)?.[0] ?? null;
      if (kind === "crown-molding")
        return (addOns.crownMoldings as Array<{ id: number; masterCode: string; description: string }> | undefined)?.[0] ?? null;
      return null;
    },
    [addOns]
  );
  // Add (or increment) an add-on accessory as a BOM line item.
  const addAddOn = useCallback(
    (row: { id: number; masterCode: string; description: string }) => {
      setAddedAddOns((prev) => {
        const existing = prev.find((a) => a.cabinetId === row.id);
        if (existing)
          return prev.map((a) =>
            a.cabinetId === row.id ? { ...a, qty: a.qty + 1 } : a
          );
        return [
          ...prev,
          { cabinetId: row.id, masterCode: row.masterCode, description: row.description, qty: 1 },
        ];
      });
    },
    []
  );
  const removeAddOn = useCallback((cabinetId: number) => {
    setAddedAddOns((prev) => prev.filter((a) => a.cabinetId !== cabinetId));
  }, []);
  // Which add-on cabinetIds are already in the BOM (to toggle button state).
  const addedAddOnIds = useMemo(
    () => new Set(addedAddOns.map((a) => a.cabinetId)),
    [addedAddOns]
  );

  // Active finish: derived from the selected door style name so picking a trim
  // instantly re-skins the placed cabinets on the canvas + elevation.
  const activeStyleName = useMemo(
    () => doorStyles?.find((s) => s.id === styleId)?.ourName ?? null,
    [doorStyles, styleId]
  );
  const activeFinish = useMemo(() => {
    const s = doorStyles?.find((d) => d.id === styleId) as
      | { ourName?: string | null; color?: string | null; finish?: string | null; woodSpecies?: string | null }
      | undefined;
    return finishColors(s?.ourName, s?.color, s?.finish, s?.woodSpecies);
  }, [doorStyles, styleId]);

  // Full active door style (with woodSpecies) so we can apply the Hickory-only
  // unfinished-end skin rule. Hickory cabinets ship with unfinished exposed
  // sides, so any exposed end needs a matching Hickory skin panel.
  const activeStyle = useMemo(
    () => doorStyles?.find((s) => s.id === styleId) ?? null,
    [doorStyles, styleId]
  );
  // Small finish swatch shown on each palette tile so the chosen finish is
  // visible while browsing cabinets. Empty until a door style is selected.
  const paletteFinishSwatch = useMemo<string | null>(
    () => (activeStyle as { doorSampleImageUrl?: string | null } | null)?.doorSampleImageUrl ?? null,
    [activeStyle]
  );
  // Auto-suggested Hickory finished-end skins, one per exposed cabinet end.
  // Empty unless the selected finish is Hickory. NOTE: the real skin SKU/price
  // is pending owner confirmation, so these carry pendingSku=true.
  const hickorySkins = useMemo<HickorySkinSuggestion[]>(
    () => hickorySkinSuggestions(placed, room, activeStyle as never),
    [placed, room, activeStyle]
  );

  // Finished END PANELS for every exposed cabinet end on NON-Hickory styles
  // (Hickory ends are already covered by the skin engine above). Like crown and
  // toe kick, these are added AUTOMATICALLY based on the layout — one finished
  // end panel per exposed end — so the customer never has to remember them. When
  // the catalog exposes a real end-panel SKU for the locked style we use it (and
  // it is priced); otherwise we emit a clearly-flagged placeholder.
  const autoEndPanels = useMemo(() => {
    if (isHickoryStyle(activeStyle as never)) return [];
    const ends = exposedEnds(placed, room);
    if (ends.length === 0) return [];
    const catalogPanel =
      (addOns?.endPanels as Array<{ id: number; masterCode: string; description: string }> | undefined)?.[0] ?? null;
    return ends.map((e) => ({
      end: e.end,
      placement: e.placement,
      height: e.height,
      depth: e.depth,
      code: catalogPanel?.masterCode ?? `END-PANEL-${e.placement.toUpperCase()}`,
      cabinetId: catalogPanel?.id ?? null,
      description: catalogPanel
        ? `${catalogPanel.description} (covers exposed side of ${e.masterCode})`
        : `Finished End Panel — ${e.placement} (covers exposed side of ${e.masterCode}) — SKU pending confirmation`,
      pendingSku: !catalogPanel,
    }));
  }, [activeStyle, placed, room, addOns]);

  // Restore a saved design (room + placed cabinets + style) onto the canvas.
  const loadSavedDesign = useCallback(
    (d: { room: RoomData; placed: PlacedCabinet[]; styleId: number | null; roomType?: string | null; distributorId?: number | null }) => {
      setRoom(d.room ?? DEFAULT_ROOM);
      setPlaced(normalizeLCornerDepths(Array.isArray(d.placed) ? d.placed : []));
      setStyleId(d.styleId ?? null);
      // Restore the supply-line lock if the saved design was pinned to one.
      setLockedDistributorId(typeof d.distributorId === "number" ? d.distributorId : null);
      if (d.roomType && ["kitchen", "bathroom", "laundry", "closet", "other"].includes(d.roomType)) {
        setRoomType(d.roomType as RoomType);
      }
      setSelectedUid(null);
    },
    []
  );

  // Map of door-style id -> display name. Defined here (before buildRows) so the
  // export can label each line with its specific color/finish.
  const styleNameById = useMemo(() => {
    const m = new Map<number, string>();
    doorStyles?.forEach((d) => {
      const s = d as { id: number; ourName?: string | null };
      m.set(s.id, s.ourName ?? `Style #${s.id}`);
    });
    return m;
  }, [doorStyles]);

  // Itemized lines for the exported build sheet (cabinets aggregated by code).
  const buildRows = useMemo<BuildSheetRow[]>(() => {
    const map = new Map<string, BuildSheetRow>();
    for (const p of placed) {
      const sw = resolveSwing(p);
      const sizeNote = customSizeNote(p);
      // Per-cabinet door/hardware attribute notes (from the right-click dialog).
      const attrNotes: string[] = [];
      if (p.noDoor) attrNotes.push("No door (open unit)");
      if ((p.handleSide === "left" || p.handleSide === "right") && !p.noDoor)
        attrNotes.push(`Handle ${p.handleSide}`);
      const attrNote = attrNotes.join(", ");
      // Per-cabinet color (two-tone aware) for the export, mirroring the on-screen
      // line items. Included in the dedup key so different colors stay separate.
      const cabStyleId = styleId ? effectiveStyleId(p, styleId) : null;
      const cabColor = cabStyleId != null ? (styleNameById.get(cabStyleId) ?? null) : null;
      const key = `${p.masterCode}|${Math.round(p.width)}|${Math.round(placedHeight(p))}|${Math.round(p.depth)}|${sw}|${p.noDoor ? "nd" : ""}|${p.handleSide ?? ""}|${cabStyleId ?? "_"}`;
      const closet = isClosetPart(p.masterCode);
      const unit = unitPriceFor(p);
      const existing = map.get(key);
      if (existing) existing.qty += 1;
      else
        map.set(key, {
          code: p.masterCode,
          description: [p.description, sizeNote, attrNote]
            .filter(Boolean)
            .join(" — "),
          color: cabColor,
          widthIn: rotatedSize(p).w,
          heightIn: placedHeight(p),
          depthIn: rotatedSize(p).d,
          placement: p.placement,
          swing: sw === "none" ? undefined : sw,
          qty: 1,
          unitPrice: closet ? unit : styleId ? unit : null,
        });
    }
    // Add-on accessories (touch-up kit, roll-out trays) as their own lines.
    const rows = Array.from(map.values());
    for (const a of addedAddOns) {
      rows.push({
        code: a.masterCode,
        description: a.description,
        widthIn: 0,
        heightIn: 0,
        depthIn: 0,
        placement: "accessory",
        qty: a.qty,
        unitPrice: styleId ? addOnPriceFor(a.cabinetId) : null,
      });
    }
    // Hickory unfinished-end skins: one per exposed end, aggregated by
    // placeholder code + height. Price is null (SKU pending owner confirmation).
    const skinMap = new Map<string, BuildSheetRow>();
    for (const s of hickorySkins) {
      const key = `${s.suggestCode}|${Math.round(s.height)}`;
      const existing = skinMap.get(key);
      if (existing) existing.qty += s.quantity;
      else
        skinMap.set(key, {
          code: s.suggestCode,
          description: `${s.description} — SKU pending confirmation`,
          widthIn: 0,
          heightIn: s.height,
          depthIn: s.depth,
          placement: "accessory",
          qty: s.quantity,
          unitPrice: null,
        });
    }
    rows.push(...Array.from(skinMap.values()));
    // Auto finished END PANELS (non-Hickory): one per exposed end, aggregated by
    // code + height. Priced when a real catalog end-panel SKU is resolved for the
    // locked style; otherwise emitted as a pending placeholder.
    const panelMap = new Map<string, BuildSheetRow>();
    for (const ep of autoEndPanels) {
      const key = `${ep.code}|${Math.round(ep.height)}`;
      const existing = panelMap.get(key);
      if (existing) existing.qty += 1;
      else
        panelMap.set(key, {
          code: ep.code,
          description: ep.description,
          widthIn: 0,
          heightIn: ep.height,
          depthIn: ep.depth,
          placement: "accessory",
          qty: 1,
          unitPrice: !ep.pendingSku && ep.cabinetId != null && styleId ? addOnPriceFor(ep.cabinetId) : null,
        });
    }
    rows.push(...Array.from(panelMap.values()));
    // Custom size adjustment: flat $100 for each cabinet resized in any
    // dimension. One aggregated, priced line so it shows on the build sheet.
    const customCount = placed.filter((p) => isCustomSize(p)).length;
    if (customCount > 0) {
      rows.push({
        code: "CUSTOM-ADJ",
        description: `Custom size adjustment ($${CUSTOM_SIZE_FEE} per resized cabinet)`,
        widthIn: 0,
        heightIn: 0,
        depthIn: 0,
        placement: "accessory",
        qty: customCount,
        unitPrice: CUSTOM_SIZE_FEE,
      });
    }
    return rows;
  }, [placed, addedAddOns, priceMap, styleId, unitPriceFor, hickorySkins, autoEndPanels, addOnPriceFor, styleNameById]);
  // Decorative hardware schedule (knobs / pulls) for the chosen spec. A finishing
  // note for the build sheet — carries no price (hardware is not a catalog SKU).
  const hwSchedule = useMemo(
    () => hardwareSchedule(placed, hardwareStyleId),
    [placed, hardwareStyleId]
  );
  // Panel treatment for the placed cabinets' door fronts in the elevation view.
  const activePanelKind = useMemo(() => {
    const s = doorStyles?.find((d) => d.id === styleId) as { doorStyle?: string | null } | undefined;
    return doorPanelKind(s?.doorStyle ?? activeStyleName);
  }, [doorStyles, styleId, activeStyleName]);

  // ─── TWO-TONE per-cabinet finish + door-panel resolvers ─────────────────────
  // Each cabinet renders in its EFFECTIVE finish (per-cabinet override, else the
  // design default). We memoize FinishColors / DoorPanelKind per styleId so the
  // canvas + elevation can color each cabinet independently without recomputing.
  const finishById = useMemo(() => {
    const m = new Map<number, ReturnType<typeof finishColors>>();
    doorStyles?.forEach((d) => {
      const s = d as { id: number; ourName?: string | null; color?: string | null; finish?: string | null; woodSpecies?: string | null };
      m.set(s.id, finishColors(s.ourName, s.color, s.finish, s.woodSpecies));
    });
    return m;
  }, [doorStyles]);
  const panelKindById = useMemo(() => {
    const m = new Map<number, ReturnType<typeof doorPanelKind>>();
    doorStyles?.forEach((d) => {
      const s = d as { id: number; doorStyle?: string | null; ourName?: string | null };
      m.set(s.id, doorPanelKind(s.doorStyle ?? s.ourName ?? undefined));
    });
    return m;
  }, [doorStyles]);
  const finishForCab = useCallback(
    (cab: PlacedCabinet) => {
      const sid = styleId ? effectiveStyleId(cab, styleId) : null;
      return (sid != null && finishById.get(sid)) || activeFinish;
    },
    [styleId, finishById, activeFinish]
  );
  const panelKindForCab = useCallback(
    (cab: PlacedCabinet) => {
      const sid = styleId ? effectiveStyleId(cab, styleId) : null;
      return (sid != null && panelKindById.get(sid)) || activePanelKind;
    },
    [styleId, panelKindById, activePanelKind]
  );

  // Distinct finishes actually used across the design (default + per-cabinet
  // overrides), each with its display name + swatch, so the summary can list
  // every finish on a two-tone design instead of just the default.
  const finishSummary = useMemo(() => {
    if (!styleId) return [] as Array<{ id: number; name: string; face: string; edge: string }>;
    return distinctStyleIds(placed, styleId).map((id) => {
      const f = finishById.get(id) ?? activeFinish;
      return { id, name: styleNameById.get(id) ?? `Style #${id}`, face: f.face, edge: f.edge };
    });
  }, [placed, styleId, finishById, activeFinish, styleNameById]);
  const designIsMixedFinish = useMemo(
    () => isMixedFinish(placed, styleId),
    [placed, styleId]
  );

  // Crown molding & toe kick for the BOM. Crown is grouped per wall with a 3"
  // miter allowance; both are ordered in whole standard sticks (96").
  const crownOrder = useMemo(
    () => (crown ? trimPiecesNeeded(crownLinearInches(placed, room)) : null),
    [crown, placed, room]
  );
  const toeKickOrder = useMemo(
    () => (toeKick ? trimPiecesNeeded(toeKickLinearInches(placed)) : null),
    [toeKick, placed]
  );
  // Batten molding (BAM): covers vertical seams between adjacent cabinets,
  // ordered in whole 96" sticks like the other trims.
  const battenOrder = useMemo(
    () => (batten ? trimPiecesNeeded(battenLinearInches(placed, room)) : null),
    [batten, placed, room]
  );
  // Light rail runs under the upper cabinets; mitered per wall like crown.
  const lightRailOrder = useMemo(
    () => (lightRail ? trimPiecesNeeded(lightRailLinearInches(placed, room)) : null),
    [lightRail, placed, room]
  );

  // ─── Trim auto-apply ────────────────────────────────────────────────────────
  // Every trim that crown/toe kick do is now AUTOMATIC: when the layout warrants
  // a trim we switch it on (and its quantity is computed above), unless the user
  // has explicitly toggled that trim off. This mirrors how a real takeoff adds
  // toe kick to every base run, crown + light rail to every wall run, and batten
  // wherever cabinets meet — without the user hand-toggling each one.
  const hasBaseCab = useMemo(() => placed.some((p) => p.placement === "base"), [placed]);
  const hasWallCab = useMemo(() => placed.some((p) => p.placement === "wall"), [placed]);
  const needsBatten = useMemo(() => battenLinearInches(placed, room) > 0, [placed, room]);
  useEffect(() => {
    const o = trimOverride.current;
    // Toe kick: any base cabinet run needs a toe kick.
    if (!o.toeKick && hasBaseCab && !toeKick) setToeKick(true);
    // Crown: wall cabinets get crown along the top.
    if (!o.crown && hasWallCab && !crown) setCrown(true);
    // Light rail: valance under the wall cabinets.
    if (!o.lightRail && hasWallCab && !lightRail) setLightRail(true);
    // Batten: cover the seams wherever cabinets meet.
    if (!o.batten && needsBatten && !batten) setBatten(true);
  }, [hasBaseCab, hasWallCab, needsBatten, toeKick, crown, lightRail, batten]);
  // Countertop is a POST-LAYOUT step: it can only be applied once the kitchen
  // has base cabinets (or an island) to sit on. A base run, a vanity, or an
  // island all count as a surface that takes a top.
  const hasBaseRun = useMemo(
    () => !!island || placed.some((p) => p.placement === "base"),
    [placed, island]
  );
  // If the layout loses all base/island surface while the countertop is on,
  // turn it off automatically so we never quote a top over nothing.
  useEffect(() => {
    if (countertop && !hasBaseRun) setCountertop(false);
  }, [countertop, hasBaseRun]);
  // Guarded toggle: refuse to turn the countertop on before the layout exists.
  const toggleCountertop = useCallback(() => {
    setCountertop((c) => {
      if (!c && !hasBaseRun) {
        toast.info(t("dt_t_build_first"));
        return c;
      }
      return !c;
    });
  }, [hasBaseRun]);
  // Countertop measurement (base run + island), shown as a quote request.
  const counter = useMemo(
    () => (countertop ? countertopArea(placed, island) : null),
    [countertop, placed, island]
  );

  // Blind corner cabinets must auto-include a corner filler. One filler per
  // blind corner, split into base vs wall lines for the BOM.
  const fillers = useMemo(() => blindCornerFillers(placed), [placed]);

  // Conflicts: an appliance physically running into a cabinet. Highlighted red
  // on the canvas, badged in the BOM, and warned about before export.
  // Range/oven corner clearance rule: a range/oven at a wall corner butting a
  // cabinet needs a filler between them so the handles clear.
  const rangeClearanceUids = useMemo(
    () => rangeOvenClearanceViolations(placed, room),
    [placed, room]
  );
  // Wall cabinets must keep >= 3" from doors/windows.
  const wallOpeningUids = useMemo(
    () => wallOpeningClearanceViolations(placed, openings, room),
    [placed, openings, room]
  );
  // Base/tall cabinets must not sit ACROSS a door or cased opening (pass-through).
  const baseOpeningUids = useMemo(
    () => baseOpeningOverlaps(placed, openings, room),
    [placed, openings, room]
  );
  // Blind corner manufacturer pull spec: missing spec OR installed pull out of
  // the [min,max] range. Missing spec must be resolved by the administrator.
  const blindSpecIssues = useMemo(() => blindCornerSpecViolations(placed), [placed]);
  const conflictUids = useMemo(() => {
    const set = conflictingUids(placed);
    // Blind corner rule: a blind corner whose neighbor isn't pulled the
    // required 3" off the corner is also a conflict.
    blindCornerViolations(placed).forEach((uid) => set.add(uid));
    // Range/oven corner clearance: flag the appliance until a filler is added.
    rangeClearanceUids.forEach((uid: string) => set.add(uid));
    // Wall cabinet too close to a door/window opening.
    wallOpeningUids.forEach((uid: string) => set.add(uid));
    // Base/tall cabinet sitting across a doorway or cased opening.
    baseOpeningUids.forEach((uid: string) => set.add(uid));
    // Blind corner pull spec issues (missing spec or out-of-range).
    blindSpecIssues.forEach((_issue, uid) => set.add(uid));
    return set;
  }, [placed, rangeClearanceUids, wallOpeningUids, baseOpeningUids, blindSpecIssues]);
  const hasConflicts = conflictUids.size > 0;
  // Blind corner violations specifically, for a tailored warning message.
  const blindViolationUids = useMemo(() => blindCornerViolations(placed), [placed]);
  const blindMissingSpecCount = useMemo(
    () => Array.from(blindSpecIssues.values()).filter((v) => v === "missing-spec").length,
    [blindSpecIssues]
  );
  const blindOutOfRangeCount = useMemo(
    () => Array.from(blindSpecIssues.values()).filter((v) => v === "out-of-range").length,
    [blindSpecIssues]
  );

  // Consolidated rows for the on-screen PRICING panel: identical cabinets
  // (same code + size + rotation) collapse into ONE line with a quantity, a
  // line total, the conflict flag, and the list of member uids so the line's
  // delete control can remove one instance at a time.
  const panelGroups = useMemo(() => {
    const map = new Map<string, {
      key: string;
      sample: PlacedCabinet;
      uids: string[];
      qty: number;
      unitPrice: number | null;
      hasConflict: boolean;
      label: string;
      swing: DoorSwing;
      colorId: number | null;
      colorName: string | null;
      colorFace: string | null;
      colorEdge: string | null;
    }>();
    for (const p of placed) {
      // Resolve THIS cabinet's specific color (two-tone designs place cabinets in
      // either Color 1 or Color 2). We key by color too so each color shows as
      // its own line, and surface the swatch + finish name for the line item.
      const cabStyleId = styleId ? effectiveStyleId(p, styleId) : null;
      const colorKey = cabStyleId ?? "_";
      const key = `${p.masterCode}|${Math.round(p.width)}|${Math.round(placedHeight(p))}|${((p.rotation % 360) + 360) % 360}|${colorKey}`;
      const closet = isClosetPart(p.masterCode);
      const unit = unitPriceFor(p);
      const existing = map.get(key);
      if (existing) {
        existing.qty += 1;
        existing.uids.push(p.uid);
        if (conflictUids.has(p.uid)) existing.hasConflict = true;
      } else {
        const fin = cabStyleId != null ? finishById.get(cabStyleId) : null;
        map.set(key, {
          key,
          sample: p,
          uids: [p.uid],
          qty: 1,
          unitPrice: closet ? unit : styleId ? unit : null,
          hasConflict: conflictUids.has(p.uid),
          label: dimLabel(p),
          swing: resolveSwing(p),
          colorId: cabStyleId,
          colorName: cabStyleId != null ? (styleNameById.get(cabStyleId) ?? null) : null,
          colorFace: fin?.face ?? null,
          colorEdge: fin?.edge ?? null,
        });
      }
    }
    return Array.from(map.values());
  }, [placed, priceMap, styleId, conflictUids, unitPriceFor, finishById, styleNameById]);

  // Build-sheet cabinet sections. Full-height (tall) base cabinets are grouped
  // WITH the regular base cabinets (a single "Base Cabinets" section) — there is
  // no separate tall section. Wall cabinets get their own section, and anything
  // left over (appliances/other) goes into a final section so nothing is lost.
  // This is a build-sheet organization concern only; the placement model is
  // unchanged. Within each section we sort by code for a logical, stable order.
  const cabinetSections = useMemo(() => {
    const byCode = (a: typeof panelGroups[number], b: typeof panelGroups[number]) =>
      a.sample.masterCode.localeCompare(b.sample.masterCode, undefined, { numeric: true });
    const base = panelGroups
      .filter((g) => g.sample.placement === "base" || g.sample.placement === "tall")
      .sort(byCode);
    const wall = panelGroups.filter((g) => g.sample.placement === "wall").sort(byCode);
    const other = panelGroups
      .filter((g) => g.sample.placement !== "base" && g.sample.placement !== "tall" && g.sample.placement !== "wall")
      .sort(byCode);
    return { base, wall, other };
  }, [panelGroups]);

  // Non-cabinet build-sheet lines (fillers, crown, toe kick, countertop note).
  const extraLines = useMemo(() => {
    const out: { label: string; detail: string }[] = [];
    for (const f of fillers) {
      out.push({
        label: `${f.kind === "wall" ? "WALL" : "BASE"} CORNER FILLER`,
        detail: `${f.count} x ${f.width}in (required for blind corner)`,
      });
    }
    if (crown && crownOrder && crownOrder.pieces > 0)
      out.push({ label: "CROWN MOLDING", detail: `${crownOrder.pieces} pc @ ${crownOrder.stickFeet}ft` });
    if (toeKick && toeKickOrder && toeKickOrder.pieces > 0)
      out.push({ label: "TOE KICK", detail: `${toeKickOrder.pieces} pc @ ${toeKickOrder.stickFeet}ft` });
    if (batten && battenOrder && battenOrder.pieces > 0)
      out.push({ label: "BATTEN MOLDING (BAM)", detail: `${battenOrder.pieces} pc @ ${battenOrder.stickFeet}ft` });
    if (lightRail && lightRailOrder && lightRailOrder.pieces > 0)
      out.push({ label: "LIGHT RAIL MOLDING", detail: `${lightRailOrder.pieces} pc @ ${lightRailOrder.stickFeet}ft` });
    if (countertop && counter && counter.squareFeet > 0) {
      const mat = countertopMaterial(countertopMaterialId);
      out.push({
        label: "COUNTERTOP (quote)",
        detail: `${mat?.name ?? "Material TBD"} — ~${counter.squareFeet} sq ft / ${counter.linearFeet} lin ft`,
      });
    }
    // Sinks placed into the counter are quote-only fixtures; list them so the
    // shop sees the basin(s) + whether a faucet was requested.
    if (sinks.length > 0) {
      const faucetCount = sinks.filter((s) => s.faucet).length;
      out.push({
        label: "SINK (quote)",
        detail: `${sinks.length} basin${sinks.length === 1 ? "" : "s"}${faucetCount > 0 ? ` + ${faucetCount} faucet${faucetCount === 1 ? "" : "s"}` : ""}`,
      });
    }
    // Decorative hardware spec (finishing note, no price).
    if (hwSchedule.total > 0) {
      const parts: string[] = [];
      if (hwSchedule.knobs > 0) parts.push(`${hwSchedule.knobs} knob${hwSchedule.knobs === 1 ? "" : "s"}`);
      if (hwSchedule.barPulls > 0) parts.push(`${hwSchedule.barPulls} bar pull${hwSchedule.barPulls === 1 ? "" : "s"}`);
      if (hwSchedule.cupPulls > 0) parts.push(`${hwSchedule.cupPulls} cup pull${hwSchedule.cupPulls === 1 ? "" : "s"}`);
      out.push({
        label: `HARDWARE (${hwSchedule.styleLabel})`,
        detail: `${parts.join(", ")} — ${hwSchedule.total} pieces (supply separately)`,
      });
      // Placement spec (framed vs slab) — installer guidance, also fed to the AI
      // kitchen-preview prompt so renders place hardware realistically.
      const placementDoorStyle =
        (activeStyle as { doorStyle?: string | null } | null)?.doorStyle ?? activeStyleName;
      const placementNote = hardwarePlacementNote(hwSchedule.styleId, placementDoorStyle);
      if (placementNote) {
        out.push({
          label: "HARDWARE PLACEMENT",
          detail: placementNote.replace(/^Hardware placement — /, ""),
        });
      }
    }
    return out;
  }, [fillers, crown, crownOrder, toeKick, toeKickOrder, batten, battenOrder, lightRail, lightRailOrder, countertop, counter, countertopMaterialId, sinks, hwSchedule, activeStyle, activeStyleName]);

  // ─── Placement actions ──────────────────────────────────────────────────────

  const addCabinet = useCallback(
    (c: DesignCabinet, x?: number, y?: number) => {
      // Placeable accessories (decorative/end panels, skins, appliance garages)
      // come in via the Accessories tab. Force a sensible placement (base vs
      // wall) and, for flat panels/skins, a slim 0.75" footprint depth so they
      // render as a thin board against the run rather than a full 24" box.
      const isAccessory = paletteType === "accessory" && isPlaceableAccessory(c);
      const accPlacement = isAccessory ? accessoryPlacement(c) : c.placement;
      const isFlatPanel = isAccessory && isPanelItem(c);
      const width = dim(c.width, isAccessory ? 24 : 24);
      const depth = isFlatPanel ? 0.75 : footprintDepth(c);
      const height = isFlatPanel
        ? dim(c.height, standardHeight(accPlacement))
        : dim(c.height, standardHeight(accPlacement));
      setPlaced((prev) => {
        // Explicit drop position (drag-and-drop) wins. Otherwise we drop the
        // cabinet UNATTACHED in the center of the room so the user can grab it
        // and drag it wherever they want (it still snaps to a wall when dragged
        // close). This feels more like 20/20 than auto-pinning to a corner.
        let spot: { x: number; y: number; rotation: number };
        if (x != null && y != null) {
          spot = { x, y, rotation: 0 };
        } else {
          // Seat the cabinet flush against the ACTIVE wall at the first free
          // segment so it appears immediately on that wall in both Bird's-Eye
          // and Front View (and is correctly attributed for molding/pricing).
          // The user can still drag it anywhere afterward. Fall back to the
          // room center only if the active wall has no free run left.
          const segs = freeSegmentsOnWall(activeWall, room, prev, openings, Math.min(width, 9), 0, c.placement);
          const fit = segs.find((s) => s.length >= width) ?? segs[0];
          if (fit) {
            const along = fit.start;
            spot = wallPlacementAt(along, width, depth, activeWall, room);
          } else {
            // Wall is full: center the footprint in the room, clamped in-bounds.
            const cx = Math.max(0, Math.min(room.width / 2 - width / 2, Math.max(0, room.width - width)));
            const cy = Math.max(0, Math.min(room.depth / 2 - depth / 2, Math.max(0, room.depth - depth)));
            spot = { x: cx, y: cy, rotation: 0 };
          }
        }
        const newCab: PlacedCabinet = {
          uid: makeUid(),
          cabinetId: c.id,
          masterCode: c.masterCode,
          description: c.description,
          placement: accPlacement,
          x: spot.x,
          y: spot.y,
          width,
          nominalWidth: width,
          depth,
          nominalDepth: depth,
          height,
          nominalHeight: height,
          rotation: spot.rotation,
          numberOfDoors: c.numberOfDoors,
          numberOfDrawers: c.numberOfDrawers,
          catalogImageUrl: c.catalogImageUrl ?? null,
          pullMin: c.pullMin ?? null,
          pullMax: c.pullMax ?? null,
          // Two-color: stamp the ACTIVE door style onto this cabinet so it keeps
          // the color it was placed in, EVEN if the design default later changes.
          // We only stamp when a real second color (slot B) exists; otherwise we
          // leave styleId null so the cabinet just tracks the single default.
          styleId: styleBRef.current != null ? styleIdRef.current : null,
        };
        setSelectedUid(newCab.uid);
        // Sink-base auto-fixture: dropping a sink base (SB-*) means there's a
        // sink there, so auto-place a default single-bowl sink WITH a faucet
        // (makeSink defaults faucet=true) centered over the cabinet footprint.
        // The sink is a separate fixture (not a placed cabinet/appliance), so it
        // never triggers a layout conflict and the user can still drag/remove it.
        if (isSinkBaseCabinet(newCab)) {
          const fp = placedFootprint(newCab);
          const preset = SINK_PRESETS["single"];
          const sx = Math.max(
            0,
            Math.min(newCab.x + fp.w / 2 - preset.width / 2, room.width - preset.width)
          );
          const sy = Math.max(
            0,
            Math.min(newCab.y + fp.d / 2 - preset.depth / 2, room.depth - preset.depth)
          );
          const autoSink = makeSink("single", sx, sy);
          setSinks((prevSinks) => [...prevSinks, autoSink]);
          setSelectedSinkUid(autoSink.uid);
          setCountertop(true); // a sink implies a counter
          toast.success(t("dt_t_sink_added"));
        }
        // Blind corner trade rule: when a blind corner cabinet is dropped flush
        // in a room corner, auto-snap a 3" filler on the side OPPOSITE the pull
        // and let the cabinet project its full corner return. If we can't tell
        // which corner/side it is (ambiguous), we place nothing and the existing
        // blind-corner conflict stays on so the user resolves it manually.
        if (isBlindCorner(newCab.masterCode, newCab.description)) {
          const res = blindCornerAutoFiller(newCab, room, makeUid);
          if (res.filler) {
            toast.success(t("dt_toast_blind_added"));
            return [...prev, newCab, res.filler];
          }
          if (res.ambiguous) {
            toast.warning(t("dt_toast_blind_corner"));
          }
        }
        return [...prev, newCab];
      });
    },
    [room, activeWall, openings, setSinks, setSelectedSinkUid, setCountertop]
  );

  // Manual filler from the palette/toolbar: drop a real orderable filler/scribe
  // of a chosen width as a normal movable item (NOT auto-placed). Uses the same
  // makeFiller spec as the auto-fill engine so it carries a code + width and
  // shows on the build sheet. Default 3" — the most common scribe width.
  const addManualFiller = useCallback(() => {
    if (layoutLocked) { toast.info(t("dt_t_unlock_filler")); return; }
    const raw = window.prompt(t("dt_prompt_filler_width"), "3");
    if (raw == null) return;
    const w = Math.round(parseFloat(raw) * 10) / 10;
    if (!Number.isFinite(w) || w <= 0) { toast.error(t("dt_t_filler_gt0")); return; }
    if (w > 6) { toast.error(t("dt_toast_filler_wide")); return; }
    const placement: DesignCabinet["placement"] = roomType === "closet" ? "base" : "base";
    const fillerDef = makeFiller(w, placement);
    addCabinet(fillerDef);
    toast.success(t("dt_toast_added_filler", { w }));
  }, [layoutLocked, roomType, addCabinet]);

  // ── Auto-Fill: tile the active wall with a suggested run of cabinets ────────
  // Computes the usable span on the highlighted wall (wall length minus any
  // cabinets/openings already on it), runs the deterministic engine, and drops
  // each chosen cabinet flush along the wall using the same nextFreeSpotOnWall
  // geometry as manual placement. Items are fully movable/deletable afterward.
  const autoFillActiveWall = useCallback(() => {
    if (layoutLocked) { toast.info(t("dt_t_unlock_autofill")); return; }
    const mode: FillMode = roomType === "closet" ? "closet" : "kitchen";
    const pool = (autoFillCabinets as DesignCabinet[] | undefined) ?? [];
    if (pool.length === 0) { toast.error(t("dt_t_pick_style_first")); return; }

    // Break the wall into OPEN segments around existing cabinets and any
    // door/window openings, then tile EACH segment independently so the run
    // breaks cleanly around a doorway instead of running under it.
    const segments = freeSegmentsOnWall(activeWall, room, placed, openings, 9);
    if (segments.length === 0) { toast.info(t("dt_t_wall_full")); return; }

    let totalCount = 0;
    let totalFiller = 0;
    setPlaced((prev) => {
      let working = [...prev];
      for (const seg of segments) {
        const result = autoFillSpan(seg.length, mode, pool);
        if (result.items.length === 0) continue;
        // Place items left-to-right starting at the segment's run-axis start.
        let along = seg.start;
        for (const it of result.items) {
          const c = it.cabinet;
          const width = it.width;
          const depth = footprintDepth(c);
          const height = dim(c.height, standardHeight(c.placement));
          const spot = wallPlacementAt(along, width, depth, activeWall, room);
          const newCab: PlacedCabinet = {
            uid: makeUid(),
            cabinetId: c.id,
            masterCode: c.masterCode,
            description: c.description,
            placement: "base",
            x: spot.x,
            y: spot.y,
            width,
            depth,
            height,
            rotation: spot.rotation,
            numberOfDoors: c.numberOfDoors,
            numberOfDrawers: c.numberOfDrawers,
            catalogImageUrl: c.catalogImageUrl ?? null,
            pullMin: c.pullMin ?? null,
            pullMax: c.pullMax ?? null,
          };
          working = [...working, newCab];
          along += width;
          totalCount++;
        }
        totalFiller += result.fillerInches;
      }
      if (totalCount === 0) {
        toast.info(t("dt_t_no_fit"));
        return prev;
      }
      const segNote = segments.length > 1 ? t("dt_sh_seg_note", { n: segments.length }) : "";
      const fillerNote = totalFiller > 0 ? t("dt_sh_filler_note", { n: Math.round(totalFiller * 10) / 10 }) : "";
      const wn = { top: t("plan_wall_back"), bottom: t("plan_wall_front"), left: t("plan_wall_left"), right: t("plan_wall_right") }[activeWall];
      toast.success(t("dt_sh_autofilled_toast", { wall: wn, count: totalCount, seg: segNote, filler: fillerNote }));
      return working;
    });
  }, [layoutLocked, activeWall, room, roomType, autoFillCabinets, placed, openings, t]);

  // ── Range/oven corner clearance: one-click fix ──────────────────────────────
  // For each range/oven flagged by the clearance rule, nudge the neighboring
  // cabinets on its interior side outward by the filler width and drop a real
  // filler/scribe between the appliance and that cabinet so the handles clear.
  const addClearanceFiller = useCallback(() => {
    if (layoutLocked) { toast.info(t("dt_t_unlock_clearance")); return; }
    const bad = rangeOvenClearanceViolations(placed, room);
    if (bad.size === 0) { toast.info(t("dt_t_no_clearance")); return; }
    const W = RANGE_CLEARANCE_FILLER_IN;
    setPlaced((prev) => {
      const { placed: next, added } = autoPlaceRangeFillers(prev, room, W, makeUid);
      if (added.length === 0) { toast.info(t("dt_t_clearance_fail")); return prev; }
      toast.success(t("dt_toast_added_clearance", { n: added.length, s: added.length === 1 ? "" : "s", w: W }));
      return next;
    });
  }, [layoutLocked, placed, room]);

  // ── AI Design Consultant ────────────────────────────────────────────────────
  // The consultant takes the user's marked walls + request, asks the server
  // (which uses the SAME deterministic fill engine as Auto-Fill), and drops the
  // returned plan onto the canvas. Everything it places is movable/deletable.
  const [consultOpen, setConsultOpen] = useState(false);
  // Tell the global ChatWidget to hide its floating launcher while the
  // Design Consultant panel is open (they share the bottom-right corner).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("cd:consultant", { detail: { open: consultOpen } }));
    return () => {
      window.dispatchEvent(new CustomEvent("cd:consultant", { detail: { open: false } }));
    };
  }, [consultOpen]);
  const [consultMessages, setConsultMessages] = useState<AIMessage[]>([]);

  // The room's four walls as spans (usable length = full wall minus the openings
  // on it), so the consultant works with realistic numbers.
  const consultWalls = useMemo(() => {
    const sides: WallSide[] = ["top", "bottom", "left", "right"];
    return sides.map((side) => {
      const full = side === "top" || side === "bottom" ? room.width : room.depth;
      const openingW = openings.filter((o) => o.side === side).reduce((s, o) => s + o.width, 0);
      const wn = { top: t("plan_wall_back"), bottom: t("plan_wall_front"), left: t("plan_wall_left"), right: t("plan_wall_right") }[side];
      return { id: side, label: wn, lengthInches: Math.max(12, full - openingW) };
    });
  }, [room, openings, t]);

  // Apply a returned plan: place each wall's items flush along that wall.
  const applyConsultPlan = useCallback(
    (plan: ConsultPlanWall[]) => {
      if (layoutLocked) { toast.info(t("dt_t_unlock_suggest")); return; }
      if (!plan || plan.length === 0) return;
      let total = 0;
      setPlaced((prev) => {
        let working = [...prev];
        for (const wall of plan) {
          const side = wall.wallId as WallSide;
          for (const it of wall.items) {
            const width = it.width;
            const depth = it.placement === "wall" ? STD.WALL_DEPTH : STD.BASE_DEPTH;
            const height = it.placement === "wall" ? STD.WALL_HEIGHT : it.placement === "tall" ? STD.TALL_HEIGHT : STD.BASE_HEIGHT;
            const spot = nextFreeSpotOnWall(width, depth, "base", side, room, working);
            const newCab: PlacedCabinet = {
              uid: makeUid(),
              cabinetId: it.cabinetId,
              masterCode: it.masterCode,
              description: it.description,
              placement: "base",
              x: spot.x,
              y: spot.y,
              width,
              depth,
              height,
              rotation: spot.rotation,
              catalogImageUrl: null,
            };
            working = [...working, newCab];
            total++;
          }
        }
        return working;
      });
      if (total > 0) toast.success(t("dt_toast_consultant_placed", { n: total, s: total === 1 ? "" : "s" }));
    },
    [layoutLocked, room],
  );

  const consultMutation = trpc.design.consult.useMutation({
    onSuccess: (res) => {
      setConsultMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      if (res.plan && res.plan.length > 0) applyConsultPlan(res.plan as ConsultPlanWall[]);
    },
    onError: () => {
      setConsultMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I had trouble with that. Try describing the wall and what you'd like on it." },
      ]);
    },
  });

  const sendConsult = useCallback(
    (content: string) => {
      setConsultMessages((prev) => [...prev, { role: "user", content }]);
      consultMutation.mutate({
        message: content,
        walls: consultWalls,
        roomType,
        styleId: styleId ?? undefined,
      });
    },
    [consultMutation, consultWalls, roomType, styleId],
  );

  // ── Sink + faucet fixtures ──────────────────────────────────────────────────
  const addSink = useCallback((type: SinkType) => {
    const preset = SINK_PRESETS[type];
    // Drop centered on the active wall's run so it lands on the counter, but the
    // user can drag it anywhere afterward.
    const x = Math.max(0, Math.min(room.width / 2 - preset.width / 2, room.width - preset.width));
    let y: number;
    if (activeWall === "bottom") y = room.depth - preset.depth - 1;
    else if (activeWall === "top") y = 1;
    else y = room.depth / 2 - preset.depth / 2;
    const sink = makeSink(type, x, y);
    setSinks((prev) => [...prev, sink]);
    setSelectedSinkUid(sink.uid);
    setCountertop(true); // a sink implies a counter
    toast.success(t("dt_toast_preset_added", { name: preset.name }));
  }, [room, activeWall]);

  const moveSink = useCallback((uid: string, x: number, y: number) => {
    setSinks((prev) => prev.map((s) => (s.uid === uid ? { ...s, x, y } : s)));
  }, []);

  const deleteSink = useCallback((uid: string) => {
    setSinks((prev) => prev.filter((s) => s.uid !== uid));
    setSelectedSinkUid((cur) => (cur === uid ? null : cur));
  }, []);

  const toggleSinkFaucet = useCallback((uid: string) => {
    setSinks((prev) => prev.map((s) => (s.uid === uid ? { ...s, faucet: !s.faucet } : s)));
  }, []);

  // Move the island AND every cabinet sitting on it by the same delta, clamped
  // so the island stays inside the room. Cabinets move in lockstep so they
  // never slide off the island.
  const moveIsland = useCallback((dxIn: number, dyIn: number) => {
    setIsland((cur) => {
      if (!cur) return cur;
      const nx = Math.max(0, Math.min(cur.x + dxIn, room.width - cur.width));
      const ny = Math.max(0, Math.min(cur.y + dyIn, room.depth - cur.depth));
      const ddx = nx - cur.x;
      const ddy = ny - cur.y;
      if (ddx === 0 && ddy === 0) return cur;
      const islandRect = cur;
      setPlaced((prevPlaced) =>
        prevPlaced.map((p) =>
          isOnIsland(p, islandRect)
            ? {
                ...p,
                x: Math.max(0, Math.min(p.x + ddx, room.width - rotatedSize(p).w)),
                y: Math.max(0, Math.min(p.y + ddy, room.depth - rotatedSize(p).d)),
              }
            : p
        )
      );
      return { ...cur, x: nx, y: ny };
    });
  }, [room]);

  // Apply a new room size and keep every item inside the new walls.
  const applyRoom = useCallback((next: RoomData) => {
    setRoom(next);
    setPlaced((prev) => clampCabinetsToRoom(prev, next));
    setOpenings((prev) => clampOpeningsToRoom(prev, next));
    setIsland((prev) => clampIslandToRoom(prev, next));
  }, []);

  // Drag a highlighted wall in/out to resize the room on that side.
  const resizeWall = useCallback(
    (side: WallSide, deltaIn: number) => {
      applyRoom(resizeRoomByWall(room, side, deltaIn));
    },
    [room, applyRoom]
  );

  const handleDropNew = useCallback(
    (clientX: number, clientY: number, roomRect: DOMRect, ppi: number) => {
      const data = dragDataRef.current;
      if (!data) return;
      const x = (clientX - roomRect.left) / ppi - dim(data.width, 24) / 2;
      const y = (clientY - roomRect.top) / ppi - footprintDepth(data) / 2;
      addCabinet(data, Math.max(0, x), Math.max(0, y));
      dragDataRef.current = null;
    },
    [addCabinet]
  );

  const moveCabinet = useCallback((uid: string, x: number, y: number) => {
    setPlaced((prev) => prev.map((p) => (p.uid === uid ? { ...p, x, y } : p)));
  }, []);

  const swingSelected = () => {
    if (!selectedUid) return;
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== selectedUid) return p;
        if (!hasDoorSwing(p)) {
          toast.info(t("dt_t_no_door_swing"));
          return p;
        }
        const current = resolveSwing(p);
        if (current === "double") {
          toast.info(t("dt_t_double_door"));
          return p;
        }
        const next: DoorSwing = cycleSwing(current);
        toast.success(swingText(next));
        return { ...p, swing: next };
      })
    );
  };

  const rotateSelected = () => {
    if (!selectedUid) return;
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== selectedUid) return p;
        const rotated = { ...p, rotation: (p.rotation + 90) % 360 };
        // Re-seat against the wall so the new orientation sits cleanly
        // instead of keeping the old footprint's snapped position.
        const snapped = snapPosition(
          rotated,
          room,
          prev.filter((c) => c.placement === p.placement && c.uid !== p.uid)
        );
        return { ...rotated, x: snapped.x, y: snapped.y };
      })
    );
  };

  const deleteSelected = () => {
    if (!selectedUid) return;
    setPlaced((prev) => prev.filter((p) => p.uid !== selectedUid));
    setSelectedUid(null);
  };

  // Move the selected cabinet by a delta (inches). Used by the arrow keys and
  // the on-canvas move buttons. A cabinet that sits on the island can ALWAYS be
  // nudged off it freely (it does not drag the island with it) so users can
  // re-arrange the island run; we just keep every cabinet clamped inside the
  // room. This is the fix for "can't move a cabinet once it's on the island".
  const nudgeSelected = useCallback((dxIn: number, dyIn: number) => {
    if (!selectedUid) return;
    setPlaced((prev) => {
      const moved = prev.map((p) =>
        p.uid === selectedUid
          ? { ...p, x: Math.round((p.x + dxIn) * 10) / 10, y: Math.round((p.y + dyIn) * 10) / 10 }
          : p
      );
      return clampCabinetsToRoom(moved, room);
    });
  }, [selectedUid, room]);

  // Raise/lower the selected WALL cabinet's mount height. Stores an explicit
  // mountBottom override (inches from floor to the box bottom); the elevation
  // then uses it verbatim instead of the default hang rule.
  const adjustMountHeight = useCallback((deltaIn: number) => {
    if (!selectedUid) return;
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== selectedUid) return p;
        if (p.placement !== "wall") return p;
        const cur = elevationBox(p, room).bottom;
        const next = Math.max(0, Math.round((cur + deltaIn) * 10) / 10);
        return { ...p, mountBottom: next };
      })
    );
  }, [selectedUid, room]);

  // Clear the override so the cabinet returns to its default rule position.
  const resetMountHeight = useCallback(() => {
    if (!selectedUid) return;
    setPlaced((prev) =>
      prev.map((p) => (p.uid === selectedUid ? { ...p, mountBottom: null } : p))
    );
  }, [selectedUid]);

  // Administrator-entered blind-corner pull spec for the selected cabinet.
  // Setting both min and max clears the "missing spec" conflict. Pass null to
  // clear a field. Values are inches across the corner.
  const setBlindPull = useCallback((field: "pullMin" | "pullMax", value: number | null) => {
    if (!selectedUid) return;
    setPlaced((prev) =>
      prev.map((p) => (p.uid === selectedUid ? { ...p, [field]: value } : p))
    );
  }, [selectedUid]);

  // ─── Per-cabinet door / hardware attributes (right-click dialog) ────────────
  // Update one attribute on a SPECIFIC cabinet by uid (the dialog edits the
  // cabinet it was opened on, which may not be the keyboard-selected one).
  const setCabAttr = useCallback(
    (uid: string, patch: Partial<PlacedCabinet>) => {
      setPlaced((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
    },
    []
  );

  // Right-click attributes dialog (email item 1). Opening it selects the cabinet
  // so the existing selected-based size/swing handlers operate on it.
  const [attrUid, setAttrUid] = useState<string | null>(null);
  const [attrOpen, setAttrOpen] = useState(false);
  const openAttributes = useCallback((uid: string) => {
    setSelectedUid(uid);
    setAttrUid(uid);
    setAttrOpen(true);
  }, []);

  // Set the door swing to an exact side for a specific cabinet.
  const setSwingFor = useCallback((uid: string, swing: "left" | "right" | "double") => {
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== uid) return p;
        if (!hasDoorSwing(p)) return p;
        return { ...p, swing };
      })
    );
  }, []);

  // Remove / restore the door (open unit) for a specific cabinet.
  const setNoDoorFor = useCallback((uid: string, noDoor: boolean) => {
    setCabAttr(uid, { noDoor });
  }, [setCabAttr]);

  // Set the handle/pull side for a specific cabinet.
  const setHandleSideFor = useCallback((uid: string, side: "left" | "right") => {
    setCabAttr(uid, { handleSide: side });
  }, [setCabAttr]);

  // Set the roll-out tray quantity for a specific cabinet, and reconcile the
  // single roll-out-tray BOM add-on line so the total equals the sum of every
  // cabinet's rolloutQty (priced once through the existing add-on mechanism).
  const setRolloutFor = useCallback((uid: string, qty: number) => {
    const clamped = Math.max(0, Math.round(qty));
    setPlaced((prev) => {
      const next = prev.map((p) => (p.uid === uid ? { ...p, rolloutQty: clamped } : p));
      const totalTrays = next.reduce(
        (s, p) => s + (typeof p.rolloutQty === "number" ? p.rolloutQty : 0),
        0
      );
      const row = addOnRowFor("roll-out-tray");
      if (row) {
        setAddedAddOns((prevAdd) => {
          const others = prevAdd.filter((a) => a.cabinetId !== row.id);
          if (totalTrays <= 0) return others;
          return [
            ...others,
            { cabinetId: row.id, masterCode: row.masterCode, description: row.description, qty: totalTrays },
          ];
        });
      }
      return next;
    });
  }, [addOnRowFor]);

  // ─── Custom sizing ─────────────────────────────────────────────────────────
  // Resize the selected cabinet's WIDTH to a custom value. The customer grabs a
  // placed cabinet and increases/decreases its width; the live width changes
  // (clamped to a sane 6"–48" range and to the room width) and the cabinet is
  // re-snapped so it stays seated against its wall. When the width differs from
  // the captured nominalWidth, isCustomWidth() flags it "Custom" on the canvas,
  // build sheet, and order. Width is the dimension that matters for cabinet
  // sizing; height/depth follow the standard for the placement bucket.
  const setCustomWidth = useCallback((nextWidthRaw: number) => {
    if (!selectedUid) return;
    const MIN_W = 6;
    const MAX_W = 48;
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== selectedUid) return p;
        const roomMax = p.placement === "wall" || p.placement === "base" || p.placement === "tall"
          ? Math.max(MIN_W, Math.min(MAX_W, room.width))
          : MAX_W;
        const next = Math.max(MIN_W, Math.min(roomMax, Math.round(nextWidthRaw * 10) / 10));
        const resized = { ...p, width: next };
        // Re-seat against the wall so the new width sits cleanly in-bounds.
        const snapped = snapPosition(
          resized,
          room,
          prev.filter((c) => c.uid !== p.uid)
        );
        return { ...resized, x: snapped.x, y: snapped.y };
      })
    );
  }, [selectedUid, room]);

  const adjustWidth = useCallback((deltaIn: number) => {
    if (!selectedUid) return;
    const cur = placed.find((p) => p.uid === selectedUid);
    if (!cur) return;
    setCustomWidth(cur.width + deltaIn);
  }, [selectedUid, placed, setCustomWidth]);

  // Clear the custom size: restore the cabinet's catalog (nominal) width.
  const resetWidth = useCallback(() => {
    if (!selectedUid) return;
    const cur = placed.find((p) => p.uid === selectedUid);
    if (!cur || typeof cur.nominalWidth !== "number") return;
    setCustomWidth(cur.nominalWidth);
  }, [selectedUid, placed, setCustomWidth]);

  // Custom HEIGHT (inches, 6–96"). Height doesn't affect the plan footprint /
  // snapping, so we just set it. Front View reflects the new height.
  const setCustomHeight = useCallback((nextRaw: number) => {
    if (!selectedUid) return;
    const MIN_H = 6;
    const MAX_H = 96;
    const next = Math.max(MIN_H, Math.min(MAX_H, Math.round(nextRaw * 10) / 10));
    setPlaced((prev) => prev.map((p) => (p.uid === selectedUid ? { ...p, height: next } : p)));
  }, [selectedUid]);

  const adjustHeight = useCallback((deltaIn: number) => {
    if (!selectedUid) return;
    const cur = placed.find((p) => p.uid === selectedUid);
    if (!cur) return;
    setCustomHeight(placedHeight(cur) + deltaIn);
  }, [selectedUid, placed, setCustomHeight]);

  const resetHeight = useCallback(() => {
    if (!selectedUid) return;
    const cur = placed.find((p) => p.uid === selectedUid);
    if (!cur || typeof cur.nominalHeight !== "number") return;
    setCustomHeight(cur.nominalHeight);
  }, [selectedUid, placed, setCustomHeight]);

  // Custom DEPTH (inches, 6–36"). Depth changes the plan footprint, so re-snap
  // the cabinet to keep it seated in-bounds.
  const setCustomDepth = useCallback((nextRaw: number) => {
    if (!selectedUid) return;
    const MIN_D = 6;
    const MAX_D = 36;
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== selectedUid) return p;
        const next = Math.max(MIN_D, Math.min(MAX_D, Math.round(nextRaw * 10) / 10));
        const resized = { ...p, depth: next };
        const snapped = snapPosition(resized, room, prev.filter((c) => c.uid !== p.uid));
        return { ...resized, x: snapped.x, y: snapped.y };
      })
    );
  }, [selectedUid, room]);

  const adjustDepth = useCallback((deltaIn: number) => {
    if (!selectedUid) return;
    const cur = placed.find((p) => p.uid === selectedUid);
    if (!cur) return;
    setCustomDepth(cur.depth + deltaIn);
  }, [selectedUid, placed, setCustomDepth]);

  const resetDepth = useCallback(() => {
    if (!selectedUid) return;
    const cur = placed.find((p) => p.uid === selectedUid);
    if (!cur || typeof cur.nominalDepth !== "number") return;
    setCustomDepth(cur.nominalDepth);
  }, [selectedUid, placed, setCustomDepth]);

  // Per-cabinet finish override (two-tone). Set the selected cabinet's styleId
  // so it uses a different color/finish than the design default. Pass null to
  // clear the override (cabinet falls back to the design's default finish).
  const setCabinetStyle = useCallback((newStyleId: number | null) => {
    if (!selectedUid) return;
    setPlaced((prev) =>
      prev.map((p) => (p.uid === selectedUid ? { ...p, styleId: newStyleId } : p))
    );
  }, [selectedUid]);

  // Change the DESIGN DEFAULT finish (the main dropdown). Because every cabinet
  // without its own override inherits the default, switching it recolors the
  // whole kitchen — so when cabinets are already placed we confirm first and
  // make clear the two-tone path is the per-cabinet picker. Cabinets that carry
  // their own override are never touched.
  const changeDefaultStyle = useCallback((newStyleId: number) => {
    if (newStyleId === styleId) return;
    const inheriting = placed.filter((p) => p.styleId == null).length;
    if (styleId != null && inheriting > 0) {
      const ok = window.confirm(t("dt_confirm_default_finish", { n: inheriting, s: inheriting === 1 ? "" : "s" }));
      if (!ok) return;
    }
    setStyleId(newStyleId);
  }, [styleId, placed]);

  // Two-tone bulk helper: give the SELECTED cabinet's finish to every other
  // cabinet that currently shares its effective finish. Lets the user set one
  // island cabinet to a 2nd color, then push that color to the rest of the
  // island run in a single click — without disturbing the perimeter.
  const applySelectedFinishToMatching = useCallback(() => {
    if (!selectedUid) return;
    const sel = placed.find((p) => p.uid === selectedUid);
    if (!sel) return;
    const targetStyle = sel.styleId ?? null; // the override we want to spread
    if (targetStyle == null) {
      toast.info(t("dt_t_pick_finish_first"));
      return;
    }
    setPlaced((prev) => {
      let n = 0;
      const next = prev.map((p) => {
        if (p.uid === selectedUid) return p;
        if (p.styleId !== targetStyle) { n++; return { ...p, styleId: targetStyle }; }
        return p;
      });
      toast.success(n > 0 ? `Applied this finish to ${n} more cabinet${n === 1 ? "" : "s"}.` : "All cabinets already use this finish.");
      return next;
    });
  }, [selectedUid, placed]);

  // ── Two-color (two door styles) selector ───────────────────────────────────
  // Slot A is the primary door style. We mirror styleId -> styleA so the active
  // style and slot A stay in sync when A is active. Selecting a slot makes it
  // active and swaps styleId to that slot's style so the palette + the finish
  // stamped on new cabinets follow the highlighted color.
  useEffect(() => {
    if (activeSlot === "A") setStyleA(styleId);
  }, [styleId, activeSlot]);
  useEffect(() => { styleIdRef.current = styleId; }, [styleId]);
  useEffect(() => { styleBRef.current = styleB; }, [styleB]);

  // Click a color swatch: make that slot active. If the slot already has a
  // style, switch the active style to it so new cabinets use it.
  const selectColorSlot = useCallback((slot: "A" | "B") => {
    setActiveSlot(slot);
    const target = slot === "A" ? styleA : styleB;
    if (target != null) setStyleId(target);
  }, [styleA, styleB]);

  // Assign a door style to a slot (from the picker). Setting the active slot's
  // style also updates styleId. Slot B is the two-tone second color.
  const setSlotStyle = useCallback((slot: "A" | "B", newStyleId: number) => {
    if (slot === "A") {
      setStyleA(newStyleId);
      if (activeSlot === "A") setStyleId(newStyleId);
    } else {
      setStyleB(newStyleId);
      if (activeSlot === "B") setStyleId(newStyleId);
    }
  }, [activeSlot]);

  // Snap the currently-selected cabinet flush to the chosen wall.
  const snapSelectedToWall = useCallback(
    (side: WallSide) => {
      if (!selectedUid) return;
      setPlaced((prev) =>
        prev.map((p) => {
          if (p.uid !== selectedUid) return p;
          const { x, y } = snapToWall(p, side, room);
          return { ...p, x, y };
        })
      );
    },
    [selectedUid, room]
  );

  // Delete any cabinet by uid (used by the on-canvas delete control), so a
  // cabinet can always be removed regardless of category/placement or how it
  // was selected.
  const deleteCabinet = useCallback((uid: string) => {
    setPlaced((prev) => prev.filter((p) => p.uid !== uid));
    setSelectedUid((cur) => (cur === uid ? null : cur));
  }, []);

  // Rotate a specific cabinet by uid (used by the on-canvas rotate handle so a
  // touch user can turn any cabinet they tap, not just via the toolbar/keyboard).
  const rotateCabinet = useCallback((uid: string) => {
    setSelectedUid(uid);
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== uid) return p;
        const rotated = { ...p, rotation: (p.rotation + 90) % 360 };
        const snapped = snapPosition(
          rotated,
          room,
          prev.filter((c) => c.placement === p.placement && c.uid !== p.uid)
        );
        return { ...rotated, x: snapped.x, y: snapped.y };
      })
    );
  }, [room]);

  // Right-click a WALL cabinet -> drop it to the floor as an island/peninsula
  // base. It keeps its width but becomes a floor-standing box that stands on a
  // standard 4.5" toe kick (mountBottom = TOE_KICK), so it reads like a real
  // cabinet on a toe-kick base rather than sitting flat on the slab. A 30" box
  // therefore spans 4.5"-34.5".
  const dropToFloor = useCallback((uid: string) => {
    if (layoutLocked) { toast.info(t("dt_t_unlock_drop_floor")); return; }
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== uid) return p;
        if (p.placement !== "wall") return p;
        // Resolve the cabinet's REAL current depth WHILE it is still a wall
        // cabinet (placement === "wall"), so a 12" upper stays 12". We then PIN
        // that value onto the new base box. This is essential: once placement
        // flips to "base", any resolver that hits the depth fallback
        // (dim(p.depth, STD.BASE_DEPTH)) would otherwise snap it to 24" if the
        // stored depth were ever 0/undefined — which is exactly the 12"->24" bug.
        const keptDepth = p.depth > 0 ? p.depth : STD.WALL_DEPTH;
        return {
          ...p,
          placement: "base",
          // Lock in the wall cabinet's own depth (e.g. a 12" upper stays 12")
          // instead of letting the base-depth fallback force it to 24".
          depth: keptDepth,
          nominalDepth: keptDepth,
          // Box height: keep the cabinet's own height if it has one, otherwise
          // fall back to the standard base box height.
          height: p.height && p.height > 0 ? p.height : STD.BASE_HEIGHT,
          // Stands on a standard 4.5" toe kick (not flat on the slab), so a
          // floor-dropped upper reads like a real cabinet on a toe-kick base.
          mountBottom: STD.TOE_KICK,
        };
      })
    );
    toast.success(t("dt_toast_dropped_floor"));
  }, [layoutLocked]);

  // Remove ONE instance from a consolidated panel group (decrement qty).
  const deleteOneFromGroup = useCallback((uids: string[]) => {
    const last = uids[uids.length - 1];
    if (last) deleteCabinet(last);
  }, [deleteCabinet]);

  // Keyboard: Delete/Backspace removes the selected cabinet; Escape clears
  // selection and exits measure mode. Ignored while typing in inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedOpeningUid) {
        e.preventDefault();
        deleteOpening(selectedOpeningUid);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedUid) {
        e.preventDefault();
        deleteCabinet(selectedUid);
      } else if ((e.key === "r" || e.key === "R") && selectedUid && !measureMode) {
        e.preventDefault();
        rotateSelected();
      } else if ((e.key === "s" || e.key === "S") && selectedUid && !measureMode) {
        e.preventDefault();
        swingSelected();
      } else if (selectedUid && !measureMode && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        // Arrow keys nudge the selected cabinet. Default 1"; hold Shift for a
        // fine 1/4" step. This lets users move a cabinet left/right/up/down
        // anywhere — including on or off the island (items 3 & 4).
        e.preventDefault();
        const step = e.shiftKey ? 0.25 : 1;
        if (e.key === "ArrowLeft") nudgeSelected(-step, 0);
        else if (e.key === "ArrowRight") nudgeSelected(step, 0);
        else if (e.key === "ArrowUp") nudgeSelected(0, -step);
        else if (e.key === "ArrowDown") nudgeSelected(0, step);
      } else if (e.key === "Escape") {
        setSelectedUid(null);
        setSelectedOpeningUid(null);
        setMeasureMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUid, deleteCabinet, selectedOpeningUid, deleteOpening, measureMode, rotateSelected, swingSelected, nudgeSelected]);

  const dragDataRef = useState<{ current: DesignCabinet | null }>(() => ({ current: null }))[0];

  // Preload a kitchen package layout onto the canvas (once per slug).
  useEffect(() => {
    if (!packageLayout || loadedPackageRef.current === packageLayout.slug) return;
    loadedPackageRef.current = packageLayout.slug;
    setRoom((prev) => ({ width: packageLayout.room.width, depth: packageLayout.room.depth, ceilingHeight: prev.ceilingHeight }));
    const items = (packageLayout.items as Array<{
      cabinetId: number; masterCode: string; description: string;
      placement: "base" | "wall" | "tall"; x: number; y: number; rotation: number;
      width: number | null; depth: number | null; height?: number | null;
      catalogImageUrl?: string | null;
    }>).map((it) => ({
      uid: makeUid(),
      cabinetId: it.cabinetId,
      masterCode: it.masterCode,
      description: it.description,
      placement: it.placement,
      x: it.x,
      y: it.y,
      width: it.width && it.width > 0 ? it.width : 24,
      depth:
        it.depth && it.depth > 0
          ? it.depth
          : it.placement === "wall"
          ? STD.WALL_DEPTH
          : it.placement === "tall"
          ? STD.TALL_DEPTH
          : STD.BASE_DEPTH,
      height: it.height && it.height > 0 ? it.height : standardHeight(it.placement),
      rotation: it.rotation,
      catalogImageUrl: it.catalogImageUrl ?? null,
    }));
    setPlaced(normalizeLCornerDepths(items));
    setSelectedUid(null);
    toast.success(t("dt_toast_loaded_design", { name: packageLayout.name }));
  }, [packageLayout]);

  // Load a saved design from ?load=<id> (e.g. opened from a CRM deal).
  useEffect(() => {
    if (loadDesignId == null || !savedDesign || loadedDesignRef.current === loadDesignId) return;
    loadedDesignRef.current = loadDesignId;
    const room = (savedDesign.roomData ?? null) as RoomData | null;
    const placedCabs = (savedDesign.placedCabinets ?? null) as PlacedCabinet[] | null;
    loadSavedDesign({
      room: room ?? DEFAULT_ROOM,
      placed: Array.isArray(placedCabs) ? placedCabs : [],
      styleId: (savedDesign.selectedStyleId ?? null) as number | null,
      distributorId: (savedDesign as { selectedDistributorId?: number | null }).selectedDistributorId ?? null,
      roomType: (savedDesign as { roomType?: string | null }).roomType ?? null,
    });
    toast.success(t("dt_toast_loaded_design", { name: savedDesign.name }));
  }, [loadDesignId, savedDesign, loadSavedDesign]);

  // Surface a failed package preload (network error or invalid slug).
  useEffect(() => {
    if (!packageSlug || !verified) return;
    if (packageError && !packageErrorRef.current) {
      packageErrorRef.current = true;
      toast.error(t("dt_t_pkg_load_fail"));
    }
    // packageLayout resolves to null for an unknown slug (no throw).
    if (packageLayout === null && !packageErrorRef.current) {
      packageErrorRef.current = true;
      toast.error(t("dt_t_pkg_not_found"));
    }
  }, [packageError, packageLayout, packageSlug, verified]);

  // ─── Draft auto-save / restore ───────────────────────────────────────────────
  // Real-world safeguard: someone designs on their phone, a call comes in (or the
  // OS evicts the tab), and the work must NOT vanish. We persist the full working
  // design to localStorage on every change (debounced) AND immediately when the
  // tab is backgrounded (visibilitychange / pagehide — the events mobile browsers
  // reliably fire before freezing/discarding a tab), then restore it on return.
  const draftKey = useMemo(
    () => `cabinet-dealz:designer-draft:v1:${(verifiedEmail || "guest").toLowerCase()}`,
    [verifiedEmail],
  );

  // Snapshot the full design into a serializable object.
  const snapshotDraft = usePersistFn(() => ({
    v: 1,
    savedAt: Date.now(),
    room,
    placed,
    openings,
    island,
    styleId,
    styleB,
    activeSlot,
    tier,
    crown,
    toeKick,
    batten,
    lightRail,
    countertop,
    countertopMaterialId,
    sinks,
    roomType,
    activeWall,
    layoutLocked,
    lockedWalls: Array.from(lockedWalls),
    lockedDistributorId,
    hardwareStyleId,
  }));

  const writeDraft = usePersistFn(() => {
    if (!draftRestoredRef.current) return; // don't clobber a saved draft pre-restore
    try {
      const snap = snapshotDraft();
      // Only persist if there is something worth keeping.
      const worthKeeping =
        snap.placed.length > 0 ||
        snap.openings.length > 0 ||
        snap.island != null ||
        snap.styleId != null;
      if (worthKeeping) {
        localStorage.setItem(draftKey, JSON.stringify(snap));
      }
    } catch {
      /* storage full / unavailable — ignore */
    }
  });

  // Restore once, after verification, unless we're loading a package layout.
  useEffect(() => {
    if (!verified || draftRestoredRef.current) return;
    if (packageSlug || loadDesignId != null) {
      // A package or saved-design load owns the canvas; skip draft restore but
      // allow future saves.
      draftRestoredRef.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === "object") {
          if (d.room) setRoom(d.room);
          if (Array.isArray(d.placed)) setPlaced(normalizeLCornerDepths(d.placed));
          if (Array.isArray(d.openings)) setOpenings(d.openings);
          setIsland(d.island ?? null);
          setStyleId(d.styleId ?? null);
          if (typeof d.styleB === "number") setStyleB(d.styleB);
          if (d.activeSlot === "A" || d.activeSlot === "B") setActiveSlot(d.activeSlot);
          if (d.tier) setTier(d.tier);
          // A saved design carries the user's explicit trim choices; mark them as
          // overrides so auto-apply doesn't re-enable a trim they turned off.
          if ("crown" in d) trimOverride.current.crown = true;
          if ("toeKick" in d) trimOverride.current.toeKick = true;
          if ("batten" in d) trimOverride.current.batten = true;
          if ("lightRail" in d) trimOverride.current.lightRail = true;
          setCrown(!!d.crown);
          setToeKick(!!d.toeKick);
          setBatten(!!d.batten);
          setLightRail(!!d.lightRail);
          setCountertop(!!d.countertop);
          if (typeof d.countertopMaterialId === "string") setCountertopMaterialId(d.countertopMaterialId);
          if (Array.isArray(d.sinks)) setSinks(d.sinks);
          if (d.roomType) setRoomType(d.roomType);
          if (d.activeWall) setActiveWall(d.activeWall);
          setLayoutLocked(!!d.layoutLocked);
          if (Array.isArray(d.lockedWalls)) setLockedWalls(new Set(d.lockedWalls as WallSide[]));
          if (typeof d.lockedDistributorId === "number") setLockedDistributorId(d.lockedDistributorId);
          if (typeof d.hardwareStyleId === "string") setHardwareStyleId(d.hardwareStyleId as HardwareStyleId);
          if (Array.isArray(d.placed) && d.placed.length > 0) {
            toast.success(t("dt_t_restored"));
          }
        }
      }
    } catch {
      /* corrupt draft — ignore */
    }
    draftRestoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, packageSlug, draftKey]);

  // Debounced save on any design change.
  useEffect(() => {
    if (!draftRestoredRef.current) return;
    const t = setTimeout(writeDraft, 400);
    return () => clearTimeout(t);
  }, [room, placed, openings, island, styleId, tier, crown, toeKick, batten, lightRail, countertop, countertopMaterialId, sinks, roomType, activeWall, layoutLocked, lockedWalls, lockedDistributorId, hardwareStyleId, writeDraft]);

  // Immediate save when the tab is hidden/backgrounded or about to unload —
  // this is what catches an incoming phone call or an OS tab eviction.
  useEffect(() => {
    const flush = () => writeDraft();
    const onVis = () => {
      if (document.visibilityState === "hidden") writeDraft();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [writeDraft]);

  // Clear the saved draft (used by an explicit New/Clear action).
  const clearDraft = usePersistFn(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  });

  const selectedCab = placed.find((p) => p.uid === selectedUid);
  const selectedOpening = openings.find((o) => o.uid === selectedOpeningUid);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!verified) {
    return (
      <EmailGate onVerified={handleVerified} />
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--nav-h,64px))] min-h-[600px]">
      {/* Toolbar */}
      <div className="border-b border-border bg-card px-4 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-base lg:text-lg font-bold text-foreground">
            <span className="lg:hidden">{t("dt_sh_title_mobile")}</span>
            <span className="hidden lg:inline">{t("dt_sh_title_desktop")}</span>
          </h1>
          <Badge variant="secondary" className="text-xs">{t("dt_sh_items", { n: placed.length })}</Badge>
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Room size editor + mouse-draw mode. Disabled while the layout is locked. */}
        <div className={layoutLocked ? "pointer-events-none opacity-50" : ""} title={layoutLocked ? t("dt_sh_unlock_to_edit_room") : undefined}>
          <RoomSizeControl
            room={room}
            onChange={applyRoom}
            drawMode={drawMode}
            onToggleDraw={() => {
              if (layoutLocked) return;
              setDrawMode((d) => !d);
              setSelectedUid(null);
              setMeasureMode(false);
            }}
          />
        </div>

        <div className="hidden lg:block h-5 w-px bg-border" />

        {/* Active wall selector: highlights a wall; new items drop on it and it
            can be dragged on the canvas to resize the room on that side.
            Desktop-only — on mobile these live in the "More" menu to save space. */}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">{t("dt_sh_wall")}</span>
          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/30">
            {(["top", "left", "right", "bottom"] as WallSide[]).map((w) => {
              const wLocked = layoutLocked || lockedWalls.has(w);
              return (
                <div key={w} className="flex items-center">
                  <button
                    onClick={() => { setActiveWall(w); setDrawMode(false); }}
                    title={t("dt_sh_wall_highlight", { wall: wallLabel[w] })}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeWall === w ? "bg-[#d4a75a] text-[#1a2744]" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {wallLabel[w]}
                  </button>
                  <button
                    onClick={() => {
                      if (layoutLocked) { toast.info(t("dt_sh_whole_locked")); return; }
                      setLockedWalls((prev) => {
                        const next = new Set(prev);
                        if (next.has(w)) next.delete(w); else next.add(w);
                        return next;
                      });
                    }}
                    title={wLocked ? t("dt_sh_wall_locked_unlock", { wall: wallLabel[w] }) : t("dt_sh_wall_lock", { wall: wallLabel[w] })}
                    className={`ml-0.5 mr-0.5 rounded p-1 transition-colors ${
                      wLocked ? "text-[#d4a75a]" : "text-muted-foreground/50 hover:text-foreground"
                    }`}
                  >
                    {wLocked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => {
              setLayoutLocked((v) => !v);
              setDrawMode(false);
              toast.success(!layoutLocked ? t("dt_sh_layout_locked_toast") : t("dt_sh_layout_unlocked_toast"));
            }}
            title={layoutLocked ? t("dt_sh_unlock_plan") : t("dt_sh_lock_plan")}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layoutLocked ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {layoutLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            {layoutLocked ? t("dt_sh_locked") : t("dt_sh_lock_layout")}
          </button>
          <button
            onClick={autoFillActiveWall}
            disabled={layoutLocked}
            title={t("dt_sh_autofill_title", { wall: wallLabel[activeWall] })}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4a75a]/60 bg-[#d4a75a]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1a2744] transition-colors hover:bg-[#d4a75a]/20 disabled:opacity-40"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {t("dt_sh_autofill_wall")}
          </button>
          <button
            type="button"
            onClick={() => setConsultOpen((o) => !o)}
            title={t("dt_sh_consultant_title")}
            className="flex items-center gap-1.5 rounded-lg border border-[#1a2744]/30 bg-[#1a2744]/5 px-2.5 py-1.5 text-xs font-semibold text-[#1a2744] transition-colors hover:bg-[#1a2744]/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("dt_sh_consultant")}
          </button>
        </div>

        <div className="hidden lg:block h-5 w-px bg-border" />

        {/* View toggle — ONE CLICK */}
        <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/30">
          <button
            onClick={() => setViewMode("plan")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === "plan" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> {t("dt_sh_birdseye")}
          </button>
          <button
            onClick={() => setViewMode("elevation")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === "elevation" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="h-3.5 w-3.5" /> {t("dt_sh_front_view")}
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === "split" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" /> {t("dt_sh_split")}
          </button>
          <button
            onClick={() => setViewMode("corner")}
            title={t("dt_sh_corner_title")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === "corner" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ScanLine className="h-3.5 w-3.5" /> {t("dt_sh_corner")}
          </button>
        </div>

        {/* Printable graph-paper worksheet */}
        <a
          href="/plan-sheet"
          target="_blank"
          rel="noopener noreferrer"
          title={t("dt_sh_print_title")}
          className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
        >
          <Printer className="h-3.5 w-3.5" /> {t("dt_sh_print_sheet")}
        </a>

        {/* Mobile: compact "More" menu with the toggles that live in the desktop toolbar */}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <MoreHorizontal className="h-4 w-4" /> {t("dt_sh_more")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t("dt_sh_active_wall")}</DropdownMenuLabel>
              <div className="grid grid-cols-4 gap-1 px-2 pb-1.5">
                {(["top", "left", "right", "bottom"] as WallSide[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => { setActiveWall(w); setDrawMode(false); }}
                    className={`rounded-md py-1 text-[11px] font-medium transition-colors ${
                      activeWall === w ? "bg-[#d4a75a] text-[#1a2744]" : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {wallLabel[w]}
                  </button>
                ))}
              </div>
              <DropdownMenuItem disabled={layoutLocked} onClick={autoFillActiveWall}>{t("dt_sh_autofill_active")}</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={layoutLocked} onCheckedChange={() => { setLayoutLocked((v) => !v); setDrawMode(false); }}>{t("dt_sh_lock_layout")}</DropdownMenuCheckboxItem>
              <DropdownMenuItem onClick={() => setConsultOpen((o) => !o)}>{t("dt_sh_consultant_menu")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("dt_sh_tools")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={measureMode} onCheckedChange={() => { setMeasureMode((m) => !m); setSelectedUid(null); }}>{t("dt_sh_measure")}</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={!!island} onCheckedChange={() => setIsland((cur) => cur ? null : { width: Math.min(48, room.width - 24), depth: Math.min(24, room.depth - 24), x: Math.max(0, room.width / 2 - 24), y: Math.max(0, room.depth / 2 - 12) })}>{t("dt_sh_island_zone")}</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("dt_sh_trim_front")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={crown} onCheckedChange={() => { trimOverride.current.crown = true; setCrown((c) => !c); }}>{t("dt_sh_crown")}</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={toeKick} onCheckedChange={() => { trimOverride.current.toeKick = true; setToeKick((tk) => !tk); }}>{t("dt_sh_toe_kick")}</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={batten} onCheckedChange={() => { trimOverride.current.batten = true; setBatten((b) => !b); }}>{t("dt_sh_batten")}</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={lightRail} onCheckedChange={() => { trimOverride.current.lightRail = true; setLightRail((l) => !l); }}>{t("dt_sh_light_rail")}</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={countertop} disabled={!countertop && !hasBaseRun} onCheckedChange={toggleCountertop}>{t("dt_sh_countertop")}</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("dt_sh_hardware")}</DropdownMenuLabel>
              {HARDWARE_STYLES.map((h) => (
                <DropdownMenuCheckboxItem
                  key={h.id}
                  checked={hardwareStyleId === h.id}
                  onCheckedChange={() => setHardwareStyleId(h.id)}
                  title={h.description}
                >
                  {h.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={layoutLocked} onClick={addManualFiller}>{t("dt_sh_add_filler")}</DropdownMenuItem>
              <DropdownMenuItem disabled={!selectedUid || measureMode} onClick={swingSelected}>{t("dt_sh_swing_door")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (placed.length > 0 && !window.confirm(t("dt_sh_start_new_confirm"))) return;
                  setPlaced([]);
                  setOpenings([]);
                  setIsland(null);
                  setSelectedUid(null);
                  setSelectedOpeningUid(null);
                  setCrown(false); setToeKick(false); setBatten(false); setLightRail(false); setCountertop(false);
                  setHardwareStyleId(DEFAULT_HARDWARE_STYLE_ID);
                  clearDraft();
                  toast.success(t("dt_sh_started_new"));
                }}
              >
                {t("dt_sh_start_new")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Desktop action cluster */}
        <div className="ml-auto hidden lg:flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setMeasureMode((m) => !m); setSelectedUid(null); }}
            className={`h-8 gap-1.5 ${measureMode ? "bg-[#d4a75a] text-[#1a2744] border-[#d4a75a] hover:bg-[#c89945]" : ""}`}
          >
            <Ruler className="h-3.5 w-3.5" /> {t("dt_sh_measure")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setIsland((cur) =>
                cur
                  ? null
                  : {
                      width: Math.min(48, room.width - 24),
                      depth: Math.min(24, room.depth - 24),
                      x: Math.max(0, room.width / 2 - 24),
                      y: Math.max(0, room.depth / 2 - 12),
                    }
              )
            }
            className={`h-8 gap-1.5 ${island ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <Square className="h-3.5 w-3.5" /> {t("dt_sh_island")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { trimOverride.current.crown = true; setCrown((c) => !c); }}
            title={t("dt_sh_crown_title")}
            className={`h-8 gap-1.5 ${crown ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <PanelTop className="h-3.5 w-3.5" /> {t("dt_sh_crown_btn")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { trimOverride.current.toeKick = true; setToeKick((t) => !t); }}
            title={t("dt_sh_toe_kick_title")}
            className={`h-8 gap-1.5 ${toeKick ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <Columns3 className="h-3.5 w-3.5" /> {t("dt_sh_toe_kick_btn")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { trimOverride.current.batten = true; setBatten((b) => !b); }}
            title={t("dt_sh_batten_title")}
            className={`h-8 gap-1.5 ${batten ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <Columns3 className="h-3.5 w-3.5" /> {t("dt_sh_batten_btn")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { trimOverride.current.lightRail = true; setLightRail((l) => !l); }}
            title={t("dt_sh_light_rail_title")}
            className={`h-8 gap-1.5 ${lightRail ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <PanelTop className="h-3.5 w-3.5" /> {t("dt_sh_light_rail_btn")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={addManualFiller}
            disabled={layoutLocked}
            title={t("dt_sh_filler_title")}
            className="h-8 gap-1.5"
          >
            <Columns3 className="h-3.5 w-3.5" /> {t("dt_sh_filler_btn")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleCountertop}
            disabled={!countertop && !hasBaseRun}
            title={!countertop && !hasBaseRun ? t("dt_sh_countertop_disabled_title") : t("dt_sh_countertop_title")}
            className={`h-8 gap-1.5 ${countertop ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600" : ""}`}
          >
            <Square className="h-3.5 w-3.5" /> {t("dt_sh_countertop_btn")}
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={rotateSelected} className="h-8 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> {t("dt_sh_rotate")} <span className="text-[10px] opacity-60">(R)</span>
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={swingSelected} className="h-8 gap-1.5">
            <DoorOpen className="h-3.5 w-3.5" /> {t("dt_sh_swing")} <span className="text-[10px] opacity-60">(S)</span>
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={deleteSelected} className="h-8 gap-1.5 text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> {t("dt_sh_delete")}
          </Button>
          <div className="h-5 w-px bg-border" />
          <DesignActions
            room={room}
            placed={placed}
            styleId={styleId}
            lockedDistributorId={lockedDistributorId}
            styleName={activeStyleName}
            tier={tier}
            total={total}
            extraLines={extraLines}
            buildRows={buildRows}
            roomType={roomType}
            contactEmail={verifiedEmail}
            onLoad={loadSavedDesign}
          />
          <div className="h-5 w-px bg-border" />
          <DesignHelp />
        </div>
      </div>

      {/* Contextual row: wall picker for the selected cabinet, or draw-mode hint */}
      {(selectedCab || selectedOpening || drawMode) && !measureMode && (
        <div className="border-b border-border bg-[#f7f5f0] px-4 py-1.5 flex items-center gap-3 flex-wrap shrink-0">
          {selectedCab && !drawMode && (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-white p-0.5">
                <CabinetImage cabinet={selectedCab} className="h-full w-auto max-w-full" />
              </div>
              {/* Door-style thumbnail: shows a picture of the selected door's
                  face/finish so the member sees the actual door look while
                  editing the cabinet. Falls back to a color chip from the
                  finish palette when the style has no sample photo. */}
              {(paletteFinishSwatch || styleId) && (
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  title={`Door style: ${activeStyleName || "selected style"}`}
                >
                  {paletteFinishSwatch ? (
                    <img
                      src={paletteFinishSwatch}
                      alt={`${activeStyleName || "Door"} door sample`}
                      className="h-9 w-9 rounded border border-border object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded border text-[8px] font-semibold"
                      style={{ backgroundColor: activeFinish.face, borderColor: activeFinish.edge, color: activeFinish.label }}
                    >
                      {t("dt_cx_door")}
                    </span>
                  )}
                  <span className="hidden md:inline text-[10px] leading-tight text-muted-foreground">
                    {t("dt_cx_door")}<br /><span className="font-medium text-foreground/80">{activeStyleName || "—"}</span>
                  </span>
                </div>
              )}
              <span className="text-[11px] text-muted-foreground">
                {t("dt_cx_selected")} <span className="font-mono font-semibold text-foreground">{selectedCab.masterCode}</span>
                <span className="ml-1 hidden sm:inline text-foreground/70">— {selectedCab.description}</span>
              </span>
              <div className="h-4 w-px bg-border" />
              <WallPicker onPick={snapSelectedToWall} />
              {/* Custom sizing: resize this cabinet's Width, Height and Depth to
                  order it as a custom-size piece. Each dimension has −/+ (1")
                  steppers and an exact field; a dimension turns gold + bold when
                  it differs from the catalog size, and a single Reset restores
                  all three to the catalog values. */}
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                <DimStepper
                  label="W"
                  value={Math.round(selectedCab.width * 10) / 10}
                  custom={isCustomWidth(selectedCab)}
                  min={6}
                  max={48}
                  onStep={adjustWidth}
                  onSet={setCustomWidth}
                />
                <DimStepper
                  label="H"
                  value={Math.round(placedHeight(selectedCab) * 10) / 10}
                  custom={isCustomHeight(selectedCab)}
                  min={6}
                  max={96}
                  onStep={adjustHeight}
                  onSet={setCustomHeight}
                />
                <DimStepper
                  label="D"
                  value={Math.round(selectedCab.depth * 10) / 10}
                  custom={isCustomDepth(selectedCab)}
                  min={6}
                  max={36}
                  onStep={adjustDepth}
                  onSet={setCustomDepth}
                />
                {(isCustomWidth(selectedCab) || isCustomHeight(selectedCab) || isCustomDepth(selectedCab)) && (
                  <>
                    <Badge variant="secondary" className="text-[10px]">{t("dt_cx_custom_fee", { fee: CUSTOM_SIZE_FEE })}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-muted-foreground"
                      title={t("dt_cx_reset_dims")}
                      onClick={() => { resetWidth(); resetHeight(); resetDepth(); }}
                    >
                      {t("dt_cx_reset")}
                    </Button>
                  </>
                )}
              </div>
              {/* Per-cabinet finish (two-tone): give THIS cabinet a different
                  color/finish than the design default, within the locked supply
                  line. "Match design" clears the override. */}
              {styleId && uniqueDoorStyles.length > 0 && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1 rounded-md bg-[#d4a75a]/10 px-1.5 py-1 ring-1 ring-[#d4a75a]/30">
                    <Palette className="h-3.5 w-3.5 text-[#1a2744]" />
                    <span className="text-[11px] font-semibold text-[#1a2744] mr-0.5">{t("dt_cx_finish_this")}</span>
                    <Select
                      value={selectedCab.styleId != null ? String(selectedCab.styleId) : "__match__"}
                      onValueChange={(v) => setCabinetStyle(v === "__match__" ? null : Number(v))}
                    >
                      <SelectTrigger className="h-7 w-[150px] text-[11px] bg-white">
                        <SelectValue placeholder={t("dt_cx_match_design")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__match__">{t("dt_cx_match_design")}{activeStyleName ? ` (${activeStyleName})` : ""}</SelectItem>
                        {uniqueDoorStyles.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.ourName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedCab.styleId != null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-[#1a2744] hover:bg-[#d4a75a]/20"
                        title={t("dt_cx_apply_all")}
                        onClick={applySelectedFinishToMatching}
                      >
                        {t("dt_cx_apply_to_all")}
                      </Button>
                    )}
                  </div>
                </>
              )}
              {selectedCab.placement === "wall" && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground mr-0.5">{t("dt_cx_mount")}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title={t("dt_cx_raise")}
                      onClick={() => adjustMountHeight(1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] font-mono tabular-nums text-foreground min-w-[34px] text-center">
                      {Math.round(elevationBox(selectedCab, room).bottom)}″
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title={t("dt_cx_lower")}
                      onClick={() => adjustMountHeight(-1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    {typeof selectedCab.mountBottom === "number" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-muted-foreground"
                        title={t("dt_cx_reset_mount")}
                        onClick={resetMountHeight}
                      >
                        {t("dt_cx_reset")}
                      </Button>
                    )}
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    title={t("dt_cx_drop_island")}
                    onClick={() => dropToFloor(selectedCab.uid)}
                  >
                    <ChevronsDown className="h-3.5 w-3.5" />
                    {t("dt_cx_drop_to_floor")}
                  </Button>
                </>
              )}
              {isBlindCorner(selectedCab.masterCode, selectedCab.description) && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
                      typeof selectedCab.pullMin === "number" && typeof selectedCab.pullMax === "number"
                        ? ""
                        : "bg-red-50 ring-1 ring-red-300"
                    }`}
                    title={t("dt_cx_pull_spec_title")}
                  >
                    <span className="text-[11px] text-muted-foreground mr-0.5">{t("dt_cx_pull_spec")}</span>
                    <Input
                      type="number"
                      value={typeof selectedCab.pullMin === "number" ? selectedCab.pullMin : ""}
                      placeholder={t("dt_cx_min")}
                      className="h-7 w-14 text-[11px]"
                      onChange={(e) => setBlindPull("pullMin", e.target.value === "" ? null : Number(e.target.value))}
                    />
                    <span className="text-[11px] text-muted-foreground">–</span>
                    <Input
                      type="number"
                      value={typeof selectedCab.pullMax === "number" ? selectedCab.pullMax : ""}
                      placeholder={t("dt_cx_max")}
                      className="h-7 w-14 text-[11px]"
                      onChange={(e) => setBlindPull("pullMax", e.target.value === "" ? null : Number(e.target.value))}
                    />
                    <span className="text-[11px] text-muted-foreground">{t("dt_cx_in")}</span>
                  </div>
                </>
              )}
            </>
          )}
          {selectedOpening && !drawMode && (
            <OpeningSizeEditor
              opening={selectedOpening}
              room={room}
              onChange={changeOpening}
              onDelete={() => deleteOpening(selectedOpening.uid)}
            />
          )}
          {drawMode && (
            <span className="text-[11px] font-medium text-[#a87f33]">
              Draw mode: drag a rectangle on an empty part of the canvas to set your room size, then release.
            </span>
          )}
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Left palette — inline column on desktop; slide-in drawer on mobile.
            Mobile wraps the SAME body in a left Sheet; desktop renders it as a
            fixed-width column. The body markup below is shared (no duplication). */}
        <PaletteShell
          isMobile={isMobile}
          open={mobilePanel === "catalog"}
          onOpenChange={(o) => setMobilePanel(o ? "catalog" : null)}
        >
          <div className="p-3 border-b border-border">
            {/* Room type: drives the palette (Kitchen appliances vs bath/laundry
                fixtures vs Closet modular parts). */}
            <div className="grid grid-cols-5 gap-0.5 rounded-lg border border-border p-0.5 bg-muted/30 mb-2">
              {ROOM_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  onClick={() => {
                    setRoomType(rt.value);
                    // Pick a sensible starting tab for the chosen room type
                    // without forbidding the others.
                    setPaletteType(
                      rt.value === "closet"
                        ? "closetparts"
                        : rt.value === "bathroom"
                        ? "vanity"
                        : rt.value === "laundry"
                        ? "appliance"
                        : "base",
                    );
                  }}
                  className={`py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
                    roomType === rt.value ? "bg-[#a87f33] text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(("dt_room_" + rt.value) as SiteStringKey)}
                </button>
              ))}
            </div>
            {paletteType === "closetparts" && (
              <p className="mb-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-700">
                {t("dt_pl_closet_note")}
              </p>
            )}
            {/* Catalog tabs. Closet mode leads with the Closet parts tab but
                still exposes cabinets + the Door/Win tool so a closet can hold
                cabinets and an entry door. Kitchen mode keeps its tab set. */}
            <div className="flex lg:flex-wrap overflow-x-auto no-scrollbar rounded-lg border border-border p-0.5 bg-muted/30 mb-2">
              {(roomType === "closet"
                ? (["closetparts", "base", "wall", "tall", "opening", "accessory"] as const)
                : roomType === "bathroom"
                ? (["vanity", "appliance", "base", "corner", "wall", "wallht", "tall", "opening", "accessory"] as const)
                : roomType === "laundry"
                ? (["appliance", "base", "corner", "wall", "wallht", "tall", "opening", "accessory"] as const)
                : (["base", "corner", "wall", "wallht", "tall", "appliance", "opening", "accessory"] as const)
              ).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPaletteType(tab)}
                  className={`shrink-0 whitespace-nowrap px-2.5 lg:px-1 lg:flex-1 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
                    paletteType === tab ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "appliance"
                    ? (roomType === "bathroom" || roomType === "laundry" ? t("dt_tab_fixtures") : t("dt_tab_appli"))
                    : tab === "opening"
                    ? t("dt_tab_door_win")
                    : tab === "wallht"
                    ? t("dt_tab_wall_by_ht")
                    : tab === "corner"
                    ? t("dt_tab_corner")
                    : tab === "vanity"
                    ? t("dt_tab_vanity")
                    : tab === "closetparts"
                    ? t("dt_tab_closet")
                    : tab === "accessory"
                    ? t("dt_tab_accessories")
                    : tab === "base"
                    ? t("dt_tab_base")
                    : tab === "wall"
                    ? t("dt_tab_wall")
                    : tab === "tall"
                    ? t("dt_tab_tall")
                    : tab}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={roomType === "closet" ? t("dt_pl_search_closet") : t("dt_pl_search_kitchen")}
                className="pl-8 pr-7 h-8 text-xs"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
              />
              {paletteSearch && (
                <button
                  type="button"
                  aria-label={t("dt_pl_clear_search")}
                  onClick={() => setPaletteSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {paletteType === "opening" ? (
              OPENINGS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => addOpening(o)}
                  className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                >
                  <div className={`h-9 w-9 rounded border flex items-center justify-center shrink-0 ${o.kind === "door" ? "bg-[#9b6a3c]/30 border-[#9b6a3c]/50" : o.kind === "opening" ? "bg-[#8a8f98]/20 border-dashed border-[#8a8f98]/70" : "bg-[#7fb4d6]/30 border-[#7fb4d6]/60"}`}>
                    {o.kind === "door" ? <PanelTop className="h-4 w-4 text-[#8a5f33]" /> : o.kind === "opening" ? <DoorOpen className="h-4 w-4 text-[#5b6770]" /> : <Square className="h-4 w-4 text-[#3f7da6]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground truncate">{o.label}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{o.kind} · {o.width}"W × {o.height}"H</div>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                </button>
              ))
            ) : paletteLoading ? (
              Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
            ) : (
              groupedPalette.map((group) => {
                // Accordion: each height/category group collapses. Keyed per-tab.
                // Force-open while searching so no matching item is ever hidden.
                const groupKey = `${paletteType}:${group.label}`;
                const searching = normalizePaletteSearch(paletteSearch).length > 0;
                const open = searching || !collapsedGroups.has(groupKey);
                return (
                <div key={group.label} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    aria-expanded={open}
                    className="sticky top-0 z-10 -mx-1 w-[calc(100%+0.5rem)] flex items-center gap-1.5 px-2 py-1.5 bg-background/95 backdrop-blur text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
                      style={{ transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
                    />
                    <span className="flex-1 text-left">{group.label}</span>
                    <span className="font-normal normal-case">({group.items.length})</span>
                  </button>
                  {open && group.items.map((c) => {
                    // Accessories & Trim: PHYSICAL items (decorative/end panels,
                    // skins, appliance garages) drop onto the drawing like a
                    // cabinet box (click-to-place or drag); LOOSE trim/hardware
                    // sold by the foot/each (crown, light rail, roll-out trays,
                    // hinges, pulls) stays a bill-of-materials quantity line.
                    if (paletteType === "accessory") {
                      const placeable = isPlaceableAccessory(c);
                      if (placeable) {
                        return (
                          <button
                            key={c.masterCode}
                            draggable
                            onDragStart={() => { dragDataRef.current = c; }}
                            onClick={() => addCabinet(c)}
                            className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                          >
                            <div className="h-9 w-9 rounded bg-white border border-[#a07d4a]/40 flex items-center justify-center shrink-0 p-0.5">
                              <CabinetImage cabinet={c} className="h-full w-auto max-w-full" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-xs font-semibold text-foreground truncate">{c.masterCode}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>
                              <div className="text-[9px] font-medium text-primary/70">{t("dt_pl_click_drag_place")}</div>
                            </div>
                            <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                          </button>
                        );
                      }
                      const added = addedAddOnIds.has(c.id);
                      return (
                        <button
                          key={c.masterCode}
                          onClick={() => addAddOn(c)}
                          className={`w-full text-left p-2 rounded-lg border transition-colors group flex items-center gap-2 ${
                            added
                              ? "border-primary/60 bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          }`}
                        >
                          <div className="h-9 w-9 rounded bg-white border border-[#a07d4a]/40 flex items-center justify-center shrink-0 p-0.5">
                            <CabinetImage cabinet={c} className="h-full w-auto max-w-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-xs font-semibold text-foreground truncate">{c.masterCode}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>
                          </div>
                          {added ? (
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                          )}
                        </button>
                      );
                    }
                    return (
                    <button
                      key={c.masterCode}
                      draggable
                      onDragStart={() => { dragDataRef.current = c; }}
                      onClick={() => addCabinet(c)}
                      className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                    >
                      <div className="h-9 w-9 rounded bg-white border border-[#a07d4a]/40 flex items-center justify-center shrink-0 p-0.5">
                        <CabinetImage cabinet={c} className="h-full w-auto max-w-full" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-semibold text-foreground truncate">{c.masterCode}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>
                        {(() => {
                          // A base-family box (Base/Vanity tab, or a corner BASE
                          // cabinet inside the unified Corner tab) is always the
                          // standard 34.5" tall; wall/tall/corner-wall boxes use
                          // their real catalog height.
                          const isBaseBox =
                            paletteType === "base" ||
                            paletteType === "vanity" ||
                            (paletteType === "corner" && isCornerBase(c));
                          const hVal = isBaseBox ? "34.5" : (dim(c.height, 0) > 0 ? String(dim(c.height, 0)) : null) ?? "—";
                          const showH = isBaseBox || dim(c.height, 0) > 0;
                          return (
                            <div className="text-[10px] text-muted-foreground">{dim(c.width, 24)}"W × {hVal}{showH ? "\"H" : ""}</div>
                          );
                        })()}
                      </div>
                      {paletteFinishSwatch && (
                        <img
                          src={paletteFinishSwatch}
                          alt={activeStyleName ? `${activeStyleName} finish` : "selected finish"}
                          title={activeStyleName ?? undefined}
                          loading="lazy"
                          className="h-7 w-7 rounded-sm object-cover border border-[#a07d4a]/40 shrink-0"
                        />
                      )}
                      <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                    </button>
                    );
                  })}
                </div>
                );
              })
            )}
            {paletteType !== "opening" && !paletteLoading && filteredPalette.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                {paletteSearch
                  ? t("dt_pl_no_match")
                  : styleId
                  ? t("dt_pl_no_style")
                  : t("dt_pl_no_category")}
              </p>
            )}
            {paletteType === "opening" && (
              <p className="text-[10px] text-muted-foreground text-center pt-3 px-2">{t("dt_pl_click_add_drag")}</p>
            )}
            {paletteType === "accessory" && filteredPalette.length > 0 && (
              <p className="text-[10px] text-muted-foreground text-center pt-3 px-2">{t("dt_pl_panels_note")}</p>
            )}
          </div>
          <div className="p-2 border-t border-border text-[10px] text-muted-foreground text-center">
            {paletteType === "accessory"
              ? t("dt_pl_foot_accessory")
              : t("dt_pl_foot_default")}
          </div>
        </PaletteShell>

        {/* Canvas */}
        <div className="flex-1 min-w-0 relative pb-14 lg:pb-0">
          {viewMode === "plan" && (
            <PlanCanvas
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              onMove={moveCabinet}
              onDelete={deleteCabinet}
              onRotate={rotateCabinet}
              onOpenAttributes={openAttributes}
              onDropNew={handleDropNew}
              showWallLayer={showWallLayer}
              measureMode={measureMode}
              island={island}
              onIslandChange={setIsland}
              onIslandMove={moveIsland}
              openings={openings}
              selectedOpeningUid={selectedOpeningUid}
              onSelectOpening={setSelectedOpeningUid}
              onOpeningChange={changeOpening}
              onDeleteOpening={deleteOpening}
              finish={activeFinish}
              drawMode={drawMode}
              onDrawRoom={(r) => { applyRoom(r); setDrawMode(false); toast.success(t("dt_toast_room_set", { w: Math.round(r.width/12), d: Math.round(r.depth/12) })); }}
              activeWall={activeWall}
              onSelectWall={setActiveWall}
              onResizeWall={resizeWall}
              conflictUids={conflictUids}
              layoutLocked={layoutLocked}
              lockedWalls={lockedWalls}
              countertopMaterialId={countertop ? countertopMaterialId : null}
              sinks={sinks}
              selectedSinkUid={selectedSinkUid}
              onSelectSink={setSelectedSinkUid}
              onMoveSink={moveSink}
              onDropToFloor={dropToFloor}
              finishFor={finishForCab}
            />
          )}
          {viewMode === "elevation" && (
            <ElevationView
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              wall={activeWall}
              onSelectWall={setActiveWall}
              countertopMaterialId={countertop ? countertopMaterialId : null}
              openings={openings}
              finish={activeFinish}
              crown={crown}
              toeKick={toeKick}
              batten={batten}
              lightRail={lightRail}
              panelKind={activePanelKind}
              hardwareStyleId={hardwareStyleId}
              finishFor={finishForCab}
              panelKindFor={panelKindForCab}
            />
          )}
          {viewMode === "corner" && (
            <CornerView
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              corner={corner}
              onCornerChange={setCorner}
              countertopMaterialId={countertop ? countertopMaterialId : null}
              openings={openings}
              finish={activeFinish}
              crown={crown}
              toeKick={toeKick}
              batten={batten}
              lightRail={lightRail}
              panelKind={activePanelKind}
              hardwareStyleId={hardwareStyleId}
              finishFor={finishForCab}
              panelKindFor={panelKindForCab}
            />
          )}
          {viewMode === "split" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0 border-b border-border">
                <PlanCanvas
                  room={room}
                  cabinets={placed}
                  selectedUid={selectedUid}
                  onSelect={setSelectedUid}
                  onMove={moveCabinet}
                  onDelete={deleteCabinet}
                  onRotate={rotateCabinet}
                  onOpenAttributes={openAttributes}
                  onDropNew={handleDropNew}
                  showWallLayer={showWallLayer}
                  measureMode={measureMode}
                  island={island}
                  onIslandChange={setIsland}
                  onIslandMove={moveIsland}
                  openings={openings}
                  selectedOpeningUid={selectedOpeningUid}
                  onSelectOpening={setSelectedOpeningUid}
                  onOpeningChange={changeOpening}
                  onDeleteOpening={deleteOpening}
                  finish={activeFinish}
                  drawMode={drawMode}
                  onDrawRoom={(r) => { applyRoom(r); setDrawMode(false); toast.success(t("dt_toast_room_set", { w: Math.round(r.width/12), d: Math.round(r.depth/12) })); }}
                  activeWall={activeWall}
                  onSelectWall={setActiveWall}
                  onResizeWall={resizeWall}
                  conflictUids={conflictUids}
                  layoutLocked={layoutLocked}
                  lockedWalls={lockedWalls}
                  countertopMaterialId={countertop ? countertopMaterialId : null}
                  sinks={sinks}
                  selectedSinkUid={selectedSinkUid}
                  onSelectSink={setSelectedSinkUid}
                  onMoveSink={moveSink}
                  onDropToFloor={dropToFloor}
                  finishFor={finishForCab}
                />
              </div>
              <div className="flex-1 min-h-0">
                <ElevationView
                  room={room}
                  cabinets={placed}
                  selectedUid={selectedUid}
                  onSelect={setSelectedUid}
                  wall={activeWall}
                  onSelectWall={setActiveWall}
                  countertopMaterialId={countertop ? countertopMaterialId : null}
                  openings={openings}
                  finish={activeFinish}
                  crown={crown}
                  toeKick={toeKick}
                  batten={batten}
                  lightRail={lightRail}
                  panelKind={activePanelKind}
                  hardwareStyleId={hardwareStyleId}
                  finishFor={finishForCab}
                  panelKindFor={panelKindForCab}
                />
              </div>
            </div>
          )}

          {/* Wall layer toggle (plan only) */}
          {viewMode !== "elevation" && viewMode !== "corner" && (
            <button
              onClick={() => setShowWallLayer((s) => !s)}
              className="absolute top-3 right-3 z-30 flex items-center gap-1.5 bg-white/90 border border-border rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-white"
            >
              <PanelTop className="h-3.5 w-3.5" />
              {showWallLayer ? t("dt_hide_wall_cabs") : t("dt_show_wall_cabs")}
            </button>
          )}
        </div>

        {/* Right: pricing + BOM — inline column on desktop; bottom drawer on mobile */}
        <PricingShell
          isMobile={isMobile}
          open={mobilePanel === "cart"}
          onOpenChange={(o) => setMobilePanel(o ? "cart" : null)}
        >
          <div className="p-3 border-b border-border space-y-2">
            {/* Door-style sample: a large, clear hero of the selected finish at the
                very top of the build sheet so the look is obvious at a glance. */}
            <div className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              {activeStyle ? (
                <DoorStyleSwatch style={activeStyle} className="h-40 w-full object-contain" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center text-xs text-muted-foreground">
                  {t("dt_bs_select_finish_preview")}
                </div>
              )}
              {/* Label overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2 pt-8">
                <div className="text-[10px] uppercase tracking-wider text-white/70">{t("dt_bs_door_sample")}</div>
                <div className="truncate text-sm font-bold text-white">
                  {activeStyleName ?? t("dt_bs_select_style")}
                </div>
                {activeStyle && (activeStyle.doorStyle || activeStyle.finish || activeStyle.color) && (
                  <div className="truncate text-[11px] text-white/80">
                    {[activeStyle.doorStyle, activeStyle.color || activeStyle.finish].filter(Boolean).join(" \u00b7 ")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Door style & pricing picker: collapses into an accordion once a door
              style is chosen so it stops dominating the panel (esp. on mobile).
              The header summarizes the active style + tier when collapsed. The
              door-style hero sample above stays visible at all times. */}
          <SheetSection
            className="border-b border-border"
            title={
              styleId
                ? `${t("dt_bs_door_section")} · ${activeStyleName ?? ""} · ${tier === "Wholesale" ? t("dt_bs_wholesale") : t("dt_bs_contractor")}`
                : t("dt_bs_door_section_none")
            }
            collapsed={sheetCollapsed("door-style-picker", styleId != null)}
            onToggle={() => toggleSheetSection("door-style-picker")}
          >
            <div className="px-3 pb-3 pt-1 space-y-2">
            {/* Two-color selector (items 8 & 9): two door-style swatch buttons.
                The HIGHLIGHTED one is the color new cabinets are placed in. Click
                a swatch to make it active; use its picker to set/change the style.
                Slot B is optional — "Set second color" until chosen. The pricing
                tier (Wholesale/Contractor) sits right next to the color buttons
                (item 7). */}
            <div className="grid grid-cols-2 gap-2">
              <ColorSlotButton
                label={t("dt_bs_color_1")}
                slot="A"
                active={activeSlot === "A"}
                style={styleA != null ? (doorStyles?.find((d) => d.id === styleA) ?? null) : null}
                styles={uniqueDoorStyles}
                onSelect={() => selectColorSlot("A")}
                onPick={(id) => setSlotStyle("A", id)}
                onClear={undefined}
              />
              <ColorSlotButton
                label={t("dt_bs_color_2")}
                slot="B"
                active={activeSlot === "B"}
                style={styleB != null ? (doorStyles?.find((d) => d.id === styleB) ?? null) : null}
                styles={uniqueDoorStyles}
                onSelect={() => { if (styleB != null) selectColorSlot("B"); else toast.info(t("dt_t_second_style_first")); }}
                onPick={(id) => setSlotStyle("B", id)}
                onClear={styleB != null ? () => {
                  // Drop the second color: clear B, re-color any cabinets that
                  // were placed in B back to the default, and return to Color 1.
                  setPlaced((prev) => prev.map((p) => (p.styleId === styleB ? { ...p, styleId: null } : p)));
                  setStyleB(null);
                  if (activeSlot === "B") { setActiveSlot("A"); if (styleA != null) setStyleId(styleA); }
                  toast.success(t("dt_t_second_color_removed"));
                } : undefined}
              />
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {t("dt_bs_two_tone_help")}
            </p>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-foreground shrink-0">{t("dt_bs_pricing")}</span>
              <Select value={tier} onValueChange={(v) => setTier(v as PricingTier)}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wholesale">{t("dt_bs_wholesale")}</SelectItem>
                  <SelectItem value="Contractor">{t("dt_bs_contractor")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
          </SheetSection>

          {/* BOM list */}
          <div className="flex-1 overflow-y-auto py-1">
            {placed.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Add cabinets to build your bill of materials
              </div>
            ) : (
              (() => {
                // One line-item renderer reused by every cabinet section so base,
                // wall and appliance lines look and behave identically.
                const renderLine = (g: typeof panelGroups[number]) => {
                  const selected = g.uids.includes(selectedUid ?? "");
                  const lineTotal = g.unitPrice != null ? g.unitPrice * g.qty : null;
                  return (
                    <div
                      key={g.key}
                      onClick={() => setSelectedUid(g.uids[g.uids.length - 1])}
                      className={`group w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        selected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold truncate flex items-center gap-1.5">
                          {g.sample.masterCode}
                          {g.qty > 1 && (
                            <span className="inline-flex items-center rounded bg-[#1a2744] text-white px-1.5 py-0.5 text-[9px] font-bold">
                              ×{g.qty}
                            </span>
                          )}
                          {g.hasConflict && (
                            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                              Conflict
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {g.label} · {g.sample.placement}
                          {(g.swing === "left" || g.swing === "right") && (
                            <span className="ml-1 font-semibold text-foreground/70">· {g.swing === "left" ? "L hinge" : "R hinge"}</span>
                          )}
                        </div>
                        {/* Per-line color: always show the cabinet's specific door
                            style / finish so the shopping list is unambiguous
                            (critical for two-tone designs). */}
                        {g.colorName && (
                          <div className="mt-0.5 flex items-center gap-1">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm border shrink-0"
                              style={{ background: g.colorFace ?? "#ccc", borderColor: g.colorEdge ?? "#999" }}
                            />
                            <span className="text-[10px] font-medium text-foreground/80 truncate">{g.colorName}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-right">
                          <div className="font-semibold leading-none">
                            {styleId ? (lineTotal != null ? `$${lineTotal.toFixed(2)}` : "N/A") : "—"}
                          </div>
                          {styleId && g.qty > 1 && g.unitPrice != null && (
                            <div className="text-[9px] text-muted-foreground mt-0.5">${g.unitPrice.toFixed(2)} ea</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteOneFromGroup(g.uids); }}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={g.qty > 1 ? `Remove one ${g.sample.masterCode}` : `Remove ${g.sample.masterCode}`}
                          title={g.qty > 1 ? "Remove one from the design" : "Remove from the design"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                };
                return (
                  <>
                    {cabinetSections.base.length > 0 && (
                      <SheetSection
                        title={t("dt_bs_sec_base")}
                        count={cabinetSections.base.reduce((n, g) => n + g.qty, 0)}
                        collapsed={collapsedSheet.has("base")}
                        onToggle={() => toggleSheetSection("base")}
                      >
                        <div className="px-2 pb-1 space-y-1">{cabinetSections.base.map(renderLine)}</div>
                      </SheetSection>
                    )}
                    {cabinetSections.wall.length > 0 && (
                      <SheetSection
                        title={t("dt_bs_sec_wall")}
                        count={cabinetSections.wall.reduce((n, g) => n + g.qty, 0)}
                        collapsed={collapsedSheet.has("wall")}
                        onToggle={() => toggleSheetSection("wall")}
                      >
                        <div className="px-2 pb-1 space-y-1">{cabinetSections.wall.map(renderLine)}</div>
                      </SheetSection>
                    )}
                    {cabinetSections.other.length > 0 && (
                      <SheetSection
                        title={t("dt_bs_sec_other")}
                        count={cabinetSections.other.reduce((n, g) => n + g.qty, 0)}
                        collapsed={collapsedSheet.has("other")}
                        onToggle={() => toggleSheetSection("other")}
                      >
                        <div className="px-2 pb-1 space-y-1">{cabinetSections.other.map(renderLine)}</div>
                      </SheetSection>
                    )}
                  </>
                );
              })()
            )}
            {(fillers.length > 0 || ((crown || toeKick || batten || countertop) && placed.length > 0) || addedAddOns.length > 0) && (
            <SheetSection
              title={t("dt_bs_sec_extras")}
              collapsed={collapsedSheet.has("extras")}
              onToggle={() => toggleSheetSection("extras")}
            >
            <div className="px-2 pb-1 space-y-1">
            {fillers.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {fillers.map((f) => (
                  <div key={f.kind} className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-amber-50 dark:bg-amber-950/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{f.kind === "wall" ? t("dt_bs_wall_corner_filler") : t("dt_bs_base_corner_filler")}</div>
                      <div className="text-[10px] text-muted-foreground">{t("dt_bs_filler_req", { count: f.count, width: f.width })}</div>
                    </div>
                    <span className="font-semibold shrink-0 text-amber-700 dark:text-amber-400">{t("dt_bs_incl")}</span>
                  </div>
                ))}
              </div>
            )}
            {(crown || toeKick || batten || countertop) && placed.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {crown && crownOrder && crownOrder.pieces > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_crown_molding")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {crownOrder.pieces} pc{crownOrder.pieces > 1 ? "s" : ""} @ {crownOrder.stickFeet}&apos; · {crownOrder.measuredFeet} ft run (incl. 3&quot; miter/wall)
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">{t("dt_bs_incl")}</span>
                  </div>
                )}
                {toeKick && toeKickOrder && toeKickOrder.pieces > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_toe_kick")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {toeKickOrder.pieces} pc{toeKickOrder.pieces > 1 ? "s" : ""} @ {toeKickOrder.stickFeet}&apos; · {toeKickOrder.measuredFeet} ft run
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">{t("dt_bs_incl")}</span>
                  </div>
                )}
                {batten && battenOrder && battenOrder.pieces > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_batten_molding")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {battenOrder.pieces} pc{battenOrder.pieces > 1 ? "s" : ""} @ {battenOrder.stickFeet}&apos; · {battenOrder.measuredFeet} ft run · 3/4&quot; × 3/16&quot;
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">{t("dt_bs_incl")}</span>
                  </div>
                )}
                {countertop && counter && counter.squareFeet > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-amber-500/10 border border-amber-500/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_countertop")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        ~{counter.squareFeet} sq ft · {counter.linearFeet} linear ft{counter.hasIsland ? " (incl. island)" : ""}
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-amber-600">{t("dt_bs_quote")}</span>
                  </div>
                )}
              </div>
            )}

            {/* Added add-on accessories (touch-up kit, roll-out trays) */}
            {addedAddOns.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {addedAddOns.map((a) => {
                  const unit = styleId ? addOnPriceFor(a.cabinetId) : null;
                  return (
                    <div key={a.cabinetId} className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-emerald-50 dark:bg-emerald-950/30">
                      <div className="min-w-0">
                        <div className="font-mono font-semibold truncate">{a.masterCode}{a.qty > 1 ? ` ×${a.qty}` : ""}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{a.description}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-semibold">{styleId && unit != null ? `$${(unit * a.qty).toFixed(2)}` : "—"}</span>
                        <button
                          onClick={() => removeAddOn(a.cabinetId)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${a.masterCode}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
            </SheetSection>
            )}
          </div>

          {/* "Don't forget this" recommendations — touch-up kit always, roll-out
              trays once base cabinets are placed. Only shown when the add-on is
              actually buyable in the selected style. */}
          {styleId && (() => {
            const cards = recommendations
              .map((rec) => ({ rec, row: addOnRowFor(rec.kind) }))
              .filter((c) => c.row && !addedAddOnIds.has(c.row!.id));
            if (cards.length === 0) return null;
            return (
              // Hidden on mobile — these upsell cards crowd the cabinet list in
              // the Catalog sheet. Shown only on the desktop sidebar (lg+).
              <div className="hidden lg:block px-3 pb-2 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Don&apos;t forget
                </div>
                {cards.map(({ rec, row }) => (
                  <div
                    key={rec.kind}
                    className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2.5"
                  >
                    <div className="text-xs font-semibold text-foreground">
                      {rec.kind === "touch-up-kit"
                        ? "Add a touch-up kit"
                        : rec.kind === "roll-out-tray"
                          ? "Add roll-out trays?"
                          : rec.kind === "end-panel"
                            ? "Finish exposed sides?"
                            : "Add crown molding?"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      {rec.kind === "touch-up-kit"
                        ? "Match your finish for nicks & scratches — we recommend one on every order."
                        : rec.kind === "roll-out-tray"
                          ? "Pull-out shelves make your base cabinets easier to reach."
                          : rec.kind === "end-panel"
                            ? "Cover an exposed cabinet side or island end with a decorative panel that matches your door style."
                            : "A crown profile across the top of your wall cabinets gives the run a finished, built-in look."}
                    </div>
                    <Button
                      size="sm"
                      className="h-7 w-full gap-1.5 text-xs"
                      onClick={() => {
                        addAddOn(row!);
                        toast.success(t("dt_toast_added_to_sheet", { code: row!.masterCode }));
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> {t("dt_add")} {row!.masterCode}
                    </Button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Total */}
          <div className="p-3 border-t border-border">
            {hasConflicts && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-[11px] text-red-700">
                <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-600" />
                <span>
                  <strong>{conflictUids.size} item{conflictUids.size > 1 ? "s" : ""} in conflict.</strong>{" "}
                  {blindViolationUids.size > 0
                    ? `A blind corner needs a 3" filler — pull the adjacent cabinet at least 3" off the corner. `
                    : ""}
                  {rangeClearanceUids.size > 0
                    ? `A range/oven in the corner needs a ${RANGE_CLEARANCE_FILLER_IN}" filler beside it so the range handle clears the cabinet handle. `
                    : ""}
                  {wallOpeningUids.size > 0
                    ? `A wall cabinet is within ${WALL_OPENING_CLEARANCE_IN}" of a door or window — wall cabinets must stay at least ${WALL_OPENING_CLEARANCE_IN}" away from openings. `
                    : ""}
                  {blindMissingSpecCount > 0
                    ? `${blindMissingSpecCount} blind corner cabinet${blindMissingSpecCount > 1 ? "s" : ""} ${blindMissingSpecCount > 1 ? "have" : "has"} no manufacturer pull spec — an administrator must enter the min/max pull before this design can be ordered. `
                    : ""}
                  {blindOutOfRangeCount > 0
                    ? `${blindOutOfRangeCount} blind corner cabinet${blindOutOfRangeCount > 1 ? "s" : ""} ${blindOutOfRangeCount > 1 ? "are" : "is"} pulled outside the manufacturer's min/max range. `
                    : ""}
                  An appliance running into a cabinet, or a blind corner without its 3" pull, must be fixed before ordering.
                </span>
              </div>
            )}
            {rangeClearanceUids.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 w-full gap-2 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300"
                onClick={addClearanceFiller}
              >
                <Plus className="h-4 w-4" /> {t("dt_bs_add_clearance", { n: RANGE_CLEARANCE_FILLER_IN })}
              </Button>
            )}
            {(() => {
              // Non-blocking informational notes are tucked behind a small info
              // icon next to the Estimated Total so the panel stays uncluttered.
              // Clicking the icon opens a popover with the list. The blocking
              // conflict warning + range-clearance button (above) and the
              // Estimated Total + CTAs (below) always stay visible inline.
              const noteItems: React.ReactNode[] = [];
              if (!styleId && placed.length > 0) {
                noteItems.push(
                  <p key="select" className="text-[11px] text-amber-600">{t("dt_bs_select_style_pricing")}</p>,
                );
              }
              if (styleId && activeStyleName && !designIsMixedFinish) {
                noteItems.push(
                  <div key="finish" className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-sm border"
                      style={{ background: activeFinish.face, borderColor: activeFinish.edge }}
                    />
                    {t("dt_bs_finish_applied")} <span className="font-medium text-foreground">{activeStyleName}</span>
                  </div>,
                );
              }
              if (styleId && designIsMixedFinish && finishSummary.length > 0) {
                noteItems.push(
                  <div key="twotone" className="text-[11px] text-muted-foreground">
                    <div className="mb-1">
                      {t("dt_bs_two_tone")} <span className="font-medium text-foreground">{t("dt_bs_n_finishes", { n: finishSummary.length })}</span>:
                    </div>
                    <div className="flex flex-col gap-1">
                      {finishSummary.map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2">
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-sm border"
                            style={{ background: f.face, borderColor: f.edge }}
                          />
                          <span className="font-medium text-foreground">{f.name}</span>
                          {i === 0 && <span className="text-[10px] text-muted-foreground">{t("dt_bs_design_default")}</span>}
                        </div>
                      ))}
                    </div>
                  </div>,
                );
              }
              if (hickorySkins.length > 0) {
                noteItems.push(
                  <div key="hickory" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span>
                      <strong>Hickory exposed ends:</strong> {hickorySkins.length} finished-end skin{hickorySkins.length > 1 ? "s" : ""} auto-added to your build sheet to cover the unfinished side{hickorySkins.length > 1 ? "s" : ""} of your Hickory cabinets. Skin pricing is confirmed by our team (SKU pending), so it is not included in the estimate yet.
                    </span>
                  </div>,
                );
              }
              if (autoEndPanels.length > 0) {
                noteItems.push(
                  <div key="endpanels" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span>
                      <strong>Exposed ends:</strong> {autoEndPanels.length} finished end panel{autoEndPanels.length > 1 ? "s" : ""} auto-added to your build sheet to cover the exposed cabinet side{autoEndPanels.length > 1 ? "s" : ""}.{autoEndPanels.some((p) => p.pendingSku) ? " Some panel SKUs are pending team confirmation and are not yet priced in the estimate." : ""}
                    </span>
                  </div>,
                );
              }
              return (
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-muted-foreground">{t("dt_bs_estimated_total")}</span>
                    {noteItems.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("dt_bs_notes_view")}
                            title={t("dt_bs_notes_view")}
                            className="relative inline-flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
                          >
                            <Info className="h-4 w-4" />
                            <span className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
                              {noteItems.length}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 max-h-80 overflow-y-auto">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t("dt_bs_notes_popover")}
                          </div>
                          <div className="flex flex-col gap-2">{noteItems}</div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <span className="font-serif text-2xl font-bold text-foreground">${total.toFixed(2)}</span>
                </div>
              );
            })()}
            <Button
              className="w-full bg-[#1a2744] text-white hover:bg-[#1a2744]/90 gap-2"
              disabled={placed.length === 0}
              onClick={() => {
                if (hasConflicts && !window.confirm(
                  t("dt_confirm_export_conflicts", { n: conflictUids.size, s: conflictUids.size > 1 ? "s" : "" })
                )) return;
                exportBuildSheet({ room, styleName: activeStyleName, tier, total, buildRows, extraLines });
              }}
            >
              <Download className="h-4 w-4" /> {t("dt_bs_export_csv")}
            </Button>
            <Button
              variant="outline"
              className="w-full mt-2 gap-2 border-[#a87f33] text-[#7a5c24] hover:bg-[#a87f33]/10"
              onClick={() => setProDesignerOpen(true)}
            >
              <UserRound className="h-4 w-4" /> {t("dt_bs_get_pro")}
            </Button>
            {countertop && counter && counter.squareFeet > 0 && (
              <Button
                variant="outline"
                className="w-full mt-2 gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
                onClick={() => setQuoteOpen(true)}
              >
                <Square className="h-4 w-4" /> {t("dt_bs_request_ct_quote")}
              </Button>
            )}

            {countertop && (
              <div className="mt-4 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground mb-2">{t("dt_bs_countertop_material")}</p>
                <Select value={countertopMaterialId} onValueChange={setCountertopMaterialId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t("dt_bs_select_material")} />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTERTOP_MATERIALS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 rounded shrink-0"
                            style={{
                              background: m.fill,
                              border: `1px solid ${m.edge}`,
                              backgroundImage: m.speckle ? `radial-gradient(${m.speckle} 0.5px, transparent 0.6px)` : undefined,
                              backgroundSize: m.speckle ? "6px 6px" : undefined,
                            }}
                          />
                          {m.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <p className="text-xs font-semibold text-foreground mt-3 mb-2">{t("dt_bs_add_sink")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SINK_PRESETS) as SinkType[]).map((st) => (
                    <Button key={st} variant="outline" size="sm" className="h-8 text-[11px] justify-start gap-1.5" onClick={() => addSink(st)}>
                      <Plus className="h-3 w-3" /> {SINK_PRESETS[st].name}
                    </Button>
                  ))}
                </div>

                {sinks.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {sinks.map((s) => (
                      <div key={s.uid} className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[11px] ${s.uid === selectedSinkUid ? "border-[#1a2744] bg-muted/40" : "border-border"}`}>
                        <button className="flex-1 text-left truncate" onClick={() => setSelectedSinkUid(s.uid)}>
                          {SINK_PRESETS[s.type].name}
                        </button>
                        <label className="flex items-center gap-1 text-muted-foreground cursor-pointer">
                          <input type="checkbox" checked={s.faucet} onChange={() => toggleSinkFaucet(s.uid)} className="h-3 w-3" />
                          {t("dt_bs_faucet")}
                        </label>
                        <button className="text-destructive" title={t("dt_bs_remove")} onClick={() => deleteSink(s.uid)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2">{t("dt_bs_sink_tip")}</p>
              </div>
            )}
          </div>
        </PricingShell>
      </div>

      {/* Mobile bottom toolbar — core actions; side panels open as drawers. */}
      {isMobile && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="grid grid-cols-5 h-14">
            <MobileBarButton
              icon={<Boxes className="h-5 w-5" />}
              label="Catalog"
              onClick={() => setMobilePanel("catalog")}
            />
            <MobileBarButton
              icon={viewMode === "elevation" ? <LayoutGrid className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              label={viewMode === "elevation" ? "Plan" : "Front"}
              onClick={() => setViewMode((m) => (m === "elevation" ? "plan" : "elevation"))}
            />
            <MobileBarButton
              icon={<RotateCw className="h-5 w-5" />}
              label="Rotate"
              disabled={!selectedUid || measureMode}
              onClick={rotateSelected}
            />
            <MobileBarButton
              icon={<Trash2 className="h-5 w-5" />}
              label="Delete"
              disabled={!selectedUid || measureMode}
              danger
              onClick={deleteSelected}
            />
            <MobileBarButton
              icon={<ShoppingCart className="h-5 w-5" />}
              label="Cart"
              badge={placed.length || undefined}
              onClick={() => setMobilePanel("cart")}
            />
          </div>
        </div>
      )}

      {counter && (
        <CountertopQuoteDialog
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
          squareFeet={counter.squareFeet}
          linearFeet={counter.linearFeet}
          hasIsland={counter.hasIsland}
          defaultEmail={verifiedEmail}
          defaultName={verifiedName}
          defaultPhone={verifiedPhone}
          roomData={room}
          placedCabinets={placed}
        />
      )}
      <ProDesignerDialog
        open={proDesignerOpen}
        onOpenChange={setProDesignerOpen}
        defaultName={verifiedName}
        defaultEmail={verifiedEmail}
        defaultPhone={verifiedPhone}
        designId={loadDesignId ?? undefined}
        designName={savedDesign?.name ?? null}
      />

      {/* Right-click per-cabinet attributes editor */}
      <CabinetAttributesDialog
        cabinet={attrUid ? placed.find((p) => p.uid === attrUid) ?? null : null}
        open={attrOpen}
        onOpenChange={setAttrOpen}
        customFee={CUSTOM_SIZE_FEE}
        onSetWidth={(_uid, v) => setCustomWidth(v)}
        onSetHeight={(_uid, v) => setCustomHeight(v)}
        onSetDepth={(_uid, v) => setCustomDepth(v)}
        onResetSize={() => { resetWidth(); resetHeight(); resetDepth(); }}
        onSetSwing={setSwingFor}
        onSetNoDoor={setNoDoorFor}
        onSetHandleSide={setHandleSideFor}
        onSetRollout={setRolloutFor}
        rolloutAvailable={!!addOnRowFor("roll-out-tray")}
      />

      {/* AI Design Consultant slide-in panel */}
      {consultOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setConsultOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-card shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#d4a75a]" />
                <div>
                  <h2 className="font-serif text-sm font-bold text-foreground leading-tight">{t("dt_bs_consultant")}</h2>
                  <p className="text-[10px] text-muted-foreground">
                    {roomType === "closet" ? "Closet" : "Kitchen"} · walls: {consultWalls.map((w) => `${w.label} ${Math.round(w.lengthInches)}"`).join(" · ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConsultOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("dt_bs_close_consultant")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <AIChatBox
                messages={consultMessages}
                onSendMessage={sendConsult}
                isLoading={consultMutation.isPending}
                height="100%"
                placeholder={`Describe what you want on a wall (e.g. "fill the ${consultWalls[0]?.label ?? "back"} wall with base cabinets and leave room for a sink")`}
                emptyStateMessage="Tell me about the wall you're designing and what you'd like on it. I'll lay it out using real cabinets from your catalog — then you can drag, swap, or delete anything."
                suggestedPrompts={
                  roomType === "closet"
                    ? [
                        "Fill the back wall with hanging space on the left and drawers on the right",
                        "Give me a reach-in closet with shelves and a drawer bank",
                      ]
                    : [
                        "Fill the back wall with base cabinets and leave room for a sink",
                        "Design a kitchen wall with a 30-inch range opening in the middle",
                      ]
                }
              />
            </div>
            <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
              Suggestions use real catalog cabinets and your marked wall sizes. Everything placed is fully editable.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mobile bottom-bar button ───────────────────────────────────────────────
function MobileBarButton({
  icon, label, onClick, disabled, danger, badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors active:scale-95 disabled:opacity-40 ${
        danger ? "text-destructive" : "text-foreground"
      }`}
    >
      <span className="relative">
        {icon}
        {badge != null && (
          <span className="absolute -right-2 -top-1.5 min-w-4 h-4 px-1 rounded-full bg-[#1a2744] text-white text-[9px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

// ─── Mobile-aware column shells ─────────────────────────────────────────────
// Each renders its children inline as a fixed-width desktop column, or inside a
// slide-in Sheet on mobile, so the heavy palette / pricing markup is written
// once and reused for both layouts.
function PaletteShell({
  isMobile, open, onOpenChange, children,
}: {
  isMobile: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0 gap-0 flex flex-col">
          <SheetHeader className="px-3 py-2 border-b border-border text-left">
            <SheetTitle className="text-sm">{t("dt_pl_catalog")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <div className="hidden lg:flex w-60 shrink-0 border-r border-border bg-card flex-col">
      {children}
    </div>
  );
}

function PricingShell({
  isMobile, open, onOpenChange, children,
}: {
  isMobile: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[82vh] p-0 gap-0 flex flex-col rounded-t-2xl">
          <SheetHeader className="px-3 py-2 border-b border-border text-left">
            <SheetTitle className="text-sm">{t("dt_bs_estimate_build")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <div className="hidden lg:flex w-72 shrink-0 border-l border-border bg-card flex-col">
      {children}
    </div>
  );
}

// Collapsible section used inside the Estimate & Build Sheet panel. Works the
// same in the desktop sidebar and the mobile drawer (both render the same
// children). The Estimated Total + Export CTA are intentionally NOT wrapped in
// this so they always stay visible.
function SheetSection({
  title, count, collapsed, onToggle, children, className,
}: {
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
          {typeof count === "number" && count > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground/70">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
