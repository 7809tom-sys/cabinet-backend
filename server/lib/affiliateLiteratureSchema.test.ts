import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LIBRARY_OPTIONAL_COLUMNS,
  LIBRARY_VISIBILITY_MIGRATION,
  LibrarySchemaError,
  isMissingLiteratureColumnError,
  knownMissingLiteratureColumns,
  literatureColumns,
  missingLiteratureColumns,
  readLiteratureRows,
  rememberMissingLiteratureColumns,
  resetAffiliateLiteratureSchemaCache,
  stripMissingLibraryColumns,
  toLibraryDocumentRow,
  writeLiteratureRow,
} from "./affiliateLiteratureSchema";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The exact error TiDB returns through Drizzle. The wrapper's own message is
 * "Failed query: select ...", which names no column, so the driver text lives
 * on `cause`. Anything that reads only `message` cannot see this.
 */
function unknownColumn(column: string): Error {
  const error = new Error("Failed query: select `id`, `visibility` from `affiliate_literature`");
  (error as { cause?: unknown }).cause = {
    code: "ER_BAD_FIELD_ERROR",
    errno: 1054,
    sqlState: "42S22",
    sqlMessage: `Unknown column 'affiliate_literature.${column}' in 'field list'`,
  };
  return error;
}

const baseRow = {
  id: 7,
  title: "How to Create an App for an Affiliate",
  description: "Internal ops guide.",
  category: "Internal",
  filename: "how-to-create-an-app-for-an-affiliate.md",
  fileKey: "library-documents/internal/how-to-create-an-app-for-an-affiliate.md",
  url: "/manus-storage/library-documents/internal/how-to-create-an-app-for-an-affiliate.md",
  mimeType: "text/plain",
  sizeBytes: 8025,
  isPublished: false,
  sortOrder: 901,
  uploadedBy: null,
  createdAt: new Date("2026-11-06T12:00:00Z"),
  updatedAt: new Date("2026-11-06T12:05:00Z"),
};

const fullRow = {
  ...baseRow,
  visibility: "affiliate",
  affiliateToggledAt: new Date("2026-11-05T09:00:00Z"),
  affiliateToggledBy: 1,
  affiliateToggledByName: "Tom",
};

beforeEach(() => {
  resetAffiliateLiteratureSchemaCache();
});

afterEach(() => {
  resetAffiliateLiteratureSchemaCache();
  vi.restoreAllMocks();
});

describe("reading the library without the visibility columns", () => {
  it("returns the row with internal defaults when visibility is the only column missing", async () => {
    const seen: string[][] = [];
    const rows = await readLiteratureRows(async (fields) => {
      seen.push(Object.keys(fields));
      if (fields.visibility) throw unknownColumn("visibility");
      return [{ ...baseRow }];
    });

    // The first statement asked for the columns; the retry left out only visibility.
    expect(seen[0]).toEqual(expect.arrayContaining([...LIBRARY_OPTIONAL_COLUMNS]));
    expect(seen[1]).not.toContain("visibility");
    expect(seen[1]).toContain("affiliateToggledAt");

    expect(rows).toHaveLength(1);
    expect(rows[0].visibility).toBe("internal");
    expect(rows[0].affiliateToggledAt).toBeNull();
    expect(rows[0].affiliateToggledBy).toBeNull();
    expect(rows[0].affiliateToggledByName).toBeNull();
    // Everything that did exist is untouched.
    expect(rows[0].id).toBe(7);
    expect(rows[0].title).toBe(baseRow.title);
    expect(rows[0].fileKey).toBe(baseRow.fileKey);
    expect(rows[0].isPublished).toBe(false);
    expect(rows[0].sizeBytes).toBe(8025);
  });

  it("drops every optional column when the whole 0255/0269 batch never ran", async () => {
    const seen: string[][] = [];
    const rows = await readLiteratureRows(async (fields) => {
      seen.push(Object.keys(fields));
      const absent = LIBRARY_OPTIONAL_COLUMNS.find((name) => fields[name]);
      if (absent) throw unknownColumn(absent);
      return [{ ...baseRow }];
    });

    expect(rows[0].visibility).toBe("internal");
    // One attempt per optional column, then the read that succeeds.
    expect(seen).toHaveLength(LIBRARY_OPTIONAL_COLUMNS.length + 1);
    expect(seen.at(-1)).not.toEqual(expect.arrayContaining([...LIBRARY_OPTIONAL_COLUMNS]));
    expect(new Set(knownMissingLiteratureColumns())).toEqual(new Set(LIBRARY_OPTIONAL_COLUMNS));
  });

  it("returns every column's real value when the columns exist", async () => {
    const rows = await readLiteratureRows(async () => [{ ...fullRow }]);
    expect(rows[0]).toEqual({
      ...baseRow,
      visibility: "affiliate",
      affiliateToggledAt: new Date("2026-11-05T09:00:00Z"),
      affiliateToggledBy: 1,
      affiliateToggledByName: "Tom",
    });
  });

  it("rethrows a failure that is not a missing column", async () => {
    const failure = new Error("Failed query: select ...");
    (failure as { cause?: unknown }).cause = { code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205 };
    await expect(readLiteratureRows(async () => { throw failure; })).rejects.toBe(failure);
    // A deadlock must not teach the process that a column is absent.
    expect(knownMissingLiteratureColumns()).toEqual([]);
  });

  it("rethrows when a base column is the one TiDB cannot find", async () => {
    // fileKey has existed since the table was created: the library really is broken.
    const failure = unknownColumn("fileKey");
    await expect(readLiteratureRows(async () => { throw failure; })).rejects.toBe(failure);
  });

  it("remembers the miss, so the next read asks for fewer columns", async () => {
    let statements = 0;
    const query = async (fields: Record<string, unknown>) => {
      statements += 1;
      if (fields.visibility) throw unknownColumn("visibility");
      return [{ ...baseRow }];
    };

    await readLiteratureRows(query);
    expect(statements).toBe(2);
    await readLiteratureRows(query);
    // The second call already knows and makes one statement, not two.
    expect(statements).toBe(3);
  });

  it("logs the column and the SQL file once, and never the connection details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await readLiteratureRows(async (fields) => {
      if (fields.visibility) throw unknownColumn("visibility");
      return [{ ...baseRow }];
    });

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("visibility");
    expect(logged).toContain(LIBRARY_VISIBILITY_MIGRATION);
    expect(logged).not.toMatch(/mysql:\/\//);
  });
});

describe("shaping a row", () => {
  it("treats an unknown visibility value as internal, so a hand edit cannot publish", () => {
    expect(toLibraryDocumentRow({ ...fullRow, visibility: "public" }).visibility).toBe("internal");
    expect(toLibraryDocumentRow({ ...fullRow, visibility: null }).visibility).toBe("internal");
  });

  it("accepts the 0/1 that the driver returns for a boolean column", () => {
    expect(toLibraryDocumentRow({ ...fullRow, isPublished: 1 }).isPublished).toBe(true);
    expect(toLibraryDocumentRow({ ...fullRow, isPublished: 0 }).isPublished).toBe(false);
  });
});

describe("detecting the missing column", () => {
  it("walks the Drizzle wrapper into the driver error", () => {
    expect(missingLiteratureColumns(unknownColumn("visibility"))).toEqual(["visibility"]);
    expect(isMissingLiteratureColumnError(unknownColumn("affiliateToggledByName"))).toBe(true);
  });

  it("matches on the plain driver message too, not only the code", () => {
    expect(missingLiteratureColumns(new Error("Unknown column 'visibility' in 'field list'"))).toEqual(["visibility"]);
  });

  it("does not claim a base column, a deadlock, or a broken connection", () => {
    expect(missingLiteratureColumns(unknownColumn("url"))).toEqual([]);
    expect(missingLiteratureColumns(new Error("connect ECONNREFUSED"))).toEqual([]);
    expect(missingLiteratureColumns(null)).toEqual([]);
  });
});

describe("writing a row without the visibility columns", () => {
  it("saves an internal document with the optional columns stripped", async () => {
    rememberMissingLiteratureColumns(LIBRARY_OPTIONAL_COLUMNS);
    const written: Array<Record<string, unknown>> = [];
    await writeLiteratureRow({
      procedure: "adminUpload",
      values: {
        title: "Internal proposal",
        isPublished: false,
        visibility: "internal",
        affiliateToggledAt: null,
        affiliateToggledBy: null,
        affiliateToggledByName: null,
      },
      // An internal document needs none of them.
      requireColumns: [],
      write: async (values) => { written.push(values); return []; },
    });

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ title: "Internal proposal", isPublished: false });
    expect(written[0]).not.toHaveProperty("visibility");
    expect(written[0]).not.toHaveProperty("affiliateToggledAt");
  });

  it("refuses a toggle when the column is missing, instead of half-writing the audit trail", async () => {
    const write = vi.fn(async () => { throw unknownColumn("visibility"); });
    await expect(writeLiteratureRow({
      procedure: "adminUpdate",
      values: { isPublished: true, visibility: "affiliate", affiliateToggledAt: new Date() },
      requireColumns: ["visibility"],
      write,
    })).rejects.toBeInstanceOf(LibrarySchemaError);
    // The first attempt is allowed to ask; the refusal comes before a second
    // statement that would have dropped the column and lost the toggle.
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("refuses the same toggle without touching the database once the miss is known", async () => {
    rememberMissingLiteratureColumns(["visibility"]);
    const write = vi.fn(async () => []);
    await expect(writeLiteratureRow({
      procedure: "adminUpdate",
      values: { isPublished: true, visibility: "affiliate" },
      requireColumns: ["visibility"],
      write,
    })).rejects.toBeInstanceOf(LibrarySchemaError);
    expect(write).not.toHaveBeenCalled();
  });

  it("names the SQL file in the refusal", () => {
    const error = new LibrarySchemaError(["visibility"]);
    expect(error.message).toContain(LIBRARY_VISIBILITY_MIGRATION);
    expect(error.columns).toEqual(["visibility"]);
  });

  it("retries once with the offending column removed and remembers it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const attempts: Array<Record<string, unknown>> = [];
    const result = await writeLiteratureRow({
      procedure: "adminUpload",
      values: { title: "Guide", visibility: "internal", affiliateToggledByName: null },
      write: async (values) => {
        attempts.push(values);
        if (values.visibility) throw unknownColumn("visibility");
        return [{ insertId: 12 }];
      },
    });

    expect(result).toEqual([{ insertId: 12 }]);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).not.toHaveProperty("visibility");
    expect(attempts[1]).toHaveProperty("affiliateToggledByName");
    expect(knownMissingLiteratureColumns()).toEqual(["visibility"]);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps a non-schema failure", async () => {
    const failure = new Error("duplicate entry");
    await expect(writeLiteratureRow({
      procedure: "adminUpdate",
      values: { title: "x" },
      write: async () => { throw failure; },
    })).rejects.toBe(failure);
  });
});

describe("the projection", () => {
  it("always selects every base column, whether or not the optional ones are asked for", () => {
    const full = Object.keys(literatureColumns());
    const minimal = Object.keys(literatureColumns([]));
    for (const column of ["id", "title", "fileKey", "url", "mimeType", "isPublished", "sortOrder", "createdAt"]) {
      expect(minimal).toContain(column);
      expect(full).toContain(column);
    }
    expect(full).toEqual(expect.arrayContaining([...LIBRARY_OPTIONAL_COLUMNS]));
    expect(minimal).not.toEqual(expect.arrayContaining([...LIBRARY_OPTIONAL_COLUMNS]));
  });

  it("drops exactly the columns the driver reported, and nothing else", () => {
    const stripped = stripMissingLibraryColumns(
      { title: "x", visibility: "internal" as const, affiliateToggledBy: 3 },
      ["visibility"],
    );
    expect(stripped).toEqual({ title: "x", affiliateToggledBy: 3 });
  });
});

describe("docs/sql/0269_library_visibility_columns.tidb.sql", () => {
  const sql = read(LIBRARY_VISIBILITY_MIGRATION);
  const statements = (text: string) =>
    text.split("\n").filter((line) => line.trim() && !line.trimStart().startsWith("--"));

  it("adds the four columns as separate, qualified, re-runnable-safe statements", () => {
    expect(sql).toContain("Numbered 0269");
    expect(sql).toContain("ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'internal'");
    expect(sql).toContain("ADD COLUMN affiliateToggledAt DATETIME NULL");
    expect(sql).toContain("ADD COLUMN affiliateToggledBy INT NULL");
    expect(sql).toContain("ADD COLUMN affiliateToggledByName VARCHAR(255) NULL");
    // TiDB Cloud rejects this form, which is why each ALTER is plain. The header
    // comment names it on purpose, to explain why it is gone, so only the
    // executable statements are checked.
    for (const statement of statements(sql)) {
      expect(statement).not.toMatch(/IF NOT EXISTS/i);
    }
    // A re-run answers "Duplicate column name", not silence.
    expect(sql).toContain("Duplicate column name");
  });

  it("keeps one statement per line, every table qualified, and no data mutation", () => {
    for (const line of statements(sql)) {
      expect(line.startsWith(" ")).toBe(false);
      expect(line.trim().endsWith(";")).toBe(true);
      // information_schema is read by name, so it is the one unqualified table.
      if (!line.includes("information_schema")) expect(line).toMatch(/cabinet_dealz\./);
    }
    expect(sql).not.toMatch(/^\s*UPDATE\b/im);
    expect(sql).not.toMatch(/^\s*DELETE\b/im);
    expect(sql).not.toMatch(/^\s*DROP\b/im);
  });

  it("verifies the columns before it reads them, and puts visibility first", () => {
    const firstAlter = sql.indexOf("ADD COLUMN visibility");
    const verify = sql.indexOf("SELECT column_name AS presentColumn");
    expect(firstAlter).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(firstAlter);
  });
});
