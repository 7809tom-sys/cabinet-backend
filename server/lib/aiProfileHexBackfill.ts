/**
 * Backfill the colour of already-approved AI door images (Tom, Nov 20 2026).
 *
 * The AI profile has stored an image since 0281, but the Designer paints a hex, so
 * every style approved before this week kept rendering the catalogue colour. Re-saving
 * each one by hand is not a fix; this reads the stored image, samples the door's own
 * colour and writes renderHex.
 *
 * Sampling rules match the client sampler: median of the central panel, ignoring glare
 * above 246 and shadow below 12, and refusing an image that is mostly transparent or
 * has too few usable pixels. A style that cannot be sampled is reported and left alone -
 * a wrong colour is worse than none.
 */
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { storageFetchObject } from "../storage";

export const BACKFILL_SAMPLE_INSET = 0.25;
const IGNORE_ABOVE = 246;
const IGNORE_BELOW = 12;
const MIN_PIXELS = 24;

export type BackfillRow = {
  id: number;
  name: string;
  imageUrl: string;
  hex: string | null;
  reason?: string;
};

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

function rows(result: unknown): Array<Record<string, unknown>> {
  const inner = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(inner) ? inner.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function toHex(r: number, g: number, b: number): string {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Median colour of the central panel of an image, or null when it cannot be trusted. */
export async function sampleImageHex(bytes: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize({ width: 96, height: 96, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    if (width < 6 || height < 6) return null;

    const insetX = Math.round(width * BACKFILL_SAMPLE_INSET);
    const insetY = Math.round(height * BACKFILL_SAMPLE_INSET);
    const reds: number[] = [];
    const greens: number[] = [];
    const blues: number[] = [];
    let transparent = 0;
    for (let y = insetY; y < height - insetY; y += 1) {
      for (let x = insetX; x < width - insetX; x += 1) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3] ?? 0;
        if (alpha < 200) { transparent += 1; continue; }
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        if (Math.max(r, g, b) >= IGNORE_ABOVE || Math.min(r, g, b) <= IGNORE_BELOW) continue;
        reds.push(r); greens.push(g); blues.push(b);
      }
    }
    if (reds.length < MIN_PIXELS) return null;
    if (transparent > reds.length) return null;
    return toHex(median(reds), median(greens), median(blues));
  } catch {
    return null;
  }
}

/** Storage key from a stored URL: /manus-storage/<key> or a bare key. */
function storageKeyOf(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/manus-storage\//, "").replace(/^\//, "");
}

export async function backfillAiProfileHex(db: Db, options: { dryRun: boolean; ids?: number[] }): Promise<{
  total: number;
  written: number;
  skipped: number;
  rows: BackfillRow[];
}> {
  const filter = options.ids && options.ids.length > 0
    ? sql`AND id IN ${sql.raw(`(${options.ids.join(",")})`)}`
    : sql``;
  const styles = rows(await db.execute(sql`
    SELECT id, ourName, doorStyle, aiProfileImageUrl, renderHex
    FROM door_styles
    WHERE aiProfileImageUrl IS NOT NULL AND aiProfileImageUrl <> '' ${filter}
    ORDER BY id
  `));

  const results: BackfillRow[] = [];
  let written = 0;
  let skipped = 0;
  for (const style of styles) {
    const id = Number(style.id);
    const name = String(style.doorStyle ?? style.ourName ?? `#${id}`);
    const imageUrl = String(style.aiProfileImageUrl ?? "");
    try {
      const response = await storageFetchObject(storageKeyOf(imageUrl));
      if (!response.ok) { skipped += 1; results.push({ id, name, imageUrl, hex: null, reason: `image fetch ${response.status}` }); continue; }
      const hex = await sampleImageHex(Buffer.from(await response.arrayBuffer()));
      if (!hex) { skipped += 1; results.push({ id, name, imageUrl, hex: null, reason: "could not sample the door colour" }); continue; }
      if (!options.dryRun) {
        await db.execute(sql`UPDATE door_styles SET renderHex = ${hex} WHERE id = ${id}`);
      }
      written += 1;
      results.push({ id, name, imageUrl, hex });
    } catch (error) {
      skipped += 1;
      results.push({ id, name, imageUrl, hex: null, reason: (error as Error).message });
    }
  }
  return { total: styles.length, written, skipped, rows: results };
}