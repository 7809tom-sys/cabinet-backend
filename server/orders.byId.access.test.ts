import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { orderRequests, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { orderAccessTokenMatches } from "./lib/orderAccess";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./db", () => ({
  getDb: getDbMock,
  hasPositivePublishedCabinetPrice: () => ({}),
  notInConflict: () => ({}),
}));

import { ordersRouter } from "./routers/orders";

const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORDER = {
  id: 42,
  userId: 7,
  accessToken: TOKEN,
  requestNumber: "CD-TEST-42",
  originatorName: "Ada Lovelace",
  originatorEmail: "ada@example.com",
  originatorPhone: "555-0100",
  shippingAddressLine1: "1 Secret St",
  shippingCity: "London",
  shippingState: "KY",
  zip: "40741",
  lineItems: [
    { masterCode: "B24", description: "Base", qty: 1, matched: true },
  ],
};

function ctx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function user(
  over: Partial<NonNullable<TrpcContext["user"]>> &
    Pick<NonNullable<TrpcContext["user"]>, "id" | "role">
): NonNullable<TrpcContext["user"]> {
  return {
    openId: "open",
    name: "Tester",
    email: "tester@example.com",
    ...over,
  } as NonNullable<TrpcContext["user"]>;
}

function mockDb(options: {
  order?: Record<string, unknown> | null;
  ownerOpenId?: string | null;
}) {
  getDbMock.mockResolvedValue({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === users)
              return options.ownerOpenId
                ? [{ openId: options.ownerOpenId }]
                : [];
            if (table === orderRequests)
              return options.order ? [options.order] : [];
            throw new Error("Unexpected table in orders.byId fake database");
          },
        }),
      }),
    }),
  });
}

async function expectNotFound(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("expected the lookup to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("NOT_FOUND");
    expect((error as TRPCError).code).not.toBe("FORBIDDEN");
    expect((error as TRPCError).message).toBe("Order not found");
  }
}

describe("orderAccessTokenMatches", () => {
  it("accepts only the exact stored token", () => {
    expect(orderAccessTokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(orderAccessTokenMatches(TOKEN, `${TOKEN}x`)).toBe(false);
    expect(orderAccessTokenMatches(TOKEN, "wrong-token")).toBe(false);
    expect(orderAccessTokenMatches(TOKEN, "")).toBe(false);
    expect(orderAccessTokenMatches(null, TOKEN)).toBe(false);
    expect(orderAccessTokenMatches(undefined, undefined)).toBe(false);
  });
});

describe("orders.byId access", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("hides the order from an anonymous caller", async () => {
    mockDb({ order: ORDER, ownerOpenId: "owner-open" });
    const caller = ordersRouter.createCaller(ctx(null));
    await expectNotFound(caller.byId({ id: ORDER.id }));
  });

  it("hides a missing order with the same not-found error", async () => {
    mockDb({ order: null });
    const caller = ordersRouter.createCaller(ctx(null));
    await expectNotFound(caller.byId({ id: 99 }));
  });

  it("hides the order from a different signed-in user", async () => {
    mockDb({ order: ORDER, ownerOpenId: "owner-open" });
    const caller = ordersRouter.createCaller(
      ctx(user({ id: 8, openId: "other-open", role: "user" }))
    );
    await expectNotFound(caller.byId({ id: ORDER.id }));
  });

  it("returns the order to its signed-in owner and to an admin", async () => {
    mockDb({ order: ORDER, ownerOpenId: "owner-open" });
    const owner = ordersRouter.createCaller(
      ctx(user({ id: 7, openId: "owner-open", role: "user" }))
    );
    const owned = await owner.byId({ id: ORDER.id });
    expect(owned?.originatorEmail).toBe("ada@example.com");
    expect(owned?.shippingAddressLine1).toBe("1 Secret St");
    expect(owned).not.toHaveProperty("accessToken");

    const admin = ordersRouter.createCaller(
      ctx(user({ id: 1, openId: "admin-open", role: "admin" }))
    );
    const asAdmin = await admin.byId({
      id: ORDER.id,
      accessToken: "wrong-token",
    });
    expect(asAdmin?.requestNumber).toBe("CD-TEST-42");
    expect(asAdmin).not.toHaveProperty("accessToken");
  });

  it("returns the order when the signed-in openId matches the order user", async () => {
    mockDb({ order: { ...ORDER, userId: 7 }, ownerOpenId: "shared-open" });
    const caller = ordersRouter.createCaller(
      ctx(user({ id: 99, openId: "shared-open", role: "contractor" }))
    );
    const row = await caller.byId({ id: ORDER.id });
    expect(row?.originatorName).toBe("Ada Lovelace");
    expect(row).not.toHaveProperty("accessToken");
  });

  it("accepts the order access token and rejects a wrong token", async () => {
    const guestOrder = { ...ORDER, userId: null };
    mockDb({ order: guestOrder, ownerOpenId: null });
    const anon = ordersRouter.createCaller(ctx(null));

    const withToken = await anon.byId({
      id: guestOrder.id,
      accessToken: TOKEN,
    });
    expect(withToken?.originatorPhone).toBe("555-0100");
    expect(withToken?.lineItems).toEqual(guestOrder.lineItems);
    expect(withToken).not.toHaveProperty("accessToken");

    mockDb({ order: guestOrder, ownerOpenId: null });
    await expectNotFound(
      anon.byId({ id: guestOrder.id, accessToken: "wrong-token" })
    );

    mockDb({ order: guestOrder, ownerOpenId: null });
    const stranger = ordersRouter.createCaller(
      ctx(user({ id: 8, openId: "other-open", role: "user" }))
    );
    await expectNotFound(
      stranger.byId({ id: guestOrder.id, accessToken: "not-the-token" })
    );

    mockDb({ order: guestOrder, ownerOpenId: null });
    const withStrangerToken = await stranger.byId({
      id: guestOrder.id,
      accessToken: TOKEN,
    });
    expect(withStrangerToken?.originatorEmail).toBe("ada@example.com");
  });

  it("does not treat a null token on an older guest order as public", async () => {
    mockDb({
      order: { ...ORDER, userId: null, accessToken: null },
      ownerOpenId: null,
    });
    const anon = ordersRouter.createCaller(ctx(null));
    await expectNotFound(anon.byId({ id: ORDER.id }));
    await expectNotFound(anon.byId({ id: ORDER.id, accessToken: "anything" }));
  });
});
