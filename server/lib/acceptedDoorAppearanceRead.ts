/**
 * Read the accepted appearance of door styles for `doorStyles.acceptedAppearance`.
 *
 * Two sources, in this order:
 *
 * 1. `door_styles`. When a run is accepted, `writeAcceptedAppearanceToStyle` writes
 *    the accepted render image and the color it read off that image onto the style
 *    row, together with `approvedVersionId`. One row per style, one query.
 * 2. The audit history, `door_rendering_versions` + `door_rendering_version_events`.
 *    Consulted for any style whose row carries no approval marker. That covers the
 *    two cases the style row cannot: the 0245 columns are not on the database yet,
 *    and a style whose run was accepted before this deploy landed, so no writeback
 *    ever reached its row. Both derive the same answer from the same rules instead
 *    of reporting "nothing approved" for a style that really does have one.
 *
 * Both paths go through `server/lib/acceptedDoorAppearance.ts`, so "the render image
 * is the source of truth" is decided in one place.
 */
import { inArray } from "drizzle-orm";
import {
  doorRenderingVersionEvents,
  doorRenderingVersions,
  doorStyles,
} from "../../drizzle/schema";
import { acceptedVersionIdForStyle } from "../../shared/doorRenderingAudit";
import type { getDb } from "../db";
import {
  ACCEPTED_APPEARANCE_READ_LIMIT,
  acceptedAppearanceFromStyleRow,
  emptyAcceptedAppearance,
  mapWithConcurrency,
  missingAcceptedAppearanceColumns,
  normalizeRenderHex,
  resolveAcceptedAppearance,
  type AcceptedAppearance,
  type RenderImageHexDeps,
} from "./acceptedDoorAppearance";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Accepted appearance for each of `styleIds`, in the same order.
 *
 * Never throws: an environment with no database, an unmigrated schema, or a query
 * that fails all answer "nothing approved" for the affected styles, so a Designer
 * renders on the catalog color instead of breaking.
 */
export async function loadAcceptedAppearances(
  db: Database | null,
  styleIds: readonly number[],
  deps: RenderImageHexDeps = {},
): Promise<AcceptedAppearance[]> {
  const ids = Array.from(new Set(styleIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (!ids.length) return [];
  if (!db) return ids.map(emptyAcceptedAppearance);

  const fromStyles = await readFromStyleRows(db, ids);
  const answers = new Map<number, AcceptedAppearance>();
  const unmarked: number[] = [];
  for (const id of ids) {
    const row = fromStyles?.get(id);
    if (row && row.approvedVersionId != null) answers.set(id, row);
    else unmarked.push(id);
  }
  if (unmarked.length) {
    const derived = await readFromAuditHistory(db, unmarked, deps);
    derived.forEach((appearance, id) => answers.set(id, appearance));
  }
  return ids.map((id) => answers.get(id) ?? emptyAcceptedAppearance(id));
}

async function readFromStyleRows(
  db: Database,
  ids: readonly number[],
): Promise<Map<number, AcceptedAppearance> | null> {
  try {
    const rows = await db.select({
      id: doorStyles.id,
      renderHex: doorStyles.renderHex,
      approvedReferenceImageUrl: doorStyles.approvedReferenceImageUrl,
      approvedVersionId: doorStyles.approvedVersionId,
      approvedAt: doorStyles.approvedAt,
    }).from(doorStyles).where(inArray(doorStyles.id, ids));
    return new Map(rows.map((row) => [row.id, acceptedAppearanceFromStyleRow(row.id, row)]));
  } catch (error) {
    // The 0245 columns are added by hand, so a deploy that lands first must answer
    // from the audit history rather than fail the read.
    if (!missingAcceptedAppearanceColumns(error).length) {
      console.error(
        `[door-style-accepted-appearance] door_styles read failed for styles ${ids.join(",")}:`,
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

/**
 * The same answer, derived from the audit tables.
 *
 * `door_rendering_version_events` decides which version is currently accepted;
 * `door_rendering_versions` supplies that version's render image and, when the image
 * cannot be read, the color the render was drawn with.
 */
async function readFromAuditHistory(
  db: Database,
  ids: readonly number[],
  deps: RenderImageHexDeps,
): Promise<Map<number, AcceptedAppearance>> {
  const answers = new Map<number, AcceptedAppearance>();
  try {
    const events = await db.select({
      id: doorRenderingVersionEvents.id,
      styleId: doorRenderingVersionEvents.styleId,
      versionId: doorRenderingVersionEvents.versionId,
      action: doorRenderingVersionEvents.action,
    }).from(doorRenderingVersionEvents).where(inArray(doorRenderingVersionEvents.styleId, ids));

    const acceptedByStyle = new Map<number, number>();
    for (const id of ids) {
      const versionId = acceptedVersionIdForStyle(events, id);
      if (versionId != null) acceptedByStyle.set(id, versionId);
    }
    if (!acceptedByStyle.size) return answers;

    const versionIds = Array.from(new Set(acceptedByStyle.values()));
    const versions = await db.select({
      id: doorRenderingVersions.id,
      renderImageUrl: doorRenderingVersions.renderImageUrl,
      approvedDoorImageUrl: doorRenderingVersions.approvedDoorImageUrl,
      renderHex: doorRenderingVersions.renderHex,
    }).from(doorRenderingVersions).where(inArray(doorRenderingVersions.id, versionIds));
    const versionById = new Map(versions.map((row) => [row.id, row]));

    // Measuring an image costs a fetch and a decode, so only the first few per
    // request are measured; beyond that the recorded color stands in until a later
    // read (or an acceptance) refreshes the style row.
    let measured = 0;
    const resolved = await mapWithConcurrency(ids, 6, async (styleId) => {
      const versionId = acceptedByStyle.get(styleId);
      const version = versionId == null ? undefined : versionById.get(versionId);
      if (!version) return emptyAcceptedAppearance(styleId);
      const allowMeasure = measured < ACCEPTED_APPEARANCE_READ_LIMIT;
      if (allowMeasure) measured += 1;
      const appearance = allowMeasure
        ? await resolveAcceptedAppearance(version, deps)
        : await resolveAcceptedAppearance({ ...version, renderImageUrl: null, approvedDoorImageUrl: null });
      return {
        styleId,
        renderHex: normalizeRenderHex(appearance.renderHex),
        approvedReferenceImageUrl: appearance.approvedReferenceImageUrl,
        approvedVersionId: version.id,
        approvedAt: null,
        colorSource: appearance.colorSource,
      } satisfies AcceptedAppearance;
    });
    for (const appearance of resolved) answers.set(appearance.styleId, appearance);
  } catch (error) {
    console.error(
      `[door-style-accepted-appearance] audit history read failed for styles ${ids.join(",")}:`,
      error instanceof Error ? error.message : error,
    );
  }
  return answers;
}
