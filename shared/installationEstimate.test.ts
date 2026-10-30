import { describe, expect, it } from "vitest";
import { calculateInstallationEstimate } from "./installationEstimate";

describe("calculateInstallationEstimate", () => {
  it("calculates affiliate installation totals independently from material-order pricing", () => {
    const estimate = calculateInstallationEstimate([
      { description: "Cabinet installation labor", quantity: 2, unitCost: 350, costType: "labor" },
      { description: "Remove existing cabinets", quantity: 1, unitCost: 125.5, costType: "labor" },
    ], 41.28);

    expect(estimate.lineItems.map((line) => line.lineTotal)).toEqual([700, 125.5]);
    expect(estimate.lineItems.map((line) => line.costType)).toEqual(["labor", "labor"]);
    expect(estimate.subtotal).toBe(825.5);
    expect(estimate.totalAmount).toBe(866.78);
  });

  it("adds markup to the installation subtotal without changing the line totals", () => {
    const estimate = calculateInstallationEstimate([
      { description: "Cabinet installation labor", quantity: 1, unitCost: 900, costType: "labor" },
      { description: "Cabinet hardware", quantity: 2, unitCost: 50, costType: "material" },
    ], 0, 15);

    expect(estimate.subtotal).toBe(1000);
    expect(estimate.markupPercent).toBe(15);
    expect(estimate.markupAmount).toBe(150);
    expect(estimate.totalAmount).toBe(1150);
    expect(estimate.lineItems.map((line) => line.costType)).toEqual(["labor", "material"]);
  });

  it("accepts kitchen-plan quantities such as square feet and decimal unit prices", () => {
    expect(calculateInstallationEstimate([{ description: "Counter top", quantity: 12.4, unitCost: 10 }]).lineItems[0].lineTotal).toBe(124);
    expect(calculateInstallationEstimate([{ description: "Demo", quantity: 2, unitCost: 35.75 }]).totalAmount).toBe(71.5);
    expect(() => calculateInstallationEstimate([{ description: "Demo", quantity: 0, unitCost: 500 }]))
      .toThrow("Quantity must be greater than zero");
  });
});
