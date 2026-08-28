import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterDistributorRoundTripPreviewRows, type DistributorRoundTripPreview } from "./DistributorRoundTripTransfer";

const source = readFileSync(new URL("./DistributorRoundTripTransfer.tsx", import.meta.url), "utf8");

describe("DistributorRoundTripTransfer", () => {
  it("offers downloadable and uploadable CSV actions with a preview before import", () => {
    expect(source).toContain("Download connections CSV");
    expect(source).toContain("Upload connections CSV");
    expect(source).toContain("Preview changes");
    expect(source).toContain("Import aliases & eligible distributors");
  });

  it("explains that the connection workflow cannot update pricing or product visibility", () => {
    expect(source).toContain("never changes prices, door styles, sellable SKUs, availability, or publication status");
  });

  it("explains the explicit master-code replacement field and shows its preview count", () => {
    expect(source).toContain("ReplacementMasterCode");
    expect(source).toContain("master codes to replace");
  });

  it("filters the visible review table by uploaded code, resolved code, replacement, alias, or eligible distributor without changing full validation data", () => {
    const rows: DistributorRoundTripPreview["rows"] = [
      { rowNumber: 2, itemCode: "B-24", resolvedMasterCode: "B-24", replacementMasterCode: "B-24-NEW", replacesMasterCode: true, aliases: ["BASE24", "B24"], eligibleDistributorCodes: ["PRESTON"], aliasesToAdd: 0, distributorLinksToAdd: 0, errors: [] },
      { rowNumber: 3, itemCode: "W-30", resolvedMasterCode: "W-30", replacementMasterCode: null, replacesMasterCode: false, aliases: ["WALL30"], eligibleDistributorCodes: ["ASHFORD"], aliasesToAdd: 0, distributorLinksToAdd: 0, errors: ["Inactive distributor"] },
    ];
    expect(filterDistributorRoundTripPreviewRows(rows, "base24")).toEqual([rows[0]]);
    expect(filterDistributorRoundTripPreviewRows(rows, "ashford")).toEqual([rows[1]]);
    expect(filterDistributorRoundTripPreviewRows(rows, "B-24-new")).toEqual([rows[0]]);
    expect(filterDistributorRoundTripPreviewRows(rows, "not-found")).toEqual([]);
    expect(rows.some((row) => row.errors.length)).toBe(true);
  });

  it("renders an accessible search input, visible-versus-total count, table, and no-results message before the same import action", () => {
    expect(source).toContain('htmlFor="distributor-preview-search"');
    expect(source).toContain("Item code, master code, alias, or distributor");
    expect(source).toContain("visiblePreviewRows.length");
    expect(source).toContain('aria-label="Distributor connection upload preview"');
    expect(source).toContain("No uploaded rows match");
    expect(source).toContain("hasBlockingErrors");
  });
});
