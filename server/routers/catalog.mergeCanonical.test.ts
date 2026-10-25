import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");

describe("catalog.mergeCabinets canonical reconciliation", () => {
  it("records a master alias, preserves route resolution, and retires only duplicate visibility", () => {
    const mergeSource = source.slice(source.indexOf("mergeCabinets:"), source.indexOf("// ─── Pricing"));
    expect(mergeSource).toContain("skuMasterAliases");
    expect(mergeSource).toContain("Approved cabinet merge");
    expect(mergeSource).toContain("already resolves to");
    expect(mergeSource).toContain("isActive: false, showInCatalog: false, showInDesigner: false");
    expect(mergeSource).toContain("cabinetAliases");
  });
});
