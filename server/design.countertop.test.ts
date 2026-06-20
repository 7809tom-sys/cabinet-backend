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

function userCtx(role: "user" | "admin"): TrpcContext {
  return {
    user: { id: 1, openId: "o1", name: "T", email: "t@x.com", role } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("countertop quote requests", () => {
  it("accepts a public quote request and stores it", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.design.requestCountertopQuote({
      contactEmail: "buyer@example.com",
      squareFeet: 32.5,
      linearFeet: 18,
      hasIsland: true,
      zip: "75201",
      notes: "vitest countertop request",
    });
    expect(res.id).toBeGreaterThan(0);
  });

  it("rejects an invalid email", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(
      caller.design.requestCountertopQuote({
        contactEmail: "not-an-email",
        squareFeet: 10,
        linearFeet: 5,
      })
    ).rejects.toThrow();
  });

  it("only admins can list quotes", async () => {
    const userCaller = appRouter.createCaller(userCtx("user"));
    await expect(userCaller.design.listCountertopQuotes()).rejects.toThrow();

    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const list = await adminCaller.design.listCountertopQuotes();
    expect(Array.isArray(list)).toBe(true);
  });
});
