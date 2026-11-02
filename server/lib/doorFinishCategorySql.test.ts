import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("door finish category SQL", () => {
  it("is a hand-run TiDB script that adds columns and does not write hex values", () => {
    const sql = readFileSync("docs/sql/0244_door_finish_category.tidb.sql", "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS finishCategory VARCHAR(16) NULL;");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS grainLightHex VARCHAR(7) NULL;");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS grainDarkHex VARCHAR(7) NULL;");
    expect(sql).toContain("cabinet_dealz.door_styles");
    expect(sql).not.toContain("UPDATE ");
    expect(sql).not.toContain("--> statement-breakpoint");
    const blocks = sql.split(/\n-- \d+[^\n]*\n/).slice(1);
    expect(blocks).toHaveLength(4);
    for (const block of blocks) {
      const statements = block.split(";").map((part) => part.trim()).filter(Boolean);
      expect(statements).toHaveLength(1);
    }
  });
});
