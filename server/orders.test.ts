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

describe("orders.extractFromCsv", () => {
  it("matches known cabinet codes from CSV", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.orders.extractFromCsv({ csv: "code,qty\nB-24,2\nZZZ-99,1" });
    expect(res.lines).toHaveLength(2);
    const b24 = res.lines.find((l) => l.normalized === "B-24");
    expect(b24?.matched).toBe(true);
    expect(b24?.qty).toBe(2);
    const unknown = res.lines.find((l) => l.rawCode === "ZZZ-99");
    expect(unknown?.matched).toBe(false);
    expect(res.matchedCount + res.unmatchedCount).toBe(2);
  });

  it("rejects empty CSV", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(caller.orders.extractFromCsv({ csv: "   " })).rejects.toThrow();
  });
});

describe("orders.matchCodes", () => {
  it("matches manual shorthand codes", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.orders.matchCodes({ items: [{ code: "B24", qty: 1 }] });
    expect(res.lines[0].masterCode).toBe("B-24");
  });
});

describe("orders.createRequest + confirm", () => {
  it("creates a draft request and confirms it", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const created = await caller.orders.createRequest({
      originatorEmail: "buyer@example.com",
      source: "manual",
      tier: "Contractor",
      lineItems: [
        {
          cabinetId: null,
          masterCode: "B-24",
          description: "24in Base",
          qty: 2,
          unitPrice: 100,
          linePrice: 200,
          matched: true,
        },
      ],
      notes: "vitest order request",
    });
    expect(created.id).toBeGreaterThan(0);

    const confirmed = await caller.orders.confirm({ id: created.id });
    expect(confirmed.status).toBe("confirmed");
  });

  it("rejects an order request with no line items", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(
      caller.orders.createRequest({
        source: "manual",
        tier: "Contractor",
        lineItems: [],
      })
    ).rejects.toThrow();
  });
});

describe("orders.adminList", () => {
  it("only admins can list order requests", async () => {
    const userCaller = appRouter.createCaller(userCtx("user"));
    await expect(userCaller.orders.adminList()).rejects.toThrow();

    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const list = await adminCaller.orders.adminList();
    expect(Array.isArray(list)).toBe(true);
  });
});
