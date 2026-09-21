import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const editor = readFileSync(resolve(root, "client/src/components/admin/DistributorFulfillmentEditor.tsx"), "utf8");
const router = readFileSync(resolve(root, "server/routers/distributors.ts"), "utf8");

describe("Distributor Fulfillment glass policy administration", () => {
  it("keeps one distributor-level included/separate switch and an automatic PG/GD/G audit", () => {
    expect(editor).toContain("Glass policy");
    expect(editor).toContain("Glass included");
    expect(editor).toContain("Glass purchased separately");
    expect(editor).toContain("Automatic glass-nomenclature audit");
    expect(editor).toContain("All PG, GD, and terminal-G cabinets");
    expect(editor).toContain("glassIncluded,");
  });

  it("serves the administrator a grouped supplier audit rather than requiring item-by-item rules", () => {
    expect(router).toContain("glassPolicyCatalog");
    expect(router).toContain("isGlassNomenclature");
    expect(router).toContain("offered: boolean");
    expect(router).toContain("existing.offered ||= offered");
  });
});
