import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const calls = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  updates: 0,
  charged: 0,
  snapshots: 0,
}));

vi.mock("./db", () => ({
  getDb: async () => (globalThis as { __orderGuardDb?: unknown }).__orderGuardDb,
}));

vi.mock("./authorizeNet", () => ({
  chargeOpaque: async () => {
    calls.charged += 1;
    return {
      status: "approved",
      transactionId: "txn",
      authCode: "auth",
      responseCode: "1",
      avsResultCode: "Y",
      cardLast4: "4242",
      cardType: "Visa",
      message: "ok",
    };
  },
}));

vi.mock("./lib/hardwareCommissionSnapshot", () => ({
  createHardwareCommissionSnapshot: async () => {
    calls.snapshots += 1;
  },
}));

import { affiliateInstallationEstimates, orderRequests, paymentSettings } from "../drizzle/schema";
import { appRouter } from "./routers";

function ctx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const order = {
  id: 5,
  userId: 9,
  totalAmount: "25.00",
  deliveryMethod: "pickup",
  freightQuoteCents: 0,
  freightQuoteVerified: false,
  requestNumber: "R-5",
  originatorEmail: "buyer@example.com",
  originatorName: "Buyer",
  affiliateId: 3,
  status: "submitted",
  stripeSessionId: null,
  stripePaymentIntentId: null,
  paidAt: null,
};

beforeEach(() => {
  calls.order = { ...order };
  calls.updates = 0;
  calls.charged = 0;
  calls.snapshots = 0;
  const chain = (table: unknown) => {
    if (table === paymentSettings) {
      return { limit: async () => [{ enabled: true, apiLoginId: "login", transactionKey: "key", environment: "sandbox" }] };
    }
    if (table === orderRequests) {
      return { where: () => ({ limit: async () => (calls.order ? [calls.order] : []) }) };
    }
    if (table === affiliateInstallationEstimates) {
      return { where: () => ({ orderBy: () => ({ limit: async () => [{ shareToken: "share-1", totalAmount: "10.00" }] }) }) };
    }
    return { where: () => ({ limit: async () => [] }), limit: async () => [] };
  };
  (globalThis as { __orderGuardDb?: unknown }).__orderGuardDb = {
    select: () => ({ from: (table: unknown) => chain(table) }),
    execute: async () => {
      throw new Error("Unknown column 'accessToken' in 'field list'");
    },
    insert: () => ({ values: async () => [{ insertId: 77 }] }),
    update: () => ({
      set: () => ({
        where: async () => {
          calls.updates += 1;
        },
      }),
    }),
  };
});

describe("orders.confirm authorization", () => {
  it("refuses an anonymous caller and a signed-in non-owner", async () => {
    await expect(appRouter.createCaller(ctx(null)).orders.confirm({ id: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctx({ id: 4, role: "user" } as TrpcContext["user"])).orders.confirm({ id: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls.updates).toBe(0);
  });

  it("lets an admin confirm and reports a missing order", async () => {
    const confirmed = await appRouter.createCaller(ctx({ id: 1, role: "admin" } as TrpcContext["user"])).orders.confirm({ id: 5 });
    expect(confirmed.status).toBe("confirmed");
    calls.order = null;
    await expect(appRouter.createCaller(ctx({ id: 1, role: "admin" } as TrpcContext["user"])).orders.confirm({ id: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("payments.charge authorization", () => {
  const input = {
    orderRequestId: 5,
    opaqueData: { dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT", dataValue: "nonce" },
  };

  it("refuses the public and a signed-in non-owner before any commission snapshot", async () => {
    await expect(appRouter.createCaller(ctx(null)).payments.charge(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctx({ id: 4, role: "user" } as TrpcContext["user"])).payments.charge(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls.charged).toBe(0);
    expect(calls.snapshots).toBe(0);
  });

  it("lets the order owner and an admin charge", async () => {
    const owner = await appRouter.createCaller(ctx({ id: 9, role: "user" } as TrpcContext["user"])).payments.charge(input);
    expect(owner.success).toBe(true);
    expect(calls.charged).toBe(1);
    expect(calls.snapshots).toBe(1);
    const admin = await appRouter.createCaller(ctx({ id: 1, role: "admin" } as TrpcContext["user"])).payments.charge(input);
    expect(admin.success).toBe(true);
    calls.order = null;
    await expect(appRouter.createCaller(ctx({ id: 1, role: "admin" } as TrpcContext["user"])).payments.charge(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("installationEstimates.forOrderConfirmation authorization", () => {
  const input = { orderRequestId: 5, customerEmail: "buyer@example.com" };

  it("refuses the public and a signed-in non-owner", async () => {
    await expect(appRouter.createCaller(ctx(null)).installationEstimates.forOrderConfirmation(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctx({ id: 4, role: "user" } as TrpcContext["user"])).installationEstimates.forOrderConfirmation(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the share token to the owner and admin, and not found when the order is missing", async () => {
    const owner = await appRouter.createCaller(ctx({ id: 9, role: "user" } as TrpcContext["user"])).installationEstimates.forOrderConfirmation(input);
    expect(owner?.shareToken).toBe("share-1");
    const admin = await appRouter.createCaller(ctx({ id: 1, role: "admin" } as TrpcContext["user"])).installationEstimates.forOrderConfirmation(input);
    expect(admin?.shareToken).toBe("share-1");
    calls.order = null;
    await expect(appRouter.createCaller(ctx({ id: 1, role: "admin" } as TrpcContext["user"])).installationEstimates.forOrderConfirmation(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
