import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../docs/sql/0233_kitchen_rules.tidb.sql", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers/kitchenRules.ts", import.meta.url), "utf8");

describe("kitchen rules migration", () => {
  it("uses one statement per numbered block and qualifies the table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.kitchen_rules");
    expect(sql).toContain("INSERT IGNORE INTO cabinet_dealz.kitchen_rules");
    const blocks = sql.split(/\n-- \d+\n/).slice(1);
    expect(blocks.length).toBe(2);
    for (const block of blocks) {
      const statements = block.replace(/'(?:[^']|'')*'/g, "''").split(";").map((part) => part.trim()).filter(Boolean);
      expect(statements).toHaveLength(1);
    }
    expect(sql).not.toMatch(/\bAS\s+(status|key|order|group|range)\b/i);
  });

  it("keeps catalog edits admin-only and new rules reference-only", () => {
    expect(router).toContain("list: adminProcedure");
    expect(router).toContain("create: adminProcedure");
    expect(router).toContain("update: adminProcedure");
    expect(router).toContain('implementationStatus: "reference"');
    expect(router).toContain("readsParameters: false");
    expect(router).toContain("parameters: publicProcedure");
  });
});
