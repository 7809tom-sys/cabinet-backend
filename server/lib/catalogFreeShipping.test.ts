import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEMPORARY_ONE_DOLLAR_TEST_SKU } from "../../shared/temporaryCheckoutTest";
import { catalogFreeShippingIndexFromRows, isCatalogFreeShippingIdentity } from "../../shared/freeShippingItem";

const ordersSource = readFileSync(new URL("../routers/orders.ts", import.meta.url), "utf8");
const freightSource = readFileSync(new URL("../routers/freight.ts", import.meta.url), "utf8");

describe("catalog free shipping freight exemption", () => {
  const index = catalogFreeShippingIndexFromRows([
    { id: 42, masterCode: "B24", freeShipping: true },
  ]);

  it("does not treat the temporary payment SKU as a catalog free-shipping item", () => {
    expect(isCatalogFreeShippingIdentity({
      cabinetId: 1,
      masterCode: TEMPORARY_ONE_DOLLAR_TEST_SKU,
    }, index)).toBe(false);
    expect(isCatalogFreeShippingIdentity({ cabinetId: 42, masterCode: "B24" }, index)).toBe(true);
  });

  it("keeps the temporary payment exception and authorizes catalog free shipping from the cabinet master", () => {
    expect(ordersSource).toContain("isTemporaryOneDollarFreeShippingOrder(normalizedLines)");
    expect(ordersSource).toContain('deliveryMethod === "ship" && nonHardwareOrderLines.length > 0 && hasOnlyTemporaryFreeShippingItems');
    expect(ordersSource).toContain("loadCatalogFreeShippingIndex(db, nonHardwareOrderLines)");
    expect(ordersSource).toContain("linesThatNeedACarrierQuote.length === 0");
    expect(ordersSource).toContain("quotedMerchandiseCents");
    expect(ordersSource).toContain('message: "Request a current shipping quote before submitting this order."');
    expect(freightSource).toContain("loadCatalogFreeShippingIndex");
    expect(freightSource).toContain('label: "Free shipping"');
  });
});
