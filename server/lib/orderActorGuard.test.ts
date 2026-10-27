import { describe, expect, it } from "vitest";
import { canActAsOrderOwner, canConfirmOrder, readOrderAccessToken } from "./orderActorGuard";

const order = {
  id: 5,
  userId: 9,
  stripeSessionId: "cs_test",
  stripePaymentIntentId: null,
  paidAt: new Date("2026-01-01T00:00:00Z"),
  originatorEmail: "buyer@example.com",
};

describe("order actor guard", () => {
  it("lets an admin or a paid Stripe session confirm, and refuses the public and the owner alone", async () => {
    await expect(canConfirmOrder({ id: 1, role: "admin" }, order, {}, undefined)).resolves.toBe(true);
    await expect(canConfirmOrder(null, order, { stripeSessionId: "cs_test" }, undefined)).resolves.toBe(true);
    await expect(canConfirmOrder(null, order, {}, undefined)).resolves.toBe(false);
    await expect(canConfirmOrder({ id: 9, role: "user" }, order, {}, undefined)).resolves.toBe(false);
    await expect(canConfirmOrder({ id: 9, role: "user" }, order, { accessToken: "token-1" }, "token-1")).resolves.toBe(true);
    await expect(canConfirmOrder({ id: 4, role: "user" }, order, { accessToken: "token-1" }, "token-1")).resolves.toBe(false);
  });

  it("lets the signed-in owner charge or view an estimate, and requires the access token when one is stored", () => {
    expect(canActAsOrderOwner({ id: 1, role: "admin" }, order, undefined, "token-1")).toBe(true);
    expect(canActAsOrderOwner({ id: 9, role: "user" }, order, undefined, undefined)).toBe(true);
    expect(canActAsOrderOwner({ id: 9, role: "user" }, order, undefined, null)).toBe(true);
    expect(canActAsOrderOwner({ id: 9, role: "user" }, order, "token-1", "token-1")).toBe(true);
    expect(canActAsOrderOwner({ id: 9, role: "user" }, order, undefined, "token-1")).toBe(false);
    expect(canActAsOrderOwner({ id: 4, role: "user" }, order, "token-1", "token-1")).toBe(false);
    expect(canActAsOrderOwner(null, order, "token-1", "token-1")).toBe(false);
  });

  it("treats a missing access-token column as unavailable", async () => {
    const db = { execute: async () => { throw new Error("Unknown column 'accessToken' in 'field list'"); } };
    await expect(readOrderAccessToken(db, 5)).resolves.toBeUndefined();
  });
});
