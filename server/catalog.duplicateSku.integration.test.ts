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
	      description: '12"x 30" Single Door Wall Cabinet with 2 Adjustable Shelves',
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

  it("resolves 3DB12 as the legacy alias of canonical 3-DB12", async () => {
    const caller = appRouter.createCaller({} as any);
    const canonical = await caller.cabinets.byCode({ masterCode: "3-DB12" });
    const alias = await caller.cabinets.byCode({ masterCode: "3DB12" });

    expect(canonical).toEqual(expect.objectContaining({ id: 9390028, masterCode: "3-DB12" }));
    expect(alias).toEqual(canonical);

    const styles = await caller.pricing.stylesForCabinet({ cabinetId: canonical!.id });
    expect(styles.length).toBeGreaterThan(0);
  });

	it("resolves 3DB21 as the explicit alias of canonical master 3-DB21", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const canonical = await caller.cabinets.byCode({ masterCode: "3-DB21" });
    const alias = await caller.cabinets.byCode({ masterCode: "3DB21" });

    expect(canonical).toEqual(expect.objectContaining({ id: 9390031, masterCode: "3-DB21" }));
	  expect(alias).toEqual(canonical);
	});

	it("resolves W2430 to the canonical W-24-30 record without moving supplier price rows", async () => {
	  const caller = appRouter.createCaller({} as any);
	  const canonical = await caller.cabinets.byCode({ masterCode: "W-24-30" });
	  const alias = await caller.cabinets.byCode({ masterCode: "W2430" });

	  expect(canonical).toEqual(expect.objectContaining({
	    id: 9390126,
	    masterCode: "W-24-30",
	  }));
	  expect(alias).toEqual(canonical);

	  const styles = await caller.pricing.stylesForCabinet({ cabinetId: canonical!.id });
	  expect(styles.length).toBeGreaterThan(0);
	});

	it("keeps duplicate legacy codes separate from an existing canonical master during an attempted rename", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "admin" } } as any);

    await expect(caller.cabinets.adminUpdateCabinet({
      id: 9360025,
      masterCode: "3-DB15",
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Master Alias"),
    });
  });
});
