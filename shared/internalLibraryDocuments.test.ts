import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTERNAL_LIBRARY_DOCUMENTS,
  internalLibraryDocumentByFile,
  internalLibraryDocumentByKey,
  internalLibraryDocumentPath,
  internalLibraryInsertSql,
  internalLibraryRowValues,
  sqlLiteral,
} from "./internalLibraryDocuments";
import { LIBRARY_DOCUMENT_FILE_PREFIX, isLibraryDocumentStorageKey } from "./libraryVisibility";

/**
 * The manifest is the one place the committed file, the row's storage key and the
 * bytes the importer uploads are written down together, so it is what the tests
 * here hold to each other.
 *
 * The document bytes themselves live in cabinet-frontend (docs/library/internal),
 * which this repository does not check out. So the tests below prove the wiring —
 * prefix, key, row values, guard — and leave the byte-level size/SHA-256 check to
 * the importer, which stops before it uploads anything that does not match.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const SQL_FILE = "docs/sql/0268_affiliate_app_guide_internal.tidb.sql";
const importer = read("server/scripts/import-internal-library-documents.ts");
const admin = read("client/src/components/admin/AffiliateLiteratureAdmin.tsx");
const sql = read(SQL_FILE);

const guide = internalLibraryDocumentByFile("how-to-create-an-app-for-an-affiliate.md")!;

describe("the internal library manifest", () => {
  it("holds the Marazzi proposal and the affiliate app guide", () => {
    expect(INTERNAL_LIBRARY_DOCUMENTS.map((document) => document.file)).toEqual([
      "website-improvement-proposal-marazzi-lessons-cabinetdealz.pdf",
      "how-to-create-an-app-for-an-affiliate.md",
    ]);
  });

  it("keeps every key in the private library prefix and off a public path", () => {
    for (const document of INTERNAL_LIBRARY_DOCUMENTS) {
      expect(document.storageKey, document.file).toBe(`${LIBRARY_DOCUMENT_FILE_PREFIX}internal/${document.file}`);
      expect(isLibraryDocumentStorageKey(document.storageKey), document.file).toBe(true);
      expect(isLibraryDocumentStorageKey(document.url), document.file).toBe(true);
      // The row's url mirrors what storagePut returns for a private key.
      expect(document.url, document.file).toBe(`/manus-storage/${document.storageKey}`);
      expect(document.category, document.file).toBe("Internal");
    }
  });

  it("points every document at the frontend path the importer reads", () => {
    for (const document of INTERNAL_LIBRARY_DOCUMENTS) {
      expect(internalLibraryDocumentPath(document), document.file).toBe(`docs/library/internal/${document.file}`);
    }
  });

  it("looks a document up by file or by key, and by nothing else", () => {
    for (const document of INTERNAL_LIBRARY_DOCUMENTS) {
      expect(internalLibraryDocumentByFile(document.file)).toBe(document);
      expect(internalLibraryDocumentByKey(document.storageKey)).toBe(document);
    }
    expect(internalLibraryDocumentByFile("nope.md")).toBeUndefined();
    expect(internalLibraryDocumentByKey("library-documents/internal/nope.md")).toBeUndefined();
  });

  it("stores a type the literature uploader already accepts, for every file", () => {
    expect(admin).toContain(".pdf,.docx,.xlsx,.pptx,.txt,application/pdf");
    for (const document of INTERNAL_LIBRARY_DOCUMENTS) {
      expect(["application/pdf", "text/plain"]).toContain(document.mimeType);
      // The guide keeps its .md name but is stored as text/plain, which the
      // ".txt" half of that accept list carries.
      expect(document.mimeType, document.file).toBe(document.file.endsWith(".pdf") ? "application/pdf" : "text/plain");
    }
  });

  it("starts every document unpublished, and never invents a public value", () => {
    for (const document of INTERNAL_LIBRARY_DOCUMENTS) {
      const values = internalLibraryRowValues(document);
      expect(values, document.file).toContain(", 0, 'internal', ");
      expect(values, document.file).not.toMatch(/'affiliate'/);
    }
  });

  it("records a distinct title, file, key and sort order per document", () => {
    for (const key of ["title", "file", "storageKey", "sortOrder"] as const) {
      const values = INTERNAL_LIBRARY_DOCUMENTS.map((document) => document[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
  });

  it("records a size and a SHA-256 the importer can hold the bytes to", () => {
    for (const document of INTERNAL_LIBRARY_DOCUMENTS) {
      expect(document.sizeBytes, document.file).toBeGreaterThan(0);
      expect(document.sha256, document.file).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("escapes a single quote the way the TiDB editor expects", () => {
    expect(sqlLiteral("It's a guide")).toBe("'It''s a guide'");
  });

  it("writes the guide's row values in the column order the SQL uses", () => {
    expect(internalLibraryRowValues(guide)).toBe(
      [
        `'${guide.title}'`,
        `'${guide.description}'`,
        "'Internal'",
        "'how-to-create-an-app-for-an-affiliate.md'",
        "'library-documents/internal/how-to-create-an-app-for-an-affiliate.md'",
        "'/manus-storage/library-documents/internal/how-to-create-an-app-for-an-affiliate.md'",
        "'text/plain'",
        "8025",
        "0",
        "'internal'",
        "901",
      ].join(", "),
    );
  });

  it("guards the INSERT on the fileKey so a re-run registers nothing", () => {
    const insert = internalLibraryInsertSql(guide);
    expect(insert).toContain("WHERE NOT EXISTS");
    expect(insert).toContain("WHERE fileKey = 'library-documents/internal/how-to-create-an-app-for-an-affiliate.md'");
    expect(insert.trimEnd().endsWith(";")).toBe(true);
  });
});

describe("docs/sql/0268_affiliate_app_guide_internal.tidb.sql", () => {
  it("is the next free number and says one statement per line", () => {
    expect(sql).toContain("Numbered 0268");
    expect(sql).toContain("Run after 0267");
    expect(sql).toContain("One statement per line");
    expect(sql).not.toMatch(/statement-breakpoint/);
  });

  it("is plain SQL, one statement on each non-comment line, every table qualified", () => {
    expect(sql).not.toMatch(/IF NOT EXISTS/i);
    for (const line of sql.split("\n").filter((entry) => entry.trim() && !entry.trimStart().startsWith("--"))) {
      expect(line.startsWith(" "), `unexpected indentation: ${line.slice(0, 60)}`).toBe(false);
      expect(line.trim().endsWith(";"), `missing semicolon: ${line.slice(0, 60)}`).toBe(true);
      expect((line.match(/;/g) ?? []).length, `two statements on one line: ${line.slice(0, 60)}`).toBe(1);
      expect(line, `unqualified table: ${line.slice(0, 60)}`).toMatch(/cabinet_dealz\./);
    }
    expect(sql.trimEnd().endsWith(";")).toBe(true);
  });

  it("registers exactly what the manifest describes, internal and unpublished", () => {
    const insert = sql.split("\n").find((line) => line.startsWith("INSERT INTO"));
    expect(insert).toBe(internalLibraryInsertSql(guide));
    expect(insert).toContain(", 0, 'internal', 901 FROM DUAL WHERE NOT EXISTS");
    // The two values that keep it out of an affiliate portal, spelled out. Only
    // the INSERT is checked: statement 5 reads the affiliate rows on purpose, to
    // prove the guide is not among them.
    expect(insert).not.toMatch(/'affiliate'/);
    expect(insert).not.toMatch(/, 1, '/);
    expect(sql).toContain("WHERE visibility = 'affiliate' AND isPublished = 1");
  });

  it("previews for a duplicate before it inserts, and verifies afterwards", () => {
    const statements = sql
      .split(/\n(?=-- \d+\.)/)
      .map((block) => block.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n").trim())
      .filter(Boolean);
    const preview = statements[0];
    const insertAt = statements.findIndex((statement) => /^INSERT\b/.test(statement));
    expect(preview).toContain("WHERE title = 'How to Create an App for an Affiliate'");
    expect(preview).toContain("fileKey = 'library-documents/internal/how-to-create-an-app-for-an-affiliate.md'");
    expect(insertAt).toBeGreaterThan(0);
    expect(statements.slice(insertAt + 1).some((statement) => statement.includes("WHERE fileKey ="))).toBe(true);
  });

  it("requires 0255 first, so the visibility column exists before the row writes it", () => {
    expect(sql).toContain("Requires 0255 first");
  });

  it("uploads before it registers, so the admin Open button never 404s", () => {
    expect(sql).toContain("upload the file FIRST");
    expect(sql.indexOf("upload the file FIRST")).toBeLessThan(sql.indexOf("-- 1. PREVIEW"));
  });
});

describe("the importer", () => {
  it("reads every document out of the frontend checkout, so no bytes are invented here", () => {
    expect(importer).toContain("FRONTEND_REPO_ROOT");
    expect(importer).toContain("internalLibraryDocumentPath(document)");
    expect(importer).toContain("INTERNAL_LIBRARY_DOCUMENTS");
  });

  it("uploads each document to its recorded key and type", () => {
    expect(importer).toContain("storagePut(document.storageKey, bytes, document.mimeType)");
  });

  it("stops on a size or hash mismatch instead of uploading the wrong bytes", () => {
    expect(importer).toContain("bytes.length !== document.sizeBytes");
    expect(importer).toContain("sha256 !== document.sha256");
  });

  it("uploads bytes only: it never inserts, publishes, or widens visibility", () => {
    expect(importer).not.toMatch(/\bdb\s*\.\s*insert\(/);
    expect(importer).not.toMatch(/\bdb\s*\.\s*update\(/);
    expect(importer).not.toMatch(/isPublished:\s*true/);
    expect(importer).not.toMatch(/visibility:\s*['"]affiliate['"]/);
    // A row that is not internal is reported, not repaired.
    expect(importer).toContain("fix it in the admin page");
  });

  it("treats a missing row as a message rather than a failure, so the upload can run first", () => {
    expect(importer).toMatch(/if \(!row\) \{[\s\S]*continue;/);
  });
});
