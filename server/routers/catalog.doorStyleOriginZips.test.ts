import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers/catalog.ts"), "utf8");

describe("admin Door Style origin ZIP response", () => {
  it("returns both legacy and multi-origin ZIP values to the editor", () => {
    expect(source).toContain("warehouseZip: doorStyles.warehouseZip,");
    expect(source).toContain("warehouseZips: doorStyles.warehouseZips,");
  });

  it("keeps the legacy primary ZIP synchronized when the multi-origin list is saved", () => {
    expect(source).toContain("patch.warehouseZips = normalizedOrigins.length > 0 ? normalizedOrigins : null;");
    expect(source).toContain("patch.warehouseZip = normalizedOrigins[0] ?? null;");
  });
});
