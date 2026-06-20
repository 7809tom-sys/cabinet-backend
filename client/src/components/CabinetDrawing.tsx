import { useMemo } from "react";
import {
  cabinetDrawingType,
  cabinetAltText,
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

  // Map real inches to a viewBox. Keep a fixed scale but clamp the aspect ratio
  // so extreme sizes still render legibly inside a card.
  const VIEW = 120;
  const PAD = 12;
  const usable = VIEW - PAD * 2;
  const ratio = Math.max(0.25, Math.min(w / h, 3.2)); // width/height, clamped
  let boxW = usable;
  let boxH = usable;
  if (ratio >= 1) boxH = usable / ratio;
  else boxW = usable * ratio;
  const x0 = (VIEW - boxW) / 2;
  const y0 = (VIEW - boxH) / 2;

  const fill = finishColor ?? DEFAULT_FILL;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
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
    case "accessory-strip":
      return <AccessoryStrip x={x} y={y} w={w} h={h} fill={fill} />;
    case "glass-door":
      return <GlassDoorFront x={x} y={y} w={w} h={h} fill={fill} cabinet={cabinet} />;
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
  const doors = Math.max(1, cabinet?.numberOfDoors ?? (w > 21 ? 2 : 1));
  const drawers = cabinet?.numberOfDrawers ?? 0;
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
  const n = Math.max(1, cabinet?.numberOfDrawers ?? 3);
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

// Glass-front wall cabinet: door(s) with a glass pane + mullion cross.
function GlassDoorFront({ x, y, w, h, fill, cabinet }: Omit<FrontProps, "type">) {
  const doors = Math.max(1, cabinet?.numberOfDoors ?? (w > 21 ? 2 : 1));
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

export default CabinetDrawing;
