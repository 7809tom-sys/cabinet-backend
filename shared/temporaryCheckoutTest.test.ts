import { describe, expect, it } from "vitest";
import {
  isTemporaryOneDollarCheckoutTestItem,
  isTemporaryOneDollarFreeShippingOrder,
  TEMPORARY_ONE_DOLLAR_TEST_SKU,
} from "./temporaryCheckoutTest";

describe("temporary one-dollar checkout test item", () => {
  it("recognizes only the published one-dollar smoke-test SKU", () => {
    expect(isTemporaryOneDollarCheckoutTestItem({ masterCode: TEMPORARY_ONE_DOLLAR_TEST_SKU })).toBe(true);
    expect(isTemporaryOneDollarCheckoutTestItem({ rawCode: TEMPORARY_ONE_DOLLAR_TEST_SKU.toLowerCase() })).toBe(true);
    expect(isTemporaryOneDollarCheckoutTestItem({ masterCode: "TEST-ONE-DOLLAR-OTHER" })).toBe(false);
    expect(isTemporaryOneDollarCheckoutTestItem({ masterCode: "B-24" })).toBe(false);
  });

  it("permits the exemption only when every line is the temporary test item", () => {
    expect(isTemporaryOneDollarFreeShippingOrder([{ masterCode: TEMPORARY_ONE_DOLLAR_TEST_SKU }])).toBe(true);
    expect(isTemporaryOneDollarFreeShippingOrder([
      { masterCode: TEMPORARY_ONE_DOLLAR_TEST_SKU },
      { masterCode: "B-24" },
    ])).toBe(false);
    expect(isTemporaryOneDollarFreeShippingOrder([])).toBe(false);
  });
});
