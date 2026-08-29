import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("complete Design materials and parts dialog", () => {
  it("provides a structured priced table with print and CSV export actions", () => {
    const dialogSource = readFileSync(new URL("./DesignMaterialsListDialog.tsx", import.meta.url), "utf8");
    const designToolSource = readFileSync(new URL("../../pages/DesignTool.tsx", import.meta.url), "utf8");

    expect(dialogSource).toContain("Complete Materials & Parts List");
    expect(dialogSource).toContain("Numbered cabinet list");
    expect(dialogSource).toContain("Other materials & parts — alphabetical");
    expect(dialogSource).toContain("> Print");
    expect(dialogSource).toContain("Export CSV");
    expect(dialogSource).toContain("onClick={printList}");
    expect(dialogSource).toContain("onClick={downloadCsv}");
    expect(dialogSource).toContain("flex shrink-0 flex-wrap gap-2");
    expect(dialogSource).toContain("Unit price");
    expect(dialogSource).toContain("Line total");
    expect(dialogSource).toContain("Price pending");
    expect(designToolSource).toContain('title="View, print, or export complete materials & parts list"');
    expect(designToolSource).toContain("buildMaterialsListRows({");
    expect(designToolSource).toContain("<DesignMaterialsListDialog");
  });
});
