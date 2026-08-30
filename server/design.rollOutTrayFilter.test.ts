import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers/design.ts", import.meta.url), "utf8");

describe("Designer rollout tray catalog filter", () => {
  it("accepts the real rollout tray and shelf subcategory labels in both resolvers", () => {
    expect(source.match(/eq\(cabinets\.category, "Accessory"\)/g)?.length).toBeGreaterThanOrEqual(2);
	    expect(source.match(/or\(like\(cabinets\.masterCode, "RS%"\), like\(cabinets\.masterCode, "UNIV-ROT%"\)\)/g)).toHaveLength(2);
    expect(source.match(/eq\(cabinets\.subCategory, "Rollout Tray"\)/g)).toHaveLength(2);
    expect(source.match(/eq\(cabinets\.subCategory, "Roll Out Shelf"\)/g)).toHaveLength(2);
    expect(source).not.toContain('const conditions = [\n        eq(cabinets.subCategory, "Roll Out Shelf")');
  });

  it("retains published, available, same-style and optional same-distributor restrictions", () => {
    expect(source.match(/eq\(distributorSkus\.isAvailable, true\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/eq\(distributorSkus\.isPublished, true\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("eq(distributorSkus.styleId, input.styleId)");
    expect(source).toContain("eq(distributorSkus.distributorId, input.distributorId)");
  });
});
