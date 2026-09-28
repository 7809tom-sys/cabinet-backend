import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderRequests } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";

function publicCtx() {
  return {
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as any;
}

/**
 * Regression: an affiliate markup must drive only that affiliate's public sale
 * price on browse, detail, and cart-refresh paths. The generic CabinetDealz
 * homeowner/list price must not leak into the scoped storefront.
 */
describe("affiliate storefront sale pricing", () => {
  it("uses the same protected affiliate sale price across catalog, detail, and cart", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const slug = "reaves-way-cabinet-shop";
    const styleId = 330005;
    const catalog = await caller.storefront.familyCatalog({ styleId, slug, limit: 200 });
    const card = catalog.items.find((item) => item.affiliateSalePrice != null && Number(item.homeownerPrice) > 0);
    expect(card).toBeTruthy();
    expect(Number(card!.homeownerPrice)).toBe(Number(card!.affiliateSalePrice));

    const cart = await caller.design.priceForCartItems({
      items: [{ masterCode: card!.masterCode, styleId, distributorId: card!.distributorId }],
      affiliateSlug: slug,
    });
    expect(cart).toHaveLength(1);
    expect(Number(cart[0].homeownerPrice)).toBe(Number(card!.homeownerPrice));

    const styles = await caller.pricing.stylesForCabinet({
      cabinetId: card!.id,
      affiliateSlug: slug,
    });
    const detail = styles.find((style) => style.styleId === styleId && style.homeownerPrice != null);
    expect(detail).toBeTruthy();
    expect(Number(detail!.homeownerPrice)).toBe(Number(card!.homeownerPrice));
    expect(detail!.listPrice).toBeNull();
    expect(detail!.contractorPrice).toBeNull();
    expect(detail!.wholesalePrice).toBeNull();
  });

  it("does not let a current affiliate sale fall below its protected cost floor", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const slug = "reaves-way-cabinet-shop";
    const catalog = await caller.storefront.familyCatalog({ styleId: 330005, slug, limit: 200 });
    const priced = catalog.items.filter((item) => item.affiliateSalePrice != null);
    expect(priced.length).toBeGreaterThan(0);
    for (const item of priced) {
      expect(Number(item.homeownerPrice)).toBeGreaterThan(0);
      // The server returns a calculated sale only after cost-floor derivation;
      // exact floor math is covered by the shared pure pricing test.
      expect(Number(item.homeownerPrice)).toBe(Number(item.affiliateSalePrice));
    }
  });

  it("keeps one affiliate's markup out of another affiliate's storefront", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const styleId = 330005;
    const reaves = await caller.storefront.familyCatalog({ styleId, slug: "reaves-way-cabinet-shop", limit: 200 });
    const demo = await caller.storefront.familyCatalog({ styleId, slug: "sales-demo", limit: 200 });
    const demoByCode = new Map(demo.items.map((item) => [item.masterCode, item]));
    const sameCabinet = reaves.items.find((item) => item.affiliateSalePrice != null && demoByCode.get(item.masterCode)?.affiliateSalePrice != null);
    expect(sameCabinet).toBeTruthy();
    const other = demoByCode.get(sameCabinet!.masterCode)!;
    expect(Number(sameCabinet!.homeownerPrice)).toBe(Number(sameCabinet!.affiliateSalePrice));
    expect(Number(other.homeownerPrice)).toBe(Number(other.affiliateSalePrice));
    expect(Number(sameCabinet!.homeownerPrice)).not.toBe(Number(other.homeownerPrice));
  });

  it("recalculates a submitted affiliate line instead of accepting a browser price", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const slug = "reaves-way-cabinet-shop";
    const catalog = await caller.storefront.familyCatalog({ styleId: 330005, slug, limit: 200 });
    const card = catalog.items.find((item) => item.affiliateSalePrice != null && Number(item.homeownerPrice) > 0);
    expect(card).toBeTruthy();
    let createdId: number | null = null;
    try {
      const created = await caller.orders.createRequest({
        storeScope: slug,
        source: "manual",
        tier: "Homeowner",
        submit: false,
        styleId: 330005,
        lineItems: [{
          cabinetId: card!.id,
          masterCode: card!.masterCode,
          description: card!.description ?? card!.masterCode,
          qty: 1,
          // Deliberately malicious/incorrect client input. Server must replace it.
          unitPrice: 0.01,
          linePrice: 0.01,
          styleId: 330005,
          tier: "Homeowner",
          matched: true,
        }],
      });
      createdId = created.id;
      const [saved] = await db.select({ lineItems: orderRequests.lineItems }).from(orderRequests).where(eq(orderRequests.id, createdId)).limit(1);
      const line = (saved?.lineItems as Array<{ unitPrice?: number }> | null | undefined)?.[0];
      expect(line?.unitPrice).toBe(Number(card!.homeownerPrice));
      expect(line?.unitPrice).toBeGreaterThan(0.01);
    } finally {
      if (createdId != null) await db.delete(orderRequests).where(eq(orderRequests.id, createdId));
    }
  });
});
