import { describe, expect, it } from "vitest";
import { framelessCatalogPresentation } from "./lib/framelessCatalogPresentation";

const master = { id: 4, masterCode: "B24S", description: '24 inch two-door framed base', width: "24.000", height: "34.500", depth: "24.000", numberOfDoors: 2, numberOfDrawers: 1, graphicType: "base_2door", catalogImageUrl: "/framed.webp", category: "Base" };
const source = { distributorCode: "AEF", supplierDescription: '24" W × 34.75" H × 24" D Single-door base. AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2, p. 21.', overrideImageUrl: "/source-render.webp", skuImageUrl: "/old-pagecrop.png", configJson: JSON.stringify({ height: "34.750", numberOfDoors: 1, numberOfDrawers: 1, graphicType: "base_1door", id: 999, masterCode: "UNRELATED" }) };

describe("frameless catalog presentation", () => {
  it("projects the source's own configuration and professional image without changing identity or shared master", () => {
    const result = framelessCatalogPresentation(master, source);
    expect(result).toMatchObject({ id: 4, masterCode: "B24S", height: "34.750", numberOfDoors: 1, graphicType: "base_1door", catalogImageUrl: "/source-render.webp" });
    expect(result.description).not.toMatch(/Spec Book|AltaEuro|p\. 21/);
    expect(master.numberOfDoors).toBe(2);
    expect(master.catalogImageUrl).toBe("/framed.webp");
  });
  it("leaves every non-AEF supplier untouched", () => {
    expect(framelessCatalogPresentation(master, { ...source, distributorCode: "USCD" })).toBe(master);
    expect(framelessCatalogPresentation(master, { ...source, distributorCode: "UNKNOWN" })).toBe(master);
  });
  it("uses a source SKU image or source-shaped drawing, not unrelated master art", () => {
    expect(framelessCatalogPresentation(master, { ...source, overrideImageUrl: null }).catalogImageUrl).toBe("/old-pagecrop.png");
    expect(framelessCatalogPresentation(master, { ...source, overrideImageUrl: null, skuImageUrl: null }).catalogImageUrl).toBeNull();
  });
});
