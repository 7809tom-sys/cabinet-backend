import { useMemo } from "react";
import {
  cabinetDrawingType,
  cabinetAltText,
  resolveDoorDrawerCounts,
  type CabinetLike,
  type CabinetDrawingType,
} from "@/lib/cabinetGraphics";

interface CabinetDrawingProps {
  cabinet: CabinetLike;
  /** Optional override of the door/finish color (e.g. selected style finish). */
  finishColor?: string;
  className?: string;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Stroke + fill palette (kept neutral so the selected door finish can override fill).
const STROKE = "#334155"; // slate-700
const STROKE_LIGHT = "#94a3b8"; // slate-400
const DEFAULT_FILL = "#e2e8f0"; // slate-200
const PANEL_FILL = "#f1f5f9"; // slate-100

/**
 * Renders an accurate, to-scale 2D front-elevation line drawing of a cabinet.
 * The box proportions come from the model's real width/height, so a 12" base
 * looks narrow and a 30" base looks wide. The front detail is drawn per type.
 */
export function CabinetDrawing({ cabinet, finishColor, className }: CabinetDrawingProps) {
  const type = useMemo(() => cabinetDrawingType(cabinet), [cabinet]);
  const alt = useMemo(() => cabinetAltText(cabinet), [cabinet]);

  // Real dimensions with sensible fallbacks per placement.
  const w = toNum(cabinet.width) ?? 24;
  const placement = (cabinet.placementType ?? cabinet.category ?? "").toLowerCase();
  const fallbackH =
    placement.includes("wall") ? 30 : placement.includes("tall") ? 84 : 34.5;
  const h = toNum(cabinet.height) ?? fallbackH;

  // Use a tight viewBox that matches the cabinet's real aspect ratio so the
  // drawing fills the container edge-to-edge with no surrounding whitespace.
  const SCALE = 100; // arbitrary internal unit — only the ratio matters
  const ratio = Math.max(0.25, Math.min(w / h, 3.2)); // width/height, clamped
  const vbW = ratio >= 1 ? SCALE : SCALE * ratio;
  const vbH = ratio >= 1 ? SCALE / ratio : SCALE;
  const x0 = 0;
  const y0 = 0;
  const boxW = vbW;
  const boxH = vbH;

  const fill = finishColor ?? DEFAULT_FILL;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={className}
      role="img"
      aria-label={alt}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{alt}</title>
      <FrontByType type={type} x={x0} y={y0} w={boxW} h={boxH} fill={fill} cabinet={cabinet} />
    </svg>
  );
}

interface FrontProps {
  type: CabinetDrawingType;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  cabinet: CabinetLike;
}

function FrontByType({ type, x, y, w, h, fill, cabinet }: FrontProps) {
  switch (type) {
    case "drawer-base":
      return <DrawerBaseFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
    case "sink-base":
      return <SinkBaseFront x={x} y={y} w={w} h={h} fill={fill} />;
    case "appliance-garage":
      return <ApplianceGarageFront x={x} y={y} w={w} h={h} fill={fill} />;
    case "blind-corner":
      return <BlindCornerFront x={x} y={y} w={w} h={h} fill={fill} />;
    case "diagonal-corner":
      return <DiagonalCornerFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
    case "l-corner":
      return <LCornerFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
    case "corner-drawer-base":
      return <CornerDrawerBaseFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
    case "accessory-strip":
      return <AccessoryStrip x={x} y={y} w={w} h={h} fill={fill} />;
    case "glass-door":
      return <GlassDoorFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
    case "pantry":
      return <PantryFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
    case "oven-tall":
      return <OvenTallFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
    case "vanity":
    case "ada":
    case "standard-door":
    default:
      return <StandardDoorFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
  }
}

function Box({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      fill={fill}
      stroke={STROKE}
      strokeWidth={1.6}
    />
  );
}

// Standard door cabinet: outer box + 1..N door panels, optional top drawer row.
function StandardDoorFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const counts = resolveDoorDrawerCounts(cabinet ?? {});
  const doors = Math.max(1, counts.doors || (w > 21 ? 2 : 1));
  const drawers = counts.drawers;
  const inset = 4;
  const hasTopDrawer = drawers > 0;
  const drawerH = hasTopDrawer ? Math.min(14, h * 0.18) : 0;
  const doorTop = y + inset + (hasTopDrawer ? drawerH + inset : 0);
  const doorBottom = y + h - inset;
  const doorAreaH = doorBottom - doorTop;
  const innerW = w - inset * 2;
  const doorW = (innerW - (doors - 1) * 3) / doors;
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      {hasTopDrawer && (
        <rect
          x={x + inset}
          y={y + inset}
          width={innerW}
          height={drawerH}
          rx={1.5}
          fill={PANEL_FILL}
          stroke={STROKE_LIGHT}
          strokeWidth={1}
        />
      )}
      {Array.from({ length: doors }).map((_, i) => (
        <g key={i}>
          <rect
            x={x + inset + i * (doorW + 3)}
            y={doorTop}
            width={doorW}
            height={doorAreaH}
            rx={1.5}
            fill={PANEL_FILL}
            stroke={STROKE_LIGHT}
            strokeWidth={1}
          />
          {/* handle */}
          <circle
            cx={x + inset + i * (doorW + 3) + (i === doors - 1 && doors > 1 ? 4 : doorW - 4)}
            cy={doorTop + doorAreaH / 2}
            r={1.4}
            fill={STROKE}
          />
        </g>
      ))}
    </g>
  );
}

// Drawer base: stack of drawer fronts (count from data, default 3).
function DrawerBaseFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const n = Math.max(1, resolveDoorDrawerCounts(cabinet ?? {}).drawers || 3);
  const inset = 4;
  const gap = 3;
  const innerW = w - inset * 2;
  const innerH = h - inset * 2;
  const dh = (innerH - (n - 1) * gap) / n;
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      {Array.from({ length: n }).map((_, i) => (
        <g key={i}>
          <rect
            x={x + inset}
            y={y + inset + i * (dh + gap)}
            width={innerW}
            height={dh}
            rx={1.5}
            fill={PANEL_FILL}
            stroke={STROKE_LIGHT}
            strokeWidth={1}
          />
          {/* bar pull */}
          <rect
            x={x + w / 2 - innerW * 0.18}
            y={y + inset + i * (dh + gap) + dh / 2 - 0.8}
            width={innerW * 0.36}
            height={1.6}
            rx={0.8}
            fill={STROKE}
          />
        </g>
      ))}
    </g>
  );
}

// Sink base: false (non-functional) tilt-out top panel + doors below, with a
// sink-cutout indication on the top edge — explicitly NOT a plain straight top.
function SinkBaseFront({ x, y, w, h, fill }: Omit<FrontProps, "type" | "cabinet">) {
  const inset = 4;
  const innerW = w - inset * 2;
  const falseFrontH = Math.min(12, h * 0.16);
  const doorTop = y + inset + falseFrontH + inset;
  const doorBottom = y + h - inset;
  const doorAreaH = doorBottom - doorTop;
  const doorW = (innerW - 3) / 2;
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      {/* sink cutout indication: dashed basin arc above the cabinet top */}
      <path
        d={`M ${x + w * 0.3} ${y + 2.5} a ${w * 0.2} ${4} 0 0 0 ${w * 0.4} 0`}
        fill="none"
        stroke={STROKE_LIGHT}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      {/* false tilt-out front (tilt hinge line at bottom) */}
      <rect
        x={x + inset}
        y={y + inset}
        width={innerW}
        height={falseFrontH}
        rx={1.5}
        fill={PANEL_FILL}
        stroke={STROKE_LIGHT}
        strokeWidth={1}
      />
      <line
        x1={x + inset + 3}
        y1={y + inset + falseFrontH}
        x2={x + inset + innerW - 3}
        y2={y + inset + falseFrontH}
        stroke={STROKE_LIGHT}
        strokeWidth={1}
      />
      {/* two doors below */}
      {[0, 1].map((i) => (
        <rect
          key={i}
          x={x + inset + i * (doorW + 3)}
          y={doorTop}
          width={doorW}
          height={doorAreaH}
          rx={1.5}
          fill={PANEL_FILL}
          stroke={STROKE_LIGHT}
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

// Appliance garage: countertop unit with a tambour (roll-up) door = horizontal slats.
function ApplianceGarageFront({ x, y, w, h, fill }: Omit<FrontProps, "type" | "cabinet">) {
  const inset = 4;
  const innerW = w - inset * 2;
  const innerH = h - inset * 2;
  const slats = Math.max(4, Math.round(innerH / 4));
  const sh = innerH / slats;
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      <rect
        x={x + inset}
        y={y + inset}
        width={innerW}
        height={innerH}
        rx={1.5}
        fill={PANEL_FILL}
        stroke={STROKE_LIGHT}
        strokeWidth={1}
      />
      {Array.from({ length: slats - 1 }).map((_, i) => (
        <line
          key={i}
          x1={x + inset}
          y1={y + inset + (i + 1) * sh}
          x2={x + inset + innerW}
          y2={y + inset + (i + 1) * sh}
          stroke={STROKE_LIGHT}
          strokeWidth={0.9}
        />
      ))}
    </g>
  );
}

// Diagonal corner: pentagon/hexagon shape with 45° angled front face.
// Shows the cabinet as seen from above (plan-view-like) with the angled front
// containing door panel(s). Matches catalog drawings like DCW, WDC, DCB.
function DiagonalCornerFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const doors = Math.max(1, resolveDoorDrawerCounts(cabinet ?? {}).doors || 1);
  // Pentagon shape: two short sides along walls + angled front face
  // The angled front cuts across the corner at 45°
  const legDepth = w * 0.35; // how far it extends along each wall
  const path = `
    M ${x} ${y}
    L ${x + w} ${y}
    L ${x + w} ${y + legDepth}
    L ${x + legDepth} ${y + h}
    L ${x} ${y + h}
    Z`;
  // The angled face runs from (x+w, y+legDepth) to (x+legDepth, y+h)
  // Door panels are drawn on this angled face
  const faceStartX = x + w;
  const faceStartY = y + legDepth;
  const faceEndX = x + legDepth;
  const faceEndY = y + h;
  // Door panel inset from the angled face
  const faceLen = Math.sqrt((faceEndX - faceStartX) ** 2 + (faceEndY - faceStartY) ** 2);
  const angle = Math.atan2(faceEndY - faceStartY, faceEndX - faceStartX);
  // Draw door panel(s) as rotated rectangles on the angled face
  const doorInset = faceLen * 0.08;
  const doorLen = (faceLen - doorInset * 2 - (doors - 1) * 3) / doors;
  const doorDepth = Math.min(w * 0.22, h * 0.22);
  // Normal vector pointing inward (perpendicular to face, toward interior)
  const nx = Math.cos(angle + Math.PI / 2);
  const ny = Math.sin(angle + Math.PI / 2);
  return (
    <g>
      <path d={path} fill={fill} stroke={STROKE} strokeWidth={1.6} strokeLinejoin="round" />
      {/* Door panel(s) on the angled face */}
      {Array.from({ length: doors }).map((_, i) => {
        const startOffset = doorInset + i * (doorLen + 3);
        // Position along the face direction
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const px = faceStartX + dx * (startOffset + doorLen / 2);
        const py = faceStartY + dy * (startOffset + doorLen / 2);
        // Offset inward from face
        const cx = px + nx * (doorDepth / 2 + 2);
        const cy = py + ny * (doorDepth / 2 + 2);
        const angleDeg = (angle * 180) / Math.PI;
        return (
          <g key={i} transform={`rotate(${angleDeg} ${cx} ${cy})`}>
            <rect
              x={cx - doorLen / 2}
              y={cy - doorDepth / 2}
              width={doorLen}
              height={doorDepth}
              rx={1.5}
              fill={PANEL_FILL}
              stroke={STROKE_LIGHT}
              strokeWidth={1}
            />
            {/* handle */}
            <circle
              cx={cx + (i === 0 ? doorLen * 0.35 : -doorLen * 0.35)}
              cy={cy}
              r={1.2}
              fill={STROKE}
            />
          </g>
        );
      })}
    </g>
  );
}

// L-shaped corner: square footprint with L-notch at interior corner.
// Shows doors on the exposed face (lazy Susan, easy-reach corner).
function LCornerFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const doors = Math.max(1, resolveDoorDrawerCounts(cabinet ?? {}).doors || 2);
  const inset = 4;
  // L-shape: full width top, full height left, notch cut from bottom-right
  const legW = w * 0.65; // leg width (how far along each wall)
  const legH = h * 0.65;
  const path = `
    M ${x} ${y}
    L ${x + w} ${y}
    L ${x + w} ${y + legH}
    L ${x + legW} ${y + legH}
    L ${x + legW} ${y + h}
    L ${x} ${y + h}
    Z`;
  // Door panels on the front face (bottom-left portion)
  const doorAreaX = x + inset;
  const doorAreaY = y + inset;
  const doorAreaW = legW - inset * 2;
  const doorAreaH = h - inset * 2;
  const doorW = (doorAreaW - (doors - 1) * 3) / doors;
  return (
    <g>
      <path d={path} fill={fill} stroke={STROKE} strokeWidth={1.6} strokeLinejoin="round" />
      {/* Door panels on the accessible front face */}
      {Array.from({ length: doors }).map((_, i) => (
        <g key={i}>
          <rect
            x={doorAreaX + i * (doorW + 3)}
            y={doorAreaY}
            width={doorW}
            height={doorAreaH}
            rx={1.5}
            fill={PANEL_FILL}
            stroke={STROKE_LIGHT}
            strokeWidth={1}
          />
          {/* handle */}
          <circle
            cx={doorAreaX + i * (doorW + 3) + (i === doors - 1 ? 4 : doorW - 4)}
            cy={doorAreaY + doorAreaH / 2}
            r={1.2}
            fill={STROKE}
          />
        </g>
      ))}
      {/* Hatched area indicating the L-notch / hidden portion */}
      <rect
        x={x + legW + 2}
        y={y + legH + 2}
        width={w - legW - 4}
        height={h - legH - 4}
        rx={1}
        fill="none"
        stroke={STROKE_LIGHT}
        strokeWidth={0.8}
        strokeDasharray="2 2"
      />
    </g>
  );
}

// Blind corner: L-shaped footprint (one door face + a returning blind section).
function BlindCornerFront({ x, y, w, h, fill }: Omit<FrontProps, "type" | "cabinet">) {
  const inset = 4;
  const notch = w * 0.32;
  const path = `
    M ${x} ${y}
    L ${x + w} ${y}
    L ${x + w} ${y + h}
    L ${x + notch} ${y + h}
    L ${x + notch} ${y + h * 0.55}
    L ${x} ${y + h * 0.55}
    Z`;
  return (
    <g>
      <path d={path} fill={fill} stroke={STROKE} strokeWidth={1.6} strokeLinejoin="round" />
      {/* door on the accessible face */}
      <rect
        x={x + notch + inset}
        y={y + inset}
        width={w - notch - inset * 2}
        height={h - inset * 2}
        rx={1.5}
        fill={PANEL_FILL}
        stroke={STROKE_LIGHT}
        strokeWidth={1}
      />
      {/* blind (inaccessible) panel hint */}
      <rect
        x={x + inset}
        y={y + inset}
        width={notch - inset}
        height={h * 0.55 - inset * 2}
        rx={1}
        fill="none"
        stroke={STROKE_LIGHT}
        strokeWidth={0.8}
        strokeDasharray="2 2"
      />
    </g>
  );
}

// Corner drawer base (CDB-36): front elevation as seen in the product photo.
// The cabinet sits in a corner. Viewed from the front:
//   LEFT side:  24" wide BLANK side panel — full height, no drawers/doors (wall-facing)
//   RIGHT side: 12" wide drawer stack — full height, 3 stacked drawers with bar pulls
// Total width = 36" (24" side panel + 12" drawer face)
function CornerDrawerBaseFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const n = Math.max(2, resolveDoorDrawerCounts(cabinet ?? {}).drawers || 3);
  const inset = 3;
  const gap = 2;
  // Side panel is 24" of 36" = 67% of total width; drawer face is 12" = 33%.
  const sidePanelW = w * 0.67;
  const drawerFaceW = w - sidePanelW;
  return (
    <g>
      {/* Outer box — full rectangle */}
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      {/* Vertical divider between side panel and drawer face */}
      <line
        x1={x + sidePanelW}
        y1={y}
        x2={x + sidePanelW}
        y2={y + h}
        stroke={STROKE_LIGHT}
        strokeWidth={1}
      />
      {/* LEFT: blank side panel — just a subtle inset rect to show it's a panel */}
      <rect
        x={x + inset}
        y={y + inset}
        width={sidePanelW - inset * 2}
        height={h - inset * 2}
        rx={1.5}
        fill={PANEL_FILL}
        stroke={STROKE_LIGHT}
        strokeWidth={0.8}
        strokeDasharray="0"
      />
      {/* RIGHT: 3 stacked drawers on the 12" drawer face */}
      {Array.from({ length: n }).map((_, i) => {
        const dzTop = y + inset;
        const dzH = h - inset * 2;
        const dh = Math.max(5, (dzH - (n - 1) * gap) / n);
        const dX = x + sidePanelW + inset;
        const dW = drawerFaceW - inset * 2;
        const pullCx = dX + dW / 2;
        return (
          <g key={i}>
            <rect
              x={dX}
              y={dzTop + i * (dh + gap)}
              width={dW}
              height={dh}
              rx={1.5}
              fill={PANEL_FILL}
              stroke={STROKE_LIGHT}
              strokeWidth={1}
            />
            {/* bar pull */}
            <rect
              x={pullCx - dW * 0.25}
              y={dzTop + i * (dh + gap) + dh / 2 - 0.8}
              width={dW * 0.5}
              height={1.6}
              rx={0.8}
              fill={STROKE}
            />
          </g>
        );
      })}
    </g>
  );
}

// Glass-front wall cabinet: door(s) with a glass pane + mullion cross.
function GlassDoorFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const doors = Math.max(1, resolveDoorDrawerCounts(cabinet ?? {}).doors || (w > 21 ? 2 : 1));
  const inset = 4;
  const innerW = w - inset * 2;
  const innerH = h - inset * 2;
  const doorW = (innerW - (doors - 1) * 3) / doors;
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      {Array.from({ length: doors }).map((_, i) => {
        const dx = x + inset + i * (doorW + 3);
        return (
          <g key={i}>
            <rect
              x={dx}
              y={y + inset}
              width={doorW}
              height={innerH}
              rx={1.5}
              fill="#eef6fb"
              stroke={STROKE_LIGHT}
              strokeWidth={1}
            />
            {/* mullion cross */}
            <line
              x1={dx + doorW / 2}
              y1={y + inset}
              x2={dx + doorW / 2}
              y2={y + inset + innerH}
              stroke={STROKE_LIGHT}
              strokeWidth={0.7}
            />
            <line
              x1={dx}
              y1={y + inset + innerH / 2}
              x2={dx + doorW}
              y2={y + inset + innerH / 2}
              stroke={STROKE_LIGHT}
              strokeWidth={0.7}
            />
          </g>
        );
      })}
    </g>
  );
}

// Accessory / molding / filler / panel / shelf: thin strip representation.
function AccessoryStrip({ x, y, w, h, fill }: Omit<FrontProps, "type" | "cabinet">) {
  // Represent as a narrow vertical strip centered in the viewBox.
  const stripW = Math.max(10, Math.min(w, 22));
  const sx = x + (w - stripW) / 2;
  return (
    <g>
      <rect
        x={sx}
        y={y}
        width={stripW}
        height={h}
        rx={2}
        fill={fill}
        stroke={STROKE}
        strokeWidth={1.6}
      />
      <line
        x1={sx + stripW / 2}
        y1={y + 4}
        x2={sx + stripW / 2}
        y2={y + h - 4}
        stroke={STROKE_LIGHT}
        strokeWidth={0.8}
        strokeDasharray="3 3"
      />
    </g>
  );
}

// Pantry / tall cabinet: outer box split into 2 stacked sections at ~54% height.
// Each section has 1 or 2 doors side-by-side (2 for wide cabinets >= 24").
// NO drawer band — pantry cabinets are all-door, top to bottom.
function PantryFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const inset = 4;
  const gap = 3; // gap between upper and lower door sections
  const innerW = w - inset * 2;

  // Determine doors per section based on width (narrow = 1 door, wide = 2 doors).
  const doorsPerSection: number = (() => {
    if (cabinet.doorsPerRow && cabinet.doorsPerRow > 0) return cabinet.doorsPerRow;
    return w > 21 ? 2 : 1;
  })();

  // Split height: lower section is ~54% of total height (matches the 54" lower
  // section of a standard 84" pantry). Upper section takes the remaining ~46%.
  const lowerFrac = 0.54;
  const dividerY = y + inset + (h - inset * 2) * lowerFrac;

  const upperTop = y + inset;
  const upperH = dividerY - upperTop - gap / 2;
  const lowerTop = dividerY + gap / 2;
  const lowerH = y + h - inset - lowerTop;

  const doorW = (innerW - (doorsPerSection - 1) * 3) / doorsPerSection;

  const renderSection = (sectionTop: number, sectionH: number) =>
    Array.from({ length: doorsPerSection }).map((_, i) => {
      const dx = x + inset + i * (doorW + 3);
      const handleX =
        doorsPerSection > 1
          ? i === 0
            ? dx + doorW - 4
            : dx + 4
          : dx + doorW / 2;
      return (
        <g key={i}>
          <rect
            x={dx}
            y={sectionTop}
            width={doorW}
            height={sectionH}
            rx={1.5}
            fill={PANEL_FILL}
            stroke={STROKE_LIGHT}
            strokeWidth={1}
          />
          <circle cx={handleX} cy={sectionTop + sectionH / 2} r={1.4} fill={STROKE} />
        </g>
      );
    });

  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      {/* Horizontal divider line between upper and lower sections */}
      <line
        x1={x + inset}
        y1={dividerY}
        x2={x + w - inset}
        y2={dividerY}
        stroke={STROKE_LIGHT}
        strokeWidth={1}
      />
      {renderSection(upperTop, upperH)}
      {renderSection(lowerTop, lowerH)}
    </g>
  );
}

// Oven tall cabinet: 2 upper doors + appliance opening (single or double oven)
// + optional drawers at the bottom.
function OvenTallFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const inset = 4;
  const innerW = w - inset * 2;
  const gap = 2;

  const isDouble = cabinet.ovenType === "double";

  // Layout proportions (based on standard 84" oven tall cabinet):
  //   Upper doors: ~21% of height (~18")
  //   Oven opening: ~35% single / ~63% double
  //   Lower drawers: remaining
  const upperDoorFrac = 0.21;
  const ovenFrac = isDouble ? 0.63 : 0.35;
  const drawerFrac = 1 - upperDoorFrac - ovenFrac;

  const innerH = h - inset * 2;
  const upperDoorH = innerH * upperDoorFrac;
  const ovenH = innerH * ovenFrac;
  const drawerH = innerH * drawerFrac;

  const upperDoorTop = y + inset;
  const ovenTop = upperDoorTop + upperDoorH + gap;
  const drawerTop = ovenTop + ovenH + gap;

  const upperDoors = w > 21 ? 2 : 1;
  const upperDoorW = (innerW - (upperDoors - 1) * 3) / upperDoors;

  const lowerDrawers = Math.max(1, Math.round(drawerH / (innerH * 0.12)));
  const singleDrawerH = Math.max(4, (drawerH - (lowerDrawers - 1) * gap) / lowerDrawers);

  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />

      {/* Upper door panels */}
      {Array.from({ length: upperDoors }).map((_, i) => {
        const dx = x + inset + i * (upperDoorW + 3);
        const handleX =
          upperDoors > 1 ? (i === 0 ? dx + upperDoorW - 4 : dx + 4) : dx + upperDoorW / 2;
        return (
          <g key={`ud-${i}`}>
            <rect
              x={dx}
              y={upperDoorTop}
              width={upperDoorW}
              height={upperDoorH}
              rx={1.5}
              fill={PANEL_FILL}
              stroke={STROKE_LIGHT}
              strokeWidth={1}
            />
            <circle cx={handleX} cy={upperDoorTop + upperDoorH / 2} r={1.4} fill={STROKE} />
          </g>
        );
      })}

      {/* Oven opening — grey fill with dashed border to indicate appliance cavity */}
      {isDouble ? (
        <>
          <rect
            x={x + inset}
            y={ovenTop}
            width={innerW}
            height={ovenH / 2 - gap / 2}
            rx={1.5}
            fill="#d1d5db"
            stroke={STROKE_LIGHT}
            strokeWidth={1}
            strokeDasharray="3 2"
          />
          <rect
            x={x + inset}
            y={ovenTop + ovenH / 2 + gap / 2}
            width={innerW}
            height={ovenH / 2 - gap / 2}
            rx={1.5}
            fill="#d1d5db"
            stroke={STROKE_LIGHT}
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        </>
      ) : (
        <rect
          x={x + inset}
          y={ovenTop}
          width={innerW}
          height={ovenH}
          rx={1.5}
          fill="#d1d5db"
          stroke={STROKE_LIGHT}
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}

      {/* Lower drawer fronts */}
      {Array.from({ length: lowerDrawers }).map((_, i) => (
        <g key={`dr-${i}`}>
          <rect
            x={x + inset}
            y={drawerTop + i * (singleDrawerH + gap)}
            width={innerW}
            height={singleDrawerH}
            rx={1.5}
            fill={PANEL_FILL}
            stroke={STROKE_LIGHT}
            strokeWidth={1}
          />
          <rect
            x={x + w / 2 - innerW * 0.18}
            y={drawerTop + i * (singleDrawerH + gap) + singleDrawerH / 2 - 0.8}
            width={innerW * 0.36}
            height={1.6}
            rx={0.8}
            fill={STROKE}
          />
        </g>
      ))}
    </g>
  );
}

export default CabinetDrawing;
