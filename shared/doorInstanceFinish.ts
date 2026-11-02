/**
 * Per-door finish variation. Geometry is not involved.
 *
 * The seed is the cabinet placement id, its position, and the piece index.
 * The same inputs always return the same tone and grain crop, so a reopened
 * design matches. Adjacent doors do not.
 *
 * Solid paint stays an opaque color of that door's own hex. A gray is only
 * shifted in lightness, never in hue, so it cannot become green.
 * Wood grain, including hickory, keeps the grain image and samples a different
 * crop (offset, on-axis rotation, scale) plus a small tone shift, so knots
 * and light/dark streaks are not one repeated tile.
 */
import { planDoorFinish, type DoorFinishInput, type DoorFinishPlan } from "./doorFinishTint";

export type DoorInstanceSeed = {
  placementUid?: string | null;
  position?: string | null;
  pieceIndex?: number;
  sampleUrl?: string | null;
};

export type DoorInstanceVariation = {
  offsetX: number;
  offsetY: number;
  /** 0 or π. A quarter turn would lay vertical grain sideways. */
  rotation: 0 | number;
  /** Above 1 zooms into knots and streaks instead of repeating the whole tile. */
  scale: number;
  /** Turns of hue. Forced to 0 for a gray so the color stays gray. */
  hueTurns: number;
  lightness: number;
};

function hashChannels(source: string, count: number): number[] {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  const channels: number[] = [];
  for (let index = 0; index < count; index += 1) {
    state = Math.imul(state ^ (0x9e3779b9 + index), 2246822519) >>> 0;
    channels.push(state / 0xffffffff);
  }
  return channels;
}

function mix(unit: number, min: number, max: number): number {
  return min + unit * (max - min);
}

export function doorInstanceSeedKey(seed: DoorInstanceSeed): string {
  return [
    seed.placementUid?.trim() || "legacy-cabinet",
    seed.position?.trim() || "0,0",
    String(Math.trunc(seed.pieceIndex ?? 0)),
    seed.sampleUrl?.trim() || "finish",
  ].join("|");
}

/** Stable crop and tone for one door. `usesGrain` selects a zoomed wood crop. */
export function doorInstanceVariation(seed: DoorInstanceSeed, usesGrain: boolean): DoorInstanceVariation {
  const [offsetUnit, riseUnit, turnUnit, scaleUnit, hueUnit, lightUnit] = hashChannels(doorInstanceSeedKey(seed), 6);
  const piece = Math.abs(Math.trunc(seed.pieceIndex ?? 0));
  return {
    offsetX: (0.04 + offsetUnit * 0.9 + piece * 0.37) % 1,
    offsetY: usesGrain
      ? (0.02 + riseUnit * 0.55 + piece * 0.19) % 1
      : (0.02 + riseUnit * 0.2) % 1,
    rotation: turnUnit >= 0.5 ? Math.PI : 0,
    scale: usesGrain ? mix(scaleUnit, 1.45, 2.35) : 1,
    hueTurns: (hueUnit - 0.5) * 0.03,
    lightness: (lightUnit - 0.5) * 0.1,
  };
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1]!;
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  return { h: hue / 6, s: saturation, l: lightness };
}

function hueToRgb(p: number, q: number, t: number): number {
  let channel = t;
  if (channel < 0) channel += 1;
  if (channel > 1) channel -= 1;
  if (channel < 1 / 6) return p + (q - p) * 6 * channel;
  if (channel < 1 / 2) return q;
  if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));
  let r = lightness;
  let g = lightness;
  let b = lightness;
  if (saturation > 0) {
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    r = hueToRgb(p, q, hue + 1 / 3);
    g = hueToRgb(p, q, hue);
    b = hueToRgb(p, q, hue - 1 / 3);
  }
  const byte = (channel: number) => Math.max(0, Math.min(255, Math.round(channel * 255))).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** A neutral gray has almost no chroma. Hue must not be applied or it picks up a color. */
export function isNeutralGray(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 18;
}

/**
 * Shift a door's own hex. Gray only changes lightness.
 * This never substitutes a brand swatch.
 */
export function shiftFinishHex(hex: string, variation: Pick<DoorInstanceVariation, "hueTurns" | "lightness">): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const gray = isNeutralGray(hex);
  return hslToHex(hsl.h + (gray ? 0 : variation.hueTurns), gray ? 0 : hsl.s, hsl.l + variation.lightness);
}

export type DoorInstanceFinish = DoorFinishPlan & DoorInstanceVariation & {
  /** Color painted when the face is solid. */
  solidHex: string;
  /** Near-white multiply used on top of a grain image so the grain's own colors remain. */
  grainTintHex: string;
};

export function doorInstanceFinish(seed: DoorInstanceSeed, input: DoorFinishInput): DoorInstanceFinish {
  const plan = planDoorFinish(input);
  const hickorySample = /rustic_hickory_vertical_grain|hickory/i.test(seed.sampleUrl ?? "");
  const usesGrain = plan.usesGrain || hickorySample;
  const variation = doorInstanceVariation(seed, usesGrain);
  return {
    ...plan,
    ...variation,
    usesGrain,
    application: usesGrain ? "translucent" : "opaque",
    finishCategory: usesGrain ? "stain" : plan.finishCategory,
    keepsRealWoodGrain: plan.keepsRealWoodGrain || hickorySample,
    solidHex: shiftFinishHex(plan.ownHex, variation),
    grainTintHex: shiftFinishHex("#f4f1ea", { hueTurns: variation.hueTurns * 0.35, lightness: variation.lightness * 0.45 }),
  };
}
