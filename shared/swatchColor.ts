/**
 * Door-swatch color. The hex is the door's own color.
 * It is never snapped to a brand palette.
 *
 * The sample is trimmed to the door face (studio border and frame edge
 * dropped), then a Lab median ignores glare and crushed shadows. The grain's
 * light and dark ends stay in that same hue. A flat face is paint. A face
 * with visible light/dark grain is a stain.
 */

export type FinishCategory = "paint" | "stain";

export type SwatchPixels = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  /** 3 = RGB, 4 = RGBA. */
  channels: 3 | 4;
};

export type SwatchColor = {
  /** Lab median of the door face. This is the color to save as renderHex. */
  hex: string;
  /** Light end of the grain, same hue as hex. */
  lightHex: string;
  /** Dark end of the grain, same hue as hex. */
  darkHex: string;
  /**
   * Exactly four shades of this swatch's own color family, light to dark.
   * Same a* b* as the median so a gray stays gray and a stain stays its stain.
   */
  shades: readonly [string, string, string, string];
  finishCategory: FinishCategory;
  /** Mean neighbor lightness change inside the face. High means grain is visible. */
  grainContrast: number;
  /** Lightness spread (p80 − p20) inside the face. */
  lightnessSpread: number;
  sampleCount: number;
};

type Lab = { L: number; a: number; b: number };

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexByte(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function srgbToLab(r: number, g: number, b: number): Lab {
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883;
  const pivot = (value: number) => (value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116));
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return { L: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labToRgb(lab: Lab): { r: number; g: number; b: number } {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  const finv = (t: number) => {
    const cubed = t * t * t;
    return cubed > 0.008856 ? cubed : (t - 16 / 116) / 7.787;
  };
  const x = finv(fx) * 0.95047;
  const y = finv(fy);
  const z = finv(fz) * 1.08883;
  let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  let g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  let b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const compand = (channel: number) => {
    const value = Math.max(0, channel);
    const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return clampByte(encoded * 255);
  };
  return { r: compand(r), g: compand(g), b: compand(b) };
}

function labDistance(first: Lab, second: Lab): number {
  const dL = first.L - second.L;
  const da = first.a - second.a;
  const db = first.b - second.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low]!;
  return sorted[low]! * (high - index) + sorted[high]! * (index - low);
}

function shadeHex(lightness: number, chroma: Lab): string {
  const rgb = labToRgb({ L: Math.max(0, Math.min(100, lightness)), a: chroma.a, b: chroma.b });
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Read one swatch. Returns null when the image has no usable door face.
 * The result is a suggestion until an admin saves it.
 */
export function analyzeSwatchPixels(image: SwatchPixels): SwatchColor | null {
  const { data, width, height, channels } = image;
  if (width < 8 || height < 8 || (channels !== 3 && channels !== 4)) return null;
  const count = width * height;
  if (data.length < count * channels) return null;

  const labs: Lab[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * channels;
    const alpha = channels === 4 ? data[offset + 3]! : 255;
    if (alpha < 16) {
      labs[index] = { L: 0, a: 0, b: 0 };
      continue;
    }
    labs[index] = srgbToLab(data[offset]!, data[offset + 1]!, data[offset + 2]!);
  }

  const border = Math.max(2, Math.min(8, Math.round(Math.min(width, height) * 0.06)));
  const borderLabs: Lab[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < border || y < border || x >= width - border || y >= height - border) {
        borderLabs.push(labs[y * width + x]!);
      }
    }
  }
  const borderLab: Lab = {
    L: median(borderLabs.map((lab) => lab.L)),
    a: median(borderLabs.map((lab) => lab.a)),
    b: median(borderLabs.map((lab) => lab.b)),
  };
  const isBackdrop = (lab: Lab) => labDistance(lab, borderLab) < 12;

  const columnBackdrop = (x: number) => {
    let hits = 0;
    for (let y = 0; y < height; y += 1) if (isBackdrop(labs[y * width + x]!)) hits += 1;
    return hits / height > 0.72;
  };
  const rowBackdrop = (y: number) => {
    let hits = 0;
    for (let x = 0; x < width; x += 1) if (isBackdrop(labs[y * width + x]!)) hits += 1;
    return hits / width > 0.72;
  };
  const capX = Math.floor(width * 0.18);
  const capY = Math.floor(height * 0.18);
  let left = 0;
  while (left < capX && columnBackdrop(left)) left += 1;
  let right = width - 1;
  while (width - 1 - right < capX && columnBackdrop(right)) right -= 1;
  let top = 0;
  while (top < capY && rowBackdrop(top)) top += 1;
  let bottom = height - 1;
  while (height - 1 - bottom < capY && rowBackdrop(bottom)) bottom -= 1;
  if (right - left < 8 || bottom - top < 8) {
    left = Math.floor(width * 0.12);
    right = Math.ceil(width * 0.88) - 1;
    top = Math.floor(height * 0.12);
    bottom = Math.ceil(height * 0.88) - 1;
  }

  const faceW = right - left + 1;
  const faceH = bottom - top + 1;
  const insetX = Math.max(1, Math.round(faceW * 0.12));
  const insetY = Math.max(1, Math.round(faceH * 0.12));
  const x0 = Math.min(right - 2, left + insetX);
  const x1 = Math.max(x0 + 1, right - insetX);
  const y0 = Math.min(bottom - 2, top + insetY);
  const y1 = Math.max(y0 + 1, bottom - insetY);

  const face: Lab[] = [];
  const faceL: number[] = [];
  let contrastSum = 0;
  let contrastCount = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const lab = labs[y * width + x]!;
      face.push(lab);
      faceL.push(lab.L);
      if (x + 2 <= x1) {
        contrastSum += Math.abs(lab.L - labs[y * width + x + 2]!.L);
        contrastCount += 1;
      }
    }
  }
  if (face.length < 16) return null;

  const sortedL = faceL.slice().sort((a, b) => a - b);
  const lowClip = percentile(sortedL, 0.08);
  const highClip = percentile(sortedL, 0.92);
  const kept = face.filter((lab) => lab.L >= lowClip && lab.L <= highClip);
  const sample = kept.length >= 16 ? kept : face;
  const chroma: Lab = {
    L: median(sample.map((lab) => lab.L)),
    a: median(sample.map((lab) => lab.a)),
    b: median(sample.map((lab) => lab.b)),
  };
  const keptL = sample.map((lab) => lab.L).sort((a, b) => a - b);
  const lights = [0.8, 0.6, 0.4, 0.2].map((p) => percentile(keptL, p));
  const shades = lights.map((lightness) => shadeHex(lightness, chroma)) as [string, string, string, string];
  const spread = percentile(keptL, 0.8) - percentile(keptL, 0.2);
  const grainContrast = contrastCount > 0 ? contrastSum / contrastCount : 0;
  const finishCategory: FinishCategory = grainContrast >= 3.2 && spread >= 8 ? "stain" : "paint";

  return {
    hex: shadeHex(chroma.L, chroma),
    lightHex: shades[0],
    darkHex: shades[3],
    shades,
    finishCategory,
    grainContrast: Math.round(grainContrast * 10) / 10,
    lightnessSpread: Math.round(spread * 10) / 10,
    sampleCount: sample.length,
  };
}
