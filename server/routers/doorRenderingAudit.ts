/**
 * Admin door rendering audit.
 *
 * The admin's browser renders each door with the Designer's three.js profile
 * and uploads the PNG. This router stores that image with the other uploaded
 * images and scores it against the style's sample photo. Render version rows
 * are insert-only: accepting, rejecting, or reverting writes an event and
 * never overwrites or deletes an older render.
 *
 * Procedures (all adminProcedure):
 *   listStyles, startRun, runStatus, submitRender, rerunStyle,
 *   decideRender, revertToVersion, runHistory, styleVersions, abandonRun,
 *   approveDoor, approveRender, revokeApproval, approvedDoors
 *
 * One approval per door style: the accepted version. The audit's Accept, the
 * Designer's "Approve this door" and Featured Styles' "Approve" all write it
 * (approveDoor / decideRender) and every place reads it (approvedDoors).
 */
import { TRPCError } from "@trpc/server";
import { and, asc, count as countRows, desc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { doorAuditFingerprintForStyle } from "../../shared/doorRenderIdentity";
import { DOOR_APPROVAL_SOURCES } from "../../shared/doorRenderingAudit";
import {
  distributors,
  doorRenderingAuditResults,
  doorRenderingAuditRuns,
  doorRenderingVersionEvents,
  doorRenderingVersions,
  doorStyles,
  users,
} from "../../drizzle/schema";
import {
  DOOR_RENDERING_AUDIT_FLAG_MARGIN,
  DOOR_RENDERING_AUDIT_STYLE_CAP,
  DoorRenderingAuditError,
  acceptedVersionIdForStyle,
  latestEventForVersion,
  liveFlagStatus,
  normalizeRenderingCommit,
  planVersionDecision,
  selectStylesForRun,
  verdictForOverall,
  type DoorRenderingAuditCandidate,
  type DoorRenderingDecision,
  type DoorRenderingFlagStatus,
} from "../../shared/doorRenderingAudit";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  decodeRenderUpload,
  doorRenderStorageKey,
  scoreDoorRenderPair,
} from "../lib/doorRenderingAuditScore";
import { storagePut } from "../storage";
import { doorModelAuditRouter } from "./doorModelAudit";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const renderingCommitInput = z.string().trim().max(128).optional();
const noteInput = z.string().trim().max(512).optional();

const startRunInput = z.object({
  scope: z.enum(["all", "changed", "selected"]).default("changed"),
  styleIds: z.array(z.number().int().positive()).max(500).optional(),
  renderingCommit: renderingCommitInput,
});

function requireDb(db: Database | null): Database {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

function insertIdOf(result: unknown): number {
  const header = (Array.isArray(result) ? result[0] : result) as { insertId?: number } | undefined;
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Door rendering audit row was not saved." });
  }
  return id;
}

function affectedRowsOf(result: unknown): number {
  const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number; rowsAffected?: number } | undefined;
  return Number(header?.affectedRows ?? header?.rowsAffected ?? 0);
}

function asAuditError(error: unknown): TRPCError {
  if (error instanceof DoorRenderingAuditError) {
    return new TRPCError({ code: error.code, message: error.message });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error && /GEMINI_API_KEY/.test(error.message)
      ? "GEMINI_API_KEY is not configured."
      : "The render could not be scored. Try this style again.",
  });
}

function optionalNote(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 512) : null;
}

const styleColumns = {
  id: doorStyles.id,
  distributorId: doorStyles.distributorId,
  distributorName: distributors.name,
  brandName: distributors.brandName,
  distributorCode: distributors.code,
  styleCode: doorStyles.styleCode,
  ourName: doorStyles.ourName,
  aliasName: doorStyles.aliasName,
  doorStyle: doorStyles.doorStyle,
  doorPanelType: doorStyles.doorPanelType,
  woodSpecies: doorStyles.woodSpecies,
  finish: doorStyles.finish,
  color: doorStyles.color,
  renderHex: doorStyles.renderHex,
  doorShape: doorStyles.doorShape,
  doorSampleImageUrl: doorStyles.doorSampleImageUrl,
  drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
  doorSampleVerified: doorStyles.doorSampleVerified,
  cornerSwatchImageUrl: doorStyles.cornerSwatchImageUrl,
  railWidth: doorStyles.railWidth,
  stileWidth: doorStyles.stileWidth,
  centerRailWidth: doorStyles.centerRailWidth,
  panelConstruction: doorStyles.panelConstruction,
  bevelWidth: doorStyles.bevelWidth,
  bevelDepth: doorStyles.bevelDepth,
  insideEdgeProfile: doorStyles.insideEdgeProfile,
  drawerFrontType: doorStyles.drawerFrontType,
  grainDirection: doorStyles.grainDirection,
  finishSheen: doorStyles.finishSheen,
  profileDescription: doorStyles.profileDescription,
  profileNotes: doorStyles.profileNotes,
};

type StyleRow = {
  id: number;
  distributorId: number;
  distributorName: string;
  brandName: string | null;
  distributorCode: string;
  styleCode: string;
  ourName: string;
  aliasName: string | null;
  doorStyle: string | null;
  doorPanelType: string | null;
  woodSpecies: string | null;
  finish: string | null;
  color: string | null;
  renderHex: string | null;
  doorShape: string | null;
  doorSampleImageUrl: string | null;
  drawerSampleImageUrl: string | null;
  doorSampleVerified: boolean;
  cornerSwatchImageUrl: string | null;
  railWidth: string | null;
  stileWidth: string | null;
  centerRailWidth: string | null;
  panelConstruction: string | null;
  bevelWidth: string | null;
  bevelDepth: string | null;
  insideEdgeProfile: string | null;
  drawerFrontType: string | null;
  grainDirection: string | null;
  finishSheen: string | null;
  profileDescription: string | null;
  profileNotes: string | null;
};

function renderBrief(style: StyleRow) {
  return {
    styleId: style.id,
    styleCode: style.styleCode,
    ourName: style.ourName,
    aliasName: style.aliasName,
    distributorId: style.distributorId,
    distributorCode: style.distributorCode,
    distributorName: style.distributorName,
    brandName: style.brandName,
    samplePhotoUrl: style.doorSampleImageUrl,
    doorSampleVerified: style.doorSampleVerified,
    color: style.color,
    finish: style.finish,
    woodSpecies: style.woodSpecies,
    renderHex: style.renderHex,
    doorShape: style.doorShape,
    profileDescription: style.profileDescription,
    profileNotes: style.profileNotes,
    sourceFingerprint: doorAuditFingerprintForStyle({
      version: "door-audit-v2-720x1080",
      ourName: style.ourName,
      styleCode: style.styleCode,
      doorStyle: style.doorStyle,
      doorPanelType: style.doorPanelType,
      panelConstruction: style.panelConstruction,
      doorShape: style.doorShape,
      profileDescription: style.profileDescription,
      profileNotes: style.profileNotes,
      color: style.color,
      finish: style.finish,
      woodSpecies: style.woodSpecies,
      renderHex: style.renderHex,
    }),
    cornerSwatchImageUrl: style.cornerSwatchImageUrl,
    profile: {
      doorStyle: style.doorStyle,
      doorPanelType: style.doorPanelType,
      railWidth: style.railWidth,
      stileWidth: style.stileWidth,
      centerRailWidth: style.centerRailWidth,
      panelConstruction: style.panelConstruction,
      bevelWidth: style.bevelWidth,
      bevelDepth: style.bevelDepth,
      insideEdgeProfile: style.insideEdgeProfile,
      drawerFrontType: style.drawerFrontType,
      grainDirection: style.grainDirection,
      finishSheen: style.finishSheen,
    },
  };
}

function versionSummary(
  row: typeof doorRenderingVersions.$inferSelect,
  isCurrentAccepted: boolean,
) {
  return {
    versionId: row.id,
    styleId: row.styleId,
    runId: row.runId,
    renderImageUrl: row.renderImageUrl,
    samplePhotoUrl: row.samplePhotoUrl,
    renderingCommit: row.renderingCommit,
    scores: {
      woodGrain: row.woodGrainScore,
      color: row.colorScore,
      textureSheen: row.textureSheenScore,
      profileEdges: row.profileEdgesScore,
      overall: row.overallScore,
    },
    acceptedOverall: row.acceptedOverallScore,
    scoreDelta: row.scoreDelta,
    verdict: row.verdict,
    notes: row.notes,
    source: row.source,
    renderHex: row.renderHex,
    approvedDoorImageUrl: row.approvedDoorImageUrl,
    approvedDrawerImageUrl: row.approvedDrawerImageUrl,
    createdAt: row.createdAt,
    isCurrentAccepted,
  };
}

async function loadActiveStyles(db: Database): Promise<StyleRow[]> {
  return db
    .select(styleColumns)
    .from(doorStyles)
    .innerJoin(distributors, eq(distributors.id, doorStyles.distributorId))
    .where(eq(doorStyles.isActive, true))
    .orderBy(asc(doorStyles.ourName), asc(doorStyles.id));
}

async function loadVersionIndex(db: Database) {
  const aggregates = await db
    .select({
      styleId: doorRenderingVersions.styleId,
      versionId: max(doorRenderingVersions.id),
      versionCount: countRows(),
    })
    .from(doorRenderingVersions)
    .groupBy(doorRenderingVersions.styleId);

  const acceptance = (await db
    .select({
      id: doorRenderingVersionEvents.id,
      styleId: doorRenderingVersionEvents.styleId,
      versionId: doorRenderingVersionEvents.versionId,
      action: doorRenderingVersionEvents.action,
    })
    .from(doorRenderingVersionEvents)
    .where(inArray(doorRenderingVersionEvents.action, ["accepted", "reverted", "revoked"])))
    .map((row) => ({
      id: Number(row.id),
      styleId: Number(row.styleId),
      versionId: Number(row.versionId),
      action: row.action,
    }));

  const acceptedVersionByStyle = new Map<number, number>();
  const styleIdList = Array.from(new Set<number>([
    ...aggregates.map((row) => Number(row.styleId)),
    ...acceptance.map((row) => row.styleId),
  ]));
  for (const styleId of styleIdList) {
    const accepted = acceptedVersionIdForStyle(acceptance, styleId);
    if (accepted != null) acceptedVersionByStyle.set(styleId, accepted);
  }

  const versionCountByStyle = new Map(aggregates.map((row) => [Number(row.styleId), Number(row.versionCount)]));
  const latestIdByStyle = new Map(aggregates.map((row) => [Number(row.styleId), Number(row.versionId)]));
  const neededIds = Array.from(new Set([
    ...Array.from(latestIdByStyle.values()),
    ...Array.from(acceptedVersionByStyle.values()),
  ])).filter((id) => id > 0);
  const versionRows = neededIds.length
    ? await db.select().from(doorRenderingVersions).where(inArray(doorRenderingVersions.id, neededIds))
    : [];
  const versionById = new Map(versionRows.map((row) => [Number(row.id), row]));

  const latestIds = Array.from(latestIdByStyle.values()).filter((id) => id > 0);
  const latestEvents = (latestIds.length
    ? await db
        .select({
          id: doorRenderingVersionEvents.id,
          styleId: doorRenderingVersionEvents.styleId,
          versionId: doorRenderingVersionEvents.versionId,
          action: doorRenderingVersionEvents.action,
        })
        .from(doorRenderingVersionEvents)
        .where(inArray(doorRenderingVersionEvents.versionId, latestIds))
    : []
  ).map((row) => ({
    id: Number(row.id),
    styleId: Number(row.styleId),
    versionId: Number(row.versionId),
    action: row.action,
  }));

  return { versionById, latestIdByStyle, acceptedVersionByStyle, versionCountByStyle, latestEvents };
}

function flagForStyle(
  index: Awaited<ReturnType<typeof loadVersionIndex>>,
  styleId: number,
): { flagStatus: DoorRenderingFlagStatus; latest: typeof doorRenderingVersions.$inferSelect | null; accepted: typeof doorRenderingVersions.$inferSelect | null } {
  const latest = index.versionById.get(index.latestIdByStyle.get(styleId) ?? -1) ?? null;
  const accepted = index.versionById.get(index.acceptedVersionByStyle.get(styleId) ?? -1) ?? null;
  const latestEvent = latest ? latestEventForVersion(index.latestEvents, latest.id) : null;
  return {
    latest,
    accepted,
    flagStatus: liveFlagStatus({
      latest: latest ? { versionId: latest.id, overall: latest.overallScore } : null,
      accepted: accepted ? { versionId: accepted.id, overall: accepted.overallScore } : null,
      latestEventAction: latestEvent?.action ?? null,
    }),
  };
}

async function assertNoOpenRun(db: Database) {
  const [open] = await db
    .select({ id: doorRenderingAuditRuns.id })
    .from(doorRenderingAuditRuns)
    .where(inArray(doorRenderingAuditRuns.status, ["awaiting_renders", "scoring"]))
    .orderBy(desc(doorRenderingAuditRuns.id))
    .limit(1);
  if (open) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `An audit run is already in progress (run ${open.id}). Abandon it before starting another.`,
    });
  }
}

async function refreshRun(db: Database, runId: number) {
  const [run] = await db.select().from(doorRenderingAuditRuns).where(eq(doorRenderingAuditRuns.id, runId)).limit(1);
  if (!run || run.status === "cancelled") return;
  const results = await db
    .select({ status: doorRenderingAuditResults.status, verdict: doorRenderingAuditResults.verdict })
    .from(doorRenderingAuditResults)
    .where(eq(doorRenderingAuditResults.runId, runId));
  const pendingCount = results.filter((row) => row.status === "pending_render").length;
  const scoringCount = results.filter((row) => row.status === "scoring").length;
  const scoredCount = results.filter((row) => row.status === "scored").length;
  const failedCount = results.filter((row) => row.status === "failed").length;
  const flaggedCount = results.filter((row) => row.verdict === "flagged").length;
  const status = results.length === 0
    ? "completed"
    : scoringCount > 0
      ? "scoring"
      : pendingCount > 0
        ? "awaiting_renders"
        : scoredCount > 0
          ? "completed"
          : "failed";
  const terminal = status === "completed" || status === "failed";
  await db.update(doorRenderingAuditRuns).set({
    pendingCount,
    scoredCount,
    failedCount,
    flaggedCount,
    selectedCount: results.length,
    status,
    completedAt: terminal ? run.completedAt ?? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(doorRenderingAuditRuns.id, runId));
}

async function createRun(
  db: Database,
  actor: { id: number; name: string | null },
  input: { scope: "all" | "changed" | "selected"; styleIds?: number[]; renderingCommit?: string },
) {
  if (input.scope === "selected" && (!input.styleIds || input.styleIds.length === 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one door style." });
  }
  await assertNoOpenRun(db);
  const styles = await loadActiveStyles(db);
  const index = await loadVersionIndex(db);
  const renderingCommit = normalizeRenderingCommit(input.renderingCommit);
  const candidates: DoorRenderingAuditCandidate[] = styles.map((style) => {
    const latest = index.versionById.get(index.latestIdByStyle.get(style.id) ?? -1) ?? null;
    const version = (renderingCommit ?? "door-audit-v2-720x1080").split("|")[0] || "door-audit-v2-720x1080";
    return {
      styleId: style.id,
      samplePhotoUrl: style.doorSampleImageUrl,
      expectedFingerprint: doorAuditFingerprintForStyle({
        version,
        ourName: style.ourName,
        styleCode: style.styleCode,
        doorStyle: style.doorStyle,
        doorPanelType: style.doorPanelType,
        panelConstruction: style.panelConstruction,
        doorShape: style.doorShape,
        profileDescription: style.profileDescription,
        profileNotes: style.profileNotes,
        color: style.color,
        finish: style.finish,
        woodSpecies: style.woodSpecies,
        renderHex: style.renderHex,
      }),
      latest: latest
        ? { samplePhotoUrl: latest.samplePhotoUrl, renderingCommit: latest.renderingCommit }
        : null,
    };
  });
  const selection = selectStylesForRun({
    styles: candidates,
    scope: input.scope,
    styleIds: input.styleIds,
    renderingCommit,
  });
  if (input.scope === "selected" && selection.selected.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: selection.skippedMissingSample > 0
        ? "The selected door styles have no sample photo to compare against."
        : "None of the selected door styles are active.",
    });
  }

  const now = new Date();
  const runId = insertIdOf(await db.insert(doorRenderingAuditRuns).values({
    scope: input.scope,
    status: selection.selected.length === 0 ? "completed" : "awaiting_renders",
    requestedBy: actor.id,
    requestedByName: actor.name?.slice(0, 255) ?? null,
    renderingCommit,
    styleCap: DOOR_RENDERING_AUDIT_STYLE_CAP,
    selectedCount: selection.selected.length,
    pendingCount: selection.selected.length,
    skippedUnchangedCount: selection.skippedUnchanged,
    skippedMissingSampleCount: selection.skippedMissingSample,
    completedAt: selection.selected.length === 0 ? now : null,
  }));

  if (selection.selected.length > 0) {
    await db.insert(doorRenderingAuditResults).values(selection.selected.map((style) => ({
      runId,
      styleId: style.styleId,
      samplePhotoUrl: style.samplePhotoUrl ?? "",
      renderingCommit,
      status: "pending_render" as const,
      verdict: "pending" as const,
    })));
  }

  const byId = new Map(styles.map((style) => [style.id, style]));
  return {
    runId,
    status: selection.selected.length === 0 ? "completed" as const : "awaiting_renders" as const,
    scope: input.scope,
    renderingCommit,
    styleCap: DOOR_RENDERING_AUDIT_STYLE_CAP,
    truncated: selection.truncated,
    skippedUnchangedCount: selection.skippedUnchanged,
    skippedMissingSampleCount: selection.skippedMissingSample,
    missingStyleIds: selection.missingStyleIds,
    styles: selection.selected.flatMap((candidate) => {
      const style = byId.get(candidate.styleId);
      return style ? [renderBrief(style)] : [];
    }),
  };
}

async function recordDecision(
  db: Database,
  actorUserId: number,
  versionId: number,
  action: DoorRenderingDecision,
  note: string | null,
) {
  const [version] = await db.select().from(doorRenderingVersions).where(eq(doorRenderingVersions.id, versionId)).limit(1);
  if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "That render version was not found." });
  const [versionRows, eventRows] = await Promise.all([
    db.select().from(doorRenderingVersions).where(eq(doorRenderingVersions.styleId, version.styleId)),
    db.select().from(doorRenderingVersionEvents).where(eq(doorRenderingVersionEvents.styleId, version.styleId)),
  ]);
  let plan;
  try {
    plan = planVersionDecision({
      versions: versionRows.map((row) => ({ id: row.id, styleId: row.styleId, overall: row.overallScore })),
      events: eventRows.map((row) => ({ id: row.id, styleId: row.styleId, versionId: row.versionId, action: row.action })),
      versionId,
      action,
    });
  } catch (error) {
    throw asAuditError(error);
  }
  const eventId = insertIdOf(await db.insert(doorRenderingVersionEvents).values({
    styleId: plan.styleId,
    versionId,
    action,
    actorUserId,
    note,
    previousAcceptedVersionId: plan.previousAcceptedVersionId,
  }));
  const latest = versionRows.reduce((best, row) => (row.id > best.id ? row : best));
  const accepted = plan.nextAcceptedVersionId == null
    ? null
    : versionRows.find((row) => row.id === plan.nextAcceptedVersionId) ?? null;
  const priorLatestEvent = latestEventForVersion(eventRows, latest.id);
  const latestEventAction = versionId === latest.id ? action : priorLatestEvent?.action ?? null;
  const flagStatus = liveFlagStatus({
    latest: { versionId: latest.id, overall: latest.overallScore },
    accepted: accepted ? { versionId: accepted.id, overall: accepted.overallScore } : null,
    latestEventAction,
  });
  return {
    eventId,
    styleId: plan.styleId,
    versionId,
    action,
    previousAcceptedVersionId: plan.previousAcceptedVersionId,
    acceptedVersionId: plan.nextAcceptedVersionId,
    flagStatus,
  };
}

export const doorRenderingAuditRouter = router({
  /** Automatic 3D door audit: approval queue, needs-attention list, approve/reject. */
  autoAudit: doorModelAuditRouter,

  /** Active door styles with sample photo, latest render, accepted render, scores, and live flag status. */
  listStyles: adminProcedure
    .input(z.object({
      search: z.string().trim().max(128).optional(),
      flaggedOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const [styles, index] = await Promise.all([loadActiveStyles(db), loadVersionIndex(db)]);
      const search = input?.search?.trim().toLowerCase() ?? "";
      const catalog = styles.map((style) => {
        const view = flagForStyle(index, style.id);
        const acceptedId = view.accepted?.id ?? null;
        return {
          ...renderBrief(style),
          missingSample: !style.doorSampleImageUrl?.trim(),
          latestRender: view.latest ? versionSummary(view.latest, view.latest.id === acceptedId) : null,
          acceptedRender: view.accepted ? versionSummary(view.accepted, true) : null,
          flagStatus: view.flagStatus,
          versionCount: index.versionCountByStyle.get(style.id) ?? 0,
        };
      });
      const rows = catalog.filter((row) => {
        if (input?.flaggedOnly && row.flagStatus !== "flagged") return false;
        if (!search) return true;
        const haystack = [row.ourName, row.aliasName, row.styleCode, row.distributorName, row.brandName, row.distributorCode]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
      return {
        styleCap: DOOR_RENDERING_AUDIT_STYLE_CAP,
        flagMargin: DOOR_RENDERING_AUDIT_FLAG_MARGIN,
        counts: {
          total: catalog.length,
          returned: rows.length,
          flagged: catalog.filter((row) => row.flagStatus === "flagged").length,
          noBaseline: catalog.filter((row) => row.flagStatus === "no_baseline").length,
          missingSample: catalog.filter((row) => row.missingSample).length,
        },
        styles: rows,
      };
    }),

  /**
   * Open a run. The response lists the styles the browser must render.
   * scope "changed" (default) skips styles whose sample photo and rendering
   * commit already match the latest stored render. Every run stops at 40 styles.
   */
  startRun: adminProcedure.input(startRunInput).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    return createRun(db, ctx.user, input);
  }),

  /** One-style run. The browser renders that door and calls submitRender. */
  rerunStyle: adminProcedure
    .input(z.object({
      styleId: z.number().int().positive(),
      renderingCommit: renderingCommitInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      return createRun(db, ctx.user, {
        scope: "selected",
        styleIds: [input.styleId],
        renderingCommit: input.renderingCommit,
      });
    }),

  runStatus: adminProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const [run] = await db.select().from(doorRenderingAuditRuns).where(eq(doorRenderingAuditRuns.id, input.runId)).limit(1);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "That audit run was not found." });
      const results = await db
        .select()
        .from(doorRenderingAuditResults)
        .where(eq(doorRenderingAuditResults.runId, run.id))
        .orderBy(asc(doorRenderingAuditResults.styleId));
      const styleIds = results.map((row) => row.styleId);
      const styles = styleIds.length
        ? await db
            .select({ id: doorStyles.id, ourName: doorStyles.ourName, styleCode: doorStyles.styleCode })
            .from(doorStyles)
            .where(inArray(doorStyles.id, styleIds))
        : [];
      const styleById = new Map(styles.map((style) => [style.id, style]));
      const scoring = results.filter((row) => row.status === "scoring").length;
      const finished = results.filter((row) => row.status === "scored" || row.status === "failed").length;
      return {
        run,
        progress: {
          total: results.length,
          pending: results.filter((row) => row.status === "pending_render").length,
          scoring,
          scored: results.filter((row) => row.status === "scored").length,
          failed: results.filter((row) => row.status === "failed").length,
          flagged: results.filter((row) => row.verdict === "flagged").length,
          percent: results.length === 0 ? 100 : Math.round((finished / results.length) * 100),
        },
        results: results.map((row) => ({
          ...row,
          ourName: styleById.get(row.styleId)?.ourName ?? null,
          styleCode: styleById.get(row.styleId)?.styleCode ?? null,
          scores: row.overallScore == null ? null : {
            woodGrain: row.woodGrainScore,
            color: row.colorScore,
            textureSheen: row.textureSheenScore,
            profileEdges: row.profileEdgesScore,
            overall: row.overallScore,
          },
        })),
      };
    }),

  /**
   * Store one browser-rendered door image, then score it with Gemini.
   * A successful score inserts a new version. Older versions are left as they are.
   */
  submitRender: adminProcedure
    .input(z.object({
      runId: z.number().int().positive(),
      styleId: z.number().int().positive(),
      imageBase64: z.string().min(32).max(12_000_000),
      contentType: z.enum(["image/png", "image/jpeg", "image/webp"]).default("image/png"),
      renderingCommit: renderingCommitInput,
    }))
    .mutation(async ({ input }) => {
      const db = requireDb(await getDb());
      let image;
      try {
        image = decodeRenderUpload(input.imageBase64, input.contentType);
      } catch (error) {
        throw asAuditError(error);
      }
      const [run] = await db.select().from(doorRenderingAuditRuns).where(eq(doorRenderingAuditRuns.id, input.runId)).limit(1);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "That audit run was not found." });
      if (run.status === "cancelled" || run.status === "completed" || run.status === "failed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This audit run is no longer accepting renders." });
      }
      const [result] = await db
        .select()
        .from(doorRenderingAuditResults)
        .where(and(eq(doorRenderingAuditResults.runId, run.id), eq(doorRenderingAuditResults.styleId, input.styleId)))
        .limit(1);
      if (!result) throw new TRPCError({ code: "BAD_REQUEST", message: "That door style is not part of this run." });
      if (result.status === "scored") {
        throw new TRPCError({ code: "CONFLICT", message: "This style was already scored for this run. Re-run the style to render it again." });
      }
      const claimed = await db
        .update(doorRenderingAuditResults)
        .set({ status: "scoring", errorMessage: null, updatedAt: new Date() })
        .where(and(
          eq(doorRenderingAuditResults.id, result.id),
          inArray(doorRenderingAuditResults.status, ["pending_render", "failed"]),
        ));
      if (affectedRowsOf(claimed) < 1) {
        throw new TRPCError({ code: "CONFLICT", message: "This style is already being scored." });
      }
      await refreshRun(db, run.id);

      try {
        const stored = await storagePut(doorRenderStorageKey(input.styleId, run.id, image.extension), image.bytes, image.contentType);
        const scored = await scoreDoorRenderPair({
          sampleImage: result.samplePhotoUrl,
          renderImage: `data:${image.contentType};base64,${image.bytes.toString("base64")}`,
        });
        const acceptedId = acceptedVersionIdForStyle(
          await db
            .select({
              id: doorRenderingVersionEvents.id,
              styleId: doorRenderingVersionEvents.styleId,
              versionId: doorRenderingVersionEvents.versionId,
              action: doorRenderingVersionEvents.action,
            })
            .from(doorRenderingVersionEvents)
            .where(and(
              eq(doorRenderingVersionEvents.styleId, input.styleId),
              inArray(doorRenderingVersionEvents.action, ["accepted", "reverted", "revoked"]),
            )),
          input.styleId,
        );
        const [accepted] = acceptedId == null
          ? []
          : await db.select().from(doorRenderingVersions).where(eq(doorRenderingVersions.id, acceptedId)).limit(1);
        const verdict = verdictForOverall(scored.scores.overall, accepted?.overallScore ?? null);
        const renderingCommit = normalizeRenderingCommit(input.renderingCommit) ?? run.renderingCommit;
        const versionId = insertIdOf(await db.insert(doorRenderingVersions).values({
          styleId: input.styleId,
          runId: run.id,
          renderingCommit,
          samplePhotoUrl: result.samplePhotoUrl,
          renderImageUrl: stored.url,
          renderImageKey: stored.key,
          woodGrainScore: scored.scores.woodGrain,
          colorScore: scored.scores.color,
          textureSheenScore: scored.scores.textureSheen,
          profileEdgesScore: scored.scores.profileEdges,
          overallScore: scored.scores.overall,
          acceptedOverallScore: accepted?.overallScore ?? null,
          scoreDelta: verdict.scoreDelta,
          verdict: verdict.verdict,
          notes: scored.notes || null,
        }));
        await db.update(doorRenderingAuditResults).set({
          status: "scored",
          renderingCommit,
          renderImageUrl: stored.url,
          versionId,
          woodGrainScore: scored.scores.woodGrain,
          colorScore: scored.scores.color,
          textureSheenScore: scored.scores.textureSheen,
          profileEdgesScore: scored.scores.profileEdges,
          overallScore: scored.scores.overall,
          acceptedOverallScore: accepted?.overallScore ?? null,
          scoreDelta: verdict.scoreDelta,
          verdict: verdict.verdict,
          notes: scored.notes || null,
          errorMessage: null,
          scoredAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(doorRenderingAuditResults.id, result.id));
        await refreshRun(db, run.id);
        return {
          runId: run.id,
          styleId: input.styleId,
          resultId: result.id,
          versionId,
          renderImageUrl: stored.url,
          scores: scored.scores,
          acceptedOverall: accepted?.overallScore ?? null,
          scoreDelta: verdict.scoreDelta,
          verdict: verdict.verdict,
          flagged: verdict.flagged,
          notes: scored.notes,
        };
      } catch (error) {
        console.error("[door-rendering-audit]", error);
        const safe = asAuditError(error);
        await db.update(doorRenderingAuditResults).set({
          status: "failed",
          errorMessage: safe.message.slice(0, 512),
          updatedAt: new Date(),
        }).where(eq(doorRenderingAuditResults.id, result.id));
        await refreshRun(db, run.id);
        throw safe;
      }
    }),

  /** Accept makes the version the new baseline. Reject leaves the current baseline in place. */
  decideRender: adminProcedure
    .input(z.object({
      versionId: z.number().int().positive(),
      decision: z.enum(["accept", "reject"]),
      note: noteInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      return recordDecision(
        db,
        ctx.user.id,
        input.versionId,
        input.decision === "accept" ? "accepted" : "rejected",
        optionalNote(input.note),
      );
    }),

  /** Point the style's current accepted render at an older version. The newer render stays in history. */
  revertToVersion: adminProcedure
    .input(z.object({
      versionId: z.number().int().positive(),
      note: noteInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      return recordDecision(db, ctx.user.id, input.versionId, "reverted", optionalNote(input.note));
    }),

  /** Every stored render for one style, newest first, including which one is accepted. */
  styleVersions: adminProcedure
    .input(z.object({ styleId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const [anyStyle] = await db
        .select(styleColumns)
        .from(doorStyles)
        .innerJoin(distributors, eq(distributors.id, doorStyles.distributorId))
        .where(eq(doorStyles.id, input.styleId))
        .limit(1);
      if (!anyStyle) throw new TRPCError({ code: "NOT_FOUND", message: "That door style was not found." });
      const versions = await db
        .select()
        .from(doorRenderingVersions)
        .where(eq(doorRenderingVersions.styleId, input.styleId))
        .orderBy(desc(doorRenderingVersions.id));
      const events = await db
        .select({
          id: doorRenderingVersionEvents.id,
          styleId: doorRenderingVersionEvents.styleId,
          versionId: doorRenderingVersionEvents.versionId,
          action: doorRenderingVersionEvents.action,
          actorUserId: doorRenderingVersionEvents.actorUserId,
          actorName: users.name,
          note: doorRenderingVersionEvents.note,
          previousAcceptedVersionId: doorRenderingVersionEvents.previousAcceptedVersionId,
          createdAt: doorRenderingVersionEvents.createdAt,
        })
        .from(doorRenderingVersionEvents)
        .leftJoin(users, eq(users.id, doorRenderingVersionEvents.actorUserId))
        .where(eq(doorRenderingVersionEvents.styleId, input.styleId))
        .orderBy(desc(doorRenderingVersionEvents.id));
      const acceptedVersionId = acceptedVersionIdForStyle(events, input.styleId);
      const latest = versions[0] ?? null;
      const accepted = versions.find((row) => row.id === acceptedVersionId) ?? null;
      const latestEvent = latest ? latestEventForVersion(events, latest.id) : null;
      return {
        ...renderBrief(anyStyle),
        acceptedVersionId,
        flagStatus: liveFlagStatus({
          latest: latest ? { versionId: latest.id, overall: latest.overallScore } : null,
          accepted: accepted ? { versionId: accepted.id, overall: accepted.overallScore } : null,
          latestEventAction: latestEvent?.action ?? null,
        }),
        versions: versions.map((row) => ({
          ...versionSummary(row, row.id === acceptedVersionId),
          events: events.filter((event) => event.versionId === row.id),
        })),
      };
    }),

  /**
   * Approve a door from the Designer or Featured Styles. Writes the one shared
   * approval: a new version (scored like any audit render) plus an accept event.
   * Designer sends the locked-capture render. Featured Styles sends its door and
   * drawer photos, and the door photo is the reference image. Older versions stay.
   */
  approveDoor: adminProcedure
    .input(z.object({
      styleId: z.number().int().positive(),
      source: z.enum(["designer", "featured"] satisfies Exclude<(typeof DOOR_APPROVAL_SOURCES)[number], "audit">[]),
      imageBase64: z.string().min(32).max(12_000_000).optional(),
      contentType: z.enum(["image/png", "image/jpeg", "image/webp"]).default("image/png"),
      doorImageUrl: z.string().trim().max(512).optional(),
      drawerImageUrl: z.string().trim().max(512).optional(),
      renderHex: z.string().trim().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
      renderingCommit: renderingCommitInput,
      note: noteInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [style] = await db.select(styleColumns).from(doorStyles)
        .innerJoin(distributors, eq(distributors.id, doorStyles.distributorId))
        .where(eq(doorStyles.id, input.styleId)).limit(1);
      if (!style) throw new TRPCError({ code: "NOT_FOUND", message: "That door style was not found." });
      const samplePhotoUrl = style.doorSampleImageUrl?.trim();
      if (!samplePhotoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "This style has no door sample photo to approve against." });

      let renderImageUrl: string;
      let renderImageKey: string | null = null;
      let scoreInput: string;
      let doorImageUrl: string | null = null;
      let drawerImageUrl: string | null = null;
      if (input.source === "designer") {
        if (!input.imageBase64) throw new TRPCError({ code: "BAD_REQUEST", message: "The Designer approval needs the captured render." });
        let image;
        try {
          image = decodeRenderUpload(input.imageBase64, input.contentType);
        } catch (error) {
          throw asAuditError(error);
        }
        const stored = await storagePut(doorRenderStorageKey(input.styleId, Date.now(), image.extension), image.bytes, image.contentType);
        renderImageUrl = stored.url;
        renderImageKey = stored.key;
        scoreInput = `data:${image.contentType};base64,${image.bytes.toString("base64")}`;
      } else {
        doorImageUrl = (input.doorImageUrl ?? samplePhotoUrl).trim();
        drawerImageUrl = (input.drawerImageUrl ?? style.drawerSampleImageUrl ?? "").trim() || null;
        if (!doorImageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Featured Styles needs a door photo to approve." });
        renderImageUrl = doorImageUrl;
        scoreInput = doorImageUrl;
      }

      let scored;
      try {
        scored = await scoreDoorRenderPair({ sampleImage: samplePhotoUrl, renderImage: scoreInput });
      } catch (error) {
        console.error("[door-rendering-audit]", error);
        throw asAuditError(error);
      }
      const events = await db.select().from(doorRenderingVersionEvents).where(eq(doorRenderingVersionEvents.styleId, input.styleId));
      const acceptedId = acceptedVersionIdForStyle(events, input.styleId);
      const [accepted] = acceptedId == null
        ? []
        : await db.select().from(doorRenderingVersions).where(eq(doorRenderingVersions.id, acceptedId)).limit(1);
      const verdict = verdictForOverall(scored.scores.overall, accepted?.overallScore ?? null);
      const versionId = insertIdOf(await db.insert(doorRenderingVersions).values({
        styleId: input.styleId,
        runId: null,
        renderingCommit: normalizeRenderingCommit(input.renderingCommit),
        samplePhotoUrl,
        renderImageUrl,
        renderImageKey,
        woodGrainScore: scored.scores.woodGrain,
        colorScore: scored.scores.color,
        textureSheenScore: scored.scores.textureSheen,
        profileEdgesScore: scored.scores.profileEdges,
        overallScore: scored.scores.overall,
        acceptedOverallScore: accepted?.overallScore ?? null,
        scoreDelta: verdict.scoreDelta,
        verdict: verdict.verdict,
        notes: scored.notes || null,
        source: input.source,
        renderHex: input.renderHex ? `#${input.renderHex.replace(/^#/, "").toLowerCase()}` : style.renderHex ?? null,
        approvedDoorImageUrl: doorImageUrl,
        approvedDrawerImageUrl: drawerImageUrl,
      }));
      const decision = await recordDecision(db, ctx.user.id, versionId, "accepted", optionalNote(input.note));
      return { ...decision, versionId, source: input.source, renderImageUrl, scores: scored.scores };
    }),

  /**
   * The audit screen's Approve button. Same shared approval as approveDoor: it
   * makes an existing scored version the approved render (an accept event).
   */
  approveRender: adminProcedure
    .input(z.object({
      versionId: z.number().int().positive(),
      styleId: z.number().int().positive().optional(),
      note: noteInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const result = await recordDecision(db, ctx.user.id, input.versionId, "accepted", optionalNote(input.note));
      if (input.styleId != null && input.styleId !== result.styleId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That render belongs to a different door style." });
      }
      return result;
    }),

  /** Withdraw the approval for one style. Every version and photo is kept. */
  revokeApproval: adminProcedure
    .input(z.object({ styleId: z.number().int().positive(), note: noteInput }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const events = await db.select().from(doorRenderingVersionEvents).where(eq(doorRenderingVersionEvents.styleId, input.styleId));
      const acceptedId = acceptedVersionIdForStyle(events, input.styleId);
      if (acceptedId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "This door style has no approval to revoke." });
      return recordDecision(db, ctx.user.id, acceptedId, "revoked", optionalNote(input.note));
    }),

  /** The one approval per door style that the Designer, the audit and Featured Styles all read. */
  approvedDoors: adminProcedure
    .input(z.object({ styleIds: z.array(z.number().int().positive()).max(500).optional() }).optional())
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const events = await db
        .select()
        .from(doorRenderingVersionEvents)
        .where(inArray(doorRenderingVersionEvents.action, ["accepted", "reverted", "revoked"]));
      const styleIds = Array.from(new Set(events.map((event) => event.styleId)))
        .filter((id) => !input?.styleIds || input.styleIds.includes(id));
      const approvedByStyle = new Map<number, number>();
      for (const styleId of styleIds) {
        const versionId = acceptedVersionIdForStyle(events, styleId);
        if (versionId != null) approvedByStyle.set(styleId, versionId);
      }
      const versionIds = Array.from(approvedByStyle.values());
      const versions = versionIds.length
        ? await db.select().from(doorRenderingVersions).where(inArray(doorRenderingVersions.id, versionIds))
        : [];
      const versionById = new Map(versions.map((row) => [row.id, row]));
      return {
        approvals: Array.from(approvedByStyle.entries()).flatMap(([styleId, versionId]) => {
          const row = versionById.get(versionId);
          if (!row) return [];
          const event = events.filter((e) => e.versionId === versionId && e.action !== "revoked").sort((a, b) => b.id - a.id)[0];
          return [{
            styleId,
            versionId,
            source: row.source,
            renderImageUrl: row.renderImageUrl,
            renderHex: row.renderHex,
            approvedDoorImageUrl: row.approvedDoorImageUrl,
            approvedDrawerImageUrl: row.approvedDrawerImageUrl,
            overallScore: row.overallScore,
            approvedAt: event?.createdAt ?? row.createdAt,
            approvedByUserId: event?.actorUserId ?? null,
          }];
        }),
      };
    }),

  runHistory: adminProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).default(24) }).optional())
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const runs = await db
        .select()
        .from(doorRenderingAuditRuns)
        .orderBy(desc(doorRenderingAuditRuns.id))
        .limit(input?.limit ?? 24);
      return { runs };
    }),

  /** Stop an open run so another can start. Stored renders are kept. */
  abandonRun: adminProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = requireDb(await getDb());
      const [run] = await db.select().from(doorRenderingAuditRuns).where(eq(doorRenderingAuditRuns.id, input.runId)).limit(1);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "That audit run was not found." });
      if (run.status !== "awaiting_renders" && run.status !== "scoring") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only an open audit run can be abandoned." });
      }
      await db.update(doorRenderingAuditRuns).set({
        status: "cancelled",
        completedAt: new Date(),
        errorMessage: "Abandoned by an admin.",
        updatedAt: new Date(),
      }).where(eq(doorRenderingAuditRuns.id, run.id));
      return { runId: run.id, status: "cancelled" as const };
    }),
});
