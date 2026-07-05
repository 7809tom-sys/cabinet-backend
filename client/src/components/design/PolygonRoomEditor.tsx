/**
 * PolygonRoomEditor — An SVG-based editor for custom polygon room shapes.
 *
 * Modes:
 * 1. View mode: shows the polygon with clickable wall segments and draggable vertices.
 * 2. Split mode: user taps a wall segment to split it at the midpoint.
 *
 * The editor renders inside the PlanCanvas container as an overlay when the room
 * has polygon data (vertices + customWalls).
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Scissors, Undo2, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  type RoomVertex,
  type CustomWall,
  splitWall,
  moveVertex,
  normalizeVertices,
  polygonBounds,
  wallSegmentLength,
  wallMidpoint,
  mergeWalls,
  verticesToPoints,
} from "@/lib/polygonRoom";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  vertices: RoomVertex[];
  customWalls: CustomWall[];
  ppi: number;
  /** Called when the polygon changes (vertex drag, split, merge). */
  onChange: (vertices: RoomVertex[], customWalls: CustomWall[], width: number, depth: number) => void;
  /** The currently selected wall segment ID (for elevation view sync). */
  activeWallId?: string | null;
  onSelectWall?: (wallId: string) => void;
  /** When true, editing is disabled (view only). */
  locked?: boolean;
}

type Mode = "select" | "split";

export function PolygonRoomEditor({
  vertices,
  customWalls,
  ppi,
  onChange,
  activeWallId,
  onSelectWall,
  locked = false,
}: Props) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>("select");
  const [dragVertexId, setDragVertexId] = useState<string | null>(null);
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute bounding box for SVG viewBox.
  const bounds = polygonBounds(vertices);
  const padding = 24; // inches of padding around the polygon
  const viewW = (bounds.width + padding * 2) * ppi;
  const viewH = (bounds.height + padding * 2) * ppi;
  const offsetX = (padding - bounds.minX) * ppi;
  const offsetY = (padding - bounds.minY) * ppi;

  // ─── Vertex Drag ────────────────────────────────────────────────────────────
  const dragStart = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);

  const handleVertexPointerDown = useCallback(
    (e: React.PointerEvent, vertex: RoomVertex) => {
      if (locked || mode !== "select") return;
      e.stopPropagation();
      e.preventDefault();
      setDragVertexId(vertex.id);
      dragStart.current = { x: e.clientX, y: e.clientY, origX: vertex.x, origY: vertex.y };
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [locked, mode],
  );

  const handleVertexPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragVertexId || !dragStart.current) return;
      const dx = (e.clientX - dragStart.current.x) / ppi;
      const dy = (e.clientY - dragStart.current.y) / ppi;
      const newX = dragStart.current.origX + dx;
      const newY = dragStart.current.origY + dy;

      // Snap to grid (6" increments).
      const snappedX = Math.round(newX / 6) * 6;
      const snappedY = Math.round(newY / 6) * 6;

      const result = moveVertex(dragVertexId, snappedX, snappedY, vertices);
      const normalized = normalizeVertices(result.vertices);
      const newBounds = polygonBounds(normalized);
      onChange(normalized, customWalls, newBounds.width, newBounds.height);
    },
    [dragVertexId, ppi, vertices, customWalls, onChange],
  );

  const handleVertexPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragVertexId) {
        try {
          (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }
      }
      setDragVertexId(null);
      dragStart.current = null;
    },
    [dragVertexId],
  );

  // ─── Wall Click (Split or Select) ──────────────────────────────────────────
  const handleWallClick = useCallback(
    (wallId: string) => {
      if (locked) return;

      if (mode === "split") {
        const result = splitWall(wallId, vertices, customWalls);
        if (result.newVertexId) {
          const normalized = normalizeVertices(result.vertices);
          const newBounds = polygonBounds(normalized);
          onChange(normalized, result.customWalls, newBounds.width, newBounds.height);
          toast.success("Wall split — drag the new point to shape your room");
        }
        // Stay in split mode for consecutive splits.
      } else {
        onSelectWall?.(wallId);
      }
    },
    [locked, mode, vertices, customWalls, onChange, onSelectWall],
  );

  // ─── Merge (undo split) ────────────────────────────────────────────────────
  const handleMerge = useCallback(
    (wallId1: string, wallId2: string) => {
      const result = mergeWalls(wallId1, wallId2, vertices, customWalls);
      if (result) {
        const normalized = normalizeVertices(result.vertices);
        const newBounds = polygonBounds(normalized);
        onChange(normalized, result.customWalls, newBounds.width, newBounds.height);
        toast.success("Walls merged");
      }
    },
    [vertices, customWalls, onChange],
  );

  // ─── Keyboard: Escape exits split mode ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("select");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      {!locked && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-border px-2 py-1">
          <Button
            variant={mode === "select" ? "default" : "ghost"}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setMode("select")}
          >
            <Move className="h-3 w-3" /> Move
          </Button>
          <Button
            variant={mode === "split" ? "default" : "ghost"}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setMode("split")}
          >
            <Scissors className="h-3 w-3" /> Split
          </Button>
        </div>
      )}

      {/* Mode indicator */}
      {mode === "split" && (
        <div className="absolute top-2 right-2 z-10 bg-amber-100 text-amber-800 text-[11px] font-medium px-2 py-1 rounded">
          Tap a wall to split it
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`0 0 ${viewW} ${viewH}`}
        style={{ touchAction: "none" }}
      >
        <g transform={`translate(${offsetX}, ${offsetY})`}>
          {/* Room fill */}
          <polygon
            points={verticesToPoints(vertices, ppi)}
            fill="#ffffff"
            stroke="#1a2744"
            strokeWidth={3}
            fillOpacity={0.95}
          />

          {/* Grid lines (12" = 1ft) */}
          <defs>
            <pattern
              id="poly-grid"
              width={12 * ppi}
              height={12 * ppi}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${12 * ppi} 0 L 0 0 0 ${12 * ppi}`}
                fill="none"
                stroke="#f1f4f8"
                strokeWidth={1}
              />
            </pattern>
            <clipPath id="poly-clip">
              <polygon points={verticesToPoints(vertices, ppi)} />
            </clipPath>
          </defs>
          <rect
            x={bounds.minX * ppi}
            y={bounds.minY * ppi}
            width={bounds.width * ppi}
            height={bounds.height * ppi}
            fill="url(#poly-grid)"
            clipPath="url(#poly-clip)"
          />

          {/* Wall segments (clickable) */}
          {customWalls.map((wall) => {
            const start = vertices.find((v) => v.id === wall.startVertexId);
            const end = vertices.find((v) => v.id === wall.endVertexId);
            if (!start || !end) return null;

            const isActive = wall.id === activeWallId;
            const isHovered = wall.id === hoveredWallId;
            const len = wallSegmentLength(wall, vertices);
            const mid = wallMidpoint(wall, vertices);

            return (
              <g key={wall.id}>
                {/* Thick invisible hit area */}
                <line
                  x1={start.x * ppi}
                  y1={start.y * ppi}
                  x2={end.x * ppi}
                  y2={end.y * ppi}
                  stroke="transparent"
                  strokeWidth={20}
                  style={{ cursor: mode === "split" ? "crosshair" : "pointer" }}
                  onClick={() => handleWallClick(wall.id)}
                  onPointerEnter={() => setHoveredWallId(wall.id)}
                  onPointerLeave={() => setHoveredWallId(null)}
                />
                {/* Visible wall line */}
                <line
                  x1={start.x * ppi}
                  y1={start.y * ppi}
                  x2={end.x * ppi}
                  y2={end.y * ppi}
                  stroke={isActive ? "#d4a75a" : isHovered ? "#6b7280" : "#1a2744"}
                  strokeWidth={isActive ? 4 : 3}
                  pointerEvents="none"
                />
                {/* Wall length label */}
                <text
                  x={mid.x * ppi}
                  y={mid.y * ppi - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                  pointerEvents="none"
                >
                  {Math.round(len)}&quot;
                </text>
                {/* Wall label */}
                {wall.label && (
                  <text
                    x={mid.x * ppi}
                    y={mid.y * ppi + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill={isActive ? "#d4a75a" : "#9ca3af"}
                    fontWeight={isActive ? 600 : 400}
                    pointerEvents="none"
                  >
                    {wall.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Vertex handles (draggable) */}
          {vertices.map((vertex) => (
            <circle
              key={vertex.id}
              cx={vertex.x * ppi}
              cy={vertex.y * ppi}
              r={dragVertexId === vertex.id ? 8 : 6}
              fill={dragVertexId === vertex.id ? "#d4a75a" : "#1a2744"}
              stroke="#ffffff"
              strokeWidth={2}
              style={{ cursor: mode === "select" && !locked ? "grab" : "default" }}
              onPointerDown={(e) => handleVertexPointerDown(e, vertex)}
              onPointerMove={handleVertexPointerMove}
              onPointerUp={handleVertexPointerUp}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
