import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../drizzle/schema.ts");
const router = read("./routers/distributors.ts");
const editor = read("../client/src/components/admin/LineBrandingEditor.tsx");
const sql = read("../docs/sql/0240_distributor_website_url.tidb.sql");

describe("distributor websiteUrl", () => {
  it("is a nullable varchar(512) on the distributors table", () => {
    expect(schema).toContain('websiteUrl: varchar("websiteUrl", { length: 512 }),');
    expect(schema).not.toContain('websiteUrl: varchar("websiteUrl", { length: 512 }).notNull()');
  });

  it("is returned by the admin list and only displayed, never edited, in Admin > Distributors", () => {
    expect(router).toContain("websiteUrl: distributors.websiteUrl,");
    expect(editor).toContain('data-testid="distributor-website"');
    expect(editor).toContain("Supplier website (read-only)");
    expect(editor).toContain('rel="noopener noreferrer"');
    expect(editor).toContain("/^https?:\\/\\//i.test(selected.websiteUrl ?? \"\")");
    // no mutation takes websiteUrl: it is set by hand in SQL
    expect(router).not.toMatch(/websiteUrl: z\./);
  });

  it("has a by-hand TiDB file: IF NOT EXISTS, cabinet_dealz.distributors, one statement per numbered block", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS websiteUrl VARCHAR(512) NULL");
    expect(sql).toContain("cabinet_dealz.distributors");
    const blocks = sql.split(/^-- \d+\n/m).slice(1);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      const statements = block.split("\n").filter((line) => !line.startsWith("--")).join("\n").split(";").map((part) => part.trim()).filter(Boolean);
      expect(statements).toHaveLength(1);
    }
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
    expect(sql).toContain("websiteUrl IS NULL");
  });
});
