import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

function userCtx(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

describe("pelican.categories", () => {
  it("returns catalog categories sorted by descending count with numeric counts", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const cats = await caller.pelican.categories({ scope: "catalog" });
    expect(Array.isArray(cats)).toBe(true);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(typeof c.category).toBe("string");
      expect(typeof c.count).toBe("number");
      expect(Number.isFinite(c.count)).toBe(true);
    }
    for (let i = 1; i < cats.length; i++) {
      expect(cats[i - 1].count).toBeGreaterThanOrEqual(cats[i].count);
    }
  });
});

describe("pelican.byCategory", () => {
  it("returns suggested-first (popular) items and a well-formed payload for Flooring", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.pelican.byCategory({ category: "Flooring", scope: "catalog" });
    expect(res).toHaveProperty("suggested");
    expect(res).toHaveProperty("items");
    expect(res).toHaveProperty("total");
    expect(res).toHaveProperty("subCategories");
    expect(Array.isArray(res.items)).toBe(true);
    expect(res.total).toBeGreaterThan(0);
    for (const s of res.suggested) {
      expect(s.isPopular).toBe(true);
      expect(s.category).toBe("Flooring");
    }
    for (let i = 1; i < res.items.length; i++) {
      const prev = res.items[i - 1].isPopular ? 1 : 0;
      const cur = res.items[i].isPopular ? 1 : 0;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it("suppresses suggested block when searching", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.pelican.byCategory({ category: "Flooring", scope: "catalog", search: "zzzznomatch" });
    expect(res.suggested).toEqual([]);
  });
});

describe("pelican admin gating", () => {
  it("rejects adminList for anonymous callers", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(caller.pelican.adminList({})).rejects.toThrow();
  });

  it("rejects adminList for non-admin users", async () => {
    const caller = appRouter.createCaller(userCtx("user"));
    await expect(caller.pelican.adminList({})).rejects.toThrow();
  });

  it("allows adminList for admin users", async () => {
    const caller = appRouter.createCaller(userCtx("admin"));
    const res = await caller.pelican.adminList({ limit: 5 });
    expect(res).toHaveProperty("items");
    expect(res).toHaveProperty("total");
    expect(Array.isArray(res.items)).toBe(true);
  });
});
