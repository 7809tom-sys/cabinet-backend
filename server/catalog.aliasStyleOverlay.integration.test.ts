import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("canonical master with style-specific supplier overlay", () => {
  it("shows a retired B-24 source as canonical B24 while retaining the selected style price", async () => {
    const caller = appRouter.createCaller(publicCtx());
    // Aston Green has a verified, published B-24 supplier source. That
    // source is deliberately retired as a duplicate, while B24 is the active
    // canonical identity shown to shoppers and the Designer.
    const styleId = 390004;

    const family = await caller.doorStyles.familyCatalog({ styleId });
    const familyB24 = family.items.find((item) => item.masterCode === "B24");
    expect(familyB24).toEqual(expect.objectContaining({
      masterCode: "B24",
      cabinetId: 9360006,
      distributorId: expect.any(Number),
    }));
    expect(Number(familyB24?.homeownerPrice ?? familyB24?.listPrice ?? 0)).toBeGreaterThan(0);
    expect(family.items.some((item) => item.masterCode === "B-24")).toBe(false);

    const publicStyleCatalog = await caller.cabinets.listForStyle({ styleId, search: "B-24", limit: 20, offset: 0 });
    expect(publicStyleCatalog.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "B24", id: 9360006 }),
    ]));
    expect(publicStyleCatalog.items.some((item) => item.masterCode === "B-24")).toBe(false);
    expect(publicStyleCatalog.categoryCounts.Base).toBeGreaterThan(0);
    expect(Object.values(publicStyleCatalog.categoryCounts).every((count) => count > 0)).toBe(true);

    // The canonical detail page must still resolve the Aston Green source
    // overlay when a shopper opens the card, not only when browsing the family.
    const detailStyles = await caller.pricing.stylesForCabinet({ cabinetId: 9360006 });
    expect(detailStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ styleId, homeownerPrice: expect.anything() }),
    ]));
    const selectedStyle = detailStyles.find((style) => style.styleId === styleId);
    expect(Number(selectedStyle?.homeownerPrice ?? 0)).toBeGreaterThan(0);

    const lockedStorefront = await caller.storefront.familyCatalog({ styleId, category: "Base", limit: 200 });
    expect(lockedStorefront.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "B24", id: 9360006, platformSku: expect.any(String) }),
    ]));
    expect(lockedStorefront.items.some((item) => item.masterCode === "B-24")).toBe(false);

    const designerBases = await caller.design.placeableCabinets({ placement: "base", styleId });
    expect(designerBases).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "B24", id: 9360006 }),
    ]));
    expect(designerBases.some((item) => item.masterCode === "B-24")).toBe(false);
  });

  it("filters ADA models and applies requested dimension sorting before paging", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const builderGrade = (await caller.doorStyles.list()).find((style) => (
      style.isBuilderGrade || `${style.boxConstruction ?? ""} ${style.hardware ?? ""}`.toLowerCase().includes("builder")
    ));
    expect(builderGrade).toBeDefined();
    if (!builderGrade) return;

    const sorted = await caller.cabinets.listForStyle({
      styleId: builderGrade.id,
      sort: "width-asc",
      limit: 200,
      offset: 0,
    });
    const widths = sorted.items.map((item) => Number(item.width)).filter(Number.isFinite);
    expect(widths.length).toBeGreaterThan(1);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));

    const ada = await caller.cabinets.listForStyle({
      styleId: builderGrade.id,
      adaOnly: true,
      sort: "sku-asc",
      limit: 200,
      offset: 0,
    });
    expect(ada.total).toBeGreaterThan(0);
    expect(ada.items.every((item) => (
      item.masterCode.replace(/[-_\s]/g, "").toUpperCase().startsWith("ADA")
      || `${item.category ?? ""} ${item.subCategory ?? ""} ${item.description ?? ""}`.toLowerCase().includes("ada")
      || `${item.category ?? ""} ${item.subCategory ?? ""} ${item.description ?? ""}`.toLowerCase().includes("accessible")
    ))).toBe(true);
  });
});
