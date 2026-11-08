/**
 * The gate that decides whether an affiliate's storefront may go live on the
 * last onboarding step (claiming the website name that becomes /store/<slug>).
 *
 * Three things must all be true:
 *   1. the paid membership is active and not expired;
 *   2. every required legal document is signed;
 *   3. every required onboarding document is uploaded and approved.
 *
 * (1) is implemented here from the existing membership columns. (3) calls
 * `hasRequiredDocuments` from server/lib/affiliateDocuments.ts, which landed in
 * PR 85. (2) belongs to the legal-contracts sibling PR 87, which is still open, so
 * it is a stub that returns BLOCKED. That default is deliberate: until it is
 * wired, no storefront can go live on an unsigned agreement. A stub that
 * returned true would publish stores that skipped the contract.
 *
 * The checks sit behind `OnboardingGateChecks` so a test can substitute all-true
 * checks, and so PR 87 only has to fill in one function.
 */

import { hasRequiredDocuments } from "./affiliateDocuments";
import { effectiveMembershipStatus } from "./affiliateMembership";

export type OnboardingGateBlocker =
  | "store_inactive"
  | "membership_inactive"
  | "membership_expired"
  | "legal_docs_unsigned"
  | "documents_missing";

export type OnboardingGateInput = {
  affiliateId: number;
  /** affiliates.status: active | paused | inactive */
  status: string;
  /** affiliates.membershipStatus: pending | active | past_due | cancelled */
  membershipStatus: string;
  /** affiliates.membershipExpiresAt. Null means no term recorded yet. */
  membershipExpiresAt: Date | string | number | null;
  /**
   * affiliates.membershipCancelledAt. A cancelled member keeps access until the
   * paid period ends, so this changes the reading of an active status. Optional
   * because a row read before the membership-plan columns existed has none.
   */
  membershipCancelledAt?: Date | string | number | null;
};

export type OnboardingCheckOutcome =
  | { ok: true }
  | { ok: false; blockers: OnboardingGateBlocker[] };

export type OnboardingGateChecks = {
  /** Implemented: paid membership is active for the current term. */
  membership: (input: OnboardingGateInput, now: Date) => Promise<OnboardingCheckOutcome>;
  /** PR 87 (open): every required legal document has been signed. */
  legalDocuments: (input: OnboardingGateInput) => Promise<OnboardingCheckOutcome>;
  /** Implemented: every required onboarding document is uploaded and approved. */
  requiredDocuments: (input: OnboardingGateInput) => Promise<OnboardingCheckOutcome>;
};

export type OnboardingGateResult = {
  /** True only when no check reported a blocker. */
  ok: boolean;
  blockers: OnboardingGateBlocker[];
  /** Per-check pass/fail, so the final onboarding step can list what is left. */
  checks: {
    membership: boolean;
    legalDocuments: boolean;
    requiredDocuments: boolean;
  };
  /** One short sentence per blocker, in blocker order, safe to show a partner. */
  messages: string[];
};

export function onboardingBlockerMessage(blocker: OnboardingGateBlocker): string {
  switch (blocker) {
    case "store_inactive":
      return "This store is inactive. Contact Cabinet Dealz to reactivate it before publishing your website.";
    case "membership_inactive":
      return "Your affiliate membership is not active. Pay the annual membership to publish your website.";
    case "membership_expired":
      return "Your affiliate membership has expired. Renew it to publish your website.";
    case "legal_docs_unsigned":
      return "Sign every required agreement before publishing your website.";
    case "documents_missing":
      return "Upload every required onboarding document before publishing your website.";
  }
}

function expiryMillis(value: OnboardingGateInput["membershipExpiresAt"]): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Active membership means the paid status AND a term that has not run out.
 *
 * The status is read through effectiveMembershipStatus(), main's rule for how a
 * member should read, so this gate cannot disagree with the membership dashboard.
 * Its one judgement is that a cancelled membership paid through the end of its
 * period still counts as active here: the member has paid for that time, and the
 * dashboard shows the same "active until <date>". A null expiry keeps working
 * (older rows paid before the term columns existed); an expiry on the exact
 * boundary is treated as expired.
 */
export function evaluateMembership(
  input: Pick<OnboardingGateInput, "membershipStatus" | "membershipExpiresAt" | "membershipCancelledAt">,
  now: Date = new Date(),
): OnboardingCheckOutcome {
  const expiresAt = expiryMillis(input.membershipExpiresAt);
  const cancelledAt = expiryMillis(input.membershipCancelledAt ?? null);
  const status = effectiveMembershipStatus(
    {
      status: input.membershipStatus as "pending" | "active" | "past_due" | "cancelled",
      expiresAt: expiresAt == null ? null : new Date(expiresAt),
      cancelledAt: cancelledAt == null ? null : new Date(cancelledAt),
    },
    now.getTime(),
  );
  if (status === "active") return { ok: true };
  if (status === "past_due") return { ok: false, blockers: ["membership_expired"] };
  return { ok: false, blockers: ["membership_inactive"] };
}

/**
 * TODO(PR 87, cursor/affiliate-legal-esign-36e8): replace with
 *   import { hasSignedAllRequired } from "./affiliateLegalContracts";
 *   return (await hasSignedAllRequired(input.affiliateId))
 *     ? { ok: true }
 *     : { ok: false, blockers: ["legal_docs_unsigned"] };
 * hasSignedAllRequired(affiliateId: number): Promise<boolean> is the exact
 * signature on that branch. Until it lands, this blocks: publishing on an
 * unsigned contract is not recoverable, and the PR that adds the check has to be
 * the one that un-publishes live stores otherwise.
 */
async function hasSignedAllRequiredStub(_input: OnboardingGateInput): Promise<OnboardingCheckOutcome> {
  // TODO(PR 87): wire hasSignedAllRequired here.
  return { ok: false, blockers: ["legal_docs_unsigned"] };
}

/**
 * Every required onboarding document (license, SSN card, business card) is
 * uploaded and approved. Delegated to the helper PR 85 shipped, so the rule lives
 * in one place and cannot drift from the documents dashboard.
 */
async function requiredDocumentsCheck(input: OnboardingGateInput): Promise<OnboardingCheckOutcome> {
  const ok = await hasRequiredDocuments(input.affiliateId);
  return ok ? { ok: true } : { ok: false, blockers: ["documents_missing"] };
}

/** Default checks: membership, the blocking legal stub, and the real documents check. */
export const DEFAULT_ONBOARDING_GATE_CHECKS: OnboardingGateChecks = {
  membership: (input, now) => Promise.resolve(evaluateMembership(input, now)),
  legalDocuments: hasSignedAllRequiredStub,
  requiredDocuments: requiredDocumentsCheck,
};

/** Blocker order in every response, so the onboarding checklist is stable. */
const CHECK_ORDER = [
  "store_inactive",
  "membership_inactive",
  "membership_expired",
  "legal_docs_unsigned",
  "documents_missing",
] as const;

/**
 * Run every check (no short-circuit, so the partner sees the whole list) and
 * report whether the storefront may go live. `store_inactive` is checked here
 * rather than inside a pluggable check: bySlug() refuses an inactive store, so
 * publishing one would silently 404 the name it just claimed.
 */
export async function evaluateOnboardingGate(
  input: OnboardingGateInput,
  checks: OnboardingGateChecks = DEFAULT_ONBOARDING_GATE_CHECKS,
  now: Date = new Date(),
): Promise<OnboardingGateResult> {
  const blockers = new Set<OnboardingGateBlocker>();

  const storeActive = input.status !== "inactive";
  if (!storeActive) blockers.add("store_inactive");

  const [membership, legalDocuments, requiredDocuments] = await Promise.all([
    checks.membership(input, now),
    checks.legalDocuments(input),
    checks.requiredDocuments(input),
  ]);
  for (const outcome of [membership, legalDocuments, requiredDocuments]) {
    if (!outcome.ok) outcome.blockers.forEach((blocker) => blockers.add(blocker));
  }

  const ordered = CHECK_ORDER.filter((blocker) => blockers.has(blocker));
  return {
    ok: ordered.length === 0,
    blockers: ordered,
    checks: {
      membership: membership.ok,
      legalDocuments: legalDocuments.ok,
      requiredDocuments: requiredDocuments.ok,
    },
    messages: ordered.map(onboardingBlockerMessage),
  };
}
