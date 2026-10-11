import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/affiliate/AffiliateCatalogPanel.tsx"), "utf8");

describe("AffiliateCatalogPanel distributor curation", () => {
  it("provides clear include and feature controls without replacing per-style controls", () => {
    expect(source).toContain("Cabinet lines on my storefront");
    expect(source).toContain("Show all active cabinet lines again");
    expect(source).toContain("updateMyStorefrontDistributors");
    expect(source).toContain("adminUpdateStorefrontDistributors");
    expect(source).toContain("Line Active on Storefront");
    expect(source).toContain("line mark");
    expect(source).toContain("active cabinet styles");
  });
});
