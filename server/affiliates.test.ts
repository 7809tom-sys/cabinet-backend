import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function userCtx(role: "user" | "admin" | "partner", over?: Partial<{ id: number; email: string }>): TrpcContext {
  return {
    user: {
      id: over?.id ?? 1,
      openId: "o1",
      name: "T",
      email: over?.email ?? "t@x.com",
      role,
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("affiliates public lookups", () => {
  it("returns the seeded First Class storefront by slug", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const store = await caller.affiliates.bySlug({ slug: "firstclass" });
    expect(store).not.toBeNull();
    expect(store?.storeName).toContain("First Class");
    expect(store?.referralCode).toBe("FIRSTCLASS");
  });

  it("resolves an active affiliate by referral code (case-insensitive)", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.affiliates.byCode({ code: "first-class" });
    expect(res?.slug).toBe("firstclass");
  });

  it("returns null for unknown slug", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const store = await caller.affiliates.bySlug({ slug: "does-not-exist-xyz" });
    expect(store).toBeNull();
  });

  it("lists active storefronts including First Class", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const list = await caller.affiliates.listActive();
    expect(list.some((a) => a.slug === "firstclass")).toBe(true);
  });
});

describe("affiliates admin gating", () => {
  it("blocks non-admins from adminList", async () => {
    const userCaller = appRouter.createCaller(userCtx("user"));
    await expect(userCaller.affiliates.adminList()).rejects.toThrow();
  });

  it("allows admins to list", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const list = await adminCaller.affiliates.adminList();
    expect(Array.isArray(list)).toBe(true);
  });

  it("rejects duplicate referral code on create", async () => {
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    await expect(
      adminCaller.affiliates.adminCreate({
        storeName: "Dup Test",
        email: "dup@example.com",
        referralCode: "FIRSTCLASS", // already taken by the seed
        status: "active",
      })
    ).rejects.toThrow();
  });

  it("blocks non-admins from inviting people into the isolated Sales Demo training affiliate", async () => {
    const userCaller = appRouter.createCaller(userCtx("user"));
    await expect(
      userCaller.affiliates.adminInviteSalesDemo({
        email: "candidate@example.com",
        audience: "affiliate_candidate",
      })
    ).rejects.toThrow();
  });
});

describe("referral attribution on createRequest", () => {
  it("tags a new order request with the affiliate when a valid code is sent", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const created = await caller.orders.createRequest({
      originatorEmail: "ref-buyer@example.com",
      source: "manual",
      tier: "Contractor",
      referralCode: "FIRSTCLASS",
      lineItems: [
        {
          cabinetId: null,
          masterCode: "B-24",
          description: "24in Base",
          qty: 1,
          unitPrice: 100,
          linePrice: 100,
          matched: true,
        },
      ],
      notes: "vitest referral attribution",
    });
    const row = await caller.orders.byId({ id: created.id });
    expect(row?.referralCode).toBe("FIRSTCLASS");
    expect(row?.affiliateId).toBeGreaterThan(0);
  });

  it("ignores an unknown referral code (no attribution)", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const created = await caller.orders.createRequest({
      originatorEmail: "noref@example.com",
      source: "manual",
      tier: "Contractor",
      referralCode: "NOTAREALCODE",
      lineItems: [
        {
          cabinetId: null,
          masterCode: "B-24",
          description: "24in Base",
          qty: 1,
          unitPrice: 100,
          linePrice: 100,
          matched: true,
        },
      ],
    });
    const row = await caller.orders.byId({ id: created.id });
    expect(row?.affiliateId).toBeNull();
  });
});

describe("partner dashboard", () => {
  it("resolves the partner's affiliate by email and returns a referral summary", async () => {
    const partnerCaller = appRouter.createCaller(
      userCtx("partner", { id: 99999, email: "firstclassfcd@yahoo.com" })
    );
    const mine = await partnerCaller.affiliates.myAffiliate();
    expect(mine?.slug).toBe("firstclass");

    const refs = await partnerCaller.affiliates.myReferrals();
    expect(refs).not.toBeNull();
    expect(refs?.commissionRate).toBeCloseTo(0.05, 4);
    expect(refs?.summary.commission).toBeGreaterThanOrEqual(0);
  });

  it("returns null myAffiliate for an unrelated user", async () => {
    const stranger = appRouter.createCaller(
      userCtx("user", { id: 88888, email: "stranger@nowhere.com" })
    );
    const mine = await stranger.affiliates.myAffiliate();
    expect(mine).toBeNull();
  });
});

describe("affiliate storefront template", () => {
  it("bySlug returns a template value for the seeded storefront", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const store = await caller.affiliates.bySlug({ slug: "firstclass" });
    expect(store).not.toBeNull();
    // every storefront resolves to one of the four valid templates
    expect(["classic", "showcase", "minimal", "craftsman"]).toContain(store?.template);
  });

  it("partner can persist a valid template via updateMyStorefront and it round-trips", async () => {
    const partnerCaller = appRouter.createCaller(
      userCtx("partner", { id: 99999, email: "firstclassfcd@yahoo.com" })
    );

    // capture the original so we can restore it after the test
    const before = await partnerCaller.affiliates.myAffiliate();
    const original = (before?.template as "classic" | "showcase" | "minimal" | "craftsman") ?? "classic";

    try {
      await partnerCaller.affiliates.updateMyStorefront({ template: "showcase" });
      const publicCaller = appRouter.createCaller(publicCtx());
      const store = await publicCaller.affiliates.bySlug({ slug: "firstclass" });
      expect(store?.template).toBe("showcase");
    } finally {
      // restore to avoid leaking state into other tests / the live preview
      await partnerCaller.affiliates.updateMyStorefront({ template: original });
    }
  });

  it("rejects an invalid template value", async () => {
    const partnerCaller = appRouter.createCaller(
      userCtx("partner", { id: 99999, email: "firstclassfcd@yahoo.com" })
    );
    await expect(
      // @ts-expect-error invalid enum value on purpose
      partnerCaller.affiliates.updateMyStorefront({ template: "neon" })
    ).rejects.toThrow();
  });
});
