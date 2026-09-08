import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./PelicanCatalogAdmin.tsx", import.meta.url), "utf8");

describe("Pelican countertop structural overhang administration", () => {
  it("keeps the limit restricted to countertop rows and explicitly unverified until an administrator supplies it", () => {
    expect(source).toContain('it.category === "Quartz Slabs (Countertops)"');
    expect(source).toContain('placeholder="Unverified"');
    expect(source).toContain('step="0.125"');
    expect(source).toContain("setUnsupportedOverhangLimit.mutate");
  });
});
