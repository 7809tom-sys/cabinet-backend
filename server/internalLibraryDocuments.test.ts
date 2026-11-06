import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const literatureRouter = read("server/routers/affiliateLiterature.ts");
const resourcesRouter = read("server/routers/affiliateResources.ts");
const schemaSource = read("drizzle/schema.ts");
const storageSource = read("server/storage.ts");
const proxySource = read("server/_core/storageProxy.ts");
const importer = read("server/scripts/import-internal-library-documents.ts");
const sql = read("docs/sql/0255_library_internal_documents.tidb.sql");

describe("internal-only library documents", () => {
  it("stores a visibility and a who/when audit on every document", () => {
    expect(schemaSource).toContain('mysqlTable("affiliate_literature"');
    expect(schemaSource).toContain('visibility: varchar("visibility", { length: 16 }).default("internal").notNull()');
    expect(schemaSource).toContain('affiliateToggledAt: timestamp("affiliateToggledAt")');
    expect(schemaSource).toContain('affiliateToggledBy: int("affiliateToggledBy")');
    expect(schemaSource).toContain('affiliateToggledByName: varchar("affiliateToggledByName", { length: 255 })');
  });

  it("defaults a new upload to internal and keeps the checkbox as the only writer", () => {
    expect(literatureRouter).toContain("inAffiliateLibrary: z.boolean().default(false)");
    expect(literatureRouter).toContain("visibility: visibilityForAffiliateLibrarySwitch(input.inAffiliateLibrary)");
    expect(literatureRouter).toContain("affiliateToggledByName: input.inAffiliateLibrary ? ctx.user.name ?? null : null");
    // A plain isPublished input would let an old client publish a document
    // without touching visibility. The checkbox input replaces it.
    expect(literatureRouter).not.toContain("isPublished: z.boolean");
  });

  it("records who and when on every toggle", () => {
    expect(literatureRouter).toContain("affiliateToggledAt: new Date()");
    expect(literatureRouter).toContain("affiliateToggledBy: ctx.user.id");
    expect(literatureRouter).toContain("isPublished: inAffiliateLibrary");
  });

  it("serves an affiliate only when visibility and isPublished both allow it", () => {
    expect(resourcesRouter).toContain('eq(affiliateLiterature.visibility, "affiliate")');
    expect(resourcesRouter).toContain("eq(affiliateLiterature.isPublished, true)");
    expect(resourcesRouter).toContain(".filter(isAffiliateLibraryDocument)");
    // The old read filtered on isPublished alone.
    expect(resourcesRouter).not.toContain(".where(eq(affiliateLiterature.isPublished, true))");
  });

  it("keeps library bytes out of the public bucket and off the public proxy", () => {
    expect(storageSource).toContain('"library-documents/"');
    expect(proxySource).toContain("key.startsWith(LIBRARY_DOCUMENT_FILE_PREFIX)");
    expect(proxySource).toContain("not available at a public address");
  });

  it("handles every literature mutation and the signed open on admin procedures only", () => {
    expect(literatureRouter).toContain("adminProcedure");
    expect(literatureRouter).not.toContain("protectedProcedure");
    expect(resourcesRouter).toContain("adminSignedFile: adminProcedure");
    expect(resourcesRouter).toContain("storageGetSignedUrl(row.fileKey)");
  });

  it("adds visibility first, standalone, with plain ALTER TABLE that TiDB Cloud accepts", () => {
    expect(sql).toContain("Numbered 0255");
    // TiDB Cloud rejected ADD COLUMN IF NOT EXISTS, so the column was never
    // added and every later statement failed on "Unknown column 'visibility'".
    // The first real statement must be the visibility ALTER, on its own.
    const firstStatement = sql
      .split(/\n-- \d+\./)
      .slice(1)
      .map((block) => block
        .split("\n")
        .slice(1)
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim())
      .find(Boolean);
    expect(firstStatement).toMatch(/^ALTER TABLE cabinet_dealz\.affiliate_literature ADD COLUMN visibility VARCHAR\(16\) NOT NULL DEFAULT 'internal';$/);
    // The syntax TiDB Cloud rejected must not appear in any STATEMENT. The
    // header comment names it on purpose, to explain why it is gone.
    for (const statement of sql
      .split(/\n-- \d+\./)
      .slice(1)
      .map((block) => block
        .split("\n")
        .slice(1)
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n"))) {
      expect(statement).not.toMatch(/IF NOT EXISTS/i);
    }
    expect(sql).toContain("ADD COLUMN affiliateToggledAt DATETIME NULL");
    expect(sql).toContain("ADD COLUMN affiliateToggledBy INT NULL");
    expect(sql).toContain("ADD COLUMN affiliateToggledByName VARCHAR(255) NULL");
    expect(sql).toContain("CREATE INDEX affiliate_literature_visibility_idx ON cabinet_dealz.affiliate_literature");
    // A re-run must be visibly a no-op rather than look like a failure.
    expect(sql).toContain("Duplicate column name");
    expect(sql).toContain("Duplicate key name");
  });

  it("verifies the columns before it writes with them, and seeds the proposal as internal", () => {
    const verifyAt = sql.indexOf("SELECT COUNT(*) AS documentCount");
    expect(verifyAt).toBeGreaterThan(0);
    expect(verifyAt).toBeLessThan(sql.indexOf("\nUPDATE "));
    expect(verifyAt).toBeLessThan(sql.indexOf("\nINSERT "));
    expect(sql).toContain("WHERE NOT EXISTS");
    expect(sql).toContain("'internal', 900");
    for (const line of sql.split("\n")) {
      if (!/^(ALTER|CREATE|SELECT|UPDATE|INSERT)\b/i.test(line)) continue;
      // The read-only checks read information_schema or the table by name; every
      // statement that touches a real table must name its schema.
      if (/^SELECT\b/i.test(line) && line.includes("information_schema")) continue;
      expect(line).toMatch(/cabinet_dealz\./);
    }
    // No table alias in an UPDATE: TiDB Cloud is strict about that form.
    expect(sql).toMatch(/^UPDATE cabinet_dealz\.affiliate_literature SET visibility = 'affiliate' WHERE /m);
  });

  it("ships an importer that only uploads bytes and never widens access", () => {
    expect(importer).toContain("storagePut(STORED_KEY, bytes, \"application/pdf\")");
    expect(importer).toContain("library-documents/internal/");
    expect(importer).not.toMatch(/\binsert\b/i);
    expect(importer).not.toMatch(/isPublished:\s*true/);
  });
});
