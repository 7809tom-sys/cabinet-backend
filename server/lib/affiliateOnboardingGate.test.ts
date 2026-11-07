import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING_GATE_CHECKS,
  evaluateMembership,
  evaluateOnboardingGate,
  onboardingBlockerMessage,
  type OnboardingGateChecks,
  type OnboardingGateInput,
} from "./affiliateOnboardingGate";

const NOW = new Date("2026-11-07T12:00:00Z");

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
  requiredDocuments: async () => ({ ok: true }),
};

describe("evaluateMembership", () => {
  it("passes an active membership inside its term", () => {
    expect(evaluateMembership(baseInput(), NOW)).toEqual({ ok: true });
  });

  it("blocks a membership that is not active, whatever the date", () => {
    for (const status of ["pending", "past_due", "cancelled"]) {
      expect(evaluateMembership(baseInput({ membershipStatus: status }), NOW)).toEqual({
        ok: false,
        blockers: ["membership_inactive"],
      });
    }
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
});

describe("evaluateOnboardingGate", () => {
  it("blocks everything while the legal-document and document checks are stubs", async () => {
    const result = await evaluateOnboardingGate(baseInput(), DEFAULT_ONBOARDING_GATE_CHECKS, NOW);
    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(["legal_docs_unsigned", "documents_missing"]);
    expect(result.checks).toEqual({
      membership: true,
      legalDocuments: false,
      requiredDocuments: false,
    });
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
      "membership_inactive",
      "legal_docs_unsigned",
      "documents_missing",
    ]);
    expect(result.messages).toHaveLength(4);
  });

  it("passes once the membership is active and both stubs are replaced", async () => {
    const result = await evaluateOnboardingGate(baseInput(), documentsReadyChecks, NOW);
    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("does not let a paused store pass on documents alone", async () => {
    // Paused is still a served storefront (bySlug only refuses inactive), so the
    // gate must not invent a blocker the public route does not have.
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
