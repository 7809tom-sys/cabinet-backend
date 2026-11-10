import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

import { affiliateLiteratureRouter } from "./routers/affiliateLiterature";
import { resetAffiliateLiteratureSchemaCache } from "./lib/affiliateLiteratureSchema";

const admin = { id: 1, email: "tom@example.com", role: "admin", name: "Tom" };
const nonAdmin = { id: 9, email: "person@example.com", role: "user", name: "Person" };

function caller(user: { id: number; role: string } | null) {
  return affiliateLiteratureRouter.createCaller({ user } as never);
}

/**
 * The production error exactly as TiDB returned it through Drizzle during the
 * 6 Nov 2026 outage: the wrapper names the query, the driver text is on `cause`.
 */
function unknownColumn(column: string): Error {
  const error = new Error("Failed query: select `affiliate_literature`.* from `affiliate_literature`");
  (error as { cause?: unknown }).cause = {
    code: "ER_BAD_FIELD_ERROR",
    errno: 1054,
    sqlState: "42S22",
    sqlMessage: `Unknown column 'affiliate_literature.${column}' in 'field list'`,
  };
  return error;
}

const libraryRow = {
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
  uploadedBy: 1,
  createdAt: new Date("2026-11-06T12:00:00Z"),
  updatedAt: new Date("2026-11-06T12:00:00Z"),
};

/**
 * A database shaped like production before docs/sql/0269 ran: the table exists,
 * the four hand-added columns do not. Selecting any of them fails the way TiDB
 * failed it, so a fallback that is not really wired in cannot pass this.
 */
function dbWithoutVisibilityColumns(options: { failWith?: Error } = {}) {
  const statements: string[][] = [];
  return {
    statements,
    select: (fields: Record<string, unknown>) => {
      statements.push(Object.keys(fields));
      return {
        from: () => ({
          orderBy: async () => {
            if (options.failWith) throw options.failWith;
            const absent = ["visibility", "affiliateToggledAt", "affiliateToggledBy", "affiliateToggledByName"]
              .find((name) => fields[name]);
            if (absent) throw unknownColumn(absent);
            return [{ ...libraryRow }];
          },
          where: async () => [],
        }),
      };
    },
  };
}

beforeEach(() => {
  resetAffiliateLiteratureSchemaCache();
  getDbMock.mockReset();
  vi.restoreAllMocks();
});

describe("affiliateLiterature.adminList through a deploy with no visibility columns", () => {
  it("returns the library instead of answering 500", async () => {
    const db = dbWithoutVisibilityColumns();
    getDbMock.mockResolvedValue(db);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const rows = await caller(admin).adminList();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 7,
      title: libraryRow.title,
      fileKey: libraryRow.fileKey,
      isPublished: false,
      // The documented default before the column exists.
      visibility: "internal",
      affiliateToggledAt: null,
      affiliateToggledBy: null,
      affiliateToggledByName: null,
    });
    // The first statement asked for everything, the last one did not.
    expect(db.statements.length).toBeGreaterThan(1);
    expect(db.statements[0]).toContain("visibility");
    expect(db.statements.at(-1)).not.toContain("visibility");
    expect(warn).toHaveBeenCalled();
  });

  it("returns the same rows as the pre-0255 release once the columns are back", async () => {
    getDbMock.mockResolvedValue(dbWithoutVisibilityColumns());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const withoutColumns = await caller(admin).adminList();
    resetAffiliateLiteratureSchemaCache();

    // A database that has the columns: same shape, real values, one statement.
    const statements: string[][] = [];
    getDbMock.mockResolvedValue({
      select: (fields: Record<string, unknown>) => {
        statements.push(Object.keys(fields));
        return {
          from: () => ({
            orderBy: async () => [{
              ...libraryRow,
              visibility: "affiliate",
              affiliateToggledAt: new Date("2026-11-05T09:00:00Z"),
              affiliateToggledBy: 1,
              affiliateToggledByName: "Tom",
            }],
            where: async () => [],
          }),
        };
      },
    });
    const withColumns = await caller(admin).adminList();

    expect(statements[0]).toContain("visibility");
    expect(statements.filter((fields) => fields.includes("visibility"))).toHaveLength(1);
    expect(Object.keys(withColumns[0]).sort()).toEqual(Object.keys(withoutColumns[0]).sort());
    expect(withColumns[0].id).toBe(withoutColumns[0].id);
    expect(withColumns[0].title).toBe(withoutColumns[0].title);
    expect(withColumns[0].visibility).toBe("affiliate");
  });

  it("logs the driver's own message, so the next outage is not silent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("Failed query: select `affiliate_literature`.* from `affiliate_literature`");
    (failure as { cause?: unknown }).cause = {
      code: "ER_LOCK_WAIT_TIMEOUT",
      errno: 1205,
      sqlMessage: "Lock wait timeout exceeded; try restarting transaction",
    };
    getDbMock.mockResolvedValue(dbWithoutVisibilityColumns({ failWith: failure }));

    await expect(caller(admin).adminList()).rejects.toThrow("Failed query: select");

    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("adminList");
    // The detail Drizzle hides behind "Failed query:" is what makes this useful.
    expect(logged).toContain("Lock wait timeout exceeded");
  });

  it("keeps the non-admin rejection ahead of any database read", async () => {
    const db = dbWithoutVisibilityColumns();
    getDbMock.mockResolvedValue(db);

    // adminProcedure answers 403 for both, before any handler runs. That is why
    // the live endpoint looks healthy today: nobody who can reach the query has
    // opened the library since the columns were last seen working.
    await expect(caller(nonAdmin).adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(null).adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.statements).toHaveLength(0);
    expect(getDbMock).not.toHaveBeenCalled();
  });
});

describe("affiliateLiterature writes through the same window", () => {
  it("saves an internal upload without the optional columns and names the SQL file when a toggle is refused", async () => {
    const writes: Array<Record<string, unknown>> = [];
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          writes.push(values);
          const absent = ["visibility", "affiliateToggledAt", "affiliateToggledBy", "affiliateToggledByName"]
            .find((name) => name in values);
          if (absent) throw unknownColumn(absent);
          return [{ insertId: 12 }];
        },
      }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await caller(admin).adminUpload({
      title: "Internal proposal",
      category: "Internal",
      filename: "proposal.pdf",
      mimeType: "application/pdf",
      dataBase64: Buffer.from("%PDF-1.4").toString("base64"),
      inAffiliateLibrary: false,
    });

    expect(writes.length).toBeGreaterThan(1);
    expect(writes.at(-1)).not.toHaveProperty("visibility");
    expect(writes.at(-1)).toMatchObject({ title: "Internal proposal", isPublished: false });
    expect(result.id).toBe(12);
  });

  it("answers PRECONDITION_FAILED with the SQL file name instead of silently dropping a toggle", async () => {
    getDbMock.mockResolvedValue({
      update: () => ({
        set: () => ({
          where: async () => {
            throw unknownColumn("visibility");
          },
        }),
      }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(caller(admin).adminUpdate({ id: 7, inAffiliateLibrary: true })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("docs/sql/0269_library_visibility_columns.tidb.sql"),
    });
  });
});
