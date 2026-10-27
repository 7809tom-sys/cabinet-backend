import { describe, expect, it } from "vitest";
import { affiliates, affiliateTeamMembers } from "../drizzle/schema";
import { resolveAffiliateAccess } from "./lib/affiliateAccess";

function fakeDb(teamRows: unknown[], ownerRows: unknown[]) {
  let ownerSelectCount = 0;
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = table === affiliateTeamMembers
            ? teamRows
            : ownerSelectCount++ === 0
              ? ownerRows.filter((row) => Boolean((row as { userId?: number }).userId))
              : ownerRows;
          return {
            orderBy: () => ({ limit: async () => rows }),
            limit: async () => rows,
          };
        },
      }),
    }),
  } as never;
}

describe("resolveAffiliateAccess", () => {
  it("returns the invitation capabilities for an active team member", async () => {
    const access = await resolveAffiliateAccess(
      fakeDb(
        [{ id: 7, affiliateId: 42, accessCrm: true, accessDesigner: false, accessMarketing: false }],
        [],
      ),
      { id: 100, email: "designer@example.com" },
    );

    expect(access).toEqual({
      affiliateId: 42,
      isOwner: false,
      accessCrm: true,
      accessDesigner: false,
      accessMarketing: false,
      teamMemberId: 7,
    });
  });

  it("grants both capabilities to the affiliate owner", async () => {
    const access = await resolveAffiliateAccess(
      fakeDb([], [{ id: 42 }]),
      { id: 100, email: "owner@example.com" },
    );

    expect(access).toEqual({
      affiliateId: 42,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
  });

  it("returns null when no affiliate relationship matches", async () => {
    expect(
      await resolveAffiliateAccess(fakeDb([], []), { id: 100, email: "none@example.com" }),
    ).toBeNull();
  });

  it("does not guess between two legacy affiliates sharing an email", async () => {
    expect(
      await resolveAffiliateAccess(
        fakeDb([], [{ id: 42 }, { id: 43 }]),
        { id: 100, email: "shared@example.com" },
      ),
    ).toBeNull();
  });
});
