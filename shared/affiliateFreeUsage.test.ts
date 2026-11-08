import { describe, expect, it } from "vitest";
import {
  FREE_USAGE_LIMIT,
  MEMBERSHIP_REQUIRED_CAUSE,
  contactEmailMatches,
  emptyUsageCounts,
  formatContactEmails,
  freeUsageApplies,
  freeUsageExhausted,
  freeUsageNotice,
  freeUsageSnapshot,
  grantLine,
  isPaidMembership,
  membershipRequiredMessage,
  normalizeContactEmails,
  normalizeDesignGrant,
  normalizeUsageCounts,
  totalUsage,
} from "./affiliateFreeUsage";

const GRANT_ROW = {
  id: 9,
  designCount: 5,
  usedSinceGrant: 2,
  contactEmails: "owner@example.test,store@example.test",
  grantedBy: "tom",
  grantedAt: "2026-11-07T12:00:00.000Z",
  renewedAt: null,
  renewedBy: null,
};

describe("affiliate free-use rules", () => {
  it("gives five free uses in total, counted across all three kinds", () => {
    expect(FREE_USAGE_LIMIT).toBe(5);
    const counts = normalizeUsageCounts({
      design: 2,
      auto_design: 2,
      photo_render: 1,
    });
    expect(totalUsage(counts)).toBe(5);
    const snapshot = freeUsageSnapshot(counts, {
      enforced: true,
      membershipStatus: "pending",
    });
    expect(snapshot).toMatchObject({
      enforced: true,
      unlimited: false,
      limit: 5,
      used: 5,
      freeRemaining: 0,
      remaining: 0,
    });
    expect(freeUsageExhausted(snapshot)).toBe(true);
  });

  it("counts the kinds together, so a mixed run reaches the cap at five", () => {
    const four = freeUsageSnapshot(
      { design: 3, auto_design: 1 },
      { enforced: true }
    );
    expect(four.freeRemaining).toBe(1);
    expect(freeUsageExhausted(four)).toBe(false);
    const five = freeUsageSnapshot(
      { design: 1, auto_design: 2, photo_render: 2 },
      { enforced: true }
    );
    expect(freeUsageExhausted(five)).toBe(true);
  });

  it("treats only an active membership as paid", () => {
    expect(isPaidMembership("active")).toBe(true);
    expect(isPaidMembership("ACTIVE")).toBe(true);
    for (const status of [
      "pending",
      "past_due",
      "cancelled",
      "",
      null,
      undefined,
    ]) {
      expect(isPaidMembership(status)).toBe(false);
    }
  });

  it("caps an unpaid affiliate and leaves paid affiliates, admins, and non-affiliates alone", () => {
    expect(
      freeUsageApplies({
        role: "user",
        hasAffiliate: true,
        membershipStatus: "pending",
      })
    ).toBe(true);
    expect(
      freeUsageApplies({
        role: "user",
        hasAffiliate: true,
        membershipStatus: "past_due",
      })
    ).toBe(true);
    expect(
      freeUsageApplies({
        role: "user",
        hasAffiliate: true,
        membershipStatus: "cancelled",
      })
    ).toBe(true);
    expect(
      freeUsageApplies({
        role: "user",
        hasAffiliate: true,
        membershipStatus: "active",
      })
    ).toBe(false);
    expect(
      freeUsageApplies({
        role: "admin",
        hasAffiliate: true,
        membershipStatus: "pending",
      })
    ).toBe(false);
    expect(
      freeUsageApplies({
        role: "user",
        hasAffiliate: false,
        membershipStatus: null,
      })
    ).toBe(false);
    expect(
      freeUsageApplies({
        role: "contractor",
        hasAffiliate: false,
        membershipStatus: null,
      })
    ).toBe(false);
  });

  it("reports unlimited with no limit and no remaining count", () => {
    const snapshot = freeUsageSnapshot(
      { design: 99 },
      { enforced: false, membershipStatus: "active" }
    );
    expect(snapshot).toMatchObject({
      enforced: false,
      unlimited: true,
      limit: null,
      freeRemaining: null,
      remaining: null,
    });
    expect(snapshot.used).toBe(99);
    expect(freeUsageExhausted(snapshot)).toBe(false);
    expect(freeUsageNotice(snapshot)).toBeNull();
  });

  it("never reports a negative remainder when the ledger is already over the limit", () => {
    const snapshot = freeUsageSnapshot(
      { design: 4, auto_design: 3 },
      { enforced: true }
    );
    expect(snapshot.used).toBe(7);
    expect(snapshot.freeRemaining).toBe(0);
  });

  it("ignores unknown kinds and junk values instead of inflating the count", () => {
    expect(normalizeUsageCounts({ design: 2, bogus: 9 } as never)).toEqual({
      design: 2,
      auto_design: 0,
      photo_render: 0,
    });
    expect(
      normalizeUsageCounts({ design: -3, photo_render: Number.NaN })
    ).toEqual(emptyUsageCounts());
    expect(normalizeUsageCounts(null)).toEqual(emptyUsageCounts());
  });

  it("tells the person to buy the membership, in words and with a stable code", () => {
    const message = membershipRequiredMessage("auto_design");
    expect(message).toContain("Auto Design run");
    expect(message).toMatch(/buy the affiliate membership/i);
    expect(MEMBERSHIP_REQUIRED_CAUSE).toBe("MEMBERSHIP_REQUIRED");
  });

  it("shows a plain countdown while uses remain and the buy prompt at zero", () => {
    expect(
      freeUsageNotice(freeUsageSnapshot({ design: 3 }, { enforced: true }))
    ).toContain("2 of 5 free uses left");
    expect(
      freeUsageNotice(freeUsageSnapshot({ design: 4 }, { enforced: true }))
    ).toContain("1 of 5 free use left");
    expect(
      freeUsageNotice(freeUsageSnapshot({ design: 5 }, { enforced: true }))
    ).toMatch(/buy the affiliate membership/i);
  });
});

describe("admin design grant", () => {
  it("stores the count explicitly and reports what is left of it", () => {
    const grant = normalizeDesignGrant(GRANT_ROW, "owner@example.test");
    expect(grant).toMatchObject({
      designCount: 5,
      used: 2,
      remaining: 3,
      appliesToYou: true,
    });
    expect(grantLine(grant)).toBe("Extra designs: 5 (3 left)");
  });

  it("adds the grant on top of the free five for someone the grant covers", () => {
    const snapshot = freeUsageSnapshot(
      { design: 5 },
      {
        enforced: true,
        grant: normalizeDesignGrant(GRANT_ROW, "owner@example.test"),
      }
    );
    expect(snapshot).toMatchObject({
      used: 5,
      freeRemaining: 0,
      grantRemaining: 3,
      remaining: 3,
    });
    expect(freeUsageExhausted(snapshot)).toBe(false);
    expect(freeUsageNotice(snapshot)).toContain("Extra designs: 5 (3 left)");
  });

  it("counts free and bonus together, so six uses are available with a 5 grant", () => {
    const fresh = normalizeDesignGrant(
      { ...GRANT_ROW, usedSinceGrant: 0 },
      "owner@example.test"
    );
    const snapshot = freeUsageSnapshot({}, { enforced: true, grant: fresh });
    expect(snapshot.remaining).toBe(10);
    const halfway = freeUsageSnapshot(
      { design: 5 },
      { enforced: true, grant: fresh }
    );
    expect(halfway).toMatchObject({
      freeRemaining: 0,
      grantRemaining: 5,
      remaining: 5,
    });
    const spentBonus = freeUsageSnapshot(
      { design: 5 },
      {
        enforced: true,
        grant: normalizeDesignGrant(GRANT_ROW, "owner@example.test"),
      }
    );
    expect(spentBonus).toMatchObject({ grantRemaining: 3, remaining: 3 });
  });

  it("does not give a grant to someone whose email is not on it", () => {
    const snapshot = freeUsageSnapshot(
      { design: 5 },
      {
        enforced: true,
        grant: normalizeDesignGrant(GRANT_ROW, "someone-else@example.test"),
      }
    );
    expect(snapshot.grant?.appliesToYou).toBe(false);
    expect(snapshot.grantRemaining).toBe(0);
    expect(snapshot.remaining).toBe(0);
    expect(freeUsageExhausted(snapshot)).toBe(true);
    // The grant is still visible for the admin view, just not spendable here.
    expect(snapshot.grant?.designCount).toBe(5);
    // And the notice must not promise uses this person does not have.
    expect(freeUsageNotice(snapshot)).toMatch(/buy the affiliate membership/i);
    expect(freeUsageNotice(snapshot)).not.toContain("Extra designs");
  });

  it("never exceeds the stored count even if the spent counter is higher", () => {
    const grant = normalizeDesignGrant(
      { ...GRANT_ROW, usedSinceGrant: 9 },
      "owner@example.test"
    );
    expect(grant?.remaining).toBe(0);
    expect(grantLine(grant)).toBe("Extra designs: 5 (0 left)");
  });

  it("reports null when the store has no grant", () => {
    expect(normalizeDesignGrant(null, "owner@example.test")).toBeNull();
    expect(grantLine(null)).toBeNull();
    const snapshot = freeUsageSnapshot({}, { enforced: true, grant: null });
    expect(snapshot.grant).toBeNull();
    expect(snapshot.grantRemaining).toBe(0);
    expect(snapshot.remaining).toBe(5);
  });

  it("matches contact emails case-insensitively, trimmed, from a comma list", () => {
    expect(
      contactEmailMatches(" A@Example.test , b@example.test ", "a@example.test")
    ).toBe(true);
    expect(contactEmailMatches("a@example.test", "  A@EXAMPLE.TEST  ")).toBe(
      true
    );
    expect(contactEmailMatches("a@example.test", "c@example.test")).toBe(false);
    expect(contactEmailMatches("", "a@example.test")).toBe(false);
    expect(contactEmailMatches("a@example.test", null)).toBe(false);
  });

  it("normalizes and formats the contact list for storage", () => {
    expect(
      normalizeContactEmails(["A@x.test", " a@X.test ", "", "b@x.test"])
    ).toEqual(["a@x.test", "b@x.test"]);
    expect(normalizeContactEmails("a@x.test, b@x.test")).toEqual([
      "a@x.test",
      "b@x.test",
    ]);
    expect(formatContactEmails(["A@x.test", "b@x.test"])).toBe(
      "a@x.test,b@x.test"
    );
    expect(formatContactEmails(null)).toBe("");
  });

  it("keeps the grant out of the count for a paid affiliate", () => {
    const snapshot = freeUsageSnapshot(null, {
      enforced: false,
      membershipStatus: "active",
      grant: normalizeDesignGrant(GRANT_ROW, "owner@example.test"),
    });
    expect(snapshot.unlimited).toBe(true);
    expect(snapshot.remaining).toBeNull();
    expect(freeUsageExhausted(snapshot)).toBe(false);
  });
});
