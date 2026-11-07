import { describe, expect, it } from "vitest";
import {
  FREE_USAGE_LIMIT,
  MEMBERSHIP_REQUIRED_CAUSE,
  emptyUsageCounts,
  freeUsageApplies,
  freeUsageExhausted,
  freeUsageNotice,
  freeUsageSnapshot,
  isPaidMembership,
  membershipRequiredMessage,
  normalizeUsageCounts,
  totalUsage,
} from "./affiliateFreeUsage";

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
      remaining: 0,
    });
    expect(freeUsageExhausted(snapshot)).toBe(true);
  });

  it("counts the kinds together, so a mixed run reaches the cap at five", () => {
    const four = freeUsageSnapshot(
      { design: 3, auto_design: 1 },
      { enforced: true }
    );
    expect(four.remaining).toBe(1);
    expect(freeUsageExhausted(four)).toBe(false);
    // The next use of any kind is refused, not just a sixth of one kind.
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
    // Paid affiliate: unlimited.
    expect(
      freeUsageApplies({
        role: "user",
        hasAffiliate: true,
        membershipStatus: "active",
      })
    ).toBe(false);
    // Admin: exempt even with an unpaid store.
    expect(
      freeUsageApplies({
        role: "admin",
        hasAffiliate: true,
        membershipStatus: "pending",
      })
    ).toBe(false);
    // Regular customer / contractor: not an affiliate, so not affected.
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
    expect(snapshot.remaining).toBe(0);
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
