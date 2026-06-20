import { useState, useMemo, useCallback } from "react";
import {
  LayoutGrid, Eye, Trash2, RotateCw, Search, Plus,
  Maximize2, DollarSign, Box, PanelTop, Columns3,
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
} from "@/lib/design";
import { PlanCanvas } from "@/components/design/PlanCanvas";
import { ElevationView } from "@/components/design/ElevationView";
import { EmailGate } from "@/components/design/EmailGate";

type ViewMode = "plan" | "elevation" | "split";
type PricingTier = "Wholesale" | "Contractor" | "Homeowner";

const ROOM_PRESETS = [
  { label: "Small (10×8 ft)", width: 120, depth: 96 },
  { label: "Medium (12×10 ft)", width: 144, depth: 120 },
  { label: "Large (16×12 ft)", width: 192, depth: 144 },
];

function priceOf(row: { wholesalePrice: string | null; contractorPrice: string | null; homeownerPrice: string | null }, tier: PricingTier): number {
  const v = tier === "Wholesale" ? row.wholesalePrice : tier === "Contractor" ? row.contractorPrice : row.homeownerPrice;
  return v ? parseFloat(v) : 0;
}

export default function DesignTool() {
  // Email gate
  const [verified, setVerified] = useState(false);

  // Room + placement state
  const [room, setRoom] = useState<RoomData>(DEFAULT_ROOM);
  const [placed, setPlaced] = useState<PlacedCabinet[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [showWallLayer, setShowWallLayer] = useState(true);

  // Palette filters
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteType, setPaletteType] = useState<"base" | "wall" | "tall">("base");

  // Pricing selectors
  const [distributorId, setDistributorId] = useState<number | null>(null);
  const [styleId, setStyleId] = useState<number | null>(null);
  const [tier, setTier] = useState<PricingTier>("Homeowner");

  // Data
  const { data: distributors } = trpc.distributors.list.useQuery();
  const { data: doorStyles } = trpc.doorStyles.list.useQuery(
    distributorId ? { distributorId } : undefined
  );
  const { data: paletteCabinets, isLoading: paletteLoading } =
    trpc.design.placeableCabinets.useQuery({ placement: paletteType });

  // Filtered palette
  const filteredPalette = useMemo(() => {
    if (!paletteCabinets) return [];
    const s = paletteSearch.toLowerCase();
    return (paletteCabinets as DesignCabinet[])
      .filter((c) => !s || c.masterCode.toLowerCase().includes(s) || c.description.toLowerCase().includes(s))
      .slice(0, 80);
  }, [paletteCabinets, paletteSearch]);

  // Pricing for placed cabinets
  const placedCabinetIds = useMemo(
    () => Array.from(new Set(placed.map((p) => p.cabinetId))),
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

  // ─── Placement actions ──────────────────────────────────────────────────────

  const addCabinet = useCallback(
    (c: DesignCabinet, x?: number, y?: number) => {
      const width = dim(c.width, 24);
      const depth = footprintDepth(c);
      setPlaced((prev) => {
        // If no explicit drop position, auto-place against the back wall.
        const spot =
          x != null && y != null
            ? { x, y }
            : nextFreeSpot(width, depth, c.placement, room, prev);
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
          rotation: 0,
        };
        setSelectedUid(newCab.uid);
        return [...prev, newCab];
      });
    },
    [room]
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

  const dragDataRef = useState<{ current: DesignCabinet | null }>(() => ({ current: null }))[0];

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

        {/* Room preset */}
        <Select
          value={`${room.width}x${room.depth}`}
          onValueChange={(v) => {
            const preset = ROOM_PRESETS.find((p) => `${p.width}x${p.depth}` === v);
            if (preset) setRoom({ width: preset.width, depth: preset.depth });
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROOM_PRESETS.map((p) => (
              <SelectItem key={p.label} value={`${p.width}x${p.depth}`}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

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
          <Button variant="outline" size="sm" disabled={!selectedUid} onClick={rotateSelected} className="h-8 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Rotate
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedUid} onClick={deleteSelected} className="h-8 gap-1.5 text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Left palette */}
        <div className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex rounded-lg border border-border p-0.5 bg-muted/30 mb-2">
              {(["base", "wall", "tall"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPaletteType(t)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    paletteType === t ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
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
            {paletteLoading ? (
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
            {!paletteLoading && filteredPalette.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No cabinets found</p>
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
              onDropNew={handleDropNew}
              showWallLayer={showWallLayer}
            />
          )}
          {viewMode === "elevation" && (
            <ElevationView
              room={room}
              cabinets={placed}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              wall="front"
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
                  onDropNew={handleDropNew}
                  showWallLayer={showWallLayer}
                />
              </div>
              <div className="flex-1 min-h-0">
                <ElevationView
                  room={room}
                  cabinets={placed}
                  selectedUid={selectedUid}
                  onSelect={setSelectedUid}
                  wall="front"
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
          </div>

          {/* Total */}
          <div className="p-3 border-t border-border">
            {(!distributorId || !styleId) && placed.length > 0 && (
              <p className="text-[10px] text-amber-600 mb-2">Select a distributor and door style to see pricing.</p>
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
