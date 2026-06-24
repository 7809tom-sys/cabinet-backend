import { useRef, useState, useCallback, useEffect } from "react";
import {
  PlacedCabinet, RoomData, rotatedSize, snapPosition, hasCollision,
  isCornerCabinet, cornerClipPath, cornerLegRatioForPlaced, diagonalCornerClipPath, isDiagonalCorner, formatInches, isBlindCorner,
  resolveSwing,
  WallOpening, clampOpening, FinishColors, DEFAULT_FINISH_COLORS,
  clampRoomInches, inchesToFeetInches, WallSide, WALL_LABELS,
  cabinetWall, wallSpanMeasure,
  countertopSurfaces, countertopMaterial, type SinkFixture, SINK_PRESETS,
} from "@/lib/design";
import { X } from "lucide-react";

interface IslandZone {
  x: number;
  y: number;
  width: number;
  depth: number;
}

interface Props {
  room: RoomData;
  cabinets: PlacedCabinet[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, x: number, y: number) => void;
  onDelete?: (uid: string) => void;
  onDropNew?: (clientX: number, clientY: number, canvasRect: DOMRect, ppi: number) => void;
  showWallLayer: boolean;
  measureMode?: boolean;
  island?: IslandZone | null;
  onIslandChange?: (zone: IslandZone) => void;
  // Incremental island move (inches). When provided, moving the island also
  // carries the cabinets sitting on it. Resize still uses onIslandChange.
  onIslandMove?: (dxIn: number, dyIn: number) => void;
  openings?: WallOpening[];
  selectedOpeningUid?: string | null;
  onSelectOpening?: (uid: string | null) => void;
  onOpeningChange?: (opening: WallOpening) => void;
  onDeleteOpening?: (uid: string) => void;
  finish?: FinishColors;
  drawMode?: boolean;
  onDrawRoom?: (room: RoomData) => void;
  // Active-wall: the highlighted wall. Click a wall to select it; drag it to
  // resize the room on that side.
  activeWall?: WallSide;
  onSelectWall?: (side: WallSide) => void;
  onResizeWall?: (side: WallSide, deltaIn: number) => void;
  // Uids of items that are in a conflict (e.g. appliance running into a cabinet).
  conflictUids?: Set<string>;
  // Lock state: when layoutLocked is true the whole room/walls/openings/island
  // are frozen (cabinets can still be moved). lockedWalls freezes specific walls.
  layoutLocked?: boolean;
  lockedWalls?: Set<WallSide>;
  // Countertop: when a material id is set, draw a visible slab over base cabinets
  // (and the island). Sinks/faucets are drawn on top of the counter.
  countertopMaterialId?: string | null;
  sinks?: SinkFixture[];
  selectedSinkUid?: string | null;
  onSelectSink?: (uid: string | null) => void;
  onMoveSink?: (uid: string, x: number, y: number) => void;
  // Right-click a WALL cabinet to drop it to the floor as an island/peninsula
  // base (top lands at 34.5 in). Provided by DesignTool.
  onDropToFloor?: (uid: string) => void;
}

export function PlanCanvas({
  room, cabinets, selectedUid, onSelect, onMove, onDelete, onDropNew, onDropToFloor,
  showWallLayer, measureMode = false, island = null, onIslandChange, onIslandMove,
  openings = [], selectedOpeningUid = null, onSelectOpening, onOpeningChange, onDeleteOpening,
  finish = DEFAULT_FINISH_COLORS,
  drawMode = false, onDrawRoom,
  activeWall, onSelectWall, onResizeWall, conflictUids,
  layoutLocked = false, lockedWalls,
  countertopMaterialId = null, sinks = [], selectedSinkUid = null, onSelectSink, onMoveSink,
}: Props) {
  // A wall cannot be resized if the whole layout is locked or that wall is locked.
  const isWallLocked = (side: WallSide) => layoutLocked || !!lockedWalls?.has(side);
  // Door/window drag along its wall (move) or width-resize.
  const openingDrag = useRef<
    | { mode: "move" | "resize"; startX: number; startY: number; orig: WallOpening }
    | null
  >(null);

  const onOpeningPointerDown = (e: React.PointerEvent, o: WallOpening, mode: "move" | "resize") => {
    if (!onOpeningChange || layoutLocked) return;
    e.stopPropagation();
    onSelectOpening?.(o.uid);
    openingDrag.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...o } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onOpeningPointerMove = (e: React.PointerEvent) => {
    const d = openingDrag.current;
    if (!d || !onOpeningChange) return;
    const horizontal = d.orig.side === "top" || d.orig.side === "bottom";
    const deltaPx = horizontal ? e.clientX - d.startX : e.clientY - d.startY;
    const deltaIn = deltaPx / ppiRef.current;
    if (d.mode === "move") {
      onOpeningChange(clampOpening({ ...d.orig, offset: d.orig.offset + deltaIn }, room));
    } else {
      const width = Math.max(12, d.orig.width + deltaIn);
      onOpeningChange(clampOpening({ ...d.orig, width }, room));
    }
  };

  const onOpeningPointerUp = (e: React.PointerEvent) => {
    if (openingDrag.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    openingDrag.current = null;
  };
  // Island drag/resize: tracks an active gesture without re-rendering per move.
  const islandDrag = useRef<
    | { mode: "move" | "resize"; startX: number; startY: number; orig: IslandZone }
    | null
  >(null);

  const onIslandPointerDown = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (!island || !onIslandChange || layoutLocked) return;
    e.stopPropagation();
    islandDrag.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...island } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onIslandPointerMove = (e: React.PointerEvent) => {
    const d = islandDrag.current;
    if (!d || !island || (!onIslandChange && !onIslandMove)) return;
    const dxIn = (e.clientX - d.startX) / ppiRef.current;
    const dyIn = (e.clientY - d.startY) / ppiRef.current;
    if (d.mode === "move") {
      const x = Math.max(0, Math.min(d.orig.x + dxIn, room.width - d.orig.width));
      const y = Math.max(0, Math.min(d.orig.y + dyIn, room.depth - d.orig.depth));
      // If a grouped-move handler is provided, report the incremental delta from
      // the island's CURRENT position so the cabinets on it move in lockstep.
      if (onIslandMove) {
        const ddx = x - island.x;
        const ddy = y - island.y;
        if (ddx !== 0 || ddy !== 0) onIslandMove(ddx, ddy);
      } else {
        onIslandChange?.({ ...d.orig, x, y });
      }
    } else {
      const width = Math.max(18, Math.min(d.orig.width + dxIn, room.width - d.orig.x));
      const depth = Math.max(18, Math.min(d.orig.depth + dyIn, room.depth - d.orig.y));
      onIslandChange?.({ ...d.orig, width, depth });
    }
  };

  const onIslandPointerUp = (e: React.PointerEvent) => {
    if (islandDrag.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    islandDrag.current = null;
  };

  // Sink drag: freely move a sink fixture around (it floats on the counter).
  const sinkDrag = useRef<
    | { uid: string; startX: number; startY: number; origX: number; origY: number; w: number; d: number }
    | null
  >(null);
  const onSinkPointerDown = (e: React.PointerEvent, s: SinkFixture) => {
    if (!onMoveSink || layoutLocked) return;
    e.stopPropagation();
    onSelectSink?.(s.uid);
    sinkDrag.current = { uid: s.uid, startX: e.clientX, startY: e.clientY, origX: s.x, origY: s.y, w: s.width, d: s.depth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onSinkPointerMove = (e: React.PointerEvent) => {
    const dgr = sinkDrag.current;
    if (!dgr || !onMoveSink) return;
    const dx = (e.clientX - dgr.startX) / ppiRef.current;
    const dy = (e.clientY - dgr.startY) / ppiRef.current;
    const x = Math.max(0, Math.min(dgr.origX + dx, room.width - dgr.w));
    const y = Math.max(0, Math.min(dgr.origY + dy, room.depth - dgr.d));
    onMoveSink(dgr.uid, x, y);
  };
  const onSinkPointerUp = (e: React.PointerEvent) => {
    if (sinkDrag.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    sinkDrag.current = null;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const ppiRef = useRef(4);
  useEffect(() => { ppiRef.current = ppi; }, [ppi]);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [hoverSnap, setHoverSnap] = useState(false);
  // Tape-measure: up to two picked cabinet uids.
  const [measurePicks, setMeasurePicks] = useState<string[]>([]);
  // Mouse-draw room gesture: pixel rectangle relative to the container while
  // dragging; converted to inches on release via the same fit-PPI scale.
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Wall-drag-to-resize gesture: tracks the wall being dragged + start point,
  // plus a live preview of the resulting room size (inches) for the readout.
  const wallDrag = useRef<{ side: WallSide; startX: number; startY: number } | null>(null);
  const [wallPreview, setWallPreview] = useState<{ side: WallSide; w: number; h: number } | null>(null);

  const PADDING = 48;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const availW = el.clientWidth - PADDING * 2;
      const availH = el.clientHeight - PADDING * 2;
      const fitPpi = Math.min(availW / room.width, availH / room.depth);
      setPpi(Math.max(1.5, Math.min(fitPpi, 8)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [room.width, room.depth]);

  // Reset measurement picks whenever measure mode toggles off.
  useEffect(() => {
    if (!measureMode) setMeasurePicks([]);
  }, [measureMode]);

  // Drop picks that point at cabinets which no longer exist.
  useEffect(() => {
    setMeasurePicks((prev) => prev.filter((uid) => cabinets.some((c) => c.uid === uid)));
  }, [cabinets]);

  const roomPxW = room.width * ppi;
  const roomPxH = room.depth * ppi;

  // ─── Mouse-draw room gesture (container-level) ─────────────────────────────
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!drawMode || !onDrawRoom) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawStart.current = { x, y };
    setDrawRect({ x, y, w: 0, h: 0 });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!drawMode || !drawStart.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const s = drawStart.current;
    setDrawRect({
      x: Math.min(s.x, cx),
      y: Math.min(s.y, cy),
      w: Math.abs(cx - s.x),
      h: Math.abs(cy - s.y),
    });
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    if (!drawMode || !drawStart.current || !onDrawRoom) {
      drawStart.current = null;
      setDrawRect(null);
      return;
    }
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const r = drawRect;
    drawStart.current = null;
    setDrawRect(null);
    // Ignore tiny accidental drags.
    if (!r || r.w < 12 || r.h < 12) return;
    const width = clampRoomInches(r.w / ppi);
    const depth = clampRoomInches(r.h / ppi);
    if (layoutLocked) return;
    onDrawRoom({ width, depth });
  };

  // ─── Wall drag-to-resize gesture ───────────────────────────────────────────
  const onWallPointerDown = (e: React.PointerEvent, side: WallSide) => {
    e.stopPropagation();
    onSelectWall?.(side);
    if (!onResizeWall || isWallLocked(side)) return;
    wallDrag.current = { side, startX: e.clientX, startY: e.clientY };
    setWallPreview({ side, w: room.width, h: room.depth });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onWallPointerMove = (e: React.PointerEvent) => {
    const d = wallDrag.current;
    if (!d || !onResizeWall) return;
    const horizontal = d.side === "left" || d.side === "right";
    const deltaPx = horizontal ? e.clientX - d.startX : e.clientY - d.startY;
    const deltaIn = deltaPx / ppiRef.current;
    // Mirror the resize math for the live preview readout.
    const grow = d.side === "right" ? deltaIn
      : d.side === "left" ? -deltaIn
      : d.side === "bottom" ? deltaIn
      : -deltaIn;
    const w = horizontal ? clampRoomInches(room.width + grow) : room.width;
    const h = horizontal ? room.depth : clampRoomInches(room.depth + grow);
    setWallPreview({ side: d.side, w, h });
  };

  const onWallPointerUp = (e: React.PointerEvent) => {
    const d = wallDrag.current;
    wallDrag.current = null;
    setWallPreview(null);
    if (!d || !onResizeWall) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const horizontal = d.side === "left" || d.side === "right";
    const deltaPx = horizontal ? e.clientX - d.startX : e.clientY - d.startY;
    const deltaIn = deltaPx / ppiRef.current;
    if (Math.abs(deltaIn) < 0.5) return; // treat as a plain click (select only)
    onResizeWall(d.side, deltaIn);
  };

  const handlePointerDown = (e: React.PointerEvent, p: PlacedCabinet) => {
    e.stopPropagation();
    if (measureMode) {
      // In measure mode, clicking a cabinet picks it (max two, FIFO).
      setMeasurePicks((prev) => {
        if (prev.includes(p.uid)) return prev.filter((u) => u !== p.uid);
        const next = [...prev, p.uid];
        return next.length > 2 ? next.slice(next.length - 2) : next;
      });
      return;
    }
    onSelect(p.uid);
    setDragUid(p.uid);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragUid) return;
      const container = containerRef.current;
      if (!container) return;
      const cabinet = cabinets.find((c) => c.uid === dragUid);
      if (!cabinet) return;

      const roomEl = container.querySelector("[data-room]") as HTMLElement;
      if (!roomEl) return;
      const roomRect = roomEl.getBoundingClientRect();

      const px = e.clientX - roomRect.left - dragOffset.current.x;
      const py = e.clientY - roomRect.top - dragOffset.current.y;
      const rawX = px / ppi;
      const rawY = py / ppi;

      const candidate: PlacedCabinet = { ...cabinet, x: rawX, y: rawY };
      const snapped = snapPosition(
        candidate,
        room,
        cabinets.filter((c) => c.placement === cabinet.placement)
      );
      setHoverSnap(snapped.snappedWall);
      onMove(dragUid, snapped.x, snapped.y);
    },
    [dragUid, cabinets, ppi, room, onMove]
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragUid) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* ignore */ }
    }
    setDragUid(null);
    setHoverSnap(false);
  };

  const xTicks: number[] = [];
  for (let i = 0; i <= room.width; i += 12) xTicks.push(i);
  const yTicks: number[] = [];
  for (let i = 0; i <= room.depth; i += 12) yTicks.push(i);

  // Live drag tape-measure: while dragging a cabinet, bracket it along its wall
  // and show the clearance on BOTH sides (to the neighbor cabinet edge, else the
  // wall). Built in inches then scaled to px for the overlay.
  const dragTape = (() => {
    if (!dragUid) return null;
    const p = cabinets.find((c) => c.uid === dragUid);
    if (!p) return null;
    const side = cabinetWall(p, room);
    const m = wallSpanMeasure(p, room, cabinets, side);
    const horizontal = side === "top" || side === "bottom";
    const { w, d } = rotatedSize(p);
    // The fixed cross-axis line where we draw the dimension (just outside the
    // cabinet face, toward the room interior).
    const band = 14; // px offset from the wall edge for the dimension line
    let crossPx: number;
    if (side === "top") crossPx = (p.y + d) * ppi + band;
    else if (side === "bottom") crossPx = p.y * ppi - band;
    else if (side === "left") crossPx = (p.x + w) * ppi + band;
    else crossPx = p.x * ppi - band;
    return { side, m, horizontal, crossPx, startPx: m.start * ppi, endPx: m.end * ppi };
  })();

  // Compute the measurement line between the two picked cabinets (centers).
  const measure = (() => {
    if (measurePicks.length !== 2) return null;
    const a = cabinets.find((c) => c.uid === measurePicks[0]);
    const b = cabinets.find((c) => c.uid === measurePicks[1]);
    if (!a || !b) return null;
    const sa = rotatedSize(a);
    const sb = rotatedSize(b);
    const ax = (a.x + sa.w / 2) * ppi;
    const ay = (a.y + sa.d / 2) * ppi;
    const bx = (b.x + sb.w / 2) * ppi;
    const by = (b.y + sb.d / 2) * ppi;
    const distIn = Math.sqrt((b.x + sb.w / 2 - (a.x + sa.w / 2)) ** 2 + (b.y + sb.d / 2 - (a.y + sa.d / 2)) ** 2);
    return { ax, ay, bx, by, midX: (ax + bx) / 2, midY: (ay + by) / 2, distIn };
  })();

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-[#eef1f5] select-none touch-none ${drawMode ? "cursor-crosshair" : ""}`}
      onClick={() => { if (!measureMode && !drawMode) onSelect(null); }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const roomEl = containerRef.current?.querySelector("[data-room]") as HTMLElement;
        if (roomEl && onDropNew) {
          onDropNew(e.clientX, e.clientY, roomEl.getBoundingClientRect(), ppi);
        }
      }}
    >
      {/* Live draw-room rectangle (container coordinates) */}
      {drawMode && drawRect && (
        <div
          className="pointer-events-none absolute z-50 border-2 border-dashed border-[#d4a75a] bg-[#d4a75a]/10"
          style={{ left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h }}
        >
          <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-[#1a2744] px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {(() => {
              const w = inchesToFeetInches(clampRoomInches(drawRect.w / ppi));
              const h = inchesToFeetInches(clampRoomInches(drawRect.h / ppi));
              const f = (v: { feet: number; inches: number }) => (v.inches ? `${v.feet}'${v.inches}"` : `${v.feet}'`);
              return `${f(w)} × ${f(h)}`;
            })()}
          </span>
        </div>
      )}
      <div
        data-room
        className="absolute bg-white shadow-inner"
        style={{
          width: roomPxW,
          height: roomPxH,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          border: "3px solid #1a2744",
          backgroundImage:
            "linear-gradient(#f1f4f8 1px, transparent 1px), linear-gradient(90deg, #f1f4f8 1px, transparent 1px)",
          backgroundSize: `${12 * ppi}px ${12 * ppi}px`,
        }}
      >
        {/* Draggable wall bands: click to highlight, drag to resize the room on
            that side. Rendered first so they sit beneath cabinets. */}
        {onSelectWall && !measureMode && !drawMode && (["top", "bottom", "left", "right"] as WallSide[]).map((side) => {
          const horizontal = side === "top" || side === "bottom";
          const isActive = activeWall === side;
          const wallLocked = isWallLocked(side);
          const band = 14;
          const wstyle: React.CSSProperties = horizontal
            ? {
                left: 0,
                width: roomPxW,
                height: band,
                top: side === "top" ? 0 : roomPxH - band,
                cursor: wallLocked ? "pointer" : onResizeWall ? "ns-resize" : "pointer",
              }
            : {
                top: 0,
                height: roomPxH,
                width: band,
                left: side === "left" ? 0 : roomPxW - band,
                cursor: wallLocked ? "pointer" : onResizeWall ? "ew-resize" : "pointer",
              };
          return (
            <div
              key={`wall-${side}`}
              onPointerDown={(e) => onWallPointerDown(e, side)}
              onPointerMove={onWallPointerMove}
              onPointerUp={onWallPointerUp}
              className="absolute z-[5] flex items-center justify-center transition-colors"
              style={{
                ...wstyle,
                background: isActive ? "rgba(212,167,90,0.55)" : "transparent",
                boxShadow: isActive ? "inset 0 0 0 2px #d4a75a" : undefined,
              }}
              title={`${WALL_LABELS[side]} wall — click to target new items here; drag to resize`}
            >
              {isActive && (
                <span
                  className="pointer-events-none rounded bg-[#1a2744] px-1.5 py-0.5 text-[9px] font-bold text-white shadow whitespace-nowrap"
                  style={{ transform: horizontal ? "none" : "rotate(-90deg)" }}
                >
                  {WALL_LABELS[side].toUpperCase()}{wallLocked ? " — locked" : " — drag to resize"}
                </span>
              )}
              {wallLocked && !isActive && (
                <span
                  className="pointer-events-none rounded bg-[#1a2744]/80 px-1 text-[9px] font-bold text-[#d4a75a] shadow"
                  style={{ transform: horizontal ? "none" : "rotate(-90deg)" }}
                  title={`${WALL_LABELS[side]} wall is locked`}
                >
                  🔒
                </span>
              )}
            </div>
          );
        })}

        {/* Live wall-resize readout */}
        {wallPreview && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-[60] -translate-x-1/2 rounded bg-[#1a2744] px-2 py-1 text-[11px] font-semibold text-white shadow">
            {(() => {
              const w = inchesToFeetInches(wallPreview.w);
              const h = inchesToFeetInches(wallPreview.h);
              const f = (v: { feet: number; inches: number }) => (v.inches ? `${v.feet}'${v.inches}\"` : `${v.feet}'`);
              return `${f(w)} × ${f(h)}`;
            })()}
          </div>
        )}

        {/* Countertop slab layer — visible material over base cabinets + island.
            Sits above the floor but below cabinet faces so faces read on top. */}
        {countertopMaterialId && (() => {
          const mat = countertopMaterial(countertopMaterialId);
          const surfaces = countertopSurfaces(cabinets, room, island);
          if (surfaces.length === 0) return null;
          return (
            <div className="pointer-events-none absolute inset-0 z-[2]">
              {surfaces.map((s, i) => (
                <div
                  key={`ct${i}`}
                  className="absolute"
                  style={{
                    left: s.x * ppi,
                    top: s.y * ppi,
                    width: s.width * ppi,
                    height: s.depth * ppi,
                    background: mat.fill,
                    border: `1px solid ${mat.edge}`,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                    backgroundImage: mat.speckle
                      ? `radial-gradient(${mat.speckle} 0.5px, transparent 0.6px)`
                      : undefined,
                    backgroundSize: mat.speckle ? "6px 6px" : undefined,
                    opacity: 0.92,
                  }}
                />
              ))}
            </div>
          );
        })()}

        {/* Sink + faucet fixtures — drawn on top of the counter. */}
        {sinks.map((s) => {
          const isSel = s.uid === selectedSinkUid;
          return (
            <div
              key={s.uid}
              onPointerDown={(e) => onSinkPointerDown(e, s)}
              onPointerMove={onSinkPointerMove}
              onPointerUp={onSinkPointerUp}
              className={`absolute z-[3] ${onMoveSink && !layoutLocked ? "cursor-move" : ""}`}
              style={{
                left: s.x * ppi,
                top: s.y * ppi,
                width: s.width * ppi,
                height: s.depth * ppi,
              }}
              title={`${SINK_PRESETS[s.type].name} — drag to position`}
            >
              {/* basin */}
              <div
                className="absolute inset-0 rounded-[3px]"
                style={{
                  background: "#d7dde2",
                  border: isSel ? "2px solid #1a2744" : "1.5px solid #8b949c",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.18)",
                }}
              />
              {s.type === "double" && (
                <div className="absolute top-[12%] bottom-[12%] left-1/2 w-px -translate-x-1/2" style={{ background: "#8b949c" }} />
              )}
              {/* faucet — a small fixture centered behind the basin */}
              {s.faucet && (
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ top: -5, width: Math.max(4, 3 * ppi), height: Math.max(4, 4 * ppi), background: "#5b636b", borderRadius: 2 }}
                />
              )}
            </div>
          );
        })}

        {/* Island zone guide — sits beneath cabinets so items placed inside show on top */}
        {island && (
          <div
            onPointerDown={(e) => onIslandPointerDown(e, "move")}
            onPointerMove={onIslandPointerMove}
            onPointerUp={onIslandPointerUp}
            className="absolute z-[1] cursor-move"
            style={{
              left: island.x * ppi,
              top: island.y * ppi,
              width: island.width * ppi,
              height: island.depth * ppi,
              border: "2px dashed #d4a75a",
              background: "rgba(212,167,90,0.10)",
              borderRadius: 3,
            }}
            title="Island zone — drag to move, corner handle to resize"
          >
            <span className="absolute left-1 top-1 text-[9px] font-bold tracking-wide text-[#a87f33] bg-white/70 px-1 rounded pointer-events-none">
              ISLAND {Math.round(island.width)}″×{Math.round(island.depth)}″
            </span>
            <div
              onPointerDown={(e) => onIslandPointerDown(e, "resize")}
              onPointerMove={onIslandPointerMove}
              onPointerUp={onIslandPointerUp}
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-sm bg-[#d4a75a] border border-white shadow cursor-nwse-resize"
            />
          </div>
        )}
        {/* Doors & Windows on the room walls */}
        {openings.map((o) => {
          const horizontal = o.side === "top" || o.side === "bottom";
          const isSel = o.uid === selectedOpeningUid;
          const isDoor = o.kind === "door";
          // Wall band thickness in px (how far the opening graphic extends into the room).
          const band = 10;
          const lenPx = o.width * ppi;
          const offPx = o.offset * ppi;
          const style: React.CSSProperties = horizontal
            ? {
                left: offPx,
                width: lenPx,
                height: band,
                top: o.side === "top" ? -band / 2 : roomPxH - band / 2,
              }
            : {
                top: offPx,
                height: lenPx,
                width: band,
                left: o.side === "left" ? -band / 2 : roomPxW - band / 2,
              };
          return (
            <div
              key={o.uid}
              onPointerDown={(e) => onOpeningPointerDown(e, o, "move")}
              onPointerMove={onOpeningPointerMove}
              onPointerUp={onOpeningPointerUp}
              className={`group absolute z-[15] flex items-center justify-center ${onOpeningChange ? "cursor-move" : ""}`}
              style={{
                ...style,
                background: isDoor ? "#9b6a3c" : "#7fb4d6",
                border: isSel ? "2px solid #1a2744" : "1px solid rgba(0,0,0,0.35)",
                boxShadow: isSel ? "0 0 0 3px rgba(212,167,90,0.5)" : undefined,
                borderRadius: 2,
              }}
              title={`${o.label} (${Math.round(o.width)}" wide) — drag to move`}
            >
              <span
                className="pointer-events-none whitespace-nowrap text-[8px] font-bold text-white drop-shadow"
                style={{ transform: horizontal ? "none" : "rotate(-90deg)" }}
              >
                {isDoor ? "DOOR" : "WIN"} {Math.round(o.width)}"
              </span>
              {/* width-resize handle at the far end */}
              {onOpeningChange && (
                <div
                  onPointerDown={(e) => onOpeningPointerDown(e, o, "resize")}
                  onPointerMove={onOpeningPointerMove}
                  onPointerUp={onOpeningPointerUp}
                  className="absolute h-3 w-3 rounded-sm bg-[#1a2744] border border-white shadow"
                  style={
                    horizontal
                      ? { right: -6, top: "50%", transform: "translateY(-50%)", cursor: "ew-resize" }
                      : { bottom: -6, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" }
                  }
                />
              )}
              {/* delete control when selected */}
              {isSel && onDeleteOpening && (
                <button
                  type="button"
                  aria-label="Delete opening"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onDeleteOpening(o.uid); }}
                  className="absolute -top-2.5 -right-2.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-[#dc2626] text-white shadow-md hover:bg-[#b91c1c] active:scale-95 transition"
                  style={{ transitionDuration: "120ms" }}
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              )}
            </div>
          );
        })}

        {cabinets
          .filter((c) => (showWallLayer ? true : c.placement !== "wall"))
          .map((p) => {
            const { w, d } = rotatedSize(p);
            const isWall = p.placement === "wall";
            const isSelected = p.uid === selectedUid;
            const isCorner = isCornerCabinet(p.masterCode, p.description);
            const isDiagonal = isDiagonalCorner(p.masterCode, p.description);
            const isBlind = isBlindCorner(p.masterCode, p.description);
            const isPicked = measurePicks.includes(p.uid);
            const isAppliance = p.placement === "appliance";
            const faceFill = isAppliance ? "#b9bdc4" : finish.face;
            const edgeColor = isAppliance ? "#8a8f96" : finish.edge;
            const collides = hasCollision(
              p,
              cabinets.filter((c) => c.placement === p.placement)
            );
            const inConflict = conflictUids?.has(p.uid) ?? false;
            return (
              <div
                key={p.uid}
                onPointerDown={(e) => handlePointerDown(e, p)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onContextMenu={
                  isWall && onDropToFloor
                    ? (e) => {
                        e.preventDefault();
                        onSelect(p.uid);
                        onDropToFloor(p.uid);
                      }
                    : undefined
                }
                className={`group absolute transition-shadow ${
                  measureMode ? "cursor-crosshair" : "cursor-move"
                } ${isSelected ? "z-20" : isWall ? "z-10" : "z-0"}`}
                style={{
                  left: p.x * ppi,
                  top: p.y * ppi,
                  width: w * ppi,
                  height: d * ppi,
                  background: isWall
                    ? `repeating-linear-gradient(45deg, ${edgeColor}33, ${edgeColor}33 6px, ${edgeColor}55 6px, ${edgeColor}55 12px), ${faceFill}`
                    : faceFill,
                  border: inConflict
                    ? "2.5px solid #dc2626"
                    : isPicked
                    ? "2px solid #d4a75a"
                    : isSelected
                    ? "2px solid #1a2744"
                    : collides
                    ? "2px solid #dc2626"
                    : isWall
                    ? `1.5px dashed ${edgeColor}`
                    : `1.5px solid ${edgeColor}`,
                  boxShadow: inConflict
                    ? "0 0 0 3px rgba(220,38,38,0.45)"
                    : isPicked
                    ? "0 0 0 3px rgba(212,167,90,0.55)"
                    : isSelected
                    ? "0 0 0 3px rgba(212,167,90,0.5)"
                    : undefined,
                  borderRadius: isCorner ? 0 : 2,
                  clipPath: isDiagonal
                    ? diagonalCornerClipPath(p.rotation)
                    : isCorner
                    ? cornerClipPath(p.rotation, cornerLegRatioForPlaced(p))
                    : undefined,
                }}
                title={`${p.masterCode} — ${p.description}`}
              >
                <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden px-0.5">
                  <span className="text-[9px] font-bold text-[#1a2744] leading-none truncate max-w-full">
                    {p.masterCode}
                  </span>
                  <span className="text-[7px] text-[#5a4a2f] leading-none mt-0.5">
                    {Math.round(p.width)}"
                  </span>
                </div>
                {!isWall && !isCorner && (
                  <div
                    className="absolute bottom-0 left-0 right-0 border-b-2 border-[#8a6d3b]/40"
                    style={{ height: 2 }}
                  />
                )}
                {/* Hinge-side marker: a short bar on the hinge edge of the door
                    face so the shop can see Left vs Right swing at a glance. */}
                {(() => {
                  const sw = resolveSwing(p);
                  if (sw !== "left" && sw !== "right") return null;
                  return (
                    <div
                      className="absolute top-1/2 z-10 -translate-y-1/2 rounded bg-[#1a2744]"
                      style={{
                        [sw === "left" ? "left" : "right"]: 1,
                        width: 2,
                        height: "55%",
                      } as React.CSSProperties}
                      title={sw === "left" ? "Left hinge" : "Right hinge"}
                    />
                  );
                })()}
                {/* Blind corners need a corner filler strip for door clearance — show
                    a hatched gap marker on the inside edge so the layout reads correctly. */}
                {isBlind && (
                  <div
                    className="absolute top-0 bottom-0 right-0 z-10"
                    style={{
                      width: Math.max(3, 3 * ppi),
                      background:
                        "repeating-linear-gradient(45deg, #d4a75a 0, #d4a75a 2px, transparent 2px, transparent 5px)",
                      borderLeft: "1px dashed #8a6d3b",
                    }}
                    title={`Corner filler (3") — included for door clearance`}
                  />
                )}
                {/* Always-available delete control on the selected cabinet. */}
                {isSelected && !measureMode && onDelete && (
                  <button
                    type="button"
                    aria-label="Delete cabinet"
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); onDelete(p.uid); }}
                    className="absolute -top-2.5 -right-2.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-[#dc2626] text-white shadow-md hover:bg-[#b91c1c] active:scale-95 transition"
                    style={{ transitionDuration: "120ms" }}
                  >
                    <X className="h-3 w-3" strokeWidth={3} />
                  </button>
                )}
              </div>
            );
          })}

        {/* Live drag tape-measure: two-sided clearance along the wall */}
        {dragTape && (() => {
          const { m, horizontal, crossPx, startPx, endPx } = dragTape;
          const beforePx = m.before * ppi;
          const afterPx = m.after * ppi;
          // Endpoints of the two dimension segments along the run axis.
          const beforeFrom = startPx - beforePx;
          const afterTo = endPx + afterPx;
          const tick = 5; // half-length of the end ticks
          const segs: { a: number; b: number; mid: number; val: number; show: boolean }[] = [
            { a: beforeFrom, b: startPx, mid: (beforeFrom + startPx) / 2, val: m.before, show: m.before > 0.5 },
            { a: endPx, b: afterTo, mid: (endPx + afterTo) / 2, val: m.after, show: m.after > 0.5 },
          ];
          return (
            <>
              <svg className="pointer-events-none absolute inset-0 z-40 overflow-visible" width={roomPxW} height={roomPxH}>
                {segs.map((s, i) => {
                  if (!s.show) return null;
                  if (horizontal) {
                    return (
                      <g key={i} stroke="#1a2744" strokeWidth={1.25}>
                        <line x1={s.a} y1={crossPx} x2={s.b} y2={crossPx} />
                        <line x1={s.a} y1={crossPx - tick} x2={s.a} y2={crossPx + tick} />
                        <line x1={s.b} y1={crossPx - tick} x2={s.b} y2={crossPx + tick} />
                      </g>
                    );
                  }
                  return (
                    <g key={i} stroke="#1a2744" strokeWidth={1.25}>
                      <line x1={crossPx} y1={s.a} x2={crossPx} y2={s.b} />
                      <line x1={crossPx - tick} y1={s.a} x2={crossPx + tick} y2={s.a} />
                      <line x1={crossPx - tick} y1={s.b} x2={crossPx + tick} y2={s.b} />
                    </g>
                  );
                })}
              </svg>
              {segs.map((s, i) =>
                s.show ? (
                  <div
                    key={i}
                    className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded bg-[#1a2744] px-1.5 py-0.5 text-[10px] font-semibold text-white shadow whitespace-nowrap"
                    style={horizontal ? { left: s.mid, top: crossPx } : { left: crossPx, top: s.mid }}
                  >
                    {formatInches(s.val)}
                  </div>
                ) : null
              )}
            </>
          );
        })()}

        {/* Tape-measure dimension line */}
        {measure && (
          <svg
            className="pointer-events-none absolute inset-0 z-40 overflow-visible"
            width={roomPxW}
            height={roomPxH}
          >
            <line
              x1={measure.ax} y1={measure.ay} x2={measure.bx} y2={measure.by}
              stroke="#1a2744" strokeWidth={1.5} strokeDasharray="5 3"
            />
            <circle cx={measure.ax} cy={measure.ay} r={3.5} fill="#d4a75a" stroke="#1a2744" strokeWidth={1} />
            <circle cx={measure.bx} cy={measure.by} r={3.5} fill="#d4a75a" stroke="#1a2744" strokeWidth={1} />
          </svg>
        )}
        {measure && (
          <div
            className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded bg-[#1a2744] px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
            style={{ left: measure.midX, top: measure.midY }}
          >
            {formatInches(measure.distIn)}
          </div>
        )}

        {xTicks.map((t) => (
          <div
            key={`x${t}`}
            className="absolute top-0 text-[8px] text-muted-foreground/60"
            style={{ left: t * ppi - 6, top: -16 }}
          >
            {t / 12}'
          </div>
        ))}
        {yTicks.map((t) => (
          <div
            key={`y${t}`}
            className="absolute text-[8px] text-muted-foreground/60"
            style={{ top: t * ppi - 4, left: -18 }}
          >
            {t / 12}'
          </div>
        ))}
      </div>

      {hoverSnap && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#1a2744] text-white text-xs px-3 py-1 rounded-full shadow-lg z-30">
          Snapped to wall
        </div>
      )}

      {measureMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#d4a75a] text-[#1a2744] text-xs font-semibold px-3 py-1 rounded-full shadow-lg z-30">
          {measurePicks.length === 0
            ? "Measure: click the first cabinet"
            : measurePicks.length === 1
            ? "Measure: click the second cabinet"
            : "Distance shown — click a cabinet to re-measure"}
        </div>
      )}

      <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground bg-white/80 px-2 py-1 rounded">
        {(() => {
          const w = inchesToFeetInches(room.width);
          const h = inchesToFeetInches(room.depth);
          const f = (v: { feet: number; inches: number }) => (v.inches ? `${v.feet}'${v.inches}"` : `${v.feet}'`);
          return `${f(w)} × ${f(h)} room`;
        })()}
      </div>
    </div>
  );
}
