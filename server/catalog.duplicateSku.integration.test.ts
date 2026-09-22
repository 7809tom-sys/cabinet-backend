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

  it("uses the storefront card's exact cabinet ID to retain the priced canonical W-1230 record", async () => {
    const caller = appRouter.createCaller({} as any);

    const exact = await caller.cabinets.byId({ id: 9390110 });
    const normalizedFallback = await caller.cabinets.byCode({ masterCode: "W-12-30" });

	    expect(exact).toEqual(expect.objectContaining({
	      id: 9390110,
	      masterCode: "W-1230",
	      description: '12" × 30" × 12" Wall Cabinet — 1 Door, 2 Adjustable Shelves',
	    }));
    // A normalized legacy route now resolves to the canonical catalog record
    // whenever an explicit alias mapping exists, rather than reviving a duplicate.
    expect(normalizedFallback?.id).toBe(exact?.id);

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
	      description: '24 in. Base End Cabinet — 45° angled end, 2 operational doors',
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

	it("keeps an unpriced 3DB12 canonical and alias out of public lookup", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const canonical = await caller.cabinets.byCode({ masterCode: "3-DB12" });
	  const alias = await caller.cabinets.byCode({ masterCode: "3DB12" });

	  // The aliases remain in the Admin catalog for configuration, but the
	  // customer-facing lookup must never expose a sellable $0 product.
	  expect(canonical).toBeNull();
	  expect(alias).toBeNull();
	});

	it("keeps an unpriced 3DB21 canonical and alias out of public lookup", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const canonical = await caller.cabinets.byCode({ masterCode: "3-DB21" });
	  const alias = await caller.cabinets.byCode({ masterCode: "3DB21" });

	  expect(canonical).toBeNull();
	  expect(alias).toBeNull();
	});

	it("keeps a priced canonical detail route visible when its own code is retained as a search alias", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const b15 = await caller.cabinets.byCode({ masterCode: "B15" });
	  const dashedB15 = await caller.cabinets.byCode({ masterCode: "B-15" });

	  expect(b15).toEqual(expect.objectContaining({
	    id: 9390003,
	    masterCode: "B15",
	    description: '15" Single Door Single Drawer Base Cabinet with Adjustable Shelf',
	  }));
	  expect(dashedB15).toEqual(b15);
	  const styles = await caller.pricing.stylesForCabinet({ cabinetId: b15!.id });
	  expect(styles.length).toBeGreaterThan(0);
	  expect(styles.some((style) => style.homeownerPrice != null)).toBe(true);
	});

	it("resolves W-24-30 to the canonical W-2430 record without moving supplier price rows", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const canonical = await caller.cabinets.byCode({ masterCode: "W-2430" });
	  const dashedAlias = await caller.cabinets.byCode({ masterCode: "W-24-30" });
	  const alias = await caller.cabinets.byCode({ masterCode: "W2430" });

	  expect(canonical).toEqual(expect.objectContaining({
	    id: 9390126,
	    masterCode: "W-2430",
	  }));
	  expect(dashedAlias).toEqual(canonical);
	  expect(alias).toEqual(canonical);

	  const styles = await caller.pricing.stylesForCabinet({ cabinetId: canonical!.id });
	  expect(styles.length).toBeGreaterThan(0);
	});

	it("resolves verified ADA prefix and suffix codes to one priced canonical cabinet", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const canonical = await caller.cabinets.byCode({ masterCode: "B12ADA" });
	  const prefix = await caller.cabinets.byCode({ masterCode: "ADA-B12" });

	  expect(canonical).toEqual(expect.objectContaining({
	    masterCode: "B12ADA",
	    description: '12 in. ADA Base Cabinet — 1 Door, 1 Drawer',
	  }));
	  expect(prefix).toEqual(canonical);

	  const styles = await caller.pricing.stylesForCabinet({ cabinetId: canonical!.id });
	  expect(styles.length).toBeGreaterThan(0);
	  expect(styles.every((style) => (style.listPrice ?? style.yourCost ?? 0) > 0)).toBe(true);
	});

	it("holds mismatched ADA vanity-drawer positional codes instead of cross-family aliasing them", async () => {
	  const caller = appRouter.createCaller({} as any);
	  await expect(caller.cabinets.byCode({ masterCode: "ADA-3VDB15" })).resolves.toBeNull();
	  await expect(caller.cabinets.byCode({ masterCode: "3VDB15ADA" })).resolves.toBeNull();
	});

	it("resolves the historic three-drawer separator form to the canonical undashed base", async () => {
	    const caller = appRouter.createCaller({} as any);
	    const canonical = await caller.cabinets.byCode({ masterCode: "3DB15" });
	    const historicAlias = await caller.cabinets.byCode({ masterCode: "3-DB15" });

	    expect(canonical).toEqual(expect.objectContaining({ id: 9360025, masterCode: "3DB15" }));
	    expect(historicAlias).toEqual(canonical);
	  });
});
