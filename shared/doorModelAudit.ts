/**
 * Automatic 3D door audit: pure status model and pass/fail rules.
 *
 * A job exists per door style. It moves
 *   queued -> generating -> checking -> (pass) awaiting_tom -> approved
 *                                    -> (fail, attempts left) generating
 *                                    -> (fail, no attempts left) flagged
 *   awaiting_tom -> rejected (Tom's reason) -> queued (back to generating)
 * Only `approved` is live in the Designer. Nothing else ever is.
 */

export const DOOR_MODEL_AUDIT_STATUSES = [
  "queued",
  "generating",
  "checking",
  "flagged",
  "awaiting_tom",
  "approved",
  "rejected",
] as const;
export type DoorModelAuditStatus = (typeof DOOR_MODEL_AUDIT_STATUSES)[number];

export const DOOR_MODEL_AUDIT_CHECKS = ["color", "grain", "profile", "proportions", "drawerFront"] as const;
export type DoorModelAuditCheck = (typeof DOOR_MODEL_AUDIT_CHECKS)[number];

export const DOOR_MODEL_AUDIT_CHECK_LABELS: Record<DoorModelAuditCheck, string> = {
  color: "Color",
  grain: "Grain / texture",
  profile: "Profile (shaker / slab / slim)",
  proportions: "Proportions",
  drawerFront: "Drawer front",
};

export const DOOR_MODEL_AUDIT_DEFAULT_MAX_ATTEMPTS = 3;
export const DOOR_MODEL_AUDIT_MAX_ATTEMPTS_CEILING = 10;
/** Scores are 1-10. Every check must reach this score to pass. */
export const DOOR_MODEL_AUDIT_DEFAULT_PASS_SCORE = 7;

/** Bump to re-audit every style after the generator or checker changes. */
export const DOOR_MODEL_AUDIT_VERSION = "door-model-audit-v1";

export const DOOR_MODEL_PREVIEW_KINDS = ["straight", "threeQuarter", "run"] as const;
export type DoorModelPreviewKind = (typeof DOOR_MODEL_PREVIEW_KINDS)[number];

export type DoorModelCheckScores = Record<DoorModelAuditCheck, number>;
export type DoorModelCheckNotes = Record<DoorModelAuditCheck, string>;

export function normalizeMaxAttempts(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DOOR_MODEL_AUDIT_DEFAULT_MAX_ATTEMPTS;
  return Math.min(Math.floor(n), DOOR_MODEL_AUDIT_MAX_ATTEMPTS_CEILING);
}

export function normalizePassScore(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 10) return DOOR_MODEL_AUDIT_DEFAULT_PASS_SCORE;
  return Math.floor(n);
}

export type CheckEvaluation = {
  passed: boolean;
  failedChecks: DoorModelAuditCheck[];
  reasons: string[];
};

/** A model passes only when every check meets the pass score. */
export function evaluateChecks(
  scores: DoorModelCheckScores,
  notes: Partial<DoorModelCheckNotes>,
  passScore: number = DOOR_MODEL_AUDIT_DEFAULT_PASS_SCORE,
): CheckEvaluation {
  const failedChecks = DOOR_MODEL_AUDIT_CHECKS.filter((check) => {
    const score = scores[check];
    return !Number.isFinite(score) || score < passScore;
  });
  const reasons = failedChecks.map((check) => {
    const note = notes[check]?.trim();
    const label = DOOR_MODEL_AUDIT_CHECK_LABELS[check];
    return `${label} ${Number.isFinite(scores[check]) ? scores[check] : "?"}/10${note ? `: ${note}` : ""}`;
  });
  return { passed: failedChecks.length === 0, failedChecks, reasons };
}

export type AfterCheck = "awaiting_tom" | "generating" | "flagged";

/** `attemptsUsed` counts the attempt that was just checked. */
export function nextStatusAfterCheck(input: {
  passed: boolean;
  attemptsUsed: number;
  maxAttempts: number;
}): AfterCheck {
  if (input.passed) return "awaiting_tom";
  return input.attemptsUsed < input.maxAttempts ? "generating" : "flagged";
}

const TRANSITIONS: Record<DoorModelAuditStatus, readonly DoorModelAuditStatus[]> = {
  queued: ["generating"],
  generating: ["checking", "flagged"],
  checking: ["awaiting_tom", "generating", "flagged"],
  flagged: ["queued"],
  awaiting_tom: ["approved", "rejected", "queued"],
  approved: ["queued"],
  rejected: ["queued", "generating"],
};

export function canTransition(from: DoorModelAuditStatus, to: DoorModelAuditStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Only an admin approval makes a model live. Every other status is hidden from the Designer. */
export function isLiveInDesigner(status: DoorModelAuditStatus): boolean {
  return status === "approved";
}

/** Only models that passed the check reach Tom's approval queue. */
export function isInApprovalQueue(status: DoorModelAuditStatus): boolean {
  return status === "awaiting_tom";
}

export function isNeedsAttention(status: DoorModelAuditStatus): boolean {
  return status === "flagged";
}

export type DoorModelAuditSource = {
  doorSampleImageUrl: string | null;
  drawerSampleImageUrl: string | null;
  doorStyle: string | null;
  finish: string | null;
  color: string | null;
  renderHex: string | null;
};

/**
 * Identifies the inputs a model was built from. A new or changed door or drawer
 * sample photo, or a new model/render version, changes the fingerprint.
 */
export function doorModelSourceFingerprint(source: DoorModelAuditSource): string {
  const part = (value: string | null) => (value ?? "none").trim().replace(/\|/g, "/");
  return [
    DOOR_MODEL_AUDIT_VERSION,
    part(source.doorSampleImageUrl),
    part(source.drawerSampleImageUrl),
    part(source.doorStyle),
    part(source.finish),
    part(source.color),
    part(source.renderHex).toLowerCase(),
  ].join("|");
}

export type EnqueueDecision =
  | { action: "enqueue"; reason: "first-time" | "source-changed" | "forced" }
  | { action: "skip"; reason: "no-door-photo" | "unchanged" | "in-progress" };

export function enqueueDecision(input: {
  source: DoorModelAuditSource;
  existing: { status: DoorModelAuditStatus; sourceFingerprint: string } | null;
  force?: boolean;
}): EnqueueDecision {
  if (!input.source.doorSampleImageUrl?.trim()) return { action: "skip", reason: "no-door-photo" };
  const fingerprint = doorModelSourceFingerprint(input.source);
  if (!input.existing) return { action: "enqueue", reason: "first-time" };
  if (input.existing.sourceFingerprint !== fingerprint) return { action: "enqueue", reason: "source-changed" };
  if (input.force) return { action: "enqueue", reason: "forced" };
  if (["queued", "generating", "checking"].includes(input.existing.status)) {
    return { action: "skip", reason: "in-progress" };
  }
  return { action: "skip", reason: "unchanged" };
}

export class DoorModelAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DoorModelAuditError";
  }
}

export const DOOR_MODEL_RENDERER_NOT_CONFIGURED = "DOOR_MODEL_RENDERER_URL is not configured";
