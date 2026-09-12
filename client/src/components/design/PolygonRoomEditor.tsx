/**
 * PolygonRoomEditor — An SVG-based editor for custom polygon room shapes.
 *
 * Modes:
 * 1. Move mode: drag vertices to reshape the room (bump-outs, recesses).
 * 2. Split mode: tap a wall segment to split it at the midpoint (adds a new vertex).
 *
 * Mobile-first UX:
 * - Large vertex handles (14px radius) for easy finger dragging.
 * - Thick wall hit areas (40px) for easy tapping in split mode.
 * - Prominent instruction banner at top with clear step-by-step guidance.
 * - Pulsing animation on walls in split mode to show they're tappable.
 * - Haptic-style visual feedback on interactions.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Scissors, Move, Info, CornerDownLeft, CornerDownRight } from "lucide-react";
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
  isLocked45Wall,
  lockWallToAngle,
  snapWallEndpointNear45,
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
  const [mode, setMode] = useState<Mode>("split"); // Start in split mode for discoverability
  const [dragVertexId, setDragVertexId] = useState<string | null>(null);
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute bounding box for SVG viewBox.
  const bounds = polygonBounds(vertices);
  const padding = 36; // inches of padding around the polygon for easier edge access
  const viewW = (bounds.width + padding * 2) * ppi;
  const viewH = (bounds.height + padding * 2) * ppi;
  const offsetX = (padding - bounds.minX) * ppi;
  const offsetY = (padding - bounds.minY) * ppi;

  // Auto-dismiss help after first interaction
  const dismissHelp = useCallback(() => {
    if (showHelp) setShowHelp(false);
  }, [showHelp]);

  const setSelectedWallAngle = useCallback((angle: 45 | -45) => {
    if (locked || !activeWallId) {
      toast.info("Select a wall segment first, then choose its 45° direction.");
      return;
    }
    const result = lockWallToAngle(activeWallId, angle, vertices, customWalls);
    if (!result) return;
    const normalized = normalizeVertices(result.vertices);
    const nextBounds = polygonBounds(normalized);
    onChange(normalized, result.customWalls, nextBounds.width, nextBounds.height);
    onSelectWall?.(activeWallId);
    setMode("select");
    dismissHelp();
    toast.success(`Wall locked to ${angle === 45 ? "+45°" : "−45°"}. Cabinets will snap exactly to this run.`);
  }, [activeWallId, customWalls, dismissHelp, locked, onChange, onSelectWall, vertices]);

  // ─── Vertex Drag ────────────────────────────────────────────────────────────
  const dragStart = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);

  const handleVertexPointerDown = useCallback(
    (e: React.PointerEvent, vertex: RoomVertex) => {
      if (locked || mode !== "select") return;
      if (customWalls.some((wall) => isLocked45Wall(wall) && (wall.startVertexId === vertex.id || wall.endVertexId === vertex.id))) {
        toast.info("This 45° wall is locked. Use the 45° controls to preserve its exact angle.");
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      dismissHelp();
      setDragVertexId(vertex.id);
      dragStart.current = { x: e.clientX, y: e.clientY, origX: vertex.x, origY: vertex.y };
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [locked, mode, dismissHelp, customWalls],
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

      // v1 deliberately snaps only close diagonal gestures to an exact 45°;
      // all other walls retain the existing 6-inch grid behavior. Once snapped,
      // the segment is locked so it cannot drift to 44°/46° on later edits.
      let targetX = snappedX;
      let targetY = snappedY;
      let nextWalls = customWalls;
      const adjacentWall = customWalls.find((wall) => wall.startVertexId === dragVertexId || wall.endVertexId === dragVertexId);
      const diagonalSnap = adjacentWall ? snapWallEndpointNear45(adjacentWall, dragVertexId, { x: targetX, y: targetY }, vertices) : null;
      if (adjacentWall && diagonalSnap) {
        targetX = diagonalSnap.x;
        targetY = diagonalSnap.y;
        nextWalls = customWalls.map((wall) => wall.id === adjacentWall.id ? { ...wall, lockedAngle: diagonalSnap.lockedAngle } : wall);
      }

      const result = moveVertex(dragVertexId, targetX, targetY, vertices);
      const normalized = normalizeVertices(result.vertices);
      const newBounds = polygonBounds(normalized);
      onChange(normalized, nextWalls, newBounds.width, newBounds.height);
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
      dismissHelp();

      if (mode === "split") {
        const result = splitWall(wallId, vertices, customWalls);
        if (result.newVertexId) {
          const normalized = normalizeVertices(result.vertices);
          const newBounds = polygonBounds(normalized);
          onChange(normalized, result.customWalls, newBounds.width, newBounds.height);
          toast.success("Wall split! Switch to Move mode and drag the new point to shape your room.", { duration: 4000 });
          // Auto-switch to move mode after split so user can immediately drag
          setMode("select");
        }
      } else {
        onSelectWall?.(wallId);
      }
    },
    [locked, mode, vertices, customWalls, onChange, onSelectWall, dismissHelp],
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

  // Determine if we have more than 4 vertices (user has already split)
  const hasSplits = vertices.length > 4;

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* ─── Instruction Banner ─────────────────────────────────────────── */}
      {showHelp && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-[#1a2744] to-[#1a2744]/95 text-white px-4 py-3 shadow-lg">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 mt-0.5 text-[#d4a75a] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Custom Room Shape Editor</p>
              <p className="text-xs text-white/80 mt-1 leading-relaxed">
                {mode === "split"
                  ? "Step 1: Tap any wall (the blue lines) to add a split point. This creates a new corner you can drag."
                  : "Step 2: Drag the corner points to push walls inward (chimney) or outward (bump-out)."}
              </p>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="text-white/60 hover:text-white text-xs shrink-0 px-2 py-1"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ─── Mode Toolbar ──────────────────────────────────────────────── */}
      {!locked && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-border px-2 py-1.5"
          style={{ top: showHelp ? "76px" : "8px" }}
        >
          <Button
            variant={mode === "select" ? "default" : "ghost"}
            size="sm"
            className={`h-8 gap-1.5 text-xs font-semibold ${mode === "select" ? "bg-[#1a2744] text-white" : ""}`}
            onClick={() => setMode("select")}
          >
            <Move className="h-4 w-4" /> Move
          </Button>
          <Button
            variant={mode === "split" ? "default" : "ghost"}
            size="sm"
            className={`h-8 gap-1.5 text-xs font-semibold ${mode === "split" ? "bg-[#d4a75a] text-[#1a2744]" : ""}`}
            onClick={() => setMode("split")}
          >
            <Scissors className="h-4 w-4" /> Split Wall
          </Button>
          <span className="mx-0.5 h-5 w-px bg-border" />
          <Button variant="ghost" size="sm" disabled={!activeWallId} className="h-8 gap-1 text-xs font-semibold" title="Lock selected wall to +45 degrees" onClick={() => setSelectedWallAngle(45)}>
            <CornerDownRight className="h-4 w-4" /> +45°
          </Button>
          <Button variant="ghost" size="sm" disabled={!activeWallId} className="h-8 gap-1 text-xs font-semibold" title="Lock selected wall to −45 degrees" onClick={() => setSelectedWallAngle(-45)}>
            <CornerDownLeft className="h-4 w-4" /> −45°
          </Button>
        </div>
      )}

      {/* ─── Mode Status Pill ──────────────────────────────────────────── */}
      <div
        className="absolute right-2 z-10 flex items-center"
        style={{ top: showHelp ? "76px" : "8px" }}
      >
        {mode === "split" && (
          <div className="bg-[#d4a75a] text-[#1a2744] text-xs font-bold px-3 py-1.5 rounded-full shadow-md animate-pulse">
            Tap a wall to split
          </div>
        )}
        {mode === "select" && hasSplits && (
          <div className="bg-[#1a2744] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
            Drag points to reshape
          </div>
        )}
      </div>

      {/* ─── SVG Canvas ────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        className="w-full flex-1 min-h-0"
        viewBox={`0 0 ${viewW} ${viewH}`}
        style={{ touchAction: "none" }}
      >
        {/* Pulse animation for split mode */}
        <defs>
          <style>{`
            @keyframes wallPulse {
              0%, 100% { stroke-opacity: 0.4; stroke-width: 8; }
              50% { stroke-opacity: 0.8; stroke-width: 14; }
            }
            .wall-pulse { animation: wallPulse 1.5s ease-in-out infinite; }
          `}</style>
        </defs>

        <g transform={`translate(${offsetX}, ${offsetY})`}>
          {/* Room fill */}
          <polygon
            points={verticesToPoints(vertices, ppi)}
            fill="#f8fafc"
            stroke="#1a2744"
            strokeWidth={3}
            fillOpacity={0.98}
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
                stroke="#e2e8f0"
                strokeWidth={0.5}
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

          {/* Wall segments */}
          {customWalls.map((wall) => {
            const start = vertices.find((v) => v.id === wall.startVertexId);
            const end = vertices.find((v) => v.id === wall.endVertexId);
            if (!start || !end) return null;

	            const isActive = wall.id === activeWallId;
	            const isHovered = wall.id === hoveredWallId;
	            const isLockedAngle = isLocked45Wall(wall);
	            const len = wallSegmentLength(wall, vertices);
            const mid = wallMidpoint(wall, vertices);

            return (
              <g key={wall.id}>
                {/* Pulsing highlight in split mode */}
                {mode === "split" && (
                  <line
                    x1={start.x * ppi}
                    y1={start.y * ppi}
                    x2={end.x * ppi}
                    y2={end.y * ppi}
                    stroke="#d4a75a"
                    strokeLinecap="round"
                    className="wall-pulse"
                    pointerEvents="none"
                  />
                )}

                {/* Extra-thick invisible hit area for mobile (40px) */}
                <line
                  x1={start.x * ppi}
                  y1={start.y * ppi}
                  x2={end.x * ppi}
                  y2={end.y * ppi}
                  stroke="transparent"
                  strokeWidth={40}
                  strokeLinecap="round"
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
	                  stroke={isActive ? "#d4a75a" : isHovered ? "#4b5563" : "#1a2744"}
	                  strokeWidth={isActive ? 5 : isHovered ? 4 : 3}
	                  strokeLinecap="round"
	                  pointerEvents="none"
	                />

	                {isLockedAngle && (
	                  <>
	                    <line
	                      x1={start.x * ppi}
	                      y1={start.y * ppi}
	                      x2={end.x * ppi}
	                      y2={end.y * ppi}
	                      stroke="#22c55e"
	                      strokeWidth={2}
	                      strokeDasharray="7 5"
	                      pointerEvents="none"
	                    />
	                    <text x={mid.x * ppi} y={mid.y * ppi + 30} textAnchor="middle" fontSize={10} fontWeight={800} fill="#15803d" pointerEvents="none">
	                      {wall.lockedAngle === 45 ? "+45° LOCKED" : "−45° LOCKED"}
	                    </text>
	                  </>
	                )}

	                {/* Wall length label */}
                <text
                  x={mid.x * ppi}
                  y={mid.y * ppi - 12}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="#374151"
                  pointerEvents="none"
                >
                  {Math.round(len)}"
                </text>

                {/* Wall label */}
                {wall.label && (
                  <text
                    x={mid.x * ppi}
                    y={mid.y * ppi + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fill={isActive ? "#d4a75a" : "#6b7280"}
                    fontWeight={isActive ? 700 : 500}
                    pointerEvents="none"
                  >
                    {wall.label}
                  </text>
                )}

                {/* Split indicator dot at midpoint in split mode */}
                {mode === "split" && (
                  <circle
                    cx={mid.x * ppi}
                    cy={mid.y * ppi}
                    r={6}
                    fill="#d4a75a"
                    fillOpacity={0.6}
                    stroke="#d4a75a"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          {/* Vertex handles (draggable) — large for mobile */}
          {vertices.map((vertex) => {
            const isDragging = dragVertexId === vertex.id;
            const isMovable = mode === "select" && !locked;
            return (
              <g key={vertex.id}>
                {/* Outer glow when dragging */}
                {isDragging && (
                  <circle
                    cx={vertex.x * ppi}
                    cy={vertex.y * ppi}
                    r={20}
                    fill="#d4a75a"
                    fillOpacity={0.2}
                    pointerEvents="none"
                  />
                )}
                {/* Main handle — 14px radius for easy finger targeting */}
                <circle
                  cx={vertex.x * ppi}
                  cy={vertex.y * ppi}
                  r={isDragging ? 16 : 12}
                  fill={isDragging ? "#d4a75a" : isMovable ? "#1a2744" : "#6b7280"}
                  stroke="#ffffff"
                  strokeWidth={3}
                  style={{ cursor: isMovable ? "grab" : "default" }}
                  onPointerDown={(e) => handleVertexPointerDown(e, vertex)}
                  onPointerMove={handleVertexPointerMove}
                  onPointerUp={handleVertexPointerUp}
                />
                {/* Inner dot for visual clarity */}
                <circle
                  cx={vertex.x * ppi}
                  cy={vertex.y * ppi}
                  r={4}
                  fill="#ffffff"
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
