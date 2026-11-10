import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CabinetDetail.tsx", import.meta.url), "utf8");

describe("CabinetDetail description priority", () => {
  it("presents Cabinetdealz copy before the supplier description and derives public SEO copy from that choice", () => {
    const display = source.indexOf("const displayedDescription = resolveProductPageDescription({");
    const seo = source.indexOf("catalogPublicCopy(displayedDescription, canonicalMasterCode)");
    expect(display).toBeGreaterThan(-1);
    expect(seo).toBeGreaterThan(display);
    expect(source).toContain("distributorDescription: distributorRule?.config?.description");
    expect(source).toContain("masterDescription: masterCabinet?.description");
    expect(source).toContain("supplierDescription: selectedRow?.supplierDescription");
    expect(source).not.toContain("selectedRow?.supplierDescription?.trim() || masterCabinet?.description");
  });

  it("reopens the editor on the saved Cabinetdealz text and still stores that text on the distributor rule", () => {
    expect(source).toContain("setEditDescription(editableDescription)");
    expect(source).toContain("const editableDescription = resolveEditableProductDescription({");
    const save = source.slice(source.indexOf("function buildDistributorConfigRule"), source.indexOf("function submitForSelectedDistributors"));
    expect(save).toContain("description: editDescription.trim() || null");
    expect(save).not.toContain("supplierDescription");
    const submit = source.slice(source.indexOf("function submitForSelectedDistributors"), source.indexOf("const addRow"));
    expect(submit).toContain("config: buildDistributorConfigRule()");
    expect(submit).not.toContain("supplierDescription");
    expect(submit).not.toMatch(/description:\s*editDescription/);
  });
});