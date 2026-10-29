import { describe, expect, it } from "vitest";
import {
  resolveAffiliateRelationship,
  resolveSignInDestination,
  shouldLinkAffiliateOnLogin,
  signedInHomeForRole,
  type AffiliateCandidate,
  type AffiliateTeamCandidate,
} from "./affiliateResolution";

const ownerEmail = "owner@yahoo.com";

function affiliate(partial: AffiliateCandidate): AffiliateCandidate {
  return { status: "active", userId: null, email: null, ...partial };
}

function destination(
  resolution: ReturnType<typeof resolveAffiliateRelationship>,
  returnPath: string,
  userRole: string | null = "user",
  portal: "affiliate" | "contractor" | "customer" | null = null,
) {
  return resolveSignInDestination({ returnPath, userRole, resolution, portal });
}

describe("affiliate sign-in and portal resolution", () => {
  it("sends an admin who also has affiliate rows to /admin, and keeps an explicit return", () => {
    const affiliates = [
      affiliate({ id: 4, email: ownerEmail, userId: 1 }),
      affiliate({ id: 9, email: ownerEmail, userId: null }),
    ];
    const resolution = resolveAffiliateRelationship({
      userId: 1,
      email: ownerEmail,
      affiliates,
      teamMembers: [],
    });

    expect(resolution.access?.affiliateId).toBe(4);
    expect(resolution.link).toBeNull();
    expect(shouldLinkAffiliateOnLogin("admin", resolution.link)).toBe(false);
    expect(signedInHomeForRole("admin")).toBe("/admin");
    expect(signedInHomeForRole("contractor")).toBe("/contractor");
    expect(signedInHomeForRole("user")).toBe("/account");
    expect(destination(resolution, "/admin", "admin")).toMatchObject({
      destination: "/admin",
      resolution: "admin",
    });
    expect(destination(resolution, "/account", "admin").destination).toBe(
      "/account"
    );
    expect(
      destination(resolution, "/affiliate?viewAs=9", "admin").destination
    ).toBe("/affiliate?viewAs=9");
    expect(destination(resolution, "/", "admin").destination).not.toMatch(
      /^\/affiliate/
    );

    const unlinkedAdmin = resolveAffiliateRelationship({
      userId: 2,
      email: ownerEmail,
      affiliates: [
        affiliate({ id: 4, email: ownerEmail }),
        affiliate({ id: 9, email: ownerEmail }),
      ],
      teamMembers: [],
    });
    expect(unlinkedAdmin.access).toBeNull();
    expect(unlinkedAdmin.link).toBeNull();
    expect(destination(unlinkedAdmin, "/admin", "admin").destination).toBe(
      "/admin"
    );
    expect(
      destination(unlinkedAdmin, "/admin/catalog-import", "admin").destination
    ).toBe("/admin/catalog-import");
  });

  it("does not guess when an email matches two affiliates, and does not loop back to the portal", () => {
    const affiliates = [
      affiliate({ id: 9, email: "Owner@Yahoo.com" }),
      affiliate({ id: 4, email: "owner@yahoo.com" }),
      affiliate({ id: 3, email: "owner@yahoo.com", status: "inactive" }),
    ];
    const resolution = resolveAffiliateRelationship({
      userId: 50,
      email: " OWNER@yahoo.com ",
      affiliates,
      teamMembers: [],
    });

    expect(resolution.access).toBeNull();
    expect(resolution.link).toBeNull();
    expect(resolution.ambiguousAffiliateIds).toEqual([4, 9]);

    expect(destination(resolution, "/admin").destination).toBe("/admin");
    expect(destination(resolution, "/account")).toMatchObject({
      destination: "/account",
      resolution: "ambiguous",
    });
    expect(destination(resolution, "/affiliate?viewAs=4").destination).toBe(
      "/account"
    );
    expect(destination(resolution, "/").destination).toBe("/");
    expect(
      destination(resolution, "/affiliate?viewAs=4").destination.startsWith(
        "/affiliate"
      )
    ).toBe(false);

    const linked = resolveAffiliateRelationship({
      userId: 50,
      email: ownerEmail,
      affiliates: [
        affiliate({ id: 4, email: ownerEmail, userId: 80 }),
        affiliate({ id: 9, email: ownerEmail, userId: 50 }),
      ],
      teamMembers: [],
    });
    expect(linked.access).toMatchObject({
      affiliateId: 9,
      isOwner: true,
      teamMemberId: null,
    });
    expect(linked.ambiguousAffiliateIds).toEqual([]);
    expect(destination(linked, "/").destination).toBe("/affiliate?viewAs=9");
    expect(destination(linked, "/admin").destination).toBe("/admin");
    expect(destination(linked, "/admin/fee-system").destination).toBe(
      "/admin/fee-system"
    );
  });

  it("sends a new affiliate with one email match to that portal and links the empty userId", () => {
    const resolution = resolveAffiliateRelationship({
      userId: 77,
      email: "New.Owner@Example.com",
      affiliates: [
        affiliate({
          id: 15,
          email: "new.owner@example.com",
          userId: null,
          status: "paused",
        }),
      ],
      teamMembers: [],
    });

    expect(resolution.access).toEqual({
      affiliateId: 15,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    expect(resolution.link).toEqual({ kind: "owner", affiliateId: 15 });
    expect(shouldLinkAffiliateOnLogin("user", resolution.link)).toBe(true);
    expect(destination(resolution, "/account").destination).toBe(
      "/affiliate?viewAs=15"
    );
    expect(destination(resolution, "/account", "user", "customer").destination).toBe("/customer");
    expect(destination(resolution, "/affiliate", "user", "contractor").destination).toBe("/contractor");
    expect(destination(resolution, "/customer", "contractor", "affiliate").destination).toBe(
      "/affiliate?viewAs=15"
    );
    expect(destination(resolution, "/admin").destination).toBe("/admin");

    const alreadyClaimed = resolveAffiliateRelationship({
      userId: 77,
      email: "new.owner@example.com",
      affiliates: [
        affiliate({ id: 15, email: "new.owner@example.com", userId: 12 }),
      ],
      teamMembers: [],
    });
    expect(alreadyClaimed.access?.affiliateId).toBe(15);
    expect(alreadyClaimed.link).toBeNull();
  });

  it("sends a team member to the invited store ahead of other affiliates that share the email", () => {
    const teamMembers: AffiliateTeamCandidate[] = [
      {
        id: 3,
        affiliateId: 21,
        userId: null,
        email: "rep@example.com",
        isActive: true,
        accessCrm: true,
        accessDesigner: false,
        accessMarketing: true,
        createdAt: "2024-02-01T00:00:00.000Z",
      },
      {
        id: 2,
        affiliateId: 20,
        userId: null,
        email: "rep@example.com",
        isActive: false,
        accessCrm: true,
        accessDesigner: true,
        accessMarketing: false,
        createdAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    const resolution = resolveAffiliateRelationship({
      userId: 200,
      email: "REP@example.com",
      affiliates: [
        affiliate({ id: 20, email: "rep@example.com", status: "inactive" }),
        affiliate({ id: 21, email: "someone-else@example.com" }),
        affiliate({ id: 22, email: "rep@example.com" }),
        affiliate({ id: 23, email: "rep@example.com" }),
      ],
      teamMembers,
    });

    expect(resolution.access).toEqual({
      affiliateId: 21,
      isOwner: false,
      accessCrm: true,
      accessDesigner: false,
      accessMarketing: true,
      teamMemberId: 3,
    });
    expect(resolution.link).toEqual({ kind: "team", teamMemberId: 3 });
    expect(resolution.ambiguousAffiliateIds).toEqual([]);
    expect(destination(resolution, "/account").destination).toBe(
      "/affiliate?viewAs=21"
    );
    expect(destination(resolution, "/affiliate?viewAs=22").destination).toBe(
      "/affiliate?viewAs=21"
    );

    const linkedMember = resolveAffiliateRelationship({
      userId: 200,
      email: "rep@example.com",
      affiliates: [affiliate({ id: 30, email: "other@example.com" })],
      teamMembers: [{ ...teamMembers[0], affiliateId: 30, userId: 200 }],
    });
    expect(linkedMember.access).toMatchObject({
      affiliateId: 30,
      isOwner: false,
      teamMemberId: 3,
    });
    expect(linkedMember.link).toBeNull();
  });

  it("does not send a user with no affiliate back to the affiliate page", () => {
    const resolution = resolveAffiliateRelationship({
      userId: 100,
      email: "customer@example.com",
      affiliates: [affiliate({ id: 4, email: "other@example.com" })],
      teamMembers: [],
    });

    expect(resolution).toEqual({
      access: null,
      ambiguousAffiliateIds: [],
      link: null,
    });
    expect(destination(resolution, "/account")).toMatchObject({
      destination: "/account",
      resolution: "none",
    });
    expect(destination(resolution, "/affiliate").destination).toBe("/account");
    expect(destination(resolution, "/affiliate", "user", "affiliate").destination).toBe("/affiliate");
    expect(destination(resolution, "/signin", "user", "customer").destination).toBe("/customer");
    expect(destination(resolution, "/affiliate?viewAs=4").destination).toBe(
      "/account"
    );
    expect(destination(resolution, "/store/reaves-way").destination).toBe(
      "/store/reaves-way"
    );
    expect(destination(resolution, "/affiliate/setup").destination).toBe(
      "/affiliate/setup"
    );
  });

  it("picks the oldest active team invitation when one email was invited to several stores", () => {
    const resolution = resolveAffiliateRelationship({
      userId: 5,
      email: "rep@example.com",
      affiliates: [
        affiliate({ id: 1, email: "store@example.com" }),
        affiliate({ id: 2, email: "other@example.com" }),
      ],
      teamMembers: [
        {
          id: 10,
          affiliateId: 1,
          userId: null,
          email: "rep@example.com",
          isActive: true,
          accessCrm: true,
          accessDesigner: true,
          accessMarketing: false,
          createdAt: "2024-05-01T00:00:00.000Z",
        },
        {
          id: 11,
          affiliateId: 2,
          userId: null,
          email: "rep@example.com",
          isActive: true,
          accessCrm: false,
          accessDesigner: true,
          accessMarketing: false,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(resolution.access).toMatchObject({
      affiliateId: 2,
      teamMemberId: 11,
      isOwner: false,
      accessCrm: false,
    });
    expect(resolution.link).toBeNull();
    expect(destination(resolution, "/account").destination).toBe(
      "/affiliate?viewAs=2"
    );
  });

  it("picks the lowest linked affiliate id when one user is stored on two rows", () => {
    const resolution = resolveAffiliateRelationship({
      userId: 1,
      email: "a@example.com",
      affiliates: [
        affiliate({ id: 8, userId: 1, email: "a@example.com" }),
        affiliate({ id: 2, userId: 1, email: "b@example.com" }),
      ],
      teamMembers: [],
    });
    expect(resolution.access?.affiliateId).toBe(2);
    expect(destination(resolution, "/").destination).toBe(
      "/affiliate?viewAs=2"
    );
  });
});
