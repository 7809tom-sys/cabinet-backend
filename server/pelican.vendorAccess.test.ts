import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Pelican vendor access", () => {
  const source = readFileSync(resolve(process.cwd(), "server/routers/pelican.ts"), "utf8");

  it("uses the supplier-profile procedure for vendor catalog and selling controls", () => {
    for (const procedure of ["adminList", "setPopular", "setVisibility", "setPricing", "updateProduct", "setCoverage", "setUnsupportedOverhangLimit", "setMaterialImage"]) {
      expect(source).toContain(`${procedure}: supplierProfileProcedure`);
    }
  });

  it("resolves Pelican identity from the approved vendor record, not a supply line", () => {
    expect(source).toContain("requirePelicanVendor(db, ctx)");
    expect(source).toContain("ctx.approvedVendorLineId");
    expect(source).toContain('sourceKey?.trim().toLowerCase() === "pelican"');
    expect(source).toContain("vendor?.isApproved");
  });

  it("never lets a plain distributor-procedure account reach Pelican controls", () => {
    expect(source).not.toMatch(/: distributorProcedure/);
  });

  it("uses the supplier-profile procedure for per-SKU shipping profiles and keeps comparison automation admin-only", () => {
    expect(source).toContain("adminShippingProfiles: supplierProfileProcedure");
    expect(source).toContain("saveShippingProfile: supplierProfileProcedure");
    expect(source).toContain("applyComparableShippingEstimates: adminProcedure");
  });
});
