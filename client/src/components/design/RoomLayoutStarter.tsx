import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LayoutPanelTop, Loader2, Ruler, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import type { RoomData } from "@/lib/design";
import type { WallBuilderRoomGeometry } from "@/lib/polygonRoom";
import { WallBuilder } from "./WallBuilder";

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

export const GUIDED_ROOM_WORKFLOW_STEPS = [
  { step: 1, label: "Floorplan" },
  { step: 2, label: "Pick a layout" },
  { step: 3, label: "Design your kitchen" },
  { step: 4, label: "Summary" },
] as const;

export function guidedRoomWorkflowStepState(activeStep: number, step: number) {
  return { active: activeStep === step, complete: activeStep > step };
}

export function numberedLayoutTile(layouts: SeededLayout[], layoutId: string) {
  const index = layouts.findIndex((layout) => layout.id === layoutId);
  return index < 0 ? null : index + 1;
}

type NormalizedVertex = { x: number; y: number };

interface RoomLayoutStarterProps {
  selectedStyleId?: number | null;
  selectedDistributorId?: number | null;
  onApplyRoom: (room: RoomData) => void;
  onLayoutSelected?: (layoutPresetId: string) => void;
  onApplyContinuousRoom?: (room: WallBuilderRoomGeometry) => void;
  continuousWallBlockedReason?: string | null;
  wallHeightIn?: number;
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
  onApplyContinuousRoom,
  continuousWallBlockedReason,
  wallHeightIn = 96,
}: RoomLayoutStarterProps) {
  const { data, isLoading, error } = trpc.roomLayouts.presets.useQuery({ roomType: "kitchen" });
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [workflowStage, setWorkflowStage] = useState<1 | 2 | 3 | 4>(1);
  const [startMode, setStartMode] = useState<"starter" | "continuous">("starter");

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
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl border bg-muted/35 p-1" aria-label="Guided kitchen design progress">
          {GUIDED_ROOM_WORKFLOW_STEPS.map(({ step, label }) => {
            const { active, complete } = guidedRoomWorkflowStepState(workflowStage, step);
            return <button key={step} type="button" onClick={() => setWorkflowStage(step)} className={`min-w-0 rounded-lg px-1.5 py-2 text-center transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : complete ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-background"}`}>
              <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold">{complete ? "✓" : step}</span>
              <span className="mt-1 block truncate text-[10px] font-semibold sm:text-xs">{label}</span>
            </button>;
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {onApplyContinuousRoom ? (
          <section className="grid gap-2 sm:grid-cols-2" aria-label="Room design mode">
            <button type="button" onClick={() => setStartMode("starter")} className={`rounded-xl border p-3 text-left transition-colors ${startMode === "starter" ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-background hover:border-primary/50"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold"><LayoutPanelTop className="h-4 w-4 text-primary" /> Easy room shapes</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Beginner-friendly room shapes and starter layouts with the standard cabinet rules.</p>
            </button>
            <button type="button" onClick={() => setStartMode("continuous")} className={`rounded-xl border p-3 text-left transition-colors ${startMode === "continuous" ? "border-[#b98d3e] bg-amber-50 ring-1 ring-[#b98d3e]/50" : "border-border bg-background hover:border-[#b98d3e]/50"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4 text-[#b98d3e]" /> Advanced continuous walls</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Enter every measured wall and exact turn. This advanced mode stays separate from room shapes.</p>
            </button>
          </section>
        ) : null}
        {startMode === "continuous" && onApplyContinuousRoom ? (
          <section className="space-y-2 rounded-xl border border-[#b98d3e]/40 bg-amber-50/40 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4 text-[#b98d3e]" /> Build walls continuously</div>
            <p className="text-xs leading-relaxed text-muted-foreground">Advanced measured-wall mode. Use the wall attributes and exact turns here; beginner room shapes remain unchanged.</p>
            <WallBuilder wallHeightIn={wallHeightIn} blockedReason={continuousWallBlockedReason} onApply={onApplyContinuousRoom} />
          </section>
        ) : (
          <>
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4 text-primary" /> 1. Pick a room shape</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {roomShapes.map((shape) => {
              const active = shape.id === shapeId;
              return (
                <button key={shape.id} type="button" onClick={() => { setShapeId(shape.id); setWorkflowStage(2); }}
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {availableLayouts.map((layout) => {
              const active = layout.id === layoutId;
              const layoutNumber = numberedLayoutTile(availableLayouts, layout.id) ?? 1;
              return (
                <button key={layout.id} type="button" onClick={() => { setLayoutId(layout.id); setWorkflowStage(3); }}
                  className={`rounded-xl border p-3 text-left transition-all ${active ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border bg-background hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"}`}>
                  <div className="flex items-start gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{layoutNumber}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-1"><span className="truncate font-semibold">{layout.name}</span>{active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : null}</div>{layout.description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{layout.description}</p> : null}</div></div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-background/80 p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Design summary</span>{catalogLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}</div>
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
          setWorkflowStage(4);
        }}>
          Apply room shape and continue
        </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
