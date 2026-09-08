import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/admin/ShippingAdmin.tsx"),
  "utf8",
);

describe("Operations freight markup ownership", () => {
  it("keeps the markup control in Operations and explains Plan A versus Plan B", () => {
    expect(source).toContain("Operations freight markup %");
    expect(source).toContain("live Plan A carrier rate");
    expect(source).toContain("approved style Plan B fee");
    expect(source).toContain("Delivery accessorials remain itemized");
  });
});
