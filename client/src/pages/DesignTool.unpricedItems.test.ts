import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("regular Designer priced-item rule", () => {
  it("removes legacy unpriced catalog placements after the authoritative lookup", () => {
    expect(source).toContain("unpriced catalog item");
    expect(source).toContain("item.cabinetId <= 0 || !missingPriceUids.has(item.uid)");
    expect(source).toContain("if (!priceRowsFetched || priceRowsFetching || missingPriceUids.size === 0) return;");
  });

  it("does not add quote-only trim, countertop, or hardware cart lines", () => {
    const cartBlock = source.slice(source.indexOf("const cartableLines"), source.indexOf("// The designer total"));
    expect(cartBlock).not.toContain("COUNTERTOP-QUOTE");
    expect(cartBlock).not.toContain("(quote)");
    expect(cartBlock).not.toContain("unitPrice: null");
  });

  it("does not add blank-price supplements to Materials & Parts", () => {
    const supplementBlock = source.slice(source.indexOf("const materialsListSupplements"), source.indexOf("const materialsListRows"));
    expect(supplementBlock).not.toContain("unitPrice: null");
    expect(supplementBlock).not.toContain("/ quote");
    expect(supplementBlock).not.toContain("COUNTERTOP-QUOTE");
    expect(supplementBlock).not.toContain("SINK-");
  });
});
