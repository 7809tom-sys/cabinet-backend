import { describe, expect, it } from "vitest";
import { sellPriceForTier } from "@shared/margins";
import { selectExactCartPriceRows } from "./cartPriceSelection";

const settings = {
  homeownerMarkupBps: 16500,
  contractorMarkupBps: 12900,
  wholesaleMarkupBps: 12500,
};

const ownerSupplied = [
  ["UNIV-ROT15", 40.16, 50.20, 51.81, 66.26],
  ["UNIV-ROT18", 44.52, 55.65, 57.43, 73.46],
  ["UNIV-ROT21", 46.27, 57.84, 59.69, 76.35],
  ["UNIV-ROT24", 48.42, 60.53, 62.46, 79.89],
  ["UNIV-ROT27", 52.00, 65.00, 67.08, 85.80],
  ["UNIV-ROT30", 56.40, 70.50, 72.76, 93.06],
  ["UNIV-ROT33", 61.37, 76.71, 79.17, 101.26],
  ["UNIV-ROT36", 65.24, 81.55, 84.16, 107.65],
] as const;

describe("Clark & Son universal rollout pricing", () => {
  it.each(ownerSupplied)("derives %s tiers once from the authoritative supplier cost", (masterCode, cost, wholesale, contractor, homeowner) => {
    const row = { masterCode, styleId: 330002, distributorId: 210001, yourCost: cost };
    expect(sellPriceForTier(row, settings, "wholesale")).toBe(wholesale);
    expect(sellPriceForTier(row, settings, "contractor")).toBe(contractor);
    expect(sellPriceForTier(row, settings, "homeowner")).toBe(homeowner);
  });

  it("keeps the selected Clark & Son distributor even when another supplier has a cheaper same-code row", () => {
    const rows = [
      { masterCode: "UNIV-ROT18", styleId: 330002, distributorId: 210001, yourCost: 44.52 },
      { masterCode: "UNIV-ROT18", styleId: 330002, distributorId: 999999, yourCost: 1 },
    ];
    const selected = selectExactCartPriceRows([
      { masterCode: "UNIV-ROT18", styleId: 330002, distributorId: 210001 },
    ], rows, settings);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.row.distributorId).toBe(210001);
    expect(sellPriceForTier(selected[0]!.row, settings, "homeowner")).toBe(73.46);
  });

  it("retains the cheapest fallback only for legacy cart lines with no distributor identity", () => {
    const rows = [
      { masterCode: "UNIV-ROT18", styleId: 330002, distributorId: 210001, yourCost: 44.52 },
      { masterCode: "UNIV-ROT18", styleId: 330002, distributorId: 999999, yourCost: 40 },
    ];
    const selected = selectExactCartPriceRows([
      { masterCode: "UNIV-ROT18", styleId: 330002, distributorId: null },
    ], rows, settings);

    expect(selected[0]?.row.distributorId).toBe(999999);
  });
});
