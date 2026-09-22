import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function adminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "pelican-readiness-audit-admin",
    email: "admin@example.com",
    name: "Pelican Audit Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("pelican.designerReadinessAudit", () => {
  it("reports every configured Designer product while preserving the verified-only palette gate", async () => {
    if (!await getDb()) return;
    const caller = appRouter.createCaller(adminCtx());
    const audit = await caller.pelican.designerReadinessAudit();

    expect(audit.totals.configured).toBe(audit.rows.length);
    expect(audit.roles.reduce((sum, role) => sum + role.configured, 0)).toBe(audit.rows.length);
    for (const row of audit.rows) {
      if (!row.paletteReady) continue;
      expect(row.active).toBe(true);
      expect(row.sourcePriced).toBe(true);
      expect(row.catalogImage).toBe(true);
      expect(row.role).not.toBeNull();
      expect(row.approvedRepresentation).toBe(true);
    }
    for (const row of audit.rows) {
      if (!row.evidenceComplete) continue;
      expect(row.paletteReady).toBe(true);
      expect(row.blockers).toEqual([]);
    }
  });
});
