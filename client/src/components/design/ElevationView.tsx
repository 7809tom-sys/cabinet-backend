import {
  PlacedCabinet, RoomData, STD, elevationBox, WallOpening,
  FinishColors, DEFAULT_FINISH_COLORS, CROWN_HEIGHT_IN, TOE_KICK_HEIGHT_IN, BATTEN_WIDTH_IN, LIGHT_RAIL_HEIGHT_IN,
  type DoorPanelKind, type WallSide, cabinetWall,
  countertopMaterial, roomCeiling, bearsCountertop, isSinkBaseCabinet, isFarmerSinkBase,
  wallCeiling, wallCeilingIsSloped,
  backsplashMaterial, isStacker, isBridgeOverRange, resolveSwing,
  isRangeOrOven, wallCabinetTopLine, isBlindCorner, placedFootprint,
  flooringMaterial,
} from "@/lib/design";
import {
  type HardwareStyleId,
  hardwareStyle as resolveHardwareStyle,
  doorCountForCabinet,
  drawerCountForCabinet,
  displayDrawerCount,
} from "@/lib/hardware";
import { resolveDoorDrawerCounts, cabinetDrawingType, type CabinetDrawingType } from "@/lib/cabinetGraphics";
import { useRef, useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  room: RoomData;
  cabinets: PlacedCabinet[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  // Which physical wall to view, in plan terms (top/bottom/left/right).
  // Back-compat: "front" maps to bottom, "back" maps to top.
  wall: WallSide | "front" | "back";
  // Optional: lets the user flip the displayed wall straight from the elevation
  // panel (a compact Back/Front/Left/Right switcher) instead of going back to
  // the top toolbar. When omitted, the switcher is hidden.
  onSelectWall?: (side: WallSide) => void;
  // When set, draw a thin colored countertop band on top of the base run at the
  // 36" counter line, colored by the chosen material. null/undefined = no band.
  countertopMaterialId?: string | null;
  // When set, draw a backsplash texture between the countertop (36") and wall
  // cabinet bottom (54"). null/undefined = no backsplash drawn.
  backsplashMaterialId?: string | null;
  openings?: WallOpening[];
  finish?: FinishColors;
  crown?: boolean;
  toeKick?: boolean;
  batten?: boolean;
  lightRail?: boolean;
  panelKind?: DoorPanelKind;
  // Optional per-cabinet finish + door-panel resolvers for TWO-TONE designs.
  // When provided, each cabinet draws in its own finish/panel; otherwise the
  // single `finish`/`panelKind` props apply to every cabinet.
  finishFor?: (cab: PlacedCabinet) => FinishColors;
  panelKindFor?: (cab: PlacedCabinet) => DoorPanelKind;
  // Optional per-cabinet door sample image URL resolver. When provided, the
  // real door photo is rendered as a background texture on each cabinet face.
  doorSampleUrlFor?: (cab: PlacedCabinet) => string | null;
  // Optional per-cabinet drawer sample image URL resolver. When provided, the
  // drawer front photo is rendered on drawer fronts instead of the door photo.
  drawerSampleUrlFor?: (cab: PlacedCabinet) => string | null;
  // When this elevation is rendered inside a horizontally-mirrored container
  // (the left half of CornerView), set `mirror` so text labels are counter-
  // flipped to stay readable. `hideSwitcher` removes the inner wall picker so
  // CornerView can show its own corner picker instead.
  mirror?: boolean;
  hideSwitcher?: boolean;
  // Decorative hardware spec to draw on the fronts (knob / pull / cup). When
  // omitted or "none", no hardware is drawn.
  hardwareStyleId?: HardwareStyleId | null;
  // Corner cabinets that physically wrap THIS corner but are owned by the
  // adjoining wall. CornerView injects them so a lazy-Susan / diagonal / blind
  // corner unit is drawn on BOTH walls, pinned to the seam (corner end of the
  // wall = posAlong 0). These are render-only ghosts of the real placed cabinet.
  seamCabinets?: PlacedCabinet[];
  // Optional: when provided, the elevation supports horizontal drag-to-reorder.
  // The callback receives the uid and the new plan-space x/y coordinate.
  onMove?: (uid: string, x: number, y: number) => void;
  // Optional: when provided, a WALL cabinet can be nudged UP/DOWN in the
  // elevation (drag vertically or Arrow Up/Down). The callback receives the uid
  // and the new mountBottom (inches from floor to the box bottom).
  onMoveVertical?: (uid: string, mountBottom: number) => void;
  // When true, cabinets cannot be dragged (locked layout).
  moveLocked?: boolean;
  // When set, renders the floor strip with the selected flooring material pattern
  // (staggered planks for hardwood/LVP, tile grid, etc.). null/undefined = default wood.
  flooringMaterialId?: string | null;
}

export function ElevationView({
  room, cabinets, selectedUid, onSelect, wall, onSelectWall, countertopMaterialId = null, backsplashMaterialId = null, openings = [],
  finish = DEFAULT_FINISH_COLORS, crown = false, toeKick = false, batten = false, lightRail = false,
  panelKind = "shaker", mirror = false, hideSwitcher = false,
  hardwareStyleId = null,
  finishFor, panelKindFor, doorSampleUrlFor, drawerSampleUrlFor, seamCabinets = [],
  onMove, onMoveVertical, moveLocked = false,
  flooringMaterialId = null,
}: Props) {
  const { t } = useLanguage();
  const hw = resolveHardwareStyle(hardwareStyleId);
  // Counter-flip transform for text so labels read correctly when this whole
  // elevation sits inside a scaleX(-1) container.
  const textFlip: React.CSSProperties | undefined = mirror ? { transform: "scaleX(-1)" } : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const wallInnerRef = useRef<HTMLDivElement>(null);
  const [ppi, setPpi] = useState(4);
  const PADDING = 40;

  // Elevation drag state
  const [dragUid, setDragUid] = useState<string | null>(null);
  const dragOffset = useRef(0); // offset in px along the wall axis
  // Vertical (mount-height) drag: which axis the current gesture is resolving
  // and the starting pointer-Y + starting mountBottom so we can compute a delta.
  const dragAxis = useRef<"along" | "vertical" | null>(null);
  const vDragStartY = useRef(0);
  const vDragStartBottom = useRef(0);
  const capturedPointerId = useRef<number | null>(null);

  // Normalize legacy "front"/"back" to plan WallSide values.
  const side: WallSide =
    wall === "front" ? "bottom" : wall === "back" ? "top" : (wall as WallSide);

  // Resolve this wall's ceiling (flat or sloped). The wall box is drawn to the
  // HIGH end so a sloped ceiling has room; the slope itself is drawn as an
  // overlay below the box top. heightLeft/heightRight are the ceiling heights at
  // the visually LEFT and RIGHT ends of this elevation. `wallCeilingAt` works in
  // plan order (start->end); when this view is mirrored (CornerView left wall)
  // the on-screen left/right are swapped, so we flip them back for display.
  const wc = wallCeiling(room, side);
  const sloped = wallCeilingIsSloped(room, side);
  const ceilHigh = wc.high;
  // Plan-order start/end heights.
  const startH = (wc.slopeFrom ?? "start") === "start" ? wc.high : wc.low;
  const endH = (wc.slopeFrom ?? "start") === "start" ? wc.low : wc.high;
  const heightLeft = mirror ? endH : startH;
  const heightRight = mirror ? startH : endH;
  // Wall height shown in the elevation tracks the room's real ceiling height,
  // drawn to the high end so a 9ft/10ft (or sloped) ceiling shows more wall.
  const WALL_TOTAL_HEIGHT = ceilHigh;
  const WALL_LABELS: Record<WallSide, string> = {
    top: t("plan_wall_back"), bottom: t("plan_wall_front"), left: t("plan_wall_left"), right: t("plan_wall_right"),
  };
  const horizontal = side === "top" || side === "bottom";
  const planSpan = horizontal ? room.width : room.depth;

  // Only show cabinets that actually sit on the wall being viewed, so other
  // walls' cabinets don't bleed into this elevation.
  const onThisWall = cabinets.filter((c) => cabinetWall(c, room) === side);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const availW = el.clientWidth - PADDING * 2;
      const availH = el.clientHeight - PADDING * 2;
      const fitPpi = Math.min(availW / planSpan, availH / WALL_TOTAL_HEIGHT);
      setPpi(Math.max(1.5, Math.min(fitPpi, 7)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [planSpan, WALL_TOTAL_HEIGHT]);

  const wallPxW = planSpan * ppi;
  const wallPxH = WALL_TOTAL_HEIGHT * ppi;

  const sorted = [...onThisWall].sort((a, b) => {
    const order: Record<string, number> = { tall: 0, base: 1, appliance: 1, wall: 2 };
    return (order[a.placement] ?? 1) - (order[b.placement] ?? 1);
  });

  // Openings on the wall being viewed.
  const viewOpenings = openings.filter((o) => o.side === side);

  // Draw a single cabinet/appliance face box. Shared by the main run and by the
  // seam (corner) cabinets injected from CornerView. When `seam` is set the box
  // is pinned to the corner end of the wall (posAlong 0), drawn as a render-only
  // ghost of a corner cabinet that physically wraps this corner.
  const renderCabinetBox = (p: PlacedCabinet, seam = false) => {
    // Blind corner cabinets: always use the full nominal width along the wall,
    // regardless of stored depth (which may be stale/wrong from old saves).
    const fp = placedFootprint(p);
    const sizeAlong = horizontal ? fp.w : fp.d;
    const posAlong = seam ? 0 : (horizontal ? p.x : p.y);
    const { bottom, height } = elevationBox(p, room);
    const isWall = p.placement === "wall";
    // FRIDGE-* and all other appliances render as plain steel/gray appliance boxes.
    // They are NOT cabinet faces — the refrigerator is the appliance itself.
    const isAppliance = p.placement === "appliance" || /^(RANGE|FRIDGE)-/i.test(p.masterCode ?? "");
    const isSelected = p.uid === selectedUid;
    const isDragging = p.uid === dragUid;
    const cabFinish = finishFor ? finishFor(p) : finish;
    const cabPanelKind = panelKindFor ? panelKindFor(p) : panelKind;
    // Resolve the door sample image URL for this cabinet (real door photo).
    const cabDoorSampleUrl = !isAppliance && doorSampleUrlFor ? doorSampleUrlFor(p) : null;
    // Resolve the drawer sample image URL (used for drawer fronts only).
    // Falls back to the door sample if no separate drawer photo is set.
    const cabDrawerSampleUrl = !isAppliance && drawerSampleUrlFor ? (drawerSampleUrlFor(p) ?? cabDoorSampleUrl) : cabDoorSampleUrl;
    // Face fill: the CABINET BOX background (face frame). When a door sample
    // image is available, the image is applied ONLY to individual door/drawer
    // panels (not the full face). The box itself shows the face frame color.
    const faceFill = isAppliance
      ? "linear-gradient(160deg, #f4f6f9 0%, #dde2ea 18%, #c8cfd9 45%, #d4dae4 72%, #bec6d2 100%)"
      // Solid face frame color with very subtle top-light shading (5% lighter at
      // top, 8% darker at bottom) — matches how real painted/stained cabinets look
      // under overhead room lighting. No washed-out white gradient.
      : `linear-gradient(180deg, color-mix(in srgb, ${cabFinish.face} 97%, #ffffff) 0%, ${cabFinish.face} 20%, ${cabFinish.face} 80%, color-mix(in srgb, ${cabFinish.face} 92%, #000000) 100%)`;
    const edgeColor = isAppliance ? "#6b7280" : cabFinish.edge;
    // Use the richer description-driven door/drawer counts for accurate rendering.
    const resolvedCounts = !isAppliance ? resolveDoorDrawerCounts(p) : { doors: 0, drawers: 0 };
    const cabType: CabinetDrawingType | null = !isAppliance ? cabinetDrawingType(p) : null;
    // DEBUG: log O-code cabinets to diagnose oven-tall rendering
    if (p.masterCode && /^O\d/i.test(p.masterCode)) {
      console.log('[EV-OVEN]', p.masterCode, '| category:', p.category, '| subCategory:', p.subCategory, '| placement:', p.placement, '| cabType:', cabType, '| ovenType:', p.ovenType);
    }
    // For blind corner cabinets, determine which side the blind (corner) portion
    // is on. If the cabinet's start is near position 0 (wall start), the corner
    // is on the left. If its end is near planSpan (wall end), the corner is on
    // the right. This drives the door flip so the door faces the exposed side.
    const isBlind = isBlindCorner(p.masterCode, p.description);
    const blindLeft = isBlind ? (posAlong <= 2) : true;
    const canDrag = !seam && !moveLocked && !!onMove && !isAppliance;

    return (
      <div
        key={seam ? `${p.uid}-seam` : p.uid}
        onPointerDown={canDrag ? (e) => {
          e.stopPropagation();
          onSelect(p.uid);
          setDragUid(p.uid);
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          dragOffset.current = horizontal ? e.clientX - rect.left : e.clientY - rect.top;
          // Vertical-drag bookkeeping (only meaningful for wall cabinets): record
          // where the pointer started and the box's current bottom so a vertical
          // drag can adjust mount height. The gesture's dominant axis is decided
          // on the first move.
          dragAxis.current = null;
          vDragStartY.current = e.clientY;
          vDragStartBottom.current = bottom;
          // Capture on the WALL container so pointermove fires there (not on
          // the tiny cabinet div which mobile browsers isolate after capture).
          if (wallInnerRef.current) {
            wallInnerRef.current.setPointerCapture(e.pointerId);
            capturedPointerId.current = e.pointerId;
          }
        } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(p.uid);
        }}
        className={`absolute overflow-hidden ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
        style={{
          left: posAlong * ppi,
          width: sizeAlong * ppi,
          bottom: bottom * ppi,
          height: height * ppi,
          // The outer container carries the face fill as its background so that
          // no interior/wall color bleeds through at the top or bottom of the
          // cabinet face. DoorFront renders on top with the door/drawer details.
          background: faceFill,
          border: "none",
          borderRadius: 0,
          // Drop shadow lifts the cabinet face off the wall so even light-colored
          // finishes read as 3D objects rather than flat rectangles. The shadow
          // simulates overhead room lighting (slightly right+bottom biased).
          // When selected, the gold inner glow is added on top of the shadow.
          boxShadow: isSelected
            ? "2px 3px 8px rgba(0,0,0,0.22), -1px 0 4px rgba(0,0,0,0.10), inset 0 0 0 2px rgba(212,167,90,0.85), inset 0 0 8px rgba(212,167,90,0.30)"
            : "2px 3px 8px rgba(0,0,0,0.22), -1px 0 4px rgba(0,0,0,0.10)",
          opacity: seam ? 0.96 : isDragging ? 0.85 : undefined,
          transition: isDragging ? undefined : "left 80ms ease-out",
          zIndex: isDragging ? 10 : 2,
        }}
        title={`${p.masterCode} — ${p.description}`}
      >
        <div className="w-full h-full relative">
          {/* Always render the DoorFront panel structure so the face frame is
              visible. When a door sample image is available, it's applied as the
              background of individual door/drawer panels (not the full face). */}
          {!isAppliance && (
            <DoorFront
              kind={cabPanelKind}
              edge={edgeColor}
              face={cabFinish.face}
              doors={resolvedCounts.drawers > 0 && resolvedCounts.doors === 0 ? 0 : (resolvedCounts.doors || doorCountForCabinet(p))}
              drawers={isWall ? 0 : (resolvedCounts.drawers || displayDrawerCount(p))}
              isWall={isWall}
              doorSampleUrl={cabDoorSampleUrl}
              drawerSampleUrl={cabDrawerSampleUrl}
              cabinetType={cabType}
              blindOnLeft={blindLeft}
              cabinetHeightIn={height}
              faceFillOverride={faceFill}
              ovenType={p.ovenType ?? null}
            />
          )}
          {!isAppliance && hw.id !== "none" && (
            <HardwareOverlay
              doors={resolvedCounts.doors || doorCountForCabinet(p)}
              drawers={resolvedCounts.drawers || drawerCountForCabinet(p)}
              doorPiece={hw.doorPiece}
              drawerPiece={hw.drawerPiece}
              accent="#1a2744"
              handleSide={
                p.handleSide === "left" || p.handleSide === "right"
                  ? p.handleSide
                  : resolveSwing(p) === "left" ? "right"
                  : resolveSwing(p) === "right" ? "left"
                  : null
              }
            />
          )}
          {/* Appliance-specific detail overlays */}
          {isAppliance && /^FRIDGE-/i.test(p.masterCode ?? "") && (
            <>
              {/* Fridge body: two-door french-door style split at 65% from bottom */}
              {/* Bottom freezer drawer line */}
              <div className="absolute left-0 right-0" style={{ bottom: "35%", height: 2, background: "rgba(80,90,110,0.55)" }} />
              {/* Center vertical divider for upper fridge doors */}
              <div className="absolute top-0" style={{ left: "50%", width: 2, bottom: "35%", background: "rgba(80,90,110,0.55)", transform: "translateX(-50%)" }} />
              {/* Left door handle — vertical bar near right edge of left door */}
              <div
                className="absolute rounded-full"
                style={{
                  left: "calc(50% - 10px)",
                  top: "8%",
                  width: 4,
                  bottom: "38%",
                  background: "linear-gradient(90deg, #8a9ab0 0%, #c8d4e0 40%, #a0b0c4 100%)",
                  boxShadow: "1px 0 2px rgba(0,0,0,0.30), -1px 0 1px rgba(255,255,255,0.25)",
                  borderRadius: 3,
                }}
              />
              {/* Right door handle — vertical bar near left edge of right door */}
              <div
                className="absolute rounded-full"
                style={{
                  left: "calc(50% + 6px)",
                  top: "8%",
                  width: 4,
                  bottom: "38%",
                  background: "linear-gradient(90deg, #8a9ab0 0%, #c8d4e0 40%, #a0b0c4 100%)",
                  boxShadow: "1px 0 2px rgba(0,0,0,0.30), -1px 0 1px rgba(255,255,255,0.25)",
                  borderRadius: 3,
                }}
              />
              {/* Freezer drawer handle — horizontal bar centered */}
              <div
                className="absolute"
                style={{
                  left: "20%",
                  right: "20%",
                  bottom: "calc(35% + 6px)",
                  height: 4,
                  background: "linear-gradient(180deg, #8a9ab0 0%, #c8d4e0 40%, #a0b0c4 100%)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.30), 0 -1px 1px rgba(255,255,255,0.25)",
                  borderRadius: 3,
                }}
              />
            </>
          )}
          {isAppliance && /^(DW|WINE)-/i.test(p.masterCode ?? "") && (
            <>
              {/* Dishwasher / wine cooler: control panel strip at top */}
              <div className="absolute left-0 right-0 top-0" style={{ height: "12%", background: "linear-gradient(180deg, #b0bac8 0%, #8a96a8 100%)", borderBottom: "1px solid rgba(60,70,90,0.4)" }} />
              {/* Door handle — horizontal bar below control panel */}
              <div
                className="absolute"
                style={{
                  left: "15%",
                  right: "15%",
                  top: "14%",
                  height: 4,
                  background: "linear-gradient(180deg, #8a9ab0 0%, #c8d4e0 40%, #a0b0c4 100%)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.30), 0 -1px 1px rgba(255,255,255,0.25)",
                  borderRadius: 3,
                }}
              />
            </>
          )}
          {isAppliance && /^RANGE-/i.test(p.masterCode ?? "") && (
            <>
              {/* Range: cooktop area at top ~40%, oven door below */}
              <div className="absolute left-0 right-0" style={{ top: "38%", height: 2, background: "rgba(80,90,110,0.50)" }} />
              {/* Burner circles on cooktop */}
              {[{l:"22%",t:"8%"},{l:"58%",t:"8%"},{l:"22%",t:"22%"},{l:"58%",t:"22%"}].map((b,i) => (
                <div key={i} className="absolute rounded-full" style={{ left: b.l, top: b.t, width: "16%", aspectRatio:"1", border: "1.5px solid rgba(60,70,90,0.55)", background: "radial-gradient(circle, #8a96a8 30%, #6a7888 100%)" }} />
              ))}
              {/* Oven door handle */}
              <div
                className="absolute"
                style={{
                  left: "15%",
                  right: "15%",
                  top: "42%",
                  height: 4,
                  background: "linear-gradient(180deg, #8a9ab0 0%, #c8d4e0 40%, #a0b0c4 100%)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.30), 0 -1px 1px rgba(255,255,255,0.25)",
                  borderRadius: 3,
                }}
              />
              {/* Oven window */}
              <div className="absolute" style={{ left: "10%", right: "10%", top: "50%", bottom: "15%", background: "rgba(30,40,60,0.35)", border: "1px solid rgba(80,90,110,0.40)", borderRadius: 2 }} />
            </>
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
            <span className="text-[8px] font-bold truncate px-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" style={{ color: isAppliance ? "#1a2744" : cabFinish.label, ...textFlip }}>
              {p.masterCode}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const handleWallPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragUid) return;
    const cabinet = cabinets.find((c) => c.uid === dragUid);
    if (!cabinet) return;
    const wallEl = wallInnerRef.current;
    if (!wallEl) return;
    const wallRect = wallEl.getBoundingClientRect();
    // Decide the gesture axis once, from the first meaningful movement. Vertical
    // adjustment is only offered for WALL cabinets with an onMoveVertical hook.
    const canVertical = cabinet.placement === "wall" && !!onMoveVertical;
    if (dragAxis.current == null) {
      const dy = Math.abs(e.clientY - vDragStartY.current);
      const alongClient = horizontal ? e.clientX : e.clientY;
      const alongStart = horizontal ? wallRect.left + dragOffset.current : wallRect.top + dragOffset.current;
      const dAlong = Math.abs(alongClient - alongStart);
      if (canVertical && dy > dAlong && dy > 3) dragAxis.current = "vertical";
      else if (dAlong > 3) dragAxis.current = "along";
    }
    // ── Vertical (mount-height) drag ─────────────────────────────────────────
    if (dragAxis.current === "vertical" && canVertical && onMoveVertical) {
      // Screen Y grows downward but mount height grows upward, so invert dy.
      const dyIn = (vDragStartY.current - e.clientY) / ppi;
      const { height } = elevationBox(cabinet, room);
      const maxBottom = Math.max(0, WALL_TOTAL_HEIGHT - height);
      let nextBottom = vDragStartBottom.current + dyIn;
      nextBottom = Math.max(0, Math.min(maxBottom, nextBottom));
      // Snap to the standard mount line (54") and the upper-run top line so it
      // is easy to line back up with neighbors.
      const SNAP_IN = 1.5;
      for (const guide of [STD.WALL_MOUNT_BOTTOM]) {
        if (Math.abs(nextBottom - guide) <= SNAP_IN) nextBottom = guide;
      }
      onMoveVertical(dragUid, Math.round(nextBottom * 10) / 10);
      return;
    }
    if (!onMove) return;
    const sizeAlong = horizontal ? placedFootprint(cabinet).w : placedFootprint(cabinet).d;
    const planSpanLen = horizontal ? room.width : room.depth;
    const pxAlong = horizontal
      ? e.clientX - wallRect.left - dragOffset.current
      : e.clientY - wallRect.top - dragOffset.current;
    let newAlong = pxAlong / ppi;
    newAlong = Math.max(0, Math.min(newAlong, planSpanLen - sizeAlong));

    // Neighbours on the SAME wall that occupy the SAME vertical band as the
    // dragged cabinet (so a wall cabinet can slide freely over a base cabinet,
    // but two base cabinets block each other). Appliances/cabinets that are
    // intentionally allowed to overlap (e.g. a bridge over a microwave, a sink
    // over a sink base, a stacker over its host) are excluded so they don't
    // block the slide.
    const dBox = elevationBox(cabinet, room);
    const dTop = dBox.bottom + dBox.height;
    const bandOverlap = (o: PlacedCabinet) => {
      const oBox = elevationBox(o, room);
      const oTop = oBox.bottom + oBox.height;
      // Two boxes share a vertical band if their [bottom, top] ranges overlap.
      return dBox.bottom < oTop - 0.01 && oBox.bottom < dTop - 0.01;
    };
    const others = cabinets.filter(
      (c) =>
        c.uid !== dragUid &&
        cabinetWall(c, room) === side &&
        bandOverlap(c) &&
        !isStacker(c) &&
        !isStacker(cabinet) &&
        !isBridgeOverRange(cabinet, c) &&
        !isBridgeOverRange(c, cabinet),
    );

    // Build the free interval [lo, hi] the dragged cabinet's START may occupy so
    // it never overlaps a same-band neighbour. We pick the interval that
    // contains the raw target; if the target lands inside a neighbour, clamp to
    // the nearest free edge (this makes the cabinet STOP against its neighbour
    // rather than passing through).
    const SNAP = 2;
    let lo = 0;
    let hi = planSpanLen - sizeAlong;
    for (const o of others) {
      const oAlong = horizontal ? o.x : o.y;
      const oSize = horizontal ? placedFootprint(o).w : placedFootprint(o).d;
      const leftLimit = oAlong - sizeAlong; // start must be <= this to sit left of o
      const rightLimit = oAlong + oSize; // start must be >= this to sit right of o
      const center = newAlong + sizeAlong / 2;
      const oCenter = oAlong + oSize / 2;
      if (center <= oCenter) {
        // dragged cabinet is to the LEFT of this neighbour → cap the high edge
        hi = Math.min(hi, leftLimit);
      } else {
        // to the RIGHT → raise the low edge
        lo = Math.max(lo, rightLimit);
      }
    }
    if (lo <= hi) {
      newAlong = Math.max(lo, Math.min(newAlong, hi));
    }
    // Gentle magnet: if we're within SNAP of a neighbour edge, sit flush.
    for (const o of others) {
      const oAlong = horizontal ? o.x : o.y;
      const oSize = horizontal ? placedFootprint(o).w : placedFootprint(o).d;
      if (Math.abs(newAlong + sizeAlong - oAlong) <= SNAP) newAlong = oAlong - sizeAlong;
      if (Math.abs(newAlong - (oAlong + oSize)) <= SNAP) newAlong = oAlong + oSize;
    }
    newAlong = Math.max(0, Math.min(newAlong, planSpanLen - sizeAlong));
    const newX = horizontal ? newAlong : cabinet.x;
    const newY = horizontal ? cabinet.y : newAlong;
    onMove(dragUid, newX, newY);
  };

  const handleWallPointerUp = (e?: React.PointerEvent) => {
    if (capturedPointerId.current != null && wallInnerRef.current) {
      try { wallInnerRef.current.releasePointerCapture(capturedPointerId.current); } catch { /* already released */ }
      capturedPointerId.current = null;
    }
    setDragUid(null);
    dragAxis.current = null;
  };

  // ── Keyboard nudging ───────────────────────────────────────────────────────
  // With a cabinet selected, Arrow Left/Right move it ALONG the wall and Arrow
  // Up/Down change its mount height (wall cabinets only). Shift = coarse (3"),
  // otherwise fine (0.5"). Disabled while the layout is locked.
  useEffect(() => {
    if (moveLocked || !selectedUid) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea/select or contenteditable.
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
      if (tgt && tgt.isContentEditable) return;
      if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      const cab = cabinets.find((c) => c.uid === selectedUid);
      if (!cab || cabinetWall(cab, room) !== side) return;
      const step = e.shiftKey ? 3 : 0.5;
      // Horizontal (along-wall) nudge.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!onMove) return;
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const sizeAlong = horizontal ? placedFootprint(cab).w : placedFootprint(cab).d;
        const planSpanLen = horizontal ? room.width : room.depth;
        const cur = horizontal ? cab.x : cab.y;
        const next = Math.max(0, Math.min(planSpanLen - sizeAlong, cur + dir * step));
        if (horizontal) onMove(cab.uid, next, cab.y);
        else onMove(cab.uid, cab.x, next);
        return;
      }
      // Vertical (mount-height) nudge — wall cabinets only.
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && cab.placement === "wall" && onMoveVertical) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? 1 : -1;
        const { bottom, height } = elevationBox(cab, room);
        const maxBottom = Math.max(0, WALL_TOTAL_HEIGHT - height);
        const next = Math.max(0, Math.min(maxBottom, bottom + dir * step));
        onMoveVertical(cab.uid, Math.round(next * 10) / 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveLocked, selectedUid, cabinets, room, side, horizontal, onMove, onMoveVertical, WALL_TOTAL_HEIGHT]);

  return (
    <div
      ref={ref}
      className="relative w-full h-full overflow-hidden select-none touch-none"
      style={{ background: "linear-gradient(180deg, #e8e4de 0%, #f0ece6 40%, #ede9e3 100%)" }}
      onClick={() => onSelect(null)}
    >
      {/* Centering wrapper: positions the wall + floor assembly in the vertical
          center of the viewport so it doesn't float to the bottom on tall/narrow
          mobile screens. */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: wallPxW,
          height: wallPxH + PADDING,
        }}
      >
        {/* Floor plane — material-aware with staggered plank joints */}
        {(() => {
          const fm = flooringMaterial(flooringMaterialId);
          // Compute tile/plank dimensions scaled to the elevation PPI.
          // In elevation the floor is a thin strip (PADDING px tall), so we
          // scale plank dimensions to look proportional.
          const plankW = Math.max(12, fm.tileW * ppi * 0.7);
          const plankH = Math.max(6, Math.min(PADDING / 2.5, fm.tileH * ppi * 0.15));

          let bgImage: string;
          let bgSize: string | undefined;
          const g = fm.grout;

          if (fm.pattern === "hardwood" || fm.pattern === "plank") {
            // Staggered planks: alternate rows offset by 1/3 width (brick-lay).
            const offset = Math.round(plankW / 3);
            const h2 = plankH * 2;
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${plankW}' height='${h2}'>`
              + `<rect x='0' y='0' width='${plankW}' height='${h2}' fill='none'/>`
              + `<line x1='0' y1='0' x2='${plankW}' y2='0' stroke='${g}' stroke-width='0.7' opacity='0.6'/>`
              + `<line x1='0' y1='${plankH}' x2='${plankW}' y2='${plankH}' stroke='${g}' stroke-width='0.7' opacity='0.6'/>`
              + `<line x1='0' y1='0' x2='0' y2='${plankH}' stroke='${g}' stroke-width='0.5' opacity='0.5'/>`
              + `<line x1='${offset}' y1='${plankH}' x2='${offset}' y2='${h2}' stroke='${g}' stroke-width='0.5' opacity='0.5'/>`
              + `</svg>`;
            bgImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
            bgSize = `${plankW}px ${h2}px`;
          } else if (fm.pattern === "tile-stagger") {
            const offset = Math.round(plankW / 2);
            const h2 = plankH * 2;
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${plankW}' height='${h2}'>`
              + `<rect x='0' y='0' width='${plankW}' height='${h2}' fill='none'/>`
              + `<line x1='0' y1='0' x2='${plankW}' y2='0' stroke='${g}' stroke-width='0.8'/>`
              + `<line x1='0' y1='${plankH}' x2='${plankW}' y2='${plankH}' stroke='${g}' stroke-width='0.8'/>`
              + `<line x1='0' y1='0' x2='0' y2='${plankH}' stroke='${g}' stroke-width='0.6'/>`
              + `<line x1='${offset}' y1='${plankH}' x2='${offset}' y2='${h2}' stroke='${g}' stroke-width='0.6'/>`
              + `</svg>`;
            bgImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
            bgSize = `${plankW}px ${h2}px`;
          } else if (fm.pattern === "tile-grid" || fm.pattern === "tile-diagonal") {
            const tw = Math.max(10, plankW * 0.8);
            const th = Math.max(8, plankH * 1.2);
            bgImage = `repeating-linear-gradient(0deg, ${g} 0px, ${g} 1px, transparent 1px, transparent ${th}px), repeating-linear-gradient(90deg, ${g} 0px, ${g} 1px, transparent 1px, transparent ${tw}px)`;
            bgSize = undefined;
          } else if (fm.pattern === "herringbone" || fm.pattern === "chevron") {
            const angle = fm.pattern === "chevron" ? 60 : 45;
            bgImage = `repeating-linear-gradient(${angle}deg, ${g} 0px, ${g} 1px, transparent 1px, transparent ${plankH}px), repeating-linear-gradient(-${angle}deg, ${g} 0px, ${g} 1px, transparent 1px, transparent ${plankH}px)`;
            bgSize = undefined;
          } else {
            // solid / concrete — subtle noise
            bgImage = "none";
            bgSize = undefined;
          }

          // Subtle wood-grain overlay for hardwood/plank (adds realism)
          const grainOverlay = (fm.pattern === "hardwood" || fm.pattern === "plank")
            ? ", repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 3px)"
            : "";

          return (
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                bottom: 0,
                height: PADDING,
                background: `linear-gradient(180deg, color-mix(in srgb, ${fm.fill} 92%, #ffffff) 0%, ${fm.fill} 35%, color-mix(in srgb, ${fm.fill} 88%, #000000) 100%)`,
                backgroundImage: bgImage !== "none" ? bgImage + grainOverlay : grainOverlay || undefined,
                backgroundSize: bgSize,
                borderTop: `2px solid color-mix(in srgb, ${fm.fill} 50%, #000000)`,
                boxShadow: "inset 0 6px 12px -4px rgba(0,0,0,0.35)",
              }}
            />
          );
        })()}
        {/* Soft contact shadow where the wall/cabinets meet the floor. */}
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: PADDING - 2,
            height: 8,
            left: 0,
            width: wallPxW,
            background: "linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0) 100%)",
          }}
        />
        <div
          ref={wallInnerRef}
          className="absolute"
          onPointerMove={handleWallPointerMove}
          onPointerUp={handleWallPointerUp}
          onPointerLeave={handleWallPointerUp}
          style={{
            width: wallPxW,
            height: wallPxH,
            left: 0,
            bottom: PADDING,
            background: "linear-gradient(180deg, #f2ede7 0%, #ede8e2 50%, #e8e3dd 100%)",
            borderLeft: "2px solid #1a2744",
            borderRight: "2px solid #1a2744",
            borderTop: "2px solid #1a2744",
          }}
        >
        <div className="absolute left-0 right-0 bottom-0 border-b-[3px] border-[#1a2744]" />
        {/* Sloped ceiling overlay: when this wall has an angled ceiling, shade the
            dead space above the slope line (outside the room) and draw the slope
            as a solid ceiling line. The wall box height equals the HIGH end, so
            the slope drops from the high corner down to (ceilHigh-low) above the
            box bottom on the low side. */}
        {sloped && (() => {
          const W = wallPxW;
          const H = wallPxH;
          // y from the TOP of the box for each end (0 = box top = high ceiling).
          const yLeft = (ceilHigh - heightLeft) * ppi;
          const yRight = (ceilHigh - heightRight) * ppi;
          return (
            <svg
              className="absolute inset-0 pointer-events-none overflow-visible"
              width={W}
              height={H}
              style={{ left: 0, top: 0 }}
            >
              {/* Dead space above the ceiling (outside the room). */}
              <polygon
                points={`0,0 ${W},0 ${W},${yRight} 0,${yLeft}`}
                fill="#c9d2de"
                opacity={0.85}
              />
              {/* Hatch to read clearly as "outside / above ceiling". */}
              <polygon
                points={`0,0 ${W},0 ${W},${yRight} 0,${yLeft}`}
                fill="url(#slopeHatch)"
              />
              <defs>
                <pattern id="slopeHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#8a98ad" strokeWidth="1" opacity="0.5" />
                </pattern>
              </defs>
              {/* The sloped ceiling line itself. */}
              <line x1={0} y1={yLeft} x2={W} y2={yRight} stroke="#1a2744" strokeWidth={3} />
            </svg>
          );
        })()}
        {/* Ceiling line label so the chosen ceiling height is visible at a glance.
            Shows both ends when the ceiling is sloped. */}
        <div className="absolute -top-[14px] right-0 text-[9px] font-medium text-[#1a2744]/70" style={textFlip}>
          {sloped
            ? t("dt_ev_ceiling_slope", { hi: Math.round(ceilHigh), lo: Math.round(Math.min(heightLeft, heightRight)) })
            : t("dt_ev_ceiling", { n: Math.round(WALL_TOTAL_HEIGHT) })}
        </div>
        <div
          className="absolute left-0 right-0 border-b border-dashed border-[#b08d57]/40"
          style={{ bottom: STD.COUNTERTOP_HEIGHT * ppi }}
        />

        {/* Countertop band: a thin colored slab sitting on top of the base run,
            its top edge on the 36" counter line, colored by the chosen material.
            Drawn as one band PER CONTIGUOUS RUN of base cabinets + dishwasher-height
            appliances (DW-*). Tall appliances like the refrigerator are excluded so
            the counter breaks at the fridge but bridges over the dishwasher. */}
        {countertopMaterialId && (() => {
          const mat = countertopMaterial(countertopMaterialId);
          const THICKNESS_IN = 1.5;
          const OVERHANG_IN = 0.75; // a little nosing past the cabinet faces
          const TOL = 1.5; // inches: treat near-touching base cabinets as one run
          // The countertop runs over base cabinets AND bridges over the
          // DISHWASHER (a DW tucks UNDER the counter). It must BREAK at the
          // RANGE (a slide-in/free-standing range has its own cooktop surface,
          // no counter over it) and at the FRIDGE (full-height, tall). So only
          // DW-* appliances are bridgeable here — RANGE and FRIDGE are excluded.
          const isBridgeable = (p: PlacedCabinet) =>
            bearsCountertop(p) ||
            (p.placement === "appliance" && /^(DW|WINE)[-_]?\d/i.test(p.masterCode ?? ""));
          // Base-cabinet spans along this wall, sorted by start position.
          const spans = sorted
            .filter(isBridgeable)
            .map((p) => {
              const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
              const posAlong = horizontal ? p.x : p.y;
              return { start: posAlong, end: posAlong + sizeAlong };
            })
            .sort((a, b) => a.start - b.start);
          if (spans.length === 0) return null;
          // Merge adjacent/overlapping spans into contiguous runs; a gap larger
          // than TOL (e.g. where the fridge sits) breaks the counter.
          const runs: { start: number; end: number }[] = [];
          for (const s of spans) {
            const last = runs[runs.length - 1];
            if (last && s.start <= last.end + TOL) {
              last.end = Math.max(last.end, s.end);
            } else {
              runs.push({ start: s.start, end: s.end });
            }
          }
          return (
            <>
              {runs.map((r, i) => (
                <div
                  key={`ct${i}`}
                  className="absolute z-20 pointer-events-none rounded-[1px]"
                  style={{
                    left: (r.start - OVERHANG_IN) * ppi,
                    width: (r.end - r.start + OVERHANG_IN * 2) * ppi,
                    bottom: Math.ceil(STD.BASE_HEIGHT * ppi),
                    height: THICKNESS_IN * ppi,
                    // Polished stone slab with subtle veining for realism.
                    background: mat.speckle
                      ? `linear-gradient(180deg, color-mix(in srgb, ${mat.fill} 80%, #ffffff) 0%, ${mat.fill} 45%, color-mix(in srgb, ${mat.fill} 90%, #000000) 100%)`
                      : `linear-gradient(180deg, color-mix(in srgb, ${mat.fill} 82%, #ffffff) 0%, ${mat.fill} 55%, color-mix(in srgb, ${mat.fill} 88%, #000000) 100%)`,
                    // Subtle diagonal veining for marble/quartz look
                    backgroundImage: mat.speckle
                      ? `repeating-linear-gradient(135deg, transparent 0px, transparent 8px, ${mat.speckle}22 9px, transparent 10px, transparent 22px, ${mat.speckle}18 23px, transparent 24px)`
                      : undefined,
                    borderTop: `1px solid color-mix(in srgb, ${mat.fill} 60%, #ffffff)`,
                    borderBottom: `1px solid ${mat.edge}`,
                    // Slab thickness shadow + glossy top sheen + polished reflection.
                    boxShadow: "0 2px 4px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.1)",
                  }}
                  title={t("dt_ev_countertop", { material: mat.name })}
                />
              ))}
            </>
          );
        })()}

        {/* Waterfall countertop panels: vertical slabs on the left/right side of
            a base cabinet, same material as the countertop, running from the floor
            to the countertop top (36" + 1.5" thickness). Only drawn when a
            countertop material is selected and the cabinet has waterfallLeft/Right. */}
        {countertopMaterialId && (() => {
          const mat = countertopMaterial(countertopMaterialId);
          const SLAB_THICKNESS_IN = 1.5; // same as countertop thickness
          const WATERFALL_TOP = STD.COUNTERTOP_HEIGHT + 1.5; // top of countertop
          const panels: React.ReactNode[] = [];
          for (const p of sorted) {
            if (p.placement !== "base") continue;
            if (!p.waterfallLeft && !p.waterfallRight) continue;
            const fp = placedFootprint(p);
            const sizeAlong = horizontal ? fp.w : fp.d;
            const posAlong = horizontal ? p.x : p.y;
            const panelStyle: React.CSSProperties = {
              position: "absolute",
              bottom: 0,
              height: WATERFALL_TOP * ppi,
              width: SLAB_THICKNESS_IN * ppi,
              background: mat.speckle
                ? `linear-gradient(90deg, color-mix(in srgb, ${mat.fill} 80%, #ffffff) 0%, ${mat.fill} 45%, color-mix(in srgb, ${mat.fill} 90%, #000000) 100%)`
                : `linear-gradient(90deg, color-mix(in srgb, ${mat.fill} 82%, #ffffff) 0%, ${mat.fill} 55%, color-mix(in srgb, ${mat.fill} 88%, #000000) 100%)`,
              borderLeft: `1px solid color-mix(in srgb, ${mat.fill} 60%, #ffffff)`,
              borderRight: `1px solid ${mat.edge}`,
              boxShadow: "2px 0 4px rgba(0,0,0,0.20), inset 1px 0 0 rgba(255,255,255,0.45)",
              borderRadius: 1,
              zIndex: 19,
              pointerEvents: "none",
            };
            if (p.waterfallLeft) {
              panels.push(
                <div
                  key={`wf-l-${p.uid}`}
                  className="absolute"
                  style={{ ...panelStyle, left: (posAlong - SLAB_THICKNESS_IN) * ppi }}
                  title={`Waterfall Left — ${mat.name}`}
                />
              );
            }
            if (p.waterfallRight) {
              panels.push(
                <div
                  key={`wf-r-${p.uid}`}
                  className="absolute"
                  style={{ ...panelStyle, left: (posAlong + sizeAlong) * ppi }}
                  title={`Waterfall Right — ${mat.name}`}
                />
              );
            }
          }
          return panels.length > 0 ? <>{panels}</> : null;
        })()}

        {/* Backsplash: spans the FULL wall width (corner to corner), 18" tall
            by default. Only stretches taller behind a range (exposed wall above
            the range gets tiled up to wall cabinet bottom line). Wall cabinets/
            microwave/bridge render on top at higher z-index. */}
        {backsplashMaterialId && (() => {
          const bsMat = backsplashMaterial(backsplashMaterialId);
          const BACKSPLASH_BOTTOM = STD.COUNTERTOP_HEIGHT; // 36" — sits on top of the countertop surface
          const BACKSPLASH_STD_HEIGHT = 18; // standard backsplash is 18" tall
          const BACKSPLASH_DEFAULT_TOP = BACKSPLASH_BOTTOM + BACKSPLASH_STD_HEIGHT; // 55.5"
          // Behind a range, stretch backsplash up to wall cabinet bottom (54")
          // or the full wall-cabinet top line if no wall cab sits above.
          const BACKSPLASH_RANGE_TOP = wallCabinetTopLine(room); // 84" on 8ft ceiling

          // Backsplash follows cabinet runs only — spans behind base cabinets
          // and appliances (ranges/ovens) that have countertops, not the full wall.
          const cabinetRuns: { start: number; end: number }[] = sorted
            .filter((p) => (p.placement === "base" || p.placement === "appliance") && p.cabinetId !== 0)
            .map((p) => {
              const sA = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
              const pA = horizontal ? p.x : p.y;
              return { start: pA, end: pA + sA };
            })
            .sort((a, b) => a.start - b.start);
          // Merge overlapping/adjacent runs into contiguous spans
          const runs: { start: number; end: number }[] = [];
          for (const r of cabinetRuns) {
            const last = runs[runs.length - 1];
            if (last && r.start <= last.end + 0.5) {
              last.end = Math.max(last.end, r.end);
            } else {
              runs.push({ ...r });
            }
          }

          // Identify range positions on this wall for the taller stretch zone.
          const rangeSpans = sorted
            .filter((p) => isRangeOrOven(p.masterCode, p.description))
            .map((p) => {
              const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
              const posAlong = horizontal ? p.x : p.y;
              return { start: posAlong, end: posAlong + sizeAlong };
            });

          // Window openings on this wall — backsplash wraps around them
          const winOpenings = viewOpenings.filter((o) => o.kind === "window");
          const tileWPx = Math.max(8, (bsMat.pattern === "subway" ? 16 : bsMat.pattern === "mosaic" ? 5 : 12) * ppi / 12);
          const tileHPx = Math.max(6, (bsMat.pattern === "subway" ? 8 : bsMat.pattern === "mosaic" ? 5 : 12) * ppi / 12);
          // Subway tiles use a staggered brick-lay SVG (offset every other row by
          // half tile width) for realism instead of a simple grid.
          let bgImage: string | undefined;
          let bgSize: string | undefined;
          if (bsMat.pattern === "subway") {
            const tw = tileWPx;
            const th = tileHPx;
            const offset = Math.round(tw / 2);
            const h2 = th * 2;
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tw}' height='${h2}'>`
              + `<rect x='0' y='0' width='${tw}' height='${h2}' fill='none'/>`
              + `<line x1='0' y1='0' x2='${tw}' y2='0' stroke='${bsMat.grout}' stroke-width='1'/>`
              + `<line x1='0' y1='${th}' x2='${tw}' y2='${th}' stroke='${bsMat.grout}' stroke-width='1'/>`
              + `<line x1='0' y1='0' x2='0' y2='${th}' stroke='${bsMat.grout}' stroke-width='1'/>`
              + `<line x1='${offset}' y1='${th}' x2='${offset}' y2='${h2}' stroke='${bsMat.grout}' stroke-width='1'/>`
              + `</svg>`;
            bgImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
            bgSize = `${tw}px ${h2}px`;
          } else if (bsMat.pattern === "mosaic") {
            bgImage = `repeating-linear-gradient(0deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx}px), repeating-linear-gradient(90deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileWPx}px)`;
          } else if (bsMat.pattern === "large-format") {
            bgImage = `repeating-linear-gradient(0deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx * 2}px), repeating-linear-gradient(90deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileWPx * 2}px)`;
          } else if (bsMat.pattern === "herringbone") {
            bgImage = `repeating-linear-gradient(45deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx}px), repeating-linear-gradient(-45deg, ${bsMat.grout} 0px, ${bsMat.grout} 1px, transparent 1px, transparent ${tileHPx}px)`;
          } else if (bsMat.pattern === "hexagon") {
            bgImage = `radial-gradient(circle at 50% 50%, ${bsMat.grout} 1px, transparent 1px)`;
          }

          // Build segments: standard 18" height across the wall, with taller
          // sections behind the range. Window openings are cut out.
          const segments: { left: number; width: number; bottom: number; height: number }[] = [];

          // Helper: does a horizontal position fall within a range span?
          const rangeTopAt = (x: number): number => {
            for (const rs of rangeSpans) {
              if (x >= rs.start && x < rs.end) return BACKSPLASH_RANGE_TOP;
            }
            return BACKSPLASH_DEFAULT_TOP;
          };

          for (const run of runs) {
            const runStart = run.start;
            const runEnd = run.end;

            // Split the run into sub-runs by range boundaries so each sub-run
            // has a uniform top height.
            const breakpoints = new Set<number>([runStart, runEnd]);
            for (const rs of rangeSpans) {
              if (rs.start > runStart && rs.start < runEnd) breakpoints.add(rs.start);
              if (rs.end > runStart && rs.end < runEnd) breakpoints.add(rs.end);
            }
            const bps = Array.from(breakpoints).sort((a, b) => a - b);

            for (let bi = 0; bi < bps.length - 1; bi++) {
              const segStart = bps[bi];
              const segEnd = bps[bi + 1];
              const segTop = rangeTopAt((segStart + segEnd) / 2);

              // Find windows that overlap this sub-segment
              const overlapping = winOpenings.filter(
                (o) => o.offset < segEnd && (o.offset + o.width) > segStart
              );

              if (overlapping.length === 0) {
                // No windows — simple rectangle
                segments.push({
                  left: segStart * ppi,
                  width: (segEnd - segStart) * ppi,
                  bottom: BACKSPLASH_BOTTOM * ppi,
                  height: (segTop - BACKSPLASH_BOTTOM) * ppi,
                });
              } else {
                // Sort windows by offset
                const wins = [...overlapping].sort((a, b) => a.offset - b.offset);
                const minSill = Math.min(...wins.map((w) => w.sill));
                // Below-window strip
                if (minSill > BACKSPLASH_BOTTOM) {
                  segments.push({
                    left: segStart * ppi,
                    width: (segEnd - segStart) * ppi,
                    bottom: BACKSPLASH_BOTTOM * ppi,
                    height: (minSill - BACKSPLASH_BOTTOM) * ppi,
                  });
                }
                // Left of first window
                if (wins[0].offset > segStart) {
                  segments.push({
                    left: segStart * ppi,
                    width: (wins[0].offset - segStart) * ppi,
                    bottom: minSill * ppi,
                    height: (segTop - minSill) * ppi,
                  });
                }
                // Between windows
                for (let wi = 0; wi < wins.length - 1; wi++) {
                  const gapStart = wins[wi].offset + wins[wi].width;
                  const gapEnd = wins[wi + 1].offset;
                  if (gapEnd > gapStart) {
                    segments.push({
                      left: gapStart * ppi,
                      width: (gapEnd - gapStart) * ppi,
                      bottom: minSill * ppi,
                      height: (segTop - minSill) * ppi,
                    });
                  }
                }
                // Right of last window
                const lastWin = wins[wins.length - 1];
                if (lastWin.offset + lastWin.width < segEnd) {
                  segments.push({
                    left: (lastWin.offset + lastWin.width) * ppi,
                    width: (segEnd - (lastWin.offset + lastWin.width)) * ppi,
                    bottom: minSill * ppi,
                    height: (segTop - minSill) * ppi,
                  });
                }
                // Above each window (sill+height to segTop)
                for (const w of wins) {
                  const wTop = w.sill + w.height;
                  if (wTop < segTop) {
                    const wLeft = Math.max(segStart, w.offset);
                    const wRight = Math.min(segEnd, w.offset + w.width);
                    segments.push({
                      left: wLeft * ppi,
                      width: (wRight - wLeft) * ppi,
                      bottom: wTop * ppi,
                      height: (segTop - wTop) * ppi,
                    });
                  }
                }
              }
            }
          }
          return (
            <>
              {segments.map((seg, i) => (
                <div
                  key={`bs${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: seg.left,
                    width: seg.width,
                    bottom: seg.bottom,
                    height: seg.height,
                    background: bsMat.fill,
                    backgroundImage: bgImage,
                    backgroundSize: bgSize ?? (bsMat.pattern === "hexagon" ? `${tileWPx}px ${tileHPx}px` : undefined),
                    borderTop: `1px solid ${bsMat.grout}`,
                    borderBottom: `1px solid ${bsMat.grout}`,
                    opacity: 0.85,
                    zIndex: 1,
                  }}
                  title={`Backsplash: ${bsMat.name}`}
                />
              ))}
            </>
          );
        })()}

        {/* Floor contact shadow: a soft dark strip along the bottom of each
            base/tall run so cabinets read as sitting ON the floor rather than
            floating. Drawn BEHIND the cabinet boxes. */}
        {sorted
          .filter((p) => (p.placement === "base" || p.placement === "tall" || p.placement === "appliance") && p.cabinetId !== 0)
          .map((p) => {
            const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
            const posAlong = horizontal ? p.x : p.y;
            return (
              <div
                key={`floorshadow-${p.uid}`}
                className="absolute pointer-events-none"
                style={{
                  left: posAlong * ppi - 2,
                  width: sizeAlong * ppi + 4,
                  bottom: -2,
                  height: Math.max(4, 4 * ppi),
                  background: "radial-gradient(ellipse at center bottom, rgba(15,23,42,0.30) 0%, rgba(15,23,42,0.12) 55%, transparent 80%)",
                  zIndex: 0,
                }}
              />
            );
          })}

        {sorted.map((p) => renderCabinetBox(p))}

        {/* Corner cabinets that wrap this corner from the adjoining wall, drawn
            pinned to the seam so a lazy-Susan / diagonal / blind unit shows on
            BOTH walls of the corner view. */}
        {seamCabinets.map((p) => renderCabinetBox(p, true))}

        {/* Duplicate per-cabinet countertop slab removed — the contiguous-run
            countertop renderer above (lines 583-645) already handles the slab
            correctly when a material is selected. The per-cabinet fallback was
            causing an unwanted warm/orange stripe at the top of every base
            cabinet even when no countertop material was chosen. */}

        {/* Faucet: drawn above sink base cabinets (SB-*). Shows a vertical
            riser + horizontal spout + aerator + handle knob sitting on top of
            the countertop so the faucet is visible in Front View even though
            the sink bowl is cut into the counter.
            Skipped when sinkTopType is a range top (gas/electric/smooth-top). */}
        {sorted.filter((p) =>
          isSinkBaseCabinet(p) &&
          p.sinkTopType !== "gas" && p.sinkTopType !== "electric" && p.sinkTopType !== "smooth-top" &&
          // Only show faucet when a sink has been explicitly assigned (sinkTopType === "sink")
          // or when a faucet product was selected. Unassigned SB-* cabinets show no faucet.
          (p.sinkTopType === "sink" || p.faucetProductId != null || p.sinkTopProductId != null)
        ).map((p) => {
          const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const centerX = (posAlong + sizeAlong / 2) * ppi;
          const riserH = 8 * ppi;          // 8" riser above countertop
          const spoutW = 4 * ppi;          // 4" horizontal spout arm
          const spoutThick = Math.max(2, 1.5 * ppi);
          const riserThick = Math.max(2, 1.5 * ppi);
          const knobR = Math.max(3, 1.5 * ppi);
          const svgW = spoutW + knobR * 3;
          const svgH = riserH + knobR * 2 + 4;
          // Realistic brushed-nickel faucet with gooseneck curve, metallic
          // gradients, and proper proportions.
          return (
            <svg
              key={`faucet-${p.uid}`}
              className="absolute pointer-events-none"
              style={{
                left: centerX - svgW / 2,
                bottom: (STD.COUNTERTOP_HEIGHT + STD.COUNTERTOP_THICKNESS) * ppi,
                width: svgW,
                height: svgH,
                overflow: "visible",
                zIndex: 26,
              }}
            >
              <defs>
                <linearGradient id={`faucet-metal-${p.uid}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#a8b8c8" />
                  <stop offset="35%" stopColor="#d0dce6" />
                  <stop offset="60%" stopColor="#b8c8d4" />
                  <stop offset="100%" stopColor="#8a9aaa" />
                </linearGradient>
              </defs>
              {/* Base plate / escutcheon */}
              <ellipse cx={svgW / 2} cy={svgH - 1} rx={riserThick * 1.5} ry={riserThick * 0.5} fill="#7a8a9a" opacity={0.5} />
              {/* Vertical riser with metallic gradient */}
              <rect x={svgW / 2 - riserThick / 2} y={svgH - riserH} width={riserThick} height={riserH} fill={`url(#faucet-metal-${p.uid})`} rx={riserThick * 0.3} />
              {/* Gooseneck curve at top */}
              <path
                d={`M ${svgW / 2} ${svgH - riserH} Q ${svgW / 2} ${svgH - riserH - spoutThick * 1.5} ${svgW / 2 - spoutW * 0.4} ${svgH - riserH - spoutThick * 0.8}`}
                stroke="#a0b0c0" strokeWidth={spoutThick} fill="none" strokeLinecap="round"
              />
              {/* Spout arm extending from curve */}
              <rect x={svgW / 2 - spoutW} y={svgH - riserH - spoutThick * 0.3} width={spoutW * 0.65} height={spoutThick * 0.8} fill={`url(#faucet-metal-${p.uid})`} rx={spoutThick * 0.3} />
              {/* Aerator tip (darker, tapered) */}
              <rect x={svgW / 2 - spoutW - 1} y={svgH - riserH - spoutThick * 0.1} width={Math.max(3, spoutThick * 0.6)} height={Math.max(3, spoutThick * 1.2)} fill="#5a6a7a" rx={1} />
              {/* Handle lever */}
              <rect x={svgW / 2 + riserThick * 0.3} y={svgH - riserH * 0.55} width={knobR * 2.2} height={spoutThick * 0.6} fill="#b8c8d8" rx={spoutThick * 0.2} stroke="#8a9aaa" strokeWidth={0.5} />
              {/* Handle pivot */}
              <circle cx={svgW / 2 + riserThick * 0.3} cy={svgH - riserH * 0.55 + spoutThick * 0.3} r={Math.max(2, spoutThick * 0.35)} fill="#8a9aaa" />
            </svg>
          );
        })}

        {/* Range Top / Cooktop: thin surface appliance sitting ON TOP of the countertop.
            A cooktop is ~3.5" tall and sits flush with the countertop surface. In front
            elevation it appears as a thin stainless/black strip at the 34.5"-38" zone
            (just above the base cabinet face, replacing the countertop slab for that section).
            The cabinet face below remains visible as a normal cabinet. */}
        {sorted.filter((p) => isSinkBaseCabinet(p) && (p.sinkTopType === "gas" || p.sinkTopType === "electric" || p.sinkTopType === "smooth-top")).map((p) => {
          const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
          const posAlong = horizontal ? p.x : p.y;
          // Cooktop sits on the countertop surface: bottom at BASE_HEIGHT (34.5"),
          // height ~3.5" (slightly thicker than the 1.5" countertop slab so it
          // visually reads as an appliance, not just a slab).
          const COOKTOP_THICKNESS = 3.5; // inches — visible front face of cooktop
          const panelW = sizeAlong * ppi;
          const panelH = COOKTOP_THICKNESS * ppi;
          const panelLeft = posAlong * ppi;
          const panelBottom = STD.BASE_HEIGHT * ppi; // sits on top of 34.5" cabinet
          const isGas = p.sinkTopType === "gas";
          const isBlackGlass = p.rangeTopFinish === "black-glass";
          const isSmooth = isBlackGlass || p.sinkTopType === "smooth-top";
          // Burner layout: 4 burners in a single row (since the panel is thin/wide)
          const burnerR = Math.max(3, Math.min(panelH * 0.32, panelW / 14));
          const burnerPositions = [
            { cx: panelW * 0.2, cy: panelH * 0.45 },
            { cx: panelW * 0.4, cy: panelH * 0.45 },
            { cx: panelW * 0.6, cy: panelH * 0.45 },
            { cx: panelW * 0.8, cy: panelH * 0.45 },
          ];
          return (
            <svg
              key={`rangetop-${p.uid}`}
              className="absolute pointer-events-none"
              style={{
                left: panelLeft,
                bottom: panelBottom,
                width: panelW,
                height: panelH,
                zIndex: 22,
              }}
            >
              <defs>
                <linearGradient id={`ss-grad-${p.uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e2e6ec"/>
                  <stop offset="40%" stopColor="#c8cdd6"/>
                  <stop offset="100%" stopColor="#a8aebb"/>
                </linearGradient>
                <linearGradient id={`bg-grad-${p.uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a1a1a"/>
                  <stop offset="100%" stopColor="#2a2a2a"/>
                </linearGradient>
              </defs>
              {/* Cooktop face panel */}
              <rect x={0} y={0} width={panelW} height={panelH}
                fill={isSmooth ? `url(#bg-grad-${p.uid})` : `url(#ss-grad-${p.uid})`}
                rx={1} />
              <rect x={0} y={0} width={panelW} height={panelH}
                fill="none" stroke={isSmooth ? "#444" : "#8a9099"} strokeWidth={1.5} rx={1} />
              {/* Control knobs: small dots along the front (bottom edge) */}
              {[0.2, 0.4, 0.6, 0.8].map((xr, i) => (
                <circle key={`knob-${i}`} cx={panelW * xr} cy={panelH * 0.82} r={Math.max(1.5, panelH * 0.08)}
                  fill={isSmooth ? "#555" : "#6b7280"} />
              ))}
              {/* Burners / coils */}
              {burnerPositions.map((b, i) => (
                <g key={i}>
                  {isGas ? (
                    <>
                      <circle cx={b.cx} cy={b.cy} r={burnerR} fill="none" stroke="#666" strokeWidth={Math.max(1, burnerR * 0.2)} />
                      <circle cx={b.cx} cy={b.cy} r={burnerR * 0.5} fill="none" stroke="#666" strokeWidth={Math.max(0.8, burnerR * 0.15)} />
                      <circle cx={b.cx} cy={b.cy} r={burnerR * 0.12} fill="#555" />
                    </>
                  ) : isSmooth ? (
                    <>
                      <circle cx={b.cx} cy={b.cy} r={burnerR} fill="#111" stroke="#444" strokeWidth={0.8} />
                      <circle cx={b.cx} cy={b.cy} r={burnerR * 0.6} fill="none" stroke="#333" strokeWidth={Math.max(0.5, burnerR * 0.1)} />
                    </>
                  ) : (
                    <>
                      <circle cx={b.cx} cy={b.cy} r={burnerR} fill="none" stroke="#c0392b" strokeWidth={Math.max(1, burnerR * 0.22)} />
                      <circle cx={b.cx} cy={b.cy} r={burnerR * 0.6} fill="none" stroke="#c0392b" strokeWidth={Math.max(1, burnerR * 0.18)} />
                    </>
                  )}
                </g>
              ))}
            </svg>
          );
        })}
        {/* Apron-front (farmhouse) sink: exposed ceramic apron face below countertop.
            Shown for FSB-* cabinets. Replaces the standard hidden under-mount look
            with a visible fireclay/cast-iron apron panel. */}
        {sorted.filter((p) => isFarmerSinkBase(p)).map((p) => {
          const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
          const posAlong = horizontal ? p.x : p.y;
          // Apron sits from floor (toe kick height) up to countertop bottom
          const apronBottom = toeKick ? TOE_KICK_HEIGHT_IN : 0;
          const apronTop = STD.COUNTERTOP_HEIGHT; // 34.5"
          const apronH = apronTop - apronBottom;
          const apronPxH = apronH * ppi;
          const apronPxW = sizeAlong * ppi;
          const apronLeft = posAlong * ppi;
          const apronBottomPx = apronBottom * ppi;
          // Basin cutout: centered, ~80% width, ~55% height of apron
          const basinW = apronPxW * 0.78;
          const basinH = apronPxH * 0.52;
          const basinLeft = (apronPxW - basinW) / 2;
          const basinBottom = apronPxH * 0.12;
          return (
            <div
              key={`apron-${p.uid}`}
              className="absolute pointer-events-none"
              style={{
                left: apronLeft,
                width: apronPxW,
                bottom: apronBottomPx,
                height: apronPxH,
                zIndex: 6,
              }}
            >
              {/* Apron face panel — fireclay white with subtle ceramic sheen */}
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(180deg, #fafbfc 0%, #f2f4f7 20%, #eaecf0 50%, #e2e5ea 75%, #dce0e6 100%)",
                  borderTop: "2px solid #c0c6cf",
                  borderLeft: "1.5px solid #cdd2da",
                  borderRight: "1.5px solid #cdd2da",
                  borderBottom: "1px solid #b8bec8",
                  borderRadius: "2px 2px 4px 4px",
                  boxShadow: "inset 0 2px 8px rgba(0,0,0,0.06), inset 0 -2px 4px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.12)",
                }}
              />
              {/* Subtle horizontal bead line (fireclay detail) */}
              <div
                className="absolute left-[8%] right-[8%]"
                style={{
                  top: "18%",
                  height: 1,
                  background: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.06) 20%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.06) 80%, transparent 100%)",
                }}
              />
              {/* Basin cutout impression — deeper shadow for realism */}
              <div
                className="absolute"
                style={{
                  left: basinLeft,
                  width: basinW,
                  bottom: basinBottom,
                  height: basinH,
                  background: "linear-gradient(180deg, #b8c0cc 0%, #a8b0bc 30%, #98a0ac 60%, #909aaa 100%)",
                  borderRadius: "3px 3px 8px 8px",
                  boxShadow: "inset 0 4px 10px rgba(0,0,0,0.28), inset 0 1px 4px rgba(0,0,0,0.18), 0 0 0 1.5px #8a94a4",
                }}
              >
                {/* Drain grate — metallic ring with crosshatch */}
                <div
                  className="absolute"
                  style={{
                    left: "50%",
                    bottom: "12%",
                    width: Math.max(5, 3 * ppi),
                    height: Math.max(5, 3 * ppi),
                    marginLeft: -(Math.max(5, 3 * ppi) / 2),
                    borderRadius: "50%",
                    background: "radial-gradient(circle, #4a5060 0%, #5a6575 40%, #6a7585 70%, #7a8595 100%)",
                    border: "1.5px solid #3a4555",
                    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5), 0 1px 2px rgba(255,255,255,0.15)",
                  }}
                />
              </div>
              {/* Apron label */}
              {apronPxH > 20 && (
                <div
                  className="absolute inset-0 flex items-end justify-center pointer-events-none"
                  style={{ paddingBottom: basinBottom + basinH + 2, zIndex: 2 }}
                >
                  <span style={{ fontSize: Math.max(7, ppi * 1.8), color: "#8a9bb0", fontWeight: 500, letterSpacing: "0.03em" }}>
                    {p.masterCode}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Crown molding: band across the top of each wall cabinet */}
        {crown && sorted.filter((p) => p.placement === "wall" && p.mountBottom == null).map((p) => {
          const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const { bottom, height } = elevationBox(p, room);
          const cabF = finishFor ? finishFor(p) : finish;
          return (
            <div
              key={`crown-${p.uid}`}
              className="absolute"
              style={{
                left: posAlong * ppi - 2,
                width: sizeAlong * ppi + 4,
                bottom: (bottom + height) * ppi,
                height: Math.max(3, CROWN_HEIGHT_IN * ppi),
                background: cabF.face,
                borderTop: `1.5px solid ${cabF.edge}`,
                borderRadius: "2px 2px 0 0",
                zIndex: 3,
              }}
              title={t("dt_ev_crown")}
            />
          );
        })}

        {/* Light rail: slim valance strip under the bottom edge of each wall
            cabinet (hides under-cabinet lighting). */}
        {lightRail && sorted.filter((p) => p.placement === "wall" && p.mountBottom == null).map((p) => {
          const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const { bottom } = elevationBox(p, room);
          const cabF = finishFor ? finishFor(p) : finish;
          return (
            <div
              key={`lightrail-${p.uid}`}
              className="absolute"
              style={{
                left: posAlong * ppi + 1,
                width: sizeAlong * ppi - 2,
                bottom: (bottom - LIGHT_RAIL_HEIGHT_IN) * ppi,
                height: Math.max(2, LIGHT_RAIL_HEIGHT_IN * ppi),
                background: cabF.face,
                borderBottom: `1px solid ${cabF.edge}`,
                borderRadius: "0 0 2px 2px",
                zIndex: 3,
              }}
              title={t("dt_ev_light_rail")}
            />
          );
        })}

        {/* Toe kick: recessed strip under base & tall cabinets, matching cabinet color */}
        {toeKick && sorted.filter((p) => (p.placement === "base" || p.placement === "tall") && p.cabinetId !== 0).map((p) => {
          const sizeAlong = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
          const posAlong = horizontal ? p.x : p.y;
          const cabF = finishFor ? finishFor(p) : finish;
          const toeH = Math.max(3, TOE_KICK_HEIGHT_IN * ppi);
          return (
            <div
              key={`toe-${p.uid}`}
              className="absolute"
              style={{
                left: posAlong * ppi + 4,
                width: sizeAlong * ppi - 8,
                bottom: 0,
                height: toeH,
                // Recessed toe kick: darker than the cabinet face, set back from
                // the front plane. Top shadow simulates the overhang of the base
                // cabinet above it.
                background: `linear-gradient(180deg, color-mix(in srgb, ${cabF.face} 55%, #000) 0%, color-mix(in srgb, ${cabF.face} 70%, #000) 40%, color-mix(in srgb, ${cabF.face} 60%, #000) 100%)`,
                boxShadow: `inset 0 3px 6px rgba(0,0,0,0.50), inset 0 -1px 0 rgba(255,255,255,0.08), 0 0 0 0.5px ${cabF.edge}66`,
                borderRadius: "0 0 1px 1px",
                zIndex: 4,
              }}
              title={t("dt_ev_toe_kick")}
            />
          );
        })}

        {/* Batten molding: slim vertical strip covering the seam between two
            edge-to-edge cabinets on this wall. */}
        {batten && sorted
          .filter((p) => p.cabinetId !== 0)
          .map((p, i, arr) => {
            if (i === arr.length - 1) return null;
            const next = arr[i + 1];
            const pAlong = horizontal ? p.x : p.y;
            const pSize = horizontal ? placedFootprint(p).w : placedFootprint(p).d;
            const nextAlong = horizontal ? next.x : next.y;
            const pEnd = pAlong + pSize;
            // Only draw where the two cabinets actually touch (within 1.5").
            if (Math.abs(nextAlong - pEnd) > 1.5) return null;
            const { bottom, height } = elevationBox(p, room);
            const nextBox = elevationBox(next, room);
            const top = Math.max(bottom + height, nextBox.bottom + nextBox.height);
            const base = Math.min(bottom, nextBox.bottom);
            const widthPx = Math.max(3, BATTEN_WIDTH_IN * ppi);
            const cabF = finishFor ? finishFor(p) : finish;
            return (
              <div
                key={`batten-${p.uid}`}
                className="absolute"
                style={{
                  left: pEnd * ppi - widthPx / 2,
                  width: widthPx,
                  bottom: base * ppi,
                  height: (top - base) * ppi,
                  background: cabF.edge,
                  borderRadius: "2px",
                  boxShadow: "0 0 0 0.5px rgba(0,0,0,0.15)",
                  zIndex: 5,
                }}
                title={t("dt_ev_batten")}
              />
            );
          })}

        {/* Doors & windows on this wall, drawn at their sill height */}
        {viewOpenings.map((o) => {
          const isDoor = o.kind === "door";
          const isOpening = o.kind === "opening";
          // A cased opening is a hole in the wall: render it as an open gap
          // (light recessed fill, dashed casing) with no door slab or glazing.
          return (
            <div
              key={`ev-${o.uid}`}
              className="absolute flex items-center justify-center overflow-hidden"
              style={{
                left: o.offset * ppi,
                width: o.width * ppi,
                bottom: o.sill * ppi,
                height: o.height * ppi,
                background: isDoor
                  ? "linear-gradient(to bottom, #b07f4d 0%, #8a5f33 100%)"
                  : isOpening
                  ? "linear-gradient(to bottom, #f3f4f6 0%, #e2e5e9 100%)"
                  : "linear-gradient(to bottom, rgba(160,205,235,0.85) 0%, rgba(126,180,214,0.85) 100%)",
                border: isOpening ? "2px dashed #5a6770" : "2px solid #1a2744",
                borderRadius: 2,
                zIndex: 5,
              }}
              title={`${o.label} (${Math.round(o.width)}" × ${Math.round(o.height)}")`}
            >
              {o.kind === "window" && (
                <div className="absolute inset-1 border border-[#1a2744]/40">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#1a2744]/40" />
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-[#1a2744]/40" />
                </div>
              )}
              <span className={`relative text-[8px] font-bold drop-shadow ${isOpening ? "text-[#3a4047]" : "text-white"}`}>
                {isDoor ? t("dt_ev_door") : isOpening ? t("dt_ev_open") : t("dt_ev_window")}
              </span>
            </div>
          );
        })}
            </div>
      </div>{/* end centering wrapper */}
      {/* Wall switcher: flip the displayed wall straight from the elevation
          panel. Falls back to a static label when no handler is provided. */}
      {hideSwitcher ? null : onSelectWall ? (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/85 px-1.5 py-1 rounded-full shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("dt_ev_wall")}</span>
          {((["top", "left", "bottom", "right"] as WallSide[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onSelectWall(w)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                w === side
                  ? "bg-[#1a2744] text-white"
                  : "text-[#1a2744] hover:bg-[#1a2744]/10"
              }`}
            >
              {WALL_LABELS[w]}
            </button>
          )))}
        </div>
      ) : (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs font-medium text-[#1a2744] bg-white/80 px-3 py-1 rounded-full">
          {t("dt_ev_wall_elevation", { wall: WALL_LABELS[side] })}
        </div>
      )}

      {sorted.length === 0 && viewOpenings.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center px-6" style={textFlip}>
          {t("dt_ev_empty", { wall: WALL_LABELS[side].toLowerCase() })}
        </div>
      )}
    </div>
  );
}

// Decorative-hardware overlay. Draws the chosen hardware on a single front box:
// a door region (top) plus a stacked drawer region split into N equal drawers.
// Pieces are tiny CSS shapes positioned by percentage so they scale with zoom.
//   knob → small filled circle   pull → short horizontal bar   cup → half-moon
function HardwareOverlay({
  doors, drawers, doorPiece, drawerPiece, accent, handleSide,
}: {
  doors: number;
  drawers: number;
  doorPiece: "knob" | "pull" | "none";
  drawerPiece: "knob" | "pull" | "cup" | "none";
  accent: string;
  handleSide?: "left" | "right" | null;
}) {
  // Brushed-metal sheen: diagonal light streak over accent color with crisp
  // top highlight and soft drop shadow so pieces read as real metal hardware.
  const metal = `linear-gradient(135deg, color-mix(in srgb, ${accent} 55%, #ffffff) 0%, ${accent} 38%, color-mix(in srgb, ${accent} 70%, #000000) 72%, color-mix(in srgb, ${accent} 88%, #ffffff) 100%)`;
  const metalShadow = "0 2px 4px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.45)";
  // For door hardware (knobs), position on the handle side (opposite of hinge).
  // Drawers always center their hardware.
  const piece = (kind: "knob" | "pull" | "cup", key: string, topPct: number, isDoor?: boolean) => {
    // Door knobs go on the handle side; drawers stay centered
    const hSide = isDoor ? handleSide : null;
    if (kind === "knob") {
      const leftPos = hSide === "left" ? "18%" : hSide === "right" ? "82%" : "50%";
      return (
        <div
          key={key}
          className="absolute rounded-full"
          style={{ left: leftPos, top: `${topPct}%`, width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5, background: metal, boxShadow: metalShadow, zIndex: 8 }}
        />
      );
    }
    if (kind === "pull") {
      // Bar pulls: large, prominent, centered on drawers; on doors positioned on handle side
      // Width: ~42% of the cabinet face for doors, ~50% for drawers (like real bar pulls)
      const pullStyle = isDoor && hSide
        ? hSide === "left"
          ? { left: "6%", width: "38%", top: `${topPct}%`, height: 5, marginTop: -2.5, background: metal, boxShadow: metalShadow, zIndex: 8, borderRadius: 3 }
          : { right: "6%", width: "38%", top: `${topPct}%`, height: 5, marginTop: -2.5, background: metal, boxShadow: metalShadow, zIndex: 8, borderRadius: 3 }
        : { left: "25%", right: "25%", top: `${topPct}%`, height: 5, marginTop: -2.5, background: metal, boxShadow: metalShadow, zIndex: 8, borderRadius: 3 };
      return (
        <div
          key={key}
          className="absolute"
          style={pullStyle as React.CSSProperties}
        />
      );
    }
    // cup pull: a half-moon bin pull — always centered (drawers only)
    return (
      <div
        key={key}
        className="absolute"
        style={{
          left: "30%", right: "30%", top: `${topPct}%`, height: 7,
          borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
          border: `2px solid ${accent}`, borderTop: "none",
          background: `linear-gradient(180deg, transparent 0%, color-mix(in srgb, ${accent} 35%, transparent) 100%)`,
          boxShadow: "0 2px 3px rgba(0,0,0,0.35)", zIndex: 8,
        }}
      />
    );
  };

  const pieces: React.ReactNode[] = [];
  // Drawers stack from the top; doors fill the remainder below. When both are
  // present we give the top portion to the drawer stack (typical drawer base).
  const hasDrawers = drawers > 0 && drawerPiece !== "none";
  const hasDoors = doors > 0 && doorPiece !== "none";
  // Vertical share for the drawer band (rest goes to doors). All-drawer = 100%.
  const drawerBand = hasDrawers ? (hasDoors ? 45 : 100) : 0;

  if (hasDrawers) {
    for (let i = 0; i < drawers; i++) {
      // Center each drawer's pull within its slice of the drawer band.
      const sliceH = drawerBand / drawers;
      const center = sliceH * i + sliceH / 2;
      pieces.push(piece(drawerPiece as "knob" | "pull" | "cup", `dr-${i}`, center, false));
    }
  }
  if (hasDoors) {
    // Knob/pull near the bottom inner corner of the door band — positioned on
    // the handle side (opposite of the hinge).
    // Bar pulls: position near the bottom 20% of the door (like real kitchens).
    // Knobs: position near the top 15% of the door (near the handle side corner).
    const doorTop = drawerBand + (100 - drawerBand) * (doorPiece === "knob" ? 0.15 : 0.78);
    for (let i = 0; i < Math.min(doors, 2); i++) {
      pieces.push(piece(doorPiece as "knob" | "pull", `do-${i}`, doorTop, true));
    }
  }

  return <>{pieces}</>;
}

// One door/drawer face panel rendered in the chosen door style. Used both for
// the door region and for each individual drawer front so a drawer base reads
// as a real stack of drawer fronts rather than one big door.
function StylePanel({ kind, edge, face, drawer = false, doorSampleUrl, drawerSampleUrl }: { kind: DoorPanelKind; edge: string; face: string; drawer?: boolean; doorSampleUrl?: string | null; drawerSampleUrl?: string | null }) {
  // When rendering a drawer front, prefer the dedicated drawer photo over the door photo.
  const effectiveDoorUrl = drawer ? (drawerSampleUrl ?? doorSampleUrl) : doorSampleUrl;
  // Drawers always read as a slim single recessed front regardless of the door
  // style (drawer fronts don't get raised/beaded treatments in this model),
  // except slab which stays flat.
  if (drawer) {
    // Apply the photo (drawer sample preferred, door sample as fallback) when available.
    const photoStyle: React.CSSProperties = effectiveDoorUrl
      ? { backgroundImage: `url(${effectiveDoorUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
      : {};
    if (kind === "slab") {
      return (
        <div
          className="absolute inset-[1.5px] rounded-[1.5px]"
          style={{
            ...photoStyle,
            border: `1px solid ${edge}55`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.18)`,
          }}
        />
      );
    }
    // Shaker / framed styles: outer rail bevel + recessed inner panel with photo.
    return (
      <div
        className="absolute inset-[1.5px] rounded-[1.5px]"
        style={{
          border: `1px solid ${edge}66`,
          boxShadow: `inset 1px 1px 0 rgba(255,255,255,0.35), inset -1px -1px 1px rgba(0,0,0,0.20)`,
        }}
      >
        <div
          className="absolute inset-[3px] rounded-[1px]"
          style={{
            ...photoStyle,
            ...(effectiveDoorUrl ? {} : {
              background: `linear-gradient(180deg, color-mix(in srgb, ${face} 88%, #000) 0%, color-mix(in srgb, ${face} 94%, #000) 100%)`,
            }),
            border: `1px solid ${edge}44`,
            boxShadow: `inset 0 2px 3px rgba(0,0,0,0.25), inset 0 -1px 0 rgba(255,255,255,0.20)`,
          }}
        />
      </div>
    );
  }
  return <DoorFront kind={kind} edge={edge} face={face} doorSampleUrl={effectiveDoorUrl} />;
}

// Lightweight door-front detail overlay that reflects the active door style so a
// placed cabinet visibly changes appearance when the user switches styles. When
// `drawers` > 0 it splits the face into a top drawer band (one front per drawer)
// and a door region below, so drawer bases show their real drawer fronts.
function DoorFront({ kind, edge, face, doors, drawers, isWall, doorSampleUrl, drawerSampleUrl, cabinetType, blindOnLeft, cabinetHeightIn, faceFillOverride, ovenType }: { kind: DoorPanelKind; edge: string; face: string; doors?: number; drawers?: number; isWall?: boolean; doorSampleUrl?: string | null; drawerSampleUrl?: string | null; cabinetType?: CabinetDrawingType | null; blindOnLeft?: boolean; cabinetHeightIn?: number; faceFillOverride?: string; ovenType?: "single" | "double" | null }) {
  const drawerCount = drawers ?? 0;
  const doorCount = doors ?? 0;
  const stroke = `${edge}99`;
  // The face fill (cabinet face frame color) is applied as a full-bleed background
  // on this component's root so the outer container can be transparent (no box).
  // Photorealistic face frame: strong top-light highlight (simulates overhead room
  // lighting), rich mid-tone body, subtle bottom shadow for depth.
  const faceBackground = faceFillOverride ?? `linear-gradient(180deg, color-mix(in srgb, ${face} 96%, #ffffff) 0%, ${face} 30%, ${face} 70%, color-mix(in srgb, ${face} 90%, #000000) 100%)`;

  // Helper: wrap content in a root div that carries the face-frame background.
  // This keeps the outer cabinet container transparent (no visible box).
  const withFace = (children: React.ReactNode) => (
    <div className="absolute inset-0" style={{ background: faceBackground }}>
      {children}
    </div>
  );

  // ─── SPECIALTY TYPE: OVEN TALL ────────────────────────────────────────
  // Oven tall cabinets (O-code): 2 upper doors at top + appliance opening in
  // the middle + drawers at the bottom.
  // Single oven: opening ≈ 50% of height, 3 drawers below.
  // Double oven: opening ≈ 60% of height, 1 drawer below.
  if (cabinetType === "oven-tall") {
    const totalH = cabinetHeightIn ?? 84;
    const isDouble = ovenType === "double";
    // Upper door section: top ~20% of cabinet
    const upperDoorPct = 20;
    // Appliance opening: single=50%, double=62%
    const openingPct = isDouble ? 62 : 50;
    // Drawers fill the rest at the bottom
    const drawerAreaPct = 100 - upperDoorPct - openingPct;
    const drawerCount2 = isDouble ? 1 : 3;
    const drawerH = drawerAreaPct / drawerCount2;
    const ovenImgUrl = isDouble
      ? "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/oven-double-front-n2DaWbuTecczH4YKk7fJbo.webp"
      : "https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/oven-single-front-U843ihaYrWbB8xwKsMyngZ.webp";
    return withFace(
      <>
        {/* Upper section: 2 side-by-side doors */}
        <div className="absolute left-0 right-0 top-0" style={{ height: `${upperDoorPct}%` }}>
          {[0, 1].map((i) => (
            <div
              key={`oven-top-${i}`}
              className="absolute top-0 bottom-0"
              style={{ left: `${50 * i}%`, width: "50%" }}
            >
              {i > 0 && (
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: stroke }} />
              )}
              <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={false} />
            </div>
          ))}
        </div>
        {/* Horizontal rail between upper doors and oven opening */}
        <div className="absolute left-0 right-0" style={{ top: `${upperDoorPct}%`, height: 2, background: stroke }} />
        {/* Appliance opening: oven image */}
        <div
          className="absolute left-0 right-0"
          style={{
            top: `${upperDoorPct}%`,
            height: `${openingPct}%`,
            background: "#1a1a1a",
            overflow: "hidden",
          }}
        >
          <img
            src={ovenImgUrl}
            alt={isDouble ? "Double oven" : "Single oven"}
            className="w-full h-full object-cover"
            style={{ objectPosition: "center center" }}
          />
        </div>
        {/* Horizontal rail between oven opening and drawers */}
        <div className="absolute left-0 right-0" style={{ top: `${upperDoorPct + openingPct}%`, height: 2, background: stroke }} />
        {/* Drawer section at bottom */}
        {Array.from({ length: drawerCount2 }).map((_, i) => (
          <div
            key={`oven-drawer-${i}`}
            className="absolute left-0 right-0"
            style={{
              top: `${upperDoorPct + openingPct + drawerH * i}%`,
              height: `${drawerH}%`,
            }}
          >
            {i > 0 && (
              <div className="absolute top-0 left-0 right-0" style={{ height: 2, background: stroke }} />
            )}
            <StylePanel kind={kind} edge={edge} face={face} drawer doorSampleUrl={doorSampleUrl} drawerSampleUrl={drawerSampleUrl} />
          </div>
        ))}
      </>
    );
  }

  // ─── SPECIALTY TYPE: PANTRY (tall cabinet) ───────────────────────────
  // All tall pantry cabinets render as 4 doors: 2 side-by-side on the bottom
  // section (floor to 54") and 2 side-by-side on the top section (54" to top).
  if (cabinetType === "pantry") {
    const totalH = cabinetHeightIn ?? 84; // default 84" if not provided
    const splitIn = 54; // split point in inches from floor
    // Clamp split so it's always between 20% and 80% of the cabinet height
    const splitPct = Math.min(80, Math.max(20, (splitIn / totalH) * 100));
    return withFace(
      <>
        {/* Bottom section: 2 side-by-side doors from floor to 54" */}
        <div className="absolute left-0 right-0 bottom-0" style={{ height: `${splitPct}%` }}>
          {[0, 1].map((i) => (
            <div
              key={`pantry-bot-${i}`}
              className="absolute top-0 bottom-0"
              style={{ left: `${50 * i}%`, width: "50%" }}
            >
              {i > 0 && (
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: stroke }} />
              )}
              <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={isWall} />
            </div>
          ))}
        </div>
        {/* Horizontal rail at the split point */}
        <div
          className="absolute left-0 right-0"
          style={{ bottom: `${splitPct}%`, height: 2, background: stroke }}
        />
        {/* Top section: 2 side-by-side doors from 54" to top */}
        <div className="absolute left-0 right-0 top-0" style={{ height: `${100 - splitPct}%` }}>
          {[0, 1].map((i) => (
            <div
              key={`pantry-top-${i}`}
              className="absolute top-0 bottom-0"
              style={{ left: `${50 * i}%`, width: "50%" }}
            >
              {i > 0 && (
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: stroke }} />
              )}
              <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={isWall} />
            </div>
          ))}
        </div>
      </>
    );
  }

  // ─── SPECIALTY TYPE: SINK BASE ─────────────────────────────────────────
  // Sink bases have a narrow false tilt-out panel at the top (for the tip-out
  // tray) and two doors below. The false front is thinner than a normal drawer.
  if (cabinetType === "sink-base") {
    const falseFrontPct = 14; // narrow tilt-out tray panel
    const cols = Math.max(1, doorCount || 2);
    const colW = 100 / cols;
    return withFace(
      <>
        {/* false front (tilt-out tray) */}
        <div className="absolute left-0 right-0 top-0" style={{ height: `${falseFrontPct}%` }}>
          <div
            className="absolute inset-[1.5px] rounded-[1px]"
            style={{
              ...(doorSampleUrl ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px ${edge}55`,
            }}
          />
        </div>
        {/* rail between false front and doors */}
        <div className="absolute left-0 right-0" style={{ top: `${falseFrontPct}%`, height: 2, background: stroke }} />
        {/* door region: N side-by-side doors */}
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={`sink-door-${i}`}
            className="absolute"
            style={{ left: `${colW * i}%`, width: `${colW}%`, top: `${falseFrontPct}%`, bottom: 0 }}
          >
            {i > 0 && (
              <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: stroke }} />
            )}
            <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={isWall} />
          </div>
        ))}
      </>
    );
  }

  // ─── SPECIALTY TYPE: GLASS DOOR ────────────────────────────────────────
  // Glass-front cabinets: show the door frame with a lighter/translucent center
  // panel to indicate glass instead of a solid wood panel.
  if (cabinetType === "glass-door") {
    const numDoors = Math.max(1, doorCount);
    const doorWidthPct = 100 / numDoors;
    return withFace(
      <>
        {Array.from({ length: numDoors }).map((_, i) => (
          <div
            key={`glass-${i}`}
            className="absolute top-0 bottom-0"
            style={{ left: `${doorWidthPct * i}%`, width: `${doorWidthPct}%` }}
          >
            {i > 0 && (
              <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: stroke }} />
            )}
            {/* Outer rail bevel */}
            <div
              className="absolute inset-0 rounded-[2px]"
              style={{ boxShadow: `inset 1.5px 1.5px 0 rgba(255,255,255,0.26), inset -1.5px -1.5px 1px rgba(0,0,0,0.20)` }}
            >
              {/* Glass panel: lighter, semi-transparent to indicate glass */}
              <div
                className="absolute inset-[6px] rounded-[1.5px]"
                style={{
                  background: `linear-gradient(180deg, rgba(200,220,240,0.35) 0%, rgba(180,200,220,0.25) 50%, rgba(160,185,210,0.30) 100%)`,
                  boxShadow: `inset 0 1px 4px rgba(255,255,255,0.40), inset 0 -1px 3px rgba(0,0,0,0.12), 0 0 0 0.5px ${edge}66`,
                }}
              />
            </div>
          </div>
        ))}
      </>
    );
  }

  // ─── SPECIALTY TYPE: BLIND CORNER ──────────────────────────────────────
  // Blind corner cabinets: show the visible door portion (typically one door)
  // with a subtle blind panel indicator on the hidden side. The door
  // automatically flips to the EXPOSED side (away from the wall corner).
  if (cabinetType === "blind-corner") {
    // The visible face is typically ~60% of the width; the blind portion is hidden.
    const visiblePct = 60;
    // blindOnLeft defaults to true (blind on left, door on right).
    // When false, the corner is on the right so we flip: door on left, blind on right.
    const bLeft = blindOnLeft !== false;
    return withFace(
      <>
        {/* Blind (hidden) portion: subtle hatched/darker area */}
        <div
          className="absolute top-0 bottom-0"
          style={bLeft ? { left: 0, width: `${100 - visiblePct}%` } : { right: 0, width: `${100 - visiblePct}%` }}
        >
          <div
            className="absolute inset-[2px] rounded-[1px]"
            style={{
              background: `repeating-linear-gradient(135deg, ${face}22 0px, ${face}22 3px, ${edge}33 3px, ${edge}33 4px)`,
              boxShadow: `inset 0 0 4px rgba(0,0,0,0.15)`,
            }}
          />
        </div>
        {/* Visible door portion */}
        <div
          className="absolute top-0 bottom-0"
          style={bLeft ? { left: `${100 - visiblePct}%`, width: `${visiblePct}%` } : { left: 0, width: `${visiblePct}%` }}
        >
          <div className={`absolute top-0 bottom-0 ${bLeft ? 'left-0' : 'right-0'}`} style={{ width: 2, background: stroke }} />
          <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={isWall} />
        </div>
      </>
    );
  }

  // ─── SPECIALTY TYPE: APPLIANCE GARAGE ──────────────────────────────────
  // Tambour/roll-up slat pattern.
  if (cabinetType === "appliance-garage") {
    return withFace(
      <div
        className="absolute inset-[1.5px] rounded-[2px]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, color-mix(in srgb, ${face} 95%, #fff) 0px, color-mix(in srgb, ${face} 95%, #fff) 4px, color-mix(in srgb, ${face} 80%, #000) 4px, color-mix(in srgb, ${face} 80%, #000) 5px)`,
          boxShadow: `inset 0 2px 4px rgba(0,0,0,0.20), 0 0 0 0.5px ${edge}66`,
        }}
      />
    );
  }

  // ─── SPECIALTY TYPE: CORNER DRAWER BASE ─────────────────────────────────
  // Corner drawer bases (CDB-*): L-shaped footprint with stacked drawers on
  // the main visible face. Renders as a full-height drawer stack (like a
  // drawer base) but with a small corner indicator on the left edge.
  if (cabinetType === "corner-drawer-base") {
    const dCount = Math.max(1, drawerCount || 3);
    const sliceH = 100 / dCount;
    return withFace(
      <>
        {/* Corner indicator: subtle angled mark on left edge */}
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{ width: "8%" }}
        >
          <div
            className="absolute inset-[2px] rounded-[1px]"
            style={{
              background: `repeating-linear-gradient(135deg, ${face}22 0px, ${face}22 3px, ${edge}33 3px, ${edge}33 4px)`,
              boxShadow: `inset 0 0 3px rgba(0,0,0,0.12)`,
            }}
          />
        </div>
        {/* Main drawer stack */}
        <div className="absolute top-0 bottom-0" style={{ left: "8%", right: 0 }}>
          {Array.from({ length: dCount }).map((_, i) => (
            <div
              key={`cdb-drw-${i}`}
              className="absolute left-0 right-0"
              style={{ top: `${sliceH * i}%`, height: `${sliceH}%` }}
            >
              {i > 0 && (
                <div className="absolute left-0 right-0 top-0" style={{ height: 2, background: stroke }} />
              )}
                            <StylePanel kind={kind} edge={edge} face={face} drawer doorSampleUrl={doorSampleUrl} drawerSampleUrl={drawerSampleUrl} />
            </div>
          ))}
        </div>
      </>
    );
  }
  // ─── STANDARD: DRAWERS + DOORS ─────────────────────────────────────────
  // When a cabinet has drawers, draw the drawer stack + (optional) door region.
  if (drawerCount > 0) {
    const hasDoors = doorCount > 0;
    if (hasDoors) {
      // STANDARD BASE: a short TOP drawer band (one drawer front per door, laid
      // out SIDE-BY-SIDE so they line up over the doors) above a door region
      // split into the same number of side-by-side doors below.
      const drawerBandPct = 26;
      const cols = Math.max(1, doorCount);
      const colW = 100 / cols;
      return withFace(
        <>
          {/* top drawer band: one drawer front per column */}
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={`tdrw-${i}`}
              className="absolute top-0"
              style={{ left: `${colW * i}%`, width: `${colW}%`, height: `${drawerBandPct}%` }}
            >
              {i > 0 && (
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: stroke }} />
              )}
              <StylePanel kind={kind} edge={edge} face={face} drawer doorSampleUrl={doorSampleUrl} drawerSampleUrl={drawerSampleUrl} />
            </div>
          ))}
          {/* rail between the drawer band and the doors */}
          <div className="absolute left-0 right-0" style={{ top: `${drawerBandPct}%`, height: 2, background: stroke }} />
          {/* door region: N side-by-side doors */}
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={`bdoor-${i}`}
              className="absolute"
              style={{ left: `${colW * i}%`, width: `${colW}%`, top: `${drawerBandPct}%`, bottom: 0 }}
            >
              {i > 0 && (
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: stroke }} />
              )}
              <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={isWall} />
            </div>
          ))}
        </>
      );
    }
    // DRAWER BASE (all-drawer, no doors): a vertical STACK of drawer fronts.
    const sliceH = 100 / drawerCount;
    return withFace(
      <>
        {Array.from({ length: drawerCount }).map((_, i) => (
          <div
            key={`drw-${i}`}
            className="absolute left-0 right-0"
            style={{ top: `${sliceH * i}%`, height: `${sliceH}%` }}
          >
            {i > 0 && (
              <div className="absolute left-0 right-0 top-0" style={{ height: 2, background: stroke }} />
            )}
            <StylePanel kind={kind} edge={edge} face={face} drawer doorSampleUrl={doorSampleUrl} drawerSampleUrl={drawerSampleUrl} />
          </div>
        ))}
      </>
    );
  }
  void isWall;
  // For multi-door cabinets, split the face into N side-by-side door panels
  // separated by a center stile. Each panel gets its own style treatment.
  const numDoors = Math.max(1, doorCount);
  if (numDoors > 1) {
    const doorWidthPct = 100 / numDoors;
    return withFace(
      <>
        {Array.from({ length: numDoors }).map((_, i) => (
          <div
            key={`door-${i}`}
            className="absolute top-0 bottom-0"
            style={{ left: `${doorWidthPct * i}%`, width: `${doorWidthPct}%` }}
          >
            {/* stile between doors */}
            {i > 0 && (
              <div
                className="absolute top-0 bottom-0 left-0"
                style={{ width: 2, background: stroke }}
              />
            )}
            <SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={isWall} />
          </div>
        ))}
      </>
    );
  }
  return withFace(<SingleDoorPanel kind={kind} edge={edge} face={face} stroke={stroke} doorSampleUrl={doorSampleUrl} isWall={isWall} />);
}

// A recessed center panel with real depth: darkened, top-shadowed fill inside a
// beveled reveal. Reused by every framed door style. `inset` is the px gap from
// the door edge to the panel (i.e. the rail width). `depth` tunes how deep the
// panel reads. `raised` adds a central raised field (cathedral/raised-panel).
function RecessedPanel({ inset, face, edge, raised = false, doorSampleUrl, isWall }: { inset: number; face: string; edge: string; raised?: boolean; doorSampleUrl?: string | null; isWall?: boolean }) {
  // For wall cabinets the door-sample photo often includes a drawer front at the
  // top (it's a base-cabinet door+drawer combo shot). Anchor to the bottom of
  // the image so only the door panel portion is visible.
  const samplePos = isWall ? "center 80%" : "center";
  const panelBg = doorSampleUrl
    ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover" as const, backgroundPosition: samplePos }
    : { background: `linear-gradient(180deg, color-mix(in srgb, ${face} 78%, #000) 0%, color-mix(in srgb, ${face} 88%, #000) 45%, color-mix(in srgb, ${face} 96%, #000) 100%)` };
  return (
    <div
      className="absolute rounded-[1.5px]"
      style={{
        inset,
        // Deep reveal groove: strong top shadow (rail overhang), bright bottom
        // lip (light bouncing off the panel floor), dark left shadow (side rail
        // overhang), subtle right highlight. This makes the panel read as truly
        // recessed into the face frame.
        boxShadow: `inset 0 3.5px 7px rgba(0,0,0,0.42), inset 3px 0 5px rgba(0,0,0,0.18), inset 0 -1.5px 0 rgba(255,255,255,0.28), inset -2px 0 3px rgba(255,255,255,0.12), 0 0 0 0.5px ${edge}80`,
        ...panelBg,
      }}
    >
      {raised && (
        <div
          className="absolute inset-[3px] rounded-[1.5px]"
          style={{
            // Raised field: lighter at top (catches overhead light), slightly
            // darker at bottom. Strong bevel shadow on all 4 edges makes it
            // read as a real raised wood panel.
            background: doorSampleUrl ? undefined : `linear-gradient(180deg, color-mix(in srgb, ${face} 96%, #fff) 0%, color-mix(in srgb, ${face} 98%, #fff) 35%, ${face} 65%, color-mix(in srgb, ${face} 92%, #000) 100%)`,
            ...(doorSampleUrl ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover" as const, backgroundPosition: "center" as const } : {}),
            boxShadow: `0 2px 4px rgba(0,0,0,0.32), inset 1.5px 1.5px 0 rgba(255,255,255,0.40), inset -1.5px -1.5px 2px rgba(0,0,0,0.24)`,
          }}
        />
      )}
    </div>
  );
}

// Renders a single door panel in the chosen style. Used by DoorFront for each
// individual door in a multi-door cabinet. Each framed style uses a beveled
// outer rail (light top-left / dark bottom-right) plus a RecessedPanel so the
// door reads as a real 3D door rather than flat outlines.
function SingleDoorPanel({ kind, edge, face, stroke, doorSampleUrl, isWall }: { kind: DoorPanelKind; edge: string; face: string; stroke: string; doorSampleUrl?: string | null; isWall?: boolean }) {
  void stroke;
  // Beveled outer rail applied to the whole door face (shared by framed styles).
  // Strong bevel on the outer rail: bright top-left highlight (light hits the
  // top rail and left stile), dark bottom-right shadow (underside of bottom rail
  // and right stile). Makes the face frame read as real routed wood.
  const railBevel: React.CSSProperties = {
    boxShadow: `inset 2px 2px 0 rgba(255,255,255,0.38), inset -2px -2px 2px rgba(0,0,0,0.28)`,
    borderRadius: 2,
  };
  switch (kind) {
    case "slab":
      // Flat modern door: no panel, just a machined edge + soft top highlight.
      // When a door sample is available, use it as the slab face.
      return (
        <div
          className="absolute inset-[1.5px] rounded-[2px]"
          style={{
            ...(doorSampleUrl ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover", backgroundPosition: isWall ? "center 80%" : "center" } : {}),
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -2px 3px rgba(0,0,0,0.14), 0 0 0 1px ${edge}44`,
          }}
        />
      );
    case "double-shaker":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <div className="absolute left-[6px] right-[6px] top-[6px] bottom-[50.5%]">
            <RecessedPanel inset={0} face={face} edge={edge} doorSampleUrl={doorSampleUrl} isWall={isWall} />
          </div>
          <div className="absolute left-[6px] right-[6px] top-[50.5%] bottom-[6px]">
            <RecessedPanel inset={0} face={face} edge={edge} doorSampleUrl={doorSampleUrl} isWall={isWall} />
          </div>
        </div>
      );
    case "raised":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <RecessedPanel inset={6} face={face} edge={edge} raised doorSampleUrl={doorSampleUrl} isWall={isWall} />
        </div>
      );
    case "beaded":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <div
            className="absolute inset-[5px] rounded-[1px]"
            style={{
              boxShadow: `inset 0 2px 4px rgba(0,0,0,0.24), 0 0 0 0.5px ${edge}66`,
              ...(doorSampleUrl
                ? { backgroundImage: `url(${doorSampleUrl})`, backgroundSize: "cover", backgroundPosition: isWall ? "center 80%" : "center" }
                : { backgroundImage: `repeating-linear-gradient(90deg, color-mix(in srgb, ${face} 90%, #000) 0px, color-mix(in srgb, ${face} 90%, #000) 2px, color-mix(in srgb, ${face} 78%, #000) 2.5px, color-mix(in srgb, ${face} 90%, #000) 3px, color-mix(in srgb, ${face} 90%, #000) 4px)` }),
            }}
          />
        </div>
      );
    case "inset":
      return (
        <div
          className="absolute inset-[2px] rounded-[2px]"
          style={{ boxShadow: `0 0 0 1px ${edge}77, inset 1px 1px 0 rgba(255,255,255,0.22), inset -1px -1px 1px rgba(0,0,0,0.18)` }}
        >
          <RecessedPanel inset={5} face={face} edge={edge} doorSampleUrl={doorSampleUrl} isWall={isWall} />
        </div>
      );
    case "slim-shaker":
      return (
        <div className="absolute inset-0" style={railBevel}>
          <RecessedPanel inset={3} face={face} edge={edge} doorSampleUrl={doorSampleUrl} isWall={isWall} />
        </div>
      );
    case "shaker":
    default:
      return (
        <div className="absolute inset-0" style={railBevel}>
          <RecessedPanel inset={6} face={face} edge={edge} doorSampleUrl={doorSampleUrl} isWall={isWall} />
        </div>
      );
  }
}
