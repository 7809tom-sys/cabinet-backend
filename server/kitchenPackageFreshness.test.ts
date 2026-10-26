import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pricing = readFileSync(new URL("./routers/priceShop.ts", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../client/src/pages/BundleDeals.tsx", import.meta.url), "utf8");

describe("Kitchen Package freshness safeguards", () => {
  it("marks a package for refresh when its saved price differs from the current code-resolved BOM", () => {
    expect(pricing).toContain('"needs_refresh"');
    expect(pricing).toContain("Number(savedHomeownerPrice) !== Number(currentHomeownerPrice)");
  });

  it("refuses loading stale or incomplete packages into checkout", () => {
    expect(pricing).toContain("needs the affiliate to refresh its price or SKU mapping before checkout");
    expect(pricing).toContain('pricedBundle.currentPriceStatus !== "current"');
  });

  it("shows a refresh state and disables the white-label storefront action", () => {
    expect(storefront).toContain("Needs affiliate refresh");
    expect(storefront).toContain('bundle.currentPriceStatus !== "current"');
    expect(storefront).toContain("Temporarily unavailable");
  });
});
