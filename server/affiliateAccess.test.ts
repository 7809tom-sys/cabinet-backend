import { describe, expect, it } from "vitest";
import { affiliates, affiliateTeamMembers } from "../drizzle/schema";
import {
  linkResolvedAffiliateIdentity,
  resolveAffiliateAccess,
} from "./lib/affiliateAccess";

function query(rows: unknown[]) {
  const promise = Promise.resolve(rows) as Promise<unknown[]> & {
    orderBy: () => Promise<unknown[]>;
    limit: () => Promise<unknown[]>;
  };
  promise.orderBy = () => query(rows);
  promise.limit = () => query(rows);
  return promise;
}

function fakeDb(teamRows: unknown[], affiliateRows: unknown[]) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          query(table === affiliateTeamMembers ? teamRows : affiliateRows),
      }),
    }),
  } as never;
}

describe("resolveAffiliateAccess", () => {
  it("returns the invitation capabilities for an active team member", async () => {
    const access = await resolveAffiliateAccess(
      fakeDb(
        [
          {
            id: 7,
            affiliateId: 42,
            userId: 100,
            email: "designer@example.com",
            isActive: true,
            accessCrm: true,
            accessDesigner: false,
            accessMarketing: false,
          },
        ],
        [{ id: 42, userId: null, email: "owner@example.com", status: "active" }]
      ),
      { id: 100, email: "designer@example.com" }
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
      fakeDb(
        [],
        [{ id: 42, userId: null, email: "owner@example.com", status: "active" }]
      ),
      { id: 100, email: "owner@example.com" }
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
      await resolveAffiliateAccess(fakeDb([], []), {
        id: 100,
        email: "none@example.com",
      })
    ).toBeNull();
  });

  it("does not guess between two legacy affiliates sharing an email", async () => {
    expect(
      await resolveAffiliateAccess(
        fakeDb(
          [],
          [
            {
              id: 42,
              userId: null,
              email: "shared@example.com",
              status: "active",
            },
            {
              id: 43,
              userId: null,
              email: "shared@example.com",
              status: "active",
            },
          ]
        ),
        { id: 100, email: "shared@example.com" }
      )
    ).toBeNull();
  });

  it("links an empty affiliate userId and refuses to overwrite one that is already set", async () => {
    const updates: Array<{ table: string; userId: number }> = [];
    const db = {
      update: (table: unknown) => ({
        set: (values: { userId: number }) => ({
          where: async () => {
            updates.push({
              table:
                table === affiliates ? "affiliates" : "affiliate_team_members",
              userId: values.userId,
            });
          },
        }),
      }),
    } as never;

    await linkResolvedAffiliateIdentity(db, 7, {
      kind: "owner",
      affiliateId: 3,
    });
    await linkResolvedAffiliateIdentity(db, 7, {
      kind: "team",
      teamMemberId: 8,
    });
    expect(updates).toEqual([
      { table: "affiliates", userId: 7 },
      { table: "affiliate_team_members", userId: 7 },
    ]);
  });
});
