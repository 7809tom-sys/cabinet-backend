/**
 * The gate that decides whether an affiliate's storefront may go live on the
 * last onboarding step (claiming the website name that becomes /store/<slug>).
 *
 * Three things must all be true:
 *   1. the paid membership is active and not expired;
 *   2. every required legal document is signed;
 *   3. every required onboarding document is uploaded.
 *
 * (1) is implemented here and reads the existing membership columns. (2) and (3)
 * belong to sibling PRs — `hasSignedAllRequired` and `hasRequiredDocuments` —
 * which are not merged yet, so they are stubs that return BLOCKED. That default
 * is deliberate: until those checks are wired, no storefront can go live on an
 * unsigned agreement or a missing document. A stub that returned true would
 * publish stores that skipped the legal steps.
 *
 * The checks sit behind `OnboardingGateChecks` so a test can substitute all-true
 * checks, and so the sibling PRs only have to fill in one function each.
 */

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
};

export type OnboardingCheckOutcome =
  | { ok: true }
  | { ok: false; blockers: OnboardingGateBlocker[] };

export type OnboardingGateChecks = {
  /** Implemented now: paid membership is active for the current term. */
  membership: (input: OnboardingGateInput, now: Date) => Promise<OnboardingCheckOutcome>;
  /** Sibling PR: every required legal document has been signed. */
  legalDocuments: (input: OnboardingGateInput) => Promise<OnboardingCheckOutcome>;
  /** Sibling PR: every required onboarding document has been uploaded. */
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
 * Active membership means the paid status AND a term that has not run out. A
 * null expiry keeps working (older rows paid before the term columns existed);
 * an expiry on the exact boundary is treated as expired.
 */
export function evaluateMembership(
  input: Pick<OnboardingGateInput, "membershipStatus" | "membershipExpiresAt">,
  now: Date = new Date(),
): OnboardingCheckOutcome {
  if (input.membershipStatus !== "active") {
    return { ok: false, blockers: ["membership_inactive"] };
  }
  const expiresAt = expiryMillis(input.membershipExpiresAt);
  if (expiresAt != null && expiresAt <= now.getTime()) {
    return { ok: false, blockers: ["membership_expired"] };
  }
  return { ok: true };
}

/**
 * TODO(final-onboarding PRs): replace with
 *   import { hasSignedAllRequired } from "../lib/affiliateLegalDocuments";
 *   return (await hasSignedAllRequired(input.affiliateId))
 *     ? { ok: true }
 *     : { ok: false, blockers: ["legal_docs_unsigned"] };
 * until the legal-documents sibling PR lands. Blocking is intentional.
 */
async function hasSignedAllRequiredStub(_input: OnboardingGateInput): Promise<OnboardingCheckOutcome> {
  // TODO(legal-docs sibling PR): wire hasSignedAllRequired here.
  return { ok: false, blockers: ["legal_docs_unsigned"] };
}

/**
 * TODO(final-onboarding PRs): replace with
 *   import { hasRequiredDocuments } from "../lib/affiliateOnboardingDocuments";
 *   return (await hasRequiredDocuments(input.affiliateId))
 *     ? { ok: true }
 *     : { ok: false, blockers: ["documents_missing"] };
 * until the onboarding-documents sibling PR lands. Blocking is intentional.
 */
async function hasRequiredDocumentsStub(_input: OnboardingGateInput): Promise<OnboardingCheckOutcome> {
  // TODO(onboarding-documents sibling PR): wire hasRequiredDocuments here.
  return { ok: false, blockers: ["documents_missing"] };
}

/** Default checks: the real membership rule plus the two blocking stubs. */
export const DEFAULT_ONBOARDING_GATE_CHECKS: OnboardingGateChecks = {
  membership: (input, now) => Promise.resolve(evaluateMembership(input, now)),
  legalDocuments: hasSignedAllRequiredStub,
  requiredDocuments: hasRequiredDocumentsStub,
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
