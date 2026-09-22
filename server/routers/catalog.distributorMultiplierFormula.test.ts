import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");

describe("catalog distributor multiplier landed-cost formula", () => {
  it("applies tariff over rounded core cost rather than adding it to list cost", () => {
    expect(source).toContain("landedCostMultiplier(base, freight)");
    expect(source).toContain("ROUND(ROUND(${distributorSkus.listPrice} * ${base}, 2) * (1 + ${freight}), 2)");
    expect(source).not.toContain("const mult = Math.round((base + freight) * 10000) / 10000");
  });

  it("keeps the tariff rate alongside the saved multiplier inputs", () => {
    expect(source).toContain("tariffRate: String(freight)");
    expect(source).toContain("list × 0.23 × 1.07");
  });
});
