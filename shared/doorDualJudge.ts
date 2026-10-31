/**
 * Door audit, dual-judge rules (Tom, Oct 31).
 *
 * Every sample door render is judged against the distributor's OWN sample image.
 * Two judges score independently, Claude and Cursor. A door passes only when BOTH
 * judges give at least DOOR_DUAL_JUDGE_PASS_SCORE on EVERY criterion. Rounds of
 * fix / re-render / re-score continue until it passes. The only legitimate stop
 * is a source photo that is missing or too small (status "blocked"), reported
 * with what is needed. KitchenCraft onboarding is gated on every door passing.
 */
export const DOOR_DUAL_JUDGE_PASS_SCORE = 7;
export const DOOR_DUAL_JUDGES = ["claude", "cursor"] as const;
export type DoorJudge = (typeof DOOR_DUAL_JUDGES)[number];

export const DOOR_DUAL_JUDGE_CRITERIA = ["color", "grain", "profileEdge", "proportions", "sheen"] as const;
export type DoorCriterion = (typeof DOOR_DUAL_JUDGE_CRITERIA)[number];
export type DoorJudgeScores = Record<DoorCriterion, number>;

/** A source photo shorter than this on its short edge cannot support a 7/10 judgement. */
export const DOOR_SOURCE_PHOTO_MIN_SHORT_EDGE_PX = 400;

export type DoorSourcePhoto = { path: string | null; width?: number | null; height?: number | null };

export type DoorAuditRound = {
  round: number;
  renderPath: string;
  /** What was changed since the previous round (empty for round 1). */
  change: string;
  /** Each judge scores independently; a missing judge means the round is incomplete. */
  scores: Partial<Record<DoorJudge, DoorJudgeScores>>;
};

export type DoorAuditEntry = {
  doorStyle: string;
  distributor: string;
  sourcePhoto: DoorSourcePhoto;
  rounds: DoorAuditRound[];
};

export type DoorAuditStatus = "pass" | "fail" | "incomplete" | "blocked";
export type DoorAuditResult = { status: DoorAuditStatus; reasons: string[]; failing: string[] };

export function sourcePhotoProblem(photo: DoorSourcePhoto): string | null {
  if (!photo.path) return "source photo is missing; supply the distributor's sample image";
  const w = photo.width ?? 0, h = photo.height ?? 0;
  if (!(w > 0 && h > 0)) return "source photo size is unknown";
  if (Math.min(w, h) < DOOR_SOURCE_PHOTO_MIN_SHORT_EDGE_PX) {
    return `source photo is too small (${w}x${h}); need at least ${DOOR_SOURCE_PHOTO_MIN_SHORT_EDGE_PX}px on the short edge`;
  }
  return null;
}

export function isValidScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10;
}

/** Failing criteria for one judge as "judge:criterion=score". */
export function failingCriteria(judge: DoorJudge, scores: DoorJudgeScores, pass = DOOR_DUAL_JUDGE_PASS_SCORE): string[] {
  return DOOR_DUAL_JUDGE_CRITERIA.filter((c) => !isValidScore(scores[c]) || scores[c] < pass).map((c) => `${judge}:${c}=${scores[c]}`);
}

/** Result for a door, judged on its LATEST round only. */
export function evaluateDoor(entry: DoorAuditEntry, pass = DOOR_DUAL_JUDGE_PASS_SCORE): DoorAuditResult {
  const photo = sourcePhotoProblem(entry.sourcePhoto);
  if (photo) return { status: "blocked", reasons: [photo], failing: [] };
  const last = entry.rounds[entry.rounds.length - 1];
  if (!last) return { status: "incomplete", reasons: ["no render has been scored yet"], failing: [] };
  const missing = DOOR_DUAL_JUDGES.filter((j) => !last.scores[j]);
  if (missing.length) return { status: "incomplete", reasons: [`round ${last.round} not scored by: ${missing.join(", ")}`], failing: [] };
  const failing = DOOR_DUAL_JUDGES.flatMap((j) => failingCriteria(j, last.scores[j]!, pass));
  return failing.length
    ? { status: "fail", reasons: [`round ${last.round}: below ${pass}/10`], failing }
    : { status: "pass", reasons: [], failing: [] };
}

/** KitchenCraft onboarding may start only when every audited door passes. */
export function kitchenCraftGate(entries: readonly DoorAuditEntry[], pass = DOOR_DUAL_JUDGE_PASS_SCORE) {
  const results = entries.map((e) => ({ doorStyle: e.doorStyle, ...evaluateDoor(e, pass) }));
  return { open: entries.length > 0 && results.every((r) => r.status === "pass"), results };
}
