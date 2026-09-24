import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./PelicanCatalogAdmin.tsx", import.meta.url), "utf8");

describe("Pelican catalog administration price base", () => {
  it("shows the same verified positive source base used by public price resolvers", () => {
    expect(source).toContain('from "../../../../shared/surfacePricing"');
    expect(source).toContain("positiveAuthorizedSurfaceBase(it)");
    expect(source).toContain(">Source Base<");
    expect(source).not.toContain("money(it.yourCost ?? it.listPrice)");
  });
});
