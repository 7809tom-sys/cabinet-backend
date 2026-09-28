import { describe, expect, it } from "vitest";
import { freightItemsHash } from "../_core/freightQuoteToken";
import { TEMPORARY_ONE_DOLLAR_TEST_SKU } from "@shared/temporaryCheckoutTest";
import { freightQuoteItemsForOrder } from "./freightQuoteOrderIdentity";

describe("freightQuoteItemsForOrder", () => {
  const cabinetLine = {
    cabinetId: 9360024,
    masterCode: "W-1230",
    styleId: 330005,
    distributorId: 210001,
    qty: 2,
  };

  it("preserves the selected distributor identity signed by the freight quote", () => {
    const quoteItems = freightQuoteItemsForOrder([cabinetLine]);

    expect(quoteItems).toEqual([cabinetLine]);
    expect(freightItemsHash(quoteItems)).not.toBe(
      freightItemsHash([{ ...cabinetLine, distributorId: null }]),
    );
  });

  it("keeps ordinary cabinet freight lines while excluding surface and temporary test lines", () => {
    const quoteItems = freightQuoteItemsForOrder([
      cabinetLine,
      {
        cabinetId: null,
        masterCode: "PEL-38",
        styleId: null,
        distributorId: null,
        productKind: "surface" as const,
        qty: 1,
      },
      {
        cabinetId: 1,
        masterCode: TEMPORARY_ONE_DOLLAR_TEST_SKU,
        styleId: 330005,
        distributorId: 210001,
        qty: 1,
      },
    ]);

    expect(quoteItems).toEqual([cabinetLine]);
  });
});
