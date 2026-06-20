import { useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// DoorStyleSwatch
// Renders a clean, consistent SVG of a cabinet door in the door style's REAL
// color and panel treatment. This replaces photographic image fields that point
// at non-existent files (e.g. /door-samples/*.jpg), so the catalog always shows
// an accurate, on-brand visual with no distributor/dealer watermark.
//
// Color is derived from the door style's paint/finish color name (Sherwin-Williams
// codes are common in the data, e.g. "SW 7004 Snowbound"). Panel treatment is
// derived from the door-style family (Shaker, Raised Panel, Slab, Beaded, Inset).
// ─────────────────────────────────────────────────────────────────────────────

export interface DoorStyleLike {
  styleCode?: string | null;
  ourName?: string | null;
  doorStyle?: string | null;
  color?: string | null;
  finish?: string | null;
  woodSpecies?: string | null;
}

interface DoorStyleSwatchProps {
  style: DoorStyleLike;
  className?: string;
}

interface Swatch {
  face: string; // door face fill
  edge: string; // frame/edge shadow
  panel: string; // inner panel fill (subtle contrast)
  label: string; // legible text color on the face
}

// Common Sherwin-Williams + descriptive color name → hex. Ordered by specificity
// (more specific names first) so "tricorn black" wins before generic "black".
const COLOR_BY_KEYWORD: { match: RegExp; hex: string }[] = [
  { match: /snowbound|extra white|pure white|high reflective|marshmallow|alabaster|greek villa/, hex: "#f4f2ec" },
  { match: /creamy|antique white|natural choice|shoji|ivory|biscuit|almond|manila/, hex: "#ece2cf" },
  { match: /repose gray|agreeable gray|accessible beige|mindful gray|greige|mushroom/, hex: "#cabfae" },
  { match: /mineral|dorian gray|gauntlet|dovetail|pewter|repose|fog/, hex: "#a7a39a" },
  { match: /grizzle|peppercorn|gris|iron ore|urbane bronze|graphite|charcoal|slate/, hex: "#5b5b58" },
  { match: /tricorn black|black magic|caviar|onyx|carbon|tricorn|cracked pepper/, hex: "#2a2a2c" },
  { match: /naval|indigo|sea serpent|navy|cobalt|blue/, hex: "#36465c" },
  { match: /evergreen|pewter green|rosemary|sage|forest|hunter|green/, hex: "#56685b" },
  { match: /cherry|mahogany|chestnut|cinnamon|brick|spice/, hex: "#7a4a32" },
  { match: /walnut|mocha|coffee|java|espresso|chocolate|brown/, hex: "#6b4a32" },
  { match: /white oak|natural|honey|maple|wheat|amber|toffee|oak/, hex: "#c79a63" },
  { match: /gray|grey|stone/, hex: "#9aa0a6" },
  { match: /white|snow|arctic|pearl|dove|frost/, hex: "#f3f1ec" },
  { match: /cream|linen|sand|beige|tan/, hex: "#e6dcc6" },
];

const DEFAULT_HEX = "#c79a63"; // warm wood fallback

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, amount: number): string {
  // amount < 0 darkens, > 0 lightens
  const [r, g, b] = hexToRgb(hex);
  const adj = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function resolveSwatch(style: DoorStyleLike): Swatch {
  const haystack = `${style.color ?? ""} ${style.ourName ?? ""} ${style.finish ?? ""} ${style.woodSpecies ?? ""}`.toLowerCase();
  let face = DEFAULT_HEX;
  for (const c of COLOR_BY_KEYWORD) {
    if (c.match.test(haystack)) {
      face = c.hex;
      break;
    }
  }
  const lum = luminance(face);
  return {
    face,
    edge: shade(face, lum > 0.6 ? -0.14 : -0.1),
    panel: shade(face, lum > 0.6 ? -0.05 : 0.04),
    label: lum > 0.55 ? "#3a3a3a" : "#f5f5f5",
  };
}

type PanelKind = "shaker" | "raised" | "slab" | "beaded" | "inset" | "double-shaker";

function panelKind(doorStyle?: string | null): PanelKind {
  const s = (doorStyle ?? "").toLowerCase();
  if (/double/.test(s)) return "double-shaker";
  if (/raised|cathedral|arch/.test(s)) return "raised";
  if (/slab|flat|contemporary|euro|modern/.test(s)) return "slab";
  if (/bead/.test(s)) return "beaded";
  if (/inset/.test(s)) return "inset";
  return "shaker"; // default + explicit shaker
}

export function DoorStyleSwatch({ style, className }: DoorStyleSwatchProps) {
  const sw = useMemo(() => resolveSwatch(style), [style]);
  const kind = useMemo(() => panelKind(style.doorStyle), [style.doorStyle]);

  // viewBox: a portrait door, 100 wide x 130 tall
  const W = 100;
  const H = 130;
  const stile = 14; // shaker rail/stile width

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${style.ourName || style.styleCode || "Door"} — ${style.doorStyle || "door"} sample`}
    >
      {/* outer door slab */}
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="3" fill={sw.face} stroke={sw.edge} strokeWidth="2" />

      {kind === "slab" && (
        <rect x="10" y="10" width={W - 20} height={H - 20} rx="2" fill="none" stroke={sw.edge} strokeWidth="0.75" opacity="0.5" />
      )}

      {kind === "beaded" && (
        <>
          {Array.from({ length: 6 }).map((_, i) => (
            <line
              key={i}
              x1={16 + i * ((W - 32) / 5)}
              y1="10"
              x2={16 + i * ((W - 32) / 5)}
              y2={H - 10}
              stroke={sw.edge}
              strokeWidth="0.9"
              opacity="0.55"
            />
          ))}
          <rect x="8" y="8" width={W - 16} height={H - 16} rx="2" fill="none" stroke={sw.edge} strokeWidth="1" opacity="0.6" />
        </>
      )}

      {(kind === "shaker" || kind === "inset" || kind === "raised") && (
        <>
          {/* recessed inner panel */}
          <rect
            x={stile}
            y={stile}
            width={W - 2 * stile}
            height={H - 2 * stile}
            rx="2"
            fill={sw.panel}
            stroke={sw.edge}
            strokeWidth="1.25"
          />
          {/* inner bevel line for depth */}
          <rect
            x={stile + 2.5}
            y={stile + 2.5}
            width={W - 2 * stile - 5}
            height={H - 2 * stile - 5}
            rx="1.5"
            fill="none"
            stroke={shade(sw.face, 0.06)}
            strokeWidth="0.75"
            opacity="0.7"
          />
          {kind === "raised" && (
            // raised center field
            <rect
              x={stile + 8}
              y={stile + 8}
              width={W - 2 * stile - 16}
              height={H - 2 * stile - 16}
              rx="2"
              fill={shade(sw.face, 0.04)}
              stroke={sw.edge}
              strokeWidth="0.75"
            />
          )}
        </>
      )}

      {kind === "double-shaker" && (
        <>
          {[0, 1].map((row) => {
            const y = stile + row * ((H - 2 * stile) / 2 + 1);
            const h = (H - 2 * stile) / 2 - 3;
            return (
              <rect
                key={row}
                x={stile}
                y={y}
                width={W - 2 * stile}
                height={h}
                rx="2"
                fill={sw.panel}
                stroke={sw.edge}
                strokeWidth="1.25"
              />
            );
          })}
        </>
      )}
    </svg>
  );
}

export default DoorStyleSwatch;
