import { describe, expect, it } from "vitest";
import { calculateInstallationEstimate } from "./installationEstimate";

describe("calculateInstallationEstimate", () => {
  it("calculates affiliate installation totals independently from material-order pricing", () => {
    const estimate = calculateInstallationEstimate([
      { description: "Cabinet installation labor", quantity: 2, unitCost: 350 },
      { description: "Remove existing cabinets", quantity: 1, unitCost: 125.5 },
    ], 41.28);

    expect(estimate.lineItems.map((line) => line.lineTotal)).toEqual([700, 125.5]);
    expect(estimate.subtotal).toBe(825.5);
    expect(estimate.totalAmount).toBe(866.78);
  });
});
