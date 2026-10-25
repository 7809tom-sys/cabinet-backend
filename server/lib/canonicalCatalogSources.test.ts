import { describe, expect, it } from "vitest";
import { resolveCanonicalCatalogSources } from "./canonicalCatalogSources";

describe("resolveCanonicalCatalogSources", () => {
  it("projects a supplier source through a chain of approved aliases to one final master", () => {
    const resolved = resolveCanonicalCatalogSources(
      [{ sourceMasterCode: "B-24", stylePrice: "551.00", supplierSku: "AG-B24" }],
      [
        { aliasCode: "B-24", masterCode: "B24" },
        { aliasCode: "B24", masterCode: "BASE-24" },
      ],
      [{ masterCode: "BASE-24", id: 9001, description: "24 inch canonical base cabinet" }],
    );

    expect(resolved).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ supplierSku: "AG-B24", stylePrice: "551.00" }),
        master: expect.objectContaining({ id: 9001, masterCode: "BASE-24" }),
      }),
    ]);
  });

  it("does not expose malformed circular alias mappings", () => {
    const resolved = resolveCanonicalCatalogSources(
      [{ sourceMasterCode: "A" }],
      [
        { aliasCode: "A", masterCode: "B" },
        { aliasCode: "B", masterCode: "A" },
      ],
      [{ masterCode: "A", id: 1 }, { masterCode: "B", id: 2 }],
    );

    expect(resolved).toEqual([]);
  });

  it("keeps a valid source master visible when its stale alias target no longer exists", () => {
    const resolved = resolveCanonicalCatalogSources(
      [{ sourceMasterCode: "3-DB12", supplierSku: "GR-3DB12" }],
      [{ aliasCode: "3-DB12", masterCode: "3DB12" }],
      [{ masterCode: "3-DB12", id: 3012 }],
    );

    expect(resolved).toEqual([
      expect.objectContaining({
        master: expect.objectContaining({ id: 3012, masterCode: "3-DB12" }),
      }),
    ]);
  });

  it("treats a hyphen-only B12 ↔ B-12 loop as one valid product identity", () => {
    const resolved = resolveCanonicalCatalogSources(
      [{ sourceMasterCode: "B-12" }],
      [
        { aliasCode: "B-12", masterCode: "B12" },
        { aliasCode: "B12", masterCode: "B-12" },
      ],
      [{ masterCode: "B-12", id: 12 }],
    );

    expect(resolved).toEqual([
      expect.objectContaining({
        master: expect.objectContaining({ id: 12, masterCode: "B-12" }),
      }),
    ]);
  });

  it("projects the BSDC6 supplier spelling onto the verified BSD6 product identity", () => {
    const resolved = resolveCanonicalCatalogSources(
      [{ sourceMasterCode: "BSDC6", supplierSku: "SE-BSDC6", listPrice: "412.61" }],
      [{ aliasCode: "BSDC6", masterCode: "BSD6" }],
      [{ masterCode: "BSD6", id: 6006, description: "6 in. Base Spice Drawers Cabinet — 5 drawers" }],
    );

    expect(resolved).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ supplierSku: "SE-BSDC6", listPrice: "412.61" }),
        master: expect.objectContaining({ id: 6006, masterCode: "BSD6" }),
      }),
    ]);
  });
});
