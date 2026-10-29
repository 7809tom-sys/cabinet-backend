/**
 * Door rendering audit rules shared by the admin tRPC router.
 * Render versions are append-only. Accept, reject, and revert are events.
 * The current accepted render is the newest "accepted" or "reverted" event.
 */

export const DOOR_RENDERING_AUDIT_STYLE_CAP = 40;
export const DOOR_RENDERING_AUDIT_FLAG_MARGIN = 1;

export const DOOR_RENDERING_AUDIT_SCOPES = ["all", "changed", "selected"] as const;
export type DoorRenderingAuditScope = (typeof DOOR_RENDERING_AUDIT_SCOPES)[number];

export const DOOR_RENDERING_SCORE_VERDICTS = ["flagged", "not_flagged", "no_baseline"] as const;
export type DoorRenderingScoreVerdict = (typeof DOOR_RENDERING_SCORE_VERDICTS)[number];

export const DOOR_RENDERING_DECISIONS = ["accepted", "rejected", "reverted"] as const;
export type DoorRenderingDecision = (typeof DOOR_RENDERING_DECISIONS)[number];

export const DOOR_RENDERING_FLAG_STATUSES = [
  "none",
  "no_baseline",
  "flagged",
  "rejected",
  "accepted",
  "within_baseline",
] as const;
export type DoorRenderingFlagStatus = (typeof DOOR_RENDERING_FLAG_STATUSES)[number];

export type DoorRenderScoreSet = {
  woodGrain: number;
  color: number;
  textureSheen: number;
  profileEdges: number;
  overall: number;
};

export type DoorRenderingAuditCandidate = {
  styleId: number;
  samplePhotoUrl: string | null;
  /** Resolved profile and approved render hex. When set, this is what "changed" compares. */
  expectedFingerprint?: string | null;
  latest: {
    samplePhotoUrl: string;
    renderingCommit: string | null;
  } | null;
};

export type DoorRenderingVersionRef = {
  id: number;
  styleId: number;
  overall: number;
};

export type DoorRenderingEventRef = {
  id: number;
  styleId: number;
  versionId: number;
  action: DoorRenderingDecision;
};

export class DoorRenderingAuditError extends Error {
  readonly code: "NOT_FOUND" | "BAD_REQUEST";

  constructor(message: string, code: "NOT_FOUND" | "BAD_REQUEST" = "BAD_REQUEST") {
    super(message);
    this.name = "DoorRenderingAuditError";
    this.code = code;
  }
}

export function normalizeAuditUrl(value: string | null | undefined): string {
  return (value ?? "").trim().split("?")[0].replace(/\/+$/, "");
}

export function normalizeRenderingCommit(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.slice(0, 128) : null;
}

/** A style is unchanged when the sample photo and known designer version match the latest render. */
export function styleChangedSinceLastRender(
  style: DoorRenderingAuditCandidate,
  renderingCommit: string | null,
): boolean {
  if (!normalizeAuditUrl(style.samplePhotoUrl)) return false;
  if (!style.latest) return true;
  if (normalizeAuditUrl(style.samplePhotoUrl) !== normalizeAuditUrl(style.latest.samplePhotoUrl)) return true;
  const expected = style.expectedFingerprint ?? renderingCommit;
  if (expected && expected !== (style.latest.renderingCommit ?? "")) return true;
  return false;
}

export function selectStylesForRun(input: {
  styles: readonly DoorRenderingAuditCandidate[];
  scope: DoorRenderingAuditScope;
  styleIds?: readonly number[];
  renderingCommit?: string | null;
  cap?: number;
}): {
  selected: DoorRenderingAuditCandidate[];
  skippedUnchanged: number;
  skippedMissingSample: number;
  missingStyleIds: number[];
  truncated: boolean;
} {
  const cap = input.cap ?? DOOR_RENDERING_AUDIT_STYLE_CAP;
  const renderingCommit = normalizeRenderingCommit(input.renderingCommit);
  const byId = new Map(input.styles.map((style) => [style.styleId, style]));
  const missingStyleIds: number[] = [];
  let skippedUnchanged = 0;
  let skippedMissingSample = 0;

  let eligible: DoorRenderingAuditCandidate[];
  if (input.scope === "selected") {
    const requested = input.styleIds ?? [];
    eligible = [];
    const seen = new Set<number>();
    for (const styleId of requested) {
      if (seen.has(styleId)) continue;
      seen.add(styleId);
      const style = byId.get(styleId);
      if (!style) {
        missingStyleIds.push(styleId);
        continue;
      }
      if (!normalizeAuditUrl(style.samplePhotoUrl)) {
        skippedMissingSample += 1;
        continue;
      }
      eligible.push(style);
    }
  } else {
    const changedOnly = input.scope === "changed";
    eligible = [];
    for (const style of input.styles) {
      if (!normalizeAuditUrl(style.samplePhotoUrl)) {
        skippedMissingSample += 1;
        continue;
      }
      const changed = styleChangedSinceLastRender(style, renderingCommit);
      if (changedOnly && !changed) {
        skippedUnchanged += 1;
        continue;
      }
      eligible.push(style);
    }
    eligible.sort((a, b) => Number(Boolean(a.latest)) - Number(Boolean(b.latest)) || a.styleId - b.styleId);
  }

  return {
    selected: eligible.slice(0, cap),
    skippedUnchanged,
    skippedMissingSample,
    missingStyleIds,
    truncated: eligible.length > cap,
  };
}

export function clampDoorRenderScore(value: unknown, label: string): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) {
    throw new DoorRenderingAuditError(`The vision model did not return a ${label} score.`);
  }
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

export function doorRenderScoresFromPayload(payload: {
  woodGrain?: unknown;
  color?: unknown;
  textureSheen?: unknown;
  profileEdges?: unknown;
  overall?: unknown;
}): DoorRenderScoreSet {
  return {
    woodGrain: clampDoorRenderScore(payload.woodGrain, "wood grain"),
    color: clampDoorRenderScore(payload.color, "color"),
    textureSheen: clampDoorRenderScore(payload.textureSheen, "texture and sheen"),
    profileEdges: clampDoorRenderScore(payload.profileEdges, "profile and edges"),
    overall: clampDoorRenderScore(payload.overall, "overall"),
  };
}

/** Flag when the new overall score beats the current accepted render by at least one point. */
export function verdictForOverall(
  overall: number,
  acceptedOverall: number | null,
): { verdict: DoorRenderingScoreVerdict; flagged: boolean; scoreDelta: number | null } {
  if (acceptedOverall == null) {
    return { verdict: "no_baseline", flagged: false, scoreDelta: null };
  }
  const scoreDelta = overall - acceptedOverall;
  const flagged = scoreDelta >= DOOR_RENDERING_AUDIT_FLAG_MARGIN;
  return { verdict: flagged ? "flagged" : "not_flagged", flagged, scoreDelta };
}

export function acceptedVersionIdForStyle(events: readonly DoorRenderingEventRef[], styleId: number): number | null {
  let winner: DoorRenderingEventRef | null = null;
  for (const event of events) {
    if (event.styleId !== styleId) continue;
    if (event.action !== "accepted" && event.action !== "reverted") continue;
    if (!winner || event.id > winner.id) winner = event;
  }
  return winner?.versionId ?? null;
}

export function latestEventForVersion(
  events: readonly DoorRenderingEventRef[],
  versionId: number,
): DoorRenderingEventRef | null {
  let winner: DoorRenderingEventRef | null = null;
  for (const event of events) {
    if (event.versionId !== versionId) continue;
    if (!winner || event.id > winner.id) winner = event;
  }
  return winner;
}

export function liveFlagStatus(input: {
  latest: { versionId: number; overall: number } | null;
  accepted: { versionId: number; overall: number } | null;
  latestEventAction: DoorRenderingDecision | null;
}): DoorRenderingFlagStatus {
  if (!input.latest) return "none";
  if (input.accepted && input.latest.versionId === input.accepted.versionId) return "accepted";
  if (input.latestEventAction === "rejected") return "rejected";
  if (!input.accepted) return "no_baseline";
  return input.latest.overall - input.accepted.overall >= DOOR_RENDERING_AUDIT_FLAG_MARGIN
    ? "flagged"
    : "within_baseline";
}

/**
 * Plan an accept, reject, or revert without changing any render version.
 * Accept and revert move the baseline. Reject records the decision and leaves
 * the current accepted version in place.
 */
export function planVersionDecision(input: {
  versions: readonly DoorRenderingVersionRef[];
  events: readonly DoorRenderingEventRef[];
  versionId: number;
  action: DoorRenderingDecision;
}): {
  styleId: number;
  previousAcceptedVersionId: number | null;
  nextAcceptedVersionId: number | null;
} {
  const version = input.versions.find((row) => row.id === input.versionId);
  if (!version) {
    throw new DoorRenderingAuditError("That render version was not found.", "NOT_FOUND");
  }
  const previousAcceptedVersionId = acceptedVersionIdForStyle(input.events, version.styleId);
  const latestEvent = latestEventForVersion(input.events, version.id);

  if (input.action === "rejected") {
    if (previousAcceptedVersionId === version.id) {
      throw new DoorRenderingAuditError(
        "The accepted render stays in place. Revert to another version to change it.",
      );
    }
    if (latestEvent?.action === "rejected") {
      throw new DoorRenderingAuditError("That render was already rejected.");
    }
    return {
      styleId: version.styleId,
      previousAcceptedVersionId,
      nextAcceptedVersionId: previousAcceptedVersionId,
    };
  }

  if (previousAcceptedVersionId === version.id) {
    throw new DoorRenderingAuditError("That render is already the accepted version.");
  }
  return {
    styleId: version.styleId,
    previousAcceptedVersionId,
    nextAcceptedVersionId: version.id,
  };
}
