import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
});
