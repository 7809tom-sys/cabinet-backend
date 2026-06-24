import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import {
  LayoutGrid, Eye, Trash2, RotateCw, Search, Plus,
  DollarSign, PanelTop, Columns3, Ruler, Square, Download, DoorOpen,
  Boxes, ShoppingCart, MoreHorizontal, Lock, LockOpen, Wand2, X, Sparkles,
  ChevronUp, ChevronDown, ChevronsDown,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/useMobile";
import { usePersistFn } from "@/hooks/usePersistFn";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  PlacedCabinet, RoomData, DEFAULT_ROOM, DesignCabinet,
  dim, footprintDepth, makeUid, STD, rotatedSize, nextFreeSpot, standardHeight, dimLabel, placedHeight,
  conflictingUids, blindCornerViolations, blindCornerSpecViolations, isBlindCorner, isOnIsland, isCornerCabinet,
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
  rangeOvenClearanceViolations, RANGE_CLEARANCE_FILLER_IN,
  wallOpeningClearanceViolations, WALL_OPENING_CLEARANCE_IN,
  elevationBox,
} from "@/lib/design";
import { hickorySkinSuggestions, type HickorySkinSuggestion } from "@/lib/hickorySkins";
import {
  closetPaletteByCategory, closetPartPrice, isClosetPart, CLOSET_PARTS,
} from "@/lib/closet";
import { autoFillSpan, makeFiller, type FillMode } from "@/lib/autofill";
import { AIChatBox, type Message as AIMessage } from "@/components/AIChatBox";
import { PlanCanvas } from "@/components/design/PlanCanvas";
import { ElevationView } from "@/components/design/ElevationView";
import { EmailGate } from "@/components/design/EmailGate";
import { DesignActions, exportBuildSheet, type BuildSheetRow } from "@/components/design/DesignActions";
import { RoomSizeControl } from "@/components/design/RoomSizeControl";
import { WallPicker } from "@/components/design/WallPicker";
import { OpeningSizeEditor } from "@/components/design/OpeningSizeEditor";
import { DesignHelp } from "@/components/design/DesignHelp";
import { CountertopQuoteDialog } from "@/components/design/CountertopQuoteDialog";
import { CabinetDrawing } from "@/components/CabinetDrawing";
import { CabinetImage } from "@/components/CabinetImage";

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

type ViewMode = "plan" | "elevation" | "split";
type PricingTier = "Wholesale" | "Contractor";

function priceOf(row: { wholesalePrice: string | null; contractorPrice: string | null }, tier: PricingTier): number {
  const v = tier === "Wholesale" ? row.wholesalePrice : row.contractorPrice;
  return v ? parseFloat(v) : 0;
}

export default function DesignTool() {
  // Email gate
  const [verified, setVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const handleVerified = useCallback((email: string) => {
    setVerifiedEmail(email);
    setVerified(true);
  }, []);

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
    return v === "front" ? "elevation" : v === "split" ? "split" : "plan";
  });
  const [showWallLayer, setShowWallLayer] = useState(true);
  const [measureMode, setMeasureMode] = useState(false);
  // Island zone: an optional rectangular guide (inches) marking where island
  // cabinets go. Null when disabled.
  const [island, setIsland] = useState<{ x: number; y: number; width: number; depth: number } | null>(null);
  // Doors & windows: adjustable wall openings.
  const [openings, setOpenings] = useState<WallOpening[]>([]);
  const [selectedOpeningUid, setSelectedOpeningUid] = useState<string | null>(null);
  // Trim toggles rendered in elevation + added to the BOM.
  const [crown, setCrown] = useState(false);
  const [toeKick, setToeKick] = useState(false);
  const [batten, setBatten] = useState(false);
  const [lightRail, setLightRail] = useState(false);
  // Countertop tool: measures base + island runs; not auto-priced (quote request).
  const [countertop, setCountertop] = useState(false);
  // Countertop material: when set, a visible slab is drawn over base cabinets.
  const [countertopMaterialId, setCountertopMaterialId] = useState<string>(DEFAULT_COUNTERTOP_MATERIAL_ID);
  // Sink + faucet fixtures placed on the counter.
  const [sinks, setSinks] = useState<SinkFixture[]>([]);
  const [selectedSinkUid, setSelectedSinkUid] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
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
  const [paletteType, setPaletteType] = useState<"base" | "cornerbase" | "wall" | "wallht" | "cornerwall" | "tall" | "appliance" | "opening" | "closetparts">("base");
  // Room type: kitchen cabinets (default), bathroom, laundry, closet parts, or other.
  const [roomType, setRoomType] = useState<RoomType>("kitchen");

  // Pricing selectors
  const [styleId, setStyleId] = useState<number | null>(null);
  const [tier, setTier] = useState<PricingTier>("Contractor");

  // Data — door-style-first: members pick a door style; the supply line behind
  // it is resolved server-side and never shown.
  const { data: doorStyles } = trpc.doorStyles.list.useQuery();
  // De-duplicate by display name so the same style isn't listed once per line.
  const uniqueDoorStyles = useMemo(() => {
    const map = new Map<string, { id: number; ourName: string | null }>();
    for (const s of (doorStyles ?? []) as Array<{ id: number; ourName: string | null }>) {
      const key = (s.ourName || String(s.id)).toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).sort((a, b) => (a.ourName || "").localeCompare(b.ourName || ""));
  }, [doorStyles]);
  const { data: paletteCabinets, isLoading: paletteLoadingRaw } =
    trpc.design.placeableCabinets.useQuery(
      {
        placement:
          paletteType === "appliance" || paletteType === "opening" || paletteType === "closetparts"
            ? "base"
            : paletteType === "cornerbase"
            ? "base"
            : paletteType === "wallht" || paletteType === "cornerwall"
            ? "wall"
            : paletteType,
        // Narrow to the chosen line + style so only purchasable cabinets show.
        styleId: styleId ?? undefined,
      },
      { enabled: paletteType !== "appliance" && paletteType !== "opening" && paletteType !== "closetparts" }
    );
  const paletteLoading = paletteType === "appliance" || paletteType === "opening" || paletteType === "closetparts" ? false : paletteLoadingRaw;

  // A dedicated, full base-cabinet list for the active line, used by the
  // Auto-Fill engine (independent of which palette tab/search is active).
  const { data: autoFillCabinets } = trpc.design.placeableCabinets.useQuery({
    placement: "base",
    styleId: styleId ?? undefined,
  });

  // Detect a diagonal/corner WALL cabinet for the dedicated "Corner Wall" tab.
  const isCornerWall = useCallback((c: DesignCabinet) => {
    const sub = (c.subCategory || "").toLowerCase();
    return (
      c.isCornerCabinet === true ||
      sub.includes("corner") ||
      isCornerCabinet(c.masterCode, c.description || undefined)
    );
  }, []);

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
      const s0 = paletteSearch.toLowerCase();
      const all = closetGroups.flatMap((g) => g.items);
      return all.filter((c) => !s0 || c.masterCode.toLowerCase().includes(s0) || c.description.toLowerCase().includes(s0));
    }
    const source: DesignCabinet[] =
      paletteType === "appliance" ? appliancePalette : ((paletteCabinets as DesignCabinet[]) ?? []);
    const s = paletteSearch.toLowerCase();
    return source
      .filter((c) => {
        // "Corner Wall" shows only diagonal/corner wall cabinets; "Wall by Ht"
        // and plain "Wall" show the rest of the wall cabinets (non-corner) so
        // the two tabs don't duplicate each other.
        if (paletteType === "cornerwall") return isCornerWall(c);
        if (paletteType === "cornerbase") return isCornerBase(c);
        if (paletteType === "wall" || paletteType === "wallht") return !isCornerWall(c);
        // Plain "Base" excludes corner bases so they live only under "Corner Base".
        if (paletteType === "base") return !isCornerBase(c);
        return true;
      })
      .filter((c) => !s || c.masterCode.toLowerCase().includes(s) || c.description.toLowerCase().includes(s))
      .slice(0, 80);
  }, [paletteCabinets, paletteSearch, paletteType, appliancePalette, isCornerWall, isCornerBase, closetGroups]);

  // Group the palette by cabinet height so wall cabinets (and others) are easy
  // to find by size — mirrors how pros scan 2020's catalog by height.
  const groupedPalette = useMemo(() => {
    // The Closet-parts tab groups by part category (Panels, Shelves, Hanging…).
    if (paletteType === "closetparts") {
      const s = paletteSearch.toLowerCase();
      return closetGroups
        .map((g) => ({
          label: g.category,
          items: g.items.filter(
            (c) => !s || c.masterCode.toLowerCase().includes(s) || c.description.toLowerCase().includes(s)
          ),
        }))
        .filter((g) => g.items.length > 0);
    }
    const groups = new Map<number, DesignCabinet[]>();
    for (const c of filteredPalette) {
      const h = Math.round(dim(c.height, 0));
      const arr = groups.get(h);
      if (arr) arr.push(c);
      else groups.set(h, [c]);
    }
    // Tallest first; unknown height (0) sinks to the bottom.
    return Array.from(groups.entries())
      .sort((a, b) => (b[0] || -1) - (a[0] || -1))
      .map(([height, items]) => ({ label: height ? `${height}\" High` : "Other", items }));
  }, [filteredPalette, paletteType, paletteSearch, closetGroups]);

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
  const { data: priceRows } = trpc.design.priceForCabinets.useQuery(
    {
      cabinetIds: placedCabinetIds,
      styleId: styleId ?? 0,
    },
    { enabled: placedCabinetIds.length > 0 && !!styleId }
  );

  const priceMap = useMemo(() => {
    const m = new Map<number, number>();
    priceRows?.forEach((r) => m.set(r.cabinetId, priceOf(r, tier)));
    return m;
  }, [priceRows, tier]);

  // Resolve a placed item's unit price: closet parts carry id=0 (skipped by
  // the cabinet pricing engine) so they price from the placeholder catalog;
  // everything else prices from the DB price map.
  const unitPriceFor = useCallback(
    (p: { masterCode: string; cabinetId: number }): number | null => {
      if (isClosetPart(p.masterCode)) return closetPartPrice(p.masterCode);
      const v = priceMap.get(p.cabinetId);
      return v ?? null;
    },
    [priceMap]
  );

  const total = useMemo(
    () =>
      placed.reduce((sum, p) => sum + (unitPriceFor(p) ?? 0), 0) +
      addedAddOns.reduce(
        (sum, a) => sum + (priceMap.get(a.cabinetId) ?? 0) * a.qty,
        0
      ),
    [placed, addedAddOns, priceMap, unitPriceFor]
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
  const activeFinish = useMemo(() => finishColors(activeStyleName), [activeStyleName]);

  // Full active door style (with woodSpecies) so we can apply the Hickory-only
  // unfinished-end skin rule. Hickory cabinets ship with unfinished exposed
  // sides, so any exposed end needs a matching Hickory skin panel.
  const activeStyle = useMemo(
    () => doorStyles?.find((s) => s.id === styleId) ?? null,
    [doorStyles, styleId]
  );
  // Auto-suggested Hickory finished-end skins, one per exposed cabinet end.
  // Empty unless the selected finish is Hickory. NOTE: the real skin SKU/price
  // is pending owner confirmation, so these carry pendingSku=true.
  const hickorySkins = useMemo<HickorySkinSuggestion[]>(
    () => hickorySkinSuggestions(placed, room, activeStyle as never),
    [placed, room, activeStyle]
  );

  // Restore a saved design (room + placed cabinets + style) onto the canvas.
  const loadSavedDesign = useCallback(
    (d: { room: RoomData; placed: PlacedCabinet[]; styleId: number | null; roomType?: string | null }) => {
      setRoom(d.room ?? DEFAULT_ROOM);
      setPlaced(Array.isArray(d.placed) ? d.placed : []);
      setStyleId(d.styleId ?? null);
      if (d.roomType && ["kitchen", "bathroom", "laundry", "closet", "other"].includes(d.roomType)) {
        setRoomType(d.roomType as RoomType);
      }
      setSelectedUid(null);
    },
    []
  );

  // Itemized lines for the exported build sheet (cabinets aggregated by code).
  const buildRows = useMemo<BuildSheetRow[]>(() => {
    const map = new Map<string, BuildSheetRow>();
    for (const p of placed) {
      const sw = resolveSwing(p);
      const key = `${p.masterCode}|${Math.round(p.width)}|${sw}`;
      const closet = isClosetPart(p.masterCode);
      const unit = unitPriceFor(p);
      const existing = map.get(key);
      if (existing) existing.qty += 1;
      else
        map.set(key, {
          code: p.masterCode,
          description: p.description,
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
        unitPrice: styleId ? priceMap.get(a.cabinetId) ?? null : null,
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
    return rows;
  }, [placed, addedAddOns, priceMap, styleId, unitPriceFor, hickorySkins]);
  // Panel treatment for the placed cabinets' door fronts in the elevation view.
  const activePanelKind = useMemo(() => {
    const s = doorStyles?.find((d) => d.id === styleId) as { doorStyle?: string | null } | undefined;
    return doorPanelKind(s?.doorStyle ?? activeStyleName);
  }, [doorStyles, styleId, activeStyleName]);

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
        toast.info("Build the kitchen layout first — place base cabinets, then add the countertop.");
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
    // Blind corner pull spec issues (missing spec or out-of-range).
    blindSpecIssues.forEach((_issue, uid) => set.add(uid));
    return set;
  }, [placed, rangeClearanceUids, wallOpeningUids, blindSpecIssues]);
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
    }>();
    for (const p of placed) {
      const key = `${p.masterCode}|${Math.round(p.width)}|${Math.round(placedHeight(p))}|${((p.rotation % 360) + 360) % 360}`;
      const closet = isClosetPart(p.masterCode);
      const unit = unitPriceFor(p);
      const existing = map.get(key);
      if (existing) {
        existing.qty += 1;
        existing.uids.push(p.uid);
        if (conflictUids.has(p.uid)) existing.hasConflict = true;
      } else {
        map.set(key, {
          key,
          sample: p,
          uids: [p.uid],
          qty: 1,
          unitPrice: closet ? unit : styleId ? unit : null,
          hasConflict: conflictUids.has(p.uid),
          label: dimLabel(p),
          swing: resolveSwing(p),
        });
      }
    }
    return Array.from(map.values());
  }, [placed, priceMap, styleId, conflictUids, unitPriceFor]);

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
    return out;
  }, [fillers, crown, crownOrder, toeKick, toeKickOrder, batten, battenOrder, lightRail, lightRailOrder, countertop, counter, countertopMaterialId, sinks]);

  // ─── Placement actions ──────────────────────────────────────────────────────

  const addCabinet = useCallback(
    (c: DesignCabinet, x?: number, y?: number) => {
      const width = dim(c.width, 24);
      const depth = footprintDepth(c);
      const height = dim(c.height, standardHeight(c.placement));
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
          placement: c.placement,
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
        setSelectedUid(newCab.uid);
        // Blind corner trade rule: when a blind corner cabinet is dropped flush
        // in a room corner, auto-snap a 3" filler on the side OPPOSITE the pull
        // and let the cabinet project its full corner return. If we can't tell
        // which corner/side it is (ambiguous), we place nothing and the existing
        // blind-corner conflict stays on so the user resolves it manually.
        if (isBlindCorner(newCab.masterCode, newCab.description)) {
          const res = blindCornerAutoFiller(newCab, room, makeUid);
          if (res.filler) {
            toast.success('Blind corner: added a 3" filler on the side opposite the pull.');
            return [...prev, newCab, res.filler];
          }
          if (res.ambiguous) {
            toast.warning("Blind corner needs its filler — seat it in a corner so the opposite-side filler can be placed (left in conflict for now).");
          }
        }
        return [...prev, newCab];
      });
    },
    [room, activeWall, openings]
  );

  // Manual filler from the palette/toolbar: drop a real orderable filler/scribe
  // of a chosen width as a normal movable item (NOT auto-placed). Uses the same
  // makeFiller spec as the auto-fill engine so it carries a code + width and
  // shows on the build sheet. Default 3" — the most common scribe width.
  const addManualFiller = useCallback(() => {
    if (layoutLocked) { toast.info("Unlock the layout to add a filler."); return; }
    const raw = window.prompt('Filler width in inches (typical 3", max 6"):', "3");
    if (raw == null) return;
    const w = Math.round(parseFloat(raw) * 10) / 10;
    if (!Number.isFinite(w) || w <= 0) { toast.error("Enter a filler width greater than 0."); return; }
    if (w > 6) { toast.error('Fillers are typically 6" or less — use a panel for wider gaps.'); return; }
    const placement: DesignCabinet["placement"] = roomType === "closet" ? "base" : "base";
    const fillerDef = makeFiller(w, placement);
    addCabinet(fillerDef);
    toast.success(`Added a ${w}" filler — drag it into the gap.`);
  }, [layoutLocked, roomType, addCabinet]);

  // ── Auto-Fill: tile the active wall with a suggested run of cabinets ────────
  // Computes the usable span on the highlighted wall (wall length minus any
  // cabinets/openings already on it), runs the deterministic engine, and drops
  // each chosen cabinet flush along the wall using the same nextFreeSpotOnWall
  // geometry as manual placement. Items are fully movable/deletable afterward.
  const autoFillActiveWall = useCallback(() => {
    if (layoutLocked) { toast.info("Unlock the layout to auto-fill a wall."); return; }
    const mode: FillMode = roomType === "closet" ? "closet" : "kitchen";
    const pool = (autoFillCabinets as DesignCabinet[] | undefined) ?? [];
    if (pool.length === 0) { toast.error("No cabinets available for this line yet — pick a door style first."); return; }

    // Break the wall into OPEN segments around existing cabinets and any
    // door/window openings, then tile EACH segment independently so the run
    // breaks cleanly around a doorway instead of running under it.
    const segments = freeSegmentsOnWall(activeWall, room, placed, openings, 9);
    if (segments.length === 0) { toast.info("This wall is already full."); return; }

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
        toast.info("Couldn't fit any cabinets in the remaining space.");
        return prev;
      }
      const segNote = segments.length > 1 ? ` across ${segments.length} sections` : "";
      const fillerNote = totalFiller > 0 ? ` + ${Math.round(totalFiller * 10) / 10}\" filler` : "";
      toast.success(`Auto-filled ${WALL_LABELS[activeWall]} wall: ${totalCount} cabinet${totalCount === 1 ? "" : "s"}${segNote}${fillerNote}.`);
      return working;
    });
  }, [layoutLocked, activeWall, room, roomType, autoFillCabinets, placed, openings]);

  // ── Range/oven corner clearance: one-click fix ──────────────────────────────
  // For each range/oven flagged by the clearance rule, nudge the neighboring
  // cabinets on its interior side outward by the filler width and drop a real
  // filler/scribe between the appliance and that cabinet so the handles clear.
  const addClearanceFiller = useCallback(() => {
    if (layoutLocked) { toast.info("Unlock the layout to add a clearance filler."); return; }
    const bad = rangeOvenClearanceViolations(placed, room);
    if (bad.size === 0) { toast.info("No range/oven corner clearance issues to fix."); return; }
    const W = RANGE_CLEARANCE_FILLER_IN;
    setPlaced((prev) => {
      let working = [...prev];
      let added = 0;
      for (const range of prev) {
        if (!bad.has(range.uid)) continue;
        const side = cabinetWall(range, room);
        const horizontal = side === "top" || side === "bottom";
        const rs = rotatedSize(range);
        const start = horizontal ? range.x : range.y;
        const end = start + (horizontal ? rs.w : rs.d);
        const atStartCorner = Math.abs(start - 0) <= 1.0;
        // Interior edge is the end facing into the run.
        const interiorEdge = atStartCorner ? end : start;
        const dir = atStartCorner ? 1 : -1; // push neighbors away from the corner
        // Shift every base/tall cabinet beyond the interior edge outward by W.
        working = working.map((p) => {
          if (p.uid === range.uid) return p;
          if (p.placement !== "base" && p.placement !== "tall") return p;
          if (cabinetWall(p, room) !== side) return p;
          const ps = rotatedSize(p);
          const pStart = horizontal ? p.x : p.y;
          const pEnd = pStart + (horizontal ? ps.w : ps.d);
          const beyond = dir > 0 ? pStart >= interiorEdge - 1.0 : pEnd <= interiorEdge + 1.0;
          if (!beyond) return p;
          if (horizontal) return { ...p, x: p.x + dir * W };
          return { ...p, y: p.y + dir * W };
        });
        // Drop the filler exactly in the gap that opened up at the interior edge.
        const along = dir > 0 ? interiorEdge : interiorEdge - W;
        const fillerDef = makeFiller(W, "base");
        const spot = wallPlacementAt(along, W, footprintDepth(fillerDef), side, room);
        working.push({
          uid: makeUid(),
          cabinetId: 0,
          masterCode: fillerDef.masterCode,
          description: `${W}\" Range/Oven Clearance Filler`,
          placement: "base",
          x: spot.x,
          y: spot.y,
          width: W,
          depth: footprintDepth(fillerDef),
          height: dim(fillerDef.height, standardHeight("base")),
          rotation: spot.rotation,
          numberOfDoors: 0,
          numberOfDrawers: 0,
          catalogImageUrl: null,
        });
        added++;
      }
      if (added === 0) { toast.info("Couldn't place a clearance filler automatically — try nudging the cabinet manually."); return prev; }
      toast.success(`Added ${added} clearance filler${added === 1 ? "" : "s"} (${W}\" each) next to the range/oven.`);
      return working;
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
      return { id: side, label: WALL_LABELS[side], lengthInches: Math.max(12, full - openingW) };
    });
  }, [room, openings]);

  // Apply a returned plan: place each wall's items flush along that wall.
  const applyConsultPlan = useCallback(
    (plan: ConsultPlanWall[]) => {
      if (layoutLocked) { toast.info("Unlock the layout to apply a suggested design."); return; }
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
      if (total > 0) toast.success(`Design consultant placed ${total} item${total === 1 ? "" : "s"} — drag or swap anything.`);
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
    toast.success(`${preset.name} added — drag it onto the counter.`);
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
          toast.info("This item has no hinged door to swing.");
          return p;
        }
        const current = resolveSwing(p);
        if (current === "double") {
          toast.info("Double-door cabinet — both doors open from the center.");
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

  // Raise/lower the selected WALL cabinet's mount height. Stores an explicit
  // mountBottom override (inches from floor to the box bottom); the elevation
  // then uses it verbatim instead of the default hang rule.
  const adjustMountHeight = useCallback((deltaIn: number) => {
    if (!selectedUid) return;
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== selectedUid) return p;
        if (p.placement !== "wall") return p;
        const cur = elevationBox(p).bottom;
        const next = Math.max(0, Math.round((cur + deltaIn) * 10) / 10);
        return { ...p, mountBottom: next };
      })
    );
  }, [selectedUid]);

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

  // Right-click a WALL cabinet -> drop it to the floor as an island/peninsula
  // base. It keeps its width but becomes a floor-standing box, so its TOP lands
  // at the standard base box height (34.5"): bottom = 0. A 30" wall cabinet on
  // the floor therefore tops out at 34.5", matching base/counter height.
  const dropToFloor = useCallback((uid: string) => {
    if (layoutLocked) { toast.info("Unlock the layout to drop a cabinet to the floor."); return; }
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.uid !== uid) return p;
        if (p.placement !== "wall") return p;
        return {
          ...p,
          placement: "base",
          depth: STD.BASE_DEPTH,
          // Box height: keep the cabinet's own height if it has one, otherwise
          // fall back to the standard base box height.
          height: p.height && p.height > 0 ? p.height : STD.BASE_HEIGHT,
          // Sits on the floor as an island base; clear any wall-mount override.
          mountBottom: undefined,
        };
      })
    );
    toast.success("Dropped to floor as an island base (top at 34.5\").");
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
      } else if (e.key === "Escape") {
        setSelectedUid(null);
        setSelectedOpeningUid(null);
        setMeasureMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUid, deleteCabinet, selectedOpeningUid, deleteOpening, measureMode, rotateSelected, swingSelected]);

  const dragDataRef = useState<{ current: DesignCabinet | null }>(() => ({ current: null }))[0];

  // Preload a kitchen package layout onto the canvas (once per slug).
  useEffect(() => {
    if (!packageLayout || loadedPackageRef.current === packageLayout.slug) return;
    loadedPackageRef.current = packageLayout.slug;
    setRoom({ width: packageLayout.room.width, depth: packageLayout.room.depth });
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
    setPlaced(items);
    setSelectedUid(null);
    toast.success(`Loaded "${packageLayout.name}" — edit, swap styles, and re-price.`);
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
      roomType: (savedDesign as { roomType?: string | null }).roomType ?? null,
    });
    toast.success(`Loaded "${savedDesign.name}" — edit, swap styles, and re-price.`);
  }, [loadDesignId, savedDesign, loadSavedDesign]);

  // Surface a failed package preload (network error or invalid slug).
  useEffect(() => {
    if (!packageSlug || !verified) return;
    if (packageError && !packageErrorRef.current) {
      packageErrorRef.current = true;
      toast.error("Couldn't load that kitchen package. Start from the package page and try again.");
    }
    // packageLayout resolves to null for an unknown slug (no throw).
    if (packageLayout === null && !packageErrorRef.current) {
      packageErrorRef.current = true;
      toast.error("That kitchen package wasn't found — starting with a blank canvas.");
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
          if (Array.isArray(d.placed)) setPlaced(d.placed);
          if (Array.isArray(d.openings)) setOpenings(d.openings);
          setIsland(d.island ?? null);
          setStyleId(d.styleId ?? null);
          if (d.tier) setTier(d.tier);
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
          if (Array.isArray(d.placed) && d.placed.length > 0) {
            toast.success("Restored your in-progress design.");
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
  }, [room, placed, openings, island, styleId, tier, crown, toeKick, batten, lightRail, countertop, countertopMaterialId, sinks, roomType, activeWall, layoutLocked, lockedWalls, writeDraft]);

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
            <span className="lg:hidden">Designer</span>
            <span className="hidden lg:inline">Kitchen Designer</span>
          </h1>
          <Badge variant="secondary" className="text-xs">{placed.length} items</Badge>
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Room size editor + mouse-draw mode. Disabled while the layout is locked. */}
        <div className={layoutLocked ? "pointer-events-none opacity-50" : ""} title={layoutLocked ? "Unlock the layout to edit the room" : undefined}>
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
          <span className="text-[11px] font-medium text-muted-foreground">Wall:</span>
          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/30">
            {(["top", "left", "right", "bottom"] as WallSide[]).map((w) => {
              const wLocked = layoutLocked || lockedWalls.has(w);
              return (
                <div key={w} className="flex items-center">
                  <button
                    onClick={() => { setActiveWall(w); setDrawMode(false); }}
                    title={`Highlight the ${WALL_LABELS[w]} wall — new items land here; drag it on the canvas to resize`}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeWall === w ? "bg-[#d4a75a] text-[#1a2744]" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {WALL_LABELS[w]}
                  </button>
                  <button
                    onClick={() => {
                      if (layoutLocked) { toast.info("Whole layout is locked. Turn off Lock Layout to lock walls individually."); return; }
                      setLockedWalls((prev) => {
                        const next = new Set(prev);
                        if (next.has(w)) next.delete(w); else next.add(w);
                        return next;
                      });
                    }}
                    title={wLocked ? `${WALL_LABELS[w]} wall is locked — click to unlock` : `Lock the ${WALL_LABELS[w]} wall so it can't be resized`}
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
              toast.success(!layoutLocked ? "Layout locked — walls & room are frozen. Cabinets can still be placed." : "Layout unlocked.");
            }}
            title={layoutLocked ? "Unlock the floor plan and walls" : "Lock the floor plan and walls so they can't be moved while you place cabinets"}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layoutLocked ? "border-[#d4a75a] bg-[#d4a75a] text-[#1a2744]" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {layoutLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            {layoutLocked ? "Locked" : "Lock Layout"}
          </button>
          <button
            onClick={autoFillActiveWall}
            disabled={layoutLocked}
            title={`Auto-fill the highlighted ${WALL_LABELS[activeWall]} wall with a suggested run of cabinets`}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4a75a]/60 bg-[#d4a75a]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1a2744] transition-colors hover:bg-[#d4a75a]/20 disabled:opacity-40"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Auto-Fill Wall
          </button>
          <button
            type="button"
            onClick={() => setConsultOpen((o) => !o)}
            title="Ask the AI design consultant to lay out a wall from your description"
            className="flex items-center gap-1.5 rounded-lg border border-[#1a2744]/30 bg-[#1a2744]/5 px-2.5 py-1.5 text-xs font-semibold text-[#1a2744] transition-colors hover:bg-[#1a2744]/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Design Consultant
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
            <LayoutGrid className="h-3.5 w-3.5" /> Bird's-Eye
          </button>
          <button
            onClick={() => setViewMode("elevation")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === "elevation" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="h-3.5 w-3.5" /> Front View
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === "split" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" /> Split
          </button>
        </div>

        {/* Mobile: compact "More" menu with the toggles that live in the desktop toolbar */}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <MoreHorizontal className="h-4 w-4" /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Active wall</DropdownMenuLabel>
              <div className="grid grid-cols-4 gap-1 px-2 pb-1.5">
                {(["top", "left", "right", "bottom"] as WallSide[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => { setActiveWall(w); setDrawMode(false); }}
                    className={`rounded-md py-1 text-[11px] font-medium transition-colors ${
                      activeWall === w ? "bg-[#d4a75a] text-[#1a2744]" : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {WALL_LABELS[w]}
                  </button>
                ))}
              </div>
              <DropdownMenuItem disabled={layoutLocked} onClick={autoFillActiveWall}>Auto-fill active wall</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={layoutLocked} onCheckedChange={() => { setLayoutLocked((v) => !v); setDrawMode(false); }}>Lock layout</DropdownMenuCheckboxItem>
              <DropdownMenuItem onClick={() => setConsultOpen((o) => !o)}>Design consultant…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tools</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={measureMode} onCheckedChange={() => { setMeasureMode((m) => !m); setSelectedUid(null); }}>Measure</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={!!island} onCheckedChange={() => setIsland((cur) => cur ? null : { width: Math.min(48, room.width - 24), depth: Math.min(24, room.depth - 24), x: Math.max(0, room.width / 2 - 24), y: Math.max(0, room.depth / 2 - 12) })}>Island zone</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Trim (Front View)</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={crown} onCheckedChange={() => setCrown((c) => !c)}>Crown molding</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={toeKick} onCheckedChange={() => setToeKick((t) => !t)}>Toe kick</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={batten} onCheckedChange={() => setBatten((b) => !b)}>Batten molding</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={lightRail} onCheckedChange={() => setLightRail((l) => !l)}>Light rail</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={countertop} disabled={!countertop && !hasBaseRun} onCheckedChange={toggleCountertop}>Countertop</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={layoutLocked} onClick={addManualFiller}>Add filler…</DropdownMenuItem>
              <DropdownMenuItem disabled={!selectedUid || measureMode} onClick={swingSelected}>Swing door</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (placed.length > 0 && !window.confirm("Start a new design? This clears the current canvas.")) return;
                  setPlaced([]);
                  setOpenings([]);
                  setIsland(null);
                  setSelectedUid(null);
                  setSelectedOpeningUid(null);
                  setCrown(false); setToeKick(false); setBatten(false); setLightRail(false); setCountertop(false);
                  clearDraft();
                  toast.success("Started a new design.");
                }}
              >
                Start new design
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
            <Ruler className="h-3.5 w-3.5" /> Measure
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
            <Square className="h-3.5 w-3.5" /> Island
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCrown((c) => !c)}
            title="Crown molding (shown in Front View)"
            className={`h-8 gap-1.5 ${crown ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <PanelTop className="h-3.5 w-3.5" /> Crown
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setToeKick((t) => !t)}
            title="Toe kick (shown in Front View)"
            className={`h-8 gap-1.5 ${toeKick ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <Columns3 className="h-3.5 w-3.5" /> Toe Kick
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBatten((b) => !b)}
            title="Batten molding (BAM): covers seams between cabinets; shown in Front View"
            className={`h-8 gap-1.5 ${batten ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <Columns3 className="h-3.5 w-3.5" /> Batten
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLightRail((l) => !l)}
            title="Light rail molding: valance under wall cabinets; shown in Front View"
            className={`h-8 gap-1.5 ${lightRail ? "bg-[#1a2744] text-white border-[#1a2744] hover:bg-[#243456]" : ""}`}
          >
            <PanelTop className="h-3.5 w-3.5" /> Light Rail
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={addManualFiller}
            disabled={layoutLocked}
            title="Add a filler/scribe strip (typical 3″) and drag it into a gap"
            className="h-8 gap-1.5"
          >
            <Columns3 className="h-3.5 w-3.5" /> Filler
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleCountertop}
            disabled={!countertop && !hasBaseRun}
            title={!countertop && !hasBaseRun ? "Place base cabinets first, then add the countertop" : "Countertop (measured for a quote request)"}
            className={`h-8 gap-1.5 ${countertop ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600" : ""}`}
          >
            <Square className="h-3.5 w-3.5" /> Countertop
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={rotateSelected} className="h-8 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Rotate <span className="text-[10px] opacity-60">(R)</span>
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={swingSelected} className="h-8 gap-1.5">
            <DoorOpen className="h-3.5 w-3.5" /> Swing <span className="text-[10px] opacity-60">(S)</span>
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={deleteSelected} className="h-8 gap-1.5 text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="h-5 w-px bg-border" />
          <DesignActions
            room={room}
            placed={placed}
            styleId={styleId}
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
              <span className="text-[11px] text-muted-foreground">
                Selected <span className="font-mono font-semibold text-foreground">{selectedCab.masterCode}</span>
                <span className="ml-1 hidden sm:inline text-foreground/70">— {selectedCab.description}</span>
              </span>
              <div className="h-4 w-px bg-border" />
              <WallPicker onPick={snapSelectedToWall} />
              {selectedCab.placement === "wall" && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground mr-0.5">Mount</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Raise 1 inch"
                      onClick={() => adjustMountHeight(1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] font-mono tabular-nums text-foreground min-w-[34px] text-center">
                      {Math.round(elevationBox(selectedCab).bottom)}″
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Lower 1 inch"
                      onClick={() => adjustMountHeight(-1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    {typeof selectedCab.mountBottom === "number" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-muted-foreground"
                        title="Reset to default mount height"
                        onClick={resetMountHeight}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    title="Drop this wall cabinet to the floor as an island/peninsula base (top at 34.5 in)"
                    onClick={() => dropToFloor(selectedCab.uid)}
                  >
                    <ChevronsDown className="h-3.5 w-3.5" />
                    Drop to floor
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
                    title="Manufacturer blind-corner pull range (inches across the corner). An administrator must enter the min and max from the manufacturer spec."
                  >
                    <span className="text-[11px] text-muted-foreground mr-0.5">Pull spec</span>
                    <Input
                      type="number"
                      value={typeof selectedCab.pullMin === "number" ? selectedCab.pullMin : ""}
                      placeholder="min"
                      className="h-7 w-14 text-[11px]"
                      onChange={(e) => setBlindPull("pullMin", e.target.value === "" ? null : Number(e.target.value))}
                    />
                    <span className="text-[11px] text-muted-foreground">–</span>
                    <Input
                      type="number"
                      value={typeof selectedCab.pullMax === "number" ? selectedCab.pullMax : ""}
                      placeholder="max"
                      className="h-7 w-14 text-[11px]"
                      onChange={(e) => setBlindPull("pullMax", e.target.value === "" ? null : Number(e.target.value))}
                    />
                    <span className="text-[11px] text-muted-foreground">in</span>
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
                        : rt.value === "bathroom" || rt.value === "laundry"
                        ? "appliance"
                        : "base",
                    );
                  }}
                  className={`py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
                    roomType === rt.value ? "bg-[#a87f33] text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>
            {paletteType === "closetparts" && (
              <p className="mb-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-700">
                Closet parts are placeholder products &amp; prices — your real closet catalog will replace these. You can also add real cabinets and a door from the other tabs.
              </p>
            )}
            {/* Catalog tabs. Closet mode leads with the Closet parts tab but
                still exposes cabinets + the Door/Win tool so a closet can hold
                cabinets and an entry door. Kitchen mode keeps its tab set. */}
            <div className="flex lg:flex-wrap overflow-x-auto no-scrollbar rounded-lg border border-border p-0.5 bg-muted/30 mb-2">
              {(roomType === "closet"
                ? (["closetparts", "base", "wall", "tall", "opening"] as const)
                : roomType === "bathroom" || roomType === "laundry"
                ? (["appliance", "base", "cornerbase", "wall", "wallht", "tall", "opening"] as const)
                : (["base", "cornerbase", "wall", "wallht", "cornerwall", "tall", "appliance", "opening"] as const)
              ).map((t) => (
                <button
                  key={t}
                  onClick={() => setPaletteType(t)}
                  className={`shrink-0 whitespace-nowrap px-2.5 lg:px-1 lg:flex-1 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
                    paletteType === t ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "appliance"
                    ? (roomType === "bathroom" || roomType === "laundry" ? "Fixtures" : "Appli.")
                    : t === "opening"
                    ? "Door/Win"
                    : t === "wallht"
                    ? "Wall by Ht"
                    : t === "cornerwall"
                    ? "Corner Wall"
                    : t === "cornerbase"
                    ? "Corner Base"
                    : t === "closetparts"
                    ? "Closet"
                    : t}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={roomType === "closet" ? "Search closet parts..." : "Search cabinets..."}
                className="pl-8 h-8 text-xs"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
              />
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
                  <div className={`h-9 w-9 rounded border flex items-center justify-center shrink-0 ${o.kind === "door" ? "bg-[#9b6a3c]/30 border-[#9b6a3c]/50" : "bg-[#7fb4d6]/30 border-[#7fb4d6]/60"}`}>
                    {o.kind === "door" ? <PanelTop className="h-4 w-4 text-[#8a5f33]" /> : <Square className="h-4 w-4 text-[#3f7da6]" />}
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
              groupedPalette.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  <div className="sticky top-0 z-10 -mx-1 px-2 py-1 bg-background/95 backdrop-blur text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                    {group.label}
                    <span className="ml-1 font-normal normal-case">({group.items.length})</span>
                  </div>
                  {group.items.map((c) => (
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
                        <div className="text-[10px] text-muted-foreground">{dim(c.width, 24)}"W × {dim(c.height, 0) > 0 ? `${dim(c.height, 0)}"H` : "—"}</div>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                    </button>
                  ))}
                </div>
              ))
            )}
            {paletteType !== "opening" && !paletteLoading && filteredPalette.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                {paletteSearch
                  ? "No cabinets match your search."
                  : styleId
                  ? "No cabinets available for this door style."
                  : "No cabinets available in this category."}
              </p>
            )}
            {paletteType === "opening" && (
              <p className="text-[10px] text-muted-foreground text-center pt-3 px-2">Click to add, then drag along any wall and use the handle to resize the width.</p>
            )}
          </div>
          <div className="p-2 border-t border-border text-[10px] text-muted-foreground text-center">
            Click or drag to add · drag on canvas to snap
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
              onDrawRoom={(r) => { applyRoom(r); setDrawMode(false); toast.success(`Room set to ${Math.round(r.width/12)}′ × ${Math.round(r.depth/12)}′`); }}
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
                  onDrawRoom={(r) => { applyRoom(r); setDrawMode(false); toast.success(`Room set to ${Math.round(r.width/12)}′ × ${Math.round(r.depth/12)}′`); }}
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
                />
              </div>
            </div>
          )}

          {/* Wall layer toggle (plan only) */}
          {viewMode !== "elevation" && (
            <button
              onClick={() => setShowWallLayer((s) => !s)}
              className="absolute top-3 right-3 z-30 flex items-center gap-1.5 bg-white/90 border border-border rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-white"
            >
              <PanelTop className="h-3.5 w-3.5" />
              {showWallLayer ? "Hide" : "Show"} wall cabinets
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
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing</div>

            <Select value={styleId ? String(styleId) : ""} onValueChange={(v) => setStyleId(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select door style" /></SelectTrigger>
              <SelectContent>
                {uniqueDoorStyles.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.ourName}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={tier} onValueChange={(v) => setTier(v as PricingTier)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Wholesale">Wholesale</SelectItem>
                <SelectItem value="Contractor">Contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* BOM list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {placed.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Add cabinets to build your bill of materials
              </div>
            ) : (
              panelGroups.map((g) => {
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
              })
            )}
            {fillers.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {fillers.map((f) => (
                  <div key={f.kind} className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-amber-50 dark:bg-amber-950/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">{f.kind === "wall" ? "WALL" : "BASE"} CORNER FILLER</div>
                      <div className="text-[10px] text-muted-foreground">{f.count} × {f.width}″ · req. for blind corner</div>
                    </div>
                    <span className="font-semibold shrink-0 text-amber-700 dark:text-amber-400">incl.</span>
                  </div>
                ))}
              </div>
            )}
            {(crown || toeKick || batten || countertop) && placed.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {crown && crownOrder && crownOrder.pieces > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">CROWN MOLDING</div>
                      <div className="text-[10px] text-muted-foreground">
                        {crownOrder.pieces} pc{crownOrder.pieces > 1 ? "s" : ""} @ {crownOrder.stickFeet}&apos; · {crownOrder.measuredFeet} ft run (incl. 3&quot; miter/wall)
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">incl.</span>
                  </div>
                )}
                {toeKick && toeKickOrder && toeKickOrder.pieces > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">TOE KICK</div>
                      <div className="text-[10px] text-muted-foreground">
                        {toeKickOrder.pieces} pc{toeKickOrder.pieces > 1 ? "s" : ""} @ {toeKickOrder.stickFeet}&apos; · {toeKickOrder.measuredFeet} ft run
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">incl.</span>
                  </div>
                )}
                {batten && battenOrder && battenOrder.pieces > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">BATTEN MOLDING (BAM)</div>
                      <div className="text-[10px] text-muted-foreground">
                        {battenOrder.pieces} pc{battenOrder.pieces > 1 ? "s" : ""} @ {battenOrder.stickFeet}&apos; · {battenOrder.measuredFeet} ft run · 3/4&quot; × 3/16&quot;
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">incl.</span>
                  </div>
                )}
                {countertop && counter && counter.squareFeet > 0 && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-amber-500/10 border border-amber-500/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">COUNTERTOP</div>
                      <div className="text-[10px] text-muted-foreground">
                        ~{counter.squareFeet} sq ft · {counter.linearFeet} linear ft{counter.hasIsland ? " (incl. island)" : ""}
                      </div>
                    </div>
                    <span className="font-semibold shrink-0 text-amber-600">Quote</span>
                  </div>
                )}
              </div>
            )}

            {/* Added add-on accessories (touch-up kit, roll-out trays) */}
            {addedAddOns.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {addedAddOns.map((a) => {
                  const unit = priceMap.get(a.cabinetId);
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
                        toast.success(`Added ${row!.masterCode} to your build sheet.`);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add {row!.masterCode}
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
                <Plus className="h-4 w-4" /> Add {RANGE_CLEARANCE_FILLER_IN}" clearance filler next to range/oven
              </Button>
            )}
            {!styleId && placed.length > 0 && (
              <p className="text-[10px] text-amber-600 mb-2">Select a door style to see pricing.</p>
            )}
            {styleId && activeStyleName && (
              <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
                <span
                  className="inline-block h-3.5 w-3.5 rounded-sm border"
                  style={{ background: activeFinish.face, borderColor: activeFinish.edge }}
                />
                Finish applied to design: <span className="font-medium text-foreground">{activeStyleName}</span>
              </div>
            )}
            {hickorySkins.length > 0 && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <span>
                  <strong>Hickory exposed ends:</strong> {hickorySkins.length} finished-end skin{hickorySkins.length > 1 ? "s" : ""} auto-added to your build sheet to cover the unfinished side{hickorySkins.length > 1 ? "s" : ""} of your Hickory cabinets. Skin pricing is confirmed by our team (SKU pending), so it is not included in the estimate yet.
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Estimated Total</span>
              <span className="font-serif text-2xl font-bold text-foreground">${total.toFixed(2)}</span>
            </div>
            <Button
              className="w-full bg-[#1a2744] text-white hover:bg-[#1a2744]/90 gap-2"
              disabled={placed.length === 0}
              onClick={() => {
                if (hasConflicts && !window.confirm(
                  `This design has ${conflictUids.size} conflict${conflictUids.size > 1 ? "s" : ""} (an appliance running into a cabinet). Export the build sheet anyway?`
                )) return;
                exportBuildSheet({ room, styleName: activeStyleName, tier, total, buildRows, extraLines });
              }}
            >
              <Download className="h-4 w-4" /> Export Build Sheet (CSV)
            </Button>
            {countertop && counter && counter.squareFeet > 0 && (
              <Button
                variant="outline"
                className="w-full mt-2 gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
                onClick={() => setQuoteOpen(true)}
              >
                <Square className="h-4 w-4" /> Request Countertop Quote
              </Button>
            )}

            {countertop && (
              <div className="mt-4 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Countertop material</p>
                <div className="grid grid-cols-3 gap-2">
                  {COUNTERTOP_MATERIALS.map((m) => {
                    const active = m.id === countertopMaterialId;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setCountertopMaterialId(m.id)}
                        title={m.name}
                        className={`flex flex-col items-center gap-1 rounded-md border p-1.5 transition ${active ? "border-[#1a2744] ring-1 ring-[#1a2744]" : "border-border hover:border-muted-foreground"}`}
                      >
                        <span
                          className="h-7 w-full rounded"
                          style={{
                            background: m.fill,
                            border: `1px solid ${m.edge}`,
                            backgroundImage: m.speckle ? `radial-gradient(${m.speckle} 0.5px, transparent 0.6px)` : undefined,
                            backgroundSize: m.speckle ? "6px 6px" : undefined,
                          }}
                        />
                        <span className="text-[9px] leading-tight text-center text-muted-foreground">{m.name}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs font-semibold text-foreground mt-3 mb-2">Add sink &amp; faucet</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SINK_PRESETS) as SinkType[]).map((t) => (
                    <Button key={t} variant="outline" size="sm" className="h-8 text-[11px] justify-start gap-1.5" onClick={() => addSink(t)}>
                      <Plus className="h-3 w-3" /> {SINK_PRESETS[t].name}
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
                          Faucet
                        </label>
                        <button className="text-destructive" title="Remove" onClick={() => deleteSink(s.uid)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2">Tip: drag a sink on the plan to position it. Sinks &amp; faucets are shown for layout only and are quoted separately.</p>
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
          roomData={room}
          placedCabinets={placed}
        />
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
                  <h2 className="font-serif text-sm font-bold text-foreground leading-tight">Design Consultant</h2>
                  <p className="text-[10px] text-muted-foreground">
                    {roomType === "closet" ? "Closet" : "Kitchen"} · walls: {consultWalls.map((w) => `${w.label} ${Math.round(w.lengthInches)}"`).join(" · ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConsultOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close design consultant"
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
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0 gap-0 flex flex-col">
          <SheetHeader className="px-3 py-2 border-b border-border text-left">
            <SheetTitle className="text-sm">Catalog</SheetTitle>
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
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[82vh] p-0 gap-0 flex flex-col rounded-t-2xl">
          <SheetHeader className="px-3 py-2 border-b border-border text-left">
            <SheetTitle className="text-sm">Estimate & Build Sheet</SheetTitle>
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
