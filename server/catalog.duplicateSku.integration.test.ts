import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("duplicate normalized cabinet codes", () => {
  it("emits the exact priced cabinet ID from the affiliate family catalog", async () => {
    const caller = appRouter.createCaller({} as any);
    const family = await caller.doorStyles.familyCatalog({ styleId: 330005 });
    const card = family.items.find((item) => item.masterCode === "W-1230");

    expect(card).toEqual(expect.objectContaining({
      id: 9390110,
      cabinetId: 9390110,
      masterCode: "W-1230",
    }));
  });

  it("uses the storefront card's exact cabinet ID to retain the priced W-12-30 record", async () => {
    const caller = appRouter.createCaller({} as any);

    const exact = await caller.cabinets.byId({ id: 9390110 });
    const normalizedFallback = await caller.cabinets.byCode({ masterCode: "W-12-30" });

    expect(exact).toEqual(expect.objectContaining({
      id: 9390110,
      masterCode: "W-1230",
      description: '12" Single Door Wall Cabinet with 2 Adjustable Shelves',
    }));
    // A legacy duplicate may win a code-only lookup, which is why the card
    // route must preserve the exact master cabinet ID.
    expect(normalizedFallback?.id).not.toBe(exact?.id);

    const styles = await caller.pricing.stylesForCabinet({
      cabinetId: exact!.id,
      affiliateSlug: "reaves-way-cabinet-shop",
    });
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.some((style) => style.homeownerPrice != null)).toBe(true);
  });
});
