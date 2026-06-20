import { useRef, useState, useCallback, useEffect } from "react";
import {
  PlacedCabinet, RoomData, rotatedSize, snapPosition, hasCollision,
  isCornerCabinet, cornerClipPath, formatInches,
  WallOpening, clampOpening, FinishColors, DEFAULT_FINISH_COLORS,
  clampRoomInches, inchesToFeetInches, WallSide, WALL_LABELS,
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
}

export function PlanCanvas({
  room, cabinets, selectedUid, onSelect, onMove, onDelete, onDropNew,
  showWallLayer, measureMode = false, island = null, onIslandChange,
  openings = [], selectedOpeningUid = null, onSelectOpening, onOpeningChange, onDeleteOpening,
  finish = DEFAULT_FINISH_COLORS,
  drawMode = false, onDrawRoom,
  activeWall, onSelectWall, onResizeWall,
}: Props) {
  // Door/window drag along its wall (move) or width-resize.
  const openingDrag = useRef<
    | { mode: "move" | "resize"; startX: number; startY: number; orig: WallOpening }
    | null
  >(null);

  const onOpeningPointerDown = (e: React.PointerEvent, o: WallOpening, mode: "move" | "resize") => {
    if (!onOpeningChange) return;
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
    if (!island || !onIslandChange) return;
    e.stopPropagation();
    islandDrag.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...island } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onIslandPointerMove = (e: React.PointerEvent) => {
    const d = islandDrag.current;
    if (!d || !island || !onIslandChange) return;
    const dxIn = (e.clientX - d.startX) / ppiRef.current;
    const dyIn = (e.clientY - d.startY) / ppiRef.current;
    if (d.mode === "move") {
      const x = Math.max(0, Math.min(d.orig.x + dxIn, room.width - d.orig.width));
      const y = Math.max(0, Math.min(d.orig.y + dyIn, room.depth - d.orig.depth));
      onIslandChange({ ...d.orig, x, y });
    } else {
      const width = Math.max(18, Math.min(d.orig.width + dxIn, room.width - d.orig.x));
      const depth = Math.max(18, Math.min(d.orig.depth + dyIn, room.depth - d.orig.y));
      onIslandChange({ ...d.orig, width, depth });
    }
  };

  const onIslandPointerUp = (e: React.PointerEvent) => {
    if (islandDrag.current) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    islandDrag.current = null;
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
    onDrawRoom({ width, depth });
  };

  // ─── Wall drag-to-resize gesture ───────────────────────────────────────────
  const onWallPointerDown = (e: React.PointerEvent, side: WallSide) => {
    e.stopPropagation();
    onSelectWall?.(side);
    if (!onResizeWall) return;
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
          const band = 14;
          const wstyle: React.CSSProperties = horizontal
            ? {
                left: 0,
                width: roomPxW,
                height: band,
                top: side === "top" ? 0 : roomPxH - band,
                cursor: onResizeWall ? "ns-resize" : "pointer",
              }
            : {
                top: 0,
                height: roomPxH,
                width: band,
                left: side === "left" ? 0 : roomPxW - band,
                cursor: onResizeWall ? "ew-resize" : "pointer",
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
                  {WALL_LABELS[side].toUpperCase()} — drag to resize
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
            const isPicked = measurePicks.includes(p.uid);
            const isAppliance = p.placement === "appliance";
            const faceFill = isAppliance ? "#b9bdc4" : finish.face;
            const edgeColor = isAppliance ? "#8a8f96" : finish.edge;
            const collides = hasCollision(
              p,
              cabinets.filter((c) => c.placement === p.placement)
            );
            return (
              <div
                key={p.uid}
                onPointerDown={(e) => handlePointerDown(e, p)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
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
                  border: isPicked
                    ? "2px solid #d4a75a"
                    : isSelected
                    ? "2px solid #1a2744"
                    : collides
                    ? "2px solid #dc2626"
                    : isWall
                    ? `1.5px dashed ${edgeColor}`
                    : `1.5px solid ${edgeColor}`,
                  boxShadow: isPicked
                    ? "0 0 0 3px rgba(212,167,90,0.55)"
                    : isSelected
                    ? "0 0 0 3px rgba(212,167,90,0.5)"
                    : undefined,
                  borderRadius: isCorner ? 0 : 2,
                  clipPath: isCorner ? cornerClipPath(p.rotation) : undefined,
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
