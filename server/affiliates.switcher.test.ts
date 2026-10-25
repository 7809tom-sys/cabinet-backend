import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function ctxFor(role: "admin" | "user") {
  return {
    user: { id: 1, role, email: "7809tom@gmail.com", name: "Tom" },
    req: {} as never,
    res: {} as never,
  } as never;
}

describe("adminSwitcherList (affiliate store switcher)", () => {
  it("returns a minimal shape with just what the picker needs", async () => {
    const caller = appRouter.createCaller(ctxFor("admin"));
    const rows = await caller.affiliates.adminSwitcherList();
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length === 0) return;
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "slug", "status", "storeName"]);
  });

  it("does not leak internal fields such as notes or commission rate", async () => {
    const caller = appRouter.createCaller(ctxFor("admin"));
    const rows = await caller.affiliates.adminSwitcherList();
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("notes");
    expect(keys).not.toContain("commissionRate");
    expect(keys).not.toContain("email");
  });

  it("is sorted by store name so the picker is predictable", async () => {
    const caller = appRouter.createCaller(ctxFor("admin"));
    const rows = await caller.affiliates.adminSwitcherList();
    const names = rows.map((r) => r.storeName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    // DB collation may order case differently; compare case-insensitively.
    expect(names.map((n) => n.toLowerCase())).toEqual(
      sorted.map((n) => n.toLowerCase())
    );
  });

  it("is admin-only — a normal user cannot enumerate stores", async () => {
    const caller = appRouter.createCaller(ctxFor("user"));
    await expect(caller.affiliates.adminSwitcherList()).rejects.toThrow();
  });
});
