import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./PelicanCatalogAdmin.tsx", import.meta.url), "utf8");

describe("Pelican catalog administration price base", () => {
  it("shows the same verified positive source base used by public price resolvers", () => {
    expect(source).toContain('from "../../../../shared/surfacePricing"');
    expect(source).toContain("authorizedSurfacePriceBasis(it)");
    expect(source).toContain(">Source Base<");
    expect(source).toContain('"Verified cost"');
    expect(source).toContain('"Supplier list"');
    expect(source).not.toContain("money(it.yourCost ?? it.listPrice)");
  });

  it("exposes a dedicated source-price audit instead of making unpriced records public", () => {
    expect(source).toContain("const [unpricedOnly, setUnpricedOnly] = useState(false)");
    expect(source).toContain("unpricedOnly,");
    expect(source).toContain('aria-label="Show only items missing a verified source price"');
    expect(source).toContain("Needs source price");
    expect(source).toContain("No unpriced surface items remain in this audit scope.");
  });
});
