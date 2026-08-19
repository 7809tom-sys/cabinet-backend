import { describe, expect, it } from "vitest";
import { isLockedDesignCheckoutPrice, resolveLockedCheckoutUnitPrice } from "./checkoutPriceLock";

describe("selected design checkout prices", () => {
  it("keeps the selected customer price instead of a later list-price recomputation", () => {
    expect(resolveLockedCheckoutUnitPrice({
      priceLocked: true,
      storedUnitPrice: 324.8,
      recomputedUnitPrice: 469.94,
    })).toBe(324.8);
  });

  it("continues to use live pricing for ordinary catalog-cart items", () => {
    expect(resolveLockedCheckoutUnitPrice({
      priceLocked: false,
      storedUnitPrice: 324.8,
      recomputedUnitPrice: 469.94,
    })).toBe(469.94);
  });

  it("only treats an explicit numeric cart price as a locked design price", () => {
    expect(isLockedDesignCheckoutPrice({ cartPriceLocked: true, cartUnitPrice: 324.8 })).toBe(true);
    expect(isLockedDesignCheckoutPrice({ cartPriceLocked: true, cartUnitPrice: null })).toBe(false);
    expect(isLockedDesignCheckoutPrice({ cartUnitPrice: 324.8 })).toBe(false);
  });
});
