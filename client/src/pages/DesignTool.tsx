import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import {
  LayoutGrid, Eye, Trash2, RotateCw, Search, Plus,
  Maximize2, DollarSign, Box, PanelTop, Columns3, Ruler, Square,
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
  dim, footprintDepth, makeUid, STD, rotatedSize, nextFreeSpot,
  APPLIANCES, applianceAsDesignCabinet,
  WallOpening, WallSide, OPENINGS, OpeningDef, makeOpening,
  finishColors, crownLinearInches, toeKickLinearInches, inchesToLinearFeet,
  blindCornerFillers, snapToWall,
  nextFreeSpotOnWall, clampCabinetsToRoom, clampOpeningsToRoom, clampIslandToRoom,
  resizeRoomByWall, WALL_LABELS,
} from "@/lib/design";
import { PlanCanvas } from "@/components/design/PlanCanvas";
import { ElevationView } from "@/components/design/ElevationView";
import { EmailGate } from "@/components/design/EmailGate";
import { RoomSizeControl } from "@/components/design/RoomSizeControl";
import { WallPicker } from "@/components/design/WallPicker";

type ViewMode = "plan" | "elevation" | "split";
type PricingTier = "Wholesale" | "Contractor" | "Homeowner";

function priceOf(row: { wholesalePrice: string | null; contractorPrice: string | null; homeownerPrice: string | null }, tier: PricingTier): number {
  const v = tier === "Wholesale" ? row.wholesalePrice : tier === "Contractor" ? row.contractorPrice : row.homeownerPrice;
  return v ? parseFloat(v) : 0;
}

export default function DesignTool() {
  // Email gate
  const [verified, setVerified] = useState(false);

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
  // Mouse-draw room mode: drag on an empty canvas to draw the room outline.
  const [drawMode, setDrawMode] = useState(false);
  // Active wall: the wall the user has highlighted. New items drop onto it, and
  // it can be dragged on the canvas to resize the room on that side.
  const [activeWall, setActiveWall] = useState<WallSide>("top");

  // Palette filters
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteType, setPaletteType] = useState<"base" | "wall" | "tall" | "appliance" | "opening">("base");

  // Pricing selectors
  const [distributorId, setDistributorId] = useState<number | null>(null);
  const [styleId, setStyleId] = useState<number | null>(null);
  const [tier, setTier] = useState<PricingTier>("Homeowner");

  // Data
  const { data: distributors } = trpc.distributors.list.useQuery();
  const { data: doorStyles } = trpc.doorStyles.list.useQuery(
    distributorId ? { distributorId } : undefined
  );
  const { data: paletteCabinets, isLoading: paletteLoadingRaw } =
    trpc.design.placeableCabinets.useQuery(
      { placement: paletteType === "appliance" || paletteType === "opening" ? "base" : paletteType },
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

  // Pricing for placed cabinets (appliances carry cabinetId 0 and are unpriced).
  const placedCabinetIds = useMemo(
    () => Array.from(new Set(placed.map((p) => p.cabinetId).filter((id) => id > 0))),
    [placed]
  );
  const { data: priceRows } = trpc.design.priceForCabinets.useQuery(
    {
      cabinetIds: placedCabinetIds,
      distributorId: distributorId ?? 0,
      styleId: styleId ?? 0,
    },
    { enabled: placedCabinetIds.length > 0 && !!distributorId && !!styleId }
  );

  const priceMap = useMemo(() => {
    const m = new Map<number, number>();
    priceRows?.forEach((r) => m.set(r.cabinetId, priceOf(r, tier)));
    return m;
  }, [priceRows, tier]);

  const total = useMemo(
    () => placed.reduce((sum, p) => sum + (priceMap.get(p.cabinetId) ?? 0), 0),
    [placed, priceMap]
  );

  // Active finish: derived from the selected door style name so picking a trim
  // instantly re-skins the placed cabinets on the canvas + elevation.
  const activeStyleName = useMemo(
    () => doorStyles?.find((s) => s.id === styleId)?.ourName ?? null,
    [doorStyles, styleId]
  );
  const activeFinish = useMemo(() => finishColors(activeStyleName), [activeStyleName]);

  // Crown molding & toe kick linear footage for the BOM (derived from widths).
  const crownFt = useMemo(
    () => (crown ? inchesToLinearFeet(crownLinearInches(placed)) : 0),
    [crown, placed]
  );
  const toeKickFt = useMemo(
    () => (toeKick ? inchesToLinearFeet(toeKickLinearInches(placed)) : 0),
    [toeKick, placed]
  );

  // Blind corner cabinets must auto-include a corner filler. One filler per
  // blind corner, split into base vs wall lines for the BOM.
  const fillers = useMemo(() => blindCornerFillers(placed), [placed]);

  // ─── Placement actions ──────────────────────────────────────────────────────

  const addCabinet = useCallback(
    (c: DesignCabinet, x?: number, y?: number) => {
      const width = dim(c.width, 24);
      const depth = footprintDepth(c);
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
          rotation: spot.rotation,
        };
        setSelectedUid(newCab.uid);
        return [...prev, newCab];
      });
    },
    [room, activeWall]
  );

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
      prev.map((p) => (p.uid === selectedUid ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
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
      } else if (e.key === "Escape") {
        setSelectedUid(null);
        setSelectedOpeningUid(null);
        setMeasureMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUid, deleteCabinet, selectedOpeningUid, deleteOpening]);

  const dragDataRef = useState<{ current: DesignCabinet | null }>(() => ({ current: null }))[0];

  // Preload a kitchen package layout onto the canvas (once per slug).
  useEffect(() => {
    if (!packageLayout || loadedPackageRef.current === packageLayout.slug) return;
    loadedPackageRef.current = packageLayout.slug;
    setRoom({ width: packageLayout.room.width, depth: packageLayout.room.depth });
    const items = (packageLayout.items as Array<{
      cabinetId: number; masterCode: string; description: string;
      placement: "base" | "wall" | "tall"; x: number; y: number; rotation: number;
      width: number | null; depth: number | null;
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
    return <EmailGate onVerified={() => setVerified(true)} />;
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
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={rotateSelected} className="h-8 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Rotate
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid || measureMode} onClick={deleteSelected} className="h-8 gap-1.5 text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
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
              filteredPalette.map((c) => (
                <button
                  key={c.id}
                  draggable
                  onDragStart={() => { dragDataRef.current = c; }}
                  onClick={() => addCabinet(c)}
                  className="w-full text-left p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group flex items-center gap-2"
                >
                  <div className="h-9 w-9 rounded bg-[#cdb38b]/40 border border-[#a07d4a]/40 flex items-center justify-center shrink-0">
                    <Box className="h-4 w-4 text-[#8a6d3b]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-foreground truncate">{c.masterCode}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>
                    <div className="text-[10px] text-muted-foreground">{dim(c.width, 24)}"W</div>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                </button>
              ))
            )}
            {paletteType !== "opening" && !paletteLoading && filteredPalette.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No cabinets found</p>
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
            />
          )}
          {viewMode === "elevation" && (
            <ElevationView
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              wall="front"
              openings={openings}
              finish={activeFinish}
              crown={crown}
              toeKick={toeKick}
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
                />
              </div>
              <div className="flex-1 min-h-0">
                <ElevationView
                  room={room}
                  cabinets={placed}
                  selectedUid={selectedUid}
                  onSelect={setSelectedUid}
                  wall="front"
                  openings={openings}
                  finish={activeFinish}
                  crown={crown}
                  toeKick={toeKick}
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

            <Select value={distributorId ? String(distributorId) : ""} onValueChange={(v) => { setDistributorId(Number(v)); setStyleId(null); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select distributor" /></SelectTrigger>
              <SelectContent>
                {distributors?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={styleId ? String(styleId) : ""} onValueChange={(v) => setStyleId(Number(v))} disabled={!distributorId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select door style" /></SelectTrigger>
              <SelectContent>
                {doorStyles?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.ourName}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={tier} onValueChange={(v) => setTier(v as PricingTier)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Wholesale">Wholesale</SelectItem>
                <SelectItem value="Contractor">Contractor</SelectItem>
                <SelectItem value="Homeowner">Homeowner</SelectItem>
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
                      <div className="font-mono font-semibold truncate">{p.masterCode}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{Math.round(p.width)}"W · {p.placement}</div>
                    </div>
                    <span className="font-semibold shrink-0">
                      {distributorId && styleId ? (price != null ? `$${price.toFixed(2)}` : "N/A") : "—"}
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
            {(crown || toeKick) && placed.length > 0 && (
              <div className="mt-1 pt-1 border-t border-dashed border-border space-y-1">
                {crown && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">CROWN MOLDING</div>
                      <div className="text-[10px] text-muted-foreground">{crownFt.toFixed(1)} linear ft · trim</div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">incl.</span>
                  </div>
                )}
                {toeKick && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">TOE KICK</div>
                      <div className="text-[10px] text-muted-foreground">{toeKickFt.toFixed(1)} linear ft · trim</div>
                    </div>
                    <span className="font-semibold shrink-0 text-muted-foreground">incl.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="p-3 border-t border-border">
            {(!distributorId || !styleId) && placed.length > 0 && (
              <p className="text-[10px] text-amber-600 mb-2">Select a distributor and door style to see pricing.</p>
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
              onClick={() => toast.success("Design added to cart", { description: `${placed.length} cabinets · $${total.toFixed(2)}` })}
            >
              <Maximize2 className="h-4 w-4" /> Add Design to Cart
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
