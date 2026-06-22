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

// The family-first shopping experience: a door style IS the product line, and
// its page must list EVERY cabinet available in that style (base/wall/tall/
// vanity/accessory together), each priced in that style.
describe("doorStyles.familyCatalog — family-first catalog", () => {
  it("returns a populated, multi-category cabinet list for a real door style", async () => {
    const caller = appRouter.createCaller(publicCtx());

    // Grab the first active door style from the live list.
    const styles = await caller.doorStyles.list();
    expect(styles.length).toBeGreaterThan(0);
    const style = styles[0];

    const result = await caller.doorStyles.familyCatalog({ styleId: style.id });

    // The page header data must come back.
    expect(result.style).not.toBeNull();
    expect(result.style.id).toBe(style.id);

    // A family should be richly populated (not "empty under the family").
    expect(result.items.length).toBeGreaterThan(20);

    // Items span more than one buyer-facing category (it's a whole kitchen).
    const cats = new Set(result.items.map((i) => i.category));
    expect(cats.size).toBeGreaterThan(1);

    // Every item is collapsed to a single priced row with the fields the UI needs.
    for (const item of result.items.slice(0, 25)) {
      expect(item.cabinetId).toBeGreaterThan(0);
      expect(item.masterCode).toBeTruthy();
      // A price must be present (contractor or wholesale) so the card can show one.
      const price = Number(item.contractorPrice ?? item.wholesalePrice ?? 0);
      expect(price).toBeGreaterThan(0);
    }

    // No duplicate cabinets — one row per cabinet in the family.
    const ids = result.items.map((i) => i.cabinetId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a door style by its style code for the /family/:styleCode route", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const styles = await caller.doorStyles.list();
    const withCode = styles.find((s) => !!s.styleCode);
    expect(withCode).toBeTruthy();

    const found = await caller.doorStyles.byCode({ styleCode: withCode!.styleCode });
    expect(found).not.toBeNull();
    expect(found!.styleCode).toBe(withCode!.styleCode);
  });

  it("returns null for an unknown style code instead of throwing", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const missing = await caller.doorStyles.byCode({ styleCode: "__NOPE__" });
    expect(missing).toBeNull();
  });
});
