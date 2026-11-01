import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers/catalog.ts"), "utf8");
const helper = readFileSync(resolve(process.cwd(), "shared/doorStyleWarehouseCoverage.ts"), "utf8");

describe("admin Door Style origin ZIP response", () => {
  it("returns both legacy and multi-origin ZIP values to the editor", () => {
    expect(source).toContain("warehouseZip: doorStyles.warehouseZip,");
    expect(source).toContain("warehouseZips: doorStyles.warehouseZips,");
  });

  it("joins vendor coverage onto the admin style list at read time", () => {
    expect(source).toContain("distributorWarehouseZips: distributors.warehouseZips,");
    expect(source).toContain("withDoorStyleWarehouseCoverage(row)");
  });

  it("keeps the legacy primary ZIP synchronized when the multi-origin list is saved", () => {
    expect(source).toContain("doorStyleOwnWarehouseZipWrite(fields.warehouseZips)");
    expect(helper).toContain("warehouseZips: normalizedOrigins.length > 0 ? normalizedOrigins : null");
    expect(helper).toContain("warehouseZip: normalizedOrigins[0] ?? null");
    expect(source).toContain("Empty stays null");
  });
});
