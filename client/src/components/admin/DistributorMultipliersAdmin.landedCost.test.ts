import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DistributorMultipliersAdmin.tsx", import.meta.url), "utf8");

describe("DistributorMultipliersAdmin landed-cost formula", () => {
  it("shows tariff as a percentage of base cost rather than a percentage of list", () => {
    expect(source).toContain("(list × Base) × (1 + Tariff)");
    expect(source).toContain("(base ?? 0) * (1 + (freight ?? 0))");
    expect(source).not.toContain("list × (Base + Freight)");
  });
});
