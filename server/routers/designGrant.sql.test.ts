import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  new URL(
    "../../docs/sql/0270_affiliate_design_grants.tidb.sql",
    import.meta.url
  ),
  "utf8"
);
const MIGRATION = readFileSync(
  new URL("../../drizzle/0238_affiliate_design_grants.sql", import.meta.url),
  "utf8"
);

/** Strip `--` comment lines so keyword checks only see statements. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .map(line => line.trim())
    .filter(Boolean);
}

const stmts = statements(SQL);
const createTable =
  stmts.find(statement => /^CREATE TABLE/i.test(statement)) ?? "";
const grantInsert = stmts.find(statement => /^INSERT/i.test(statement)) ?? "";

describe("the design-grant SQL for Tom", () => {
  it("puts every statement on one line, with no statement split across lines", () => {
    for (const statement of stmts) {
      expect(statement.endsWith(";"), statement.slice(0, 60)).toBe(true);
      // One semicolon per line means one statement per line.
      expect(statement.split(";").length - 1, statement.slice(0, 60)).toBe(1);
    }
  });

  it("creates the grant table with the columns the code reads and writes", () => {
    expect(createTable).toContain(
      "CREATE TABLE cabinet_dealz.affiliate_design_grants"
    );
    for (const column of [
      "affiliateId",
      "designCount",
      "usedSinceGrant",
      "contactEmails",
      "grantedBy",
      "grantedAt",
      "renewedAt",
      "renewedBy",
    ]) {
      expect(createTable, column).toContain(column);
    }
    // One grant per store.
    expect(createTable).toContain(
      "UNIQUE KEY affiliate_design_grants_affiliate_uq (affiliateId)"
    );
    // No IF NOT EXISTS in any statement, per Tom's rule for the TiDB editor.
    for (const statement of stmts) {
      expect(statement, "no IF NOT EXISTS").not.toMatch(/IF NOT EXISTS/i);
    }
  });

  it("grants affiliate 53 exactly five designs with one INSERT ... SELECT from its own row", () => {
    expect(grantInsert).toContain(
      "INSERT IGNORE INTO cabinet_dealz.affiliate_design_grants"
    );
    expect(grantInsert).toContain("SELECT 53, 5, 0");
    expect(grantInsert).toContain(
      "FROM cabinet_dealz.affiliates WHERE id = 53"
    );
    // The emails come from the affiliate's row, never a literal address.
    expect(grantInsert).toContain("TRIM(email)");
    expect(grantInsert).toContain("TRIM(publicEmail)");
    const literals = grantInsert.match(/'[^']*'/g) ?? [];
    for (const literal of literals) {
      expect(literal, "no email may be hardcoded").not.toMatch(/@/);
    }
    // Idempotent through the unique key, without reading its own target table.
    expect(grantInsert).toContain("INSERT IGNORE");
    expect(grantInsert).not.toContain("NOT EXISTS");
    // The only FROM is the affiliate's own row, never the grant table itself.
    const fromTargets = Array.from(
      grantInsert.matchAll(/\bFROM\s+([A-Za-z0-9_.]+)/gi),
      match => (match[1] ?? "").toLowerCase()
    );
    expect(fromTargets).toEqual(["cabinet_dealz.affiliates"]);
  });

  it("never writes to the affiliates table", () => {
    for (const statement of stmts) {
      expect(statement, "no UPDATE").not.toMatch(/^UPDATE\b/i);
      expect(statement, "no DELETE").not.toMatch(/^DELETE\b/i);
      expect(statement, "no ALTER").not.toMatch(/^ALTER\b/i);
      expect(statement, "no DROP").not.toMatch(/^DROP\b/i);
      expect(statement, "no TRUNCATE").not.toMatch(/^TRUNCATE\b/i);
    }
    // The only INSERT is into the new grant table.
    const inserts = stmts.filter(statement => /^INSERT/i.test(statement));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("INTO cabinet_dealz.affiliate_design_grants");
    // Only one INSERT ... SELECT exists, so affiliate 53 gets exactly one row.
    expect(
      stmts.filter(statement => /^INSERT[\s\S]*\bSELECT\b/i.test(statement))
    ).toHaveLength(1);
    // The affiliates table is only ever read.
    for (const statement of stmts) {
      if (!statement.includes("cabinet_dealz.affiliates")) continue;
      expect(statement, "affiliates is read-only here").toMatch(
        /\bFROM cabinet_dealz\.affiliates\b/
      );
      expect(statement).not.toMatch(
        /(?:INTO|UPDATE)\s+cabinet_dealz\.affiliates/i
      );
    }
  });

  it("qualifies every table with the cabinet_dealz schema", () => {
    // Only real table references: CREATE TABLE, and the target of FROM / INTO /
    // JOIN. `ON UPDATE CURRENT_TIMESTAMP` is a column clause, not a table, so
    // UPDATE is deliberately not in this list.
    const pattern =
      /\b(?:CREATE\s+TABLE|FROM|INTO|JOIN)\s+([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?/gi;
    let checked = 0;
    for (const statement of stmts) {
      for (const match of statement.matchAll(pattern)) {
        const first = match[1] ?? "";
        const second = match[2] ?? "";
        // information_schema is the read-only catalog, not a data table.
        if (first.toLowerCase() === "information_schema") continue;
        expect(first, statement.slice(0, 60)).toBe("cabinet_dealz");
        expect(second, "table name must follow the schema").not.toBe("");
        checked += 1;
      }
    }
    // The file really does reference tables, so this is not a vacuous pass.
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it("ships a matching drizzle migration that is additive only", () => {
    expect(MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS `affiliate_design_grants`"
    );
    for (const column of [
      "designCount",
      "usedSinceGrant",
      "contactEmails",
      "grantedBy",
      "renewedAt",
    ]) {
      expect(MIGRATION, column).toContain(column);
    }
    expect(MIGRATION).not.toMatch(/^\s*(UPDATE|DELETE|ALTER|DROP)\b/im);
    expect(MIGRATION).not.toContain("INSERT");
  });
});
