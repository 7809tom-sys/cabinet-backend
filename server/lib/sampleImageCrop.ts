/**
 * Content-aware crop for cabinet door and drawer sample photos.
 *
 * Brochure pages and fixed slices are not trusted. The crop is the bounding
 * box of the photo itself: paper margins are dropped, and a smeared or
 * edge-replicated border is trimmed. A crop that still looks wrong is
 * rejected and must not be saved. A door photo is never assigned to the
 * drawer slot; when no distinct drawer photo exists, drawerSampleImageUrl
 * stays empty.
 */

import sharp from "sharp";

export const PAPER_LUMINANCE = 242;
export const PAPER_SATURATION = 0.08;
export const SMEAR_STD = 12;
export const SMEAR_DELTA = 40;
export const MIN_FOREIGN_RUN = 3;
export const MIN_COPY_RUN = 8;
export const COPY_DIFF = 0.5;
export const MAX_TRIM_RATIO = 0.18;
export const MERGE_GAP_PX = 4;
export const MIN_REGION_AREA_PX = 48;
export const MIN_REGION_AREA_RATIO = 0.004;
export const THIN_SLICE_RATIO = 4;
export const DOOR_ASPECT_MIN = 0.4;
export const DOOR_ASPECT_MAX = 1.4;
export const DRAWER_ASPECT_MAX = 6;
export const WHITESPACE_FRACTION = 0.06;
export const ASPECT_DISTORTION = 0.03;
export const DUPLICATE_HASH_DISTANCE = 8;
export const DUPLICATE_COLOR_DISTANCE = 22;
export const LOW_RESOLUTION_SHORT_EDGE = 150;

export type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ContentRegion = CropBox & { area: number };

export type RgbImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type EdgeInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type CropFinding = {
  code:
    | "past-edge"
    | "whitespace"
    | "thin-slice"
    | "odd-aspect"
    | "edge-replication"
    | "aspect-distortion"
    | "duplicate"
    | "missing-source"
    | "missing-drawer"
    | "low-resolution";
  severity: "error" | "warning" | "info";
  message: string;
};

export type SampleFingerprint = {
  dhash: string;
  meanR: number;
  meanG: number;
  meanB: number;
};

export type PreparedSlot = {
  ok: boolean;
  box: CropBox | null;
  image: RgbImage | null;
  png: Buffer | null;
  fingerprint: SampleFingerprint | null;
  findings: CropFinding[];
};

export type PreparedStyleSample = {
  styleCode: string;
  door: PreparedSlot;
  drawer: PreparedSlot;
};

export type SlotAssignment = {
  styleCode: string;
  doorSampleImageUrl: string | null;
  drawerSampleImageUrl: string | null;
  thumbnailImageUrl: string | null;
  findings: CropFinding[];
};

export type SwatchWriteRow = {
  styleCode: string;
  doorSampleImageUrl: string;
  drawerSampleImageUrl: string | null;
  thumbnailImageUrl: string;
};

const EMPTY_INSETS: EdgeInsets = { left: 0, right: 0, top: 0, bottom: 0 };

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(r: number, g: number, b: number): number {
  return (r + g + b) / 3;
}

export function isPaperPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return (
    luminance(r, g, b) >= PAPER_LUMINANCE && saturation <= PAPER_SATURATION
  );
}

export function boxIsInside(
  image: Pick<RgbImage, "width" | "height">,
  box: CropBox
): boolean {
  return (
    Number.isInteger(box.left) &&
    Number.isInteger(box.top) &&
    Number.isInteger(box.width) &&
    Number.isInteger(box.height) &&
    box.width >= 1 &&
    box.height >= 1 &&
    box.left >= 0 &&
    box.top >= 0 &&
    box.left + box.width <= image.width &&
    box.top + box.height <= image.height
  );
}

export async function decodeRgb(input: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 || !info.width || !info.height) {
    throw new Error("Could not decode an RGB sample image.");
  }
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

export async function encodePng(image: RgbImage): Promise<Buffer> {
  return sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .png()
    .toBuffer();
}

async function asRgb(source: RgbImage | Buffer): Promise<RgbImage> {
  return Buffer.isBuffer(source) ? decodeRgb(source) : source;
}

function pixelOffset(image: RgbImage, x: number, y: number): number {
  return (y * image.width + x) * 3;
}

type LumaStat = { mean: number; std: number };

function rowLuma(
  image: RgbImage,
  left: number,
  y: number,
  width: number
): LumaStat {
  let sum = 0;
  let sumSq = 0;
  for (let x = left; x < left + width; x++) {
    const i = pixelOffset(image, x, y);
    const luma = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
    sum += luma;
    sumSq += luma * luma;
  }
  const mean = sum / width;
  const variance = Math.max(0, sumSq / width - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

function columnLuma(
  image: RgbImage,
  x: number,
  top: number,
  height: number
): LumaStat {
  let sum = 0;
  let sumSq = 0;
  for (let y = top; y < top + height; y++) {
    const i = pixelOffset(image, x, y);
    const luma = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
    sum += luma;
    sumSq += luma * luma;
  }
  const mean = sum / height;
  const variance = Math.max(0, sumSq / height - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

function columnDiff(
  image: RgbImage,
  x0: number,
  x1: number,
  top: number,
  height: number
): number {
  let sum = 0;
  for (let y = top; y < top + height; y++) {
    const a = pixelOffset(image, x0, y);
    const b = pixelOffset(image, x1, y);
    sum += Math.abs(image.data[a] - image.data[b]);
    sum += Math.abs(image.data[a + 1] - image.data[b + 1]);
    sum += Math.abs(image.data[a + 2] - image.data[b + 2]);
  }
  return sum / (height * 3);
}

function rowDiff(
  image: RgbImage,
  y0: number,
  y1: number,
  left: number,
  width: number
): number {
  let sum = 0;
  for (let x = left; x < left + width; x++) {
    const a = pixelOffset(image, x, y0);
    const b = pixelOffset(image, x, y1);
    sum += Math.abs(image.data[a] - image.data[b]);
    sum += Math.abs(image.data[a + 1] - image.data[b + 1]);
    sum += Math.abs(image.data[a + 2] - image.data[b + 2]);
  }
  return sum / (width * 3);
}

function paperFractionAlongRow(
  image: RgbImage,
  left: number,
  y: number,
  width: number
): number {
  let paper = 0;
  for (let x = left; x < left + width; x++) {
    const i = pixelOffset(image, x, y);
    if (isPaperPixel(image.data[i], image.data[i + 1], image.data[i + 2]))
      paper++;
  }
  return paper / width;
}

function paperFractionAlongColumn(
  image: RgbImage,
  x: number,
  top: number,
  height: number
): number {
  let paper = 0;
  for (let y = top; y < top + height; y++) {
    const i = pixelOffset(image, x, y);
    if (isPaperPixel(image.data[i], image.data[i + 1], image.data[i + 2]))
      paper++;
  }
  return paper / height;
}

function foreignRun(
  stats: LumaStat[],
  interiorMean: number,
  limit: number
): number {
  let run = 0;
  const max = Math.min(stats.length, limit);
  for (let i = 0; i < max; i++) {
    const stat = stats[i];
    if (
      stat.std < SMEAR_STD &&
      Math.abs(stat.mean - interiorMean) > SMEAR_DELTA
    )
      run++;
    else break;
  }
  return run >= MIN_FOREIGN_RUN ? run : 0;
}

function replicatedRun(
  limit: number,
  diffAt: (stepsIn: number) => number | null
): number {
  let matches = 0;
  for (let steps = 1; steps <= limit; steps++) {
    const diff = diffAt(steps);
    if (diff == null || diff > COPY_DIFF) break;
    matches++;
  }
  if (matches < MIN_COPY_RUN) return 0;
  // A flat face stays identical past the search window. A cloned border does not.
  const beyond = diffAt(matches + 1);
  if (matches === limit && (beyond == null || beyond <= COPY_DIFF)) return 0;
  return matches;
}

function interiorMean(image: RgbImage, box: CropBox): number {
  const left = box.left + Math.floor(box.width * 0.25);
  const top = box.top + Math.floor(box.height * 0.25);
  const width = Math.max(
    1,
    Math.min(box.left + box.width - left, Math.floor(box.width * 0.5))
  );
  const height = Math.max(
    1,
    Math.min(box.top + box.height - top, Math.floor(box.height * 0.5))
  );
  let sum = 0;
  let count = 0;
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      const i = pixelOffset(image, x, y);
      sum += luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

export function measureEdgeDefects(
  image: RgbImage,
  box: CropBox = {
    left: 0,
    top: 0,
    width: image.width,
    height: image.height,
  }
): { paper: EdgeInsets; smear: EdgeInsets } {
  if (!boxIsInside(image, box))
    return { paper: EMPTY_INSETS, smear: EMPTY_INSETS };
  const center = interiorMean(image, box);
  const maxX = Math.max(1, Math.floor(box.width * MAX_TRIM_RATIO));
  const maxY = Math.max(1, Math.floor(box.height * MAX_TRIM_RATIO));

  const topRows: LumaStat[] = [];
  const bottomRows: LumaStat[] = [];
  let paperTop = 0;
  let paperBottom = 0;
  for (let n = 0; n < maxY; n++) {
    const topStat = rowLuma(image, box.left, box.top + n, box.width);
    const bottomStat = rowLuma(
      image,
      box.left,
      box.top + box.height - 1 - n,
      box.width
    );
    topRows.push(topStat);
    bottomRows.push(bottomStat);
    if (
      paperTop === n &&
      paperFractionAlongRow(image, box.left, box.top + n, box.width) > 0.7
    )
      paperTop++;
    if (
      paperBottom === n &&
      paperFractionAlongRow(
        image,
        box.left,
        box.top + box.height - 1 - n,
        box.width
      ) > 0.7
    ) {
      paperBottom++;
    }
  }

  const leftCols: LumaStat[] = [];
  const rightCols: LumaStat[] = [];
  let paperLeft = 0;
  let paperRight = 0;
  for (let n = 0; n < maxX; n++) {
    const leftStat = columnLuma(image, box.left + n, box.top, box.height);
    const rightStat = columnLuma(
      image,
      box.left + box.width - 1 - n,
      box.top,
      box.height
    );
    leftCols.push(leftStat);
    rightCols.push(rightStat);
    if (
      paperLeft === n &&
      paperFractionAlongColumn(image, box.left + n, box.top, box.height) > 0.7
    ) {
      paperLeft++;
    }
    if (
      paperRight === n &&
      paperFractionAlongColumn(
        image,
        box.left + box.width - 1 - n,
        box.top,
        box.height
      ) > 0.7
    ) {
      paperRight++;
    }
  }

  const rightEdge = box.left + box.width - 1;
  const bottomEdge = box.top + box.height - 1;
  const copyRight = replicatedRun(maxX, steps => {
    const x = rightEdge - steps;
    if (x < box.left) return null;
    return columnDiff(image, rightEdge, x, box.top, box.height);
  });
  const copyLeft = replicatedRun(maxX, steps => {
    const x = box.left + steps;
    if (x > rightEdge) return null;
    return columnDiff(image, box.left, x, box.top, box.height);
  });
  const copyTop = replicatedRun(maxY, steps => {
    const y = box.top + steps;
    if (y > bottomEdge) return null;
    return rowDiff(image, box.top, y, box.left, box.width);
  });
  const copyBottom = replicatedRun(maxY, steps => {
    const y = bottomEdge - steps;
    if (y < box.top) return null;
    return rowDiff(image, bottomEdge, y, box.left, box.width);
  });

  const smearRight = Math.max(foreignRun(rightCols, center, maxX), copyRight);
  const smearLeft = Math.max(foreignRun(leftCols, center, maxX), copyLeft);
  const smearTop = Math.max(foreignRun(topRows, center, maxY), copyTop);
  const smearBottom = Math.max(
    foreignRun(bottomRows, center, maxY),
    copyBottom
  );

  return {
    paper: {
      left: paperLeft,
      right: paperRight,
      top: paperTop,
      bottom: paperBottom,
    },
    smear: {
      left: smearLeft,
      right: smearRight,
      top: smearTop,
      bottom: smearBottom,
    },
  };
}

function trimBox(box: CropBox, paper: EdgeInsets, smear: EdgeInsets): CropBox {
  const left = Math.max(paper.left, smear.left);
  const right = Math.max(paper.right, smear.right);
  const top = Math.max(paper.top, smear.top);
  const bottom = Math.max(paper.bottom, smear.bottom);
  const width = box.width - left - right;
  const height = box.height - top - bottom;
  if (width < 2 || height < 2) return box;
  return {
    left: box.left + left,
    top: box.top + top,
    width,
    height,
  };
}

function boxGap(a: CropBox, b: CropBox): number {
  const dx = Math.max(
    0,
    Math.max(a.left, b.left) - Math.min(a.left + a.width, b.left + b.width)
  );
  const dy = Math.max(
    0,
    Math.max(a.top, b.top) - Math.min(a.top + a.height, b.top + b.height)
  );
  return Math.hypot(dx, dy);
}

function unionBox(a: ContentRegion, b: ContentRegion): ContentRegion {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  const width = right - left;
  const height = bottom - top;
  return { left, top, width, height, area: width * height };
}

function mergeNearby(boxes: ContentRegion[], gap: number): ContentRegion[] {
  let current = boxes;
  let changed = true;
  while (changed) {
    changed = false;
    const next: ContentRegion[] = [];
    const used = new Array<boolean>(current.length).fill(false);
    for (let i = 0; i < current.length; i++) {
      if (used[i]) continue;
      let box = current[i];
      used[i] = true;
      for (let j = i + 1; j < current.length; j++) {
        if (used[j]) continue;
        if (boxGap(box, current[j]) <= gap) {
          box = unionBox(box, current[j]);
          used[j] = true;
          changed = true;
        }
      }
      next.push(box);
    }
    current = next;
  }
  return current;
}

function contentComponents(image: RgbImage): ContentRegion[] {
  const { width, height, data } = image;
  const count = width * height;
  const mask = new Uint8Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * 3;
    if (!isPaperPixel(data[i], data[i + 1], data[i + 2])) mask[p] = 1;
  }
  const minArea = Math.max(
    MIN_REGION_AREA_PX,
    Math.floor(count * MIN_REGION_AREA_RATIO)
  );
  const seen = new Uint8Array(count);
  const boxes: ContentRegion[] = [];
  const stack: number[] = [];
  for (let start = 0; start < count; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) {
        seen[p - 1] = 1;
        stack.push(p - 1);
      }
      if (x + 1 < width && mask[p + 1] && !seen[p + 1]) {
        seen[p + 1] = 1;
        stack.push(p + 1);
      }
      if (y > 0 && mask[p - width] && !seen[p - width]) {
        seen[p - width] = 1;
        stack.push(p - width);
      }
      if (y + 1 < height && mask[p + width] && !seen[p + width]) {
        seen[p + width] = 1;
        stack.push(p + width);
      }
    }
    if (area >= minArea) {
      const regionWidth = maxX - minX + 1;
      const regionHeight = maxY - minY + 1;
      boxes.push({
        left: minX,
        top: minY,
        width: regionWidth,
        height: regionHeight,
        area,
      });
    }
  }
  return mergeNearby(boxes, MERGE_GAP_PX);
}

/**
 * Bounding boxes of the photos on a page, in reading order.
 * Paper around a door is excluded. A smeared border inside the photo is trimmed.
 */
export function detectContentRegions(image: RgbImage): ContentRegion[] {
  const components = contentComponents(image);
  const trimmed = components
    .map(region => {
      const defects = measureEdgeDefects(image, region);
      const box = trimBox(region, defects.paper, defects.smear);
      return { ...box, area: box.width * box.height };
    })
    .filter(region => region.width >= 2 && region.height >= 2);
  trimmed.sort((a, b) => a.top - b.top || a.left - b.left || b.area - a.area);
  return trimmed;
}

export function cropRegion(
  image: RgbImage,
  box: CropBox
): { ok: true; image: RgbImage } | { ok: false; code: "past-edge" } {
  if (!boxIsInside(image, box)) return { ok: false, code: "past-edge" };
  const data = new Uint8Array(box.width * box.height * 3);
  for (let y = 0; y < box.height; y++) {
    const src = pixelOffset(image, box.left, box.top + y);
    data.set(image.data.subarray(src, src + box.width * 3), y * box.width * 3);
  }
  return { ok: true, image: { width: box.width, height: box.height, data } };
}

function paperFraction(image: RgbImage): number {
  const pixels = image.width * image.height;
  if (pixels === 0) return 1;
  let paper = 0;
  for (let p = 0; p < pixels; p++) {
    const i = p * 3;
    if (isPaperPixel(image.data[i], image.data[i + 1], image.data[i + 2]))
      paper++;
  }
  return paper / pixels;
}

function smearMessage(smear: EdgeInsets, paper: EdgeInsets): string | null {
  const parts: string[] = [];
  const side = (name: string, amount: number, paperAmount: number) => {
    if (amount >= MIN_FOREIGN_RUN && paperAmount < amount) {
      parts.push(`${name} edge smears ${amount}px`);
    }
  };
  side("top", smear.top, paper.top);
  side("right", smear.right, paper.right);
  side("bottom", smear.bottom, paper.bottom);
  side("left", smear.left, paper.left);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function inspectSampleImage(
  image: RgbImage,
  role: "door" | "drawer"
): CropFinding[] {
  const findings: CropFinding[] = [];
  const longSide = Math.max(image.width, image.height);
  const shortSide = Math.min(image.width, image.height);
  const ratio =
    shortSide === 0 ? Number.POSITIVE_INFINITY : longSide / shortSide;
  if (ratio >= THIN_SLICE_RATIO || (shortSide <= 24 && longSide >= 80)) {
    findings.push({
      code: "thin-slice",
      severity: "error",
      message: `${role} crop is ${image.width}x${image.height}, a wide thin slice.`,
    });
  }
  const aspect = image.height === 0 ? 0 : image.width / image.height;
  if (
    role === "door" &&
    (aspect < DOOR_ASPECT_MIN || aspect > DOOR_ASPECT_MAX)
  ) {
    findings.push({
      code: "odd-aspect",
      severity: "error",
      message: `Door crop aspect ${aspect.toFixed(2)} is outside ${DOOR_ASPECT_MIN}-${DOOR_ASPECT_MAX}.`,
    });
  }
  if (
    role === "drawer" &&
    (image.height > image.width || aspect > DRAWER_ASPECT_MAX)
  ) {
    findings.push({
      code: "odd-aspect",
      severity: "error",
      message: `Drawer crop is ${image.width}x${image.height}, which is not a drawer front.`,
    });
  }
  const defects = measureEdgeDefects(image);
  const paperPixels = paperFraction(image);
  const hasPaperEdge =
    defects.paper.top > 0 ||
    defects.paper.right > 0 ||
    defects.paper.bottom > 0 ||
    defects.paper.left > 0;
  if (hasPaperEdge || paperPixels > WHITESPACE_FRACTION) {
    findings.push({
      code: "whitespace",
      severity: "error",
      message: `${role} crop still includes paper margin (${Math.round(paperPixels * 100)}% near-white).`,
    });
  }
  const smear = smearMessage(defects.smear, defects.paper);
  if (smear) {
    findings.push({
      code: "edge-replication",
      severity: "error",
      message: `${role} crop runs past the photo edge: ${smear}.`,
    });
  }
  return findings;
}

function averageColor(image: RgbImage): {
  meanR: number;
  meanG: number;
  meanB: number;
} {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = image.width * image.height;
  for (let p = 0; p < pixels; p++) {
    const i = p * 3;
    r += image.data[i];
    g += image.data[i + 1];
    b += image.data[i + 2];
  }
  const denom = Math.max(1, pixels);
  return { meanR: r / denom, meanG: g / denom, meanB: b / denom };
}

export function fingerprintImage(image: RgbImage): SampleFingerprint {
  const gridW = 9;
  const gridH = 8;
  const gray = new Float64Array(gridW * gridH);
  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor((gy * image.height) / gridH);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * image.height) / gridH));
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor((gx * image.width) / gridW);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * image.width) / gridW));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = pixelOffset(image, x, y);
          sum += luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
          count++;
        }
      }
      gray[gy * gridW + gx] = sum / count;
    }
  }
  let bits = 0n;
  let bit = 0;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW - 1; gx++) {
      if (gray[gy * gridW + gx] < gray[gy * gridW + gx + 1])
        bits |= 1n << BigInt(bit);
      bit++;
    }
  }
  return {
    dhash: bits.toString(16).padStart(16, "0"),
    ...averageColor(image),
  };
}

export function hammingHex(a: string, b: string): number {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export function colorDistance(
  a: SampleFingerprint,
  b: SampleFingerprint
): number {
  return Math.hypot(a.meanR - b.meanR, a.meanG - b.meanG, a.meanB - b.meanB);
}

export function fingerprintsMatch(
  a: SampleFingerprint,
  b: SampleFingerprint
): boolean {
  return (
    hammingHex(a.dhash, b.dhash) <= DUPLICATE_HASH_DISTANCE &&
    colorDistance(a, b) <= DUPLICATE_COLOR_DISTANCE
  );
}

export async function verifyPreparedCrop(input: {
  source: RgbImage | Buffer;
  box: CropBox;
  crop: RgbImage | Buffer;
  role: "door" | "drawer";
  peerFingerprints?: SampleFingerprint[];
}): Promise<{
  ok: boolean;
  findings: CropFinding[];
  fingerprint: SampleFingerprint;
}> {
  const source = await asRgb(input.source);
  const crop = await asRgb(input.crop);
  const findings: CropFinding[] = [];
  if (
    !boxIsInside(source, input.box) ||
    crop.width > source.width ||
    crop.height > source.height
  ) {
    findings.push({
      code: "past-edge",
      severity: "error",
      message: `${input.role} crop rectangle ${input.box.width}x${input.box.height} at ${input.box.left},${input.box.top} is outside the ${source.width}x${source.height} source.`,
    });
  } else {
    const boxAspect = input.box.width / input.box.height;
    const cropAspect = crop.width / crop.height;
    if (Math.abs(cropAspect - boxAspect) / boxAspect > ASPECT_DISTORTION) {
      findings.push({
        code: "aspect-distortion",
        severity: "error",
        message: `${input.role} crop was stretched from ${input.box.width}x${input.box.height} to ${crop.width}x${crop.height}.`,
      });
    }
  }
  findings.push(...inspectSampleImage(crop, input.role));
  const fingerprint = fingerprintImage(crop);
  if (
    input.peerFingerprints?.some(peer => fingerprintsMatch(fingerprint, peer))
  ) {
    findings.push({
      code: "duplicate",
      severity: "error",
      message: `${input.role} crop matches another style or slot.`,
    });
  }
  return {
    ok: !findings.some(finding => finding.severity === "error"),
    findings,
    fingerprint,
  };
}

function emptySlot(findings: CropFinding[]): PreparedSlot {
  return {
    ok: false,
    box: null,
    image: null,
    png: null,
    fingerprint: null,
    findings,
  };
}

async function prepareSlot(
  source: RgbImage | Buffer | null,
  role: "door" | "drawer",
  peerFingerprints: SampleFingerprint[],
  absentCode: "missing-source" | "missing-drawer"
): Promise<PreparedSlot> {
  if (!source) {
    return emptySlot([
      {
        code: absentCode,
        severity: absentCode === "missing-drawer" ? "info" : "error",
        message:
          absentCode === "missing-drawer"
            ? "No distinct drawer image. drawerSampleImageUrl left empty."
            : "No source image, so the door crop was not written.",
      },
    ]);
  }
  const image = await asRgb(source);
  const regions = detectContentRegions(image);
  if (regions.length === 0) {
    return emptySlot([
      {
        code: "whitespace",
        severity: "error",
        message: `No ${role} photo was found in the source image.`,
      },
    ]);
  }
  const box = regions.reduce((largest, region) =>
    region.area > largest.area ? region : largest
  );
  const cropped = cropRegion(image, box);
  if (!cropped.ok) {
    return emptySlot([
      {
        code: "past-edge",
        severity: "error",
        message: `${role} content box fell outside the source image.`,
      },
    ]);
  }
  const verdict = await verifyPreparedCrop({
    source: image,
    box,
    crop: cropped.image,
    role,
    peerFingerprints,
  });
  const ok = verdict.ok;
  return {
    ok,
    box,
    image: cropped.image,
    png: ok ? await encodePng(cropped.image) : null,
    fingerprint: verdict.fingerprint,
    findings: verdict.findings,
  };
}

export async function prepareStyleSample(input: {
  styleCode: string;
  doorSource: RgbImage | Buffer | null;
  drawerSource: RgbImage | Buffer | null;
  peerFingerprints?: SampleFingerprint[];
}): Promise<PreparedStyleSample> {
  const peers = input.peerFingerprints ?? [];
  const door = await prepareSlot(
    input.doorSource,
    "door",
    peers,
    "missing-source"
  );
  const drawerPeers = door.fingerprint ? [...peers, door.fingerprint] : peers;
  const drawer = await prepareSlot(
    input.drawerSource,
    "drawer",
    drawerPeers,
    "missing-drawer"
  );
  return { styleCode: input.styleCode, door, drawer };
}

export async function prepareStyleSamples(
  inputs: Array<{
    styleCode: string;
    doorSource: RgbImage | Buffer | null;
    drawerSource: RgbImage | Buffer | null;
  }>
): Promise<PreparedStyleSample[]> {
  const peers: SampleFingerprint[] = [];
  const prepared: PreparedStyleSample[] = [];
  for (const input of inputs) {
    const result = await prepareStyleSample({
      ...input,
      peerFingerprints: peers,
    });
    if (result.door.ok && result.door.fingerprint)
      peers.push(result.door.fingerprint);
    if (result.drawer.ok && result.drawer.fingerprint)
      peers.push(result.drawer.fingerprint);
    prepared.push(result);
  }
  return prepared;
}

/**
 * Thumbnail may reuse the accepted door URL. The drawer slot never does.
 * A missing or duplicate drawer is reported and stored as empty.
 */
export function assignVerifiedSlots(input: {
  styleCode: string;
  door: { url: string; fingerprint: SampleFingerprint } | null;
  drawer: { url: string; fingerprint: SampleFingerprint } | null;
  drawerRejected?: boolean;
}): SlotAssignment {
  const findings: CropFinding[] = [];
  if (!input.door) {
    findings.push({
      code: "missing-source",
      severity: "error",
      message: `${input.styleCode} has no verified door crop, so nothing was written.`,
    });
    return {
      styleCode: input.styleCode,
      doorSampleImageUrl: null,
      drawerSampleImageUrl: null,
      thumbnailImageUrl: null,
      findings,
    };
  }
  let drawerSampleImageUrl: string | null = null;
  if (!input.drawer) {
    if (!input.drawerRejected) {
      findings.push({
        code: "missing-drawer",
        severity: "info",
        message: `${input.styleCode} has no distinct drawer image. drawerSampleImageUrl left empty.`,
      });
    }
  } else if (
    input.drawer.url === input.door.url ||
    fingerprintsMatch(input.door.fingerprint, input.drawer.fingerprint)
  ) {
    findings.push({
      code: "duplicate",
      severity: "error",
      message: `${input.styleCode} drawer crop matches the door crop. The door was not written into the drawer slot. drawerSampleImageUrl left empty.`,
    });
  } else {
    drawerSampleImageUrl = input.drawer.url;
  }
  return {
    styleCode: input.styleCode,
    doorSampleImageUrl: input.door.url,
    drawerSampleImageUrl,
    thumbnailImageUrl: input.door.url,
    findings,
  };
}

export function refreshWriteDecision(
  assignments: SlotAssignment[]
):
  | { write: true; rows: SwatchWriteRow[] }
  | { write: false; rows: []; blocked: string[] } {
  const blocked = assignments
    .filter(row => !row.doorSampleImageUrl)
    .map(row => row.styleCode);
  if (blocked.length > 0) return { write: false, rows: [], blocked };
  return {
    write: true,
    rows: assignments.map(row => ({
      styleCode: row.styleCode,
      doorSampleImageUrl: row.doorSampleImageUrl as string,
      thumbnailImageUrl: row.thumbnailImageUrl as string,
      drawerSampleImageUrl: row.drawerSampleImageUrl,
    })),
  };
}

export function formatSampleReport(samples: PreparedStyleSample[]): string {
  const lines = ["Sample crop report"];
  let acceptedDoors = 0;
  let rejectedDoors = 0;
  let emptyDrawers = 0;
  for (const sample of samples) {
    if (sample.door.ok && sample.door.image) {
      acceptedDoors++;
      lines.push(
        `${sample.styleCode} door accepted ${sample.door.image.width}x${sample.door.image.height} at ${sample.door.box?.left},${sample.door.box?.top}.`
      );
    } else {
      rejectedDoors++;
      const reason = sample.door.findings
        .map(finding => `${finding.code}: ${finding.message}`)
        .join(" ");
      lines.push(`${sample.styleCode} door rejected. ${reason}`.trim());
    }
    if (sample.drawer.ok && sample.drawer.image) {
      lines.push(
        `${sample.styleCode} drawer accepted ${sample.drawer.image.width}x${sample.drawer.image.height}.`
      );
    } else {
      emptyDrawers++;
      const reason = sample.drawer.findings
        .map(finding => `${finding.code}: ${finding.message}`)
        .join(" ");
      lines.push(`${sample.styleCode} drawer left empty. ${reason}`.trim());
    }
  }
  lines.push(
    `Accepted doors: ${acceptedDoors}. Rejected doors: ${rejectedDoors}. Drawers left empty: ${emptyDrawers}.`
  );
  if (rejectedDoors > 0) lines.push("Rejected crops were not written.");
  return lines.join("\n");
}

export function paintRgb(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number]
): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 3;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
    }
  }
  return { width, height, data };
}

export function fillRect(
  image: RgbImage,
  box: CropBox,
  colorAt: (x: number, y: number) => [number, number, number]
): void {
  for (let y = box.top; y < box.top + box.height; y++) {
    for (let x = box.left; x < box.left + box.width; x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const [r, g, b] = colorAt(x, y);
      const i = pixelOffset(image, x, y);
      image.data[i] = clampByte(r);
      image.data[i + 1] = clampByte(g);
      image.data[i + 2] = clampByte(b);
    }
  }
}
