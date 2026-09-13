import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveTierPrice } from "@shared/pricingTier";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer verified price fallback", () => {
  it("keeps an absent authorized tier price pending rather than treating it as a zero-dollar sale", () => {
    expect(resolveTierPrice("homeowner", {
      homeownerPrice: null,
      adjustedListPrice: null,
      listPrice: null,
    })).toBeNull();
    expect(source).toContain("return resolveTierPrice(DESIGN_TIER_TO_SHARED[tier], row);");
    expect(source).toContain("if (price != null) m.set(`${r.cabinetId}:${r.styleId}`, price);");
  });

  it("does not create a buyable trim or smart-gap price when its verified price is absent", () => {
    expect(source).toContain("if (unitPrice == null) return;");
    expect(source).toContain("return price == null ? [] : [[row.cabinetId, price] as const];");
  });
});
