/**
 * DoorDrawerDiagram
 *
 * A compact SVG front-elevation schematic that visually shows WHERE doors and
 * drawers are positioned on a cabinet face.  It mirrors the same layout logic
 * used by ElevationView / DoorFront so the diagram always agrees with the
 * actual rendered elevation.
 *
 * Supported layouts:
 *   • Standard base     – top drawer band (26 %) + N side-by-side doors below
 *   • All-drawer        – N stacked drawer fronts, no doors
 *   • Door-only         – N side-by-side doors (wall cabinets, single-door base)
 *   • Pantry (tall)     – 2 doors top + 2 doors bottom split at ~54 / totalH
 *   • Oven/tall-oven    – 2 small doors top + oven opening + drawers bottom
 *   • Open / noDoor     – empty box (no panels)
 */

import React from "react";
import { cabinetDrawingType, resolveDoorDrawerCounts } from "@/lib/cabinetGraphics";
import type { CabinetLike } from "@/lib/cabinetGraphics";

// ─── Palette ────────────────────────────────────────────────────────────────
const CLR = {
  box: "#334155",          // cabinet outline
  door: "#3b82f6",         // door fill (blue)
  doorStroke: "#1d4ed8",
  drawer: "#f59e0b",       // drawer fill (amber)
  drawerStroke: "#b45309",
  oven: "#6b7280",         // oven opening fill (gray)
  ovenStroke: "#374151",
  label: "#ffffff",        // text on panels
  subLabel: "#e2e8f0",     // secondary text
  ovenLabel: "#d1d5db",    // text on oven opening
  rail: "#475569",         // horizontal rail between zones
  bg: "transparent",
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Props {
  cabinet: CabinetLike;
  /** Width of the rendered SVG in pixels (height is auto-calculated). */
  width?: number;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
}

function lc(s: string | null | undefined) {
  return (s ?? "").toLowerCase();
}

const WORD_NUM: Record<string, number> = {
  one: 1, single: 1, two: 2, double: 2, three: 3, triple: 3, four: 4, five: 5, six: 6,
};

/** Parse door count from a description string. */
function parseDoors(desc: string): number {
  const num = desc.match(/(\d+)\s*[- ]?door/);
  if (num) return parseInt(num[1], 10);
  const word = desc.match(/\b(single|two|double|three|triple|four)\s*[- ]?door/);
  if (word) return WORD_NUM[word[1]] ?? 0;
  return 0;
}

/** Parse drawer count from a description string. */
function parseDrawers(desc: string): number {
  const num = desc.match(/(\d+)\s*[- ]?drawer/);
  if (num) return parseInt(num[1], 10);
  const word = desc.match(/\b(single|two|double|three|triple|four|five|six)\s*[- ]?drawer/);
  if (word) return WORD_NUM[word[1]] ?? 0;
  return 0;
}

/** Detect oven / tall-oven cabinets by code prefix or description. */
function isOvenCabinet(cab: CabinetLike): boolean {
  const code = lc(cab.masterCode);
  const desc = lc(cab.description);
  const sub  = lc(cab.subCategory);
  // Code prefixes used in catalog: O30/O33 (oven tall), UOC (utility oven combo)
  if (/^(?:o3[0-9]|uoc)/.test(code)) return true;
  // Description contains "oven" (but not "microwave oven" which is a base)
  if (/oven(?:\s+cabinet|\s+tower|\s+tall|\s+utility)?/.test(desc) && !/microwave/.test(desc)) return true;
  if (/oven/.test(sub)) return true;
  return false;
}

/** Render a single rectangular zone with fill + label centred inside. */
function Zone({
  x, y, w, h,
  fill, stroke,
  label, subLabel,
  fontSize = 11,
  subFontSize = 9,
}: {
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string;
  label: string; subLabel?: string;
  fontSize?: number; subFontSize?: number;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const showSub = subLabel && h > 28;
  return (
    <g>
      <rect
        x={x + 1} y={y + 1} width={w - 2} height={h - 2}
        rx={3} ry={3}
        fill={fill} stroke={stroke} strokeWidth={1.5}
      />
      <text
        x={cx} y={showSub ? cy - 5 : cy}
        textAnchor="middle" dominantBaseline="middle"
        fill={CLR.label} fontSize={fontSize} fontWeight="600"
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>
      {showSub && (
        <text
          x={cx} y={cy + 8}
          textAnchor="middle" dominantBaseline="middle"
          fill={CLR.subLabel} fontSize={subFontSize}
          fontFamily="system-ui, sans-serif"
        >
          {subLabel}
        </text>
      )}
    </g>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function DoorDrawerDiagram({ cabinet, width = 180, className }: Props) {
  const type = cabinetDrawingType(cabinet);
  const { doors, drawers } = resolveDoorDrawerCounts(cabinet);
  const cabinetH = toNum(cabinet.height) ?? 34.5;

  // Aspect ratio: use real cabinet proportions, clamped to a reasonable range
  const cabinetW = toNum(cabinet.width) ?? 24;
  const rawRatio = cabinetH / cabinetW;
  const ratio = Math.min(Math.max(rawRatio, 0.6), 3.0);
  const svgH = Math.round(width * ratio);

  // Interior drawing area (leave margin for box outline + labels)
  const PAD = 8;
  const iW = width - PAD * 2;   // interior width
  const iH = svgH - PAD * 2;    // interior height

  // ── Build zone list ──────────────────────────────────────────────────────
  type ZoneSpec = {
    x: number; y: number; w: number; h: number;
    fill: string; stroke: string;
    label: string; subLabel?: string;
  };
  const zones: ZoneSpec[] = [];
  const rails: { y: number }[] = [];  // horizontal rails between zones

  const DRAWER_BAND_PCT = 0.26; // matches ElevationView

  const isOven = isOvenCabinet(cabinet);

  // When the DB has numberOfDoors=0 / numberOfDrawers=0 (admin override or missing data),
  // fall back to description parsing so the diagram still shows the correct layout.
  // This handles wall cabinets (e.g. W4230 "Double Door Wall") and oven cabinets alike.
  // Only skip the fallback if noDoor is explicitly set (open shelf, wine lattice, etc.).
  let effectiveDoors = doors;
  let effectiveDrawers = drawers;
  if (doors === 0 && drawers === 0 && !cabinet.noDoor) {
    const desc = lc(cabinet.description);
    effectiveDrawers = parseDrawers(desc);
    effectiveDoors   = parseDoors(desc);
    // If still 0 and description doesn't mention doors/drawers, fall back to width heuristic
    // (same logic as resolveDoorDrawerCounts step 4: >=24" = 2 doors, else 1)
    if (effectiveDoors === 0 && effectiveDrawers === 0 && !isOven) {
      const w = toNum(cabinet.width);
      effectiveDoors = w !== null && w >= 24 ? 2 : 1;
    }
  }

  if (effectiveDoors === 0 && effectiveDrawers === 0 && !isOven) {
    // Open cabinet (noDoor flag or genuinely no doors/drawers) — nothing to draw inside

  } else if (isOven) {
    // ── Oven cabinet layout ────────────────────────────────────────────────
    // Typical oven tower: 2 small doors on top (~20%), oven opening (~45%), drawers at bottom (~35%)
    // Proportions are approximate; adjust based on whether there are drawers.
    const topDoorCount = Math.max(1, effectiveDoors);
    const hasDrawers = effectiveDrawers > 0;

    // Height proportions
    const topDoorPct  = 0.20;
    const drawerPct   = hasDrawers ? Math.max(0.10 * effectiveDrawers, 0.25) : 0;
    const ovenPct     = Math.max(0.20, 1 - topDoorPct - drawerPct);

    const topDoorH = Math.round(iH * topDoorPct);
    const drawerH  = Math.round(iH * drawerPct);
    const ovenH    = iH - topDoorH - drawerH;

    // Top doors (side-by-side)
    const doorColW = iW / topDoorCount;
    for (let i = 0; i < topDoorCount; i++) {
      const doorLabel =
        topDoorCount === 1 ? "Door" :
        topDoorCount === 2 ? (i === 0 ? "Left Door" : "Right Door") :
        `Door ${i + 1}`;
      zones.push({
        x: PAD + i * doorColW, y: PAD,
        w: doorColW, h: topDoorH,
        fill: CLR.door, stroke: CLR.doorStroke,
        label: doorLabel,
        subLabel: "upper",
      });
    }

    // Rail between top doors and oven
    rails.push({ y: PAD + topDoorH });

    // Oven opening (gray cutout)
    zones.push({
      x: PAD, y: PAD + topDoorH,
      w: iW, h: ovenH,
      fill: CLR.oven, stroke: CLR.ovenStroke,
      label: "Oven Opening",
      subLabel: "appliance cutout",
    });

    // Rail between oven and drawers
    if (hasDrawers) {
      rails.push({ y: PAD + topDoorH + ovenH });

      // Drawers at bottom (stacked)
      const sliceH = drawerH / effectiveDrawers;
      for (let i = 0; i < effectiveDrawers; i++) {
        zones.push({
          x: PAD, y: PAD + topDoorH + ovenH + i * sliceH,
          w: iW, h: sliceH,
          fill: CLR.drawer, stroke: CLR.drawerStroke,
          label: `Drawer ${i + 1}`,
          subLabel: i === effectiveDrawers - 1 ? "bottom" : undefined,
        });
      }
    }

  } else if (type === "pantry") {
    // Pantry: 2 doors bottom + 2 doors top, split at ~54" from floor
    const totalH = cabinetH;
    const splitIn = 54;
    const splitPct = Math.min(0.8, Math.max(0.2, splitIn / totalH));
    const botH = Math.round(iH * splitPct);
    const topH = iH - botH;
    const dW = Math.round(iW / 2);
    // Bottom 2 doors
    for (let i = 0; i < 2; i++) {
      zones.push({
        x: PAD + i * dW, y: PAD + topH,
        w: dW, h: botH,
        fill: CLR.door, stroke: CLR.doorStroke,
        label: i === 0 ? "Left Door" : "Right Door",
        subLabel: "lower",
      });
    }
    // Rail between top and bottom
    rails.push({ y: PAD + topH });
    // Top 2 doors
    for (let i = 0; i < 2; i++) {
      zones.push({
        x: PAD + i * dW, y: PAD,
        w: dW, h: topH,
        fill: CLR.door, stroke: CLR.doorStroke,
        label: i === 0 ? "Left Door" : "Right Door",
        subLabel: "upper",
      });
    }

  } else if (effectiveDrawers > 0 && effectiveDoors > 0) {
    // Standard base: drawer band on top, doors below
    const drawerBandH = Math.round(iH * DRAWER_BAND_PCT);
    const doorH = iH - drawerBandH;
    const cols = Math.max(1, effectiveDoors);
    const colW = iW / cols;
    // Drawer fronts (top band, one per column)
    for (let i = 0; i < cols; i++) {
      const drawerLabel = cols === 1 ? "Drawer" : `Drawer ${i + 1}`;
      zones.push({
        x: PAD + i * colW, y: PAD,
        w: colW, h: drawerBandH,
        fill: CLR.drawer, stroke: CLR.drawerStroke,
        label: drawerLabel,
      });
    }
    // Rail
    rails.push({ y: PAD + drawerBandH });
    // Doors (bottom region)
    for (let i = 0; i < cols; i++) {
      const doorLabel =
        cols === 1 ? "Door" :
        cols === 2 ? (i === 0 ? "Left Door" : "Right Door") :
        `Door ${i + 1}`;
      zones.push({
        x: PAD + i * colW, y: PAD + drawerBandH,
        w: colW, h: doorH,
        fill: CLR.door, stroke: CLR.doorStroke,
        label: doorLabel,
      });
    }

  } else if (effectiveDrawers > 0 && effectiveDoors === 0) {
    // All-drawer base: stacked drawers
    const sliceH = iH / effectiveDrawers;
    for (let i = 0; i < effectiveDrawers; i++) {
      zones.push({
        x: PAD, y: PAD + i * sliceH,
        w: iW, h: sliceH,
        fill: CLR.drawer, stroke: CLR.drawerStroke,
        label: `Drawer ${i + 1}`,
        subLabel: i === 0 ? "top" : i === effectiveDrawers - 1 ? "bottom" : undefined,
      });
    }

  } else if (effectiveDoors > 0 && effectiveDrawers === 0) {
    // Door-only (wall cabinets, single/double door base with no drawers)
    const cols = Math.max(1, effectiveDoors);
    const colW = iW / cols;
    for (let i = 0; i < cols; i++) {
      const doorLabel =
        cols === 1 ? "Door" :
        cols === 2 ? (i === 0 ? "Left Door" : "Right Door") :
        `Door ${i + 1}`;
      zones.push({
        x: PAD + i * colW, y: PAD,
        w: colW, h: iH,
        fill: CLR.door, stroke: CLR.doorStroke,
        label: doorLabel,
      });
    }
  }

  // ── Legend items ─────────────────────────────────────────────────
  // Always use effectiveDoors/effectiveDrawers (they include description fallback).
  const legendDoors   = effectiveDoors;
  const legendDrawers = effectiveDrawers;
  const legendItems: { color: string; label: string }[] = [];
  if (legendDoors > 0) legendItems.push({ color: CLR.door, label: `${legendDoors} Door${legendDoors > 1 ? "s" : ""}` });
  if (legendDrawers > 0) legendItems.push({ color: CLR.drawer, label: `${legendDrawers} Drawer${legendDrawers > 1 ? "s" : ""}` });
  if (isOven) legendItems.push({ color: CLR.oven, label: "Oven Opening" });
  if (legendDoors === 0 && legendDrawers === 0 && !isOven) legendItems.push({ color: "#64748b", label: "Open / No Doors" });

  const legendY = svgH + 6;
  const totalSvgH = svgH + 24; // extra space for legend

  return (
    <svg
      viewBox={`0 0 ${width} ${totalSvgH}`}
      width={width}
      height={totalSvgH}
      className={className}
      aria-label="Door and drawer location diagram"
      role="img"
    >
      {/* Cabinet box outline */}
      <rect
        x={PAD} y={PAD} width={iW} height={iH}
        rx={2} ry={2}
        fill="none" stroke={CLR.box} strokeWidth={2}
      />

      {/* Zones */}
      {zones.map((z, idx) => (
        <Zone key={idx} {...z} />
      ))}

      {/* Horizontal rails between zones */}
      {rails.map((r, idx) => (
        <line
          key={`rail-${idx}`}
          x1={PAD} y1={r.y} x2={PAD + iW} y2={r.y}
          stroke={CLR.rail} strokeWidth={2}
        />
      ))}

      {/* Vertical dividers between side-by-side zones */}
      {zones.filter((z, i, arr) =>
        arr.some((other, j) => j !== i && other.x === z.x + z.w && Math.abs(other.y - z.y) < 2)
      ).map((z, idx) => (
        <line
          key={`vdiv-${idx}`}
          x1={z.x + z.w} y1={z.y} x2={z.x + z.w} y2={z.y + z.h}
          stroke={CLR.rail} strokeWidth={1.5}
        />
      ))}

      {/* Legend */}
      {legendItems.map((item, idx) => {
        const lx = PAD + idx * (width / legendItems.length);
        return (
          <g key={`leg-${idx}`}>
            <rect x={lx} y={legendY} width={10} height={10} rx={2} fill={item.color} />
            <text
              x={lx + 13} y={legendY + 5}
              dominantBaseline="middle"
              fill="#64748b" fontSize={9}
              fontFamily="system-ui, sans-serif"
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default DoorDrawerDiagram;
