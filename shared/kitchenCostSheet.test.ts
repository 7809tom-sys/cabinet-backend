import { describe, expect, it } from "vitest";
import { createBlankKitchenCostDefaults, KITCHEN_COST_SHEET_DESCRIPTIONS } from "./kitchenCostSheet";

describe("Kitchen Cost Sheet defaults", () => {
  it("keeps the exact 30 PDF rows and starts prices at zero", () => {
    const defaults = createBlankKitchenCostDefaults();
    expect(KITCHEN_COST_SHEET_DESCRIPTIONS).toHaveLength(30);
    expect(defaults).toHaveLength(30);
    expect(defaults[0]).toEqual({ description: "Demo", materialUnitCost: 0, laborUnitCost: 0 });
    expect(defaults.at(-1)?.description).toBe("Glass");
    expect(defaults.every((row) => row.materialUnitCost === 0 && row.laborUnitCost === 0)).toBe(true);
  });
});
