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

	it("keeps the source-backed 3DB12 master and its formatted alias on one live detail route", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const canonical = await caller.cabinets.byCode({ masterCode: "3DB12" });
	  const formattedAlias = await caller.cabinets.byCode({ masterCode: "3-DB12" });

	  expect(canonical).toEqual(expect.objectContaining({
	    id: 9360024,
	    masterCode: "3DB12",
	    description: '12" 3 Drawer Base Cabinet',
	    width: "12.00",
	    height: "34.50",
	    depth: "24.00",
	  }));
	  expect(formattedAlias).toEqual(canonical);
	  await expect(caller.pricing.stylesForCabinet({ cabinetId: canonical!.id })).resolves.toEqual(
	    expect.arrayContaining([expect.objectContaining({ homeownerPrice: expect.any(String) })]),
	  );
	});

  it("keeps the source-backed 3DB21 master and its formatted alias on one live detail route", async () => {
    const caller = appRouter.createCaller({} as any);
    const canonical = await caller.cabinets.byCode({ masterCode: "3DB21" });
	  const formattedAlias = await caller.cabinets.byCode({ masterCode: "3-DB21" });

	  expect(canonical).toEqual(expect.objectContaining({
	    id: 9360027,
	    masterCode: "3DB21",
	    description: '21" Three Drawer Base Cabinet',
	    width: "21.00",
	    height: "34.50",
	    depth: "24.00",
	  }));
	  expect(formattedAlias).toEqual(canonical);
    await expect(caller.pricing.stylesForCabinet({ cabinetId: canonical!.id })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ homeownerPrice: expect.any(String) })]),
    );
  });

  it("uses each source-backed three-drawer master as the exact family-card detail target", async () => {
    const caller = appRouter.createCaller({} as any);
    const family = await caller.doorStyles.familyCatalog({ styleId: 330005 });
    const threeDrawerCards = family.items.filter((item) => ["3DB12", "3DB21"].includes(item.masterCode));

    expect(threeDrawerCards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 9360024, cabinetId: 9360024, masterCode: "3DB12" }),
      expect.objectContaining({ id: 9360027, cabinetId: 9360027, masterCode: "3DB21" }),
    ]));
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

	it("keeps every source-backed canonical self-alias reachable", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const activeCodes = ["B12", "B15", "B18", "B21", "3DB12", "3DB21", "U188424", "U189624"];
	  const resolved = await Promise.all(activeCodes.map((masterCode) => caller.cabinets.byCode({ masterCode })));

	  expect(resolved.map((cabinet) => cabinet?.masterCode)).toEqual(activeCodes);
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
