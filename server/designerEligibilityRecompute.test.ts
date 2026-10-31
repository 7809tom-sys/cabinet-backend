import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cabinetCanBeRenderedOrPlacedIn3d } from "../shared/designerEligibility";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const lib = read("server/lib/designerEligibilityRecompute.ts");
const dist = read("server/routers/distributors.ts");
const cat = read("server/routers/catalog.ts");

describe("designerEligible is recomputed for existing masters", () => {
  it("a newly priced B24FH-style base cabinet qualifies; a 0-size or non-cabinet item does not", () => {
    expect(cabinetCanBeRenderedOrPlacedIn3d({ masterCode: "B24FH", description: "Base Full Height Door 24", category: "Base", placementType: "base", width: "24", height: "34.5", depth: "24" })).toBe(true);
    expect(cabinetCanBeRenderedOrPlacedIn3d({ masterCode: "B24FH", category: "Base", width: "24", height: "0", depth: "24" })).toBe(false);
    expect(cabinetCanBeRenderedOrPlacedIn3d({ masterCode: "X", isNotCabinet: true, width: "1", height: "1", depth: "1" })).toBe(false);
  });
  it("helper only promotes false->true for active, designer-visible, positively priced published masters, never demotes", () => {
    expect(lib).toContain("eq(cabinets.designerEligible, false)");
    expect(lib).toContain("hasPositivePublishedCabinetPrice()");
    expect(lib).toContain("eq(cabinets.showInDesigner, true)");
    expect(lib).toContain("cabinetCanBeRenderedOrPlacedIn3d(row)");
    expect(lib).toContain("set({ designerEligible: true })");
    expect(lib).not.toContain("designerEligible: false })");
  });
  it("runs after import, import-with-mapping (real run), supplier go-live, SKU publish and price edit", () => {
    expect((dist.match(/await recomputeDesignerEligibility\(\)/g) ?? []).length).toBe(3);
    expect(dist).toContain("input.dryRun ? null : await recomputeDesignerEligibility()");
    expect(cat).toContain("input.isPublished ? await recomputeDesignerEligibility() : null");
    expect(cat).toContain("recomputeDesignerEligibility({ cabinetIds: [existing.cabinetId] })");
  });
});
