/**
 * PolygonRoomEditor — An SVG-based editor for custom polygon room shapes.
 *
 * Modes:
 * 1. Move mode: drag vertices to reshape the room (bump-outs, recesses).
 * 2. Split mode: tap a wall segment to split it at the midpoint (adds a new vertex).
 * 3. Shape mode: select a wall, pick a preset shape (half-circle or open square),
 *    choose inside/outside, set size, and apply.
 *
 * Mobile-first UX:
 * - Large vertex handles (14px radius) for easy finger dragging.
 * - Thick wall hit areas (40px) for easy tapping in split mode.
 * - Prominent instruction banner at top with clear step-by-step guidance.
 * - Pulsing animation on walls in split mode to show they're tappable.
 * - Haptic-style visual feedback on interactions.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Scissors, Move, Info, Shapes, SquareDashed, CircleDashed, ArrowUpFromLine, ArrowDownToLine } from "lucide-react";
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
  addOpenSquare,
  addHalfCircle,
} from "@/lib/polygonRoom";


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

type Mode = "select" | "split" | "shape";
type ShapeType = "square" | "halfcircle";
type ShapeDir = "out" | "in";

export function PolygonRoomEditor({
  vertices,
  customWalls,
  ppi,
  onChange,
  activeWallId,
  onSelectWall,
  locked = false,
}: Props) {

  const [mode, setMode] = useState<Mode>("split"); // Start in split mode for discoverability
  const [dragVertexId, setDragVertexId] = useState<string | null>(null);
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  // Shape mode state
  const [shapeType, setShapeType] = useState<ShapeType>("square");
  const [shapeDir, setShapeDir] = useState<ShapeDir>("out");
  const [shapeDepthFt, setShapeDepthFt] = useState("2"); // feet
  const [shapeWidthFt, setShapeWidthFt] = useState(""); // feet, empty = auto (half of wall)
  const [shapeTargetWallId, setShapeTargetWallId] = useState<string | null>(null);

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

  // ─── Vertex Drag ────────────────────────────────────────────────────────────
  const dragStart = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);

  const handleVertexPointerDown = useCallback(
    (e: React.PointerEvent, vertex: RoomVertex) => {
      if (locked || mode !== "select") return;
      e.stopPropagation();
      e.preventDefault();
      dismissHelp();
      setDragVertexId(vertex.id);
      dragStart.current = { x: e.clientX, y: e.clientY, origX: vertex.x, origY: vertex.y };
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [locked, mode, dismissHelp],
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

  // ─── Wall Click (Split, Select, or Shape target) ───────────────────────────
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
      } else if (mode === "shape") {
        setShapeTargetWallId(wallId);
        toast.info("Wall selected. Adjust settings below and click Apply.", { duration: 3000 });
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

  // ─── Apply Shape Preset ────────────────────────────────────────────────────
  const handleApplyShape = useCallback(() => {
    if (!shapeTargetWallId) {
      toast.error("Please click a wall first to select it.");
      return;
    }
    const wall = customWalls.find((w) => w.id === shapeTargetWallId);
    if (!wall) return;

    const depthIn = parseFloat(shapeDepthFt) * 12;
    if (isNaN(depthIn) || depthIn <= 0) {
      toast.error("Please enter a valid depth.");
      return;
    }

    // Width: user-specified or auto (half of wall length)
    const wallLen = wallSegmentLength(wall, vertices);
    let widthIn: number;
    if (shapeWidthFt.trim() === "") {
      widthIn = wallLen / 2;
    } else {
      widthIn = parseFloat(shapeWidthFt) * 12;
    }
    if (isNaN(widthIn) || widthIn <= 0) {
      toast.error("Please enter a valid width.");
      return;
    }
    if (widthIn >= wallLen) {
      toast.error(`Width must be less than the wall length (${Math.round(wallLen / 12)}').`);
      return;
    }

    let result: { vertices: RoomVertex[]; customWalls: CustomWall[] } | null = null;

    if (shapeType === "square") {
      result = addOpenSquare(shapeTargetWallId, vertices, customWalls, widthIn, depthIn, shapeDir);
    } else {
      result = addHalfCircle(shapeTargetWallId, vertices, customWalls, widthIn, shapeDir);
    }

    if (!result) {
      toast.error("Could not apply shape. Make sure the wall is long enough.");
      return;
    }

    const normalized = normalizeVertices(result.vertices);
    const newBounds = polygonBounds(normalized);
    onChange(normalized, result.customWalls, newBounds.width, newBounds.height);
    setShapeTargetWallId(null);
    toast.success(`${shapeType === "square" ? "Open square" : "Half-circle"} ${shapeDir === "out" ? "bump-out" : "inset"} applied!`);
    setMode("select"); // Switch to move mode so user can fine-tune
  }, [shapeTargetWallId, shapeType, shapeDir, shapeDepthFt, shapeWidthFt, vertices, customWalls, onChange]);

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

  const instructionText = mode === "split"
    ? "Step 1: Tap any wall (the blue lines) to add a split point. This creates a new corner you can drag."
    : mode === "shape"
    ? shapeTargetWallId
      ? "Wall selected. Choose shape settings below and click Apply Shape."
      : "Tap a wall to select it as the target for your shape preset."
    : "Step 2: Drag the corner points to push walls inward (chimney) or outward (bump-out).";

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* ─── Instruction Banner ─────────────────────────────────────────── */}
      {showHelp && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-[#1a2744] to-[#1a2744]/95 text-white px-4 py-3 shadow-lg">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 mt-0.5 text-[#d4a75a] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Custom Room Shape Editor</p>
              <p className="text-xs text-white/80 mt-1 leading-relaxed">{instructionText}</p>
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
        <div
          className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-border px-2 py-1.5"
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
            <Scissors className="h-4 w-4" /> Split
          </Button>
          <Button
            variant={mode === "shape" ? "default" : "ghost"}
            size="sm"
            className={`h-8 gap-1.5 text-xs font-semibold ${mode === "shape" ? "bg-emerald-600 text-white" : ""}`}
            onClick={() => { setMode("shape"); setShapeTargetWallId(null); }}
          >
            <Shapes className="h-4 w-4" /> Shape
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
        {mode === "shape" && !shapeTargetWallId && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md animate-pulse">
            Tap a wall to target
          </div>
        )}
        {mode === "shape" && shapeTargetWallId && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
            Wall selected ✓
          </div>
        )}
      </div>

      {/* ─── Shape Preset Panel ────────────────────────────────────────── */}
      {mode === "shape" && !locked && (
        <div
          className="absolute bottom-4 left-2 right-2 z-10 bg-white/97 backdrop-blur-sm rounded-2xl shadow-xl border border-border p-4 space-y-3"
        >
          <p className="text-xs font-bold text-[#1a2744] uppercase tracking-wide">Shape Settings</p>

          {/* Shape Type */}
          <div className="flex gap-2">
            <button
              onClick={() => setShapeType("square")}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                shapeType === "square"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-border bg-white text-muted-foreground hover:border-emerald-400"
              }`}
            >
              <SquareDashed className="h-5 w-5" />
              Open Square
            </button>
            <button
              onClick={() => setShapeType("halfcircle")}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                shapeType === "halfcircle"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-border bg-white text-muted-foreground hover:border-emerald-400"
              }`}
            >
              <CircleDashed className="h-5 w-5" />
              Half Circle
            </button>
          </div>

          {/* Direction */}
          <div className="flex gap-2">
            <button
              onClick={() => setShapeDir("out")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                shapeDir === "out"
                  ? "border-[#d4a75a] bg-amber-50 text-amber-700"
                  : "border-border bg-white text-muted-foreground hover:border-amber-400"
              }`}
            >
              <ArrowUpFromLine className="h-4 w-4" />
              Outside (Bump-Out)
            </button>
            <button
              onClick={() => setShapeDir("in")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                shapeDir === "in"
                  ? "border-[#1a2744] bg-slate-50 text-slate-700"
                  : "border-border bg-white text-muted-foreground hover:border-slate-400"
              }`}
            >
              <ArrowDownToLine className="h-4 w-4" />
              Inside (Inset)
            </button>
          </div>

          {/* Size inputs */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Depth (ft)
              </label>
              <input
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={shapeDepthFt}
                onChange={(e) => setShapeDepthFt(e.target.value)}
                className="w-full h-9 rounded-lg border border-border px-3 text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="2"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Width (ft, optional)
              </label>
              <input
                type="number"
                min="1"
                max="20"
                step="0.5"
                value={shapeWidthFt}
                onChange={(e) => setShapeWidthFt(e.target.value)}
                className="w-full h-9 rounded-lg border border-border px-3 text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="auto"
              />
            </div>
          </div>

          {/* Target wall indicator */}
          {shapeTargetWallId && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700">
                {customWalls.find((w) => w.id === shapeTargetWallId)?.label || "Wall"} selected
                {" "}({Math.round(wallSegmentLength(customWalls.find((w) => w.id === shapeTargetWallId)!, vertices) / 12)}' long)
              </span>
            </div>
          )}

          {/* Apply button */}
          <Button
            onClick={handleApplyShape}
            disabled={!shapeTargetWallId}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 rounded-xl"
          >
            Apply Shape
          </Button>
        </div>
      )}

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
            @keyframes shapePulse {
              0%, 100% { stroke-opacity: 0.3; stroke-width: 10; }
              50% { stroke-opacity: 0.7; stroke-width: 18; }
            }
            .shape-pulse { animation: shapePulse 1.2s ease-in-out infinite; }
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
            const isShapeTarget = wall.id === shapeTargetWallId;
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

                {/* Pulsing highlight in shape mode */}
                {mode === "shape" && !isShapeTarget && (
                  <line
                    x1={start.x * ppi}
                    y1={start.y * ppi}
                    x2={end.x * ppi}
                    y2={end.y * ppi}
                    stroke="#10b981"
                    strokeLinecap="round"
                    className="shape-pulse"
                    pointerEvents="none"
                  />
                )}

                {/* Shape target highlight */}
                {isShapeTarget && (
                  <line
                    x1={start.x * ppi}
                    y1={start.y * ppi}
                    x2={end.x * ppi}
                    y2={end.y * ppi}
                    stroke="#10b981"
                    strokeWidth={10}
                    strokeLinecap="round"
                    strokeOpacity={0.5}
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
                  style={{ cursor: mode === "split" ? "crosshair" : mode === "shape" ? "cell" : "pointer" }}
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
                  stroke={isShapeTarget ? "#10b981" : isActive ? "#d4a75a" : isHovered ? "#4b5563" : "#1a2744"}
                  strokeWidth={isShapeTarget ? 5 : isActive ? 5 : isHovered ? 4 : 3}
                  strokeLinecap="round"
                  pointerEvents="none"
                />

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
                    fill={isShapeTarget ? "#10b981" : isActive ? "#d4a75a" : "#6b7280"}
                    fontWeight={isShapeTarget || isActive ? 700 : 500}
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

                {/* Shape target indicator in shape mode */}
                {mode === "shape" && !isShapeTarget && (
                  <circle
                    cx={mid.x * ppi}
                    cy={mid.y * ppi}
                    r={6}
                    fill="#10b981"
                    fillOpacity={0.5}
                    stroke="#10b981"
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
