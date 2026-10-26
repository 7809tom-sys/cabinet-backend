import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, accessMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./lib/affiliateAccess", () => ({ resolveAffiliateAccess: accessMock }));

import { affiliateSocialRouter } from "./routers/affiliateSocialLinks";

const updates: Record<string, unknown>[] = [];

function db() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 4, socialLinks: null, facebookUrl: "https://facebook.com/legacy", instagramUrl: null }],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: async () => undefined };
      },
    }),
  };
}

const user = { id: 9, email: "person@example.com", role: "user" };

describe("affiliate social link edits", () => {
  beforeEach(() => {
    updates.length = 0;
    getDbMock.mockResolvedValue(db());
    accessMock.mockReset();
  });

  it("does not let a non-affiliate read social links", async () => {
    accessMock.mockResolvedValue(null);
    const caller = affiliateSocialRouter.createCaller({ user } as never);
    await expect(caller.get({ affiliateId: 4 })).rejects.toThrow(/Affiliate access required/);
    expect(updates).toHaveLength(0);
  });

  it("does not let a team member without marketing access edit links", async () => {
    accessMock.mockResolvedValue({
      affiliateId: 4,
      isOwner: false,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: false,
      teamMemberId: 2,
    });
    const caller = affiliateSocialRouter.createCaller({ user } as never);
    await expect(caller.update({
      affiliateId: 4,
      links: [{ platform: "facebook", url: "https://facebook.com/example", enabled: true }],
    })).rejects.toThrow(/marketing access/);
    expect(updates).toHaveLength(0);
  });

  it("lets the owner save profile urls and mirrors facebook without storing a password", async () => {
    accessMock.mockResolvedValue({
      affiliateId: 4,
      isOwner: true,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: null,
    });
    const caller = affiliateSocialRouter.createCaller({ user } as never);
    await expect(caller.update({
      affiliateId: 4,
      links: [{ platform: "instagram", url: "https://instagram.com/example?token=abc", enabled: true }],
    })).rejects.toThrow(/public profile link/);
    const saved = await caller.update({
      affiliateId: 4,
      links: [
        { platform: "facebook", url: "https://facebook.com/example", handle: "@Example", enabled: true },
        { platform: "instagram", url: "https://instagram.com/example", enabled: false },
      ],
    });
    expect(saved.facebookUrl).toBe("https://facebook.com/example");
    expect(saved.instagramUrl).toBeNull();
    expect(JSON.stringify(updates.at(-1))).not.toMatch(/password|token/);
    expect(updates.at(-1)?.socialLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "facebook", url: "https://facebook.com/example", handle: "Example" }),
    ]));
  });
});
