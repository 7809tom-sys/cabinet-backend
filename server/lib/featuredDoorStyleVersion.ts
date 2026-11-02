import { eq } from "drizzle-orm";
import {
  doorRenderingVersionEvents,
  doorRenderingVersions,
  doorStyles,
} from "../../drizzle/schema";
import {
  acceptedVersionIdForStyle,
  planVersionDecision,
  verdictForOverall,
} from "../../shared/doorRenderingAudit";
import type { getDb } from "../db";
import {
  databaseErrorDetail,
  DOOR_RENDERING_APPROVAL_MIGRATION,
  ensureDoorRenderingApprovalColumns,
} from "./doorRenderingApprovalSchema";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ScoreResult = {
  scores: {
    woodGrain: number;
    color: number;
    textureSheen: number;
    profileEdges: number;
    overall: number;
  };
  notes: string;
};

export type FeaturedDoorVersionInput = {
  styleId: number;
  actorUserId: number;
  doorImageUrl: string | null;
  drawerImageUrl: string | null;
  renderHex: string | null;
};

const norm = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** A featured-style save records a version only when the photo or render color actually changed. */
export function doorStyleSaveShouldRecordVersion(
  patch: {
    doorSampleImageUrl?: unknown;
    drawerSampleImageUrl?: unknown;
    renderHex?: unknown;
  },
  previous: {
    doorSampleImageUrl: string | null;
    drawerSampleImageUrl: string | null;
    renderHex: string | null;
  }
): boolean {
  const changed = (
    key: "doorSampleImageUrl" | "drawerSampleImageUrl" | "renderHex",
    previousValue: string | null
  ) => patch[key] !== undefined && norm(patch[key]) !== norm(previousValue);
  return (
    changed("doorSampleImageUrl", previous.doorSampleImageUrl) ||
    changed("drawerSampleImageUrl", previous.drawerSampleImageUrl) ||
    changed("renderHex", previous.renderHex)
  );
}

function insertIdOf(result: unknown): number {
  const header = (Array.isArray(result) ? result[0] : result) as
    | { insertId?: number }
    | undefined;
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Door rendering version row was not saved.");
  }
  return id;
}

function renderHexOf(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const hex = trimmed.replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : trimmed.slice(0, 16);
}

/**
 * Append the featured-style version and its accept event.
 * A failure here is logged and swallowed: the door style row is already saved.
 */
export async function recordFeaturedDoorVersion(
  db: Database,
  input: FeaturedDoorVersionInput,
  score: (images: {
    sampleImage: string;
    renderImage: string;
  }) => Promise<ScoreResult> = defaultScore
): Promise<{ recorded: boolean; versionId: number | null }> {
  const doorImageUrl = input.doorImageUrl?.trim() || "";
  if (!doorImageUrl) return { recorded: false, versionId: null };
  try {
    const ready = await ensureDoorRenderingApprovalColumns(db);
    if (!ready) {
      throw new Error(
        `door_rendering_versions is missing the shared-approval columns. Run ${DOOR_RENDERING_APPROVAL_MIGRATION}.`
      );
    }
    const scored = await score({
      sampleImage: doorImageUrl,
      renderImage: doorImageUrl,
    });
    const events = await db
      .select({
        id: doorRenderingVersionEvents.id,
        styleId: doorRenderingVersionEvents.styleId,
        versionId: doorRenderingVersionEvents.versionId,
        action: doorRenderingVersionEvents.action,
      })
      .from(doorRenderingVersionEvents)
      .where(eq(doorRenderingVersionEvents.styleId, input.styleId));
    const acceptedId = acceptedVersionIdForStyle(events, input.styleId);
    const [accepted] =
      acceptedId == null
        ? []
        : await db
            .select({ overallScore: doorRenderingVersions.overallScore })
            .from(doorRenderingVersions)
            .where(eq(doorRenderingVersions.id, acceptedId))
            .limit(1);
    const verdict = verdictForOverall(
      scored.scores.overall,
      accepted?.overallScore ?? null
    );
    const drawerImageUrl = input.drawerImageUrl?.trim() || null;
    const versionId = insertIdOf(
      await db.insert(doorRenderingVersions).values({
        styleId: input.styleId,
        runId: null,
        renderingCommit: null,
        samplePhotoUrl: doorImageUrl,
        renderImageUrl: doorImageUrl,
        renderImageKey: null,
        woodGrainScore: scored.scores.woodGrain,
        colorScore: scored.scores.color,
        textureSheenScore: scored.scores.textureSheen,
        profileEdgesScore: scored.scores.profileEdges,
        overallScore: scored.scores.overall,
        acceptedOverallScore: accepted?.overallScore ?? null,
        scoreDelta: verdict.scoreDelta,
        verdict: verdict.verdict,
        notes: scored.notes.trim() ? scored.notes.trim().slice(0, 512) : null,
        source: "featured",
        renderHex: renderHexOf(input.renderHex),
        approvedDoorImageUrl: doorImageUrl,
        approvedDrawerImageUrl: drawerImageUrl,
      })
    );
    try {
      const plan = planVersionDecision({
        versions: [
          {
            id: versionId,
            styleId: input.styleId,
            overall: scored.scores.overall,
          },
        ],
        events,
        versionId,
        action: "accepted",
      });
      await db.insert(doorRenderingVersionEvents).values({
        styleId: plan.styleId,
        versionId,
        action: "accepted",
        actorUserId: input.actorUserId,
        note: null,
        previousAcceptedVersionId: plan.previousAcceptedVersionId,
      });
    } catch (error) {
      console.error(
        "[door-style-save] The rendering version row was saved. The accept event was not.",
        databaseErrorDetail(error)
      );
    }
    return { recorded: true, versionId };
  } catch (error) {
    console.error(
      "[door-style-save] Door style saved. The rendering version was not recorded.",
      databaseErrorDetail(error)
    );
    return { recorded: false, versionId: null };
  }
}

async function defaultScore(images: {
  sampleImage: string;
  renderImage: string;
}): Promise<ScoreResult> {
  const { scoreDoorRenderPair } = await import("./doorRenderingAuditScore");
  return scoreDoorRenderPair(images);
}

/** Never throws. The door style update has already been committed. */
export async function recordDoorStyleSaveVersion(
  db: Database,
  input: {
    styleId: number;
    actorUserId: number;
    patch: {
      doorSampleImageUrl?: unknown;
      drawerSampleImageUrl?: unknown;
      renderHex?: unknown;
    };
    previous: {
      doorSampleImageUrl: string | null;
      drawerSampleImageUrl: string | null;
      renderHex: string | null;
    };
  }
): Promise<void> {
  try {
    if (!doorStyleSaveShouldRecordVersion(input.patch, input.previous)) return;
    const images = await savedDoorImages(
      db,
      input.styleId,
      input.patch,
      input.previous
    );
    await recordFeaturedDoorVersion(db, {
      styleId: input.styleId,
      actorUserId: input.actorUserId,
      doorImageUrl: images.doorImageUrl,
      drawerImageUrl: images.drawerImageUrl,
      renderHex: images.renderHex,
    });
  } catch (error) {
    console.error(
      "[door-style-save] Door style saved. The rendering version was not recorded.",
      databaseErrorDetail(error)
    );
  }
}

/** Latest saved door/drawer/hex, falling back to the row from before this save. */
export async function savedDoorImages(
  db: Database,
  styleId: number,
  patch: {
    doorSampleImageUrl?: unknown;
    drawerSampleImageUrl?: unknown;
    renderHex?: unknown;
  },
  previous: {
    doorSampleImageUrl: string | null;
    drawerSampleImageUrl: string | null;
    renderHex: string | null;
  }
): Promise<{
  doorImageUrl: string | null;
  drawerImageUrl: string | null;
  renderHex: string | null;
}> {
  const [style] = await db
    .select({
      doorSampleImageUrl: doorStyles.doorSampleImageUrl,
      drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
      renderHex: doorStyles.renderHex,
    })
    .from(doorStyles)
    .where(eq(doorStyles.id, styleId))
    .limit(1);
  const text = (value: unknown, fallback: string | null) => {
    if (typeof value === "string") return value.trim() || null;
    if (value === null) return null;
    return fallback;
  };
  return {
    doorImageUrl: text(
      patch.doorSampleImageUrl,
      style?.doorSampleImageUrl ?? previous.doorSampleImageUrl
    ),
    drawerImageUrl: text(
      patch.drawerSampleImageUrl,
      style?.drawerSampleImageUrl ?? previous.drawerSampleImageUrl
    ),
    renderHex: text(patch.renderHex, style?.renderHex ?? previous.renderHex),
  };
}
