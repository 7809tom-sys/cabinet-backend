import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function affiliateOwnerCtx(): TrpcContext {
  return {
    user: {
      id: 99999,
      openId: "wfr2442-price-regression-affiliate",
      name: "Affiliate Price Regression",
      email: "firstclassfcd@yahoo.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Designer legacy price aliases against live catalog data", () => {
  it("prices WFR2442 through canonical W-24-42 for Aero Blanc without leaking W-30-36 MSRP", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());

    const [canonical] = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: 9390128, styleId: 330002 }],
      distributorId: 210001,
    });
    const [legacy] = await caller.design.priceForCartItems({
      items: [{ masterCode: "WFR2442", styleId: 330002, distributorId: 210001 }],
    });

    expect(canonical).toMatchObject({ cabinetId: 9390128, styleId: 330002, homeownerPrice: "265.06" });
    expect(legacy).toMatchObject({
      masterCode: "WFR2442",
      styleId: 330002,
      distributorId: 210001,
      listPrice: "422.73",
      homeownerPrice: "265.06",
    });
    expect(legacy?.listPrice).not.toBe("408.87");
  });

  it("uses the same canonical alias in the owner-only affiliate Designer price list", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(affiliateOwnerCtx());

    const result = await caller.design.affiliateDesignPriceList({
      affiliateSlug: "firstclass",
      items: [{ masterCode: "WFR2442", styleId: 330002, quantity: 1 }],
    });

    expect(result.items[0]).toMatchObject({
      masterCode: "WFR2442",
      styleId: 330002,
      quantity: 1,
      customerUnitPrice: 265.06,
    });
    expect(result.items[0]?.customerUnitPrice).not.toBe(408.87);
  });
});
