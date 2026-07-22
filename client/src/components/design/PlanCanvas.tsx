import { useRef, useState, useCallback, useEffect } from "react";
import {
  PlacedCabinet, RoomData, rotatedSize, placedFootprint, snapPosition, orientToWall, hasCollision,
  isCornerCabinet, cornerClipPath, cornerLegRatioForPlaced, cornerRotationForPlaced, diagonalCornerClipPath, isDiagonalCorner, formatInches, isBlindCorner,
  resolveSwing,
  WallOpening, clampOpening, FinishColors, DEFAULT_FINISH_COLORS,
  clampRoomInches, inchesToFeetInches, WallSide,
  cabinetWall, wallSpanMeasure,
  countertopSurfaces, countertopMaterial, type SinkFixture, SINK_PRESETS,
  wallGaps, type WallGap,
  type DesignCabinet,
  type PlacedFurniture, FURNITURE_CATALOG, furnitureFootprint,
  flooringMaterial,
  type PlanAnnotation,
  wallDimensions, type DimensionSeg,
  type PonyWall, clampPonyWall,
} from "@/lib/design";
import { X, RotateCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

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
  onMove: (uid: string, x: number, y: number, rotation?: number) => void;
  onDelete?: (uid: string) => void;
  // Rotate the selected cabinet 90° in place (touch-friendly on-canvas handle).
  onRotate?: (uid: string) => void;
  // Right-click a cabinet to open its per-cabinet attributes dialog.
  onOpenAttributes?: (uid: string) => void;
  onDropNew?: (clientX: number, clientY: number, canvasRect: DOMRect, ppi: number) => void;
  showWallLayer: boolean;
  measureMode?: boolean;
  /** When true, show dimension lines for all gaps on all walls simultaneously. */
  autoDimensions?: boolean;
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
  // Optional per-cabinet finish resolver for TWO-TONE designs. When provided,
  // each cabinet is drawn in its own finish; otherwise the single `finish`
  // prop is used for every cabinet.
  finishFor?: (cab: PlacedCabinet) => FinishColors;
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
  // Furniture (tables, chairs, stools) — floor-plan-only space planning items.
  furniture?: import("@/lib/design").PlacedFurniture[];
  selectedFurnUid?: string | null;
  onSelectFurn?: (uid: string | null) => void;
  onMoveFurn?: (uid: string, x: number, y: number) => void;
  onDeleteFurn?: (uid: string) => void;
  onRotateFurn?: (uid: string) => void;
  // Flooring: when set, draw a flooring pattern texture on the room floor.
  flooringMaterialId?: string | null;
  // Cabinet lock: when true, cabinet drag/drop/delete are blocked.
  cabinetsLocked?: boolean;
  // Gap intelligence: one representative real cabinet per width (keyed by width
  // in inches) sourced from the active palette, used to suggest cabinets that
  // fit a measured gap. When onFillGap is provided the popover rows become
  // click-to-place actions.
  gapFillCandidates?: Map<number, DesignCabinet>;
  onFillGap?: (gap: WallGap, cabinet: DesignCabinet) => void;
  onPlaceFiller?: (gap: WallGap) => void;
  /** Place a cabinet + auto-sized filler in a gap as a combo. */
  onFillGapWithCabAndFiller?: (gap: WallGap, cabinet: DesignCabinet) => void;
  // Text annotations placed on the floor plan by the user.
  annotations?: PlanAnnotation[];
  selectedAnnotationUid?: string | null;
  onSelectAnnotation?: (uid: string | null) => void;
  onMoveAnnotation?: (uid: string, x: number, y: number) => void;
  onDeleteAnnotation?: (uid: string) => void;
  // Pony walls — free-standing half-walls (34.5" tall by default) placed on the floor plan.
  ponyWalls?: PonyWall[];
  selectedPonyWallUid?: string | null;
  onSelectPonyWall?: (uid: string | null) => void;
  onPonyWallChange?: (pw: PonyWall) => void;
  onDeletePonyWall?: (uid: string) => void;
}

// Compute a readable label color for text drawn directly on a cabinet fill.
// Parses a #rgb/#rrggbb hex fill, estimates perceived luminance, and returns
// dark ink on light fills / light ink on dark fills, plus a matching subtle
// text-shadow so the ID stays legible on any finish.
function readableLabel(fillHex: string): { color: string; shadow: string; isDarkFill: boolean } {
  let hex = (fillHex || "").trim().replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Fallback: treat unparseable fills as light.
  const valid = hex.length === 6 && [r, g, b].every((n) => !Number.isNaN(n));
  const lum = valid ? (0.299 * r + 0.587 * g + 0.114 * b) / 255 : 1;
  const isDarkFill = lum < 0.55;
  return isDarkFill
    ? { color: "#f8fafc", shadow: "0 1px 2px rgba(0,0,0,0.65)", isDarkFill }
    : { color: "#1a2744", shadow: "0 1px 1px rgba(255,255,255,0.55)", isDarkFill };
}

export function PlanCanvas({
  room, cabinets, selectedUid, onSelect, onMove, onDelete, onRotate, onOpenAttributes, onDropNew, onDropToFloor,
  showWallLayer, measureMode = false, autoDimensions = false, island = null, onIslandChange, onIslandMove,
  openings = [], selectedOpeningUid = null, onSelectOpening, onOpeningChange, onDeleteOpening,
  finish = DEFAULT_FINISH_COLORS,
  drawMode = false, onDrawRoom,
  activeWall, onSelectWall, onResizeWall, conflictUids,
  layoutLocked = false, lockedWalls,
  countertopMaterialId = null, sinks = [], selectedSinkUid = null, onSelectSink, onMoveSink,
  finishFor,
  furniture = [], selectedFurnUid = null, onSelectFurn, onMoveFurn, onDeleteFurn, onRotateFurn,
  flooringMaterialId = null,
  cabinetsLocked = false,
  gapFillCandidates,
  onFillGap,
  onPlaceFiller,
  onFillGapWithCabAndFiller,
  annotations = [], selectedAnnotationUid = null, onSelectAnnotation, onMoveAnnotation, onDeleteAnnotation,
  ponyWalls = [], selectedPonyWallUid = null, onSelectPonyWall, onPonyWallChange, onDeletePonyWall,
}: Props) {
  const { t } = useLanguage();
  // Localized wall names (Back/Front/Left/Right) for on-canvas labels.
  const wallLabel: Record<WallSide, string> = {
    top: t("plan_wall_back"), bottom: t("plan_wall_front"), left: t("plan_wall_left"), right: t("plan_wall_right"),
  };
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
  // Gap intelligence: which gap label was clicked (shows fill suggestions).
  const [activeGap, setActiveGap] = useState<WallGap | null>(null);
  // Furniture drag state.
  const furnDrag = useRef<{ uid: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const onFurnPointerDown = (e: React.PointerEvent, f: PlacedFurniture) => {
    e.stopPropagation();
    onSelectFurn?.(f.uid);
    furnDrag.current = { uid: f.uid, startX: e.clientX, startY: e.clientY, origX: f.x, origY: f.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onFurnPointerMove = (e: React.PointerEvent) => {
    const d = furnDrag.current;
    if (!d || !onMoveFurn) return;
    const placed = furniture.find((f) => f.uid === d.uid);
    const def = placed ? FURNITURE_CATALOG.find((fd) => fd.id === placed.defId) : undefined;
    const fp = (def && placed) ? furnitureFootprint(placed, def) : { w: 24, d: 24 };
    const dx = (e.clientX - d.startX) / ppiRef.current;
    const dy = (e.clientY - d.startY) / ppiRef.current;
    const x = Math.max(0, Math.min(d.origX + dx, room.width - fp.w));
    const y = Math.max(0, Math.min(d.origY + dy, room.depth - fp.d));
    onMoveFurn(d.uid, x, y);
  };
  const onFurnPointerUp = (e: React.PointerEvent) => {
    if (furnDrag.current) { try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ } }
    furnDrag.current = null;
  };

  // ── Annotation drag ──
  const annDrag = useRef<{ uid: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const onAnnPointerDown = (e: React.PointerEvent, a: PlanAnnotation) => {
    e.stopPropagation();
    onSelectAnnotation?.(a.uid);
    annDrag.current = { uid: a.uid, startX: e.clientX, startY: e.clientY, origX: a.x, origY: a.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onAnnPointerMove = (e: React.PointerEvent) => {
    const d = annDrag.current;
    if (!d || !onMoveAnnotation) return;
    const dx = (e.clientX - d.startX) / ppiRef.current;
    const dy = (e.clientY - d.startY) / ppiRef.current;
    const x = Math.max(0, Math.min(d.origX + dx, room.width));
    const y = Math.max(0, Math.min(d.origY + dy, room.depth));
    onMoveAnnotation(d.uid, x, y);
  };
  const onAnnPointerUp = (e: React.PointerEvent) => {
    if (annDrag.current) { try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ } }
    annDrag.current = null;
  };

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

  // Manual double-tap detector (iOS Safari does not reliably synthesize
  // dblclick from two quick taps). A second tap on the same cabinet within
  // ~320ms opens the attributes editor; a single tap only selects.
  const lastTapRef = useRef<{ uid: string; t: number }>({ uid: "", t: 0 });

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
    // Double-tap / double-click → open the attributes editor.
    const now = Date.now();
    const last = lastTapRef.current;
    if (onOpenAttributes && last.uid === p.uid && now - last.t < 320) {
      lastTapRef.current = { uid: "", t: 0 };
      onOpenAttributes(p.uid);
      return;
    }
    lastTapRef.current = { uid: p.uid, t: now };
    // When cabinets are locked, allow selection but not dragging.
    if (cabinetsLocked) return;
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

      let candidate: PlacedCabinet = { ...cabinet, x: rawX, y: rawY };
      // Auto-rotate: if the cabinet is meeting a wall, turn it so its back is to
      // that wall BEFORE snapping, so the snapped x/y use the turned footprint.
      // Include appliances in the others list so dragged cabinets push against
      // appliances (fridge, range, dishwasher, etc.) and don't slide through them.
      const others = cabinets.filter(
        (c) => c.uid !== cabinet.uid &&
          (c.placement === cabinet.placement || c.placement === "appliance" || cabinet.placement === "appliance")
      );
      const targetRot = orientToWall(candidate, room, island);
      if (targetRot != null) {
        candidate = { ...candidate, rotation: targetRot };
      }
      const snapped = snapPosition(candidate, room, others, island);
      setHoverSnap(snapped.snappedWall || snapped.snappedIsland);
      onMove(dragUid, snapped.x, snapped.y, targetRot ?? undefined);
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
  // The tape shows while a cabinet is being dragged AND, for convenience, when a
  // cabinet is simply selected (idle) so the designer can read the clearance to
  // each neighbor/wall without nudging it. Drag takes priority.
  const tapeUid = dragUid ?? (measureMode ? null : selectedUid);
  const dragTape = (() => {
    if (!tapeUid) return null;
    const p = cabinets.find((c) => c.uid === tapeUid);
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
      onClick={(e) => { if (!measureMode && !drawMode && e.target === e.currentTarget) { onSelect(null); onSelectPonyWall?.(null); } }}
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
        className="absolute shadow-inner"
        style={{
          width: roomPxW,
          height: roomPxH,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          border: "3px solid #1a2744",
          backgroundColor: flooringMaterialId
            ? flooringMaterial(flooringMaterialId).fill
            : "#ffffff",
          backgroundImage: (() => {
            if (!flooringMaterialId) {
              return "linear-gradient(#f1f4f8 1px, transparent 1px), linear-gradient(90deg, #f1f4f8 1px, transparent 1px)";
            }
            const fm = flooringMaterial(flooringMaterialId);
            const tw = Math.max(6, fm.tileW * ppi);
            const th = Math.max(6, fm.tileH * ppi);
            if (fm.pattern === "hardwood" || fm.pattern === "plank") {
              // Staggered planks (brick-lay pattern): alternate rows offset by 1/3 plank width.
              // Uses an inline SVG tile that spans 2 rows with offset seams.
              const g = fm.grout; // raw color value, encoded once with the whole SVG
              const offset = Math.round(tw / 3);
              const h2 = th * 2; // tile covers 2 rows
              const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tw}' height='${h2}'>`
                + `<rect x='0' y='0' width='${tw}' height='${h2}' fill='none'/>`
                // Row separators
                + `<line x1='0' y1='0' x2='${tw}' y2='0' stroke='${g}' stroke-width='1'/>`
                + `<line x1='0' y1='${th}' x2='${tw}' y2='${th}' stroke='${g}' stroke-width='1'/>`
                // Vertical seams: row 1 at 0, row 2 offset by 1/3
                + `<line x1='0' y1='0' x2='0' y2='${th}' stroke='${g}' stroke-width='1'/>`
                + `<line x1='${offset}' y1='${th}' x2='${offset}' y2='${h2}' stroke='${g}' stroke-width='1'/>`
                + `</svg>`;
              return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
            }
            if (fm.pattern === "tile-grid" || fm.pattern === "tile-diagonal") {
              return `repeating-linear-gradient(0deg, ${fm.grout} 0px, ${fm.grout} 1px, transparent 1px, transparent ${th}px), repeating-linear-gradient(90deg, ${fm.grout} 0px, ${fm.grout} 1px, transparent 1px, transparent ${tw}px)`;
            }
            if (fm.pattern === "tile-stagger") {
              // Brick-lay for rectangular tiles: offset every other row by half tile width.
              const g = fm.grout;
              const offset = Math.round(tw / 2);
              const h2 = th * 2;
              const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tw}' height='${h2}'>`
                + `<rect x='0' y='0' width='${tw}' height='${h2}' fill='none'/>`
                + `<line x1='0' y1='0' x2='${tw}' y2='0' stroke='${g}' stroke-width='1'/>`
                + `<line x1='0' y1='${th}' x2='${tw}' y2='${th}' stroke='${g}' stroke-width='1'/>`
                + `<line x1='0' y1='0' x2='0' y2='${th}' stroke='${g}' stroke-width='1'/>`
                + `<line x1='${offset}' y1='${th}' x2='${offset}' y2='${h2}' stroke='${g}' stroke-width='1'/>`
                + `</svg>`;
              return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
            }
            if (fm.pattern === "herringbone") {
              return `repeating-linear-gradient(45deg, ${fm.grout} 0px, ${fm.grout} 1px, transparent 1px, transparent ${th}px), repeating-linear-gradient(-45deg, ${fm.grout} 0px, ${fm.grout} 1px, transparent 1px, transparent ${th}px)`;
            }
            if (fm.pattern === "chevron") {
              return `repeating-linear-gradient(60deg, ${fm.grout} 0px, ${fm.grout} 1px, transparent 1px, transparent ${th}px), repeating-linear-gradient(-60deg, ${fm.grout} 0px, ${fm.grout} 1px, transparent 1px, transparent ${th}px)`;
            }
            // solid / concrete
            return undefined;
          })(),
          backgroundSize: (() => {
            if (!flooringMaterialId) return `${12 * ppi}px ${12 * ppi}px`;
            const fm = flooringMaterial(flooringMaterialId);
            const tw = Math.max(6, fm.tileW * ppi);
            const th = Math.max(6, fm.tileH * ppi);
            // Staggered patterns use a 2-row SVG tile, so double the height.
            if (fm.pattern === "hardwood" || fm.pattern === "plank" || fm.pattern === "tile-stagger") {
              return `${tw}px ${th * 2}px`;
            }
            return `${tw}px ${th}px`;
          })(),
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
              title={t("dt_pc_wall_target", { wall: wallLabel[side] })}
            >
              {isActive && (
                <span
                  className="pointer-events-none rounded bg-[#1a2744] px-1.5 py-0.5 text-[9px] font-bold text-white shadow whitespace-nowrap"
                  style={{ transform: horizontal ? "none" : "rotate(-90deg)" }}
                >
                  {wallLabel[side].toUpperCase()}{wallLocked ? t("dt_pc_wall_locked_suffix") : t("dt_pc_wall_resize_suffix")}
                </span>
              )}
              {wallLocked && !isActive && (
                <span
                  className="pointer-events-none rounded bg-[#1a2744]/80 px-1 text-[9px] font-bold text-[#d4a75a] shadow"
                  style={{ transform: horizontal ? "none" : "rotate(-90deg)" }}
                  title={t("dt_pc_wall_is_locked", { wall: wallLabel[side] })}
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
              title={t("dt_pc_sink_drag", { name: s.pelicanProductName || SINK_PRESETS[s.type].name })}
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
            title={t("dt_pc_island_zone")}
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
        {/* Pony walls — free-standing half-walls rendered as solid dark rectangles */}
        {ponyWalls.map((pw) => {
          const isPonySelected = pw.uid === selectedPonyWallUid;
          return (
            <div
              key={pw.uid}
            className="absolute group touch-none"
            style={{
              left: pw.x * ppi,
              top: pw.y * ppi,
              width: pw.width * ppi,
              height: pw.depth * ppi,
              background: "#2a3550",
              border: isPonySelected ? "2px solid #f59e0b" : "2px solid #1a2744",
              borderRadius: 2,
              cursor: layoutLocked ? "default" : "move",
              zIndex: isPonySelected ? 20 : 2,
              boxShadow: isPonySelected ? "0 0 0 2px rgba(245,158,11,0.4)" : undefined,
            }}
            title={`Pony Wall ${Math.round(pw.width)}\u2033 wide × ${pw.height}\u2033 tall`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectPonyWall?.(pw.uid);
              if (layoutLocked || !onPonyWallChange) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
              const startX = (e.clientX - rect.left) / ppi;
              const startY = (e.clientY - rect.top) / ppi;
              const origX = pw.x; const origY = pw.y;
              const el = e.currentTarget as HTMLElement;
              const onMove = (ev: PointerEvent) => {
                const dx = (ev.clientX - rect.left) / ppi - startX;
                const dy = (ev.clientY - rect.top) / ppi - startY;
                const updated = clampPonyWall({ ...pw, x: origX + dx, y: origY + dy }, room);
                onPonyWallChange(updated);
              };
              const onUp = () => {
                try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                el.removeEventListener("pointermove", onMove as EventListener);
                el.removeEventListener("pointerup", onUp);
              };
              el.addEventListener("pointermove", onMove as EventListener);
              el.addEventListener("pointerup", onUp);
            }}
            >
              <span className="absolute left-1 top-0.5 text-[8px] font-bold tracking-wide text-white/80 pointer-events-none whitespace-nowrap">
                {pw.label || `PONY ${Math.round(pw.width)}″`}
              </span>
              <span className="absolute right-0.5 top-0.5 text-[8px] text-white/60 pointer-events-none">{pw.height}″H</span>
              {/* Delete button — shown when selected or on hover */}
              {onDeletePonyWall && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onDeletePonyWall(pw.uid); onSelectPonyWall?.(null); }}
                  className={`absolute -top-2.5 -right-2.5 h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[9px] shadow z-10 ${isPonySelected ? "flex" : "hidden group-hover:flex"}`}
                >
                  ×
                </button>
              )}
              {/* Resize handle */}
              {onPonyWallChange && !layoutLocked && (
                <div
                  className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-sm bg-[#4a6090] border border-white shadow cursor-nwse-resize z-10"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    const rect = (e.currentTarget as HTMLElement).closest(".absolute")!.parentElement!.getBoundingClientRect();
                    const startX = (e.clientX - rect.left) / ppi;
                    const startY = (e.clientY - rect.top) / ppi;
                    const origW = pw.width; const origD = pw.depth;
                    const el = e.currentTarget as HTMLElement;
                    const onMove = (ev: PointerEvent) => {
                      const dx = (ev.clientX - rect.left) / ppi - startX;
                      const dy = (ev.clientY - rect.top) / ppi - startY;
                      const newW = Math.max(6, origW + dx);
                      const newD = Math.max(4, origD + dy);
                      const updated = clampPonyWall({ ...pw, width: newW, depth: newD }, room);
                      onPonyWallChange(updated);
                    };
                    const onUp = () => {
                      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                      el.removeEventListener("pointermove", onMove as EventListener);
                      el.removeEventListener("pointerup", onUp);
                    };
                    el.addEventListener("pointermove", onMove as EventListener);
                    el.addEventListener("pointerup", onUp);
                  }}
                />
              )}
            </div>
          );
        })}
        {/* Doors & Windows on the room walls */}
        {openings.map((o) => {
          const horizontal = o.side === "top" || o.side === "bottom";
          const isSel = o.uid === selectedOpeningUid;
          const isDoor = o.kind === "door";
          const isOpening = o.kind === "opening";
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
                background: isDoor ? "#9b6a3c" : isOpening ? "#e8eaed" : "#7fb4d6",
                border: isSel
                  ? "2px solid #1a2744"
                  : isOpening
                  ? "1px dashed rgba(90,103,112,0.85)"
                  : "1px solid rgba(0,0,0,0.35)",
                boxShadow: isSel ? "0 0 0 3px rgba(212,167,90,0.5)" : undefined,
                borderRadius: 2,
              }}
              title={t("dt_pc_opening_drag", { label: o.label, width: Math.round(o.width) })}
            >
              <span
                className={`pointer-events-none whitespace-nowrap text-[8px] font-bold drop-shadow ${isOpening ? "text-[#3a4047]" : "text-white"}`}
                style={{ transform: horizontal ? "none" : "rotate(-90deg)" }}
              >
                {isDoor ? t("dt_pc_door") : isOpening ? t("dt_pc_open") : t("dt_pc_win")} {Math.round(o.width)}"
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
                  aria-label={t("dt_pc_delete_opening")}
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
            const { w, d } = placedFootprint(p);
            const isWall = p.placement === "wall";
            const isSelected = p.uid === selectedUid;
            const isCorner = isCornerCabinet(p.masterCode, p.description);
            const isDiagonal = isDiagonalCorner(p.masterCode, p.description);
            const isBlind = isBlindCorner(p.masterCode, p.description);
            const isPicked = measurePicks.includes(p.uid);
            const isAppliance = p.placement === "appliance";
            const cabFinish = finishFor ? finishFor(p) : finish;
            const faceFill = isAppliance ? "#b9bdc4" : cabFinish.face;
            const edgeColor = isAppliance ? "#8a8f96" : cabFinish.edge;
            const lbl = readableLabel(faceFill);
            const collides = hasCollision(p, cabinets);
            const inConflict = conflictUids?.has(p.uid) ?? false;
            return (
              <div
                key={p.uid}
                onPointerDown={(e) => handlePointerDown(e, p)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onContextMenu={
                  onOpenAttributes
                    ? (e) => {
                        e.preventDefault();
                        onSelect(p.uid);
                        onOpenAttributes(p.uid);
                      }
                    : undefined
                }
                onDoubleClick={
                  onOpenAttributes
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect(p.uid);
                        onOpenAttributes(p.uid);
                      }
                    : undefined
                }
                className={`group absolute transition-shadow ${
                  measureMode ? "cursor-crosshair" : "cursor-move"
                } ${isSelected ? "z-20" : isWall ? "z-10" : isAppliance ? "z-[3]" : "z-[2]"}`}
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
                  borderRadius: (isCorner && !isBlind) ? 0 : 2,
                  clipPath: isDiagonal
                    ? diagonalCornerClipPath(cornerRotationForPlaced(p, room))
                    : (isCorner && !isBlind)
                    ? cornerClipPath(cornerRotationForPlaced(p, room), cornerLegRatioForPlaced(p))
                    : undefined,
                }}
                title={`${p.masterCode} — ${p.description}`}
              >
                <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden px-0.5 relative">
                  {/* Appliance-specific top-down icons */}
                  {isAppliance && (() => {
                    const mc = (p.masterCode || "").toUpperCase();
                    if (mc.startsWith("RANGE")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {([{cx:30,cy:30},{cx:70,cy:30},{cx:30,cy:70},{cx:70,cy:70}] as {cx:number;cy:number}[]).map((b,i)=>(
                            <g key={i}>
                              <circle cx={b.cx} cy={b.cy} r={14} fill="none" stroke="#666" strokeWidth="3"/>
                              <circle cx={b.cx} cy={b.cy} r={7} fill="none" stroke="#666" strokeWidth="2"/>
                              <circle cx={b.cx} cy={b.cy} r={2.5} fill="#555"/>
                            </g>
                          ))}
                        </svg>
                      );
                    }
                    if (mc.startsWith("FRIDGE")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={10} width={80} height={80} rx={4} fill="none" stroke="#666" strokeWidth="3"/>
                          <rect x={15} y={15} width={70} height={70} rx={2} fill="#ccc" fillOpacity={0.3}/>
                          <rect x={72} y={30} width={8} height={40} rx={3} fill="#888"/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("DW")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={10} width={80} height={80} rx={3} fill="none" stroke="#666" strokeWidth="3"/>
                          <rect x={10} y={10} width={80} height={18} rx={3} fill="#aaa" fillOpacity={0.4}/>
                          <circle cx={50} cy={55} r={22} fill="none" stroke="#888" strokeWidth="2" strokeDasharray="6 4"/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("HOOD")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <polygon points="20,20 80,20 65,80 35,80" fill="#aaa" fillOpacity={0.4} stroke="#666" strokeWidth="3"/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("MW")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={15} width={80} height={70} rx={4} fill="none" stroke="#666" strokeWidth="3"/>
                          <rect x={15} y={20} width={55} height={60} rx={2} fill="#ccc" fillOpacity={0.3}/>
                          <rect x={74} y={20} width={12} height={60} rx={2} fill="#aaa" fillOpacity={0.5}/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("WINE")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={10} width={80} height={80} rx={3} fill="none" stroke="#666" strokeWidth="3"/>
                          {([20,40,60,80] as number[]).map(y=>(
                            <line key={y} x1={10} y1={y} x2={90} y2={y} stroke="#888" strokeWidth="1.5"/>
                          ))}
                        </svg>
                      );
                    }
                    if (mc.startsWith("SINK") || mc.startsWith("FIX-BATHSINK") || mc.startsWith("FIX-LAUNDRYTUB")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={10} width={80} height={80} rx={4} fill="none" stroke="#666" strokeWidth="2"/>
                          <ellipse cx={50} cy={52} rx={32} ry={28} fill="none" stroke="#888" strokeWidth="2"/>
                          <circle cx={50} cy={52} r={5} fill="#888"/>
                          <line x1={50} y1={18} x2={50} y2={30} stroke="#888" strokeWidth="3" strokeLinecap="round"/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("FIX-TOILET")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={20} y={10} width={60} height={30} rx={4} fill="none" stroke="#666" strokeWidth="2"/>
                          <ellipse cx={50} cy={70} rx={30} ry={25} fill="none" stroke="#888" strokeWidth="2"/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("FIX-SHOWER")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={10} width={80} height={80} rx={4} fill="none" stroke="#666" strokeWidth="2"/>
                          <circle cx={50} cy={50} r={25} fill="none" stroke="#888" strokeWidth="2" strokeDasharray="5 3"/>
                          <circle cx={50} cy={50} r={5} fill="#888"/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("FIX-TUB")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={10} width={80} height={80} rx={8} fill="none" stroke="#666" strokeWidth="2"/>
                          <ellipse cx={50} cy={55} rx={32} ry={26} fill="none" stroke="#888" strokeWidth="2"/>
                          <circle cx={50} cy={20} r={5} fill="#888"/>
                        </svg>
                      );
                    }
                    if (mc.startsWith("FIX-WASHER") || mc.startsWith("FIX-DRYER")) {
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x={10} y={10} width={80} height={80} rx={4} fill="none" stroke="#666" strokeWidth="2"/>
                          <circle cx={50} cy={50} r={30} fill="none" stroke="#888" strokeWidth="2"/>
                          <circle cx={50} cy={50} r={18} fill="none" stroke="#aaa" strokeWidth="2"/>
                        </svg>
                      );
                    }
                    return null;
                  })()}
                  <span
                    className="text-[9px] font-bold leading-none truncate max-w-full relative z-10"
                    style={{ color: lbl.color, textShadow: lbl.shadow }}
                  >
                    {p.masterCode}
                  </span>
                  <span
                    className="text-[7px] leading-none mt-0.5 relative z-10"
                    style={{ color: lbl.color, opacity: 0.8, textShadow: lbl.shadow }}
                  >
                    {Math.round(p.width)}"
                  </span>
                </div>
                {!isWall && (!isCorner || isBlind) && (
                  <div
                    className="absolute bottom-0 left-0 right-0 border-b-2 border-[#8a6d3b]/40"
                    style={{ height: 2 }}
                  />
                )}
                {/* Open unit (door removed): show an "OPEN" hatch so the shop sees
                    there is no door/front on this cabinet. */}
                {p.noDoor && !isWall && !isAppliance && (
                  <div
                    className="absolute inset-1 z-10 flex items-center justify-center rounded pointer-events-none"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, #00000018 0, #00000018 3px, transparent 3px, transparent 7px)",
                    }}
                    title={t("dt_pc_open_no_door")}
                  >
                    <span className="text-[8px] font-bold tracking-wide text-[#5b6472]">{t("dt_pc_open")}</span>
                  </div>
                )}
                {/* Hinge-side marker: a short bar on the hinge edge of the door
                    face so the shop can see Left vs Right swing at a glance. */}
                {!p.noDoor && (() => {
                  const sw = resolveSwing(p);
                  if (sw !== "left" && sw !== "right") return null;
                  // Handles sit on the opening (non-hinge) edge; honor an explicit
                  // override, else default to the side opposite the hinge.
                  const hSide =
                    p.handleSide === "left" || p.handleSide === "right"
                      ? p.handleSide
                      : sw === "left"
                        ? "right"
                        : "left";
                  return (
                    <>
                      <div
                        className="absolute top-1/2 z-10 -translate-y-1/2 rounded bg-[#1a2744]"
                        style={{
                          [sw === "left" ? "left" : "right"]: 1,
                          width: 2,
                          height: "55%",
                        } as React.CSSProperties}
                        title={sw === "left" ? t("dt_pc_left_hinge") : t("dt_pc_right_hinge")}
                      />
                      <div
                        className="absolute top-1/2 z-10 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#c89b3c]"
                        style={{
                          [hSide === "left" ? "left" : "right"]: 2,
                        } as React.CSSProperties}
                        title={hSide === "left" ? t("dt_pc_handle_left") : t("dt_pc_handle_right")}
                      />
                    </>
                  );
                })()}
                {/* Blind corners need a corner filler strip for door clearance — show
                    a hatched gap marker on the inside edge so the layout reads correctly. */}

                {/* Always-available rotate control on the selected cabinet — a
                    touch-friendly handle so customers can turn a cabinet without
                    a keyboard. Turns the cabinet 90° and re-seats it. */}
                {isSelected && !measureMode && onRotate && (
                  <button
                    type="button"
                    aria-label={t("dt_pc_rotate_aria")}
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); onRotate(p.uid); }}
                    className="absolute -top-2.5 -left-2.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a2744] text-white shadow-md hover:bg-[#243456] active:scale-95 transition"
                    style={{ transitionDuration: "120ms" }}
                    title={t("dt_pc_rotate_title")}
                  >
                    <RotateCw className="h-3 w-3" strokeWidth={3} />
                  </button>
                )}
                {/* Always-available delete control on the selected cabinet. */}
                {isSelected && !measureMode && onDelete && !cabinetsLocked && (
                  <button
                    type="button"
                    aria-label={t("dt_pc_delete_cabinet")}
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); onDelete(p.uid); }}
                    className="absolute -top-2.5 -right-2.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-[#dc2626] text-white shadow-md hover:bg-[#b91c1c] active:scale-95 transition"
                    style={{ transitionDuration: "120ms" }}
                  >
                    <X className="h-3 w-3" strokeWidth={3} />
                  </button>
                )}
                {/* Lock badge: shown on selected cabinet when cabinets are locked */}
                {isSelected && !measureMode && cabinetsLocked && (
                  <div
                    className="absolute -top-2.5 -right-2.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-md"
                    title="Cabinets are locked — click 'Lock Cabs' in toolbar to unlock"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                )}
              </div>
            );
          })}

        {/* Selected-cabinet ID callout: a leader line from the cabinet out to a
            high-contrast ID chip placed just outside the nearest room edge, so
            the code is readable even when the cabinet is narrow / dark / packed
            against neighbors. Only for the selected cabinet, and skipped while
            drawing or measuring to avoid clutter. */}
        {!drawMode && !measureMode && selectedUid && (() => {
          const sel = cabinets.find((c) => c.uid === selectedUid);
          if (!sel) return null;
          const { w: fw, d: fd } = placedFootprint(sel);
          const cx = (sel.x + fw / 2) * ppi;
          const cy = (sel.y + fd / 2) * ppi;
          // Choose the nearest perimeter edge to exit toward.
          const distTop = cy, distBottom = roomPxH - cy, distLeft = cx, distRight = roomPxW - cx;
          const minD = Math.min(distTop, distBottom, distLeft, distRight);
          const gap = 26; // how far outside the wall to place the chip
          let ex = cx, ey = cy;
          if (minD === distTop) { ey = -gap; }
          else if (minD === distBottom) { ey = roomPxH + gap; }
          else if (minD === distLeft) { ex = -gap; }
          else { ex = roomPxW + gap; }
          const label = sel.masterCode;
          const horizontalExit = minD === distTop || minD === distBottom;
          return (
            <>
              <svg className="pointer-events-none absolute inset-0 z-[45] overflow-visible" width={roomPxW} height={roomPxH}>
                <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#d4a75a" strokeWidth={1.5} strokeDasharray="3 2" />
                <circle cx={cx} cy={cy} r={2.5} fill="#d4a75a" stroke="#1a2744" strokeWidth={1} />
                <polygon
                  points={
                    horizontalExit
                      ? `${ex},${ey} ${ex - 4},${ey + (ey < cy ? 6 : -6)} ${ex + 4},${ey + (ey < cy ? 6 : -6)}`
                      : `${ex},${ey} ${ex + (ex < cx ? 6 : -6)},${ey - 4} ${ex + (ex < cx ? 6 : -6)},${ey + 4}`
                  }
                  fill="#d4a75a"
                />
              </svg>
              <div
                className="pointer-events-none absolute z-[46] -translate-x-1/2 -translate-y-1/2 rounded-md bg-[#1a2744] px-2 py-0.5 text-[10px] font-bold text-white shadow-lg ring-1 ring-[#d4a75a] whitespace-nowrap"
                style={{ left: ex, top: ey }}
              >
                {label}
              </div>
            </>
          );
        })()}

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

        {/* ─── Auto-dimensions (all walls at once) ───────────────────── */}
        {autoDimensions && !dragUid && (() => {
          const sides: WallSide[] = ["top", "bottom", "left", "right"];
          const BASE_OFFSET = 22;
          const WALL_OFFSET = 38; // second row for wall cabinets
          const layers: ("base" | "wall")[] = showWallLayer ? ["base", "wall"] : ["base"];
          return (
            <svg className="pointer-events-none absolute inset-0 z-30 overflow-visible" width={roomPxW} height={roomPxH}>
              {layers.flatMap((layer) => sides.flatMap((side) => {
                const segs = wallDimensions(side, room, cabinets, layer);
                if (segs.length === 0) return [];
                const horizontal = side === "top" || side === "bottom";
                const offset = layer === "wall" ? WALL_OFFSET : BASE_OFFSET;
                const cross = side === "top" ? -offset
                  : side === "bottom" ? roomPxH + offset
                  : side === "left" ? -offset
                  : roomPxW + offset;
                const tick = 4;
                return segs.map((seg, i) => {
                  const aPx = seg.start * ppi;
                  const bPx = (seg.start + seg.length) * ppi;
                  const midPx = (aPx + bPx) / 2;
                  const color = seg.kind === "cabinet" ? "#1a2744" : "#e07b39";
                  if (seg.length < 1) return null;
                  if (horizontal) {
                    return (
                      <g key={`${side}-${i}`}>
                        <line x1={aPx} y1={cross} x2={bPx} y2={cross} stroke={color} strokeWidth={1} />
                        <line x1={aPx} y1={cross - tick} x2={aPx} y2={cross + tick} stroke={color} strokeWidth={1} />
                        <line x1={bPx} y1={cross - tick} x2={bPx} y2={cross + tick} stroke={color} strokeWidth={1} />
                        <text x={midPx} y={cross + (side === "top" ? -6 : 10)} textAnchor="middle" fontSize={8} fill={color} fontWeight={seg.kind === "gap" ? 700 : 500}>
                          {seg.label}
                        </text>
                      </g>
                    );
                  }
                  return (
                    <g key={`${side}-${i}`}>
                      <line x1={cross} y1={aPx} x2={cross} y2={bPx} stroke={color} strokeWidth={1} />
                      <line x1={cross - tick} y1={aPx} x2={cross + tick} y2={aPx} stroke={color} strokeWidth={1} />
                      <line x1={cross - tick} y1={bPx} x2={cross + tick} y2={bPx} stroke={color} strokeWidth={1} />
                      <text x={cross + (side === "left" ? -6 : 6)} y={midPx + 3} textAnchor={side === "left" ? "end" : "start"} fontSize={8} fill={color} fontWeight={seg.kind === "gap" ? 700 : 500}>
                        {seg.label}
                      </text>
                    </g>
                  );
                });
              }))}
            </svg>
          );
        })()}

        {/* ─── Gap intelligence labels ─────────────────────────────────── */}
        {!dragUid && !measureMode && (() => {
          const gaps = wallGaps(room, cabinets, openings, 1);
          // Helper: convert a gap's run-axis center to pixel x/y inside the room div.
          const gapPx = (g: WallGap): { left: number; top: number } => {
            const BAND = 10; // px inset from the wall
            if (g.side === "top")    return { left: g.center * ppi, top: BAND };
            if (g.side === "bottom") return { left: g.center * ppi, top: roomPxH - BAND };
            if (g.side === "left")   return { left: BAND, top: g.center * ppi };
            return { left: roomPxW - BAND, top: g.center * ppi };
          };
          // Only show base-layer gaps (most actionable for the user).
          const baseGaps = gaps.filter((g) => g.layer === "base" && g.length >= 3);
          return baseGaps.map((g, i) => {
            const pos = gapPx(g);
            const color = g.isFillerSize ? "#e07b39" : g.isStandardSize ? "#2e7d32" : "#1a2744";
            return (
              // Gap measurement label chip — display only, no suggestion popover
              <div
                key={`gap-${g.side}-${i}`}
                className="absolute z-30 select-none -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow-md pointer-events-none"
                style={{ left: pos.left, top: pos.top, background: color, border: "1.5px solid white" }}
                title={t("dt_gap_title", { len: formatInches(g.length) })}
              >
                {formatInches(g.length)}
              </div>
            );
          });
        })()}

        {/* ── Furniture footprints (floor-plan only) ───────────────────── */}
        {furniture.map((f) => {
          const def = FURNITURE_CATALOG.find((fd) => fd.id === f.defId);
          if (!def) return null;
          const fp = furnitureFootprint(f, def);
          const isSelected = selectedFurnUid === f.uid;
          const pxW = fp.w * ppi;
          const pxD = fp.d * ppi;
          const isRound = def.shape === "round";
          return (
            <div
              key={f.uid}
              className="absolute cursor-grab active:cursor-grabbing select-none"
              style={{
                left: f.x * ppi,
                top: f.y * ppi,
                width: pxW,
                height: pxD,
                background: def.color + "33",
                border: `2px solid ${isSelected ? "#1a2744" : def.color}`,
                borderRadius: isRound ? "50%" : 4,
                transform: `rotate(${f.rotation}deg)`,
                transformOrigin: "center",
                zIndex: 20,
                boxShadow: isSelected ? `0 0 0 2px #1a274488` : undefined,
              }}
              onPointerDown={(e) => onFurnPointerDown(e, f)}
              onPointerMove={onFurnPointerMove}
              onPointerUp={onFurnPointerUp}
            >
              {/* Label */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                style={{ fontSize: Math.max(7, Math.min(10, pxW / 6)) }}
              >
                <span className="font-semibold leading-tight" style={{ color: def.color }}>{def.name}</span>
                <span className="text-[8px] opacity-60" style={{ color: def.color }}>
                  {isRound ? `${def.w}"⌀` : `${fp.w}"×${fp.d}"`}
                </span>
              </div>
              {/* Selected controls */}
              {isSelected && (
                <>
                  <button
                    className="absolute -top-4 -right-4 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow z-30"
                    onPointerDown={(e) => { e.stopPropagation(); onDeleteFurn?.(f.uid); }}
                    title="Delete"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <button
                    className="absolute -top-4 -left-4 w-6 h-6 rounded-full bg-[#1a2744] text-white flex items-center justify-center shadow z-30"
                    onPointerDown={(e) => { e.stopPropagation(); onRotateFurn?.(f.uid); }}
                    title="Rotate 90°"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* ── Annotations (text notes) ───────────────────────────── */}
        {annotations.map((a) => {
          const isSelected = selectedAnnotationUid === a.uid;
          return (
            <div
              key={a.uid}
              className="absolute cursor-grab active:cursor-grabbing select-none"
              style={{
                left: a.x * ppi - 4,
                top: a.y * ppi - 4,
                zIndex: 25,
              }}
              onPointerDown={(e) => onAnnPointerDown(e, a)}
              onPointerMove={onAnnPointerMove}
              onPointerUp={onAnnPointerUp}
            >
              <div className={`relative whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm border ${
                isSelected
                  ? "bg-amber-100 border-amber-500 text-amber-900"
                  : "bg-white/90 border-amber-300 text-amber-800"
              }`}>
                {a.text}
                {isSelected && onDeleteAnnotation && (
                  <button
                    className="absolute -top-2.5 -right-2.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center shadow z-30"
                    onPointerDown={(e) => { e.stopPropagation(); onDeleteAnnotation(a.uid); }}
                    title="Delete"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

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
          {t("dt_pc_snapped")}
        </div>
      )}

      {measureMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#d4a75a] text-[#1a2744] text-xs font-semibold px-3 py-1 rounded-full shadow-lg z-30">
          {measurePicks.length === 0
            ? t("dt_pc_measure_first")
            : measurePicks.length === 1
            ? t("dt_pc_measure_second")
            : t("dt_pc_measure_done")}
        </div>
      )}

      <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground bg-white/80 px-2 py-1 rounded">
        {(() => {
          const w = inchesToFeetInches(room.width);
          const h = inchesToFeetInches(room.depth);
          const f = (v: { feet: number; inches: number }) => (v.inches ? `${v.feet}'${v.inches}"` : `${v.feet}'`);
          return t("dt_pc_room_size", { w: f(w), h: f(h) });
        })()}
      </div>
    </div>
  );
}
