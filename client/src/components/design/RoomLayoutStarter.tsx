import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LayoutPanelTop, Loader2, Ruler, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import type { RoomData } from "@/lib/design";

export type SeededRoomShape = {
  id: string;
  name: string;
  description: string | null;
  roomType: string;
  geometryTemplate: unknown;
  defaultDimensions: unknown;
};

export type SeededLayout = {
  id: string;
  roomShapePresetId: string;
  name: string;
  description: string | null;
  minimumWidth: unknown;
  minimumDepth: unknown;
};

type NormalizedVertex = { x: number; y: number };

interface RoomLayoutStarterProps {
  selectedStyleId?: number | null;
  selectedDistributorId?: number | null;
  onApplyRoom: (room: RoomData) => void;
  onLayoutSelected?: (layoutPresetId: string) => void;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function roomFromSeededShape(shape: SeededRoomShape): RoomData {
  const dimensions = record(shape.defaultDimensions);
  const width = numeric(dimensions.width, 144);
  const depth = numeric(dimensions.depth, 120);
  const ceilingHeight = numeric(dimensions.ceilingHeight, 96);
  const geometry = record(shape.geometryTemplate);
  const rawVertices = Array.isArray(geometry.vertices) ? geometry.vertices : [];
  const rawWalls = Array.isArray(geometry.walls) ? geometry.walls : [];

  // Keep seeded rectangles in the existing simple-room format. Polygon data is
  // only used where the chosen room shape truly has more than four vertices.
  if (shape.id === "rectangle" || rawVertices.length <= 4) return { width, depth, ceilingHeight };

  const stamp = `${shape.id}-${Date.now().toString(36)}`;
  const vertices = rawVertices.map((vertex, index) => {
    const point = record(vertex);
    return {
      id: `${stamp}-v${index}`,
      x: Math.max(0, Math.min(width, numeric(point.x, 0) * width)),
      y: Math.max(0, Math.min(depth, numeric(point.y, 0) * depth)),
    };
  });
  const customWalls = vertices.map((vertex, index) => ({
    id: `${stamp}-w${index}`,
    startVertexId: vertex.id,
    endVertexId: vertices[(index + 1) % vertices.length].id,
    label: typeof rawWalls[index] === "string" ? rawWalls[index] : `Wall ${index + 1}`,
  }));

  return { width, depth, ceilingHeight, vertices, customWalls };
}

export function RoomLayoutStarter({
  selectedStyleId,
  selectedDistributorId,
  onApplyRoom,
  onLayoutSelected,
}: RoomLayoutStarterProps) {
  const { data, isLoading, error } = trpc.roomLayouts.presets.useQuery({ roomType: "kitchen" });
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [layoutId, setLayoutId] = useState<string | null>(null);

  const roomShapes = (data?.roomShapes ?? []) as SeededRoomShape[];
  const layouts = (data?.layouts ?? []) as SeededLayout[];
  const selectedShape = roomShapes.find((shape) => shape.id === shapeId) ?? null;
  const availableLayouts = useMemo(
    () => layouts.filter((layout) => layout.roomShapePresetId === shapeId),
    [layouts, shapeId],
  );
  const selectedLayout = availableLayouts.find((layout) => layout.id === layoutId) ?? null;

  useEffect(() => {
    if (!shapeId && roomShapes[0]) setShapeId(roomShapes[0].id);
  }, [roomShapes, shapeId]);
  useEffect(() => {
    if (availableLayouts.length && !availableLayouts.some((layout) => layout.id === layoutId)) {
      setLayoutId(availableLayouts[0].id);
    }
  }, [availableLayouts, layoutId]);

  const canResolveCatalog = Boolean(selectedLayout && selectedStyleId && selectedDistributorId);
  const { data: catalogData, isFetching: catalogLoading } = trpc.roomLayouts.eligibleCatalog.useQuery(
    {
      layoutPresetId: selectedLayout?.id ?? "unselected",
      distributorId: selectedDistributorId ?? 0,
      styleId: selectedStyleId ?? 0,
    },
    { enabled: canResolveCatalog },
  );

  if (isLoading) {
    return <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-4 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading room layouts…</div>;
  }
  if (error || !roomShapes.length) {
    return <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Room layouts are not available yet. Confirm that the room-layout migration and seed have completed.</div>;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Fast start</span></div>
        <CardTitle className="font-serif text-lg">Start with a room layout</CardTitle>
        <p className="text-sm text-muted-foreground">Choose the room shape first, then use real catalog availability to preview compatible cabinet zones.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4 text-primary" /> 1. Pick a room shape</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {roomShapes.map((shape) => {
              const active = shape.id === shapeId;
              return (
                <button key={shape.id} type="button" onClick={() => setShapeId(shape.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-background hover:border-primary/50"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{shape.name}</span>{active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}</div>
                  {shape.description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{shape.description}</p> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><LayoutPanelTop className="h-4 w-4 text-primary" /> 2. Pick a starter layout</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableLayouts.map((layout) => {
              const active = layout.id === layoutId;
              return (
                <button key={layout.id} type="button" onClick={() => setLayoutId(layout.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-background hover:border-primary/50"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{layout.name}</span>{active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}</div>
                  {layout.description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{layout.description}</p> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-background/80 p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Catalog check</span>{catalogLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}</div>
          {!canResolveCatalog ? <p className="mt-1 text-xs text-muted-foreground">Choose a door style first to view real orderable SKU options for this layout.</p> : null}
          {canResolveCatalog && catalogData ? (
            <div className="mt-2 space-y-1.5">
              {catalogData.zones.map((zone) => {
                const candidatesByZone = catalogData.candidatesByZone as Record<string, unknown[]>;
                const candidates = candidatesByZone[zone.zoneKey] ?? [];
                return <div key={zone.zoneKey} className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">{zone.label}</span><Badge variant={candidates.length ? "secondary" : "outline"}>{candidates.length ? `${candidates.length} real SKU option${candidates.length === 1 ? "" : "s"}` : "Choose manually"}</Badge></div>;
              })}
            </div>
          ) : null}
        </section>

        <Button className="w-full" disabled={!selectedShape || !selectedLayout} onClick={() => {
          if (!selectedShape || !selectedLayout) return;
          onApplyRoom(roomFromSeededShape(selectedShape));
          onLayoutSelected?.(selectedLayout.id);
        }}>
          Apply room shape and continue
        </Button>
      </CardContent>
    </Card>
  );
}
