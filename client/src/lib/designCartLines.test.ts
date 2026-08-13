import { describe, expect, it } from "vitest";
import { buildDesignCabinetCartLines, calculateCartSubtotal } from "./designCartLines";
import type { PlacedCabinet } from "@/lib/design";

const bec = {
  uid: "bec-one",
  cabinetId: 9450022,
  masterCode: "BEC-24",
  description: '24" Base End Angle Cabinet',
  category: "Base",
  placement: "base",
  x: 0,
  y: 0,
  width: 24,
  depth: 24,
  rotation: 0,
} as PlacedCabinet;

describe("designer cabinet cart lines", () => {
  it("preserves the verified BA-24 source unit price and total for BEC-24", () => {
    const verifiedAshfordPrice = 365.95;
    const lines = buildDesignCabinetCartLines({
      placed: [bec, { ...bec, uid: "bec-two", x: 24 }],
      styleId: 330001,
      distributorId: 210001,
      tier: "homeowner",
      styleNameById: new Map([[330001, "Ashford Style"]]),
      unitPriceFor: () => verifiedAshfordPrice,
    });

    expect(lines).toEqual([
      expect.objectContaining({
        masterCode: "BEC-24",
        distributorId: 210001,
        styleId: 330001,
        unitPrice: verifiedAshfordPrice,
        qty: 2,
      }),
    ]);
    expect(calculateCartSubtotal(lines)).toBe(731.9);
  });
});
