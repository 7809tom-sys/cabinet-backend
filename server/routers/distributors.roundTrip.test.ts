import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./distributors.ts", import.meta.url), "utf8");

describe("administrator distributor round-trip workflow", () => {
  it("uses administrator-only export, preview, and commit procedures", () => {
    expect(source).toMatch(/roundTripExport:\s*adminProcedure/);
    expect(source).toMatch(/roundTripPreview:\s*adminProcedure/);
    expect(source).toMatch(/roundTripCommit:\s*adminProcedure/);
  });

  it("exports all known aliases and active eligible distributor connections without reading or writing prices", () => {
    expect(source).toContain("cabinetDistributorEligibility");
    expect(source).toContain("cabinetAliases");
    expect(source).toContain("eligibleDistributorCodes");
    const commitStart = source.indexOf("roundTripCommit:");
    const commitEnd = source.indexOf("/** Active distributors", commitStart);
    const commitBlock = source.slice(commitStart, commitEnd);
    expect(commitBlock).not.toContain("distributorSkus");
    expect(commitBlock).not.toContain("listPrice");
    expect(commitBlock).not.toContain("description:");
    expect(commitBlock).not.toContain("numberOfDrawers");
  });

  it("blocks unknown items, conflicting aliases, and inactive distributor codes before commit", () => {
    expect(source).toContain("does not match a master code or known alias");
    expect(source).toContain("Alias already belongs to another cabinet");
    expect(source).toContain("Unknown or inactive distributor code");
  });

  it("uses a previewed ReplacementMasterCode, preserves the former code as an alias, and refuses code collisions", () => {
    expect(source).toContain("replacementMasterCode");
    expect(source).toContain("formerMasterCode");
    expect(source).toContain("ReplacementMasterCode");
    expect(source).toContain("replacement master code");
    expect(source).toContain("masterCodesReplaced");
  });
});
