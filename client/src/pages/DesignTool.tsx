import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import {
  LayoutGrid, Eye, Trash2, RotateCw, Search, Plus,
  DollarSign, PanelTop, Columns3, Ruler, Square, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  PlacedCabinet, RoomData, DEFAULT_ROOM, DesignCabinet,
  dim, footprintDepth, makeUid, STD, rotatedSize, nextFreeSpot, standardHeight, dimLabel, placedHeight,
  conflictingUids, isOnIsland,
  APPLIANCES, applianceAsDesignCabinet,
  WallOpening, WallSide, OPENINGS, OpeningDef, makeOpening,
  finishColors, crownLinearInches, toeKickLinearInches, inchesToLinearFeet,
  trimPiecesNeeded, countertopArea,
  blindCornerFillers, snapToWall, snapPosition,
  nextFreeSpotOnWall, clampCabinetsToRoom, clampOpeningsToRoom, clampIslandToRoom,
  resizeRoomByWall, WALL_LABELS, doorPanelKind,
  addOnRecommendations,
} from "@/lib/design";
import { PlanCanvas } from "@/components/design/PlanCanvas";
import { ElevationView } from "@/components/design/ElevationView";
import { EmailGate } from "@/components/design/EmailGate";
import { DesignActions, exportBuildSheet, type BuildSheetRow } from "@/components/design/DesignActions";
import { RoomSizeControl } from "@/components/design/RoomSizeControl";
import { WallPicker } from "@/components/design/WallPicker";
import { DesignHelp } from "@/components/design/DesignHelp";
import { CountertopQuoteDialog } from "@/components/design/CountertopQuoteDialog";
import { CabinetDrawing } from "@/components/CabinetDrawing";

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
  const { data: packageLayout, isError: packageError } = trpc.packages.layout.useQuery(
    { slug: packageSlug ?? "" },
    { enabled: !!packageSlug && verified, retry: 1 }
  );
  const packageErrorRef = useRef(false);

  // Room + placement state
  const [room, setRoom] = useState<RoomData>(DEFAULT_ROOM);
  const [placed, setPlaced] = useState<PlacedCabinet[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
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
  // Countertop tool: measures base + island runs; not auto-priced (quote request).
  const [countertop, setCountertop] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Mouse-draw room mode: drag on an empty canvas to draw the room outline.
  const [drawMode, setDrawMode] = useState(false);
  // Active wall: the wall the user has highlighted. New items drop onto it, and
  // it can be dragged on the canvas to resize the room on that side.
  const [activeWall, setActiveWall] = useState<WallSide>("top");
  // Add-on accessories added from the "don't forget this" recommendations
  // (touch-up kit, roll-out trays). These are non-spatial BOM line items keyed
  // by cabinetId, so they price + export without cluttering the floor plan.
  const [addedAddOns, setAddedAddOns] = useState<
    { cabinetId: number; masterCode: string; description: string; qty: number }[]
  >([]);

  // Palette filters
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteType, setPaletteType] = useState<"base" | "wall" | "tall" | "appliance" | "opening">("base");

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
        placement: paletteType === "appliance" || paletteType === "opening" ? "base" : paletteType,
        // Narrow to the chosen line + style so only purchasable cabinets show.
        styleId: styleId ?? undefined,
      },
      { enabled: paletteType !== "appliance" && paletteType !== "opening" }
    );
  const paletteLoading = paletteType === "appliance" || paletteType === "opening" ? false : paletteLoadingRaw;

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

  // Appliances are a synthetic, client-side catalog (no DB rows).
  const appliancePalette = useMemo<DesignCabinet[]>(
    () => APPLIANCES.map(applianceAsDesignCabinet),
    []
  );

  // Filtered palette
  const filteredPalette = useMemo(() => {
    const source: DesignCabinet[] =
      paletteType === "appliance" ? appliancePalette : ((paletteCabinets as DesignCabinet[]) ?? []);
    const s = paletteSearch.toLowerCase();
    return source
      .filter((c) => !s || c.masterCode.toLowerCase().includes(s) || c.description.toLowerCase().includes(s))
      .slice(0, 80);
  }, [paletteCabinets, paletteSearch, paletteType, appliancePalette]);

  // Group the palette by cabinet height so wall cabinets (and others) are easy
  // to find by size — mirrors how pros scan 2020's catalog by height.
  const groupedPalette = useMemo(() => {
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
      .map(([height, items]) => ({ height, items }));
  }, [filteredPalette]);

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

  const total = useMemo(
    () =>
      placed.reduce((sum, p) => sum + (priceMap.get(p.cabinetId) ?? 0), 0) +
      addedAddOns.reduce(
        (sum, a) => sum + (priceMap.get(a.cabinetId) ?? 0) * a.qty,
        0
      ),
    [placed, addedAddOns, priceMap]
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

  // Restore a saved design (room + placed cabinets + style) onto the canvas.
  const loadSavedDesign = useCallback(
    (d: { room: RoomData; placed: PlacedCabinet[]; styleId: number | null }) => {
      setRoom(d.room ?? DEFAULT_ROOM);
      setPlaced(Array.isArray(d.placed) ? d.placed : []);
      setStyleId(d.styleId ?? null);
      setSelectedUid(null);
    },
    []
  );

  // Itemized lines for the exported build sheet (cabinets aggregated by code).
  const buildRows = useMemo<BuildSheetRow[]>(() => {
    const map = new Map<string, BuildSheetRow>();
    for (const p of placed) {
      const key = `${p.masterCode}|${Math.round(p.width)}`;
      const unit = priceMap.get(p.cabinetId) ?? null;
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
          qty: 1,
          unitPrice: styleId ? unit : null,
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
    return rows;
  }, [placed, addedAddOns, priceMap, styleId]);
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
  const conflictUids = useMemo(() => conflictingUids(placed), [placed]);
  const hasConflicts = conflictUids.size > 0;

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
    if (countertop && counter && counter.squareFeet > 0)
      out.push({ label: "COUNTERTOP (quote)", detail: `~${counter.squareFeet} sq ft / ${counter.linearFeet} lin ft` });
    return out;
  }, [fillers, crown, crownOrder, toeKick, toeKickOrder, countertop, counter]);

  // ─── Placement actions ──────────────────────────────────────────────────────

  const addCabinet = useCallback(
    (c: DesignCabinet, x?: number, y?: number) => {
      const width = dim(c.width, 24);
      const depth = footprintDepth(c);
      const height = dim(c.height, standardHeight(c.placement));
      setPlaced((prev) => {
        // Explicit drop position (drag-and-drop) wins; otherwise place flush
        // against the highlighted active wall, marching along it.
        let spot: { x: number; y: number; rotation: number };
        if (x != null && y != null) {
          spot = { x, y, rotation: 0 };
        } else {
          spot = nextFreeSpotOnWall(width, depth, c.placement, activeWall, room, prev);
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
        };
        setSelectedUid(newCab.uid);
        return [...prev, newCab];
      });
    },
    [room, activeWall]
  );

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
      } else if (e.key === "Escape") {
        setSelectedUid(null);
        setSelectedOpeningUid(null);
        setMeasureMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUid, deleteCabinet, selectedOpeningUid, deleteOpening, measureMode, rotateSelected]);

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
    }));
    setPlaced(items);
    setSelectedUid(null);
    toast.success(`Loaded "${packageLayout.name}" — edit, swap styles, and re-price.`);
  }, [packageLayout]);

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

  const selectedCab = placed.find((p) => p.uid === selectedUid);

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
          <h1 className="font-serif text-lg font-bold text-foreground">Kitchen Designer</h1>
          <Badge variant="secondary" className="text-xs">{placed.length} items</Badge>
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Room size editor + mouse-draw mode */}
        <RoomSizeControl
          room={room}
          onChange={applyRoom}
          drawMode={drawMode}
          onToggleDraw={() => {
            setDrawMode((d) => !d);
            setSelectedUid(null);
            setMeasureMode(false);
          }}
        />

        <div className="h-5 w-px bg-border" />

        {/* Active wall selector: highlights a wall; new items drop on it and it
            can be dragged on the canvas to resize the room on that side. */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Wall:</span>
          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/30">
            {(["top", "left", "right", "bottom"] as WallSide[]).map((w) => (
              <button
                key={w}
                onClick={() => { setActiveWall(w); setDrawMode(false); }}
                title={`Highlight the ${WALL_LABELS[w]} wall — new items land here; drag it on the canvas to resize`}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeWall === w ? "bg-[#d4a75a] text-[#1a2744]" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {WALL_LABELS[w]}
              </button>
            ))}
          </div>
        </div>

        <div className="h-5 w-px bg-border" />

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

        <div className="ml-auto flex items-center gap-2">
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
            onClick={() => setCountertop((c) => !c)}
            title="Countertop (measured for a quote request)"
            className={`h-8 gap-1.5 ${countertop ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600" : ""}`}
          >
            <Square className="h-3.5 w-3.5" /> Countertop
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={rotateSelected} className="h-8 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Rotate <span className="text-[10px] opacity-60">(R)</span>
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
            onLoad={loadSavedDesign}
          />
          <div className="h-5 w-px bg-border" />
          <DesignHelp />
        </div>
      </div>

      {/* Contextual row: wall picker for the selected cabinet, or draw-mode hint */}
      {(selectedCab || drawMode) && !measureMode && (
        <div className="border-b border-border bg-[#f7f5f0] px-4 py-1.5 flex items-center gap-3 flex-wrap shrink-0">
          {selectedCab && !drawMode && (
            <>
              <span className="text-[11px] text-muted-foreground">
                Selected <span className="font-mono font-semibold text-foreground">{selectedCab.masterCode}</span>
              </span>
              <div className="h-4 w-px bg-border" />
              <WallPicker onPick={snapSelectedToWall} />
            </>
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
        {/* Left palette */}
        <div className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex rounded-lg border border-border p-0.5 bg-muted/30 mb-2">
              {(["base", "wall", "tall", "appliance", "opening"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPaletteType(t)}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
                    paletteType === t ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "appliance" ? "Appli." : t === "opening" ? "Door/Win" : t}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search cabinets..."
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
                <div key={group.height} className="space-y-1.5">
                  <div className="sticky top-0 z-10 -mx-1 px-2 py-1 bg-background/95 backdrop-blur text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                    {group.height > 0 ? `${group.height}" High` : "Other Heights"}
                    <span className="ml-1 font-normal normal-case">({group.items.length})</span>
                  </div>
                  {group.items.map((c) => (
                    <button
                      key={c.id}
                      draggable
                      onDragStart={() => { dragDataRef.current = c; }}
                      onClick={() => addCabinet(c)}
                      className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                    >
                      <div className="h-9 w-9 rounded bg-white border border-[#a07d4a]/40 flex items-center justify-center shrink-0 p-0.5">
                        <CabinetDrawing cabinet={c} className="h-full w-auto max-w-full" />
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
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 relative">
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
            />
          )}
          {viewMode === "elevation" && (
            <ElevationView
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              wall={activeWall}
              openings={openings}
              finish={activeFinish}
              crown={crown}
              toeKick={toeKick}
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
                />
              </div>
              <div className="flex-1 min-h-0">
                <ElevationView
                  room={room}
                  cabinets={placed}
                  selectedUid={selectedUid}
                  onSelect={setSelectedUid}
                  wall={activeWall}
                  openings={openings}
                  finish={activeFinish}
                  crown={crown}
                  toeKick={toeKick}
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

        {/* Right: pricing + BOM */}
        <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col">
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
              placed.map((p) => {
                const price = priceMap.get(p.cabinetId);
                return (
                  <button
                    key={p.uid}
                    onClick={() => setSelectedUid(p.uid)}
                    className={`w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg text-xs transition-colors ${
                      selectedUid === p.uid ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate flex items-center gap-1.5">
                        {p.masterCode}
                        {conflictUids.has(p.uid) && (
                          <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                            Conflict
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{dimLabel(p)} · {p.placement}</div>
                    </div>
                    <span className="font-semibold shrink-0">
                      {styleId ? (price != null ? `$${price.toFixed(2)}` : "N/A") : "—"}
                    </span>
                  </button>
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
            {(crown || toeKick || countertop) && placed.length > 0 && (
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
              <div className="px-3 pb-2 space-y-2">
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
                        : "Add roll-out trays?"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      {rec.kind === "touch-up-kit"
                        ? "Match your finish for nicks & scratches — we recommend one on every order."
                        : "Pull-out shelves make your base cabinets easier to reach."}
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
                  An appliance is running into a cabinet. Move them apart before ordering.
                </span>
              </div>
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
          </div>
        </div>
      </div>

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
    </div>
  );
}
