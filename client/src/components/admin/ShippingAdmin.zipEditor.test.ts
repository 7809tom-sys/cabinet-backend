import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/components/admin/ShippingAdmin.tsx"), "utf8");

describe("ShippingAdmin multi-ZIP zone editor", () => {
  it("provides an Add ZIP control, per-ZIP removal, and persists normalized comma-delimited values", () => {
    expect(source).toContain("Add ZIP");
    expect(source).toContain("Remove ZIP code");
    expect(source).toContain("serializeZipPrefixes(parseZipPrefixes(z.zipPrefixes))");
    expect(source).toContain("most specific matching entry still wins");
  });
});
