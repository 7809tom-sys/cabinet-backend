/**
 * The accepted appearance of a door style: the render an admin approved.
 *
 * Owner rule: any approved render becomes the kitchen's color.
 *
 * The accepted render IMAGE is the source of truth. Its color is read out of that
 * image (the dominant door-face color), never from a swatch, a paint match, or a
 * hex typed into a form. That distinction is the whole point of this module: a
 * style whose catalog color is a flat #c8a040 must render the light tan of the
 * render that was actually approved, not the catalog value again.
 *
 * Accepted runs live in `door_rendering_versions`, and which one is accepted comes
 * from `door_rendering_version_events`. `writeAcceptedAppearanceToStyle` copies the
 * winner onto `door_styles` so the Designer and the kitchen read it in one row, and
 * `resolveAcceptedAppearance` is the derivation both the write path and the read
 * path use.
 *
 * `recordDecision` in `doorRenderingAudit.ts` is the only writer: accept writes the
 * run, revert re-points at the version it reverted to, revoke withdraws it.
 *
 * Columns come from docs/sql/0245_door_style_accepted_run.tidb.sql.
 */
import { eq } from "drizzle-orm";
import { doorStyles } from "../../drizzle/schema";
import type { getDb } from "../db";
import { extractDominantColor } from "./colorSampler";
import { imageUrlToDataUrl } from "./doorRenderingAuditScore";

/** A `door_rendering_versions` row, narrowed to what an accepted appearance needs. */
export type AcceptedRenderVersion = {
  id: number;
  /** The run's rendered door PNG. Always present on a stored version. */
  renderImageUrl?: string | null;
  /** The door photo approved with the render (Designer and Featured Styles sources). */
  approvedDoorImageUrl?: string | null;
  /** The color the render was drawn with. A record of the render, never the answer. */
  renderHex?: string | null;
};

/** Where a returned `renderHex` came from, so a caller can tell a reading from a setting. */
export type AcceptedColorSource = "render-image" | "version-render-hex" | "none";

export type AcceptedAppearanceLookup = {
  /** The accepted render image's own color, or null when the image cannot be read. */
  renderHex: string | null;
  /** The accepted render image, used as the kitchen's face texture. */
  approvedReferenceImageUrl: string | null;
  colorSource: AcceptedColorSource;
};

export const NOTHING_APPROVED: AcceptedAppearanceLookup = {
  renderHex: null,
  approvedReferenceImageUrl: null,
  colorSource: "none",
};

const HEX = /^#?([0-9a-f]{6})$/i;

/** `#rrggbb` from any 6-digit hex, or null. Anything else is not a color we can render. */
export function normalizeRenderHex(value: string | null | undefined): string | null {
  const match = HEX.exec((value ?? "").trim());
  return match ? `#${match[1]!.toLowerCase()}` : null;
}

/**
 * The image an approval signed off on.
 *
 * The approved door photo wins when the approval captured one, because that is the
 * image an admin approved; otherwise it is the run's rendered PNG.
 */
export function acceptedRenderImageUrl(version: AcceptedRenderVersion | null | undefined): string | null {
  const approved = (version?.approvedDoorImageUrl ?? "").trim();
  if (approved) return approved;
  const rendered = (version?.renderImageUrl ?? "").trim();
  return rendered || null;
}

export type RenderImageHexDeps = {
  /** Load an image URL (or data URL) as a data URL. */
  loadImage?: (imageUrl: string) => Promise<string>;
  /** Dominant door-face color of an image, as 6 hex digits, or null. */
  dominantHex?: (bytes: Buffer) => Promise<string | null>;
};

const DERIVED_HEX_TTL_MS = 10 * 60 * 1000;
const DERIVED_HEX_CACHE_LIMIT = 500;
const derivedHexCache = new Map<string, { hex: string | null; expiresAt: number }>();

/** Test hook. The cache only saves repeat work; dropping it is always safe. */
export function resetAcceptedDoorAppearanceCache(): void {
  derivedHexCache.clear();
}

function base64Bytes(dataUrl: string): Buffer | null {
  const match = /^data:[^;]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const bytes = Buffer.from(match[1]!.replace(/\s/g, ""), "base64");
  return bytes.length ? bytes : null;
}

/**
 * Read the accepted render image's own color.
 *
 * This is the derivation the kitchen depends on: the door face is measured, not
 * looked up. A render whose image cannot be read returns null so callers can fall
 * back openly instead of inventing a color.
 */
export async function deriveRenderImageHex(
  imageUrl: string,
  deps: RenderImageHexDeps = {},
  now = Date.now(),
): Promise<string | null> {
  const url = imageUrl.trim();
  if (!url) return null;
  const cached = derivedHexCache.get(url);
  if (cached && cached.expiresAt > now) return cached.hex;

  const remember = (hex: string | null) => {
    if (!derivedHexCache.has(url) && derivedHexCache.size >= DERIVED_HEX_CACHE_LIMIT) {
      const oldest = derivedHexCache.keys().next();
      if (!oldest.done) derivedHexCache.delete(oldest.value);
    }
    derivedHexCache.set(url, { hex, expiresAt: now + DERIVED_HEX_TTL_MS });
    return hex;
  };

  const loadImage = deps.loadImage ?? imageUrlToDataUrl;
  const dominantHex = deps.dominantHex ?? ((bytes: Buffer) => extractDominantColor(bytes));
  try {
    const bytes = base64Bytes(await loadImage(url));
    if (!bytes) return remember(null);
    return remember(normalizeRenderHex(await dominantHex(bytes)));
  } catch (error) {
    // An unreadable image must never fail an approval or a page load.
    console.error(
      "[door-style-accepted-appearance] could not read the accepted render image:",
      error instanceof Error ? error.message : error,
    );
    return remember(null);
  }
}

/**
 * The accepted render's image and color.
 *
 * The image is measured. The version's recorded `renderHex` is used only when the
 * image cannot be read, and it is reported as `version-render-hex` so a caller can
 * see that the answer is weaker: for an audit run that value can still be the flat
 * catalog hex the render was drawn on top of.
 */
export async function resolveAcceptedAppearance(
  version: AcceptedRenderVersion | null | undefined,
  deps: RenderImageHexDeps = {},
): Promise<AcceptedAppearanceLookup> {
  if (!version) return NOTHING_APPROVED;
  const imageUrl = acceptedRenderImageUrl(version);
  const recordedHex = normalizeRenderHex(version.renderHex);
  const fallback = recordedHex
    ? { renderHex: recordedHex, approvedReferenceImageUrl: imageUrl, colorSource: "version-render-hex" as const }
    : { renderHex: null, approvedReferenceImageUrl: imageUrl, colorSource: "none" as const };
  if (!imageUrl) return fallback;
  const derivedHex = await deriveRenderImageHex(imageUrl, deps);
  return derivedHex
    ? { renderHex: derivedHex, approvedReferenceImageUrl: imageUrl, colorSource: "render-image" }
    : fallback;
}

type AppearanceWriter = Pick<
  NonNullable<Awaited<ReturnType<typeof getDb>>>,
  "select" | "update"
>;

export type AcceptedAppearanceWriteback = {
  /** Whether the style row was written. False when the database refused the write. */
  applied: boolean;
  appearance: AcceptedAppearanceLookup;
};

export type WriteAcceptedAppearanceDeps = RenderImageHexDeps & {
  /**
   * The version whose approval is being withdrawn. Its derived color is compared
   * with the style's current `renderHex`: an identical value is one this feature
   * wrote and is therefore cleared, while a different one is an admin's own color
   * and is left alone.
   */
  withdrawnVersion?: AcceptedRenderVersion | null;
  now?: Date;
};

/**
 * Write (or clear) the accepted appearance on its door style.
 *
 * `recordDecision` calls this on every accept, revert, and revoke. Only the four
 * columns this feature owns are written: prices, catalog flags, and the sample
 * photos are never touched. A failure is logged and swallowed — the version row and
 * its event are already stored, and an approval must never be lost because its
 * style row could not be updated.
 */
export async function writeAcceptedAppearanceToStyle(
  db: AppearanceWriter,
  styleId: number,
  accepted: AcceptedRenderVersion | null,
  deps: WriteAcceptedAppearanceDeps = {},
): Promise<AcceptedAppearanceWriteback> {
  const appearance = accepted
    ? await resolveAcceptedAppearance(accepted, deps)
    : NOTHING_APPROVED;
  try {
    if (accepted) {
      await db.update(doorStyles)
        .set({
          renderHex: appearance.renderHex,
          approvedReferenceImageUrl: appearance.approvedReferenceImageUrl,
          approvedVersionId: accepted.id,
          approvedAt: deps.now ?? new Date(),
        })
        .where(eq(doorStyles.id, styleId));
      return { applied: true, appearance };
    }

    const values: Record<string, unknown> = {
      approvedReferenceImageUrl: null,
      approvedVersionId: null,
      approvedAt: null,
    };
    // Withdrawing an approval: drop the accepted color so the style's own saved
    // catalog color takes over again, but only if this feature is what put it there.
    const withdrawn = deps.withdrawnVersion ?? null;
    if (withdrawn) {
      const [style] = await db
        .select({ renderHex: doorStyles.renderHex })
        .from(doorStyles)
        .where(eq(doorStyles.id, styleId))
        .limit(1);
      const writtenColor = await resolveAcceptedAppearance(withdrawn, deps);
      if (writtenColor.renderHex && normalizeRenderHex(style?.renderHex) === writtenColor.renderHex) {
        values.renderHex = null;
      }
    }
    await db.update(doorStyles).set(values).where(eq(doorStyles.id, styleId));
    return { applied: true, appearance };
  } catch (error) {
    console.error(
      "[door-style-accepted-appearance] accepted appearance writeback failed:",
      error instanceof Error ? error.message : error,
    );
    return { applied: false, appearance };
  }
}

/**
 * Every style id named in an "unknown column" error, or an empty list.
 *
 * The 0245 columns are added by hand, so a deploy that lands before the migration
 * must degrade to the audit history instead of returning 500.
 */
export function missingAcceptedAppearanceColumns(error: unknown): string[] {
  const wanted = ["renderHex", "approvedReferenceImageUrl", "approvedVersionId", "approvedAt"];
  const found = new Set<string>();
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const row = current as { message?: unknown; sqlMessage?: unknown; code?: unknown; errno?: unknown };
    const text = [row.message, row.sqlMessage].filter((part): part is string => typeof part === "string").join(" ");
    if (/unknown column/i.test(text) || row.code === "ER_BAD_FIELD_ERROR" || row.errno === 1054) {
      for (const column of wanted) {
        if (new RegExp(`\\b${column}\\b`, "i").test(text)) found.add(column);
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return Array.from(found);
}

/** How many accepted renders one request will measure. Bounds the work on a wide read. */
export const ACCEPTED_APPEARANCE_READ_LIMIT = 24;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** What `doorStyles.acceptedAppearance` returns for one style. */
export type AcceptedAppearance = {
  styleId: number;
  /** The accepted render image's own color. Null when nothing is approved. */
  renderHex: string | null;
  /** The accepted render image, used as the kitchen's face texture. */
  approvedReferenceImageUrl: string | null;
  /** Non-null only when a run was actually accepted. The marker the client trusts. */
  approvedVersionId: number | null;
  approvedAt: Date | null;
  /** Where `renderHex` came from. `none` means nothing is approved. */
  colorSource: AcceptedColorSource;
};

export function emptyAcceptedAppearance(styleId: number): AcceptedAppearance {
  return {
    styleId,
    renderHex: null,
    approvedReferenceImageUrl: null,
    approvedVersionId: null,
    approvedAt: null,
    colorSource: "none",
  };
}

/** A `door_styles` row as the accepted-appearance read needs it. */
export type AcceptedAppearanceStyleRow = {
  id: number;
  renderHex: string | null;
  approvedReferenceImageUrl: string | null;
  approvedVersionId: number | null;
  approvedAt: Date | null;
};

/**
 * One style's accepted appearance from its `door_styles` row.
 *
 * `approvedVersionId` is the marker: without it the style has no accepted run, and
 * a `renderHex` an admin typed into the style editor is not an approval. The stored
 * `renderHex` is the color this feature read off the accepted image when the run was
 * accepted, so it is returned as-is rather than re-measured on every read.
 */
export function acceptedAppearanceFromStyleRow(
  styleId: number,
  row: (Omit<AcceptedAppearanceStyleRow, "id"> & { id?: number }) | undefined,
): AcceptedAppearance {
  if (!row || row.approvedVersionId == null) return emptyAcceptedAppearance(styleId);
  const renderHex = normalizeRenderHex(row.renderHex);
  const image = (row.approvedReferenceImageUrl ?? "").trim() || null;
  return {
    styleId,
    renderHex,
    approvedReferenceImageUrl: image,
    approvedVersionId: row.approvedVersionId,
    approvedAt: row.approvedAt ?? null,
    colorSource: renderHex ? "render-image" : "none",
  };
}
