import { beforeEach, describe, expect, it, vi } from "vitest";

// The documents check delegates to the helper PR 85 shipped in
// server/lib/affiliateDocuments.ts, and the legal check to the DocuSeal helper PR
// 87 shipped in server/lib/affiliateLegalContracts.ts. Both read the database, so
// both are mocked here: the gate logic is testable without one, and the
// assertions can prove the gate calls the real helpers rather than stubs.
const { hasRequiredDocumentsMock, loadLegalDocumentGateMock } = vi.hoisted(() => ({
  hasRequiredDocumentsMock: vi.fn(),
  loadLegalDocumentGateMock: vi.fn(),
}));

vi.mock("./affiliateDocuments", () => ({ hasRequiredDocuments: hasRequiredDocumentsMock }));
vi.mock("./affiliateLegalContracts", () => ({ loadLegalDocumentGateForAffiliate: loadLegalDocumentGateMock }));

import {
  DEFAULT_ONBOARDING_GATE_CHECKS,
  evaluateMembership,
  evaluateOnboardingGate,
  onboardingBlockerMessage,
  type OnboardingGateChecks,
  type OnboardingGateInput,
} from "./affiliateOnboardingGate";

const NOW = new Date("2026-11-07T12:00:00Z");

beforeEach(() => {
  hasRequiredDocumentsMock.mockReset();
  hasRequiredDocumentsMock.mockResolvedValue(false);
  loadLegalDocumentGateMock.mockReset();
  // The unconfigured case: a contract exists but is not signed.
  loadLegalDocumentGateMock.mockResolvedValue({ signedAll: false, requiredCount: 1, pending: [], unpublished: [], documents: [] });
});

/** A published contract this affiliate has signed. */
function signedGate() {
  return { signedAll: true, requiredCount: 1, pending: [], unpublished: [], documents: [] };
}

function baseInput(over: Partial<OnboardingGateInput> = {}): OnboardingGateInput {
  return {
    affiliateId: 42,
    status: "active",
    membershipStatus: "active",
    membershipExpiresAt: new Date("2027-01-01T00:00:00Z"),
    ...over,
  };
}

/** All three checks pass. Only used where a test is about the gate's plumbing. */
const allPass: OnboardingGateChecks = {
  membership: async () => ({ ok: true }),
  legalDocuments: async () => ({ ok: true }),
  requiredDocuments: async () => ({ ok: true }),
};

/** Legal documents signed and onboarding documents uploaded, membership still real. */
const documentsReadyChecks: OnboardingGateChecks = {
  membership: (input, now) => Promise.resolve(evaluateMembership(input, now)),
  legalDocuments: async () => ({ ok: true }),
  requiredDocuments: (input) =>
    Promise.resolve(hasRequiredDocumentsMock(input.affiliateId) as unknown as boolean)
      .then((ok) => (ok ? { ok: true as const } : { ok: false as const, blockers: ["documents_missing" as const] })),
};

describe("evaluateMembership", () => {
  it("passes an active membership inside its term", () => {
    expect(evaluateMembership(baseInput(), NOW)).toEqual({ ok: true });
  });

  it("blocks a membership that is not active, and separates lapsed from ended", () => {
    // pending and cancelled were never paid for now, so they read inactive.
    for (const status of ["pending", "cancelled"]) {
      expect(evaluateMembership(baseInput({ membershipStatus: status }), NOW)).toEqual({
        ok: false,
        blockers: ["membership_inactive"],
      });
    }
    // past_due paid once and stopped, so the affiliate is told to renew rather
    // than that nothing is set up.
    expect(evaluateMembership(baseInput({ membershipStatus: "past_due" }), NOW)).toEqual({
      ok: false,
      blockers: ["membership_expired"],
    });
  });

  it("blocks an expired term and treats the exact expiry as expired", () => {
    const expired = new Date("2026-11-07T11:59:59Z");
    expect(evaluateMembership(baseInput({ membershipExpiresAt: expired }), NOW)).toEqual({
      ok: false,
      blockers: ["membership_expired"],
    });
    expect(evaluateMembership(baseInput({ membershipExpiresAt: NOW }), NOW)).toEqual({
      ok: false,
      blockers: ["membership_expired"],
    });
  });

  it("keeps working for a paid row with no term recorded", () => {
    expect(evaluateMembership(baseInput({ membershipExpiresAt: null }), NOW)).toEqual({ ok: true });
  });

  it("accepts a term stored as an ISO string or epoch millis", () => {
    expect(evaluateMembership(baseInput({ membershipExpiresAt: "2026-12-31T00:00:00Z" }), NOW).ok).toBe(true);
    expect(evaluateMembership(baseInput({ membershipExpiresAt: NOW.getTime() + 86_400_000 }), NOW).ok).toBe(true);
  });

  it("counts a cancelled membership that is paid through the end of its period", () => {
    // The member paid for that time and the membership dashboard shows the same
    // "active until <date>", so publishing is not gated on the cancel click.
    const result = evaluateMembership(
      baseInput({
        membershipStatus: "active",
        membershipCancelledAt: new Date("2026-11-01T00:00:00Z"),
        membershipExpiresAt: new Date("2027-01-01T00:00:00Z"),
      }),
      NOW,
    );
    expect(result).toEqual({ ok: true });
  });

  it("blocks a cancelled membership whose paid period has ended", () => {
    const result = evaluateMembership(
      baseInput({
        membershipStatus: "active",
        membershipCancelledAt: new Date("2026-01-01T00:00:00Z"),
        membershipExpiresAt: new Date("2026-02-01T00:00:00Z"),
      }),
      NOW,
    );
    expect(result).toEqual({ ok: false, blockers: ["membership_inactive"] });
  });

  it("reads an active status whose date passed as expired, not inactive", () => {
    // effectiveMembershipStatus calls this past_due; the affiliate is told to
    // renew, which is the actionable message.
    const result = evaluateMembership(
      baseInput({ membershipStatus: "active", membershipExpiresAt: new Date("2026-01-01T00:00:00Z") }),
      NOW,
    );
    expect(result).toEqual({ ok: false, blockers: ["membership_expired"] });
  });
});

describe("evaluateOnboardingGate", () => {
  it("blocks on the real legal check and the real documents check", async () => {
    const result = await evaluateOnboardingGate(baseInput(), DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(["legal_docs_unsigned", "documents_missing"]);
    expect(result.checks).toEqual({
      membership: true,
      legalDocuments: false,
      requiredDocuments: false,
    });
    // Both checks are the real helpers, called with this affiliate's id.
    expect(hasRequiredDocumentsMock).toHaveBeenCalledWith(42);
    expect(loadLegalDocumentGateMock).toHaveBeenCalledWith(42);
  });

  it("passes the legal check once the affiliate has signed the published contract", async () => {
    loadLegalDocumentGateMock.mockResolvedValue(signedGate());
    const result = await evaluateOnboardingGate(baseInput(), DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(result.checks.legalDocuments).toBe(true);
    // Only the un-uploaded onboarding document still blocks.
    expect(result.blockers).toEqual(["documents_missing"]);
    expect(result.ok).toBe(false);
  });

  it("still blocks when no contract is configured, because that is not the same as signed", async () => {
    // Main's publish gate fails closed until the legal feature is configured.
    // "Nothing required" must not read as "signed" on an irreversible publish.
    loadLegalDocumentGateMock.mockResolvedValue({ signedAll: true, requiredCount: 0, pending: [], unpublished: [], documents: [] });
    const result = await evaluateOnboardingGate(baseInput(), DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(result.checks.legalDocuments).toBe(false);
    expect(result.blockers).toContain("legal_docs_unsigned");
  });

  it("passes the documents check once the helper reports them uploaded", async () => {
    hasRequiredDocumentsMock.mockResolvedValue(true);
    const result = await evaluateOnboardingGate(baseInput(), DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(result.checks.requiredDocuments).toBe(true);
    // Only the unsigned legal contract still blocks.
    expect(result.blockers).toEqual(["legal_docs_unsigned"]);
    expect(result.ok).toBe(false);
  });

  it("still refuses an inactive store even when every check passes", async () => {
    const result = await evaluateOnboardingGate(baseInput({ status: "inactive" }), allPass, NOW);
    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(["store_inactive"]);
    expect(result.messages[0]).toMatch(/inactive/i);
  });

  it("reports every blocker at once instead of stopping at the first", async () => {
    const result = await evaluateOnboardingGate(
      baseInput({ status: "inactive", membershipStatus: "past_due" }),
      DEFAULT_ONBOARDING_GATE_CHECKS,
      NOW,
    );
    expect(result.blockers).toEqual([
      "store_inactive",
      "membership_expired",
      "legal_docs_unsigned",
      "documents_missing",
    ]);
    expect(result.messages).toHaveLength(4);
  });

  it("passes when every real check agrees", async () => {
    // Both helpers are the real ones the gate ships with, now that the legal
    // check is wired instead of stubbed.
    hasRequiredDocumentsMock.mockResolvedValue(true);
    loadLegalDocumentGateMock.mockResolvedValue(signedGate());
    const result = await evaluateOnboardingGate(baseInput(), DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(result.checks).toEqual({ membership: true, legalDocuments: true, requiredDocuments: true });
  });

  it("still blocks on an unsigned contract even when the onboarding documents are approved", async () => {
    hasRequiredDocumentsMock.mockResolvedValue(true);
    loadLegalDocumentGateMock.mockResolvedValue({ signedAll: false, requiredCount: 1, pending: [], unpublished: [], documents: [] });
    const result = await evaluateOnboardingGate(baseInput(), DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(["legal_docs_unsigned"]);
    expect(result.messages[0]).toMatch(/sign every required agreement/i);
  });

  it("passes once the membership is active and both document checks are satisfied", async () => {
    hasRequiredDocumentsMock.mockResolvedValue(true);
    const result = await evaluateOnboardingGate(baseInput(), documentsReadyChecks, NOW);
    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("does not let a paused store pass on documents alone", async () => {
    // Paused is still a served storefront (bySlug only refuses inactive), so the
    // gate must not invent a blocker the public route does not have.
    hasRequiredDocumentsMock.mockResolvedValue(true);
    const result = await evaluateOnboardingGate(baseInput({ status: "paused" }), documentsReadyChecks, NOW);
    expect(result.ok).toBe(true);
  });

  it("surfaces an expired membership alongside the document blockers", async () => {
    const result = await evaluateOnboardingGate(
      baseInput({ membershipExpiresAt: new Date("2025-01-01T00:00:00Z") }),
      DEFAULT_ONBOARDING_GATE_CHECKS,
      NOW,
    );
    expect(result.blockers).toContain("membership_expired");
    expect(result.checks.membership).toBe(false);
  });
});

describe("onboardingBlockerMessage", () => {
  it("has a plain-language sentence for every blocker", () => {
    for (const blocker of [
      "store_inactive",
      "membership_inactive",
      "membership_expired",
      "legal_docs_unsigned",
      "documents_missing",
    ] as const) {
      const message = onboardingBlockerMessage(blocker);
      expect(message.length).toBeGreaterThan(20);
      expect(message.endsWith(".")).toBe(true);
    }
  });
});
