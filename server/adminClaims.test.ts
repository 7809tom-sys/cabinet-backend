/**
 * Claim status transitions (Tom, Nov 19 2026, PR 4 part 2).
 *
 * The point of enforcing the map on the server is that a claim cannot skip from
 * submitted straight to replacement_credit, and a resolved claim cannot be quietly
 * reopened by a stale admin tab.
 */
import { describe, expect, it } from "vitest";
import { CLAIM_STATUSES, CLAIM_TRANSITIONS } from "./adminClaims";

describe("claim status transitions", () => {
  it("moves forward one step at a time", () => {
    expect(CLAIM_TRANSITIONS.submitted).toContain("under_review");
    expect(CLAIM_TRANSITIONS.under_review).toContain("replacement_credit");
    expect(CLAIM_TRANSITIONS.replacement_credit).toContain("resolved");
  });

  it("refuses to skip the review step", () => {
    expect(CLAIM_TRANSITIONS.submitted).not.toContain("replacement_credit");
    expect(CLAIM_TRANSITIONS.submitted).not.toContain("resolved");
  });

  it("only lets a resolved claim reopen into review", () => {
    expect(CLAIM_TRANSITIONS.resolved).toEqual(["under_review"]);
  });

  it("never lists a transition from a status to itself", () => {
    for (const status of CLAIM_STATUSES) {
      expect(CLAIM_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it("only names statuses that exist", () => {
    for (const status of CLAIM_STATUSES) {
      for (const next of CLAIM_TRANSITIONS[status]) {
        expect(CLAIM_STATUSES).toContain(next);
      }
    }
  });
});