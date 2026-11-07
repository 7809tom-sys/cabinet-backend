import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFFILIATE_MARKUP_BPS,
  affiliateStartingMarkup,
  reavesWayAffiliateDefaults,
} from "@shared/affiliateBlueprint";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const blueprint = read("../shared/affiliateBlueprint.ts");
const schema = read("../drizzle/schema.ts");
const router = read("./routers/affiliates.ts");
const sql = read("../docs/sql/0269_new_affiliate_default_markup_40.tidb.sql");

describe("new affiliates start at a 40% markup", () => {
  it("uses 4000 bps for the default markup and for decorative hardware", () => {
    expect(DEFAULT_AFFILIATE_MARKUP_BPS).toBe(4000);
    expect(affiliateStartingMarkup()).toEqual({
      defaultMarkupBps: 4000,
      hardwareMarkupBps: 4000,
    });
    expect(reavesWayAffiliateDefaults().defaultMarkupBps).toBe(4000);
    expect(reavesWayAffiliateDefaults().hardwareMarkupBps).toBe(4000);
  });

  it("keeps the schema column defaults at 4000 so a bare insert also lands at 40%", () => {
    expect(schema).toContain(
      'defaultMarkupBps: int("defaultMarkupBps").default(4000).notNull()'
    );
    expect(schema).toContain(
      'hardwareMarkupBps: int("hardwareMarkupBps").default(4000).notNull()'
    );
    expect(schema).not.toContain(
      'defaultMarkupBps: int("defaultMarkupBps").default(2000).notNull()'
    );
    expect(schema).not.toContain(
      'hardwareMarkupBps: int("hardwareMarkupBps").default(0).notNull()'
    );
  });

  it("writes both markups on the one affiliate-creation path", () => {
    // adminCreate is the only place server code inserts an affiliate row, so it
    // is the only place a new store's starting markup can be set.
    const inserts = router.match(/db\s*\.\s*insert\(affiliates\)/g) ?? [];
    expect(inserts).toHaveLength(1);
    const createStart = router.indexOf("adminCreate: adminProcedure");
    const createEnd = router.indexOf(
      "adminInviteSalesDemo: adminProcedure",
      createStart
    );
    expect(createStart).toBeGreaterThan(-1);
    const createBody = router.slice(createStart, createEnd);
    expect(createBody).toContain("...affiliateStartingMarkup()");
    expect(createBody).not.toContain("hardwareMarkupBps: 0");
  });

  it("lets the affiliate change the markup afterwards", () => {
    expect(router).toContain("updateMyMarkup: partnerProcedure");
    expect(router).toContain(
      "if (input.defaultMarkupBps !== undefined) set.defaultMarkupBps = input.defaultMarkupBps;"
    );
    expect(router).toContain(
      "if (input.hardwareMarkupBps !== undefined) set.hardwareMarkupBps = input.hardwareMarkupBps;"
    );
  });
});

describe("docs/sql/0269_new_affiliate_default_markup_40.tidb.sql", () => {
  it("only changes the two column defaults, one statement per line", () => {
    expect(sql).toContain(
      "ALTER TABLE cabinet_dealz.affiliates ALTER COLUMN defaultMarkupBps SET DEFAULT 4000;"
    );
    expect(sql).toContain(
      "ALTER TABLE cabinet_dealz.affiliates ALTER COLUMN hardwareMarkupBps SET DEFAULT 4000;"
    );
    expect(sql).not.toMatch(/IF NOT EXISTS/i);
    expect(sql).not.toMatch(/--> statement-breakpoint/);
    const statements = sql
      .split("\n")
      .filter(line => line.trim() && !line.trimStart().startsWith("--"));
    expect(statements).toHaveLength(2);
    for (const line of statements) {
      expect(line.startsWith(" ")).toBe(false);
      expect(line.trim().endsWith(";")).toBe(true);
      expect(line).toMatch(
        /^ALTER TABLE cabinet_dealz\.affiliates ALTER COLUMN \w+ SET DEFAULT 4000;$/
      );
    }
  });

  it("never rewrites an existing affiliate's markup", () => {
    const statements = sql
      .split("\n")
      .filter(line => line.trim() && !line.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/\bUPDATE\b/i);
    expect(statements).not.toMatch(/\bINSERT\b/i);
    expect(statements).not.toMatch(/\bDELETE\b/i);
    expect(statements).not.toMatch(/\bMODIFY\b/i);
    expect(sql).toContain("never touch a row");
    expect(sql).toContain("Safe to re-run");
  });
});

describe("the rest of the blueprint is unchanged", () => {
  it("keeps the approved storefront look the blueprint already shipped", () => {
    expect(blueprint).toContain('template: "showcase"');
    expect(blueprint).toContain('primaryColor: "#1ceb31"');
    expect(blueprint).toContain('buttonRadius: "9999px"');
  });
});
