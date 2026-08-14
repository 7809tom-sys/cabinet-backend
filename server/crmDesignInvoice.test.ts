import { describe, expect, it } from "vitest";
import { groupedDesignInvoiceMaterials } from "./crmDesignInvoice";

describe("groupedDesignInvoiceMaterials", () => {
  it("groups saved cabinet materials and excludes incomplete non-cabinet placement data", () => {
    expect(groupedDesignInvoiceMaterials([
      { cabinetId: 14, masterCode: "B24", description: "24 in Base Cabinet", styleId: 2 },
      { cabinetId: 14, masterCode: "B24", description: "24 in Base Cabinet", styleId: 2 },
      { cabinetId: 22, masterCode: "W30", description: "30 in Wall Cabinet" },
      { masterCode: "RANGE-30", description: "Range" },
    ])).toEqual([
      { description: "24 in Base Cabinet", quantity: 2 },
      { description: "30 in Wall Cabinet", quantity: 1 },
    ]);
  });
});
