import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vendor cabinet flag migration 0212", () => {
  const sql = readFileSync(new URL("../drizzle/0212_vendor_cabinet_flag.sql", import.meta.url), "utf8");

  it("adds the nullable flag idempotently and only backfills rows that are still unset", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS `isCabinetVendor`");
    expect(sql).toContain("LOWER(TRIM(vl.`sourceKey`)) = 'pelican'");
    expect(sql).toContain("`isCabinetVendor` IS NULL");
    expect(sql).toContain("UPPER(d.`code`) <> 'PEL'");
  });

  it("inserts Saunders Closets as pending with no cabinet choice and no contact details", () => {
    expect(sql).toContain("'Saunders Closets'");
    expect(sql).toContain("'saunders-closets'");
    expect(sql).toContain("WHERE NOT EXISTS");
    expect(sql).toMatch(/0,\s*\n\s*NULL,/);
    expect(sql).not.toMatch(/saunders@|555-|https?:\/\//i);
  });
});
