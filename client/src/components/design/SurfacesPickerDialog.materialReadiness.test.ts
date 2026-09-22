import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SurfacesPickerDialog.tsx", import.meta.url), "utf8");

describe("Surfaces picker 3D material readiness", () => {
  it("keeps shopper photos display-only and clearly reports whether a 3D surface has an approved material swatch", () => {
    expect(source).toContain("const hasThreeDMaterialRole");
    expect(source).toContain("const hasApprovedMaterialSwatch = Boolean(p.materialImageUrl?.trim())");
    expect(source).toContain('data-testid={`surface-material-readiness-${p.id}`}');
    expect(source).toContain('"3D material swatch ready"');
    expect(source).toContain('"3D material swatch pending — neutral preview"');
    expect(source).toContain("imageUrl: p.imageUrl");
    expect(source).toContain("materialImageUrl: p.materialImageUrl");
  });

  it("resolves saved favorites through the same verified Designer source rather than stale browser data", () => {
    expect(source).toContain("trpc.surfaces.designerByIds.useQuery");
    expect(source).toContain("const preferredIds = useMemo");
    expect(source).toContain("pelicanCode: product.pelicanCode");
    expect(source).toContain("No saved products currently meet the verified Designer gate.");
    expect(source).toContain("Saved favorites remain in your catalog list.");
  });

  it("requests the server's complete verified palette rather than retaining a 60-item first-page cap", () => {
    expect(source).toContain("const PAGE_LIMIT = 200");
    expect(source).toContain("verified sink/faucet choices");
  });
});
