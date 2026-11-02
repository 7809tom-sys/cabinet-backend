/**
 * How a detected swatch color tints the door grain.
 *
 * The hex painted on the door is that door's own color (renderHex, then the
 * swatch reading). It is not snapped to the cream / green / gold brand list.
 * Snapping is what made Stone Gray and other grays render as cream or green.
 *
 * Paint is an opaque tint on the flat painted grain (white or grey shaker).
 * Stain is a translucent tint over wood grain (versa or espresso), so the
 * grain's light and dark still show. Hickory keeps a real wood grain: it is
 * never moved onto the painted grain.
 *
 * Geometry is not decided here. Rail, stile, notch, and slab stay on the
 * DL shaker blueprint.
 */
import { CABINET_NAME_COLORS, matchCabinetColorName } from "./cabinetColorNames";
import { deltaE2000Hex } from "./ciede2000";
import type { FinishCategory } from "./swatchColor";

/** The four DL shaker grains. Each style uses one shade from its own family. */
export const DOOR_GRAIN_SHADES = ["white-shaker", "grey-shaker", "versa-shaker", "expresso-shaker"] as const;
export type DoorGrainShade = (typeof DOOR_GRAIN_SHADES)[number];

export const PAINTED_GRAIN_SHADES = ["white-shaker", "grey-shaker"] as const;
export const WOOD_GRAIN_SHADES = ["versa-shaker", "expresso-shaker"] as const;

/** Catalog solid colors of those four grains. Used only to pick which grain to tint. */
export const GRAIN_REFERENCE_HEX: Record<DoorGrainShade, string> = {
  "white-shaker": "#e7eaef",
  "grey-shaker": "#bac1cb",
  "versa-shaker": "#c7b695",
  "expresso-shaker": "#5f5d60",
};

/**
 * Brand swatches an admin may choose. They are not a clamp.
 * A different saved color, including Stone Gray, is left alone.
 */
export const BRAND_SWATCH_HEXES = ["#dedac6", "#fffdf9", "#f6f3ed", "#244338", "#d7a46c"] as const;

export type DoorFinishInput = {
  ourName?: string | null;
  aliasName?: string | null;
  name?: string | null;
  color?: string | null;
  finish?: string | null;
  woodSpecies?: string | null;
  renderHex?: string | null;
  /** Reading from the uploaded swatch. Used when renderHex is not set yet. */
  detectedHex?: string | null;
  /** Saved category. Wins over the name, except hickory stays on real wood grain. */
  finishCategory?: FinishCategory | null;
};

export type DoorFinishPlan = {
  /** Color actually applied. Always the door's own hex. */
  ownHex: string;
  finishCategory: FinishCategory;
  /** Paint is an opaque solid of ownHex. Stain keeps the wood grain and tints it. */
  application: "opaque" | "translucent";
  /** False for solid paint, so the renderer does not put a grain map on the face. */
  usesGrain: boolean;
  grainShade: DoorGrainShade;
  /** Multiplier that aims the chosen grain at ownHex. */
  tintHex: string;
  tintClamped: boolean;
  /** Hickory (and rustic hickory) keep their wood grain texture. */
  keepsRealWoodGrain: boolean;
};

function exactHex(value: string | null | undefined): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec((value ?? "").trim());
  return match ? `#${match[1]!.toLowerCase()}` : null;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

/** Per-channel scale from the grain's solid color toward the door's own color. */
export function retintGrain(referenceHex: string, targetHex: string): { tintHex: string; clamped: boolean } {
  const reference = rgb(referenceHex);
  const target = rgb(targetHex);
  let clamped = false;
  const channels = [0, 1, 2].map((index) => {
    const base = reference[index]!;
    const aim = target[index]!;
    const scaled = base <= 0 ? aim : Math.round((aim / base) * 255);
    if (scaled > 255 || scaled < 0) clamped = true;
    return Math.max(0, Math.min(255, scaled));
  });
  return {
    tintHex: `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
    clamped,
  };
}

export function isHickorySpecies(input: DoorFinishInput): boolean {
  const text = `${input.woodSpecies ?? ""} ${input.ourName ?? ""} ${input.aliasName ?? ""} ${input.name ?? ""}`;
  return /\bhickory\b/i.test(text);
}

/** The door's own color. renderHex wins, then the swatch reading, then a catalog hex, then the name. */
export function doorOwnHex(input: DoorFinishInput): string {
  return exactHex(input.renderHex)
    ?? exactHex(input.detectedHex)
    ?? exactHex(input.color)
    ?? matchCabinetColorName([input.ourName, input.aliasName, input.name, input.color, input.finish, input.woodSpecies].filter(Boolean).join(" "))
    ?? CABINET_NAME_COLORS.default;
}

function namedCategory(input: DoorFinishInput): FinishCategory {
  const name = `${input.ourName ?? ""} ${input.aliasName ?? ""} ${input.name ?? ""} ${input.finish ?? ""} ${input.color ?? ""}`.toLowerCase();
  const species = (input.woodSpecies ?? "").toLowerCase();
  // "Solid Birch" is the painted-door substrate, not a stain. A visible wood
  // finish (oak, hickory, walnut, and the rest) is a stain. Paint words win.
  if (/\bpaint/.test(name) || /\bpaint/.test(species)) return "paint";
  if (/\b(?:hickory|oak|walnut|cherry|maple|pecan|rift)\b/.test(name)) return "stain";
  if (/\b(?:hickory|oak|walnut|cherry|maple|pecan)\b/.test(species)) return "stain";
  return "paint";
}

export function planDoorFinish(input: DoorFinishInput): DoorFinishPlan {
  const ownHex = doorOwnHex(input);
  const hickory = isHickorySpecies(input);
  const explicit = input.finishCategory === "paint" || input.finishCategory === "stain" ? input.finishCategory : null;
  // Hickory keeps its real grain even if a flat crop was labeled paint.
  const finishCategory: FinishCategory = hickory ? "stain" : (explicit ?? namedCategory(input));
  const shades = finishCategory === "stain" ? WOOD_GRAIN_SHADES : PAINTED_GRAIN_SHADES;
  let grainShade: DoorGrainShade = shades[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const shade of shades) {
    const delta = deltaE2000Hex(ownHex, GRAIN_REFERENCE_HEX[shade]) ?? Number.POSITIVE_INFINITY;
    if (delta < bestDelta) {
      grainShade = shade;
      bestDelta = delta;
    }
  }
  const tint = retintGrain(GRAIN_REFERENCE_HEX[grainShade], ownHex);
  return {
    ownHex,
    finishCategory,
    application: finishCategory === "stain" ? "translucent" : "opaque",
    usesGrain: finishCategory === "stain",
    grainShade,
    tintHex: tint.tintHex,
    tintClamped: tint.clamped,
    keepsRealWoodGrain: hickory,
  };
}

/** Nearest brand swatch. Reported so a dry-run can show what the old snap would have done. Not applied. */
export function nearestBrandSwatch(hex: string): string {
  let best: string = BRAND_SWATCH_HEXES[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const brand of BRAND_SWATCH_HEXES) {
    const delta = deltaE2000Hex(hex, brand) ?? Number.POSITIVE_INFINITY;
    if (delta < bestDelta) {
      best = brand;
      bestDelta = delta;
    }
  }
  return best;
}
