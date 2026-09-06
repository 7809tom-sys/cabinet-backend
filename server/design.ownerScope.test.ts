import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { kitchenDesigns } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function userContext(id: number, role: "user" | "contractor" = "user"): TrpcContext {
  return {
    user: { id, openId: `owner-scope-${id}`, name: `Owner ${id}`, email: `owner-${id}@example.test`, role },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function adminContext(): TrpcContext {
  return {
    user: { id: 998899, openId: "owner-scope-admin", name: "Design Administrator", email: "admin-owner-scope@example.test", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("saved design owner scope", () => {
  it("keeps a saved plan private to its authenticated creator across user and contractor roles", async () => {
    const db = await getDb();
    if (!db) return;
    const owner = appRouter.createCaller(userContext(998801));
    const contractor = appRouter.createCaller(userContext(998802, "contractor"));
    const admin = appRouter.createCaller(adminContext());
    const saved = await owner.design.save({
      name: "Owner-scoped kitchen",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    });

    try {
      expect((await owner.design.myDesigns()).some((design) => design.id === saved.id)).toBe(true);
      expect((await contractor.design.myDesigns()).some((design) => design.id === saved.id)).toBe(false);
      await expect(contractor.design.byId({ id: saved.id })).resolves.toBeNull();
      expect((await admin.design.myDesigns()).some((design) => design.id === saved.id)).toBe(true);
      expect((await admin.design.byId({ id: saved.id }))?.name).toBe("Owner-scoped kitchen");
      await expect(contractor.design.save({
        id: saved.id,
        name: "Attempted overwrite",
        roomData: { width: 120, depth: 120 },
        placedCabinets: [],
      })).rejects.toThrow("Saved design not found");
      await expect(admin.design.save({
        id: saved.id,
        name: "Administrator overwrite",
        roomData: { width: 120, depth: 120 },
        placedCabinets: [],
      })).rejects.toThrow("Saved design not found");
      await expect(contractor.design.createRemoteShareLink({ designId: saved.id })).rejects.toThrow("You can only share your own saved design");
    } finally {
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, saved.id));
    }
  });
});
