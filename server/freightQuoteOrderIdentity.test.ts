import { describe, expect, it } from "vitest";
import { freightQuoteItemsForOrder } from "./lib/freightQuoteOrderIdentity";

describe("freight quote order identity", () => {
  it("includes cabinet and Pelican surface lines in the exact quote hash inputs", () => {
    expect(freightQuoteItemsForOrder([
      {
        cabinetId: 12,
        masterCode: "B15",
        styleId: 4,
        distributorId: 7,
        qty: 2,
      },
      {
        cabinetId: null,
        masterCode: "PEL-88",
        styleId: -88,
        distributorId: null,
        productKind: "surface",
        qty: 1,
      },
    ])).toEqual([
      {
        cabinetId: 12,
        masterCode: "B15",
        styleId: 4,
        distributorId: 7,
        qty: 2,
      },
      {
        cabinetId: null,
        masterCode: "PEL-88",
        styleId: -88,
        distributorId: null,
        qty: 1,
      },
    ]);
  });
});
