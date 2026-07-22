import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useCart, type CartItem } from "@/contexts/CartContext";
import {
  LayoutGrid, Eye, Trash2, RotateCw, Search, Plus,
  DollarSign, PanelTop, Columns3, Ruler, Square, DoorOpen,
  Boxes, ShoppingCart, MoreHorizontal, Lock, LockOpen, Wand2, X, Sparkles,
  ChevronUp, ChevronDown, ChevronsDown, Check, ScanLine, Printer, Palette, Minus, UserRound, Info,
  ChevronRight, Wrench, Crown as CrownIcon, Pencil,
  Save, FolderOpen, Refrigerator, Waves, Percent, StickyNote, Undo2, Redo2, FileText, SquareDashedMousePointer,
  Flame, Zap, Droplets, Building2, Download, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Move } from "lucide-react";
import { useUndoRedo } from "@/hooks/useUndoRedo";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { styleDisplayName } from "@/lib/styleDisplayName";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PlacedCabinet, RoomData, DEFAULT_ROOM, DesignCabinet,
  dim, footprintDepth, makeUid, STD, rotatedSize, nextFreeSpot, standardHeight, dimLabel, placedHeight, isCustomWidth, isCustomHeight, isCustomDepth, isCustomSize, customSizeNote, customSizeFee, CUSTOM_SIZE_FEE,
  normalizeLCornerDepths,
  conflictingUids, blindCornerViolations, blindCornerSpecViolations, ceilingFitViolations, roomCeiling, inchesToFeetInches, isBlindCorner, blindCornerAutoFiller, blindPullRange, isOnIsland, isCornerCabinet, isAngledWallCabinet, missingCornerBaseViolations,
  isSinkBaseCabinet, placedFootprint, effectiveStyleId, distinctStyleIds, isMixedFinish,
  isPlaceableAccessory, accessoryPlacement, isPanelItem,
  resolveSwing, cycleSwing, swingText, hasDoorSwing, DoorSwing,
  // (closet helpers imported separately below)
  APPLIANCES, applianceAsDesignCabinet, appliancesForRoom, ROOM_TYPES, type RoomType,
  FURNITURE_CATALOG, makeFurniture, furnitureFootprint, type PlacedFurniture,
  WallOpening, WallSide, OPENINGS, OpeningDef, makeOpening,
  finishColors, crownLinearInches, toeKickLinearInches, lightRailLinearInches, inchesToLinearFeet,
  trimPiecesNeeded, countertopArea, battenLinearInches, valancePiecesNeeded,
  COUNTERTOP_MATERIALS, DEFAULT_COUNTERTOP_MATERIAL_ID, countertopMaterial,
  EDGE_PROFILES, DEFAULT_EDGE_PROFILE_ID, edgeProfile,
  type PlanAnnotation, makeAnnotation,
  makeSink, SINK_PRESETS, type SinkFixture, type SinkType,
  snapToWall, snapPosition, nextFreeSpotOnWall,
  clampCabinetsToRoom, clampOpeningsToRoom, clampIslandToRoom,
  resizeRoomByWall, WALL_LABELS, doorPanelKind,
  freeSegmentsOnWall, wallPlacementAt, cabinetWall,
  formatInches, type WallGap, wallGaps, gapFillCandidatesByWidth,
  rangeOvenClearanceViolations, RANGE_CLEARANCE_FILLER_IN,
  wallOpeningClearanceViolations, WALL_OPENING_CLEARANCE_IN, baseOpeningOverlaps,
  elevationBox, isStacker, wallCabinetTopLine,
  isRangeOrOven, isOverRangeMicrowave, isRefrigerator,
  staggeredMountBottom, fridgeCornerUpperDepth, isDiagonalCorner,
  isApplianceCode,
  type PonyWall, makePonyWall, clampPonyWall,
} from "@/lib/design";
import {
  buildTrimCartLines,
  type ActiveTrim,
  type TrimPrice,
} from "@/lib/trimCart";
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
import { resolveTierPrice } from "@shared/pricingTier";
import { AIChatBox, type Message as AIMessage } from "@/components/AIChatBox";
import { PlanCanvas } from "@/components/design/PlanCanvas";
import { PolygonRoomEditor } from "@/components/design/PolygonRoomEditor";
import { ElevationView } from "@/components/design/ElevationView";
import { CornerView, type CornerId } from "@/components/design/CornerView";
import { IslandElevationView } from "@/components/design/IslandElevationView";
import { CsvImportDialog } from "@/components/design/CsvImportDialog";
import { EmailGate, type LeadContact } from "@/components/design/EmailGate";
import { DesignActions, type BuildSheetRow } from "@/components/design/DesignActions";
import { RoomSizeControl, RoomSizeInline } from "@/components/design/RoomSizeControl";
import { WallPicker } from "@/components/design/WallPicker";
import { OpeningSizeEditor } from "@/components/design/OpeningSizeEditor";
import { DesignHelp } from "@/components/design/DesignHelp";
import { CountertopQuoteDialog } from "@/components/design/CountertopQuoteDialog";
import { SurfacesPickerDialog, type SelectedSurface } from "@/components/design/SurfacesPickerDialog";
import { RecommendedSurfaces } from "@/components/design/RecommendedSurfaces";
import {
  takeSurfaceHandoff,
  guessFlooringMaterialId,
  guessBacksplashMaterialId,
  guessCountertopMaterialId,
  type SurfaceRole,
} from "@/lib/surfaceSelection";
import { ProDesignerDialog } from "@/components/design/ProDesignerDialog";
import { CabinetDrawing } from "@/components/CabinetDrawing";
import { baseSubGroup, cabinetDrawingType, type BaseSubGroup } from "@/lib/cabinetGraphics";
import { CabinetImage } from "@/components/CabinetImage";
import { DoorStyleSwatch } from "@/components/DoorStyleSwatch";
import { ColorSlotButton } from "@/components/design/ColorSlotButton";
import { CabinetAttributesDialog } from "@/components/design/CabinetAttributesDialog";
import { RefrigeratorOptionsDialog } from "@/components/design/RefrigeratorOptionsDialog";
import { RollOutTrayPicker } from "@/components/design/RollOutTrayPicker";
import { DoorDrawerDiagram } from "@/components/design/DoorDrawerDiagram";
// PhotorealPreview removed — replaced by deterministic preview modes
import type { PhotorealSceneInput } from "@/components/design/PhotorealPreview";
import { DesignPreviewModal } from "@/components/design/DesignPreviewModal";
import { PelicanCountertopPicker, PelicanSinkPicker } from "@/components/design/PelicanProductPickers";


import { buildSurfaceCartLines } from "@/lib/surfaceCartLines";
import { surfaceRole, formatPrice } from "@/lib/pelican";
import { buildRollOutLines, type TrayOptionForStyle, type TrayPlaced } from "@/lib/rollOutTrayMatch";
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

type ViewMode = "plan" | "elevation" | "split" | "corner" | "island";
type PricingTier = "Wholesale" | "Contractor" | "Homeowner";

// Map the Design Tool's title-case tier onto the shared lowercase pricing tier
// used across the storefront, so the same resolution + fallbacks apply here.
const DESIGN_TIER_TO_SHARED: Record<PricingTier, "wholesale" | "contractor" | "homeowner"> = {
  Wholesale: "wholesale",
  Contractor: "contractor",
  Homeowner: "homeowner",
};

function priceOf(
  row: {
    wholesalePrice: string | null;
    contractorPrice: string | null;
    homeownerPrice?: string | null;
    adjustedListPrice?: string | null;
    listPrice?: string | null;
  },
  tier: PricingTier,
): number {
  return resolveTierPrice(DESIGN_TIER_TO_SHARED[tier], row) ?? 0;
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

  const search = useSearch();
  // Optional saved design to load (?load=<designId>), e.g. from a CRM deal's
  // "Linked Designs" list. Loads the saved room + placed cabinets + style.
  const loadDesignId = useMemo(() => {
    const v = new URLSearchParams(search).get("load");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [search]);
  // Optional door style to pre-select (?style=<styleId>), e.g. from a "Design
  // with this" CTA on the homepage or a door style product page.
  const preloadStyleId = useMemo(() => {
    const v = new URLSearchParams(search).get("style");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [search]);
  const loadedDesignRef = useRef<number | null>(null);
  const canvasExportRef = useRef<HTMLDivElement>(null);
  // Auto-save draft: flips true once we've attempted to restore a saved draft,
  // so the debounced save effect doesn't overwrite the stored draft with the
  // initial empty state before restore runs.
  const draftRestoredRef = useRef(false);
  // Ensures the Surfaces & Fixtures wizard hand-off (cd_surface_selection) is
  // consumed exactly once per session after email verification.
  const surfaceSelectionAppliedRef = useRef(false);
  const { data: savedDesign } = trpc.design.byId.useQuery(
    { id: loadDesignId ?? 0 },
    { enabled: loadDesignId != null && verified, retry: 1 }
  );

  // Mobile layout: which slide-up panel is open (catalog picker or cart/BOM).
  // Designer is touch-first: treat anything narrower than a small laptop (1024px)
  // as "mobile" so tablets, foldables, and phones in desktop-site mode still get
  // the single-column UI with the bottom toolbar + drawers (never the cramped
  // 3-column desktop view).
  const isMobile = useIsMobile(1024);
  const [, navigate] = useLocation();
  const { addItem, clear: clearCart, lockedDistributorId: cartLockedDistributorId, lockedStyleLabel: cartLockedStyleLabel } = useCart();
  const [mobilePanel, setMobilePanel] = useState<null | "catalog" | "cart" | "style" | "room">(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("panel");
    return p === "catalog" || p === "cart" || p === "style" || p === "room" ? p : null;
  });

  // Room + placement state
  const [room, setRoom] = useState<RoomData>(DEFAULT_ROOM);
  const [polygonEditMode, setPolygonEditMode] = useState(false);
  const isPolygonRoom = !!(room.vertices && room.vertices.length >= 3);
  const [placed, setPlaced] = useState<PlacedCabinet[]>([]);
  // ── Undo / Redo for placed cabinets ──────────────────────────────────────
  const undoRedo = useUndoRedo<PlacedCabinet[]>();
  const undoRedoRef = useRef(undoRedo);
  undoRedoRef.current = undoRedo;
  // Push a snapshot whenever `placed` changes (debounced to coalesce rapid updates).
  const lastPushedRef = useRef<PlacedCabinet[] | null>(null);
  useEffect(() => {
    // Skip the initial empty array push if we haven't placed anything yet.
    if (placed === lastPushedRef.current) return;
    lastPushedRef.current = placed;
    undoRedoRef.current.push(placed);
  }, [placed]);
  const handleUndo = useCallback(() => {
    const prev = undoRedoRef.current.undo();
    if (prev) { lastPushedRef.current = prev; setPlaced(prev); }
  }, []);
  const handleRedo = useCallback(() => {
    const next = undoRedoRef.current.redo();
    if (next) { lastPushedRef.current = next; setPlaced(next); }
  }, []);
  // Keyboard shortcut: Ctrl+Z / Ctrl+Y (or Cmd on Mac)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when focus is inside a form field.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);
  // Manual ordering override for the BOM shopping list. Maps group key → position
  // index within its section. Populated when the user clicks move-up/move-down.
  const [bomOrder, setBomOrder] = useState<Record<string, number>>({});
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "front" ? "elevation" : v === "split" ? "split" : v === "corner" ? "corner" : v === "island" ? "island" : "plan";
  });
  // Which corner the corner-view camera stands in.
  const [corner, setCorner] = useState<CornerId>("top-left");
  // Which face of the island to show in Island view (front = near top wall, back = near bottom wall).
  const [islandFace, setIslandFace] = useState<"front" | "back">("front");
  const [showWallLayer, setShowWallLayer] = useState(true);
  const [measureMode, setMeasureMode] = useState(false);
  const [autoDimensions, setAutoDimensions] = useState(false);
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
  const [valance, setValance] = useState(false);
  // Which trims the user has explicitly set (so auto-apply leaves them alone).
  const trimOverride = useRef<{ crown: boolean; toeKick: boolean; batten: boolean; lightRail: boolean; valance: boolean }>({
    crown: false, toeKick: false, batten: false, lightRail: false, valance: false,
  });
  // Manual piece-count overrides per trim. undefined = use the auto-calculated
  // stick count; a number = the user explicitly set how many sticks to order.
  type TrimKind = "crown" | "toeKick" | "batten" | "lightRail" | "valance";
  const [trimQtyOverride, setTrimQtyOverride] = useState<Partial<Record<TrimKind, number>>>({});
  // Countertop tool: measures base + island runs; not auto-priced (quote request).
  const [countertop, setCountertop] = useState(false);
  // Countertop material: when set, a visible slab is drawn over base cabinets.
  const [countertopMaterialId, setCountertopMaterialId] = useState<string>(DEFAULT_COUNTERTOP_MATERIAL_ID);
  // Countertop edge profile: decorative edge for fabricator quote.
  const [edgeProfileId, setEdgeProfileId] = useState<string>(DEFAULT_EDGE_PROFILE_ID);
  // Sink + faucet fixtures placed on the counter.
  const [sinks, setSinks] = useState<SinkFixture[]>([]);
  const [selectedSinkUid, setSelectedSinkUid] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [proDesignerOpen, setProDesignerOpen] = useState(false);
  const [surfacesOpen, setSurfacesOpen] = useState(false);
  const [selectedSurfaces, setSelectedSurfaces] = useState<SelectedSurface[]>([]);
  const toggleSurface = (item: SelectedSurface) =>
    setSelectedSurfaces((prev) =>
      prev.some((s) => s.id === item.id)
        ? prev.filter((s) => s.id !== item.id)
        : [...prev, item]
    );
  // Recommended-surface picker (Surfaces palette tab): toggle the exact Pelican
  // product in selectedSurfaces (so it hits the cart + satisfies the 3D View
  // gate), and for flooring/backsplash/countertop ALSO drive the built-in 2D
  // material id so the plan/elevation render updates to a representative texture.
  const addRecommendedSurface = (
    item: SelectedSurface,
    role: "flooring" | "backsplash" | "countertop" | "sink" | "faucet" | "range-top"
  ) => {
    const already = selectedSurfaces.some((s) => s.id === item.id);
    toggleSurface(item);
    if (already) return; // removal: leave the 2D material as-is (harmless)
    const pick = {
      id: item.id,
      slug: item.slug,
      name: item.name,
      category: item.category,
      subCategory: item.subCategory ?? null,
      size: item.size ?? null,
      imageUrl: item.imageUrl ?? null,
      sellPrice: item.sellPrice,
    };
    if (role === "flooring") {
      const id = guessFlooringMaterialId(pick);
      if (id) setFlooringMaterialId(id);
    } else if (role === "backsplash") {
      const id = guessBacksplashMaterialId(pick);
      if (id) setBacksplashMaterialId(id);
    } else if (role === "countertop") {
      const id = guessCountertopMaterialId(pick);
      if (id) setCountertopMaterialId(id);
      setCountertop(true);
    }
    toast.success(`${item.name} added`);
  };
  // Re-derive the built-in 2D-render material ids (flooring / backsplash /
  // countertop) from a set of Pelican surface picks. Used when RESTORING a
  // design (saved-design load or draft restore) so the plan/elevation fill
  // matches the persisted picks, mirroring what addRecommendedSurface does live.
  // Kept as a stable persistent fn so it can be safely called from useCallbacks
  // and effects without churning their dependency arrays.
  const applySurfaceRenderMaterials = usePersistFn((surfaces: SelectedSurface[]) => {
    for (const su of surfaces) {
      const role = surfaceRole(su);
      if (role === "flooring") {
        const id = guessFlooringMaterialId(su);
        if (id) setFlooringMaterialId(id);
      } else if (role === "backsplash") {
        const id = guessBacksplashMaterialId(su);
        if (id) setBacksplashMaterialId(id);
      } else if (role === "countertop") {
        const id = guessCountertopMaterialId(su);
        if (id) setCountertopMaterialId(id);
        setCountertop(true);
      }
    }
  });
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
  // Palette filters
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteType, setPaletteType] = useState<"base" | "vanity" | "corner" | "wall" | "wallht" | "tall" | "appliance" | "opening" | "closetparts" | "accessory" | "furniture" | "surfaces">("base");
  const [furniture, setFurniture] = useState<PlacedFurniture[]>([]);
  const [selectedFurnUid, setSelectedFurnUid] = useState<string | null>(null);
  // Text annotations placed on the floor plan.
  const [annotations, setAnnotations] = useState<PlanAnnotation[]>([]);
  const [selectedAnnotationUid, setSelectedAnnotationUid] = useState<string | null>(null);
  // Pony walls — free-standing half-walls (34.5" tall) placed on the floor plan.
  const [ponyWalls, setPonyWalls] = useState<PonyWall[]>([]);
  const [selectedPonyWallUid, setSelectedPonyWallUid] = useState<string | null>(null);
  // Backsplash material: shown in elevation view between countertop and wall cabinets.
  const [backsplashMaterialId, setBacksplashMaterialId] = useState<string | null>(null);
  // Flooring material: shown as a pattern in the bird's-eye plan view.
  const [flooringMaterialId, setFlooringMaterialId] = useState<string | null>(null);
  // Cabinet lock: when true, placed cabinets cannot be moved, deleted, or have
  // new ones dropped. The room/walls/openings/island are still editable.
  const [cabinetsLocked, setCabinetsLocked] = useState(false);
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
  // When the user explicitly overrides the distributor lock (acknowledging extra
  // shipping), this flag prevents the auto-lock effect from re-engaging.
  const [mixedWarehouseOverride, setMixedWarehouseOverride] = useState(false);
  // Decorative hardware spec (knobs / pulls / cup pulls). A finishing choice,
  // not a priced catalog SKU: it draws on the fronts and lists a piece count on
  // the build sheet as a note. Defaults to "none".
  const [hardwareStyleId, setHardwareStyleId] = useState<HardwareStyleId>(DEFAULT_HARDWARE_STYLE_ID);

  // Wall cabinet height room setting: 42", 36", or 30" (default). This is a
  // room-level preference that determines the height of wall cabinets placed
  // via the "Place matching wall cabinet above?" suggestion. A one-time prompt
  // asks the user to choose on their first base cabinet placement.
  const [wallCabHeight, setWallCabHeight] = useState<30 | 36 | 42>(30);
  const wallCabHeightPromptedRef = useRef(false);
  // Ref mirrors wallCabHeight so the stable addCabinet callback can read the
  // latest value without re-creating on every change.
  const wallCabHeightRef = useRef<30 | 36 | 42>(30);
  useEffect(() => { wallCabHeightRef.current = wallCabHeight; }, [wallCabHeight]);

  // Data — door-style-first: members pick a door style; the supply line behind
  // it is resolved server-side and never shown.
  const { data: doorStyles } = trpc.doorStyles.list.useQuery();
  // Neutral, customer-safe distributor labels (white-label safe) used to group the
  // door-style picker by supply line. Never carries the hidden supplier brand.
  const { data: distributorLabels } = trpc.distributors.list.useQuery();
  // The distributor (supply line) behind the currently selected style.
  const selectedStyleDistributorId = useMemo(() => {
    const s = (doorStyles ?? []).find(
      (d) => (d as { id: number }).id === styleId
    ) as { distributorId?: number } | undefined;
    return s?.distributorId ?? null;
  }, [doorStyles, styleId]);
  // Two-tone supply-line check: when both Color 1 (slot A) and Color 2 (slot B)
  // are chosen, compare the distributor (supply line) behind each. If they don't
  // share a supply line, the two colors ship from different suppliers, which
  // adds freight — surface a non-blocking warning so the member can stay within
  // one family if they prefer.
  const twoToneCrossDistributor = useMemo(() => {
    if (styleA == null || styleB == null) return false;
    const source = (doorStyles ?? []) as Array<{ id: number; distributorId?: number }>;
    const distA = source.find((d) => d.id === styleA)?.distributorId ?? null;
    const distB = source.find((d) => d.id === styleB)?.distributorId ?? null;
    if (distA == null || distB == null) return false;
    return distA !== distB;
  }, [doorStyles, styleA, styleB]);
  // De-duplicate by display name so the same style isn't listed once per line.
  // When locked, only offer styles from the locked distributor so changing the
  // finish never silently switches supply lines.
  const uniqueDoorStyles = useMemo(() => {
    const map = new Map<string, { id: number; ourName: string | null; aliasName?: string | null; thumbnailImageUrl?: string | null; doorSampleImageUrl?: string | null; distributorId?: number; styleCode?: string | null }>();
    const source = (doorStyles ?? []) as Array<{
      id: number;
      ourName: string | null;
      aliasName?: string | null;
      thumbnailImageUrl?: string | null;
      doorSampleImageUrl?: string | null;
      distributorId?: number;
      styleCode?: string | null;
    }>;
    const scoped =
      lockedDistributorId != null
        ? source.filter((s) => s.distributorId === lockedDistributorId)
        : source;
    // De-dup by name WITHIN each distributor (key includes distributorId), so two
    // supply lines that happen to share a style name (e.g. both have "Air White")
    // each keep their own entry instead of one silently shadowing the other.
    for (const s of scoped) {
      const key = `${s.distributorId ?? "_"}::${(styleDisplayName(s) || String(s.id)).toLowerCase()}`;
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a, b) => (styleDisplayName(a) || "").localeCompare(styleDisplayName(b) || ""));
  }, [doorStyles, lockedDistributorId]);

  // Color 2 (slot B) must come from the same distributor as Color 1 (slot A).
  // Build a filtered list scoped to that distributor so the picker only shows
  // compatible options. Falls back to the full uniqueDoorStyles list when
  // Color 1 has no distributor association (e.g. no style selected yet).
  const slotBStyles = useMemo(() => {
    if (styleA == null) return uniqueDoorStyles;
    const source = (doorStyles ?? []) as Array<{ id: number; ourName: string | null; aliasName?: string | null; thumbnailImageUrl?: string | null; doorSampleImageUrl?: string | null; distributorId?: number; styleCode?: string | null }>;
    const distA = source.find((d) => d.id === styleA)?.distributorId ?? null;
    if (distA == null) return uniqueDoorStyles;
    // Filter to same distributor, then de-duplicate by name (same as uniqueDoorStyles).
    const map = new Map<string, { id: number; ourName: string | null; aliasName?: string | null; thumbnailImageUrl?: string | null; doorSampleImageUrl?: string | null; distributorId?: number; styleCode?: string | null }>();
    for (const s of source.filter((s) => s.distributorId === distA)) {
      const key = (styleDisplayName(s) || String(s.id)).toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a, b) => (styleDisplayName(a) || "").localeCompare(styleDisplayName(b) || ""));
  }, [doorStyles, styleA, uniqueDoorStyles]);
  const { data: paletteCabinets, isLoading: paletteLoadingRaw } =
    trpc.design.placeableCabinets.useQuery(
      {
        placement:
          paletteType === "appliance" || paletteType === "opening" || paletteType === "closetparts" || paletteType === "furniture" || paletteType === "surfaces"
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
      { enabled: paletteType !== "appliance" && paletteType !== "opening" && paletteType !== "closetparts" && paletteType !== "furniture" && paletteType !== "surfaces" }
    );
  const paletteLoading = paletteType === "appliance" || paletteType === "opening" || paletteType === "closetparts" || paletteType === "furniture" || paletteType === "surfaces" ? false : paletteLoadingRaw;

  // A dedicated, full base-cabinet list for the active line, used by the
  // Auto-Fill engine (independent of which palette tab/search is active).
  const { data: autoFillCabinets } = trpc.design.placeableCabinets.useQuery({
    placement: "base",
    styleId: styleId ?? undefined,
    distributorId: lockedDistributorId ?? undefined,
  });

  // Always-on wall cabinet pool for the "Place matching wall cabinet above?"
  // suggestion that fires after placing a base cabinet. Kept as a ref so the
  // stable addCabinet callback can read the latest data without re-creating.
  const { data: wallCabPool } = trpc.design.placeableCabinets.useQuery({
    placement: "wall",
    styleId: styleId ?? undefined,
    distributorId: lockedDistributorId ?? undefined,
  });
  const wallCabPoolRef = useRef<DesignCabinet[]>([]);
  useEffect(() => { wallCabPoolRef.current = (wallCabPool as DesignCabinet[] | undefined) ?? []; }, [wallCabPool]);

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
    // WD-* (tall 48"-60" diagonal corner wall cabinets) are vanity/bathroom
    // items — they do not belong in the Kitchen corner wall section.
    const code = (c.masterCode || "").toUpperCase();
    if (code.startsWith("WD-")) return false;
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
    // Wall-placement corner cabinets (DCW-*, WBC-*, WER-*, WD-*) must NOT be
    // classified as corner bases — they belong in the Corner Wall section.
    if (placement === "wall") return false;
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
      .filter((c) => matchesPaletteSearch(c, s));
  }, [paletteCabinets, cornerWallCabinets, paletteSearch, paletteType, appliancePalette, isCornerWall, isCornerBase, isVanity, closetGroups]);

  // Total cabinets available in the active style for the CURRENT tab, ignoring
  // the search box (so the hint reflects the real lineup size, not the filtered
  // view). Used to show "N cabinets available in <style>" so a smaller per-finish
  // lineup (e.g. Air Dawn) is obvious instead of looking "empty/broken".
  const availableInStyleCount = useMemo(() => {
    if (paletteType === "opening" || paletteType === "closetparts" || paletteType === "appliance" || paletteType === "furniture" || paletteType === "surfaces") {
      return null;
    }
    if (paletteType === "corner") {
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
      }).length;
    }
    const src = ((paletteCabinets as DesignCabinet[]) ?? []);
    return src.filter((c) => {
      if (paletteType === "wall" || paletteType === "wallht") return !isCornerWall(c);
      if (paletteType === "vanity") return isVanity(c);
      if (paletteType === "accessory") return true;
      if (paletteType === "base") return !isCornerBase(c) && !isVanity(c);
      return true;
    }).length;
  }, [paletteCabinets, cornerWallCabinets, paletteType, isCornerWall, isCornerBase, isVanity]);

  // Group the palette by cabinet height so wall cabinets (and others) are easy
  // to find by size — mirrors how pros scan 2020's catalog by height.
  const groupedPalette = useMemo(() => {
    // Stable small->large ordering inside every accordion section, so narrow
    // boxes (B12, B15) always lead and the list reads like a printed catalog.
    // Width can be a numeric string; unknown widths sink to the bottom.
    const wnum = (w: unknown) => {
      const n = parseFloat(String(w ?? ""));
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    };
    const byWidth = (a: DesignCabinet, b: DesignCabinet) => {
      const dw = wnum(a.width) - wnum(b.width);
      if (dw !== 0) return dw;
      return (a.masterCode || "").localeCompare(b.masterCode || "", undefined, { numeric: true });
    };
    const sortGroups = (gs: { label: string; items: DesignCabinet[] }[]) =>
      gs.map((g) => ({ ...g, items: [...g.items].sort(byWidth) }));
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
      return sortGroups(Array.from(bySub.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, items]) => ({ label, items })));
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
      return sortGroups(sections);
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
      return sortGroups(
        order
          .map(({ key, labelKey }) => ({ label: t(labelKey), items: buckets[key] }))
          .filter((g) => g.items.length > 0)
      );
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
    return sortGroups(Array.from(groups.entries())
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
      })));
  }, [filteredPalette, paletteType, paletteSearch, closetGroups, isCornerBase, t]);

  // Pricing for placed cabinets (appliances carry cabinetId 0 and are unpriced).
  const placedCabinetIds = useMemo(
    () =>
      Array.from(
        new Set(placed.map((p) => p.cabinetId).filter((id) => id > 0))
      ),
    [placed]
  );
  // TWO-TONE pricing: price each cabinet at its EFFECTIVE finish (per-cabinet
  // override, else the design default). Build the distinct (cabinetId, styleId)
  // pairs the design actually uses so we fetch every needed price in one call.
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
    placed.forEach((p) => {
      push(p.cabinetId, effectiveStyleId(p, styleId) ?? styleId);
      // Also fetch price for the GD variant if glassDoor is enabled.
      if (p.glassDoor) {
        const gdCode = p.masterCode + "GD";
        const gdCab = wallCabPoolRef.current.find((c) => c.masterCode === gdCode);
        if (gdCab) push(gdCab.id, effectiveStyleId(p, styleId) ?? styleId);
      }
    });
    return pairs;
  }, [placed, styleId]);

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
    (p: { masterCode: string; cabinetId: number; styleId?: number | null; glassDoor?: boolean }): number | null => {
      if (isClosetPart(p.masterCode)) return closetPartPrice(p.masterCode);
      if (!styleId) return null;
      const sid = effectiveStyleId(p, styleId) ?? styleId;
      // When glass door is enabled, look up the GD variant's price instead.
      if (p.glassDoor) {
        const gdCode = p.masterCode + "GD";
        const gdCab = wallCabPoolRef.current.find((c) => c.masterCode === gdCode);
        if (gdCab) {
          const gdPrice = priceMap.get(`${gdCab.id}:${sid}`);
          if (gdPrice != null) return gdPrice;
        }
      }
      const v = priceMap.get(`${p.cabinetId}:${sid}`);
      return v ?? null;
    },
    [priceMap, styleId]
  );

  const total = useMemo(
    () =>
      placed.reduce((sum, p) => {
        const base = unitPriceFor(p) ?? 0;
        const disc = p.discountPct ?? 0;
        return sum + base * (1 + disc / 100);
      }, 0) +
      placed.reduce((sum, p) => sum + customSizeFee(p), 0),
    [placed, unitPriceFor]
  );

  // ─── Per-cabinet roll-out shelves (add-on) → BOM / cart line items ───────────
  // Distinct effective door-style ids in the design (only cabinets that actually
  // carry roll-out shelves matter). We batch-fetch the available RS shelves for
  // those lines, then resolve + aggregate the shelf lines on the client with the
  // SAME rule the edit-panel picker uses, so the two never diverge. Shelves
  // never cross lines because we only match within a cabinet's own styleId.
  const rolloutStyleIds = useMemo(() => {
    if (!styleId) return [] as number[];
    const ids = new Set<number>();
    for (const p of placed) {
      if ((p.rolloutQty ?? 0) > 0) {
        const sid = effectiveStyleId(p, styleId) ?? styleId;
        if (sid != null) ids.add(sid);
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [placed, styleId]);

  const { data: rolloutTrayRows } = trpc.design.rollOutTraysForStyles.useQuery(
    { styleIds: rolloutStyleIds, distributorId: lockedDistributorId ?? undefined },
    { enabled: rolloutStyleIds.length > 0, staleTime: 60_000 }
  );

  // styleId -> available RS shelves in that line (priced at the active tier).
  const rolloutOptionsByStyle = useMemo(() => {
    const m = new Map<number, TrayOptionForStyle[]>();
    rolloutTrayRows?.forEach((r) => {
      const arr = m.get(r.styleId) ?? [];
      arr.push({
        cabinetId: r.cabinetId,
        masterCode: r.masterCode,
        width: r.width,
        styleId: r.styleId,
        description: r.description,
        unitPrice: priceOf(r, tier),
      });
      m.set(r.styleId, arr);
    });
    return m;
  }, [rolloutTrayRows, tier]);

  // Aggregated roll-out shelf lines for the whole design (same-line, summed qty).
  const rolloutLines = useMemo(() => {
    if (!styleId || rolloutStyleIds.length === 0) return [];
    const targets: TrayPlaced[] = placed.map((p) => ({
      placement: p.placement,
      category: p.category,
      subCategory: p.subCategory,
      masterCode: p.masterCode,
      numberOfDoors: p.numberOfDoors,
      // Placed items don't always carry the catalog corner flag; derive it from
      // the code/description so corners are reliably excluded.
      isCornerCabinet: isCornerCabinet(p.masterCode, p.description),
      nominalWidth: p.nominalWidth ?? null,
      width: p.width,
      effectiveStyleId: effectiveStyleId(p, styleId) ?? styleId,
      rolloutQty: p.rolloutQty ?? 0,
    }));
    return buildRollOutLines(targets, rolloutOptionsByStyle);
  }, [placed, styleId, rolloutStyleIds, rolloutOptionsByStyle]);

  // ─── Trim pricing (toe kick / light rail / batten) → BOM / cart ──────────────
  // Trim SKUs are per door style, so we fetch the priced trim rows for the
  // design's selected style and build a masterCode -> priced SKU map. Because the
  // map is scoped to styleId, any trim we price inherits the cabinets' finish.
  const trimStyleIds = useMemo(
    () => (styleId ? [styleId] : ([] as number[])),
    [styleId]
  );
  const { data: trimSkuRows } = trpc.design.trimSkusForStyles.useQuery(
    { styleIds: trimStyleIds, distributorId: lockedDistributorId ?? undefined },
    { enabled: trimStyleIds.length > 0, staleTime: 60_000 }
  );
  // masterCode -> tier-resolved priced trim SKU for the SELECTED style.
  const trimPriceByCode = useMemo(() => {
    const m = new Map<string, TrimPrice>();
    trimSkuRows?.forEach((r) => {
      if (styleId != null && r.styleId !== styleId) return;
      m.set(r.masterCode, {
        cabinetId: r.cabinetId,
        masterCode: r.masterCode,
        description: r.description,
        unitPrice: priceOf(r, tier),
      });
    });
    return m;
  }, [trimSkuRows, styleId, tier]);
  // NOTE: activeTrims + trimCartLines are defined lower down, after the trim
  // order memos (crownOrder/toeKickOrder/...) and activeStyleName they depend on.

  // Active finish: derived from the selected door style name so picking a trim
  // instantly re-skins the placed cabinets on the canvas + elevation.
  const activeStyleName = useMemo(() => {
    const s = doorStyles?.find((d) => d.id === styleId) as { ourName?: string | null; aliasName?: string | null } | undefined;
    return s ? (styleDisplayName(s) || null) : null;
  }, [doorStyles, styleId]);
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

  // NOTE: Only HICKORY ships with unfinished exposed ends that REQUIRE a skin
  // (handled by the hickorySkins engine above). Every other door style comes
  // with FINISHED ends, so nothing is auto-added for them. Decorative end
  // panels on finished-end styles are purely cosmetic and remain an OPTIONAL
  // choice the user can add from the catalog/accessories — never auto-added.
  // We keep this as an empty list so the build-sheet integration below stays
  // unchanged while no panels are forced onto non-Hickory designs.
  const autoEndPanels = useMemo<
    Array<{ code: string; cabinetId: number | null; description: string; height: number; depth: number; pendingSku: boolean }>
  >(() => [], []);

  // Restore a saved design (room + placed cabinets + style) onto the canvas.
  const loadSavedDesign = useCallback(
    (d: {
      room: RoomData;
      placed: PlacedCabinet[];
      styleId: number | null;
      roomType?: string | null;
      distributorId?: number | null;
      selectedSurfaces?: SelectedSurface[] | null;
    }) => {
      setRoom(d.room ?? DEFAULT_ROOM);
      // Normalize placement for appliance items — older saved designs may have
      // stored placement:"tall" for FRIDGE-* or RANGE-* items. Correct them here
      // so the elevation view renders them as plain steel boxes (no door lines).
      const rawPlaced = Array.isArray(d.placed) ? d.placed : [];
      const normalizedPlaced = rawPlaced.map((p) =>
        isApplianceCode(p.masterCode ?? "") && p.placement !== "appliance"
          ? { ...p, placement: "appliance" as const }
          : p
      );
      setPlaced(normalizeLCornerDepths(normalizedPlaced));
      setStyleId(d.styleId ?? null);
      // Restore the supply-line lock if the saved design was pinned to one.
      setLockedDistributorId(typeof d.distributorId === "number" ? d.distributorId : null);
      if (d.roomType && ["kitchen", "bathroom", "laundry", "closet", "other"].includes(d.roomType)) {
        setRoomType(d.roomType as RoomType);
      }
      // Restore the exact Pelican surface & fixture picks and re-sync the
      // built-in 2D-render materials (floor/backsplash/countertop) from them,
      // so a reloaded design shows the same surfaces in the cart, the 3D gate,
      // and the plan/elevation fill.
      const surfaces = Array.isArray(d.selectedSurfaces) ? d.selectedSurfaces : [];
      setSelectedSurfaces(surfaces);
      applySurfaceRenderMaterials(surfaces);
      setSelectedUid(null);
    },
    []
  );

  // Map of door-style id -> display name. Defined here (before buildRows) so the
  // export can label each line with its specific color/finish.
  const styleNameById = useMemo(() => {
    const m = new Map<number, string>();
    doorStyles?.forEach((d) => {
      const s = d as { id: number; ourName?: string | null; aliasName?: string | null };
      m.set(s.id, styleDisplayName(s) || s.ourName || `Style #${s.id}`);
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
      const discKey = p.discountPct ?? 0;
      const gdFlag = p.glassDoor ? "GD" : "";
      const key = `${p.masterCode}|${Math.round(p.width)}|${Math.round(placedHeight(p))}|${Math.round(p.depth)}|${sw}|${p.noDoor ? "nd" : ""}|${p.handleSide ?? ""}|${cabStyleId ?? "_"}|${discKey}|${gdFlag}`;
      const closet = isClosetPart(p.masterCode);
      const unit = unitPriceFor(p);
      // When glass door is enabled, use the GD variant code for ordering.
      const orderCode = p.glassDoor ? p.masterCode + "GD" : p.masterCode;
      const existing = map.get(key);
      if (existing) existing.qty += 1;
      else
        map.set(key, {
          code: orderCode,
          description: [p.description, sizeNote, attrNote]
            .filter(Boolean)
            .join(" \u2014 "),
          color: cabColor,
          widthIn: rotatedSize(p).w,
          heightIn: placedHeight(p),
          depthIn: rotatedSize(p).d,
          placement: p.placement,
          swing: sw === "none" ? undefined : sw,
          qty: 1,
          unitPrice: closet ? unit : styleId ? unit : null,
          discountPct: p.discountPct ?? null,
        });
    }
    const rows = Array.from(map.values());
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
          unitPrice:
            !ep.pendingSku && ep.cabinetId != null && styleId
              ? priceMap.get(`${ep.cabinetId}:${styleId}`) ?? null
              : null,
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
    // Per-cabinet roll-out shelves (add-on). One aggregated line per matched
    // same-line RS shelf, labeled with its line color so two-tone designs read
    // clearly. Priced from the cabinet's own line.
    for (const line of rolloutLines) {
      rows.push({
        code: line.masterCode,
        description: line.description ?? `Roll-Out Shelf ${Math.round(line.width)}"`,
        color: styleNameById.get(line.styleId) ?? null,
        widthIn: line.width,
        heightIn: 0,
        depthIn: 0,
        placement: "accessory",
        qty: line.qty,
        unitPrice: line.unitPrice,
      });
    }
    return rows;
  }, [placed, priceMap, styleId, unitPriceFor, hickorySkins, autoEndPanels, styleNameById, rolloutLines]);
  // ── Add the whole design to the shopping cart ───────────────────────────────
  // Turns the placed cabinets into cart line items (aggregated by master code +
  // effective door style), so a shopper can review and buy the exact kitchen they
  // designed. Closet parts, appliances, and unpriced placeholder rows (skins /
  // pending-SKU end panels) are NOT added — only real, priced catalog cabinets.
  // The cart is locked to ONE distributor (supply line); the whole design shares
  // the design's locked distributor, so there is never a cross-distributor mix.
  const cabinetCartLines = useMemo(() => {
    if (!styleId) return [] as CartItem[];
    const map = new Map<string, CartItem>();
    for (const p of placed) {
      if (isClosetPart(p.masterCode)) continue; // closet parts use a separate flow
      if (p.cabinetId == null) continue; // appliances / non-catalog items
      const unit = unitPriceFor(p);
      if (unit == null) continue; // skip unpriced rows (no SKU for this style)
      const sid = effectiveStyleId(p, styleId) ?? styleId;
      const styleLabel = styleNameById.get(sid) ?? "";
      const bomCode = p.glassDoor ? p.masterCode + "GD" : p.masterCode;
      const key = `${bomCode}::${sid}`;
      const existing = map.get(key);
      if (existing) existing.qty += 1;
      else
        map.set(key, {
          masterCode: bomCode,
          name: p.description ?? p.masterCode,
          styleId: sid,
          styleLabel,
          distributorId: lockedDistributorId ?? null,
          tier: DESIGN_TIER_TO_SHARED[tier],
          unitPrice: unit,
          qty: 1,
        });
    }
    // Per-cabinet roll-out shelves (add-on) flow into the cart/order as their own
    // RS-* line items, priced + locked to the SAME distributor line as the design.
    for (const line of rolloutLines) {
      if (line.unitPrice == null) continue; // skip unpriced (no buyable SKU)
      const styleLabel = styleNameById.get(line.styleId) ?? "";
      const key = `${line.masterCode}::${line.styleId}`;
      const existing = map.get(key);
      if (existing) existing.qty += line.qty;
      else
        map.set(key, {
          masterCode: line.masterCode,
          name: line.description ?? line.masterCode,
          styleId: line.styleId,
          styleLabel,
          distributorId: lockedDistributorId ?? null,
          tier: DESIGN_TIER_TO_SHARED[tier],
          unitPrice: line.unitPrice,
          qty: line.qty,
        });
    }
    return Array.from(map.values());
  }, [placed, styleId, unitPriceFor, styleNameById, lockedDistributorId, tier, rolloutLines]);


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
  // Per-style door sample image URL map (for rendering real door photos on
  // cabinet faces in the elevation view).
  const doorSampleById = useMemo(() => {
    const m = new Map<number, string>();
    doorStyles?.forEach((d) => {
      const s = d as { id: number; doorSampleImageUrl?: string | null };
      if (s.doorSampleImageUrl) m.set(s.id, s.doorSampleImageUrl);
    });
    return m;
  }, [doorStyles]);
  // Per-style drawer sample image URL map (separate photo for drawer fronts).
  const drawerSampleById = useMemo(() => {
    const m = new Map<number, string>();
    doorStyles?.forEach((d) => {
      const s = d as { id: number; drawerSampleImageUrl?: string | null };
      if (s.drawerSampleImageUrl) m.set(s.id, s.drawerSampleImageUrl);
    });
    return m;
  }, [doorStyles]);
  const activeDoorSampleUrl = paletteFinishSwatch; // same source
  const doorSampleForCab = useCallback(
    (cab: PlacedCabinet): string | null => {
      const sid = styleId ? effectiveStyleId(cab, styleId) : null;
      return (sid != null && doorSampleById.get(sid)) || activeDoorSampleUrl;
    },
    [styleId, doorSampleById, activeDoorSampleUrl]
  );
  // Returns the drawer sample URL for a cabinet (null = fall back to door sample).
  const drawerSampleForCab = useCallback(
    (cab: PlacedCabinet): string | null => {
      const sid = styleId ? effectiveStyleId(cab, styleId) : null;
      return (sid != null && drawerSampleById.get(sid)) || null;
    },
    [styleId, drawerSampleById]
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

  // Valance pieces needed (one per window on a wall with wall cabinets)
  const valanceOrder = useMemo(
    () => (valance ? valancePiecesNeeded(openings, placed, room) : []),
    [valance, openings, placed, room]
  );

  // Effective piece count per trim = manual override (if set) else the auto
  // stick count. Clamped to >= 0. This is what drives BOTH the build sheet
  // display and the cart pricing, so an override changes the quote in real time.
  const effectiveTrimPieces = useMemo<Record<TrimKind, number>>(() => {
    const pick = (kind: TrimKind, auto: number | null | undefined) => {
      const o = trimQtyOverride[kind];
      return o !== undefined ? Math.max(0, o) : (auto ?? 0);
    };
    return {
      crown: pick("crown", crownOrder?.pieces),
      toeKick: pick("toeKick", toeKickOrder?.pieces),
      batten: pick("batten", battenOrder?.pieces),
      lightRail: pick("lightRail", lightRailOrder?.pieces),
      valance: pick("valance", valanceOrder.length > 0 ? valanceOrder.length : null),
    };
  }, [trimQtyOverride, crownOrder, toeKickOrder, battenOrder, lightRailOrder, valanceOrder]);

  // Active trims + their (effective) piece counts, in the shape the cart helper consumes.
  const activeTrims = useMemo<ActiveTrim[]>(() => {
    const list: ActiveTrim[] = [];
    if (crown && effectiveTrimPieces.crown > 0) list.push({ kind: "crown", pieces: effectiveTrimPieces.crown });
    if (toeKick && effectiveTrimPieces.toeKick > 0) list.push({ kind: "toeKick", pieces: effectiveTrimPieces.toeKick });
    if (batten && effectiveTrimPieces.batten > 0) list.push({ kind: "batten", pieces: effectiveTrimPieces.batten });
    if (lightRail && effectiveTrimPieces.lightRail > 0) list.push({ kind: "lightRail", pieces: effectiveTrimPieces.lightRail });
    if (valance && effectiveTrimPieces.valance > 0) list.push({ kind: "valance", pieces: effectiveTrimPieces.valance });
    return list;
  }, [crown, toeKick, batten, lightRail, valance, effectiveTrimPieces]);

  // Priced trim cart lines (styleId-scoped). Trims without a buyable SKU for the
  // style (crown, or a style missing that trim) are omitted → quote-only.
  const trimCartLines = useMemo(
    () => buildTrimCartLines(activeTrims, styleId, activeStyleName ?? "", trimPriceByCode),
    [activeTrims, styleId, activeStyleName, trimPriceByCode]
  );

  // Surfaces & Fixtures (flooring, backsplash tile, sink, faucet) picked in the
  // Design Tool become their OWN cart line items so they land on the shopping
  // list — previously they only fed the render prompt and were silently dropped.
  // These come from Pelican, a DIFFERENT supply line than the cabinet
  // distributor, so they carry distributorId: null (never triggers the
  // cabinet distributor-lock) and use a PEL-<id> code namespace so they never
  // collide with a cabinet masterCode. Quantity is 1 per selected product; the
  // Pelican category is shown as the line's label. Unpriced picks are skipped.
  const surfaceCartLines = useMemo<CartItem[]>(() => {
    // Compute room areas inline for box-quantity calculation.
    const bsLinearIn = placed.filter((p) => p.placement === "base" || p.placement === "appliance").reduce((s, p) => s + placedFootprint(p).w, 0);
    const backsplashSqFt = Math.round(((bsLinearIn * 18) / 144) * 10) / 10;
    const flooringSqFt = Math.round(((room.width * room.depth) / 144) * 10) / 10;
    const areas = { backsplashSqFt, flooringSqFt };
    return buildSurfaceCartLines(selectedSurfaces, DESIGN_TIER_TO_SHARED[tier], areas) as CartItem[];
  }, [selectedSurfaces, tier, placed, room]);

  // Final cart lines = cabinets + roll-out shelves + priced trim + surfaces &
  // fixtures. Trim/surfaces are folded in here (aggregated by masterCode+styleId)
  // so every consumer of cartableLines (Add to Cart, the review list, the
  // running total) includes them automatically.
  const cartableLines = useMemo(() => {
    const map = new Map<string, CartItem>();
    for (const line of cabinetCartLines) {
      map.set(`${line.masterCode}::${line.styleId}`, { ...line });
    }
    for (const t of trimCartLines) {
      const key = `${t.masterCode}::${t.styleId}`;
      const existing = map.get(key);
      if (existing) existing.qty += t.qty;
      else
        map.set(key, {
          masterCode: t.masterCode,
          name: t.name,
          styleId: t.styleId,
          styleLabel: t.styleLabel,
          distributorId: lockedDistributorId ?? null,
          tier: DESIGN_TIER_TO_SHARED[tier],
          unitPrice: t.unitPrice,
          qty: t.qty,
        });
    }
    for (const sfc of surfaceCartLines) {
      // styleId is already unique per surface (-id), so a straight set is safe.
      map.set(`${sfc.masterCode}::${sfc.styleId}`, { ...sfc });
    }
    return Array.from(map.values());
  }, [cabinetCartLines, trimCartLines, surfaceCartLines, lockedDistributorId, tier]);

  const addAllToCart = useCallback(async () => {
    if (cartableLines.length === 0) {
      toast.info(t("dt_cart_nothing"));
      return;
    }
    // If the cart already holds items from a DIFFERENT distributor, adding would
    // be rejected line-by-line. Offer to clear and start fresh with this design.
    if (
      cartLockedDistributorId != null &&
      lockedDistributorId != null &&
      cartLockedDistributorId !== lockedDistributorId
    ) {
      const ok = await new Promise<boolean>((resolve) => {
        setDistConflictResolve(() => resolve);
        setDistConflictOpen(true);
      });
      if (!ok) return;
      clearCart();
    }
    let added = 0;
    for (const line of cartableLines) {
      const res = addItem(line);
      if (res.ok) added += line.qty;
    }
    if (added > 0) {
      toast.success(t("dt_cart_added", { n: added }));
      navigate("/cart");
    } else {
      toast.error(t("dt_cart_failed"));
    }
  }, [cartableLines, cartLockedDistributorId, lockedDistributorId, cartLockedStyleLabel, clearCart, addItem, navigate, t]);

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
    // Valance: arched valance above windows when wall cabinets exist.
    const hasWindows = openings.some((op) => op.kind === "window");
    if (!o.valance && hasWallCab && hasWindows && !valance) setValance(true);
  }, [hasBaseCab, hasWallCab, needsBatten, toeKick, crown, lightRail, batten, valance, openings]);
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
  // Cabinets that exceed the room's ceiling height (tall pantries / tall uppers).
  const ceilingViolationUids = useMemo(
    () => ceilingFitViolations(placed, room),
    [placed, room]
  );
  const conflictUids = useMemo(() => {
    const set = conflictingUids(placed);
    // (ceilingViolationUids declared above)
    // Blind corner rule: a blind corner whose neighbor isn't pulled the
    // required 3" off the corner is also a conflict.
    blindCornerViolations(placed).forEach((uid) => set.add(uid));
    // Range/oven corner clearance: flag the appliance until a filler is added.
    rangeClearanceUids.forEach((uid: string) => set.add(uid));
    // Wall cabinet too close to a door/window opening.
    wallOpeningUids.forEach((uid: string) => set.add(uid));
    // Base/tall cabinet sitting across a doorway or cased opening.
    baseOpeningUids.forEach((uid: string) => set.add(uid));
    // Blind corner pull spec: with default pull values (width+3/+6), missing-spec
    // is no longer a blocking conflict. Only flag out-of-range violations.
    blindSpecIssues.forEach((issue, uid) => {
      if (issue === "out-of-range") set.add(uid);
    });
    // Cabinet taller than the room's ceiling height.
    ceilingViolationUids.forEach((uid: string) => set.add(uid));
    // Non-corner base cabinet placed at a room corner (needs BBC/ERB/LSB/CSB).
    missingCornerBaseViolations(placed, room, island, openings).forEach((uid: string) => set.add(uid));
    return set;
  }, [placed, room, island, openings, rangeClearanceUids, wallOpeningUids, baseOpeningUids, blindSpecIssues, ceilingViolationUids]);
  const hasConflicts = conflictUids.size > 0;
  const cornerBaseViolationUids = useMemo(
    () => missingCornerBaseViolations(placed, room, island, openings),
    [placed, room, island, openings]
  );
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
      discountPct: number;
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
      const discKey = p.discountPct ?? 0;
      const gdFlag = p.glassDoor ? "GD" : "";
      const key = `${p.masterCode}|${Math.round(p.width)}|${Math.round(placedHeight(p))}|${((p.rotation % 360) + 360) % 360}|${colorKey}|${discKey}|${gdFlag}`;
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
          discountPct: p.discountPct ?? 0,
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
    // Apply manual bomOrder if present, otherwise fall back to alphabetical by code.
    const withOrder = (groups: typeof panelGroups) => {
      const hasAny = groups.some((g) => bomOrder[g.key] !== undefined);
      if (!hasAny) return [...groups].sort(byCode);
      return [...groups].sort((a, b) => {
        const ai = bomOrder[a.key] ?? 9999;
        const bi = bomOrder[b.key] ?? 9999;
        if (ai !== bi) return ai - bi;
        return byCode(a, b);
      });
    };
    const base = withOrder(panelGroups.filter((g) => g.sample.placement === "base" || g.sample.placement === "tall"));
    const wall = withOrder(panelGroups.filter((g) => g.sample.placement === "wall"));
    const other = withOrder(panelGroups.filter((g) => g.sample.placement !== "base" && g.sample.placement !== "tall" && g.sample.placement !== "wall"));
    return { base, wall, other };
  }, [panelGroups, bomOrder]);

  // Non-cabinet build-sheet lines (fillers, crown, toe kick, countertop note).
  const extraLines = useMemo(() => {
    const out: { label: string; detail: string }[] = [];
    // Note: blind corner fillers are placed manually by the user, not auto-listed here.
    if (crown && crownOrder && crownOrder.pieces > 0)
      out.push({ label: "CROWN MOLDING", detail: `${crownOrder.pieces} pc @ ${crownOrder.stickFeet}ft` });
    if (toeKick && toeKickOrder && toeKickOrder.pieces > 0)
      out.push({ label: "TOE KICK", detail: `${toeKickOrder.pieces} pc @ ${toeKickOrder.stickFeet}ft` });
    if (batten && battenOrder && battenOrder.pieces > 0)
      out.push({ label: "BATTEN MOLDING (BAM)", detail: `${battenOrder.pieces} pc @ ${battenOrder.stickFeet}ft` });
    if (lightRail && lightRailOrder && lightRailOrder.pieces > 0)
      out.push({ label: "LIGHT RAIL MOLDING", detail: `${lightRailOrder.pieces} pc @ ${lightRailOrder.stickFeet}ft` });
    if (valance && valanceOrder.length > 0) {
      for (const vp of valanceOrder) {
        out.push({ label: "ARCHED VALANCE", detail: `${vp.code} (${vp.width}"W) — ${vp.wall} wall` });
      }
    }
    if (countertop && counter && counter.squareFeet > 0) {
      const mat = countertopMaterial(countertopMaterialId);
      const ep = edgeProfile(edgeProfileId);
      out.push({
        label: "COUNTERTOP (quote)",
        detail: `${mat?.name ?? "Material TBD"} — ${ep.name} edge — ~${counter.squareFeet} sq ft / ${counter.linearFeet} lin ft`,
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
  }, [crown, crownOrder, toeKick, toeKickOrder, batten, battenOrder, lightRail, lightRailOrder, countertop, counter, countertopMaterialId, edgeProfileId, sinks, hwSchedule, activeStyle, activeStyleName]);

  // ─── Placement actions ──────────────────────────────────────────────────────

  const addCabinet = useCallback(
    (c: DesignCabinet, x?: number, y?: number) => {
      // Debounce guard: block re-entry within 500 ms to prevent double-placement
      // caused by mobile touch events firing both touchend and click.
      if (isAddingRef.current) return;
      isAddingRef.current = true;
      setTimeout(() => { isAddingRef.current = false; }, 500);
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
      // ── Build the new cabinet object OUTSIDE setPlaced so we can run side
      // effects (dialogs, toasts, sink auto-place) exactly once afterward.
      // setPlaced updaters can be called multiple times by React in concurrent
      // mode — any side effects inside them fire twice, causing double placement.
      // We snapshot `placed` via closure (stable within this callback invocation).
      const prev = placed;

      // Explicit drop position (drag-and-drop) wins. Otherwise seat the cabinet
      // flush against the ACTIVE wall at the first free segment.
      let spot: { x: number; y: number; rotation: number };
      if (x != null && y != null) {
        spot = { x, y, rotation: 0 };
      } else {
        const segs = freeSegmentsOnWall(activeWall, room, prev, openings, Math.min(width, 9), 0, c.placement);
        const fit = segs.find((s) => s.length >= width) ?? segs[0];
        if (fit) {
          const wallLen = (activeWall === "top" || activeWall === "bottom") ? room.width : room.depth;
          const isCorner = isCornerCabinet(c.masterCode, c.description || undefined) || c.isCornerCabinet === true;
          let along = fit.start;
          if (isCorner) {
            const distFromEnd = wallLen - (fit.start + width);
            if (distFromEnd < fit.start) {
              along = Math.max(0, wallLen - width);
            } else {
              along = 0;
            }
          }
          spot = wallPlacementAt(along, width, depth, activeWall, room);
        } else {
          const cx = Math.max(0, Math.min(room.width / 2 - width / 2, Math.max(0, room.width - width)));
          const cy = Math.max(0, Math.min(room.depth / 2 - depth / 2, Math.max(0, room.depth - depth)));
          spot = { x: cx, y: cy, rotation: 0 };
        }
      }

      // ── Stacker auto-snap ──────────────────────────────────────────────
      let stackerMountBottom: number | undefined;
      let stackWidth = width;
      if (accPlacement === "wall" && isStacker(c)) {
        const topLine = wallCabinetTopLine(room);
        stackerMountBottom = topLine;
        const sameWallCabs = prev.filter((p) => {
          if (p.placement !== "wall" || isStacker(p)) return false;
          const pw = cabinetWall(p, room);
          const sw = cabinetWall({ ...p, x: spot.x, y: spot.y, width, depth, rotation: spot.rotation }, room);
          return pw === sw;
        });
        const byX = [...sameWallCabs].sort(
          (a, b) => Math.abs(a.x - spot.x) - Math.abs(b.x - spot.x)
        );
        const bestMatch =
          byX.find((p) => Math.abs(p.width - width) <= 0.5) ?? byX[0];
        if (bestMatch) {
          const bw = rotatedSize(bestMatch).w;
          spot = { ...spot, x: bestMatch.x, y: bestMatch.y };
          stackWidth = bw;
          toast.success("Stacker snapped above " + (bestMatch.masterCode ?? "wall cabinet"));
        }
      }

      // ── OTR microwave auto-snap over a range ───────────────────────────
      let otrMountBottom: number | undefined;
      if (isOverRangeMicrowave({ masterCode: c.masterCode, placement: accPlacement })) {
        const targetWall = cabinetWall(
          { ...(prev[0] as PlacedCabinet), x: spot.x, y: spot.y, width, depth, rotation: spot.rotation },
          room
        );
        const ranges = prev.filter(
          (p) =>
            isRangeOrOven(p.masterCode, p.description) &&
            cabinetWall(p, room) === targetWall
        );
        const byDist = [...ranges].sort(
          (a, b) =>
            Math.hypot(a.x - spot.x, a.y - spot.y) -
            Math.hypot(b.x - spot.x, b.y - spot.y)
        );
        const range = byDist[0];
        if (range) {
          const rs = rotatedSize(range);
          const horizontal = targetWall === "top" || targetWall === "bottom";
          if (horizontal) {
            spot = { ...spot, x: range.x + rs.w / 2 - width / 2 };
          } else {
            spot = { ...spot, y: range.y + rs.d / 2 - depth / 2 };
          }
          const mwDef = APPLIANCES.find((a) => a.masterCode === "MW-30");
          otrMountBottom = mwDef?.elevBottom ?? 54;
          toast.success(t("dt_otr_snapped_over_range"));
        }
      }

      const newCab: PlacedCabinet = {
        uid: makeUid(),
        cabinetId: c.id,
        masterCode: c.masterCode,
        description: c.description,
        category: c.category ?? null,
        subCategory: c.subCategory ?? null,
        placement: accPlacement,
        x: spot.x,
        y: spot.y,
        width: stackWidth,
        nominalWidth: stackWidth,
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
        openingType: (c as any).openingType ?? null,
        doorHeight: (c as any).doorHeight != null ? Number((c as any).doorHeight) : null,
        drawerHeight: (c as any).drawerHeight != null ? Number((c as any).drawerHeight) : null,
        doorOrientation: (c as any).doorOrientation ?? null,
        styleId: styleIdRef.current ?? null,
        ...(stackerMountBottom != null ? { mountBottom: stackerMountBottom } : {}),
        ...(otrMountBottom != null ? { mountBottom: otrMountBottom } : {}),
      };

      // Blind corner: auto-position and auto-swing
      if (isBlindCorner(newCab.masterCode, newCab.description)) {
        const wallSide = cabinetWall(newCab, room);
        const horiz = wallSide === "top" || wallSide === "bottom";
        const wallLen = horiz ? room.width : room.depth;
        const cabWidth = horiz ? newCab.width : newCab.width;
        const cabStart = horiz ? newCab.x : newCab.y;
        const cabEnd = cabStart + cabWidth;
        const range = blindPullRange(newCab);
        const atStart = cabStart <= 2;
        const atEnd = cabEnd >= wallLen - 2;
        const cornerAtStart = atStart || (!atEnd && cabStart < wallLen / 2);
        if (range) {
          newCab.blindPull = range.max;
          if (cornerAtStart) {
            if (horiz) newCab.x = 0;
            else newCab.y = 0;
          } else {
            if (horiz) newCab.x = wallLen - cabWidth;
            else newCab.y = wallLen - cabWidth;
          }
        }
        newCab.swing = cornerAtStart ? "right" : "left";
      }

      // Filler auto-snap: find nearest gap and resize/reposition
      let finalCab = newCab;
      if (/^FILL-/i.test(newCab.masterCode)) {
        const allGaps = wallGaps(room, prev, openings, 0.5);
        const fillerLayer = newCab.placement === "wall" ? "wall" : "base";
        const layerGaps = allGaps.filter((g) => g.layer === fillerLayer && g.length <= 6 && g.length > 0);
        if (layerGaps.length > 0) {
          const fillerCx = newCab.x + newCab.width / 2;
          const fillerCy = newCab.y + newCab.depth / 2;
          const best = layerGaps.reduce((a, b) => {
            const horizontal = (a.side === "top" || a.side === "bottom");
            const aCx = horizontal ? (a.start + a.length / 2) : (a.side === "left" ? 12 : room.width - 12);
            const aCy = horizontal ? (a.side === "top" ? 12 : room.depth - 12) : (a.start + a.length / 2);
            const bCx = (b.side === "top" || b.side === "bottom") ? (b.start + b.length / 2) : (b.side === "left" ? 12 : room.width - 12);
            const bCy = (b.side === "top" || b.side === "bottom") ? (b.side === "top" ? 12 : room.depth - 12) : (b.start + b.length / 2);
            return Math.hypot(aCx - fillerCx, aCy - fillerCy) <= Math.hypot(bCx - fillerCx, bCy - fillerCy) ? a : b;
          });
          const fillerDepth = footprintDepth(c);
          const snappedSpot = wallPlacementAt(best.start, best.length, fillerDepth, best.side, room);
          const horizontal = best.side === "top" || best.side === "bottom";
          finalCab = {
            ...newCab,
            x: snappedSpot.x,
            y: snappedSpot.y,
            rotation: snappedSpot.rotation,
            width: horizontal ? best.length : newCab.width,
            nominalWidth: horizontal ? best.length : newCab.width,
            depth: horizontal ? newCab.depth : best.length,
            nominalDepth: horizontal ? newCab.depth : best.length,
            masterCode: `FILL-${Math.round(best.length * 10) / 10}`,
          };
        }
      }

            // ── Now do all state updates and side effects exactly once ──────────
      justPlacedRef.current = true;
      setSelectedUid(finalCab.uid);
      setPlaced((prev) => [...prev, finalCab]);

      // Sink-base: open the top-type chooser dialog instead of auto-adding a sink.
      // The user picks Sink (Stone Creek catalog) or Range Top (gas/electric/smooth).
      if (isSinkBaseCabinet(finalCab)) {
        setSinkBaseDialog({ cabinetUid: finalCab.uid });
        setRangeTopStep("choose");
        setCountertop(true);
        // Close the mobile catalog sheet so it doesn't intercept dialog touch events
        setMobilePanel(null);
      }
      // Refrigerator dialog
      if (isRefrigerator(finalCab)) {
        setFridgeDialog({ fridgeUid: finalCab.uid });
      }
      // Oven tall cabinet dialog
      if (cabinetDrawingType(finalCab) === "oven-tall") {
        setOvenDialog({ cabinetUid: finalCab.uid });
        // Close the mobile catalog sheet so it doesn't intercept dialog touch events
        setMobilePanel(null);
      }
    },
    [room, activeWall, openings, placed, setSinks, setSelectedSinkUid, setCountertop]
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

  // ── Ceiling Filler: place a filler strip on top of wall cabinets to cover the
  // gap between the wall-cabinet top line and the ceiling. The filler is a
  // wall-layer item with mountBottom = wallCabinetTopLine and height = gap.
  const addCeilingFiller = useCallback(() => {
    if (layoutLocked) { toast.info(t("dt_t_unlock_filler")); return; }
    const topLine = wallCabinetTopLine(room);
    const ceil = roomCeiling(room);
    const gapH = Math.round((ceil - topLine) * 10) / 10;
    if (gapH <= 0) { toast.info(t("dt_ceiling_filler_no_gap")); return; }
    const raw = window.prompt(t("dt_ceiling_filler_width_prompt", { gap: String(gapH) }), "36");
    if (raw == null) return;
    const w = Math.round(parseFloat(raw) * 10) / 10;
    if (!Number.isFinite(w) || w <= 0) { toast.error(t("dt_t_filler_gt0")); return; }
    // Place as a wall-layer filler, mounted at the top of the wall cabinet run.
    const segs = freeSegmentsOnWall(activeWall, room, placed, openings, Math.min(w, 3), 0, "wall");
    const fit = segs.find((s) => s.length >= w) ?? segs[0];
    const along = fit ? fit.start : 0;
    const depth = STD.WALL_DEPTH;
    const spot = wallPlacementAt(along, w, depth, activeWall, room);
    const newCab: PlacedCabinet = {
      uid: makeUid(),
      cabinetId: 0,
      masterCode: `FILL-${w}`,
      description: `${w}" x ${gapH}" Ceiling Filler`,
      category: "Accessory",
      subCategory: "Filler",
      placement: "wall",
      x: spot.x,
      y: spot.y,
      width: w,
      depth,
      height: gapH,
      rotation: spot.rotation,
      numberOfDoors: 0,
      numberOfDrawers: 0,
      catalogImageUrl: null,
      styleId: styleIdRef.current ?? null,
      mountBottom: topLine,
    };
    setPlaced((prev) => [...prev, newCab]);
    setSelectedUid(newCab.uid);
    toast.success(t("dt_ceiling_filler_placed", { w: String(w), h: String(gapH) }));
  }, [layoutLocked, room, placed, openings, activeWall, t]);

  // ── Auto-Fill: tile the active wall with a suggested run of cabinets ────────────
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
            category: c.category ?? null,
            subCategory: c.subCategory ?? null,
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
            openingType: (c as any).openingType ?? null,
            doorHeight: (c as any).doorHeight != null ? Number((c as any).doorHeight) : null,
            drawerHeight: (c as any).drawerHeight != null ? Number((c as any).drawerHeight) : null,
            doorOrientation: (c as any).doorOrientation ?? null,
            // Stamp the active color so Auto-Fill cabinets keep their finish.
            styleId: styleIdRef.current ?? null,
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

  // ── Gap-fill candidates: one representative REAL base cabinet per width ──────
  // Backs the click-to-place gap popover on the plan canvas. For each standard
  // cabinet width we pick a single plain base cabinet from the ACTIVE palette
  // (the same width-sorted, purchasable list Auto-Fill uses), preferring a plain
  // base box (no corner/vanity/sink/specialty) so the suggestion is a clean
  // filler-run cabinet. Only widths that actually exist in the current style/
  // line appear, so we never suggest a cabinet the member can't order.
  const gapFillCandidates = useMemo<Map<number, DesignCabinet>>(
    () => gapFillCandidatesByWidth((autoFillCabinets as DesignCabinet[] | undefined) ?? []) as Map<number, DesignCabinet>,
    [autoFillCabinets]
  );

  // Place a chosen real cabinet flush at a gap's run-axis start. Respects the
  // cabinet lock; drops the box exactly at gap.start along gap.side so it lands
  // inside the measured opening (the user can still drag it afterward).
  const fillGap = useCallback(
    (gap: WallGap, c: DesignCabinet) => {
      if (cabinetsLocked) { toast.info(t("dt_gap_locked")); return; }
      const width = dim(c.width, 24);
      const depth = footprintDepth(c);
      const height = dim(c.height, standardHeight(c.placement));
      const spot = wallPlacementAt(gap.start, width, depth, gap.side, room);
      const newCab: PlacedCabinet = {
        uid: makeUid(),
        cabinetId: c.id,
        masterCode: c.masterCode,
        description: c.description,
        category: c.category ?? null,
        subCategory: c.subCategory ?? null,
        placement: "base",
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
        openingType: (c as any).openingType ?? null,
        doorHeight: (c as any).doorHeight != null ? Number((c as any).doorHeight) : null,
        drawerHeight: (c as any).drawerHeight != null ? Number((c as any).drawerHeight) : null,
        doorOrientation: (c as any).doorOrientation ?? null,
        styleId: styleIdRef.current ?? null,
      };
      setPlaced((prev) => [...prev, newCab]);
      setSelectedUid(newCab.uid);
      toast.success(t("dt_gap_placed_toast", { code: c.masterCode, len: formatInches(gap.length) }));
    },
    [cabinetsLocked, room, t]
  );

  // ── Auto-place filler in a gap ──────────────────────────────────────────────
  // When a gap is ≤6" (filler-size), this creates a filler trimmed to the exact
  // gap width and places it flush at the gap's start position.
  const fillGapWithFiller = useCallback(
    (gap: WallGap) => {
      if (cabinetsLocked) { toast.info(t("dt_gap_locked")); return; }
      const w = Math.round(gap.length * 10) / 10;
      if (w <= 0 || w > 6) return;
      const placement: "base" | "wall" = gap.layer === "wall" ? "wall" : "base";
      const fillerDef = makeFiller(w, placement);
      const width = w;
      const depth = placement === "wall" ? STD.WALL_DEPTH : 24;
      const height = placement === "wall" ? STD.WALL_HEIGHT : STD.BASE_HEIGHT;
      const spot = wallPlacementAt(gap.start, width, depth, gap.side, room);
      const newCab: PlacedCabinet = {
        uid: makeUid(),
        cabinetId: 0,
        masterCode: fillerDef.masterCode,
        description: fillerDef.description,
        category: "Accessory",
        subCategory: "Filler",
        placement,
        x: spot.x,
        y: spot.y,
        width,
        depth,
        height,
        rotation: spot.rotation,
        numberOfDoors: 0,
        numberOfDrawers: 0,
        catalogImageUrl: null,
        styleId: styleIdRef.current ?? null,
      };
      setPlaced((prev) => [...prev, newCab]);
      setSelectedUid(newCab.uid);
      toast.success(t("dt_toast_added_filler", { w }));
    },
    [cabinetsLocked, room, t]
  );

  // ── Combo: place a cabinet + auto-sized filler in one click ─────────────────
  const fillGapWithCabAndFiller = useCallback(
    (gap: WallGap, c: DesignCabinet) => {
      if (cabinetsLocked) { toast.info(t("dt_gap_locked")); return; }
      const cabWidth = dim(c.width, 24);
      const fillerW = Math.round((gap.length - cabWidth) * 10) / 10;
      if (fillerW <= 0 || fillerW > 6) return;
      const depth = footprintDepth(c);
      const height = dim(c.height, standardHeight(c.placement));
      const placement: "base" | "wall" = gap.layer === "wall" ? "wall" : "base";
      // Place cabinet at gap start
      const cabSpot = wallPlacementAt(gap.start, cabWidth, depth, gap.side, room);
      const newCab: PlacedCabinet = {
        uid: makeUid(),
        cabinetId: c.id,
        masterCode: c.masterCode,
        description: c.description,
        category: c.category ?? null,
        subCategory: c.subCategory ?? null,
        placement,
        x: cabSpot.x, y: cabSpot.y,
        width: cabWidth, nominalWidth: cabWidth,
        depth, nominalDepth: depth,
        height, nominalHeight: height,
        rotation: cabSpot.rotation,
        numberOfDoors: c.numberOfDoors,
        numberOfDrawers: c.numberOfDrawers,
        catalogImageUrl: c.catalogImageUrl ?? null,
        pullMin: c.pullMin ?? null,
        pullMax: c.pullMax ?? null,
        openingType: (c as any).openingType ?? null,
        doorHeight: (c as any).doorHeight != null ? Number((c as any).doorHeight) : null,
        drawerHeight: (c as any).drawerHeight != null ? Number((c as any).drawerHeight) : null,
        doorOrientation: (c as any).doorOrientation ?? null,
        styleId: styleIdRef.current ?? null,
      };
      // Place filler at gap.start + cabWidth
      const fillerDef = makeFiller(fillerW, placement);
      const fillerDepth = placement === "wall" ? STD.WALL_DEPTH : 24;
      const fillerHeight = placement === "wall" ? STD.WALL_HEIGHT : STD.BASE_HEIGHT;
      const fillerSpot = wallPlacementAt(gap.start + cabWidth, fillerW, fillerDepth, gap.side, room);
      const newFiller: PlacedCabinet = {
        uid: makeUid(),
        cabinetId: 0,
        masterCode: fillerDef.masterCode,
        description: fillerDef.description,
        category: "Accessory",
        subCategory: "Filler",
        placement,
        x: fillerSpot.x, y: fillerSpot.y,
        width: fillerW, depth: fillerDepth, height: fillerHeight,
        rotation: fillerSpot.rotation,
        numberOfDoors: 0, numberOfDrawers: 0,
        catalogImageUrl: null,
        styleId: styleIdRef.current ?? null,
      };
      setPlaced((prev) => [...prev, newCab, newFiller]);
      setSelectedUid(newCab.uid);
      toast.success(t("dt_gap_combo_toast", { code: c.masterCode, filler: formatInches(fillerW) }));
    },
    [cabinetsLocked, room, t]
  );

  // ── Range/oven corner clearance: one-click fix ──────────────────────────────
  // NOTE: Range/oven corner clearance is a WARNING ONLY. We intentionally do not
  // auto-insert fillers or shift cabinets — the designer places the clearance
  // filler manually with the Filler tool. (Former auto-fix removed by request.)

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

  // ── Refrigerator Options dialog ─────────────────────────────────────────────
  // Opened right after a refrigerator (FRIDGE-*) is dropped. Lets the user add
  // a cabinet ABOVE the fridge (deep 24" fridge wall cabinet or shallow 12"
  // bridge, or none), refrigerator END PANELS (left / right / both / none), and
  // an optional smooth refrigerator PANEL. Everything is placed flush to the
  // dropped fridge's footprint and is fully movable/deletable afterward.
  const [fridgeDialog, setFridgeDialog] = useState<{ fridgeUid: string } | null>(null);
  // Oven type dialog: opens when an oven tall cabinet (O-code) is placed.
  const [ovenDialog, setOvenDialog] = useState<{ cabinetUid: string } | null>(null);
  // Sink base top dialog: opens when a sink base cabinet is placed.
  // Lets the user choose between a sink fixture or a range top (gas/electric/smooth).
  const [sinkBaseDialog, setSinkBaseDialog] = useState<{ cabinetUid: string } | null>(null);
  // Range top sub-type selection (shown after user picks "Range Top" in the sink base dialog).
  // Also used for sink/faucet steps: "sink" = sink picker, "faucet" = faucet picker.
  const [rangeTopStep, setRangeTopStep] = useState<"choose" | "sink" | "faucet" | "range-type" | "range-product" | "gas" | "electric" | "smooth-top">("choose");
  // Pending sink product selected in the "sink" step, waiting for faucet selection.
  type SinkDialogProduct = { id: number; slug: string; name: string; category: string; subCategory: string | null; size: string | null; imageUrl: string | null; sellPrice: number | null };
  const [pendingSinkProduct, setPendingSinkProduct] = useState<SinkDialogProduct | null>(null);
  // Pending range top type selected in the "range-type" step, waiting for product selection.
  const [pendingRangeTopType, setPendingRangeTopType] = useState<"gas" | "electric" | "smooth-top" | null>(null);
  // Recommended range top products fetched from Stone Creek catalog.
  const { data: rangeTopProducts } = trpc.surfaces.recommended.useQuery(
    { role: "range-top", limit: 6 },
    { enabled: !!sinkBaseDialog }
  );
  // Recommended sink products fetched from Stone Creek catalog.
  const { data: sinkBaseProducts } = trpc.surfaces.recommended.useQuery(
    { role: "sink", limit: 6 },
    { enabled: !!sinkBaseDialog }
  );
  // Recommended faucet products fetched from Stone Creek catalog.
  const { data: faucetBaseProducts } = trpc.surfaces.recommended.useQuery(
    { role: "faucet", limit: 6 },
    { enabled: !!sinkBaseDialog }
  );
  const fridgeForDialog = useMemo(
    () => (fridgeDialog ? placed.find((p) => p.uid === fridgeDialog.fridgeUid) ?? null : null),
    [fridgeDialog, placed]
  );
  const { data: fridgeSurround } = trpc.design.surroundForFridge.useQuery(
    { styleId: styleId ?? 0, fridgeWidth: fridgeForDialog ? rotatedSize(fridgeForDialog).w : undefined },
    { enabled: !!fridgeDialog && !!styleId }
  );
  // Place the chosen refrigerator surround pieces flush to the seeded fridge.
  const applyFridgeSurround = useCallback(
    (opts: {
      above: "deep" | "bridge" | "none";
      bridgeCabinetId?: number | null;
      /** The chosen bridge height in inches (12, 18, or 24). Used to auto-select catalog cabinet. */
      bridgeHeight?: number | null;
      /** The chosen bridge depth in inches (12 or 24). Defaults to 12 (standard wall depth) when not provided. */
      bridgeDepth?: number | null;
      /** The chosen bridge width in inches. When provided, overrides fp.w for the cabinet above. */
      bridgeWidth?: number | null;
      panels: "left" | "right" | "both" | "none";
      endPanelId?: number | null;
      /** The chosen end panel depth in inches (24-36). When provided, overrides the fridge depth for panel placement. */
      panelDepth?: number | null;
      /** Pre-calculated panel height (fridge H + bridge H). When provided, overrides the auto-calc. */
      panelHeight?: number | null;
      smooth: boolean;
      fridgeWidth?: number;
      fridgeHeight?: number;
      fridgeDepth?: number;
    }) => {
      const fridge = fridgeForDialog;
      const surround = fridgeSurround as
        | { deepAbove: DesignCabinet[]; bridgeAbove: DesignCabinet[]; endPanels: DesignCabinet[]; smoothPanels: DesignCabinet[] }
        | undefined;
      if (!fridge || !surround) { setFridgeDialog(null); return; }
      const side = cabinetWall(fridge, room);
      const horizontal = side === "top" || side === "bottom";
      const fp = placedFootprint(fridge);
      const fw = fp.w; // width along the wall run
      const fd = fp.d; // depth into the room

      // Pick the surround row whose width best matches the fridge width (fallback).
      const pickByWidth = (rows: DesignCabinet[] | undefined, target: number): DesignCabinet | undefined => {
        if (!rows || rows.length === 0) return undefined;
        return [...rows].sort(
          (a, b) => Math.abs(parseFloat(String(a.width ?? "999")) - target) - Math.abs(parseFloat(String(b.width ?? "999")) - target)
        )[0];
      };
      // Pick a specific cabinet by id, falling back to pickByWidth.
      const pickById = (rows: DesignCabinet[] | undefined, id: number | null | undefined, fallbackTarget: number): DesignCabinet | undefined => {
        if (id && rows) {
          const found = rows.find((r) => r.id === id);
          if (found) return found;
        }
        return pickByWidth(rows, fallbackTarget);
      };

      // 0) Resize the fridge itself if the user changed its dimensions.
      if (opts.fridgeWidth || opts.fridgeHeight || opts.fridgeDepth) {
        setPlaced((prev) =>
          prev.map((p) => {
            if (p.uid !== fridge.uid) return p;
            const newW = opts.fridgeWidth ?? p.width;
            const newH = opts.fridgeHeight ?? p.height;
            const newD = opts.fridgeDepth ?? p.depth;
            return {
              ...p,
              width: newW,
              nominalWidth: newW,
              height: newH,
              nominalHeight: newH,
              depth: newD,
              nominalDepth: newD,
              masterCode: `FRIDGE-${newW}`,
              description: `Refrigerator ${newW}"`,
            };
          })
        );
        // Re-derive fp/fw/fd from the new dimensions so surround pieces align.
        const newW = opts.fridgeWidth ?? fw;
        const newD = opts.fridgeDepth ?? fd;
        Object.assign(fp, { w: newW, d: newD });
      }

      const toPlace: PlacedCabinet[] = [];
      // Track the bridge height so end panels can be sized to fridge + bridge combined.
      let bridgeHeightPlaced = 0;

      // 1) Cabinet ABOVE the fridge (upper zone → exempt from appliance collision).
      if (opts.above !== "none") {
        // "bridge" now means the fridge-cabinet (deepAbove) catalog since the dialog
        // was updated to use deepAbove for the over-fridge section.
        const src = (opts.above === "deep" || opts.above === "bridge") ? surround.deepAbove : surround.bridgeAbove;
        // Use fp.w (updated fridge width) — rotatedSize(fridge).w is the stale pre-resize value.
        // For bridge mode: filter candidates by the chosen bridge height, then pick best width match.
        let chosen: DesignCabinet | undefined;
        if (opts.above === "bridge" && opts.bridgeHeight) {
          const targetH = opts.bridgeHeight;
          const targetD = opts.bridgeDepth ?? 12;
          // Parse dimensions from SKU masterCode when stored columns are null.
          // Supports W[WW][HH][DD] (e.g. W362424), WR[WW][HH] (depth always 24), and W[WW][HH]GD.
          const parseCabDims = (code: string) => {
            const c = code.replace(/^[^W]*W/, "W");
            // Clark & Sons 24"-deep WR format: WR[WW][HH] e.g. WR3612, WR3624
            const mR = c.match(/^WR(\d{2})(\d{2})$/);
            if (mR) return { w: parseInt(mR[1], 10), h: parseInt(mR[2], 10), d: 24 };
            // Clark & Sons dash format 12"-deep: W-WW-HH e.g. W-36-12, W-33-18, W-30-24
            const mDash = c.match(/^W-(\d{2})-(\d{2})$/);
            if (mDash) return { w: parseInt(mDash[1], 10), h: parseInt(mDash[2], 10), d: 12 };
            // Skyline/USCD glass-door 12"-deep: W[WW][HH]GD e.g. W3012GD, W3612GD (check before 8-char)
            const mGD = c.match(/^W(\d{2})(\d{2})GD$/);
            if (mGD) return { w: parseInt(mGD[1], 10), h: parseInt(mGD[2], 10), d: 12 };
            // 8-char Skyline: W[WW][HH][DD] e.g. W301224, W362424
            const m6 = c.match(/^W(\d{2})(\d{2})(\d{2})$/);
            if (m6) return { w: parseInt(m6[1], 10), h: parseInt(m6[2], 10), d: parseInt(m6[3], 10) };
            // Skyline/Milestone 4-char 12"-deep: W[WW][HH] e.g. W3012, W3315, W3618, W3624
            const m4 = c.match(/^W(30|33|36)(12|15|18|21|24)$/);
            if (m4) return { w: parseInt(m4[1], 10), h: parseInt(m4[2], 10), d: 12 };
            return null;
          };
          const heightFiltered = src.filter((c) => {
            const sku = parseCabDims(c.masterCode);
            const h = parseFloat(String(c.height ?? "")) || (sku ? sku.h : 0);
            const d = parseFloat(String(c.depth ?? "")) || (sku ? sku.d : 0);
            const heightOk = Math.abs(h - targetH) < 1.5;
            const depthOk = d === 0 || Math.abs(d - targetD) < 1.5;
            return heightOk && depthOk;
          });
          // Fall back to height-only match if no depth-matched candidates exist.
          const fallback = src.filter((c) => {
            const sku = parseCabDims(c.masterCode);
            const h = parseFloat(String(c.height ?? "")) || (sku ? sku.h : 0);
            return Math.abs(h - targetH) < 1.5;
          });
          chosen = pickByWidth(
            heightFiltered.length > 0 ? heightFiltered : fallback.length > 0 ? fallback : src,
            fp.w
          );
        } else {
          chosen = opts.above === "bridge"
            ? pickById(src, opts.bridgeCabinetId, fp.w)
            : pickByWidth(src, fp.w);
        }
        if (chosen) {
          // Use the user-chosen bridge width when provided; otherwise fall back to fridge width.
          const aWidth = (opts.bridgeWidth && opts.bridgeWidth > 0) ? opts.bridgeWidth : fp.w;
          const isDeep = opts.above === "deep";
          // Deep refrigerator/corner upper: project 27" and step UP 6" taller
          // than a standard wall cabinet for the staggered built-in look. The
          // shallow bridge stays a normal-height, 12"-deep upper.
          // For bridge cabinets, use the user-chosen depth (12" shallow or 24" full depth).
          // Deep/corner uppers always project to fridgeCornerUpperDepth().
          const aDepth = isDeep
            ? fridgeCornerUpperDepth()
            : (opts.above === "bridge" && opts.bridgeDepth)
              ? opts.bridgeDepth
              : STD.WALL_DEPTH;
          // Use the user-chosen bridge height directly (12/18/24) so the placed cabinet
          // always has the exact height the user selected, even if the catalog entry differs.
          const catalogH = parseFloat(String((chosen.height ?? STD.WALL_HEIGHT))) || STD.WALL_HEIGHT;
          const aHeight = (opts.above === "bridge" && opts.bridgeHeight) ? opts.bridgeHeight : catalogH;
          bridgeHeightPlaced = aHeight;
          // Center the upper over the fridge run, flush to the same wall.
          const fridgeCenterAlong = horizontal ? fridge.x + fw / 2 : fridge.y + fw / 2;
          const along = fridgeCenterAlong - aWidth / 2;
          const spot = wallPlacementAt(along, aWidth, aDepth, side, room);
          // Hang so its TOP finishes at the wall-cabinet top line (flush with a
          // pantry/tall run cap); a taller stepped box hangs lower at the bottom
          // while sharing that top line. mountBottom = topLine - height.
          // Determine the actual fridge height for mountBottom:
          // use opts.fridgeHeight if the user changed it, otherwise use the
          // stored fridge height, falling back to the standard 70" catalog height.
          const actualFridgeH = opts.fridgeHeight ?? (typeof fridge.height === "number" && fridge.height > 0 ? fridge.height : 70);
          toPlace.push({
            uid: makeUid(),
            cabinetId: chosen.id,
            masterCode: chosen.masterCode,
            description: chosen.description,
            category: chosen.category ?? null,
            subCategory: chosen.subCategory ?? null,
            placement: "wall",
            x: spot.x,
            y: spot.y,
            width: aWidth,
            depth: aDepth,
            height: aHeight,
            rotation: spot.rotation,
            numberOfDoors: chosen.numberOfDoors ?? undefined,
            numberOfDrawers: chosen.numberOfDrawers ?? undefined,
            catalogImageUrl: chosen.catalogImageUrl ?? null,
            styleId: styleIdRef.current ?? null,
            // Mount the bridge cabinet directly on top of the fridge.
            mountBottom: actualFridgeH,
          });
        }
      }

      // 2) Refrigerator END PANELS: tall/deep panels flush to the fridge L/R edge.
      // Use the user-selected panel id if provided, otherwise fall back to best-width match.
      // If the catalog has no matching panel, create a synthetic placeholder so the panel
      // always appears in the drawing with the correct dimensions.
      const rawFridgeHForPanel = parseFloat(String(fridge.height ?? "72")) || 72;
      const fridgeHForPanel = opts.fridgeHeight != null ? opts.fridgeHeight : rawFridgeHForPanel;
      const syntheticPanelHeight = opts.panelHeight && opts.panelHeight > 0
        ? opts.panelHeight
        : fridgeHForPanel + (bridgeHeightPlaced > 0 ? bridgeHeightPlaced : 0);
      const panelRow: DesignCabinet = pickById(surround.endPanels, opts.endPanelId, fd) ?? surround.endPanels?.[0] ?? {
        id: 0,
        masterCode: `PANEL-${syntheticPanelHeight}`,
        description: `Refrigerator End Panel ${syntheticPanelHeight}"H`,
        category: "Panel",
        subCategory: null,
        width: "0.75",
        height: String(syntheticPanelHeight),
        depth: "0.75",
        numberOfDoors: null,
        numberOfDrawers: null,
        isCornerCabinet: false,
        catalogImageUrl: null,
      };
      const placePanel = (leftEdge: boolean) => {
        // pDepth: use user-chosen panel depth when provided; otherwise match the fridge depth.
        const pDepth = (opts.panelDepth && opts.panelDepth > 0) ? opts.panelDepth : fd;
        // Infer dimensions from masterCode when catalog values are null
        // (style-prefixed variants like "ANTIQUE WHITE-S2496" often lack stored dims).
        const code = (panelRow.masterCode ?? "").toUpperCase();
        const inferredHeight = code.includes("S2496") || code.includes("REPV") || code.includes("TDEP") ? 96
          : code.includes("S3696") ? 96 : 96;
        const inferredDepth = (code.includes("REPV") || code.includes("S2496") || code.includes("S3696")) ? 0.75 : 0.75;
        // pThick: the panel's face THICKNESS (the narrow face dimension — panelRow.width for REPV/TDEP
        // panels where width=1.5" is the thickness and depth=24" is the floor depth).
        // For REPV/TDEP/S-series panels: width column = face thickness (1.5" or 0.75").
        // Fall back to inferredDepth (0.75") if width is missing or implausibly large.
        const rawPanelW = parseFloat(String(panelRow.width ?? ""));
        const pThick = (Number.isFinite(rawPanelW) && rawPanelW > 0 && rawPanelW <= 3)
          ? rawPanelW
          : inferredDepth;
        // Panel height = fridge height + bridge height (if any), so the panel covers
        // the full built-in column: 72" fridge + 12" bridge → 84", + 18" → 90", + 24" → 96".
        const rawFridgeH = parseFloat(String(fridge.height ?? "72")) || 72;
        const fridgeH = opts.fridgeHeight != null ? opts.fridgeHeight : rawFridgeH;
        // Use pre-calculated panelHeight from dialog when provided; otherwise auto-calculate.
        const pHeight = opts.panelHeight && opts.panelHeight > 0
          ? opts.panelHeight
          : opts.above !== "none" && bridgeHeightPlaced > 0
            ? fridgeH + bridgeHeightPlaced
            : (parseFloat(String(panelRow.height ?? "")) || inferredHeight);
        // Along-wall position: just outside the fridge edge on the chosen side.
        // Clamp to room bounds so the panel never lands outside the room.
        let along: number;
        if (horizontal) {
          along = leftEdge ? fridge.x - pThick : fridge.x + fw;
          along = Math.max(0, Math.min(along, room.width - pThick));
        } else {
          along = leftEdge ? fridge.y - pThick : fridge.y + fw;
          along = Math.max(0, Math.min(along, room.depth - pThick));
        }
        const spot = wallPlacementAt(along, pThick, pDepth, side, room);
        toPlace.push({
          uid: makeUid(),
          cabinetId: panelRow.id,
          masterCode: panelRow.masterCode,
          description: panelRow.description,
          placement: "tall",
          x: spot.x,
          y: spot.y,
          width: pThick,
          depth: pDepth,
          height: pHeight,
          rotation: spot.rotation,
          catalogImageUrl: panelRow.catalogImageUrl ?? null,
          styleId: styleIdRef.current ?? null,
        });
      };
      if (opts.panels === "left" || opts.panels === "both") placePanel(true);
      if (opts.panels === "right" || opts.panels === "both") placePanel(false);

      // 3) Optional smooth refrigerator PANEL (flat skin sheet) — added as a BOM
      // flat-stock item flush to the fridge face; carried as a thin wall panel.
      if (opts.smooth) {
        const skin = pickByWidth(surround.smoothPanels, rotatedSize(fridge).w) ?? surround.smoothPanels?.[0];
        if (skin) {
          const sWidth = parseFloat(String(skin.width ?? rotatedSize(fridge).w)) || rotatedSize(fridge).w;
          const along = horizontal ? fridge.x + fw / 2 - sWidth / 2 : fridge.y + fw / 2 - sWidth / 2;
          const spot = wallPlacementAt(along, sWidth, 0.75, side, room);
          toPlace.push({
            uid: makeUid(),
            cabinetId: skin.id,
            masterCode: skin.masterCode,
            description: skin.description,
            placement: "wall",
            x: spot.x,
            y: spot.y,
            width: sWidth,
            depth: 0.75,
            height: parseFloat(String(skin.height ?? 15)) || 15,
            rotation: spot.rotation,
            catalogImageUrl: skin.catalogImageUrl ?? null,
            styleId: styleIdRef.current ?? null,
            mountBottom: STD.WALL_MOUNT_BOTTOM,
          });
        }
      }

      if (toPlace.length > 0) {
        setPlaced((prev) => [...prev, ...toPlace]);
        toast.success(t("dt_fridge_added_toast"));
      }
      setFridgeDialog(null);
    },
    [fridgeForDialog, fridgeSurround, room, t]
  );

  // ── One-click "Built-in Refrigerator + Pantry End" preset ──────────────────
  // Composes a finished built-in run at the ACTIVE wall's largest open segment,
  // from the wall corner inward: a 96" pantry → the refrigerator flanked by tall
  // REPV end panels → the deep 27", +6"-taller refrigerator wall cabinet over the
  // fridge (top-aligned to the run cap) → standard uppers filling the remainder.
  // Continuous crown is enabled so it wraps the stepped top line. Everything is
  // movable/deletable afterward. Fires a fetch, then places when data lands.
  const [builtinRunArmed, setBuiltinRunArmed] = useState(false);
  const { data: builtinRunData } = trpc.design.builtinFridgeRun.useQuery(
    { styleId: styleId ?? 0 },
    { enabled: builtinRunArmed && !!styleId }
  );
  const buildBuiltinFridgeRun = useCallback(() => {
    if (layoutLocked) { toast.info(t("dt_t_unlock_autofill")); return; }
    if (roomType !== "kitchen") { toast.info(t("dt_builtin_kitchen_only")); return; }
    if (!styleId) { toast.error(t("dt_t_pick_style_first")); return; }
    setBuiltinRunArmed(true);
  }, [layoutLocked, roomType, styleId, t]);

  // Place the built-in run once the resolved pieces arrive.
  useEffect(() => {
    if (!builtinRunArmed || !builtinRunData) return;
    setBuiltinRunArmed(false);
    const data = builtinRunData as {
      pantry: DesignCabinet[]; deepAbove: DesignCabinet[]; endPanels: DesignCabinet[]; wallCabs: DesignCabinet[];
    };
    // Largest open segment on the active wall.
    const segments = freeSegmentsOnWall(activeWall, room, placed, openings, 9);
    if (segments.length === 0) { toast.info(t("dt_t_wall_full")); return; }
    const seg = [...segments].sort((a, b) => b.length - a.length)[0];
    const side = activeWall;
    const topLine = wallCabinetTopLine(room);
    const num = (v: unknown, d: number) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) && n > 0 ? n : d; };
    const widest = (rows: DesignCabinet[] | undefined) =>
      rows && rows.length ? [...rows].sort((a, b) => num(b.width, 0) - num(a.width, 0))[0] : undefined;
    const pickW = (rows: DesignCabinet[] | undefined, target: number) =>
      rows && rows.length ? [...rows].sort((a, b) => Math.abs(num(a.width, 999) - target) - Math.abs(num(b.width, 999) - target))[0] : undefined;

    const fridgeDef = APPLIANCES.find((a) => a.masterCode === "FRIDGE-36") ?? APPLIANCES.find((a) => a.masterCode === "FRIDGE-30");
    const pantry = widest(data.pantry);
    if (!fridgeDef || !pantry) { toast.error(t("dt_builtin_missing")); return; }
    const fridgeW = fridgeDef.width;
    const fridgeD = fridgeDef.depth;
    const pantryW = num(pantry.width, 24);
    const panel = pickW(data.endPanels, fridgeD);
    const panelThick = 1;
    const deep = pickW(data.deepAbove, fridgeW);

    // Layout budget along the wall: pantry + fridge + (two end panels).
    const panelsW = panel ? panelThick * 2 : 0;
    const need = pantryW + fridgeW + panelsW;
    if (seg.length < need - 0.5) { toast.info(t("dt_builtin_no_room")); return; }

    const out: PlacedCabinet[] = [];
    let along = seg.start; // build from the wall corner inward

    // 1) Pantry (96" tall).
    {
      const spot = wallPlacementAt(along, pantryW, num(pantry.depth, 24), side, room);
      out.push({
        uid: makeUid(), cabinetId: pantry.id, masterCode: pantry.masterCode, description: pantry.description,
        category: pantry.category ?? null, subCategory: pantry.subCategory ?? null, placement: "tall",
        x: spot.x, y: spot.y, width: pantryW, depth: num(pantry.depth, 24), height: num(pantry.height, 96),
        rotation: spot.rotation, numberOfDoors: pantry.numberOfDoors, numberOfDrawers: pantry.numberOfDrawers,
        catalogImageUrl: pantry.catalogImageUrl ?? null, styleId: styleIdRef.current ?? null,
      });
      along += pantryW;
    }

    // 2) Left end panel (between pantry and fridge).
    if (panel) {
      const spot = wallPlacementAt(along, panelThick, num(panel.width, fridgeD), side, room);
      out.push({
        uid: makeUid(), cabinetId: panel.id, masterCode: panel.masterCode, description: panel.description,
        placement: "tall", x: spot.x, y: spot.y, width: panelThick, depth: num(panel.width, fridgeD),
        height: num(panel.height, 96), rotation: spot.rotation, catalogImageUrl: panel.catalogImageUrl ?? null,
        styleId: styleIdRef.current ?? null,
      });
      along += panelThick;
    }

    // 3) Refrigerator + deep taller upper over it.
    {
      const spot = wallPlacementAt(along, fridgeW, fridgeD, side, room);
      out.push({
        uid: makeUid(), cabinetId: 0, masterCode: fridgeDef.masterCode, description: fridgeDef.description,
        category: "Appliance", subCategory: null, placement: "appliance",
        x: spot.x, y: spot.y, width: fridgeW, depth: fridgeD, height: fridgeDef.elevHeight,
        rotation: spot.rotation, numberOfDoors: null, numberOfDrawers: null, catalogImageUrl: null,
        styleId: styleIdRef.current ?? null,
      });
      if (deep) {
        const aWidth = num(deep.width, fridgeW);
        const aDepth = fridgeCornerUpperDepth();
        const aHeight = num(deep.height, 24);
        const upAlong = along + fridgeW / 2 - aWidth / 2;
        const upSpot = wallPlacementAt(upAlong, aWidth, aDepth, side, room);
        out.push({
          uid: makeUid(), cabinetId: deep.id, masterCode: deep.masterCode, description: deep.description,
          placement: "wall", x: upSpot.x, y: upSpot.y, width: aWidth, depth: aDepth, height: aHeight,
          rotation: upSpot.rotation, numberOfDoors: deep.numberOfDoors ?? undefined,
          catalogImageUrl: deep.catalogImageUrl ?? null, styleId: styleIdRef.current ?? null,
          mountBottom: Math.max(STD.WALL_MOUNT_BOTTOM, staggeredMountBottom(topLine, aHeight)),
        });
      }
      along += fridgeW;
    }

    // 4) Right end panel (outside edge of the fridge).
    if (panel) {
      const spot = wallPlacementAt(along, panelThick, num(panel.width, fridgeD), side, room);
      out.push({
        uid: makeUid(), cabinetId: panel.id, masterCode: panel.masterCode, description: panel.description,
        placement: "tall", x: spot.x, y: spot.y, width: panelThick, depth: num(panel.width, fridgeD),
        height: num(panel.height, 96), rotation: spot.rotation, catalogImageUrl: panel.catalogImageUrl ?? null,
        styleId: styleIdRef.current ?? null,
      });
      along += panelThick;
    }

    // 5) Fill the remaining run with standard uppers (mounted at the run cap).
    let remaining = seg.start + seg.length - along;
    const wallPool = [...(data.wallCabs || [])].sort((a, b) => num(b.width, 0) - num(a.width, 0));
    let guard = 0;
    while (remaining >= 9 && wallPool.length > 0 && guard < 40) {
      guard++;
      const cab = wallPool.find((c) => num(c.width, 999) <= remaining + 0.01) ?? undefined;
      if (!cab) break;
      const cw = num(cab.width, 12);
      const ch = num(cab.height, STD.WALL_HEIGHT);
      const spot = wallPlacementAt(along, cw, STD.WALL_DEPTH, side, room);
      out.push({
        uid: makeUid(), cabinetId: cab.id, masterCode: cab.masterCode, description: cab.description,
        placement: "wall", x: spot.x, y: spot.y, width: cw, depth: STD.WALL_DEPTH, height: ch,
        rotation: spot.rotation, numberOfDoors: cab.numberOfDoors ?? undefined,
        catalogImageUrl: cab.catalogImageUrl ?? null, styleId: styleIdRef.current ?? null,
        mountBottom: Math.max(STD.WALL_MOUNT_BOTTOM, staggeredMountBottom(topLine, ch)),
      });
      along += cw;
      remaining -= cw;
    }

    setPlaced((prev) => [...prev, ...out]);
    // Turn on crown so it wraps the stepped top line of the built-in.
    trimOverride.current.crown = true;
    setCrown(true);
    toast.success(t("dt_builtin_added_toast", { n: out.length }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtinRunArmed, builtinRunData]);

  // ── AI Photoreal Preview: assemble scene input from live design state ──────
  const buildPhotorealScene = useCallback((): PhotorealSceneInput | null => {
    if (placed.length === 0) return null;
    // Group cabinets by wall
    const wallNames: Record<WallSide, string> = {
      top: "Back wall", bottom: "Front wall", left: "Left wall", right: "Right wall",
    };
    const wallCabs: Record<WallSide, PlacedCabinet[]> = { top: [], bottom: [], left: [], right: [] };
    const applianceList: string[] = [];
    for (const p of placed) {
      const w = cabinetWall(p, room);
      wallCabs[w].push(p);
      if (isApplianceCode(p.masterCode ?? "")) {
        const desc = (p.description ?? p.masterCode ?? "").replace(/\d+"?$/, "").trim().toLowerCase();
        if (desc && !applianceList.includes("a " + desc)) applianceList.push("a " + desc);
      }
    }
    // Wall summaries — detailed per-cabinet sequence so the AI renders the
    // EXACT layout, not a generic kitchen.
    const summaries: string[] = [];
    const cabWalls: string[] = [];
    for (const side of ["top", "bottom", "left", "right"] as WallSide[]) {
      const cabs = wallCabs[side];
      if (cabs.length === 0) continue;
      cabWalls.push(wallNames[side]);
      // Sort by position along the wall (left-to-right in the elevation)
      const horizontal = side === "top" || side === "bottom";
      const sorted = [...cabs].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
      // Build a concise left-to-right sequence description
      const baseSeq = sorted.filter((c) => c.placement === "base" || c.placement === "appliance");
      const wallSeq = sorted.filter((c) => c.placement === "wall");
      const tallSeq = sorted.filter((c) => c.placement === "tall");
      const describeSeq = (items: PlacedCabinet[]): string => {
        return items.map((c) => {
          const w = c.width ?? 0;
          const code = c.masterCode ?? "";
          if (isApplianceCode(code)) {
            const name = (c.description ?? code).replace(/\d+"?$/, "").trim();
            return `${w}" ${name}`;
          }
          // Describe by type: drawer base, sink base, corner, etc.
          const desc = (c.description ?? "").toLowerCase();
          if (desc.includes("sink")) return `${w}" sink base`;
          if (desc.includes("drawer")) return `${w}" drawer base`;
          if (desc.includes("corner") || desc.includes("blind")) return `${w}" corner cabinet`;
          if (desc.includes("lazy susan")) return `${w}" lazy susan`;
          if (c.placement === "wall") return `${w}" wall cabinet`;
          if (c.placement === "tall") return `${w}" tall pantry`;
          return `${w}" cabinet`;
        }).join(", ");
      };
      // Check for windows on this wall
      const wallOpenings = openings.filter((o) => o.side === side);
      const windowNote = wallOpenings.some((o) => o.kind === "window")
        ? " (with a window above the counter area)"
        : wallOpenings.some((o) => o.kind === "door" || o.kind === "opening")
        ? " (with a doorway)"
        : "";
      let summary = `${wallNames[side]}${windowNote}: `;
      const parts: string[] = [];
      if (baseSeq.length > 0) parts.push(`Lower row (left to right): ${describeSeq(baseSeq)}`);
      if (wallSeq.length > 0) parts.push(`Upper row: ${describeSeq(wallSeq)}`);
      if (tallSeq.length > 0) parts.push(`Tall: ${describeSeq(tallSeq)}`);
      summary += parts.join(". ");
      summaries.push(summary);
    }
    // Layout type
    let layoutType: PhotorealSceneInput["layoutType"] = "one-wall";
    if (cabWalls.length === 4) layoutType = "U-shaped";
    else if (cabWalls.length === 3) layoutType = "U-shaped";
    else if (cabWalls.length === 2) {
      const hasOpposite = (cabWalls.includes("Back wall") && cabWalls.includes("Front wall")) ||
        (cabWalls.includes("Left wall") && cabWalls.includes("Right wall"));
      layoutType = hasOpposite ? "galley" : "L-shaped";
    }
    if (island) layoutType = cabWalls.length <= 1 ? "peninsula" : layoutType;
    // Surfaces
    const flooringSurf = selectedSurfaces.find((s) => surfaceRole(s) === "flooring");
    const backsplashSurf = selectedSurfaces.find((s) => surfaceRole(s) === "backsplash");
    const sinkSurf = selectedSurfaces.find((s) => surfaceRole(s) === "sink");
    const faucetSurf = selectedSurfaces.find((s) => surfaceRole(s) === "faucet");
    const countertopSurf = selectedSurfaces.find((s) => surfaceRole(s) === "countertop");
    // Second finish
    let secondFinish: string | undefined;
    if (styleB != null && styleB !== styleA) {
      const s2 = doorStyles?.find((d) => d.id === styleB) as { ourName?: string | null; aliasName?: string | null } | undefined;
      if (s2) secondFinish = styleDisplayName(s2) || s2.ourName || undefined;
    }
    return {
      roomWidthFt: Math.round((room.width / 12) * 10) / 10,
      roomDepthFt: Math.round((room.depth / 12) * 10) / 10,
      ceilingFt: Math.round((roomCeiling(room) / 12) * 10) / 10,
      finishName: activeStyleName || undefined,
      doorStyle: activeStyle ? ((activeStyle as { doorStyle?: string | null }).doorStyle || activeStyleName || undefined) : undefined,
      secondFinishName: secondFinish,
      countertop: countertopSurf?.name || (countertopMaterialId !== DEFAULT_COUNTERTOP_MATERIAL_ID ? countertopMaterial(countertopMaterialId).name : undefined),
      hardware: hardwareStyleId !== "none" ? (HARDWARE_STYLES.find((h) => h.id === hardwareStyleId)?.label || undefined) : undefined,
      flooring: flooringSurf?.name || undefined,
      backsplash: backsplashSurf?.name || undefined,
      sink: sinkSurf?.name || undefined,
      faucet: faucetSurf?.name || undefined,
      wallSummaries: summaries.length > 0 ? summaries : undefined,
      cabinetWalls: cabWalls.length > 0 ? cabWalls : undefined,
      appliances: applianceList.length > 0 ? applianceList : undefined,
      layoutType,
      hasIsland: island != null,
    };
  }, [placed, room, island, selectedSurfaces, activeStyleName, activeStyle, styleA, styleB, doorStyles, countertopMaterialId, hardwareStyleId]);

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
              // Stamp the active color so Consultant-placed cabinets keep it.
              styleId: styleIdRef.current ?? null,
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

  // Selecting any one object on the canvas (cabinet / sink / wall opening)
  // clears the other selections, so there is exactly one "active" object the
  // Delete / Rotate controls act on. Without this, tapping a sink left the
  // cabinet selection (selectedUid) untouched and the Delete button — which was
  // gated on selectedUid — stayed disabled, so a sink could never be deleted.
  const selectCabinet = useCallback((uid: string | null) => {
    setSelectedUid(uid);
    if (uid) { setSelectedSinkUid(null); setSelectedOpeningUid(null); setSelectedPonyWallUid(null); }
  }, []);
  const selectSink = useCallback((uid: string | null) => {
    setSelectedSinkUid(uid);
    if (uid) { setSelectedUid(null); setSelectedOpeningUid(null); setSelectedPonyWallUid(null); }
  }, []);
  const selectOpening = useCallback((uid: string | null) => {
    setSelectedOpeningUid(uid);
    if (uid) { setSelectedUid(null); setSelectedSinkUid(null); setSelectedPonyWallUid(null); }
  }, []);
  const selectPonyWall = useCallback((uid: string | null) => {
    setSelectedPonyWallUid(uid);
    if (uid) { setSelectedUid(null); setSelectedSinkUid(null); setSelectedOpeningUid(null); }
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

  const moveCabinet = useCallback((uid: string, x: number, y: number, rotation?: number) => {
    setPlaced((prev) => {
      const cabinet = prev.find((p) => p.uid === uid);
      if (cabinet && isSinkBaseCabinet(cabinet)) {
        // Co-move any sink fixtures sitting on this sink base.
        // Calculate the delta from the cabinet's old position to the new one.
        const dx = x - cabinet.x;
        const dy = y - cabinet.y;
        if (dx !== 0 || dy !== 0) {
          // Get the cabinet's current footprint to check which sinks are on it.
          const fp = placedFootprint(cabinet);
          // placedFootprint returns { w, d } — combine with cabinet.x/y for bounds.
          const cabX = cabinet.x;
          const cabY = cabinet.y;
          setSinks((prevSinks) => prevSinks.map((s) => {
            // Check if the sink's center is within the cabinet's footprint.
            const sCx = s.x + s.width / 2;
            const sCy = s.y + s.depth / 2;
            const onCabinet =
              sCx >= cabX && sCx <= cabX + fp.w &&
              sCy >= cabY && sCy <= cabY + fp.d;
            return onCabinet ? { ...s, x: s.x + dx, y: s.y + dy } : s;
          }));
        }
      }
      return prev.map((p) => (p.uid === uid
        ? { ...p, x, y, ...(rotation != null ? { rotation } : {}) }
        : p));
    });
  }, [setSinks]);

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
          prev.filter((c) => c.uid !== p.uid && (c.placement === p.placement || c.placement === "appliance" || p.placement === "appliance"))
        );
        return { ...rotated, x: snapped.x, y: snapped.y };
      })
    );
  };

  const deleteSelected = () => {
    // Cabinet selection takes priority; otherwise delete a selected sink,
    // wall opening, or pony wall so EVERY selectable object on the canvas is
    // removable from the same Delete control (mobile toolbar + Delete/Backspace key).
    if (selectedUid) {
      if (cabinetsLocked) { toast.info("Cabinets are locked — click \"Lock Cabs\" to unlock first"); return; }
      setPlaced((prev) => prev.filter((p) => p.uid !== selectedUid));
      setSelectedUid(null);
      return;
    }
    if (selectedSinkUid) {
      deleteSink(selectedSinkUid);
      return;
    }
    if (selectedOpeningUid) {
      deleteOpening(selectedOpeningUid);
      setSelectedOpeningUid(null);
      return;
    }
    if (selectedPonyWallUid) {
      setPonyWalls((prev) => prev.filter((p) => p.uid !== selectedPonyWallUid));
      setSelectedPonyWallUid(null);
    }
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

  // Set an ABSOLUTE mount height (inches from floor to the box bottom) for a
  // specific cabinet — used by the elevation view's vertical drag / Arrow keys.
  // Wall cabinets only; clamped at 0.
  const setMountBottomFor = useCallback((uid: string, mountBottom: number) => {
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== uid || p.placement !== "wall") return p;
        return { ...p, mountBottom: Math.max(0, Math.round(mountBottom * 10) / 10) };
      })
    );
  }, []);

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
    // On mobile the editor lives in a bottom sheet (selection no longer auto-opens
    // it), so opening attributes must also open that sheet.
    setCabEditSheetOpen(true);
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
  // Auto-clear glassDoor when setting noDoor (can't have glass door on open unit).
  const setNoDoorFor = useCallback((uid: string, noDoor: boolean) => {
    setCabAttr(uid, noDoor ? { noDoor, glassDoor: false } : { noDoor });
  }, [setCabAttr]);

  // Set the handle/pull side for a specific cabinet.
  const setHandleSideFor = useCallback((uid: string, side: "left" | "right") => {
    setCabAttr(uid, { handleSide: side });
  }, [setCabAttr]);

  // Set the number of roll-out shelves added inside a specific base cabinet.
  // Unlimited quantity (clamped to >= 0); the matching same-line RS shelf is
  // resolved by the RollOutTrayPicker and flows into the BOM/order as line items.
  const setRolloutQtyFor = useCallback((uid: string, qty: number) => {
    setCabAttr(uid, { rolloutQty: Math.max(0, Math.floor(qty)) });
  }, [setCabAttr]);

  // Set per-item discount/surcharge percentage for a specific cabinet.
  // Negative = discount (e.g. -10 means 10% off), positive = surcharge.
  // Null clears any adjustment.
  const setDiscountPctFor = useCallback((uid: string, pct: number | null) => {
    setCabAttr(uid, { discountPct: pct });
  }, [setCabAttr]);

  // Apply the same discount to ALL cabinets sharing the same BOM group key.
  const setDiscountPctForGroup = useCallback((uids: string[], pct: number | null) => {
    setPlaced((prev) => prev.map((p) => uids.includes(p.uid) ? { ...p, discountPct: pct } : p));
  }, []);

  // Toggle glass door upgrade for a wall cabinet.
  // Auto-clear noDoor when enabling glassDoor (glass door = has a door).
  const setGlassDoorFor = useCallback((uid: string, glassDoor: boolean) => {
    setCabAttr(uid, glassDoor ? { glassDoor, noDoor: false } : { glassDoor });
  }, [setCabAttr]);

  // Whether the currently-open attributes cabinet has a GD variant in the catalog.
  // We check if a code ending in GD exists for the cabinet's masterCode.
  const glassDoorAvailableForAttr = useMemo(() => {
    if (!attrUid) return false;
    const cab = placed.find((p) => p.uid === attrUid);
    if (!cab || cab.placement !== "wall") return false;
    // The GD code pattern: append "GD" to the masterCode (e.g. W-30-30 → W-30-30GD)
    const gdCode = cab.masterCode + "GD";
    // Check if any cabinet in the wall cabinet pool has this code.
    return wallCabPoolRef.current.some((c) => c.masterCode === gdCode);
  }, [attrUid, placed]);

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
    if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
    const inheriting = placed.filter((p) => p.styleId == null).length;
    if (styleId != null && inheriting > 0) {
      const ok = window.confirm(t("dt_confirm_default_finish", { n: inheriting, s: inheriting === 1 ? "" : "s" }));
      if (!ok) return;
    }
    setStyleId(newStyleId);
  }, [styleId, placed, cabinetsLocked]);

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
    // When all cabinets are switched to the same style, update the main styleId
    // so trim (crown, toe kick, light rail, batten) also switches to match.
    if (targetStyle !== styleId) {
      setStyleId(targetStyle);
    }
  }, [selectedUid, placed, styleId]);

  // ── Two-color (two door styles) selector ───────────────────────────────────
  // Slot A is the primary door style. We mirror styleId -> styleA so the active
  // style and slot A stay in sync when A is active. Selecting a slot makes it
  // active and swaps styleId to that slot's style so the palette + the finish
  // stamped on new cabinets follow the highlighted color.
  useEffect(() => {
    if (activeSlot === "A") setStyleA(styleId);
  }, [styleId, activeSlot]);

  // Warehouse lock (one supply line per order): only engages when the FIRST
  // real cabinet is placed in the designer OR the cart already has items.
  // Picking a door style alone does NOT lock the distributor — the user can
  // freely browse all styles/lines until they commit by placing a cabinet.
  // Once locked, the user can override by acknowledging extra shipping costs
  // (handled in setSlotStyle), which sets mixedWarehouseOverride=true and
  // prevents re-locking.
  useEffect(() => {
    if (mixedWarehouseOverride) return; // user explicitly unlocked
    // Placed cabinets always take priority: lock to the distributor of the active style.
    if (placed.length > 0 && selectedStyleDistributorId != null) {
      setLockedDistributorId(selectedStyleDistributorId);
      return;
    }
    // No placed cabinets: clear any stale lock so the user can freely browse.
    if (placed.length === 0) {
      setLockedDistributorId(null);
      return;
    }
    // Placed cabinets exist but style distributor not yet loaded — wait.
    // (Don't apply cart lock here; it may conflict once the style loads.)
  }, [selectedStyleDistributorId, placed.length, mixedWarehouseOverride]);
  useEffect(() => { styleIdRef.current = styleId; }, [styleId]);
  useEffect(() => { styleBRef.current = styleB; }, [styleB]);

  // Click a color swatch: make that slot active. If the slot already has a
  // style, switch the active style to it so new cabinets use it.
  const selectColorSlot = useCallback((slot: "A" | "B") => {
    setActiveSlot(slot);
    const target = slot === "A" ? styleA : styleB;
    if (target != null) {
      setStyleId(target);
      // Keep lockedDistributorId in sync with the active slot's distributor
      // so the catalog query doesn't produce a cross-distributor mismatch.
      const source = (doorStyles ?? []) as Array<{ id: number; distributorId?: number }>;
      const distForSlot = source.find((d) => d.id === target)?.distributorId ?? null;
      if (distForSlot != null) setLockedDistributorId(distForSlot);
    }
  }, [styleA, styleB, doorStyles]);

  // Assign a door style to a slot (from the picker). Setting the active slot's
  // style also updates styleId. Slot B is the two-tone second color.
  const setSlotStyle = useCallback((slot: "A" | "B", newStyleId: number) => {
    const source = (doorStyles ?? []) as Array<{ id: number; distributorId?: number }>;
    const distNew = source.find((d) => d.id === newStyleId)?.distributorId ?? null;

    // Distributor override: if the design is locked to a distributor (cabinets
    // already placed) and the user picks a style from a DIFFERENT distributor,
    // ask them to acknowledge extra shipping costs. If they confirm, unlock the
    // distributor so they can mix supply lines.
    if (lockedDistributorId != null && distNew != null && distNew !== lockedDistributorId) {
      const ok = window.confirm(t("dt_dist_override_body"));
      if (!ok) return;
      // Unlock: clear the distributor lock so the palette shows all cabinets.
      // Set the override flag so the auto-lock effect doesn't re-engage.
      setLockedDistributorId(null);
      setMixedWarehouseOverride(true);
      toast.success(t("dt_dist_unlocked"));
    }

    // Enforce same-distributor rule for Color 2: must come from the same
    // distributor as Color 1 so the order stays within a single supply line
    // (unless the user already overrode the lock above).
    if (slot === "B" && styleA != null) {
      const distA = source.find((d) => d.id === styleA)?.distributorId ?? null;
      if (distA != null && distNew != null && distA !== distNew) {
        toast.error("Color 2 must be from the same supplier as Color 1. Please choose a style from the same line.");
        return;
      }
    }
    // If no active style is set yet (first pick), make THIS slot active so the
    // catalog populates immediately — otherwise picking a style into a
    // non-active slot would leave styleId null and the cabinet list empty
    // ("base cabinets gone" regression).
    const noStyleYet = styleId == null;
    if (slot === "A") {
      setStyleA(newStyleId);
      if (activeSlot === "A" || noStyleYet) {
        if (noStyleYet) setActiveSlot("A");
        setStyleId(newStyleId);
      }
    } else {
      setStyleB(newStyleId);
      if (activeSlot === "B" || noStyleYet) {
        if (noStyleYet) setActiveSlot("B");
        setStyleId(newStyleId);
      }
    }
    // Auto-open the catalog panel after picking a door style so the user
    // immediately sees the filtered cabinets available in that style.
    setMobilePanel("catalog");
  }, [activeSlot, styleId, styleA, doorStyles, lockedDistributorId, t]);

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
          prev.filter((c) => c.uid !== p.uid && (c.placement === p.placement || c.placement === "appliance" || p.placement === "appliance"))
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

  // Remove ALL instances in a panel group (the whole line item).
  const deleteWholeGroup = useCallback((uids: string[]) => {
    setPlaced((prev) => prev.filter((p) => !uids.includes(p.uid)));
    setSelectedUid((prev) => (prev && uids.includes(prev) ? null : prev));
  }, []);

  // Move a BOM line item up or down within its section list.
  const moveBomItem = useCallback(
    (sectionItems: Array<{ key: string }>, groupKey: string, direction: "up" | "down") => {
      const idx = sectionItems.findIndex((g) => g.key === groupKey);
      if (idx === -1) return;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sectionItems.length) return;
      // Build a new order map: assign explicit indices to all items in this section.
      setBomOrder((prev) => {
        const next = { ...prev };
        // Assign current positions first (preserving any existing order).
        sectionItems.forEach((g, i) => { next[g.key] = i; });
        // Swap the two affected items.
        const tmp = next[sectionItems[idx].key];
        next[sectionItems[idx].key] = next[sectionItems[targetIdx].key];
        next[sectionItems[targetIdx].key] = tmp;
        return next;
      });
    },
    []
  );

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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedSinkUid) {
        e.preventDefault();
        deleteSink(selectedSinkUid);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedPonyWallUid) {
        e.preventDefault();
        setPonyWalls((prev) => prev.filter((p) => p.uid !== selectedPonyWallUid));
        setSelectedPonyWallUid(null);
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
        setSelectedSinkUid(null);
        setSelectedPonyWallUid(null);
        setMeasureMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUid, deleteCabinet, selectedOpeningUid, deleteOpening, selectedSinkUid, deleteSink, selectedPonyWallUid, measureMode, rotateSelected, swingSelected, nudgeSelected]);

  const dragDataRef = useState<{ current: DesignCabinet | null }>(() => ({ current: null }))[0];

  // Load a saved design from ?load=<id> (e.g. opened from a CRM deal).
  useEffect(() => {
    if (loadDesignId == null || !savedDesign || loadedDesignRef.current === loadDesignId) return;
    loadedDesignRef.current = loadDesignId;
    const room = (savedDesign.roomData ?? null) as RoomData | null;
    const placedCabs = (savedDesign.placedCabinets ?? null) as PlacedCabinet[] | null;
    const savedSurfaces = (savedDesign as { selectedSurfaces?: SelectedSurface[] | null }).selectedSurfaces;
    loadSavedDesign({
      room: room ?? DEFAULT_ROOM,
      placed: Array.isArray(placedCabs) ? placedCabs : [],
      styleId: (savedDesign.selectedStyleId ?? null) as number | null,
      distributorId: (savedDesign as { selectedDistributorId?: number | null }).selectedDistributorId ?? null,
      roomType: (savedDesign as { roomType?: string | null }).roomType ?? null,
      selectedSurfaces: Array.isArray(savedSurfaces) ? savedSurfaces : null,
    });
    toast.success(t("dt_toast_loaded_design", { name: savedDesign.name }));
  }, [loadDesignId, savedDesign, loadSavedDesign]);

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
    valance,
    trimQtyOverride,
    countertop,
    countertopMaterialId,
    edgeProfileId,
    backsplashMaterialId,
    flooringMaterialId,
    selectedSurfaces,
    cabinetsLocked,
    sinks,
    roomType,
    activeWall,
    layoutLocked,
    lockedWalls: Array.from(lockedWalls),
    lockedDistributorId,
    mixedWarehouseOverride,
    hardwareStyleId,
    wallCabHeight,
    annotations,
    ponyWalls,
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

  // Restore once, after verification, unless we're loading a saved design.
  useEffect(() => {
    if (!verified || draftRestoredRef.current) return;
    if (loadDesignId != null) {
      // A saved-design load owns the canvas; skip draft restore but
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
          if (Array.isArray(d.placed)) {
            // Normalize appliance placement (same fix as loadSavedDesign)
            const normalizedDraft = (d.placed as PlacedCabinet[]).map((p) =>
              isApplianceCode(p.masterCode ?? "") && p.placement !== "appliance"
                ? { ...p, placement: "appliance" as const }
                : p
            );
            setPlaced(normalizeLCornerDepths(normalizedDraft));
          }
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
          if ("valance" in d) trimOverride.current.valance = true;
          setCrown(!!d.crown);
          setToeKick(!!d.toeKick);
          setBatten(!!d.batten);
          setLightRail(!!d.lightRail);
          setValance(!!d.valance);
          if (d.trimQtyOverride && typeof d.trimQtyOverride === "object") {
            const src = d.trimQtyOverride as Record<string, unknown>;
            const clean: Partial<Record<TrimKind, number>> = {};
            for (const k of ["crown", "toeKick", "batten", "lightRail", "valance"] as TrimKind[]) {
              if (typeof src[k] === "number") clean[k] = Math.max(0, Math.min(99, src[k] as number));
            }
            setTrimQtyOverride(clean);
          }
          setCountertop(!!d.countertop);
          if (typeof d.countertopMaterialId === "string") setCountertopMaterialId(d.countertopMaterialId);
          if (typeof d.edgeProfileId === "string") setEdgeProfileId(d.edgeProfileId);
          if (typeof d.backsplashMaterialId === "string") setBacksplashMaterialId(d.backsplashMaterialId);
          if (typeof d.flooringMaterialId === "string") setFlooringMaterialId(d.flooringMaterialId);
          if (typeof d.cabinetsLocked === "boolean") setCabinetsLocked(d.cabinetsLocked);
          // Restore the exact Pelican surface & fixture picks so the cart, the
          // 3D View gate and the plan/elevation fill all match the draft.
          if (Array.isArray(d.selectedSurfaces)) {
            setSelectedSurfaces(d.selectedSurfaces as SelectedSurface[]);
            applySurfaceRenderMaterials(d.selectedSurfaces as SelectedSurface[]);
          }
          if (Array.isArray(d.sinks)) setSinks(d.sinks);
          if (d.roomType) setRoomType(d.roomType);
          if (d.activeWall) setActiveWall(d.activeWall);
          setLayoutLocked(!!d.layoutLocked);
          if (Array.isArray(d.lockedWalls)) setLockedWalls(new Set(d.lockedWalls as WallSide[]));
          if (typeof d.lockedDistributorId === "number") setLockedDistributorId(d.lockedDistributorId);
          if (d.mixedWarehouseOverride === true) setMixedWarehouseOverride(true);
          if (typeof d.hardwareStyleId === "string") setHardwareStyleId(d.hardwareStyleId as HardwareStyleId);
          if (d.wallCabHeight === 30 || d.wallCabHeight === 36 || d.wallCabHeight === 42) {
            setWallCabHeight(d.wallCabHeight);
            wallCabHeightRef.current = d.wallCabHeight;
            wallCabHeightPromptedRef.current = true; // don't re-prompt
          }
          if (Array.isArray(d.annotations)) setAnnotations(d.annotations as PlanAnnotation[]);
          if (Array.isArray(d.ponyWalls)) setPonyWalls(d.ponyWalls as PonyWall[]);
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
  }, [verified, draftKey]);

  // Pre-select a door style from the ?style=<id> URL param (e.g. "Design with
  // this" CTA from the homepage). Fires once, after the draft has been restored,
  // so it doesn't conflict with a saved draft that already has a style.
  const preloadStyleAppliedRef = useRef(false);
  useEffect(() => {
    if (!verified || !draftRestoredRef.current || preloadStyleAppliedRef.current) return;
    if (preloadStyleId == null) return;
    if (!doorStyles || doorStyles.length === 0) return;
    preloadStyleAppliedRef.current = true;
    // Only apply if no style is already set (fresh canvas or empty draft).
    if (styleId != null) return;
    setSlotStyle("A", preloadStyleId);
  }, [verified, preloadStyleId, doorStyles, styleId, setSlotStyle]);

  // Consume the Surfaces & Fixtures wizard hand-off ONCE, after verification and
  // after the draft has been restored. This only fires when the customer clicked
  // "I'm ready to design my kitchen" in the wizard (which writes the dedicated
  // cd_surface_handoff key). Opening the Design Tool on its own never pulls in a
  // saved profile automatically — the hand-off is fully opt-in. We pre-select the
  // closest matching materials and pre-load the exact products so nothing is
  // re-typed, then consume (clear) the signal.
  useEffect(() => {
    if (!verified || !draftRestoredRef.current) return;
    if (surfaceSelectionAppliedRef.current) return;
    if (loadDesignId != null) {
      // Loading a saved design takes precedence over a wizard hand-off.
      surfaceSelectionAppliedRef.current = true;
      return;
    }
    surfaceSelectionAppliedRef.current = true;
    const sel = takeSurfaceHandoff();
    if (!sel) return;
    try {
      const surfaces: SelectedSurface[] = [];
      let applied = 0;
      (Object.keys(sel.picks) as SurfaceRole[]).forEach((role) => {
        const pick = sel.picks[role];
        if (!pick) return;
        if (role === "flooring") {
          const id = guessFlooringMaterialId(pick);
          if (id) setFlooringMaterialId(id);
          applied++;
        } else if (role === "tile") {
          const id = guessBacksplashMaterialId(pick);
          if (id) setBacksplashMaterialId(id);
          applied++;
        } else if (role === "countertop") {
          const id = guessCountertopMaterialId(pick);
          if (id) setCountertopMaterialId(id);
          setCountertop(true);
          applied++;
        }
        // Carry the exact product into the Surfaces & Fixtures list for every role.
        surfaces.push({
          id: pick.id,
          slug: pick.slug,
          name: pick.name,
          category: pick.category,
          subCategory: pick.subCategory ?? null,
          size: pick.size ?? null,
          imageUrl: pick.imageUrl ?? null,
          sellPrice: pick.sellPrice ?? null,
        });
      });
      if (surfaces.length > 0) {
        setSelectedSurfaces((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          return [...prev, ...surfaces.filter((s) => !seen.has(s.id))];
        });
      }
      if (applied > 0 || surfaces.length > 0) {
        toast.success("Loaded your Surfaces & Fixtures selections into the design.");
      }
    } catch {
      /* corrupt hand-off — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, draftKey, loadDesignId]);

  // Debounced save on any design change.
  useEffect(() => {
    if (!draftRestoredRef.current) return;
    const t = setTimeout(writeDraft, 400);
    return () => clearTimeout(t);
  }, [room, placed, openings, island, styleId, tier, crown, toeKick, batten, lightRail, valance, trimQtyOverride, countertop, countertopMaterialId, edgeProfileId, backsplashMaterialId, flooringMaterialId, cabinetsLocked, sinks, roomType, activeWall, layoutLocked, lockedWalls, lockedDistributorId, mixedWarehouseOverride, hardwareStyleId, wallCabHeight, annotations, writeDraft]);

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

  // Mobile cabinet-edit bottom sheet: auto-opens when a cabinet is selected on
  // mobile, auto-closes when deselected. On desktop the inline contextual row
  // is used instead.
  const [cabEditSheetOpen, setCabEditSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);


  // Signals to open the Save / My Plans dialogs from the mobile "More" sheet
  // (the DesignActions toolbar itself is desktop-only / hidden on phones).
  const [saveSignal, setSaveSignal] = useState(0);
  // Distributor conflict dialog state
  const [distConflictOpen, setDistConflictOpen] = useState(false);
  const [distConflictResolve, setDistConflictResolve] = useState<((ok: boolean) => void) | null>(null);
  // Rename dialog (opened from the mobile save success toast)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDesignId, setRenameDesignId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameMut = trpc.design.rename.useMutation({
    onSuccess: () => {
      toast.success("Design renamed", { description: renameValue });
      setRenameDialogOpen(false);
    },
    onError: (e) => toast.error("Rename failed", { description: e.message }),
  });
  const [loadSignal, setLoadSignal] = useState(0);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  // (Generic flooring/backsplash swatch sheets removed — surfaces now come from
  //  real Pelican recommendations in the "Surfaces" palette tab.)
  const [hardwareSheetOpen, setHardwareSheetOpen] = useState(false);
  const [trimSheetOpen, setTrimSheetOpen] = useState(false);
  // Flag: set to true when a cabinet is freshly placed from the palette so the
  // edit sheet does NOT auto-open. Only open the sheet when the user taps an
  // existing cabinet on the canvas.
  const justPlacedRef = useRef(false);
  // Guard against double-placement: on mobile a tap fires both touchend and
  // click, which would call addCabinet twice. Block re-entry for 500 ms after
  // the first call so the second synthetic event is a no-op.
  const isAddingRef = useRef(false);
  // Sync sheet open state with selection on mobile
  useEffect(() => {
    if (!isMobile) return;
    // Single tap now opens the bottom sheet immediately so the designer can
    // see the Door & Drawer Layout diagram and cabinet details right away.
    if (selectedCab || selectedOpening) {
      if (!justPlacedRef.current) {
        setCabEditSheetOpen(true);
      }
    } else {
      setCabEditSheetOpen(false);
    }
    if (justPlacedRef.current) {
      justPlacedRef.current = false;
    }
  }, [isMobile, selectedCab?.uid, selectedOpening?.uid]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!verified) {
    return (
      <EmailGate onVerified={handleVerified} />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="border-b border-border bg-card px-3 py-1.5 flex items-center gap-1.5 flex-nowrap shrink-0 overflow-x-auto scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Title + badge — desktop only */}
        <div className="hidden lg:flex items-center gap-2">
          <h1 className="font-serif text-sm font-bold text-foreground whitespace-nowrap">
            {t("dt_sh_title_desktop")}
          </h1>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("dt_sh_items", { n: placed.length })}</Badge>
        </div>

        <div className="hidden lg:block h-5 w-px bg-border" />

        {/* Room size editor + mouse-draw mode — desktop only (mobile uses More sheet). */}
        <div className={`hidden lg:block ${layoutLocked ? "pointer-events-none opacity-50" : ""}`} title={layoutLocked ? t("dt_sh_unlock_to_edit_room") : undefined}>
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
            isPolygon={isPolygonRoom}
            onTogglePolygon={() => {
              if (layoutLocked) return;
              if (!isPolygonRoom) {
                // Convert current rectangle to polygon
                import("@/lib/polygonRoom").then(({ rectToPolygon }) => {
                  const { vertices, customWalls } = rectToPolygon(room.width, room.depth);
                  setRoom((prev) => ({ ...prev, vertices, customWalls }));
                });
                setPolygonEditMode(true);
                setDrawMode(false);
                setMeasureMode(false);
                toast.success("Custom shape mode — split walls and drag vertices to create bump-outs");
              } else {
                setPolygonEditMode((v) => !v);
              }
            }}
          />
        </div>

        {/* Mobile room size indicator — icon-only button with tooltip */}
        <button
          className="lg:hidden inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          onClick={() => setMobilePanel((p) => p === "room" ? null : "room")}
          title={`Room: ${Math.round(room.width / 12)}' × ${Math.round(room.depth / 12)}' · ${placed.length} items`}
        >
          <SquareDashedMousePointer className="h-4 w-4" />
        </button>

        

        {/* Active wall selector: highlights a wall; new items drop on it and it
            can be dragged on the canvas to resize the room on that side.
            Desktop-only — on mobile these live in the "More" menu to save space. */}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground">{t("dt_sh_wall")}</span>
          <div className="flex items-center rounded-md border border-border p-0.5 bg-muted/30 overflow-x-auto">
            {isPolygonRoom && room.customWalls ? (
              // Polygon mode: show custom wall segment tabs
              room.customWalls.map((cw) => (
                <button
                  key={cw.id}
                  onClick={() => { setActiveWall(cw.id as any); setDrawMode(false); }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
                    activeWall === cw.id ? "bg-[#d4a75a] text-[#1a2744]" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cw.label || cw.id.slice(0, 6)}
                </button>
              ))
            ) : (
              // Classic rectangle mode: 4 fixed walls
              (["top", "left", "right", "bottom"] as WallSide[]).map((w) => {
                const wLocked = layoutLocked || lockedWalls.has(w);
                return (
                  <div key={w} className="flex items-center">
                    <button
                      onClick={() => { setActiveWall(w); setDrawMode(false); }}
                      title={t("dt_sh_wall_highlight", { wall: wallLabel[w] })}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
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
              })
            )}
          </div>
          <button
            onClick={() => {
              setLayoutLocked((v) => !v);
              setDrawMode(false);
              toast.success(!layoutLocked ? t("dt_sh_layout_locked_toast") : t("dt_sh_layout_unlocked_toast"));
            }}
            title={layoutLocked ? t("dt_sh_unlock_plan") : t("dt_sh_lock_plan")}
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors ${
              layoutLocked ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {layoutLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={autoFillActiveWall}
            disabled={layoutLocked}
            title={t("dt_sh_autofill_title", { wall: wallLabel[activeWall] })}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[#d4a75a]/60 bg-[#d4a75a]/10 text-[#1a2744] transition-colors hover:bg-[#d4a75a]/20 disabled:opacity-40"
          >
            <Wand2 className="h-3.5 w-3.5" />
          </button>

        </div>

        <div className="hidden lg:block h-5 w-px bg-border" />

        {/* View toggle — grouped pill with subtle background */}
        <div className="hidden lg:flex items-center rounded-md border border-border bg-muted/30 p-0.5 gap-0.5">
          <button
            onClick={() => setViewMode("plan")}
            title={t("dt_sh_birdseye")}
            className={`inline-flex items-center justify-center h-6 w-7 rounded transition-colors ${
              viewMode === "plan" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("elevation")}
            title={t("dt_sh_front_view")}
            className={`inline-flex items-center justify-center h-6 w-7 rounded transition-colors ${
              viewMode === "elevation" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("split")}
            title={t("dt_sh_split")}
            className={`inline-flex items-center justify-center h-6 w-7 rounded transition-colors ${
              viewMode === "split" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("corner")}
            title={t("dt_sh_corner_title")}
            className={`inline-flex items-center justify-center h-6 w-7 rounded transition-colors ${
              viewMode === "corner" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <ScanLine className="h-3.5 w-3.5" />
          </button>
          {island && (
            <button
              onClick={() => setViewMode("island")}
              title="Island elevation preview"
              className={`inline-flex items-center justify-center h-6 w-7 rounded transition-colors ${
                viewMode === "island" ? "bg-[#d4a75a] text-[#1a2744]" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
                <div className="hidden lg:block h-5 w-px bg-border" />
        {/* Save Design — desktop only */}
        <button
          type="button"
          className="hidden lg:inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
          title="Save design"
          onClick={() => setSaveSignal((n) => n + 1)}
        >
          <Save className="h-3.5 w-3.5" />
        </button>
        {/* Start New / Clear Design — desktop only */}
        <button
          type="button"
          className="hidden lg:inline-flex items-center justify-center h-7 w-7 rounded-md border border-destructive/40 text-destructive transition-colors hover:bg-destructive/10"
          title="Start new design (clears all cabinets)"
          onClick={() => {
            if (placed.length > 0 && !window.confirm(t("dt_sh_start_new_confirm"))) return;
            setPlaced([]);
            setOpenings([]);
            setIsland(null);
            setSelectedUid(null);
            setSelectedOpeningUid(null);
            setSinks([]);
            setSelectedSinkUid(null);
            setFurniture([]);
            setSelectedFurnUid(null);
            setPonyWalls([]);
            setSelectedPonyWallUid(null);
            setCrown(false); setToeKick(false); setBatten(false); setLightRail(false); setCountertop(false); setValance(false);
            setHardwareStyleId(DEFAULT_HARDWARE_STYLE_ID);
            setBacksplashMaterialId(null);
            setFlooringMaterialId(null);
            setCabinetsLocked(false);
            setConsultMessages([]);
            setConsultOpen(false);
            clearDraft();
            toast.success(t("dt_sh_started_new"));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {/* Printable graph-paper worksheet */}
        <a
          href="/plan-sheet"
          target="_blank"
          rel="noopener noreferrer"
          title={t("dt_sh_print_title")}
          className="hidden lg:inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
        >
          <Printer className="h-3.5 w-3.5" />
        </a>
        {/* Export current view as PNG */}
        <button
          type="button"
          title="Export view as PNG"
          className="hidden lg:inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
          onClick={async () => {
            const el = canvasExportRef.current;
            if (!el) return;
            toast.info("Exporting image…");
            try {
              const { toPng } = await import("html-to-image");
              const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true });
              const link = document.createElement("a");
              link.download = `cabinet-design-${activeWall}-${Date.now()}.png`;
              link.href = dataUrl;
              link.click();
              toast.success("Image exported!");
            } catch (err) {
              console.error(err);
              toast.error("Export failed — please try again");
            }
          }}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {/* Preview modes — desktop toolbar button */}
        {placed.length > 0 && (
          <button
            type="button"
            onClick={() => setPreviewModalOpen(true)}
            title="Preview design"
            className="hidden lg:inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Mobile: icon-only compact buttons in top bar */}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          {/* View mode buttons */}
          <button
            title="Bird's-eye plan view"
            onClick={() => setViewMode("plan")}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
              viewMode === "plan" ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            title="Front elevation view"
            onClick={() => setViewMode("elevation")}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
              viewMode === "elevation" ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            title="Split view (plan + elevation)"
            onClick={() => setViewMode("split")}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
              viewMode === "split" ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Columns3 className="h-4 w-4" />
          </button>
          <button
            title="Corner view"
            onClick={() => setViewMode("corner")}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
              viewMode === "corner" ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <ScanLine className="h-4 w-4" />
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          {/* Style button — icon only */}
          <button
            title="Door style"
            onClick={() => setMobilePanel((p) => p === "style" ? null : "style")}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
              mobilePanel === "style" ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Palette className="h-4 w-4" />
          </button>
          {/* Save button — icon only */}
          <button
            title="Save design"
            disabled={placed.length === 0}
            onClick={() => setSaveSignal((n) => n + 1)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
          </button>
          {/* More button */}
          <button
            title="More options"
            onClick={() => setMoreSheetOpen(true)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {/* ── Main "More" sheet ─────────────────────────────────────── */}
          <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
            <SheetContent side="bottom" className="flex flex-col rounded-t-2xl p-0" style={{ maxHeight: "min(92vh, calc(100dvh - 2rem))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle className="text-base">{t("dt_sh_more")}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>

                {/* Active wall selector */}
                <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dt_sh_active_wall")}</p>
                <div className={`grid gap-1 px-3 pb-2 ${isPolygonRoom && room.customWalls ? "grid-cols-3" : "grid-cols-4"}`}>
                  {isPolygonRoom && room.customWalls ? (
                    room.customWalls.map((cw) => (
                      <button
                        key={cw.id}
                        onClick={() => { setActiveWall(cw.id as any); setDrawMode(false); }}
                        className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                          activeWall === cw.id ? "bg-[#d4a75a] text-[#1a2744]" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {cw.label || cw.id.slice(0, 6)}
                      </button>
                    ))
                  ) : (
                    (["top", "left", "right", "bottom"] as WallSide[]).map((w) => (
                      <button
                        key={w}
                        onClick={() => { setActiveWall(w); setDrawMode(false); }}
                        className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                          activeWall === w ? "bg-[#d4a75a] text-[#1a2744]" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {wallLabel[w]}
                      </button>
                    ))
                  )}
                </div>

                {/* Wall cabinet height selector (mobile) */}
                <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dt_wall_height_label")}</p>
                <div className="grid grid-cols-3 gap-1 px-3 pb-2">
                  {([30, 36, 42] as const).map((h) => (
                    <button
                      key={h}
                      onClick={() => { setWallCabHeight(h); wallCabHeightRef.current = h; wallCabHeightPromptedRef.current = true; }}
                      className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                        wallCabHeight === h ? "bg-[#d4a75a] text-[#1a2744]" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {h}"
                    </button>
                  ))}
                </div>

                {/* Quick-action rows */}
                <div className="px-1 pb-1">
                  <button disabled={layoutLocked} onClick={autoFillActiveWall} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors">
                    <Wand2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_autofill_active")}</span>
                  </button>
                  <button disabled={layoutLocked || roomType !== "kitchen"} onClick={() => { setMoreSheetOpen(false); buildBuiltinFridgeRun(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors">
                    <Refrigerator className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_builtin_fridge")}</span>
                  </button>
                  <button onClick={() => { setLayoutLocked((v) => !v); setDrawMode(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                    {layoutLocked ? <Lock className="h-4 w-4 text-muted-foreground shrink-0" /> : <LockOpen className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="flex-1 text-left">{t("dt_sh_lock_layout")}</span>
                    {layoutLocked && <Check className="h-3.5 w-3.5 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => { setMeasureMode((m) => !m); setSelectedUid(null); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                    <Ruler className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_measure")}</span>
                    {measureMode && <Check className="h-3.5 w-3.5 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => { setMoreSheetOpen(false); const text = window.prompt(t("dt_ann_prompt")); if (text && text.trim()) setAnnotations((prev) => [...prev, makeAnnotation(room.width / 2, room.depth / 2, text.trim())]); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                    <StickyNote className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_ann_add")}</span>
                  </button>
                  <button onClick={() => setAutoDimensions((d) => !d)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                    <Ruler className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_auto_dim")}</span>
                    {autoDimensions && <Check className="h-3.5 w-3.5 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => setIsland((cur) => cur ? null : { width: Math.min(48, room.width - 24), depth: Math.min(24, room.depth - 24), x: Math.max(0, room.width / 2 - 24), y: Math.max(0, room.depth / 2 - 12) })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                    <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_island_zone")}</span>
                    {!!island && <Check className="h-3.5 w-3.5 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => { setMoreSheetOpen(false); setPonyWalls((prev) => [...prev, makePonyWall(room)]); toast.success("Pony wall added — drag to position, resize with handle"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                    <Columns3 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">Add Pony Wall</span>
                    {ponyWalls.length > 0 && <span className="text-xs text-muted-foreground">{ponyWalls.length}</span>}
                  </button>
                  <button disabled={layoutLocked} onClick={addManualFiller} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors">
                    <Columns3 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_add_filler")}</span>
                  </button>
                  <button disabled={layoutLocked} onClick={addCeilingFiller} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors">
                    <Columns3 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_ceiling_filler")}</span>
                  </button>
                  <button disabled={!selectedUid || measureMode} onClick={swingSelected} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors">
                    <DoorOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_swing_door")}</span>
                  </button>
                  <button onClick={() => setConsultOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors">
                    <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_consultant_menu")}</span>
                  </button>

                </div>

                <div className="mx-3 my-1 border-t border-border" />

                {/* Save / open plans — the desktop Save toolbar is hidden on phones,
                    so surface it here. */}
                <div className="px-1 pb-1">
                  <button
                    disabled={placed.length === 0}
                    onClick={() => { setMoreSheetOpen(false); setTimeout(() => setSaveSignal((n) => n + 1), 120); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    <Save className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_save_plan")}</span>
                  </button>
                  <button
                    onClick={() => { setMoreSheetOpen(false); setTimeout(() => setLoadSignal((n) => n + 1), 120); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                  >
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t("dt_sh_my_plans")}</span>
                  </button>
                </div>

                <div className="mx-3 my-1 border-t border-border" />

                {/* Section popup launchers */}
                <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Finishes &amp; Trim</p>
                <div className="px-1 pb-1">

                  {/* Flooring & Backsplash are now chosen from real Pelican
                      recommendations in the "Surfaces" palette tab (generic
                      swatch pickers removed). */}
                  <button
                    onClick={() => { setMoreSheetOpen(false); setPaletteType("surfaces"); setMobilePanel("catalog"); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted transition-colors"
                  >
                    <Waves className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left text-sm font-medium">Flooring, Backsplash &amp; Surfaces</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>

                  {/* Hardware */}
                  <button
                    onClick={() => { setMoreSheetOpen(false); setTimeout(() => setHardwareSheetOpen(true), 120); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted transition-colors"
                  >
                    <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left text-sm font-medium">{t("dt_sh_hardware")}</span>
                    {hardwareStyleId !== "none" && (
                      <span className="text-[10px] text-muted-foreground mr-1">
                        {HARDWARE_STYLES.find((h) => h.id === hardwareStyleId)?.label}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>

                  {/* Trim */}
                  <button
                    onClick={() => { setMoreSheetOpen(false); setTimeout(() => setTrimSheetOpen(true), 120); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted transition-colors"
                  >
                    <CrownIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left text-sm font-medium">{t("dt_sh_trim_front")}</span>
                    {(crown || toeKick || batten || lightRail || valance || countertop) && (
                      <span className="text-[10px] text-muted-foreground mr-1">
                        {[crown && "Crown", toeKick && "Toe Kick", batten && "Batten", lightRail && "Light Rail", valance && "Valance", countertop && "Top"].filter(Boolean).join(", ")}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mx-3 my-1 border-t border-border" />

                {/* Order summary */}
                <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dt_sh_order_section")}</p>
                {cartableLines.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">{t("dt_sh_order_empty")}</div>
                ) : (
                  <div className="px-2 pb-2">
                    {hasConflicts && (
                      <div className="mb-1.5 flex items-start gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[10px] text-red-700">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
                        {t("dt_sh_order_conflicts", { n: conflictUids.size, s: conflictUids.size > 1 ? "s" : "" })}
                      </div>
                    )}
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                      <ul className="divide-y divide-border">
                        {cartableLines.map((line) => (
                          <li key={`${line.masterCode}-${line.styleId}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 font-medium text-foreground">
                                <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px]">{line.qty}×</span>
                                <span className="truncate">{line.masterCode}</span>
                              </div>
                              {line.styleLabel && (
                                <div className="truncate text-[10px] text-muted-foreground">{line.styleLabel}</div>
                              )}
                              {line.qtyNote && (
                                <div className="truncate text-[10px] text-blue-500">{line.qtyNote}</div>
                              )}
                            </div>
                            <span className="shrink-0 font-medium text-foreground">
                              {line.unitPrice != null ? `$${(line.unitPrice * line.qty).toFixed(2)}` : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      type="button"
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#a87f33] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#a87f33]/90 active:scale-[0.97] disabled:opacity-50"
                      disabled={cartableLines.length === 0}
                      onClick={() => {
                        if (hasConflicts && !window.confirm(
                          t("dt_confirm_export_conflicts", { n: conflictUids.size, s: conflictUids.size > 1 ? "s" : "" })
                        )) return;
                        addAllToCart();
                      }}
                    >
                      <ShoppingCart className="h-4 w-4" /> {t("dt_sh_add_to_cart")}
                    </button>
                  </div>
                )}

                                <div className="mx-3 my-1 border-t border-border" />
                {/* Preview modes — mobile menu entry */}
                <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visualization</p>
                <div className="px-1 pb-1">
                  <button
                    type="button"
                    disabled={placed.length === 0}
                    onClick={() => { setMoreSheetOpen(false); setTimeout(() => setPreviewModalOpen(true), 150); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Eye className="h-5 w-5 shrink-0 text-[#1a2744]" />
                    <span className="font-medium">Preview</span>
                  </button>
                </div>
                <div className="mx-3 my-1 border-t border-border" />
                {/* Danger zone */}
                <div className="px-1 pb-4">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    onClick={() => {
                      if (placed.length > 0 && !window.confirm(t("dt_sh_start_new_confirm"))) return;
                      setPlaced([]);
                      setOpenings([]);
                      setIsland(null);
                      setSelectedUid(null);
                      setSelectedOpeningUid(null);
                      setSinks([]);
                      setSelectedSinkUid(null);
                      setFurniture([]);
                      setSelectedFurnUid(null);
                      setPonyWalls([]);
                      setSelectedPonyWallUid(null);
                      setCrown(false); setToeKick(false); setBatten(false); setLightRail(false); setCountertop(false); setValance(false);
                      setHardwareStyleId(DEFAULT_HARDWARE_STYLE_ID);
                      setBacksplashMaterialId(null);
                      setFlooringMaterialId(null);
                      setCabinetsLocked(false);
                      setConsultMessages([]);
                      setConsultOpen(false);
                      clearDraft();
                      toast.success(t("dt_sh_started_new"));
                      setMoreSheetOpen(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span>{t("dt_sh_start_new")}</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Generic flooring & backsplash swatch sub-sheets removed — surfaces
              are now chosen from real Pelican recommendations in the "Surfaces"
              palette tab. */}

          {/* ── Hardware sub-sheet ───────────────────────────────────────── */}
          <Sheet open={hardwareSheetOpen} onOpenChange={setHardwareSheetOpen}>
            <SheetContent side="bottom" className="flex flex-col rounded-t-2xl p-0" style={{ maxHeight: "min(92vh, calc(100dvh - 2rem))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
              <SheetHeader className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setHardwareSheetOpen(false); setTimeout(() => setMoreSheetOpen(true), 120); }}
                    className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <SheetTitle className="text-base">{t("dt_sh_hardware")}</SheetTitle>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: "touch" }}>
                <p className="mb-3 text-xs text-muted-foreground">Choose the hardware style for doors and drawers. This is a finishing spec — hardware is not priced in the catalog.</p>
                <div className="space-y-2">
                  {HARDWARE_STYLES.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setHardwareStyleId(h.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        hardwareStyleId === h.id
                          ? "border-[#1a2744] bg-[#1a2744]/8"
                          : "border-border hover:border-[#1a2744]/40 hover:bg-muted/40"
                      }`}
                    >
                      <Wrench className={`h-5 w-5 shrink-0 ${hardwareStyleId === h.id ? "text-[#1a2744]" : "text-muted-foreground"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${hardwareStyleId === h.id ? "text-[#1a2744]" : "text-foreground"}`}>{h.label}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight">{h.description}</div>
                      </div>
                      {hardwareStyleId === h.id && <Check className="h-4 w-4 shrink-0 text-[#1a2744]" />}
                    </button>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* ── Trim sub-sheet ───────────────────────────────────────────── */}
          <Sheet open={trimSheetOpen} onOpenChange={setTrimSheetOpen}>
            <SheetContent side="bottom" className="flex flex-col rounded-t-2xl p-0" style={{ maxHeight: "min(92vh, calc(100dvh - 2rem))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
              <SheetHeader className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setTrimSheetOpen(false); setTimeout(() => setMoreSheetOpen(true), 120); }}
                    className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <SheetTitle className="text-base">{t("dt_sh_trim_front")}</SheetTitle>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: "touch" }}>
                <p className="mb-3 text-xs text-muted-foreground">Toggle trim items on or off. These are auto-calculated for the front-view elevation and included in the build sheet.</p>
                <div className="space-y-2">
                  <button onClick={() => { trimOverride.current.crown = true; setCrown((c) => !c); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${ crown ? "border-[#1a2744] bg-[#1a2744]/8" : "border-border hover:border-[#1a2744]/40 hover:bg-muted/40" }`}>
                    <CrownIcon className={`h-5 w-5 shrink-0 ${crown ? "text-[#1a2744]" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${crown ? "text-[#1a2744]" : "text-foreground"}`}>{t("dt_sh_crown")}</div>
                      <div className="text-[11px] text-muted-foreground">Applied to top of wall cabinets</div>
                    </div>
                    {crown && <Check className="h-4 w-4 shrink-0 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => { trimOverride.current.toeKick = true; setToeKick((tk) => !tk); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${ toeKick ? "border-[#1a2744] bg-[#1a2744]/8" : "border-border hover:border-[#1a2744]/40 hover:bg-muted/40" }`}>
                    <Columns3 className={`h-5 w-5 shrink-0 ${toeKick ? "text-[#1a2744]" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${toeKick ? "text-[#1a2744]" : "text-foreground"}`}>{t("dt_sh_toe_kick")}</div>
                      <div className="text-[11px] text-muted-foreground">Applied to base of base cabinets</div>
                    </div>
                    {toeKick && <Check className="h-4 w-4 shrink-0 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => { trimOverride.current.batten = true; setBatten((b) => !b); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${ batten ? "border-[#1a2744] bg-[#1a2744]/8" : "border-border hover:border-[#1a2744]/40 hover:bg-muted/40" }`}>
                    <PanelTop className={`h-5 w-5 shrink-0 ${batten ? "text-[#1a2744]" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${batten ? "text-[#1a2744]" : "text-foreground"}`}>{t("dt_sh_batten")}</div>
                      <div className="text-[11px] text-muted-foreground">Batten molding (BAM) at cabinet seams</div>
                    </div>
                    {batten && <Check className="h-4 w-4 shrink-0 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => { trimOverride.current.lightRail = true; setLightRail((l) => !l); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${ lightRail ? "border-[#1a2744] bg-[#1a2744]/8" : "border-border hover:border-[#1a2744]/40 hover:bg-muted/40" }`}>
                    <Ruler className={`h-5 w-5 shrink-0 ${lightRail ? "text-[#1a2744]" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${lightRail ? "text-[#1a2744]" : "text-foreground"}`}>{t("dt_sh_light_rail")}</div>
                      <div className="text-[11px] text-muted-foreground">Under-cabinet light rail molding</div>
                    </div>
                    {lightRail && <Check className="h-4 w-4 shrink-0 text-[#1a2744]" />}
                  </button>
                  <button onClick={() => { trimOverride.current.valance = true; setValance((v) => !v); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${ valance ? "border-[#1a2744] bg-[#1a2744]/8" : "border-border hover:border-[#1a2744]/40 hover:bg-muted/40" }`}>
                    <PanelTop className={`h-5 w-5 shrink-0 ${valance ? "text-[#1a2744]" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${valance ? "text-[#1a2744]" : "text-foreground"}`}>{t("dt_sh_valance")}</div>
                      <div className="text-[11px] text-muted-foreground">Arched valance above windows</div>
                    </div>
                    {valance && <Check className="h-4 w-4 shrink-0 text-[#1a2744]" />}
                  </button>
                  <button onClick={toggleCountertop} disabled={!countertop && !hasBaseRun} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${ countertop ? "border-[#1a2744] bg-[#1a2744]/8" : "border-border hover:border-[#1a2744]/40 hover:bg-muted/40" }`}>
                    <Square className={`h-5 w-5 shrink-0 ${countertop ? "text-[#1a2744]" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${countertop ? "text-[#1a2744]" : "text-foreground"}`}>{t("dt_sh_countertop")}</div>
                      <div className="text-[11px] text-muted-foreground">Measured for a countertop quote</div>
                    </div>
                    {countertop && <Check className="h-4 w-4 shrink-0 text-[#1a2744]" />}
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop action cluster */}
        <div className="hidden lg:flex items-center gap-1">
          {/* Undo / Redo */}
          <Button variant="outline" size="icon" onClick={handleUndo} className="h-7 w-7" title={t("dt_sh_undo")}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleRedo} className="h-7 w-7" title={t("dt_sh_redo")}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <div className="h-5 w-px bg-border mx-0.5" />
          {/* Measure / Dimensions */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => { setMeasureMode((m) => !m); setSelectedUid(null); }}
            title={t("dt_sh_measure")}
            className={`h-7 w-7 ${measureMode ? "bg-[#d4a75a] text-[#1a2744] border-[#d4a75a] hover:bg-[#c89945]" : ""}`}
          >
            <Ruler className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setAutoDimensions((d) => !d)}
            title={t("dt_sh_auto_dim")}
            className={`h-7 w-7 ${autoDimensions ? "bg-[#d4a75a] text-[#1a2744] border-[#d4a75a] hover:bg-[#c89945]" : ""}`}
          >
            <Ruler className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title={t("dt_ann_add")}
            onClick={() => {
              const text = window.prompt(t("dt_ann_prompt"));
              if (text && text.trim()) {
                setAnnotations((prev) => [...prev, makeAnnotation(room.width / 2, room.depth / 2, text.trim())]);
              }
            }}
            className="h-7 w-7"
          >
            <StickyNote className="h-3.5 w-3.5" />
          </Button>
          <div className="h-5 w-px bg-border mx-0.5" />
          {/* Selected-item actions */}
          <Button variant="outline" size="icon" disabled={!selectedUid || measureMode} onClick={rotateSelected} className="h-7 w-7" title={`${t("dt_sh_rotate")} (R)`}>
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" disabled={!selectedUid || measureMode} onClick={swingSelected} className="h-7 w-7" title={`${t("dt_sh_swing")} (S)`}>
            <DoorOpen className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" disabled={(!selectedUid && !selectedSinkUid && !selectedOpeningUid && !selectedPonyWallUid) || measureMode} onClick={deleteSelected} className="h-7 w-7 text-destructive" title={t("dt_sh_delete")}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <div className="h-5 w-px bg-border mx-0.5" />
          {/* Lock Cabs */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setCabinetsLocked((v) => !v);
              toast.success(!cabinetsLocked ? "Cabinets locked — positions are frozen" : "Cabinets unlocked — you can move them again");
            }}
            title={cabinetsLocked ? "Unlock cabinets (allow moving)" : "Lock cabinets (freeze positions)"}
            className={`relative h-7 w-7 ${
              cabinetsLocked ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600" : ""
            }`}
          >
            {cabinetsLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          </Button>
          {/* More ▾ dropdown — Island, Crown, Toe Kick, Batten, Light Rail, Valance, Filler, Countertop */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="relative h-7 w-7" title="More tools">
                <MoreHorizontal className="h-3.5 w-3.5" />
                {(island || crown || toeKick || batten || lightRail || valance || countertop) && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#d4a75a]" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Room Features</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={!!island}
                onCheckedChange={() =>
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
              >
                <Square className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_island")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Trim & Molding</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={crown}
                onCheckedChange={() => { trimOverride.current.crown = true; setCrown((c) => !c); }}
              >
                <PanelTop className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_crown_btn")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={toeKick}
                onCheckedChange={() => { trimOverride.current.toeKick = true; setToeKick((tk) => !tk); }}
              >
                <Columns3 className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_toe_kick_btn")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={batten}
                onCheckedChange={() => { trimOverride.current.batten = true; setBatten((b) => !b); }}
              >
                <Columns3 className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_batten_btn")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={lightRail}
                onCheckedChange={() => { trimOverride.current.lightRail = true; setLightRail((l) => !l); }}
              >
                <PanelTop className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_light_rail_btn")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={valance}
                onCheckedChange={() => { trimOverride.current.valance = true; setValance((v) => !v); }}
              >
                <PanelTop className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_valance_btn")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Tools</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={addManualFiller}
                disabled={layoutLocked}
              >
                <Columns3 className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_filler_btn")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={toggleCountertop}
                disabled={!countertop && !hasBaseRun}
                className={countertop ? "text-amber-600 font-medium" : ""}
              >
                <Square className="h-3.5 w-3.5 mr-2" /> {t("dt_sh_countertop_btn")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-5 w-px bg-border" />

          {/* Save / Load / Export */}
          <DesignActions
            room={room}
            placed={placed}
            selectedSurfaces={selectedSurfaces}
            styleId={styleId}
            lockedDistributorId={lockedDistributorId}
            styleName={activeStyleName}
            tier={tier}
            total={total}
            extraLines={extraLines}
            buildRows={buildRows}
            roomType={roomType}
            contactEmail={verifiedEmail}
            openSaveSignal={saveSignal}
            openLoadSignal={loadSignal}
            onSaveSuccess={(designName, designId) => {
              if (isMobile) {
                toast.success("Design saved", {
                  description: designName,
                  action: {
                    label: "Edit name",
                    onClick: () => {
                      setRenameDesignId(designId);
                      setRenameValue(designName);
                      setRenameDialogOpen(true);
                    },
                  },
                });
              }
            }}
            onLoad={(d) =>
              loadSavedDesign({
                ...d,
                selectedSurfaces: Array.isArray(d.selectedSurfaces)
                  ? (d.selectedSurfaces as SelectedSurface[])
                  : null,
              })
            }
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCsvImportOpen(true)}
            title="Import parts list from 2020 Design CSV"
            className="h-9 w-9 border-[#d4a75a]/60 text-[#1a2744] hover:bg-[#d4a75a]/10"
          >
            <FileText className="h-4 w-4" />
          </Button>
          <CsvImportDialog open={csvImportOpen} onOpenChange={setCsvImportOpen} />
          <div className="h-5 w-px bg-border" />
          <DesignHelp />
        </div>
      </div>

      {/* Contextual row: keep desktop cabinet editing inline, but free up mobile
          canvas space by moving cabinet editing into a bottom sheet. */}
      {((!isMobile && selectedCab) || selectedOpening || drawMode) && !measureMode && (
        <div className="border-b border-border bg-[#f7f5f0] px-4 py-1.5 flex items-center gap-3 flex-wrap shrink-0 max-h-[120px] overflow-y-auto">
          {selectedCab && !drawMode && !isMobile && (
            <>
              {/* Cabinet image — click to open the Door & Drawer Layout popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted/50 transition-colors cursor-pointer"
                    title="Door & Drawer Layout"
                  >
                    <CabinetImage cabinet={selectedCab} className="h-full w-auto max-w-full" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-auto p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Door &amp; Drawer Layout</div>
                  <DoorDrawerDiagram cabinet={selectedCab} width={180} />
                </PopoverContent>
              </Popover>
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
              {styleId && uniqueDoorStyles.length > 0 && !cabinetsLocked && (
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
                                    <SelectItem key={s.id} value={String(s.id)}>{styleDisplayName(s) || s.ourName}</SelectItem>
                        ))}                      </SelectContent>
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
              {isBlindCorner(selectedCab.masterCode, selectedCab.description) && (() => {
                const dRange = blindPullRange(selectedCab);
                const dMin = dRange?.min ?? 3;
                const dMax = dRange?.max ?? 6;
                const dCurrent = selectedCab.blindPull ?? dMax;
                const dSwing = resolveSwing(selectedCab);
                return (
                  <>
                    <div className="h-4 w-px bg-border" />
                    {/* Door side */}
                    <div className="flex items-center gap-1" title="Door side">
                      <span className="text-[11px] text-muted-foreground">Door:</span>
                      <Button
                        variant={dSwing === "left" ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setSwingFor(selectedCab.uid, "left")}
                      >
                        L
                      </Button>
                      <Button
                        variant={dSwing === "right" ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setSwingFor(selectedCab.uid, "right")}
                      >
                        R
                      </Button>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    {/* Pull distance */}
                    <div className="flex items-center gap-1" title="Pull from wall">
                      <span className="text-[11px] text-muted-foreground">Pull:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setCabAttr(selectedCab.uid, { blindPull: Math.max(dMin, dCurrent - 1) })}
                        disabled={dCurrent <= dMin}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="min-w-[24px] text-center font-mono text-[11px] tabular-nums">{dCurrent}"</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setCabAttr(selectedCab.uid, { blindPull: Math.min(dMax, dCurrent + 1) })}
                        disabled={dCurrent >= dMax}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    {/* Admin pull spec */}
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
                );
              })()}
              {/* Range Top Finish toggle — shown when a range top is on this sink base */}
              {isSinkBaseCabinet(selectedCab) && (selectedCab.sinkTopType === "gas" || selectedCab.sinkTopType === "electric" || selectedCab.sinkTopType === "smooth-top") && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1" title="Range top face finish">
                    <span className="text-[11px] text-muted-foreground mr-0.5">Finish:</span>
                    <Button
                      variant={(selectedCab.rangeTopFinish ?? "stainless") === "stainless" ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => setCabAttr(selectedCab.uid, { rangeTopFinish: "stainless" })}
                    >
                      <span className="inline-block w-3 h-3 rounded-sm bg-gradient-to-b from-[#d8dde6] to-[#a8aebb] border border-[#8a9099]" />
                      Stainless
                    </Button>
                    <Button
                      variant={selectedCab.rangeTopFinish === "black-glass" ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => setCabAttr(selectedCab.uid, { rangeTopFinish: "black-glass" })}
                    >
                      <span className="inline-block w-3 h-3 rounded-sm bg-[#1a1a1a] border border-[#444]" />
                      Black Glass
                    </Button>
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

      {isMobile && selectedCab && !drawMode && !measureMode && (
        <Sheet open={cabEditSheetOpen} onOpenChange={setCabEditSheetOpen}>
          <SheetContent
            side="bottom"
            className="bottom-14 max-h-[min(76vh,620px)] rounded-t-3xl border border-border px-0 pb-0"
          >
            <SheetHeader className="border-b border-border px-4 py-3 text-left">
              <SheetTitle className="text-sm">
                {t("dt_cx_selected")} {selectedCab.masterCode}
              </SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-4 pb-6 pt-4">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                    <CabinetImage cabinet={selectedCab} className="h-full w-auto max-w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{selectedCab.masterCode}</div>
                    <div className="text-xs text-muted-foreground">{selectedCab.description}</div>
                  </div>
                  {(paletteFinishSwatch || styleId) && (
                    <div
                      className="flex shrink-0 items-center gap-1.5"
                      title={`Door style: ${activeStyleName || "selected style"}`}
                    >
                      {paletteFinishSwatch ? (
                        <img
                          src={paletteFinishSwatch}
                          alt={`${activeStyleName || "Door"} door sample`}
                          className="h-10 w-10 rounded border border-border object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded border text-[8px] font-semibold"
                          style={{ backgroundColor: activeFinish.face, borderColor: activeFinish.edge, color: activeFinish.label }}
                        >
                          {t("dt_cx_door")}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Door & Drawer Layout diagram — shown immediately after cabinet header */}
                {!selectedCab.noDoor && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Door &amp; Drawer Layout</div>
                    <div className="flex justify-center">
                      <DoorDrawerDiagram cabinet={selectedCab} width={220} />
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("dt_snap_to_wall")}
                  </div>
                  <WallPicker onPick={snapSelectedToWall} />
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    <span>{t("dt_cx_custom_size")}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                  {(isCustomWidth(selectedCab) || isCustomHeight(selectedCab) || isCustomDepth(selectedCab)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{t("dt_cx_custom_fee", { fee: CUSTOM_SIZE_FEE })}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-[11px] text-muted-foreground"
                        title={t("dt_cx_reset_dims")}
                        onClick={() => { resetWidth(); resetHeight(); resetDepth(); }}
                      >
                        {t("dt_cx_reset")}
                      </Button>
                    </div>
                  )}
                </div>

                {styleId && uniqueDoorStyles.length > 0 && !cabinetsLocked && (
                  <div className="rounded-xl border border-border bg-[#d4a75a]/10 p-3 ring-1 ring-[#d4a75a]/30">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1a2744]">
                      <Palette className="h-4 w-4" />
                      <span>{t("dt_cx_finish_this")}</span>
                    </div>
                    <Select
                      value={selectedCab.styleId != null ? String(selectedCab.styleId) : "__match__"}
                      onValueChange={(v) => setCabinetStyle(v === "__match__" ? null : Number(v))}
                    >
                      <SelectTrigger className="h-9 w-full bg-white text-[12px]">
                        <SelectValue placeholder={t("dt_cx_match_design")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__match__">{t("dt_cx_match_design")}{activeStyleName ? ` (${activeStyleName})` : ""}</SelectItem>
                        {uniqueDoorStyles.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>{styleDisplayName(s) || s.ourName}</SelectItem>
                        ))}                      </SelectContent>
                    </Select>
                    {selectedCab.styleId != null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-8 px-2 text-[11px] text-[#1a2744] hover:bg-[#d4a75a]/20"
                        title={t("dt_cx_apply_all")}
                        onClick={applySelectedFinishToMatching}
                      >
                        {t("dt_cx_apply_to_all")}
                      </Button>
                    )}
                  </div>
                )}

                {selectedCab.placement === "wall" && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="mb-3 text-sm font-semibold text-foreground">{t("dt_cx_mount")}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title={t("dt_cx_raise")}
                        onClick={() => adjustMountHeight(1)}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <span className="min-w-[42px] text-center font-mono text-sm tabular-nums text-foreground">
                        {Math.round(elevationBox(selectedCab, room).bottom)}″
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title={t("dt_cx_lower")}
                        onClick={() => adjustMountHeight(-1)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      {typeof selectedCab.mountBottom === "number" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[11px] text-muted-foreground"
                          title={t("dt_cx_reset_mount")}
                          onClick={resetMountHeight}
                        >
                          {t("dt_cx_reset")}
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-8 gap-1 px-3 text-[11px]"
                      title={t("dt_cx_drop_island")}
                      onClick={() => dropToFloor(selectedCab.uid)}
                    >
                      <ChevronsDown className="h-3.5 w-3.5" />
                      {t("dt_cx_drop_to_floor")}
                    </Button>
                  </div>
                )}

                {isBlindCorner(selectedCab.masterCode, selectedCab.description) && (() => {
                  const bRange = blindPullRange(selectedCab);
                  const bMin = bRange?.min ?? 3;
                  const bMax = bRange?.max ?? 6;
                  const bCurrent = selectedCab.blindPull ?? bMax;
                  const bSwing = resolveSwing(selectedCab);
                  return (
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <div className="mb-3 text-sm font-semibold text-foreground">Blind Corner</div>

                      {/* Door side */}
                      <div className="mb-3">
                        <div className="mb-1 text-[11px] text-muted-foreground">Door Side</div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant={bSwing === "left" ? "default" : "outline"}
                            size="sm"
                            className="h-8"
                            onClick={() => setSwingFor(selectedCab.uid, "left")}
                          >
                            Left
                          </Button>
                          <Button
                            variant={bSwing === "right" ? "default" : "outline"}
                            size="sm"
                            className="h-8"
                            onClick={() => setSwingFor(selectedCab.uid, "right")}
                          >
                            Right
                          </Button>
                        </div>
                      </div>

                      {/* Pull distance */}
                      <div className="mb-3">
                        <div className="mb-1 text-[11px] text-muted-foreground">Pull from Wall ({bMin}–{bMax}")</div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setCabAttr(selectedCab.uid, { blindPull: Math.max(bMin, bCurrent - 1) })}
                            disabled={bCurrent <= bMin}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Input
                            type="number"
                            step="1"
                            min={bMin}
                            max={bMax}
                            value={bCurrent}
                            className="h-8 w-16 text-center text-sm"
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) setCabAttr(selectedCab.uid, { blindPull: Math.max(bMin, Math.min(bMax, v)) });
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setCabAttr(selectedCab.uid, { blindPull: Math.min(bMax, bCurrent + 1) })}
                            disabled={bCurrent >= bMax}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-xs text-muted-foreground ml-1">" in</span>
                        </div>
                      </div>

                      {/* Admin pull spec (min/max range) */}
                      <div className="border-t border-border pt-2">
                        <div className="mb-1 text-[11px] text-muted-foreground">{t("dt_cx_pull_spec")} (admin)</div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={typeof selectedCab.pullMin === "number" ? selectedCab.pullMin : ""}
                            placeholder={t("dt_cx_min")}
                            className="h-8 w-16 text-[12px]"
                            onChange={(e) => setBlindPull("pullMin", e.target.value === "" ? null : Number(e.target.value))}
                          />
                          <span className="text-xs text-muted-foreground">–</span>
                          <Input
                            type="number"
                            value={typeof selectedCab.pullMax === "number" ? selectedCab.pullMax : ""}
                            placeholder={t("dt_cx_max")}
                            className="h-8 w-16 text-[12px]"
                            onChange={(e) => setBlindPull("pullMax", e.target.value === "" ? null : Number(e.target.value))}
                          />
                          <span className="text-xs text-muted-foreground">{t("dt_cx_in")}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Add-ons: per-cabinet roll-out shelves (auto-sized, same line) */}
                {/* Range Top Finish toggle — shown when a range top is on this sink base */}
                {isSinkBaseCabinet(selectedCab) && (selectedCab.sinkTopType === "gas" || selectedCab.sinkTopType === "electric" || selectedCab.sinkTopType === "smooth-top") && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="mb-3 text-sm font-semibold text-foreground">Range Top Finish</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={(selectedCab.rangeTopFinish ?? "stainless") === "stainless" ? "default" : "outline"}
                        size="sm"
                        className="h-9 gap-2"
                        onClick={() => setCabAttr(selectedCab.uid, { rangeTopFinish: "stainless" })}
                      >
                        <span className="inline-block w-4 h-4 rounded-sm bg-gradient-to-b from-[#d8dde6] to-[#a8aebb] border border-[#8a9099] shrink-0" />
                        Stainless
                      </Button>
                      <Button
                        variant={selectedCab.rangeTopFinish === "black-glass" ? "default" : "outline"}
                        size="sm"
                        className="h-9 gap-2"
                        onClick={() => setCabAttr(selectedCab.uid, { rangeTopFinish: "black-glass" })}
                      >
                        <span className="inline-block w-4 h-4 rounded-sm bg-[#1a1a1a] border border-[#555] shrink-0" />
                        Black Glass
                      </Button>
                    </div>
                  </div>
                )}
                <RollOutTrayPicker
                  cabinet={selectedCab}
                  designStyleId={styleId}
                  distributorId={lockedDistributorId}
                  qty={selectedCab.rolloutQty ?? 0}
                  onSetQty={(q) => setRolloutQtyFor(selectedCab.uid, q)}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
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
                ? (["vanity", "appliance", "base", "corner", "wall", "wallht", "tall", "surfaces", "opening", "accessory"] as const)
                : roomType === "laundry"
                ? (["appliance", "base", "corner", "wall", "wallht", "tall", "surfaces", "opening", "accessory"] as const)
                : (["base", "corner", "wall", "wallht", "tall", "appliance", "surfaces", "opening", "accessory", "furniture"] as const)
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
                    : tab === "surfaces"
                    ? "Surfaces"
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
                    : tab === "furniture"
                    ? "Furniture"
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
            {/* Distributor / Collection filter — simple dropdown so the user
                can switch between supply lines. Auto-selects the locked one. */}
            {styleId && (distributorLabels ?? []).length > 1 && (
              <div className="mt-2">
                <Select
                  value={lockedDistributorId != null ? String(lockedDistributorId) : "all"}
                  onValueChange={(val) => {
                    if (val === "all") {
                      if (placed.length > 0 && lockedDistributorId != null) {
                        const ok = window.confirm(t("dt_dist_override_body"));
                        if (!ok) return;
                        setMixedWarehouseOverride(true);
                      }
                      setLockedDistributorId(null);
                      // Clear style filter so catalog shows all cabinets
                      setStyleId(null);
                    } else {
                      const newDist = Number(val);
                      if (placed.length > 0 && lockedDistributorId != null && newDist !== lockedDistributorId) {
                        const ok = window.confirm(t("dt_dist_override_body"));
                        if (!ok) return;
                        setMixedWarehouseOverride(true);
                      }
                      setLockedDistributorId(newDist);
                      // If the current styleId belongs to a different distributor,
                      // clear it so the catalog shows all cabinets for the new line.
                      const currentStyleDist = (doorStyles as Array<{id: number; distributorId: number}> | undefined)?.find((d) => d.id === styleId)?.distributorId;
                      if (currentStyleDist != null && currentStyleDist !== newDist) {
                        setStyleId(null);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All Collections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Collections</SelectItem>
                    {(distributorLabels ?? []).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Door-style-first prompt: the palette is empty until a door style
                is picked (catalog + pricing key off it). Make that obvious with a
                clear call-out + a jump to the picker, instead of leaving users
                staring at an empty list. */}
            {!styleId &&
              paletteType !== "opening" &&
              paletteType !== "closetparts" &&
              paletteType !== "surfaces" &&
              paletteType !== "accessory" && (
                <div className="mb-2 rounded-lg border border-[#a87f33]/40 bg-[#a87f33]/10 px-3 py-3 text-center space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    {t("dt_pl_need_style_title")}
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {t("dt_pl_need_style_body")}
                  </p>
                  <Button
                    size="sm"
                    className="h-7 bg-[#a87f33] text-white hover:bg-[#a87f33]/90 text-[11px]"
                    onClick={() => {
                      const el = document.getElementById("door-style-picker-card");
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("ring-2", "ring-[#a87f33]", "rounded-lg");
                        window.setTimeout(() => {
                          el.classList.remove("ring-2", "ring-[#a87f33]", "rounded-lg");
                        }, 1800);
                      }
                    }}
                  >
                    {t("dt_pl_need_style_cta")}
                  </Button>
                </div>
              )}
            {/* Per-style availability hint: when a style is selected and the user
                isn't searching, show how many cabinets that finish carries for the
                current tab. Makes a smaller per-finish lineup obvious instead of
                looking "empty/broken". */}
            {styleId &&
              !paletteSearch &&
              availableInStyleCount != null &&
              availableInStyleCount > 0 && (
                <div className="mb-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {availableInStyleCount === 1
                      ? t("dt_pl_avail_count_one", { style: activeStyleName ?? "" })
                      : t("dt_pl_avail_count", { count: availableInStyleCount, style: activeStyleName ?? "" })}
                  </span>
                  {" "}
                  <span>{t("dt_pl_avail_lineup_note")}</span>
                </div>
              )}
            {paletteType === "surfaces" ? (
              <RecommendedSurfaces
                selected={selectedSurfaces}
                onToggle={addRecommendedSurface}
                onBrowseAll={() => setSurfacesOpen(true)}
              />
            ) : paletteType === "furniture" ? (
              (() => {
                const cats = ["table", "chair", "stool", "bench"] as const;
                const catLabels: Record<string, string> = { table: "Tables", chair: "Chairs", stool: "Stools", bench: "Benches" };
                return cats.map((cat) => {
                  const items = FURNITURE_CATALOG.filter((f) => f.category === cat);
                  if (!items.length) return null;
                  return (
                    <div key={cat} className="space-y-1.5">
                      <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">{catLabels[cat]}</div>
                      {items.map((def) => (
                        <button
                          key={def.id}
                          onClick={() => {
                            const cx = room.width / 2;
                            const cy = room.depth / 2;
                            setFurniture((prev) => [...prev, makeFurniture(def.id, cx, cy)]);
                            toast.success(`${def.name} added to floor plan`);
                          }}
                          className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                        >
                          <div
                            className="h-9 w-9 rounded border flex items-center justify-center shrink-0"
                            style={{ background: def.color + "33", borderColor: def.color + "88" }}
                          >
                            <div
                              className="rounded"
                              style={{
                                width: def.shape === "round" ? 20 : Math.min(28, def.w / 3),
                                height: def.shape === "round" ? 20 : Math.min(20, def.d / 3),
                                background: def.color,
                                borderRadius: def.shape === "round" ? "50%" : 3,
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-foreground truncate">{def.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {def.shape === "round" ? `${def.w}" dia` : `${def.w}"W × ${def.d}"D`}
                              {def.clearance > 0 && ` · ${def.clearance}" clearance`}
                            </div>
                          </div>
                          <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                  );
                });
              })()
            ) : paletteType === "opening" ? (
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
                    // Accessories & Trim: only PHYSICAL placeable items
                    // (decorative/end panels, skins, appliance garages) appear —
                    // they drop onto the drawing like a cabinet box. Loose
                    // add-on trim/hardware sold by the foot/each (crown, light
                    // rail, roll-out trays, hinges, pulls) is no longer offered
                    // as an add-on sale in the design tool and is hidden here.
                    if (paletteType === "accessory") {
                      if (!isPlaceableAccessory(c)) return null;
                      return (
                        <button
                          key={c.masterCode}
                          draggable
                          onDragStart={() => { dragDataRef.current = c; }}
                          onClick={() => addCabinet(c)}
                          className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                        >
                          <div className="h-9 w-9 flex items-center justify-center shrink-0">
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
                    return (
                    <button
                      key={c.masterCode}
                      draggable
                      onDragStart={() => { dragDataRef.current = c; }}
                      onClick={() => addCabinet(c)}
                      className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                    >
                      <div className="h-9 w-9 flex items-center justify-center shrink-0">
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
            {paletteType !== "opening" && paletteType !== "surfaces" && paletteType !== "furniture" && !paletteLoading && filteredPalette.length === 0 && (
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
        <div ref={canvasExportRef} className="flex-1 min-w-0 relative pb-16 lg:pb-0">
          {viewMode === "plan" && isPolygonRoom && polygonEditMode && (
            <div className="absolute inset-0 z-20">
              <PolygonRoomEditor
                vertices={room.vertices!}
                customWalls={room.customWalls!}
                ppi={4}
                onChange={(vertices, customWalls, width, depth) => {
                  setRoom((prev) => ({ ...prev, vertices, customWalls, width, depth }));
                }}
                activeWallId={activeWall}
                onSelectWall={(wallId) => setActiveWall(wallId as any)}
                locked={layoutLocked}
              />
            </div>
          )}
          {viewMode === "plan" && (
            <PlanCanvas
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={selectCabinet}
              onMove={moveCabinet}
              onDelete={deleteCabinet}
              onRotate={rotateCabinet}
              onOpenAttributes={openAttributes}
              onDropNew={handleDropNew}
              showWallLayer={showWallLayer}
              measureMode={measureMode}
              autoDimensions={autoDimensions}
              island={island}
              onIslandChange={setIsland}
              onIslandMove={moveIsland}
              openings={openings}
              selectedOpeningUid={selectedOpeningUid}
              onSelectOpening={selectOpening}
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
              onSelectSink={selectSink}
              onMoveSink={moveSink}
              onDropToFloor={dropToFloor}
              finishFor={finishForCab}
              furniture={furniture}
              selectedFurnUid={selectedFurnUid}
              onSelectFurn={setSelectedFurnUid}
              onMoveFurn={(uid, x, y) => setFurniture(prev => prev.map(f => f.uid === uid ? { ...f, x, y } : f))}
              onDeleteFurn={(uid) => { setFurniture(prev => prev.filter(f => f.uid !== uid)); setSelectedFurnUid(null); }}
              onRotateFurn={(uid) => setFurniture(prev => prev.map(f => f.uid === uid ? { ...f, rotation: (f.rotation + 90) % 360 } : f))}
              flooringMaterialId={flooringMaterialId}
              cabinetsLocked={cabinetsLocked}
              gapFillCandidates={gapFillCandidates}
              onFillGap={fillGap}
              onPlaceFiller={fillGapWithFiller}
              onFillGapWithCabAndFiller={fillGapWithCabAndFiller}
              annotations={annotations}
              selectedAnnotationUid={selectedAnnotationUid}
              onSelectAnnotation={setSelectedAnnotationUid}
              onMoveAnnotation={(uid, x, y) => setAnnotations(prev => prev.map(a => a.uid === uid ? { ...a, x, y } : a))}
              onDeleteAnnotation={(uid) => { setAnnotations(prev => prev.filter(a => a.uid !== uid)); setSelectedAnnotationUid(null); }}
              ponyWalls={ponyWalls}
              selectedPonyWallUid={selectedPonyWallUid}
              onSelectPonyWall={selectPonyWall}
              onPonyWallChange={(pw) => setPonyWalls(prev => prev.map(p => p.uid === pw.uid ? pw : p))}
              onDeletePonyWall={(uid: string) => { setPonyWalls(prev => prev.filter(p => p.uid !== uid)); setSelectedPonyWallUid(null); }}
            />
          )}
          {viewMode === "elevation" && (
            <ElevationView
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={selectCabinet}
              wall={activeWall}
              onSelectWall={setActiveWall}
              countertopMaterialId={countertop ? countertopMaterialId : null}
              backsplashMaterialId={backsplashMaterialId}
              flooringMaterialId={flooringMaterialId}
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
              doorSampleUrlFor={doorSampleForCab}
              drawerSampleUrlFor={drawerSampleForCab}
              onMove={cabinetsLocked ? undefined : moveCabinet}
              onMoveVertical={cabinetsLocked ? undefined : setMountBottomFor}
              moveLocked={cabinetsLocked}
            />
          )}
          {viewMode === "island" && island && (
            <div className="relative w-full h-full flex flex-col">
              {/* Front / Back sub-tab switcher */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center rounded-full border border-border bg-white/90 shadow-sm p-0.5">
                <button
                  onClick={() => setIslandFace("front")}
                  className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${
                    islandFace === "front"
                      ? "bg-[#1a2744] text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Front
                </button>
                <button
                  onClick={() => setIslandFace("back")}
                  className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${
                    islandFace === "back"
                      ? "bg-[#1a2744] text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Back
                </button>
              </div>
              <IslandElevationView
                room={room}
                cabinets={placed}
                island={island}
                face={islandFace}
                selectedUid={selectedUid}
                onSelect={selectCabinet}
                countertopMaterialId={countertop ? countertopMaterialId : null}
                finish={activeFinish}
                crown={crown}
                toeKick={toeKick}
                batten={batten}
                lightRail={lightRail}
                panelKind={activePanelKind}
                hardwareStyleId={hardwareStyleId}
                finishFor={finishForCab}
                panelKindFor={panelKindForCab}
                doorSampleUrlFor={doorSampleForCab}
                drawerSampleUrlFor={drawerSampleForCab}
              />
            </div>
          )}
          {viewMode === "corner" && (
            <CornerView
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={selectCabinet}
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
              doorSampleUrlFor={doorSampleForCab}
              drawerSampleUrlFor={drawerSampleForCab}
            />
          )}
          {viewMode === "split" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0 border-b border-border">
                <PlanCanvas
                  room={room}
                  cabinets={placed}
                  selectedUid={selectedUid}
                  onSelect={selectCabinet}
                  onMove={moveCabinet}
                  onDelete={deleteCabinet}
                  onRotate={rotateCabinet}
                  onOpenAttributes={openAttributes}
                  onDropNew={handleDropNew}
                  showWallLayer={showWallLayer}
                  measureMode={measureMode}
              autoDimensions={autoDimensions}
                  island={island}
                  onIslandChange={setIsland}
                  onIslandMove={moveIsland}
                  openings={openings}
                  selectedOpeningUid={selectedOpeningUid}
                  onSelectOpening={selectOpening}
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
              onSelectSink={selectSink}
              onMoveSink={moveSink}
              onDropToFloor={dropToFloor}
              finishFor={finishForCab}
              furniture={furniture}
              selectedFurnUid={selectedFurnUid}
              onSelectFurn={setSelectedFurnUid}
              onMoveFurn={(uid, x, y) => setFurniture(prev => prev.map(f => f.uid === uid ? { ...f, x, y } : f))}
              onDeleteFurn={(uid) => { setFurniture(prev => prev.filter(f => f.uid !== uid)); setSelectedFurnUid(null); }}
              onRotateFurn={(uid) => setFurniture(prev => prev.map(f => f.uid === uid ? { ...f, rotation: (f.rotation + 90) % 360 } : f))}
              flooringMaterialId={flooringMaterialId}
              cabinetsLocked={cabinetsLocked}
              gapFillCandidates={gapFillCandidates}
              onFillGap={fillGap}
              onPlaceFiller={fillGapWithFiller}
              onFillGapWithCabAndFiller={fillGapWithCabAndFiller}
              annotations={annotations}
              selectedAnnotationUid={selectedAnnotationUid}
              onSelectAnnotation={setSelectedAnnotationUid}
              onMoveAnnotation={(uid, x, y) => setAnnotations(prev => prev.map(a => a.uid === uid ? { ...a, x, y } : a))}
              onDeleteAnnotation={(uid) => { setAnnotations(prev => prev.filter(a => a.uid !== uid)); setSelectedAnnotationUid(null); }}
              ponyWalls={ponyWalls}
              selectedPonyWallUid={selectedPonyWallUid}
              onSelectPonyWall={selectPonyWall}
              onPonyWallChange={(pw) => setPonyWalls(prev => prev.map(p => p.uid === pw.uid ? pw : p))}
              onDeletePonyWall={(uid: string) => { setPonyWalls(prev => prev.filter(p => p.uid !== uid)); setSelectedPonyWallUid(null); }}
                />
              </div>
              <div className="flex-1 min-h-0">
                <ElevationView
                  room={room}
                  cabinets={placed}
                  selectedUid={selectedUid}
                  onSelect={selectCabinet}
                  wall={activeWall}
                  onSelectWall={setActiveWall}
                  countertopMaterialId={countertop ? countertopMaterialId : null}
                  backsplashMaterialId={backsplashMaterialId}
                  flooringMaterialId={flooringMaterialId}
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
                  doorSampleUrlFor={doorSampleForCab}
                  drawerSampleUrlFor={drawerSampleForCab}
                  onMove={cabinetsLocked ? undefined : moveCabinet}
                  onMoveVertical={cabinetsLocked ? undefined : setMountBottomFor}
                  moveLocked={cabinetsLocked}
                />
              </div>
            </div>
          )}

          {/* D-pad nudge buttons — appears when a cabinet is selected */}
          {selectedUid && !cabinetsLocked && !measureMode && (
            <div className="absolute bottom-20 lg:bottom-4 left-4 z-30 flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => nudgeSelected(0, -1)}
                className="w-9 h-9 flex items-center justify-center rounded-t-lg bg-white/90 border border-border shadow-sm hover:bg-white active:scale-95 transition-transform"
                title="Move up 1 inch"
              >
                <ArrowUp className="h-4 w-4 text-[#1a2744]" />
              </button>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => nudgeSelected(-1, 0)}
                  className="w-9 h-9 flex items-center justify-center rounded-l-lg bg-white/90 border border-border shadow-sm hover:bg-white active:scale-95 transition-transform"
                  title="Move left 1 inch"
                >
                  <ArrowLeft className="h-4 w-4 text-[#1a2744]" />
                </button>
                <button
                  type="button"
                  onClick={rotateSelected}
                  className="w-9 h-9 flex items-center justify-center bg-[#1a2744] border border-[#1a2744] shadow-sm hover:bg-[#1a2744]/80 active:scale-95 transition-transform rounded-sm"
                  title="Rotate 90°"
                >
                  <RotateCw className="h-4 w-4 text-white" />
                </button>
                <button
                  type="button"
                  onClick={() => nudgeSelected(1, 0)}
                  className="w-9 h-9 flex items-center justify-center rounded-r-lg bg-white/90 border border-border shadow-sm hover:bg-white active:scale-95 transition-transform"
                  title="Move right 1 inch"
                >
                  <ArrowRight className="h-4 w-4 text-[#1a2744]" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => nudgeSelected(0, 1)}
                className="w-9 h-9 flex items-center justify-center rounded-b-lg bg-white/90 border border-border shadow-sm hover:bg-white active:scale-95 transition-transform"
                title="Move down 1 inch"
              >
                <ArrowDown className="h-4 w-4 text-[#1a2744]" />
              </button>
            </div>
          )}

          {/* AI Consultant floating action button — bottom-right of canvas */}
          <button
            type="button"
            onClick={() => setConsultOpen((o) => !o)}
            title={t("dt_sh_consultant_title")}
            className={`absolute bottom-20 lg:bottom-4 right-4 z-30 flex items-center gap-2 rounded-full shadow-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
              consultOpen
                ? "bg-[#1a2744] text-white pr-3"
                : "bg-[#1a2744] text-white hover:bg-[#1a2744]/90 hover:shadow-xl hover:scale-105"
            }`}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{consultOpen ? "Close AI" : t("dt_sh_consultant")}</span>
            {consultOpen && <X className="h-3.5 w-3.5 ml-0.5" />}
          </button>

          {/* Wall layer toggle (plan only) */}
          {viewMode !== "elevation" && viewMode !== "corner" && viewMode !== "island" && (
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
          <div className="flex flex-col min-h-0 h-full">
          <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
            {/* Compact door style badge — replaces the large hero image to save vertical space */}
            {activeStyle ? (
              <>
                <DoorStyleSwatch style={activeStyle} className="h-10 w-10 rounded border border-border shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("dt_bs_door_sample")}</div>
                  <div className="truncate text-xs font-bold">{activeStyleName}</div>
                  {(activeStyle.doorStyle || activeStyle.finish || activeStyle.color) && (
                    <div className="truncate text-[10px] text-muted-foreground">
                      {[activeStyle.doorStyle, activeStyle.color || activeStyle.finish].filter(Boolean).join(" \u00b7 ")}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{t("dt_bs_select_finish_preview")}</span>
            )}
            {/* Cabinet company selector — pick one of the 3 supply lines */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="shrink-0 flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[10px] font-medium hover:bg-accent transition-colors"
                  title="Choose cabinet company"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline truncate max-w-[72px]">
                    {lockedDistributorId
                      ? (distributorLabels?.find((d) => d.id === lockedDistributorId)?.name ?? "Company")
                      : "All"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Cabinet Company</div>
                <button
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2 ${lockedDistributorId == null ? "bg-accent font-semibold" : ""}`}
                  onClick={() => { setLockedDistributorId(null); setMixedWarehouseOverride(true); }}
                >
                  <span className="h-5 w-5 rounded bg-muted flex items-center justify-center text-[9px] font-bold">All</span>
                  <span>All Companies</span>
                  {lockedDistributorId == null && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                </button>
                {(distributorLabels ?? []).map((d) => (
                  <button
                    key={d.id}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2 ${lockedDistributorId === d.id ? "bg-accent font-semibold" : ""}`}
                    onClick={() => {
                      setLockedDistributorId(d.id);
                      setMixedWarehouseOverride(false);
                      // If current style doesn't belong to this distributor, clear it
                      if (selectedStyleDistributorId != null && selectedStyleDistributorId !== d.id) {
                        setStyleId(null); setStyleA(null); setStyleB(null);
                        toast.info(`Switched to ${d.name} — please choose a door style`);
                      }
                    }}
                  >
                    <span className="h-5 w-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">{d.initials}</span>
                    <span className="truncate">{d.name}</span>
                    {lockedDistributorId === d.id && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Door style & pricing picker: collapses into an accordion once a door
              style is chosen so it stops dominating the panel (esp. on mobile).
              The header summarizes the active style + tier when collapsed. The
              door-style hero sample above stays visible at all times. */}
          <SheetSection
            id="door-style-picker-card"
            className="border-b border-border shrink-0"
            title={
              styleId
                ? `${t("dt_bs_door_section")} · ${activeStyleName ?? ""} · ${tier === "Wholesale" ? t("dt_bs_wholesale") : tier === "Homeowner" ? t("dt_bs_homeowner") : t("dt_bs_contractor")}`
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
                distributors={distributorLabels ?? []}
                onSelect={() => {
                  if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                  selectColorSlot("A");
                }}
                onPick={(id) => {
                  if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                  setSlotStyle("A", id);
                }}
                onClear={undefined}
              />
              <ColorSlotButton
                label={t("dt_bs_color_2")}
                slot="B"
                active={activeSlot === "B"}
                style={styleB != null ? (doorStyles?.find((d) => d.id === styleB) ?? null) : null}
                styles={slotBStyles}
                distributors={distributorLabels ?? []}
                disabled={cabinetsLocked || styleA == null}
                disabledReason={cabinetsLocked ? "Cabinets are locked — unlock to change door style" : "Set Color 1 first before choosing Color 2"}
                onSelect={() => {
                  if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                  if (styleB != null) selectColorSlot("B"); else toast.info(t("dt_t_second_style_first"));
                }}
                onPick={(id) => {
                  if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                  setSlotStyle("B", id);
                }}
                onClear={styleB != null && !cabinetsLocked ? () => {
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
              <Select value={tier} disabled={cabinetsLocked} onValueChange={(v) => { if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change pricing tier"); return; } setTier(v as PricingTier); }}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wholesale">{t("dt_bs_wholesale")}</SelectItem>
                  <SelectItem value="Contractor">{t("dt_bs_contractor")}</SelectItem>
                  <SelectItem value="Homeowner">{t("dt_bs_homeowner")}</SelectItem>
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
                // One line-item renderer reused by every cabinet section.
                // sectionItems is passed so move-up/down knows the full list.
                const renderLine = (g: typeof panelGroups[number], sectionItems: typeof panelGroups) => {
                  const selected = g.uids.includes(selectedUid ?? "");
                  const rawLineTotal = g.unitPrice != null ? g.unitPrice * g.qty : null;
                  const lineTotal = rawLineTotal != null && g.discountPct !== 0
                    ? rawLineTotal * (1 + g.discountPct / 100)
                    : rawLineTotal;
                  const idx = sectionItems.findIndex((s) => s.key === g.key);
                  const canMoveUp = idx > 0;
                  const canMoveDown = idx < sectionItems.length - 1;
                  return (
                    <div
                      key={g.key}
                      onClick={() => setSelectedUid(g.uids[g.uids.length - 1])}
                      className={`group w-full text-left flex items-center gap-1.5 p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        selected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent"
                      }`}
                    >
                      {/* Move up/down arrows */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={!canMoveUp}
                          onClick={(e) => { e.stopPropagation(); moveBomItem(sectionItems, g.key, "up"); }}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move item up"
                          title="Move up"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={!canMoveDown}
                          onClick={(e) => { e.stopPropagation(); moveBomItem(sectionItems, g.key, "down"); }}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move item down"
                          title="Move down"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Item info */}
                      <div className="min-w-0 flex-1">
                        <div className="font-mono font-semibold truncate flex items-center gap-1.5">
                          {g.sample.glassDoor ? g.sample.masterCode + "GD" : g.sample.masterCode}
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
                        {/* Per-line color */}
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

                      {/* Price + edit/delete controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="text-right">
                          <div className="font-semibold leading-none">
                            {styleId ? (lineTotal != null ? `$${lineTotal.toFixed(2)}` : "N/A") : "—"}
                          </div>
                          {styleId && g.qty > 1 && g.unitPrice != null && (
                            <div className="text-[9px] text-muted-foreground mt-0.5">${g.unitPrice.toFixed(2)} ea</div>
                          )}
                          {g.discountPct !== 0 && (
                            <div className={`text-[9px] font-medium mt-0.5 ${g.discountPct < 0 ? "text-green-600" : "text-amber-600"}`}>
                              {g.discountPct > 0 ? "+" : ""}{g.discountPct}%
                            </div>
                          )}
                        </div>
                        {/* Discount/surcharge quick-set */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className={`transition-colors ${g.discountPct !== 0 ? "text-green-600 hover:text-green-700" : "text-muted-foreground hover:text-foreground"}`}
                              aria-label="Set discount or surcharge"
                              title="Discount / Surcharge"
                            >
                              <Percent className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-52 p-3" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs font-semibold mb-2">Discount / Surcharge</div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                className="h-7 text-xs w-20"
                                defaultValue={g.discountPct || ""}
                                placeholder="0"
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setDiscountPctForGroup(g.uids, isNaN(val) || val === 0 ? null : Math.round(val * 100) / 100);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const val = parseFloat((e.target as HTMLInputElement).value);
                                    setDiscountPctForGroup(g.uids, isNaN(val) || val === 0 ? null : Math.round(val * 100) / 100);
                                  }
                                }}
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1.5">
                              Negative = discount, positive = surcharge
                            </p>
                            <div className="flex gap-1 mt-2">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setDiscountPctForGroup(g.uids, -5)}>-5%</Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setDiscountPctForGroup(g.uids, -10)}>-10%</Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setDiscountPctForGroup(g.uids, -15)}>-15%</Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setDiscountPctForGroup(g.uids, null)}>Clear</Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        {/* Edit / resolve: jump to this cabinet and open its editor so
                            the user can correct whatever caused a conflict (size,
                            swing, blind-corner pull spec, finish, position, etc.). */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openAttributes(g.uids[g.uids.length - 1]); }}
                          className={`transition-colors ${g.hasConflict ? "text-amber-600 hover:text-amber-700" : "text-muted-foreground hover:text-foreground"}`}
                          aria-label={`Edit ${g.sample.masterCode}`}
                          title={g.hasConflict ? "Edit to resolve conflict" : "Edit cabinet"}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {/* Remove one (decrement qty) */}
                        {g.qty > 1 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteOneFromGroup(g.uids); }}
                            className="text-muted-foreground hover:text-amber-600 transition-colors"
                            aria-label={`Remove one ${g.sample.masterCode}`}
                            title="Remove one"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Delete entire line */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteWholeGroup(g.uids); }}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={`Delete all ${g.sample.masterCode}`}
                          title="Remove all from design"
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
                        <div className="px-2 pb-1 space-y-1">{cabinetSections.base.map((g) => renderLine(g, cabinetSections.base))}</div>
                      </SheetSection>
                    )}
                    {cabinetSections.wall.length > 0 && (
                      <SheetSection
                        title={t("dt_bs_sec_wall")}
                        count={cabinetSections.wall.reduce((n, g) => n + g.qty, 0)}
                        collapsed={collapsedSheet.has("wall")}
                        onToggle={() => toggleSheetSection("wall")}
                      >
                        <div className="px-2 pb-1 space-y-1">{cabinetSections.wall.map((g) => renderLine(g, cabinetSections.wall))}</div>
                      </SheetSection>
                    )}
                    {cabinetSections.other.length > 0 && (
                      <SheetSection
                        title={t("dt_bs_sec_other")}
                        count={cabinetSections.other.reduce((n, g) => n + g.qty, 0)}
                        collapsed={collapsedSheet.has("other")}
                        onToggle={() => toggleSheetSection("other")}
                      >
                        <div className="px-2 pb-1 space-y-1">{cabinetSections.other.map((g) => renderLine(g, cabinetSections.other))}</div>
                      </SheetSection>
                    )}
                  </>
                );
              })()
            )}
            {((crown || toeKick || batten || lightRail || countertop) && placed.length > 0) && (
            <SheetSection
              title={t("dt_bs_sec_extras")}
              collapsed={collapsedSheet.has("extras")}
              onToggle={() => toggleSheetSection("extras")}
            >
            <div className="px-2 pb-1 space-y-1">
{/* Auto-filler removed: user places corner fillers manually */}
            {(crown || toeKick || batten || lightRail || countertop) && placed.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {crown && crownOrder && effectiveTrimPieces.crown > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-amber-500/10 border border-amber-500/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_crown_molding")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {effectiveTrimPieces.crown} pc{effectiveTrimPieces.crown > 1 ? "s" : ""} @ {crownOrder.stickFeet}&apos; · {crownOrder.measuredFeet} ft run (incl. 3&quot; miter/wall)
                        {activeStyleName ? ` · ${activeStyleName}` : ""}
                      </div>
                      <TrimQtyStepper kind="crown" value={effectiveTrimPieces.crown} auto={crownOrder.pieces} override={trimQtyOverride.crown} setOverride={setTrimQtyOverride} />
                    </div>
                    <span className="font-semibold shrink-0 text-amber-600">{t("dt_bs_quote")}</span>
                  </div>
                )}
                {toeKick && toeKickOrder && effectiveTrimPieces.toeKick > 0 && (() => {
                  const p = trimPriceByCode.get("TK-8");
                  const pcs = effectiveTrimPieces.toeKick;
                  const ext = p && p.unitPrice > 0 ? p.unitPrice * pcs : null;
                  return (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_toe_kick")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {pcs} pc{pcs > 1 ? "s" : ""} @ {toeKickOrder.stickFeet}&apos; · {toeKickOrder.measuredFeet} ft run
                        {ext != null ? ` · $${p!.unitPrice.toFixed(2)} ea × ${pcs}` : ""}
                        {activeStyleName ? ` · ${activeStyleName}` : ""}
                      </div>
                      <TrimQtyStepper kind="toeKick" value={pcs} auto={toeKickOrder.pieces} override={trimQtyOverride.toeKick} setOverride={setTrimQtyOverride} />
                    </div>
                    <span className="font-semibold shrink-0">{ext != null ? `$${ext.toFixed(2)}` : t("dt_bs_incl")}</span>
                  </div>
                  );
                })()}
                {batten && battenOrder && effectiveTrimPieces.batten > 0 && (() => {
                  const p = trimPriceByCode.get("BAM");
                  const pcs = effectiveTrimPieces.batten;
                  const ext = p && p.unitPrice > 0 ? p.unitPrice * pcs : null;
                  return (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_batten_molding")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {pcs} pc{pcs > 1 ? "s" : ""} @ {battenOrder.stickFeet}&apos; · {battenOrder.measuredFeet} ft run · 3/4&quot; × 3/16&quot;
                        {ext != null ? ` · $${p!.unitPrice.toFixed(2)} ea × ${pcs}` : ""}
                        {activeStyleName ? ` · ${activeStyleName}` : ""}
                      </div>
                      <TrimQtyStepper kind="batten" value={pcs} auto={battenOrder.pieces} override={trimQtyOverride.batten} setOverride={setTrimQtyOverride} />
                    </div>
                    <span className="font-semibold shrink-0">{ext != null ? `$${ext.toFixed(2)}` : t("dt_bs_incl")}</span>
                  </div>
                  );
                })()}
                {lightRail && lightRailOrder && effectiveTrimPieces.lightRail > 0 && (() => {
                  const p = trimPriceByCode.get("LRM-8");
                  const pcs = effectiveTrimPieces.lightRail;
                  const ext = p && p.unitPrice > 0 ? p.unitPrice * pcs : null;
                  return (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_sh_light_rail_btn")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {pcs} pc{pcs > 1 ? "s" : ""} @ {lightRailOrder.stickFeet}&apos; · {lightRailOrder.measuredFeet} ft run
                        {ext != null ? ` · $${p!.unitPrice.toFixed(2)} ea × ${pcs}` : ""}
                        {activeStyleName ? ` · ${activeStyleName}` : ""}
                      </div>
                      <TrimQtyStepper kind="lightRail" value={pcs} auto={lightRailOrder.pieces} override={trimQtyOverride.lightRail} setOverride={setTrimQtyOverride} />
                    </div>
                    <span className="font-semibold shrink-0">{ext != null ? `$${ext.toFixed(2)}` : t("dt_bs_incl")}</span>
                  </div>
                  );
                })()}
                {valance && valanceOrder.length > 0 && (() => {
                  const pcs = effectiveTrimPieces.valance;
                  const p = trimPriceByCode.get("VA-48");
                  const hasPricing = !!p && p.unitPrice > 0;
                  const totalPrice = hasPricing ? p!.unitPrice * pcs : 0;
                  return (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_sh_valance_btn")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {pcs} pc{pcs > 1 ? "s" : ""} — VA-48 (trimmed to fit)
                      </div>
                      <TrimQtyStepper kind="valance" value={pcs} auto={valanceOrder.length} override={trimQtyOverride.valance} setOverride={setTrimQtyOverride} />
                    </div>
                    <span className="font-semibold shrink-0">{hasPricing ? `$${totalPrice.toFixed(2)}` : t("dt_bs_incl")}</span>
                  </div>
                  );
                })()}
                {countertop && counter && counter.squareFeet > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-amber-500/10 border border-amber-500/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{t("dt_bs_countertop")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        ~{counter.squareFeet} sq ft · {counter.linearFeet} linear ft{counter.hasIsland ? " (incl. island)" : ""}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {edgeProfile(edgeProfileId).name} edge
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-amber-600">{t("dt_bs_quote")}</span>
                  </div>
                )}
                {/* Backsplash & flooring area summary */}
                {(() => {
                  const bsLinIn = placed.filter((p) => p.placement === "base").reduce((s, p) => s + rotatedSize(p).w, 0);
                  const bsSqFt = Math.round(((bsLinIn * 18) / 144) * 10) / 10;
                  const flSqFt = Math.round(((room.width * room.depth) / 144) * 10) / 10;
                  if (bsSqFt <= 0 && flSqFt <= 0) return null;
                  return (
                    <div className="flex flex-col gap-1 p-2 rounded-lg text-xs bg-sky-500/10 border border-sky-500/30">
                      {bsSqFt > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold">Backsplash</span>
                          <span className="text-sky-600 font-semibold">~{bsSqFt} sq ft</span>
                        </div>
                      )}
                      {flSqFt > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold">Flooring</span>
                          <span className="text-sky-600 font-semibold">~{flSqFt} sq ft</span>
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">Area estimates for material ordering (overage applied at checkout)</div>
                    </div>
                  );
                })()}
                {/* Priced-trim subtotal (toe kick + batten + light rail). Crown /
                    countertop / sink / hardware are quote-only and excluded. */}
                {(() => {
                  const tk = trimPriceByCode.get("TK-8");
                  const bam = trimPriceByCode.get("BAM");
                  const lrm = trimPriceByCode.get("LRM-8");
                  let sub = 0;
                  if (toeKick && effectiveTrimPieces.toeKick > 0 && tk && tk.unitPrice > 0) sub += tk.unitPrice * effectiveTrimPieces.toeKick;
                  if (batten && effectiveTrimPieces.batten > 0 && bam && bam.unitPrice > 0) sub += bam.unitPrice * effectiveTrimPieces.batten;
                  if (lightRail && effectiveTrimPieces.lightRail > 0 && lrm && lrm.unitPrice > 0) sub += lrm.unitPrice * effectiveTrimPieces.lightRail;
                  if (sub <= 0) return null;
                  return (
                    <div className="flex items-center justify-between gap-2 px-2 pt-1.5 text-xs">
                      <span className="text-muted-foreground">{t("dt_bs_trim_subtotal")}</span>
                      <span className="font-semibold">${sub.toFixed(2)}</span>
                    </div>
                  );
                })()}
                {/* Legend: clarify priced vs quote-only lines */}
                <div className="flex items-start gap-1.5 px-2 pt-2 text-[10px] leading-snug text-muted-foreground">
                  <span className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{t("dt_bs_quote_legend")}</span>
                </div>
              </div>
            )}
            </div>
            </SheetSection>
            )}
          </div>

          {/* Total */}
          <div className="p-3 border-t border-border shrink-0">
            {hasConflicts && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-[11px] text-red-700">
                <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-600" />
                <span>
                  <strong>{conflictUids.size} item{conflictUids.size > 1 ? "s" : ""} in conflict.</strong>{" "}

                  {rangeClearanceUids.size > 0
                    ? `A range/oven in the corner needs a ${RANGE_CLEARANCE_FILLER_IN}" filler beside it so the range handle clears the cabinet handle — add one with the Filler tool. `
                    : ""}
                  {wallOpeningUids.size > 0
                    ? `A wall cabinet is within ${WALL_OPENING_CLEARANCE_IN}" of a door or window — wall cabinets must stay at least ${WALL_OPENING_CLEARANCE_IN}" away from openings. `
                    : ""}
                  {/* Missing spec is no longer a blocking conflict — defaults are applied */}
                  {blindOutOfRangeCount > 0
                    ? `${blindOutOfRangeCount} blind corner cabinet${blindOutOfRangeCount > 1 ? "s" : ""} ${blindOutOfRangeCount > 1 ? "are" : "is"} pulled outside the manufacturer's min/max range. `
                    : ""}
                  {ceilingViolationUids.size > 0
                    ? `${ceilingViolationUids.size} cabinet${ceilingViolationUids.size > 1 ? "s are" : " is"} taller than the ${(() => { const c = inchesToFeetInches(roomCeiling(room)); return c.inches === 0 ? `${c.feet}'` : `${c.feet}'${c.inches}"`; })()} ceiling — pick a shorter box or raise the ceiling height. `
                    : ""}
                  {cornerBaseViolationUids.size > 0
                    ? `${cornerBaseViolationUids.size} standard base cabinet${cornerBaseViolationUids.size > 1 ? "s are" : " is"} placed at a room corner — replace with a Blind Corner Base (BBC), Easy Reach Base (ERB), Lazy Susan (LSB), or Corner Sink Base (CSB). `
                    : ""}
                  An appliance running into a cabinet must be fixed before ordering.
                </span>
              </div>
            )}
            {/* Range/oven corner clearance is now a WARNING ONLY. Per product
                decision, Cabinet Dealz does not auto-insert or auto-shift
                cabinets — the designer places the clearance filler manually
                with the Filler tool wherever they want it. */}
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
              if (twoToneCrossDistributor) {
                noteItems.push(
                  <div key="twotone-family" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span>{t("dt_two_tone_family_warn")}</span>
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
            {/* Mixed-warehouse shipping surcharge warning */}
            {mixedWarehouseOverride && (
              <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <strong>{t("dt_dist_surcharge_title")}</strong>{" "}
                {t("dt_dist_surcharge_body")}
              </div>
            )}
            {/* PRIMARY action: turn the design into a real, orderable cart. */}
            <Button
              className="w-full mt-2 bg-[#a87f33] text-white hover:bg-[#a87f33]/90 gap-2"
              disabled={cartableLines.length === 0}
              onClick={() => {
                if (hasConflicts && !window.confirm(
                  t("dt_confirm_export_conflicts", { n: conflictUids.size, s: conflictUids.size > 1 ? "s" : "" })
                )) return;
                addAllToCart();
              }}
            >
              <ShoppingCart className="h-4 w-4" /> {t("dt_cart_add_all")}
            </Button>
            <Button
              variant="outline"
              className="w-full mt-2 gap-2 border-[#a87f33] text-[#7a5c24] hover:bg-[#a87f33]/10"
              onClick={() => setSurfacesOpen(true)}
            >
              <Waves className="h-4 w-4" /> Surfaces & Fixtures
              {selectedSurfaces.length > 0 ? ` (${selectedSurfaces.length})` : ""}
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
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{t("dt_bs_countertop_material")}</p>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline"
                    title="Remove the countertop and any sinks on it"
                    onClick={() => {
                      setCountertop(false);
                      setSinks([]);
                      setSelectedSinkUid(null);
                      toast.success("Countertop removed");
                    }}
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>
                <PelicanCountertopPicker
                  selectedSurfaces={selectedSurfaces}
                  onSelect={(item) => addRecommendedSurface(item, "countertop")}
                  onBrowseAll={() => setSurfacesOpen(true)}
                />

                <p className="text-xs font-semibold text-foreground mt-3 mb-1">{t("dt_bs_edge_profile")}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {EDGE_PROFILES.map((ep) => (
                    <button
                      key={ep.id}
                      type="button"
                      onClick={() => setEdgeProfileId(ep.id)}
                      className={`flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-[10px] transition-colors ${
                        edgeProfileId === ep.id
                          ? "border-[#1a2744] bg-[#1a2744]/8 font-semibold"
                          : "border-border hover:border-[#1a2744]/40 hover:bg-muted/30"
                      }`}
                    >
                      <svg viewBox="0 0 24 16" className="h-4 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d={ep.svgPath} />
                      </svg>
                      <span className="leading-tight">{ep.name}</span>
                    </button>
                  ))}
                </div>

                                <p className="text-xs font-semibold text-foreground mt-3 mb-2">{t("dt_bs_add_sink")}</p>
                <PelicanSinkPicker
                  selectedSurfaces={selectedSurfaces}
                  onSelect={(item) => {
                    addRecommendedSurface(item, "sink");
                    // Also place a physical sink fixture on the plan
                    const sizeStr = item.size || "";
                    const wMatch = sizeStr.match(/(\d+)/); // first number = width
                    const w = wMatch ? parseInt(wMatch[1], 10) : 30;
                    const sinkW = Math.min(Math.max(w, 12), 42);
                    const sinkD = sinkW >= 30 ? 20 : 18;
                    const sinkType: SinkType = /farm/i.test(item.name) ? "farmhouse" : /bar|prep/i.test(item.name) ? "bar" : sinkW >= 30 ? "double" : "single";
                    const x = Math.max(0, Math.min(room.width / 2 - sinkW / 2, room.width - sinkW));
                    let y: number;
                    if (activeWall === "bottom") y = room.depth - sinkD - 1;
                    else if (activeWall === "top") y = 1;
                    else y = room.depth / 2 - sinkD / 2;
                    const sink: SinkFixture = {
                      uid: `sink-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
                      type: sinkType,
                      x,
                      y,
                      width: sinkW,
                      depth: sinkD,
                      faucet: true,
                      pelicanProductId: item.id,
                      pelicanProductName: item.name,
                      pelicanProductImage: item.imageUrl ?? undefined,
                    };
                    setSinks((prev) => [...prev, sink]);
                    setSelectedSinkUid(sink.uid);
                    setCountertop(true);
                  }}
                  onBrowseAll={() => setSurfacesOpen(true)}
                />
                {sinks.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {sinks.map((s) => (
                      <div key={s.uid} className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[11px] ${s.uid === selectedSinkUid ? "border-[#1a2744] bg-muted/40" : "border-border"}`}>
                        <button className="flex-1 text-left truncate" onClick={() => setSelectedSinkUid(s.uid)}>
                          {s.pelicanProductName || SINK_PRESETS[s.type].name} ({s.width}″)
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

            {/* Backsplash & Flooring pickers moved to the ··· More dropdown menu */}
          </div>
          </div>{/* end flex-col wrapper */}
        </PricingShell>
      </div>

      {/* Mobile bottom toolbar — core actions; side panels open as drawers. */}
      {isMobile && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="grid grid-cols-10 h-14">
            <MobileBarButton
              icon={<Boxes className="h-5 w-5" />}
              label="Catalog"
              active={mobilePanel === "catalog" && paletteType !== "surfaces"}
              onClick={() => {
                if (paletteType === "surfaces") setPaletteType("base");
                setMobilePanel("catalog");
              }}
            />
            <MobileBarButton
              icon={<Waves className="h-5 w-5" />}
              label="Palette"
              active={mobilePanel === "catalog" && paletteType === "surfaces"}
              onClick={() => {
                setPaletteType("surfaces");
                setMobilePanel("catalog");
              }}
            />
            <MobileBarButton
              icon={<Undo2 className="h-5 w-5" />}
              label="Undo"
              onClick={handleUndo}
            />
            <MobileBarButton
              icon={<Redo2 className="h-5 w-5" />}
              label="Redo"
              onClick={handleRedo}
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
              disabled={(!selectedUid && !selectedSinkUid && !selectedOpeningUid && !selectedPonyWallUid) || measureMode}
              danger
              onClick={deleteSelected}
            />
            <MobileBarButton
              icon={cabinetsLocked ? <Lock className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}
              label={cabinetsLocked ? "Locked" : "Lock"}
              active={cabinetsLocked}
              onClick={() => {
                setCabinetsLocked((v) => !v);
                toast.success(!cabinetsLocked ? "Cabinets locked — positions are frozen" : "Cabinets unlocked");
              }}
            />
            <MobileBarButton
              icon={<Download className="h-5 w-5" />}
              label="Export"
              onClick={async () => {
                const el = canvasExportRef.current;
                if (!el) return;
                toast.info("Exporting image\u2026");
                try {
                  const { toPng } = await import("html-to-image");
                  const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true });
                  const link = document.createElement("a");
                  link.download = `cabinet-design-${activeWall}-${Date.now()}.png`;
                  link.href = dataUrl;
                  link.click();
                  toast.success("Image exported!");
                } catch (err) {
                  console.error(err);
                  toast.error("Export failed");
                }
              }}
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
      {/* Mobile style / color picker sheet */}
      {isMobile && (
        <Sheet open={mobilePanel === "style"} onOpenChange={(o) => setMobilePanel(o ? "style" : null)}>
          <SheetContent side="bottom" className="rounded-t-2xl p-0" style={{ maxHeight: "min(70vh, calc(100dvh - 4rem))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="text-sm">Door Style &amp; Color</SheetTitle>
            </SheetHeader>
            <div className="px-4 py-4 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <ColorSlotButton
                  label={t("dt_bs_color_1")}
                  slot="A"
                  active={activeSlot === "A"}
                  style={styleA != null ? (doorStyles?.find((d) => d.id === styleA) ?? null) : null}
                  styles={uniqueDoorStyles}
                  distributors={distributorLabels ?? []}
                  onSelect={() => {
                    if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                    selectColorSlot("A");
                  }}
                  onPick={(id) => {
                    if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                    setSlotStyle("A", id);
                  }}
                  onClear={undefined}
                />
                <ColorSlotButton
                  label={t("dt_bs_color_2")}
                  slot="B"
                  active={activeSlot === "B"}
                  style={styleB != null ? (doorStyles?.find((d) => d.id === styleB) ?? null) : null}
                  styles={slotBStyles}
                  distributors={distributorLabels ?? []}
                  disabled={cabinetsLocked || styleA == null}
                  disabledReason={cabinetsLocked ? "Cabinets are locked — unlock to change door style" : "Set Color 1 first before choosing Color 2"}
                  onSelect={() => {
                    if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                    if (styleB != null) selectColorSlot("B"); else toast.info(t("dt_t_second_style_first"));
                  }}
                  onPick={(id) => {
                    if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change door style"); return; }
                    setSlotStyle("B", id);
                  }}
                  onClear={styleB != null && !cabinetsLocked ? () => {
                    setPlaced((prev) => prev.map((p) => (p.styleId === styleB ? { ...p, styleId: null } : p)));
                    setStyleB(null);
                    if (activeSlot === "B") { setActiveSlot("A"); if (styleA != null) setStyleId(styleA); }
                    toast.success(t("dt_t_second_color_removed"));
                  } : undefined}
                />
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">{t("dt_bs_two_tone_help")}</p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-foreground shrink-0">{t("dt_bs_pricing")}</span>
                <Select value={tier} disabled={cabinetsLocked} onValueChange={(v) => { if (cabinetsLocked) { toast.info("Cabinets are locked — unlock to change pricing tier"); return; } setTier(v as PricingTier); }}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Wholesale">{t("dt_bs_wholesale")}</SelectItem>
                    <SelectItem value="Contractor">{t("dt_bs_contractor")}</SelectItem>
                    <SelectItem value="Homeowner">{t("dt_bs_homeowner")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetContent>
        </Sheet>
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
      <SurfacesPickerDialog
        open={surfacesOpen}
        onOpenChange={setSurfacesOpen}
        selected={selectedSurfaces}
        onToggle={toggleSurface}
      />
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
        designStyleId={styleId}
        distributorId={lockedDistributorId}
        onSetRolloutQty={setRolloutQtyFor}
        onSetGlassDoor={setGlassDoorFor}
        glassDoorAvailable={glassDoorAvailableForAttr}
        onSetBlindPull={(uid, pull) => setCabAttr(uid, { blindPull: pull })}
        onSetWaterfall={(uid, side, enabled) => setCabAttr(uid, side === "left" ? { waterfallLeft: enabled } : { waterfallRight: enabled })}
        onSetCategory={(uid, category, subCategory) => setCabAttr(uid, { category, subCategory })}
        onSetOvenType={(uid, ovenType) => setCabAttr(uid, { ovenType })}
      />

      {/* Refrigerator Options: opens right after a fridge is dropped */}
      <RefrigeratorOptionsDialog
        open={!!fridgeDialog}
        onOpenChange={(o) => { if (!o) setFridgeDialog(null); }}
        fridgeWidthInches={fridgeForDialog ? rotatedSize(fridgeForDialog).w : undefined}
        deepAbove={(fridgeSurround as { deepAbove?: DesignCabinet[] } | undefined)?.deepAbove ?? []}
        endPanels={(fridgeSurround as { endPanels?: DesignCabinet[] } | undefined)?.endPanels ?? []}
        hasSmoothPanel={((fridgeSurround as { smoothPanels?: unknown[] } | undefined)?.smoothPanels?.length ?? 0) > 0}
        onApply={applyFridgeSurround}
        onSkip={() => setFridgeDialog(null)}
      />

      {/* Sink Base Top Dialog: opens when a sink base cabinet is placed */}
      {sinkBaseDialog && (() => {
        const filteredRangeTops = (rangeTopProducts ?? []) as Array<{
          id: number; name: string; subCategory: string | null; size: string | null; imageUrl: string | null; sellPrice: number | null; slug: string; category: string;
        }>;
        const filteredSinks = (sinkBaseProducts ?? []) as Array<{
          id: number; name: string; subCategory: string | null; size: string | null; imageUrl: string | null; sellPrice: number | null; slug: string; category: string;
        }>;
        const applyRangeTop = (type: "gas" | "electric" | "smooth-top", product?: typeof filteredRangeTops[0]) => {
          setCabAttr(sinkBaseDialog.cabinetUid, { sinkTopType: type, sinkTopProductId: product?.id ?? null, rangeTopImageUrl: product?.imageUrl ?? null });
          if (product) {
            addRecommendedSurface(
              { id: product.id, slug: product.slug, name: product.name, category: product.category, subCategory: product.subCategory, size: product.size, imageUrl: product.imageUrl, sellPrice: product.sellPrice },
              "range-top"
            );
          }
          setSinkBaseDialog(null);
          setRangeTopStep("choose");
          setPendingRangeTopType(null);
          toast.success(type === "gas" ? "Gas range top added" : type === "electric" ? "Electric range top added" : "Smooth top added");
        };
        const filteredFaucets = (faucetBaseProducts ?? []) as Array<{
          id: number; name: string; subCategory: string | null; size: string | null; imageUrl: string | null; sellPrice: number | null; slug: string; category: string;
        }>;
        const applySink = (sinkProduct: typeof filteredSinks[0] | null, faucetProduct: typeof filteredFaucets[0] | null) => {
          const fp = placedFootprint(placed.find(p => p.uid === sinkBaseDialog.cabinetUid) ?? { x: 0, y: 0, width: 30, depth: 24, rotation: 0, placement: "base" } as PlacedCabinet);
          const cab = placed.find(p => p.uid === sinkBaseDialog.cabinetUid);
          const preset = SINK_PRESETS["single"];
          const sx = cab ? Math.max(0, Math.min(cab.x + fp.w / 2 - preset.width / 2, room.width - preset.width)) : 0;
          const sy = cab ? Math.max(0, Math.min(cab.y + fp.d / 2 - preset.depth / 2, room.depth - preset.depth)) : 0;
          const autoSink = makeSink("single", sx, sy);
          setSinks((prevSinks) => [...prevSinks, autoSink]);
          setSelectedSinkUid(autoSink.uid);
          setCabAttr(sinkBaseDialog.cabinetUid, { sinkTopType: "sink", sinkTopProductId: sinkProduct?.id ?? null, faucetProductId: faucetProduct?.id ?? null, faucetImageUrl: faucetProduct?.imageUrl ?? null, sinkImageUrl: sinkProduct?.imageUrl ?? null });
          if (sinkProduct) {
            addRecommendedSurface(
              { id: sinkProduct.id, slug: sinkProduct.slug, name: sinkProduct.name, category: sinkProduct.category, subCategory: sinkProduct.subCategory, size: sinkProduct.size, imageUrl: sinkProduct.imageUrl, sellPrice: sinkProduct.sellPrice },
              "sink"
            );
          }
          if (faucetProduct) {
            addRecommendedSurface(
              { id: faucetProduct.id, slug: faucetProduct.slug, name: faucetProduct.name, category: faucetProduct.category, subCategory: faucetProduct.subCategory, size: faucetProduct.size, imageUrl: faucetProduct.imageUrl, sellPrice: faucetProduct.sellPrice },
              "faucet"
            );
          }
          setSinkBaseDialog(null);
          setRangeTopStep("choose");
          setPendingSinkProduct(null);
          toast.success(faucetProduct ? "Sink & faucet added" : "Sink added");
        };
        return (
          <div className="fixed inset-0 z-[300] flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={() => { setSinkBaseDialog(null); setRangeTopStep("choose"); setPendingRangeTopType(null); }} />
            <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-[400px] max-w-[95vw] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200" style={{ maxHeight: "90vh", overflowY: "auto" }}>
              {rangeTopStep === "choose" && (
                <>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">What goes on top?</h2>
                    <p className="text-sm text-muted-foreground mt-1">Choose what will be installed on this sink base cabinet.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className="flex flex-col items-center gap-3 rounded-xl border-2 border-border hover:border-[#a87f33] p-5 transition-colors group"
                      onClick={(e) => { e.stopPropagation(); setRangeTopStep("range-type"); }}
                    >
                      <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center group-hover:bg-orange-200 dark:group-hover:bg-orange-900/50 transition-colors">
                        <Flame className="h-7 w-7 text-orange-500" />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold">Range Top</div>
                        <div className="text-xs text-muted-foreground">Gas / Electric / Smooth</div>
                      </div>
                    </button>
                    <button
                      className="flex flex-col items-center gap-3 rounded-xl border-2 border-border hover:border-[#a87f33] p-5 transition-colors group"
                      onClick={(e) => { e.stopPropagation(); setRangeTopStep("sink"); }}
                    >
                      <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                        <Droplets className="h-7 w-7 text-blue-500" />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold">Sink</div>
                        <div className="text-xs text-muted-foreground">Kitchen / Bar / Farm</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
              {rangeTopStep === "sink" && (
                <>
                  <div className="flex items-center gap-2">
                    <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setRangeTopStep("choose")}>
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </button>
                    <h2 className="text-lg font-semibold text-foreground">Choose a Sink</h2>
                  </div>
                  <p className="text-sm text-muted-foreground -mt-2">Pick a sink from our Stone Creek collection, or skip to add without one.</p>
                  {filteredSinks.length === 0 ? (
                    <button className="w-full text-xs text-muted-foreground border border-dashed rounded-lg py-3" onClick={() => { setPendingSinkProduct(null); setRangeTopStep("faucet"); }}>Continue without a sink product</button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {filteredSinks.slice(0, 6).map(p => (
                        <button key={p.id} className="overflow-hidden rounded-lg border border-border hover:border-[#a87f33] text-left transition-colors" onClick={() => { setPendingSinkProduct(p); setRangeTopStep("faucet"); }}>
                          <div className="aspect-[4/3] w-full bg-muted">
                            {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Droplets className="h-5 w-5 text-muted-foreground/40" /></div>}
                          </div>
                          <div className="p-1.5">
                            <div className="line-clamp-2 text-[11px] font-semibold leading-snug">{p.name}</div>
                            {p.sellPrice != null && <div className="text-[11px] font-bold text-[#1a2744] dark:text-foreground">${p.sellPrice.toFixed(2)}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="text-xs text-muted-foreground underline self-center" onClick={() => { setPendingSinkProduct(null); setRangeTopStep("faucet"); }}>Skip sink selection</button>
                </>
              )}
              {rangeTopStep === "faucet" && (
                <>
                  <div className="flex items-center gap-2">
                    <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setRangeTopStep("sink")}>
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </button>
                    <h2 className="text-lg font-semibold text-foreground">Choose a Faucet</h2>
                  </div>
                  {pendingSinkProduct && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <Droplets className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="text-muted-foreground">Sink: </span>
                      <span className="font-medium line-clamp-1">{pendingSinkProduct.name}</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground -mt-2">Pick a matching faucet from Stone Creek, or skip to finish.</p>
                  {filteredFaucets.length === 0 ? (
                    <button className="w-full text-xs text-muted-foreground border border-dashed rounded-lg py-3" onClick={() => applySink(pendingSinkProduct, null)}>Finish without a faucet</button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {filteredFaucets.slice(0, 6).map(p => (
                        <button key={p.id} className="overflow-hidden rounded-lg border border-border hover:border-[#a87f33] text-left transition-colors" onClick={() => applySink(pendingSinkProduct, p)}>
                          <div className="aspect-[4/3] w-full bg-muted">
                            {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Droplets className="h-5 w-5 text-muted-foreground/40" /></div>}
                          </div>
                          <div className="p-1.5">
                            <div className="line-clamp-2 text-[11px] font-semibold leading-snug">{p.name}</div>
                            {p.sellPrice != null && <div className="text-[11px] font-bold text-[#1a2744] dark:text-foreground">${p.sellPrice.toFixed(2)}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="text-xs text-muted-foreground underline self-center" onClick={() => applySink(pendingSinkProduct, null)}>Skip faucet selection</button>
                </>
              )}
              {/* Step 1 of Range Top: choose the type (Gas / Electric / Smooth Top) */}
              {rangeTopStep === "range-type" && (
                <>
                  <div className="flex items-center gap-2">
                    <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setRangeTopStep("choose")}>
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </button>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Range Top Type</h2>
                      <p className="text-sm text-muted-foreground">What kind of cooktop will you install?</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    {([
                      { type: "gas" as const, label: "Gas Range Top", desc: "Open burners, precise flame control", icon: <Flame className="h-7 w-7 text-orange-500" />, bg: "bg-orange-100 dark:bg-orange-900/30" },
                      { type: "electric" as const, label: "Electric Range Top", desc: "Coil or radiant electric burners", icon: <Zap className="h-7 w-7 text-yellow-500" />, bg: "bg-yellow-100 dark:bg-yellow-900/30" },
                      { type: "smooth-top" as const, label: "Smooth Top / Induction", desc: "Glass-ceramic or induction surface", icon: <span className="text-2xl">〰</span>, bg: "bg-slate-100 dark:bg-slate-800" },
                    ]).map(({ type, label, desc, icon, bg }) => (
                      <button
                        key={type}
                        className="flex items-center gap-4 rounded-xl border-2 border-border hover:border-[#a87f33] p-4 transition-colors text-left group"
                        onClick={(e) => { e.stopPropagation(); setPendingRangeTopType(type); setRangeTopStep(type); }}
                      >
                        <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
                        <div>
                          <div className="font-semibold text-sm text-foreground">{label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                  <button className="text-xs text-muted-foreground underline self-center" onClick={() => { setSinkBaseDialog(null); setRangeTopStep("choose"); setPendingRangeTopType(null); }}>Skip for now</button>
                </>
              )}
              {/* Step 2 of Range Top: pick a specific product from Stone Creek */}
              {(rangeTopStep === "range-product" || rangeTopStep === "gas" || rangeTopStep === "electric" || rangeTopStep === "smooth-top") && (() => {
                const effectiveType: "gas" | "electric" | "smooth-top" = (rangeTopStep === "gas" || rangeTopStep === "electric" || rangeTopStep === "smooth-top") ? rangeTopStep : (pendingRangeTopType ?? "gas");
                return (
                <>
                  <div className="flex items-center gap-2">
                    <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setRangeTopStep("range-type")}>
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </button>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {effectiveType === "gas" ? "Gas" : effectiveType === "electric" ? "Electric" : "Smooth Top"} Range Tops
                      </h2>
                      <p className="text-sm text-muted-foreground">Stone Creek Collection</p>
                    </div>
                  </div>
                  {(() => {
                    const typeProducts = filteredRangeTops.filter(p => {
                      if (effectiveType === "gas") return p.subCategory === "Gas";
                      if (effectiveType === "electric") return p.subCategory === "Electric";
                      return p.subCategory === "Smooth Top";
                    });
                    return typeProducts.length === 0 ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-muted-foreground text-center py-4">No {effectiveType} range tops in catalog yet.</p>
                        <button
                          className="w-full rounded-lg border border-dashed border-[#a87f33] py-3 text-sm text-[#a87f33] font-medium hover:bg-[#a87f33]/5 transition-colors"
                          onClick={(e) => { e.stopPropagation(); applyRangeTop(effectiveType); }}
                        >
                          Add {effectiveType} range top (no product)
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {typeProducts.map(p => (
                          <button
                            key={p.id}
                            className="overflow-hidden rounded-xl border-2 border-border hover:border-[#a87f33] text-left transition-colors group"
                            onClick={(e) => { e.stopPropagation(); applyRangeTop(effectiveType, p); }}
                          >
                            <div className="aspect-[4/3] w-full bg-muted overflow-hidden">
                              {p.imageUrl
                                ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                : <div className="flex h-full items-center justify-center">{effectiveType === "gas" ? <Flame className="h-8 w-8 text-muted-foreground/30" /> : <Zap className="h-8 w-8 text-muted-foreground/30" />}</div>
                              }
                            </div>
                            <div className="p-2">
                              <div className="line-clamp-2 text-[11px] font-semibold leading-snug">{p.name}</div>
                              {p.sellPrice != null && <div className="text-[11px] font-bold text-[#1a2744] dark:text-foreground mt-0.5">${p.sellPrice.toFixed(2)}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  <button className="text-xs text-muted-foreground underline self-center" onClick={(e) => { e.stopPropagation(); applyRangeTop(effectiveType); }}>Skip — add without product</button>
                </>);
              })()}
              <button
                className="text-xs text-muted-foreground underline self-center"
                onClick={() => { setSinkBaseDialog(null); setRangeTopStep("choose"); }}
              >
                Skip for now
              </button>
            </div>
          </div>
        );
      })()}
      {/* Oven Type Dialog: opens when an oven tall cabinet (O-code) is placed */}
      {ovenDialog && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-[340px] max-w-[90vw] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold text-foreground">Oven Cabinet Type</h2>
            <p className="text-sm text-muted-foreground">Is this going to be a single oven or a double oven?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-border hover:border-primary p-4 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (ovenDialog) setCabAttr(ovenDialog.cabinetUid, { ovenType: "single" });
                  setOvenDialog(null);
                }}
              >
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/oven-single-front-U843ihaYrWbB8xwKsMyngZ.webp"
                  alt="Single oven"
                  className="w-20 h-24 object-cover rounded-lg"
                />
                <span className="text-sm font-medium">Single Oven</span>
                <span className="text-xs text-muted-foreground">3 drawers below</span>
              </button>
              <button
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-border hover:border-primary p-4 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (ovenDialog) setCabAttr(ovenDialog.cabinetUid, { ovenType: "double" });
                  setOvenDialog(null);
                }}
              >
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/oven-double-front-n2DaWbuTecczH4YKk7fJbo.webp"
                  alt="Double oven"
                  className="w-20 h-24 object-cover rounded-lg"
                />
                <span className="text-sm font-medium">Double Oven</span>
                <span className="text-xs text-muted-foreground">1 drawer below</span>
              </button>
            </div>
            <button
              className="text-xs text-muted-foreground underline self-center"
              onClick={() => setOvenDialog(null)}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

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

      {/* Mobile room size editor sheet */}
      {isMobile && (
        <Sheet open={mobilePanel === "room"} onOpenChange={(o) => setMobilePanel(o ? "room" : null)}>
          <SheetContent side="bottom" className="rounded-t-2xl p-0" style={{ maxHeight: "min(80vh, calc(100dvh - 4rem))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="text-sm">Room Size</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-4 py-4">
              <div className={layoutLocked ? "pointer-events-none opacity-50" : undefined} title={layoutLocked ? t("dt_sh_unlock_to_edit_room") : undefined}>
                <RoomSizeInline
                  room={room}
                  onChange={applyRoom}
                  onApplied={() => setMobilePanel(null)}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Rename design dialog (opened from mobile save success toast) */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename design</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim() && renameDesignId) {
                renameMut.mutate({ id: renameDesignId, name: renameValue.trim() });
              }
            }}
            placeholder="Design name"
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (renameValue.trim() && renameDesignId) {
                  renameMut.mutate({ id: renameDesignId, name: renameValue.trim() });
                }
              }}
              disabled={!renameValue.trim() || renameMut.isPending}
            >
              {renameMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Distributor conflict warning dialog */}
      <AlertDialog open={distConflictOpen} onOpenChange={(o) => { if (!o) { distConflictResolve?.(false); setDistConflictOpen(false); } }}>
        <AlertDialogContent className="max-w-md mx-4 sm:mx-auto animate-in fade-in-0 zoom-in-95 duration-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <span className="text-2xl">⚠️</span> Supplier Conflict
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-foreground space-y-2">
              <p>
                Your cart already contains cabinets from <strong>{cartLockedStyleLabel ?? "a different supplier"}</strong>.
              </p>
              <p>
                Cabinets from different suppliers cannot be mixed in the same order because they ship from separate warehouses and have different pricing.
              </p>
              <p className="font-medium text-destructive">
                Proceeding will clear your existing cart and replace it with this design.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { distConflictResolve?.(false); setDistConflictOpen(false); }}>
              Keep existing cart
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { distConflictResolve?.(true); setDistConflictOpen(false); }}
            >
              Clear cart &amp; add this design
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Design Preview Modal */}
      <DesignPreviewModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        placed={placed}
        room={room}
        activeWall={activeWall}
        doorStyleName={activeStyleName || undefined}
        countertopColor={countertopMaterial(countertopMaterialId).fill}
        countertopName={countertopMaterial(countertopMaterialId).name}
        hardwareName={hardwareStyleId !== "none" ? (HARDWARE_STYLES.find((h) => h.id === hardwareStyleId)?.label || undefined) : undefined}
      />
    </div>
  );
}

// ─── Mobile bottom-bar button ───────────────────────────────────────────────
function MobileBarButton({
  icon, label, onClick, disabled, danger, badge, active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  badge?: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors active:scale-95 disabled:opacity-40 ${
        danger ? "text-destructive" : active ? "text-amber-500" : "text-foreground"
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
        <SheetContent side="bottom" className="h-[92vh] p-0 gap-0 flex flex-col rounded-t-2xl">
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
// Small +/- stepper to override a trim's ordered stick count in the build sheet.
// undefined override = auto; setting a value pins the quantity; the reset link
// returns to the auto-calculated count.
function TrimQtyStepper({
  kind, value, auto, override, setOverride,
}: {
  kind: "crown" | "toeKick" | "batten" | "lightRail" | "valance";
  value: number;
  auto: number;
  override: number | undefined;
  setOverride: React.Dispatch<React.SetStateAction<Partial<Record<"crown" | "toeKick" | "batten" | "lightRail" | "valance", number>>>>;
}) {
  const set = (n: number) =>
    setOverride((prev) => ({ ...prev, [kind]: Math.max(0, Math.min(99, n)) }));
  const reset = () =>
    setOverride((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => set(value - 1)}
          disabled={value <= 0}
          className="flex h-5 w-5 items-center justify-center text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          &minus;
        </button>
        <span className="min-w-[1.5rem] px-1 text-center text-[11px] font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => set(value + 1)}
          className="flex h-5 w-5 items-center justify-center text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          +
        </button>
      </div>
      {override !== undefined ? (
        <button
          type="button"
          onClick={reset}
          className="text-[10px] text-[#1a2744] underline underline-offset-2 hover:opacity-80"
        >
          auto ({auto})
        </button>
      ) : (
        <span className="text-[10px] text-muted-foreground">auto</span>
      )}
    </div>
  );
}

function SheetSection({
  title, count, collapsed, onToggle, children, className, id,
}: {
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={className}>
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
