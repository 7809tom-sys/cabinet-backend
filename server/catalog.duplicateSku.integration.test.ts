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

  it("merges BA-24 and BEC24 aliases into one canonical BEC-24 catalog card", async () => {
    const caller = appRouter.createCaller({} as any);
    const family = await caller.doorStyles.familyCatalog({ styleId: 330005 });
    const endCabinets = family.items.filter((item) => ["BA-24", "BEC-24"].includes(item.masterCode));

    expect(endCabinets).toHaveLength(1);
    expect(endCabinets[0]).toEqual(expect.objectContaining({
      id: 9390014,
      cabinetId: 9390014,
      masterCode: "BEC-24",
      description: '24" Base End Cabinet — 45° Angled Front',
    }));

    const canonical = await caller.cabinets.byCode({ masterCode: "BEC-24" });
    const alias = await caller.cabinets.byCode({ masterCode: "BA-24" });
    const noDashAlias = await caller.cabinets.byCode({ masterCode: "BEC24" });
    expect(canonical).toEqual(expect.objectContaining({ id: 9390014, masterCode: "BEC-24" }));
    expect(alias).toEqual(expect.objectContaining({ id: 9390014, masterCode: "BEC-24" }));
    expect(noDashAlias).toEqual(expect.objectContaining({ id: 9390014, masterCode: "BEC-24" }));
    expect(alias).toEqual(canonical);
    expect(noDashAlias).toEqual(canonical);
  });
});
