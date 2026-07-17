/**
 * colorSampler.ts
 *
 * Server-side dominant color extractor for door style sample images.
 * Uses `sharp` to decode the image at full quality, then samples the
 * center 50% region (avoiding background/shadows at the edges) and
 * computes a weighted median-cut to find the most representative
 * cabinet face color.
 *
 * Returns a 6-digit lowercase hex string (without #), or null on failure.
 */

import sharp from "sharp";

/**
 * Extract the dominant face color from an image buffer.
 * Focuses on the center 50% of the image to avoid background/shadows.
 * Returns a 6-digit hex string (e.g. "c08a4e") or null on failure.
 */
export async function extractDominantColor(buf: Buffer): Promise<string | null> {
  try {
    const image = sharp(buf);
    const meta = await image.metadata();
    const { width = 0, height = 0 } = meta;
    if (!width || !height) return null;

    // Crop to the center 50% of the image to focus on the door face,
    // avoiding the background, shadows, and edge artifacts.
    const cropW = Math.max(1, Math.floor(width * 0.5));
    const cropH = Math.max(1, Math.floor(height * 0.5));
    const cropLeft = Math.floor((width - cropW) / 2);
    const cropTop = Math.floor((height - cropH) / 2);

    // Resize the crop to a small thumbnail for fast pixel analysis.
    // 64x64 gives 4096 samples — more than enough for accurate color.
    const { data, info } = await image
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .resize(64, 64, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = info.width * info.height;
    const channels = info.channels; // always 3 after removeAlpha

    // Accumulate weighted color buckets using a simplified median-cut.
    // We use 8x8x8 = 512 color buckets in RGB space.
    const BUCKETS = 8;
    const buckets = new Float64Array(BUCKETS * BUCKETS * BUCKETS * 3); // [r, g, b, count] packed as 4 floats per bucket
    const counts = new Float64Array(BUCKETS * BUCKETS * BUCKETS);

    for (let i = 0; i < pixelCount; i++) {
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];

      // Skip near-white pixels (background) and near-black pixels (shadows).
      // These are not representative of the cabinet face color.
      const brightness = (r + g + b) / 3;
      if (brightness > 235) continue; // near-white background
      if (brightness < 20) continue;  // near-black shadow

      // Skip highly desaturated (gray) pixels that are likely shadows/highlights.
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
      // Allow low-saturation for white/gray/black cabinets but skip pure grays
      // that are clearly background artifacts.
      if (saturation < 0.04 && brightness > 180) continue;

      const bi = Math.floor(r / 32) * BUCKETS * BUCKETS + Math.floor(g / 32) * BUCKETS + Math.floor(b / 32);
      buckets[bi * 3] += r;
      buckets[bi * 3 + 1] += g;
      buckets[bi * 3 + 2] += b;
      counts[bi]++;
    }

    // Find the bucket with the most pixels.
    let bestBucket = -1;
    let bestCount = 0;
    for (let i = 0; i < BUCKETS * BUCKETS * BUCKETS; i++) {
      if (counts[i] > bestCount) {
        bestCount = counts[i];
        bestBucket = i;
      }
    }

    if (bestBucket < 0 || bestCount === 0) return null;

    // Average the pixels in the winning bucket.
    const r = Math.round(buckets[bestBucket * 3] / bestCount);
    const g = Math.round(buckets[bestBucket * 3 + 1] / bestCount);
    const b = Math.round(buckets[bestBucket * 3 + 2] / bestCount);

    return [r, g, b].map((c) => Math.min(255, Math.max(0, c)).toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
