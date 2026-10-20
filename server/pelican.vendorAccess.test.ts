import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Pelican vendor access", () => {
  const source = readFileSync(resolve(process.cwd(), "server/routers/pelican.ts"), "utf8");

  it("uses the distributor-scoped procedure for vendor catalog and selling controls", () => {
    for (const procedure of ["adminList", "setPopular", "setVisibility", "setPricing", "updateProduct", "setCoverage", "setUnsupportedOverhangLimit", "setMaterialImage"]) {
      expect(source).toContain(`${procedure}: distributorProcedure`);
    }
    expect(source).toContain("requirePelicanVendor(db, ctx)");
    expect(source).toContain('line.code !== "PEL"');
  });

  it("uses the distributor-scoped procedure for per-SKU shipping profiles", () => {
    expect(source).toContain("adminShippingProfiles: distributorProcedure");
    expect(source).toContain("saveShippingProfile: distributorProcedure");
    expect(source).toContain("applyComparableShippingEstimates: adminProcedure");
  });
});
