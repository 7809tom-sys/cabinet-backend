import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./freight.ts", import.meta.url), "utf8");

describe("freight distributor shipping overlay", () => {
  it("uses distributor warehouse origins when a style has none", () => {
    expect(source).toContain("distributorWarehouseZips: distributors.warehouseZips");
    expect(source).toContain("const originZips = styleOriginZips.length > 0 ? styleOriginZips : distributorOriginZips");
  });

  it("uses an explicit distributor fixed or threshold rule before a carrier call", () => {
    expect(source).toContain("resolveDistributorShippingRule");
    expect(source).toContain("if (group.distributorRuleFeeCents != null)");
    expect(source).toContain('source: "plan_b"');
    expect(source).toContain("Distributor free-freight threshold");
  });
});
