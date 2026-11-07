/**
 * The hand-run TiDB file Tom pastes into the SQL editor.
 *
 * These checks exist because the file is never executed by CI: a mistake in it
 * is discovered in production, by hand. They pin the rules the repo already
 * learned the hard way: one statement per line, no IF NOT EXISTS, every table
 * prefixed, and nothing destructive.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TIDB = "docs/sql/0269_affiliate_legal_esign.tidb.sql";
const sql = readFileSync(resolve(process.cwd(), TIDB), "utf8");

/** Executable lines only: comments and blanks removed. */
function statementLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"));
}

const lines = statementLines(sql);
const executable = lines.join("\n");

describe("0269 affiliate legal e-sign SQL", () => {
  it("is one statement per line, so each line pastes on its own in the TiDB editor", () => {
    for (const line of lines) {
      // A line that ends with a semicolon and has no other semicolon is one statement.
      expect(line.endsWith(";")).toBe(true);
      expect(line.slice(0, -1)).not.toContain(";");
    }
  });

  it("never uses IF NOT EXISTS, which TiDB Cloud rejects", () => {
    expect(executable.toUpperCase()).not.toContain("IF NOT EXISTS");
  });

  it("prefixes every table with cabinet_dealz.", () => {
    for (const line of lines) {
      const references = line.match(/\b(?:FROM|INTO|JOIN)\s+[A-Za-z_][\w.]*/gi) ?? [];
      for (const reference of references) {
        // Read-only verification is allowed to inspect information_schema.
        if (/^FROM information_schema\.[a-z_]+$/i.test(reference)) continue;
        expect(reference).toMatch(/\b(?:FROM|INTO|JOIN) cabinet_dealz\.[a-z_]+$/);
      }
    }
    // Every CREATE TABLE names the schema.
    for (const line of lines.filter((line) => /^CREATE TABLE/i.test(line))) {
      expect(line).toMatch(/^CREATE TABLE cabinet_dealz\.affiliate_legal_[a-z_]+ \(/);
    }
  });

  it("creates the four tables the feature needs and nothing else", () => {
    const created = lines
      .filter((line) => /^CREATE TABLE/i.test(line))
      .map((line) => /cabinet_dealz\.([a-z_]+)/.exec(line)?.[1]);
    expect(created).toEqual([
      "affiliate_legal_documents",
      "affiliate_legal_document_versions",
      "affiliate_legal_signing_sessions",
      "affiliate_legal_signatures",
    ]);
  });

  it("is additive: no ALTER, UPDATE, DELETE, DROP, or TRUNCATE on existing data", () => {
    for (const line of lines) {
      // "ON UPDATE CURRENT_TIMESTAMP" is a column definition, not a row write.
      const withoutColumnClause = line.replace(/ON UPDATE CURRENT_TIMESTAMP/gi, "");
      expect(withoutColumnClause).not.toMatch(/^ALTER\b/i);
      expect(withoutColumnClause).not.toMatch(/\bUPDATE\b/i);
      expect(withoutColumnClause).not.toMatch(/^DELETE\b/i);
      expect(withoutColumnClause).not.toMatch(/\bDROP\b/i);
      expect(withoutColumnClause).not.toMatch(/\bTRUNCATE\b/i);
    }
  });

  it("protects the append-only guarantees with the two unique keys", () => {
    const signatureTable = lines.find((line) => line.includes("CREATE TABLE cabinet_dealz.affiliate_legal_signatures"))!;
    expect(signatureTable).toContain("UNIQUE KEY affiliate_legal_signatures_affiliate_version_uq (affiliateId, documentVersionId)");
    expect(signatureTable).toContain("UNIQUE KEY affiliate_legal_signatures_event_uq (providerEventId)");
  });

  it("lets the gate pass on day one by inserting no contracts", () => {
    expect(lines.filter((line) => /^INSERT\b/i.test(line))).toEqual([]);
  });

  it("ends with read-only verification that names the new tables", () => {
    const selects = lines.filter((line) => /^SELECT\b/i.test(line));
    expect(selects.length).toBeGreaterThanOrEqual(3);
    expect(selects.some((line) => line.includes("affiliate_legal_signatures"))).toBe(true);
  });

  it("states that the file number may need bumping at merge", () => {
    expect(sql).toMatch(/BUMP THIS NUMBER AT MERGE/);
  });
});
