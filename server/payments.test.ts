import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { paymentSettings } from "../drizzle/schema";

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 991,
      openId: "o-admin-payments",
      name: "Owner",
      email: "owner-payments@cabinetdealz.test",
      role: "admin",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 992,
      openId: "o-user-payments",
      name: "Shopper",
      email: "shopper-payments@cabinetdealz.test",
      role: "user",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function guestCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("payments router", () => {
  it("adminGetSettings is admin-only", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.payments.adminGetSettings()).rejects.toThrow();
  });

  it("settings never expose the transaction key (only hasTransactionKey flag)", async () => {
    const db = await getDb();
    if (!db) return;
    const admin = appRouter.createCaller(adminCtx());
    // Snapshot existing row so we can restore it after the test.
    const before = (await db.select().from(paymentSettings).limit(1))[0] ?? null;
    try {
      await admin.payments.adminSaveSettings({
        enabled: true,
        environment: "sandbox",
        apiLoginId: "loginid-test",
        clientKey: "clientkey-test",
        transactionKey: "supersecretkey",
      });
      const s = await admin.payments.adminGetSettings();
      expect(s).not.toBeNull();
      // The returned object must not contain the secret under any key.
      expect(JSON.stringify(s)).not.toContain("supersecretkey");
      expect(s!.hasTransactionKey).toBe(true);
      expect(s!.apiLoginId).toBe("loginid-test");
      expect(s!.clientKey).toBe("clientkey-test");
    } finally {
      const row = (await db.select().from(paymentSettings).limit(1))[0];
      if (row) {
        if (before) {
          await db.update(paymentSettings).set({
            enabled: before.enabled,
            environment: before.environment,
            apiLoginId: before.apiLoginId,
            clientKey: before.clientKey,
            transactionKey: before.transactionKey,
          }).where(eq(paymentSettings.id, row.id));
        } else {
          await db.update(paymentSettings).set({
            enabled: false, apiLoginId: null, clientKey: null, transactionKey: null,
          }).where(eq(paymentSettings.id, row.id));
        }
      }
    }
  });

  it("re-saving without a transactionKey keeps the stored secret", async () => {
    const db = await getDb();
    if (!db) return;
    const admin = appRouter.createCaller(adminCtx());
    const before = (await db.select().from(paymentSettings).limit(1))[0] ?? null;
    try {
      await admin.payments.adminSaveSettings({
        apiLoginId: "id1", clientKey: "ck1", transactionKey: "secret-A",
      });
      // Save again WITHOUT a transactionKey — should preserve secret-A.
      await admin.payments.adminSaveSettings({ apiLoginId: "id2" });
      const row = (await db.select().from(paymentSettings).limit(1))[0];
      expect(row.transactionKey).toBe("secret-A");
      expect(row.apiLoginId).toBe("id2");
    } finally {
      const row = (await db.select().from(paymentSettings).limit(1))[0];
      if (row && before) {
        await db.update(paymentSettings).set({
          enabled: before.enabled,
          environment: before.environment,
          apiLoginId: before.apiLoginId,
          clientKey: before.clientKey,
          transactionKey: before.transactionKey,
        }).where(eq(paymentSettings.id, row.id));
      }
    }
  });

  it("publicConfig returns enabled:false when not fully configured", async () => {
    const db = await getDb();
    if (!db) return;
    const admin = appRouter.createCaller(adminCtx());
    const before = (await db.select().from(paymentSettings).limit(1))[0] ?? null;
    try {
      // Disable to force the gated path.
      await admin.payments.adminSaveSettings({ enabled: false });
      const guest = appRouter.createCaller(guestCtx());
      const cfg = await guest.payments.publicConfig();
      expect(cfg.enabled).toBe(false);
      // The secret is never present in the public payload.
      expect(JSON.stringify(cfg)).not.toContain("transactionKey");
    } finally {
      const row = (await db.select().from(paymentSettings).limit(1))[0];
      if (row && before) {
        await db.update(paymentSettings).set({ enabled: before.enabled }).where(eq(paymentSettings.id, row.id));
      }
    }
  });

  it("charge refuses when payments are not configured/enabled", async () => {
    const db = await getDb();
    if (!db) return;
    const admin = appRouter.createCaller(adminCtx());
    const before = (await db.select().from(paymentSettings).limit(1))[0] ?? null;
    try {
      await admin.payments.adminSaveSettings({ enabled: false });
      const guest = appRouter.createCaller(guestCtx());
      await expect(
        guest.payments.charge({
          orderRequestId: 1,
          opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "x" },
          freightCents: 5000,
        }),
      ).rejects.toThrow();
    } finally {
      const row = (await db.select().from(paymentSettings).limit(1))[0];
      if (row && before) {
        await db.update(paymentSettings).set({ enabled: before.enabled }).where(eq(paymentSettings.id, row.id));
      }
    }
  });

  it("charges only the server-verified freight stored on the order", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers/payments.ts"), "utf8");
    expect(source).toContain('const verifiedFreightCents = order.deliveryMethod === "pickup" ? 0 : order.freightQuoteCents');
    expect(source).toContain('order.deliveryMethod === "ship" && !order.freightQuoteVerified');
    expect(source).toContain("freightCents: verifiedFreightCents");
    expect(source).not.toContain("freightCents: input.freightCents");
  });
});

// local import to avoid top-of-file churn
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
