import { randomUUID } from "crypto";
import {
  DOOR_MODEL_RENDERER_NOT_CONFIGURED,
  DoorModelAuditError,
  enqueueDecision,
  evaluateChecks,
  nextStatusAfterCheck,
  normalizeMaxAttempts,
  normalizePassScore,
  type DoorModelAuditSource,
  type DoorModelAuditStatus,
  type DoorModelCheckNotes,
  type DoorModelCheckScores,
} from "../shared/doorModelAudit";
import type { DoorModelCheckInput, DoorModelCheckResult } from "./lib/doorModelAuditCheck";
import type { DoorModelRenderer } from "./lib/doorModelRenderer";

const LOG_PREFIX = "[door-model-audit]";

export type AuditStyleRow = DoorModelAuditSource & { id: number; ourName: string };

export type AuditRow = {
  id: number;
  styleId: number;
  status: DoorModelAuditStatus;
  sourceFingerprint: string;
  doorSampleUrl: string;
  drawerSampleUrl: string | null;
  attemptCount: number;
  maxAttempts: number;
  claimToken: string | null;
  currentAttemptId: number | null;
  approvedAttemptId: number | null;
  approvedModelSpec: string | null;
  tomFeedback: string | null;
  flaggedReasons: string | null;
  errorMessage: string | null;
};

export type AttemptRow = {
  id: number;
  auditId: number;
  attemptNo: number;
  modelSpec: string | null;
  straightPreviewUrl: string | null;
  threeQuarterPreviewUrl: string | null;
  runPreviewUrl: string | null;
  passed: boolean | null;
  reasons: string | null;
};

export type NewAttempt = {
  auditId: number;
  styleId: number;
  attemptNo: number;
  trigger: "auto" | "auto_revision" | "tom_rejection";
  feedbackUsed: string | null;
};

export type AttemptPatch = {
  modelSpec?: string | null;
  straightPreviewUrl?: string | null;
  threeQuarterPreviewUrl?: string | null;
  runPreviewUrl?: string | null;
  scores?: DoorModelCheckScores;
  notes?: DoorModelCheckNotes;
  passed?: boolean;
  reasons?: string | null;
  checkerModel?: string | null;
  errorMessage?: string | null;
};

export type AuditPatch = Partial<Omit<AuditRow, "id" | "styleId">> & { stampStatusTime?: boolean };

export interface DoorModelAuditStore {
  loadStyle(styleId: number): Promise<AuditStyleRow | null>;
  loadAudit(styleId: number): Promise<AuditRow | null>;
  /** Insert a queued job, or reset the existing one back to queued. */
  upsertQueued(input: { styleId: number; source: AuditStyleRow; maxAttempts: number; withdrawApproval: boolean }): Promise<void>;
  /** Atomically move queued/rejected -> generating. False when someone else holds it. */
  claim(styleId: number, token: string): Promise<boolean>;
  updateAudit(styleId: number, patch: AuditPatch): Promise<void>;
  insertAttempt(input: NewAttempt): Promise<number>;
  updateAttempt(id: number, patch: AttemptPatch): Promise<void>;
  loadAttempt(id: number): Promise<AttemptRow | null>;
  attemptCount(auditId: number): Promise<number>;
  recordEvent(input: {
    auditId: number; styleId: number; fromStatus: DoorModelAuditStatus | null;
    toStatus: DoorModelAuditStatus; attemptNo?: number | null; actorUserId?: number | null; note?: string | null;
  }): Promise<void>;
}

export type DoorModelChecker = (input: DoorModelCheckInput) => Promise<DoorModelCheckResult>;

export type AuditRunResult = { outcome: "skipped" | "awaiting_tom" | "flagged"; reason: string };

function message(error: unknown): string {
  return (error instanceof Error ? error.message : "3D door audit failed").slice(0, 480);
}

function feedbackFrom(reasons: string[]): string | null {
  const text = reasons.join(" | ").trim();
  return text ? text.slice(0, 1000) : null;
}

/**
 * Queue (or re-queue) a style when its door/drawer photo or model inputs changed.
 * Returns true when a job is queued and should be run.
 */
export async function enqueueDoorModelAudit(
  store: DoorModelAuditStore,
  styleId: number,
  options?: { force?: boolean; maxAttempts?: number },
): Promise<{ queued: boolean; reason: string }> {
  const style = await store.loadStyle(styleId);
  if (!style) return { queued: false, reason: "missing-style" };
  const existing = await store.loadAudit(styleId);
  const decision = enqueueDecision({ source: style, existing, force: options?.force });
  if (decision.action === "skip") return { queued: false, reason: decision.reason };
  await store.upsertQueued({
    styleId,
    source: style,
    maxAttempts: normalizeMaxAttempts(options?.maxAttempts ?? process.env.DOOR_MODEL_AUDIT_MAX_ATTEMPTS),
    // A changed photo means an earlier approval no longer matches it.
    withdrawApproval: decision.reason !== "first-time",
  });
  const audit = await store.loadAudit(styleId);
  if (audit) {
    await store.recordEvent({
      auditId: audit.id, styleId, fromStatus: existing?.status ?? null, toStatus: "queued", note: decision.reason,
    });
  }
  return { queued: true, reason: decision.reason };
}

/**
 * Generate -> check -> revise loop for one queued job. Failures are stored on
 * the job and never thrown. A pass ends in awaiting_tom; exhausting the
 * attempts ends in flagged. Nothing here makes a model live.
 */
export async function runDoorModelAudit(
  store: DoorModelAuditStore,
  deps: { renderer: DoorModelRenderer; checker: DoorModelChecker },
  styleId: number,
  options?: { passScore?: number; log?: (m: string) => void; newToken?: () => string },
): Promise<AuditRunResult> {
  const log = options?.log ?? ((m: string) => console.error(m));
  const passScore = normalizePassScore(options?.passScore ?? process.env.DOOR_MODEL_AUDIT_PASS_SCORE);
  const token = options?.newToken?.() ?? randomUUID();
  const style = await store.loadStyle(styleId);
  if (!style) return { outcome: "skipped", reason: "missing-style" };
  if (!(await store.claim(styleId, token))) return { outcome: "skipped", reason: "not-claimable" };

  const audit = await store.loadAudit(styleId);
  if (!audit) return { outcome: "skipped", reason: "missing-audit" };
  const owns = async () => (await store.loadAudit(styleId))?.claimToken === token;
  const move = async (from: DoorModelAuditStatus, to: DoorModelAuditStatus, patch: AuditPatch, note?: string | null, attemptNo?: number) => {
    await store.updateAudit(styleId, { ...patch, status: to, stampStatusTime: true });
    await store.recordEvent({ auditId: audit.id, styleId, fromStatus: from, toStatus: to, attemptNo: attemptNo ?? null, note: note ?? null });
  };
  const flag = async (from: DoorModelAuditStatus, reasons: string[], attemptNo?: number): Promise<AuditRunResult> => {
    const text = reasons.join("\n").slice(0, 4000);
    await move(from, "flagged", { claimToken: null, flaggedReasons: text, errorMessage: null }, reasons[0] ?? "flagged", attemptNo);
    log(`${LOG_PREFIX} style ${styleId} flagged: ${reasons[0] ?? ""}`);
    return { outcome: "flagged", reason: reasons[0] ?? "flagged" };
  };

  if (!deps.renderer.configured()) {
    return flag("generating", [DOOR_MODEL_RENDERER_NOT_CONFIGURED]);
  }

  let feedback = audit.tomFeedback;
  let trigger: NewAttempt["trigger"] = audit.tomFeedback ? "tom_rejection" : "auto";
  let used = 0;
  let previousSpec: string | null = null;
  let lastReasons: string[] = [];
  let lastStatus: DoorModelAuditStatus = "generating";
  const maxAttempts = normalizeMaxAttempts(audit.maxAttempts);

  while (used < maxAttempts) {
    if (!(await owns())) return { outcome: "skipped", reason: "claim-lost" };
    used += 1;
    const attemptNo = (await store.attemptCount(audit.id)) + 1;
    const attemptId = await store.insertAttempt({ auditId: audit.id, styleId, attemptNo, trigger, feedbackUsed: feedback });
    await store.updateAudit(styleId, { attemptCount: used, currentAttemptId: attemptId });

    let rendered;
    try {
      rendered = await deps.renderer.render({
        style: { id: style.id, ourName: style.ourName, doorStyle: style.doorStyle, finish: style.finish, color: style.color, renderHex: style.renderHex },
        doorSampleUrl: audit.doorSampleUrl,
        drawerSampleUrl: audit.drawerSampleUrl,
        attemptNo,
        feedback,
        previousModelSpec: previousSpec,
      });
    } catch (error) {
      const reason = `Attempt ${attemptNo} could not generate the 3D model: ${message(error)}`;
      await store.updateAttempt(attemptId, { passed: false, reasons: reason, errorMessage: message(error) });
      lastReasons = [reason];
      lastStatus = "generating";
      feedback = reason;
      trigger = "auto_revision";
      continue;
    }
    previousSpec = rendered.modelSpec;
    await store.updateAttempt(attemptId, {
      modelSpec: rendered.modelSpec,
      straightPreviewUrl: rendered.previews.straight,
      threeQuarterPreviewUrl: rendered.previews.threeQuarter,
      runPreviewUrl: rendered.previews.run,
    });
    await move("generating", "checking", {}, null, attemptNo);
    lastStatus = "checking";

    let checked: DoorModelCheckResult;
    try {
      checked = await deps.checker({
        doorSampleUrl: audit.doorSampleUrl,
        drawerSampleUrl: audit.drawerSampleUrl,
        previews: rendered.previews,
      });
    } catch (error) {
      const reason = `Attempt ${attemptNo} could not be checked: ${message(error)}`;
      await store.updateAttempt(attemptId, { passed: false, reasons: reason, errorMessage: message(error) });
      lastReasons = [reason];
      feedback = null;
      trigger = "auto_revision";
      if (used < maxAttempts) {
        await move("checking", "generating", {}, reason, attemptNo);
        lastStatus = "generating";
      }
      continue;
    }

    const evaluation = evaluateChecks(checked.scores, checked.notes, passScore);
    await store.updateAttempt(attemptId, {
      scores: checked.scores,
      notes: checked.notes,
      passed: evaluation.passed,
      reasons: evaluation.reasons.join("\n") || null,
      checkerModel: checked.model,
    });
    const next = nextStatusAfterCheck({ passed: evaluation.passed, attemptsUsed: used, maxAttempts });
    if (next === "awaiting_tom") {
      await move("checking", "awaiting_tom", {
        claimToken: null, currentAttemptId: attemptId, flaggedReasons: null, errorMessage: null,
      }, `Passed on attempt ${attemptNo}`, attemptNo);
      return { outcome: "awaiting_tom", reason: `passed-attempt-${attemptNo}` };
    }
    lastReasons = evaluation.reasons;
    if (next === "flagged") return flag("checking", lastReasons, attemptNo);
    feedback = feedbackFrom(evaluation.reasons);
    trigger = "auto_revision";
    await move("checking", "generating", {}, `Revising after attempt ${attemptNo}`, attemptNo);
    lastStatus = "generating";
  }
  return flag(lastStatus, lastReasons.length ? lastReasons : ["No attempt produced a checkable model."]);
}

/** Admin approval: the only path that makes a model live in the Designer. */
export async function approveDoorModel(
  store: DoorModelAuditStore,
  styleId: number,
  actorUserId: number,
): Promise<{ attemptId: number }> {
  const audit = await store.loadAudit(styleId);
  if (!audit || audit.status !== "awaiting_tom" || !audit.currentAttemptId) {
    throw new DoorModelAuditError("Only a model that passed the check and is awaiting approval can be approved.");
  }
  const attempt = await store.loadAttempt(audit.currentAttemptId);
  if (!attempt || attempt.passed !== true || !attempt.modelSpec) {
    throw new DoorModelAuditError("The checked model for this door could not be found.");
  }
  await store.updateAudit(styleId, {
    status: "approved", stampStatusTime: true, approvedAttemptId: attempt.id, approvedModelSpec: attempt.modelSpec,
    tomFeedback: null, decidedBy: actorUserId, claimToken: null,
  });
  await store.recordEvent({ auditId: audit.id, styleId, fromStatus: "awaiting_tom", toStatus: "approved", attemptNo: attempt.attemptNo, actorUserId });
  return { attemptId: attempt.id };
}

/** Reject with Tom's reason; the job goes back to step 2 (queued -> generating). */
export async function rejectDoorModel(
  store: DoorModelAuditStore,
  styleId: number,
  actorUserId: number,
  reason: string,
): Promise<void> {
  const text = reason.trim();
  if (!text) throw new DoorModelAuditError("A reason is required to reject a model.");
  const audit = await store.loadAudit(styleId);
  if (!audit || audit.status !== "awaiting_tom") {
    throw new DoorModelAuditError("Only a model awaiting approval can be rejected.");
  }
  await store.updateAudit(styleId, {
    status: "rejected", stampStatusTime: true, tomFeedback: text.slice(0, 512), decidedBy: actorUserId,
    approvedAttemptId: null, approvedModelSpec: null,
  });
  await store.recordEvent({ auditId: audit.id, styleId, fromStatus: "awaiting_tom", toStatus: "rejected", actorUserId, note: text.slice(0, 1000) });
  // Fresh attempt budget for the new round; history keeps counting.
  await store.updateAudit(styleId, { status: "queued", stampStatusTime: true, attemptCount: 0, claimToken: null });
  await store.recordEvent({ auditId: audit.id, styleId, fromStatus: "rejected", toStatus: "queued", actorUserId, note: "Back to generation with the rejection reason" });
}

