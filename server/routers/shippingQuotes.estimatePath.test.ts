import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, notifyOwnerMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  notifyOwnerMock: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../_core/notification", () => ({ notifyOwner: notifyOwnerMock }));

import { appRouter } from "../routers";
import { AWAITING_MANUAL_SHIPPING_QUOTE_STATUS, AWAITING_SHIPPING_ESTIMATE_STATUS } from "../../shared/shippingRules";

const payload = {
  originatorName: "Ada",
  originatorEmail: "ada@example.com",
  originatorPhone: "555-0100",
  deliveryAddress: { line1: "100 Main St", city: "Atlanta", state: "GA", zip: "30301" },
  pendingCategories: ["countertops", "flooring"],
  knownShippingCents: 0,
  pendingLabels: [
    "Countertop shipping outside Florida: quoted separately / pending",
    "Flooring shipping: quoted separately / pending",
  ],
  lineSummary: "2 × Calacatta slab\n15 × Oak plank",
};

function caller() {
  return appRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as never);
}

describe("shipping quote estimate and manual paths", () => {
  let updated: Record<string, unknown> | null;

  beforeEach(() => {
    updated = null;
    notifyOwnerMock.mockReset();
    notifyOwnerMock.mockResolvedValue(true);
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{
              id: 44,
              userId: null,
              originatorEmail: "ada@example.com",
              shippingQuoteStatus: "none",
            }],
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            updated = values;
            return [{ affectedRows: 1 }];
          },
        }),
      }),
    });
  });

  it("emails the owner about an estimate, marks the order, and never calls a real mailer", async () => {
    const result = await caller().shippingQuotes.requestEstimate({
      path: "estimate",
      ...payload,
      orderRequestId: 44,
      requestNumber: "CD-TEST-1",
    });
    expect(result).toMatchObject({ ok: true, emailed: true, status: AWAITING_SHIPPING_ESTIMATE_STATUS, updatedOrder: true });
    expect(notifyOwnerMock).toHaveBeenCalledTimes(1);
    expect(notifyOwnerMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Shipping estimate requested",
    }));
    expect(updated).toMatchObject({
      shippingQuoteStatus: AWAITING_SHIPPING_ESTIMATE_STATUS,
      pendingShippingCategories: "countertops,flooring",
    });
    expect(notifyOwnerMock.mock.calls[0][0].content).toContain("still place or save");
  });

  it("emails the owner about a manual quote and holds that invoice for a team quote", async () => {
    const result = await caller().shippingQuotes.requestManualQuote({
      path: "manual",
      ...payload,
      orderRequestId: 44,
    });
    expect(result.status).toBe(AWAITING_MANUAL_SHIPPING_QUOTE_STATUS);
    expect(notifyOwnerMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Manual shipping quote requested",
    }));
    expect(updated).toMatchObject({
      shippingQuoteStatus: AWAITING_MANUAL_SHIPPING_QUOTE_STATUS,
    });
    expect(notifyOwnerMock.mock.calls[0][0].content).toContain("Do not capture payment");
  });

  it("still emails when no order has been saved yet", async () => {
    const result = await caller().shippingQuotes.requestEstimate({
      path: "estimate",
      ...payload,
    });
    expect(result.updatedOrder).toBe(false);
    expect(result.emailed).toBe(true);
    expect(notifyOwnerMock).toHaveBeenCalledTimes(1);
    expect(updated).toBeNull();
  });
});
