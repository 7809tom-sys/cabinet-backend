import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasConfirmedLandedCostRule } from "./lib/distributorCostMultiplier";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const dist = read("server/routers/distributors.ts");
const cat = read("server/routers/catalog.ts");
const body = (src: string, start: string, end: string) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));

describe("distributor import recalculates tier prices when it finishes", () => {
  it("importCommit recalculates before returning", () => {
    const b = body(dist, "importCommit: adminProcedure", "// ─── Quick-create helpers");
    expect(b).toContain("await recalculateStoredTierPrices()");
    expect(b.indexOf("await recalculateStoredTierPrices()")).toBeLessThan(b.indexOf("return { created, updated, priced, skipped, recalculation, designerEligibility }"));
  });
  it("importWithMapping recalculates on a real run only", () => {
    const b = body(dist, "importWithMapping: adminProcedure", "dryRun: input.dryRun ?? false,");
    expect(b).toContain("input.dryRun ? null : await recalculateStoredTierPrices()");
  });
});

describe("placeholder multiplier no longer blocks cost edits", () => {
  it("identity 1.0 / 0 is a placeholder; a real rule still locks", () => {
    expect(hasConfirmedLandedCostRule(1, 0)).toBe(false);
    expect(hasConfirmedLandedCostRule(0, 0)).toBe(false);
    expect(hasConfirmedLandedCostRule(NaN, 0)).toBe(false);
    expect(hasConfirmedLandedCostRule(0.23, 0.07)).toBe(true);
    expect(hasConfirmedLandedCostRule(1, 0.07)).toBe(true);
    expect(hasConfirmedLandedCostRule(0.5, 0)).toBe(true);
  });
  it("catalog.updateSkuPrice uses the helper", () => {
    expect(cat).toContain("const hasLandedCostRule = hasConfirmedLandedCostRule(base, freight);");
  });
});
