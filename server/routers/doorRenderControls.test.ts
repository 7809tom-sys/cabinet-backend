import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("door render controls SQL", () => {
  it("is a hand-run TiDB script with one statement per numbered block", () => {
    const sql = readFileSync("docs/sql/0233_door_render_controls.tidb.sql", "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS renderHex");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS doorShape");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS swatchCode");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS swatchHex");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS renderExposure");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS colorMatchDeltaE");
    expect(sql).toContain("cabinet_dealz.door_styles");
    expect(sql).toContain("cabinet_dealz.site_settings");
    expect(sql).not.toContain("--> statement-breakpoint");
    const blocks = sql.split(/\n-- \d+[^\n]*\n/).slice(1);
    expect(blocks).toHaveLength(7);
    for (const block of blocks) {
      const statements = block.split(";").map((part) => part.trim()).filter(Boolean);
      expect(statements).toHaveLength(1);
    }
  });
});
