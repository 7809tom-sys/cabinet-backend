import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { getDbMock, accessMock, signedMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
  signedMock: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./lib/affiliateAccess", () => ({ resolveAffiliateAccess: accessMock }));
vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageGetSignedUrl: signedMock,
}));

import { affiliateResourcesRouter } from "./routers/affiliateResources";
import { resetAffiliateLiteratureSchemaCache } from "./lib/affiliateLiteratureSchema";

const affiliate = { id: 5, email: "affiliate@example.com", role: "user", name: "Affiliate" };
const admin = { id: 1, email: "tom@example.com", role: "admin", name: "Tom" };
const affiliateAccess = {
  affiliateId: 3,
  isOwner: false,
  accessCrm: false,
  accessDesigner: false,
  accessMarketing: true,
  teamMemberId: 8,
};

const internalRow = {
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
  visibility: "internal",
  affiliateToggledAt: null,
  affiliateToggledBy: null,
  affiliateToggledByName: null,
};

const affiliateRow = { ...internalRow, id: 8, title: "Brochure", isPublished: true, visibility: "affiliate" };

function unknownColumn(column: string): Error {
  const error = new Error("Failed query: select ... from `affiliate_literature`");
  (error as { cause?: unknown }).cause = {
    code: "ER_BAD_FIELD_ERROR",
    errno: 1054,
    sqlMessage: `Unknown column 'affiliate_literature.${column}' in 'field list'`,
  };
  return error;
}

const OPTIONAL = ["visibility", "affiliateToggledAt", "affiliateToggledBy", "affiliateToggledByName"];

/**
 * A database shaped like production before docs/sql/0269 ran: the table exists,
 * the four hand-added columns do not, and asking for one fails the way TiDB
 * failed it. `rows` are returned by whichever statement does not ask for them.
 */
function dbWithoutVisibilityColumns(rows: unknown[]) {
  return {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        orderBy: async () => {
          const absent = OPTIONAL.find((name) => fields[name]);
          if (absent) throw unknownColumn(absent);
          return rows;
        },
        where: () => ({
          orderBy: async () => rows,
          limit: async () => {
            const absent = OPTIONAL.find((name) => fields[name]);
            if (absent) throw unknownColumn(absent);
            return rows;
          },
        }),
      }),
    }),
  };
}

beforeEach(() => {
  resetAffiliateLiteratureSchemaCache();
  getDbMock.mockReset();
  accessMock.mockReset();
  signedMock.mockClear();
  vi.restoreAllMocks();
});

describe("affiliateResources.publishedLiterature without the visibility column", () => {
  it("reads the library anyway and never shows an internal document", async () => {
    getDbMock.mockResolvedValue(dbWithoutVisibilityColumns([internalRow, { ...internalRow, id: 9 }]));
    accessMock.mockResolvedValue(affiliateAccess);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const caller = affiliateResourcesRouter.createCaller({ user: affiliate } as never);

    // No 500. A missing visibility column reads as internal, so nothing is eligible.
    await expect(caller.publishedLiterature()).resolves.toEqual([]);
  });

  it("shows an affiliate document from a database that has the columns", async () => {
    // A migrated database: the read succeeds first time, columns and all.
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: async () => [internalRow, affiliateRow] }),
        }),
      }),
    });
    accessMock.mockResolvedValue(affiliateAccess);
    const caller = affiliateResourcesRouter.createCaller({ user: affiliate } as never);

    const rows = await caller.publishedLiterature();
    expect(rows.map((row) => row.title)).toEqual(["Brochure"]);
    // The internal guide is still absent, as it was before this change.
    expect(rows.map((row) => row.id)).not.toContain(internalRow.id);
  });

  it("rethrows a failure that is not a missing column", async () => {
    const failure = new Error("connect ECONNREFUSED 127.0.0.1:4000");
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: async () => { throw failure; } }),
        }),
      }),
    });
    accessMock.mockResolvedValue(affiliateAccess);
    const caller = affiliateResourcesRouter.createCaller({ user: affiliate } as never);

    await expect(caller.publishedLiterature()).rejects.toThrow("ECONNREFUSED");
  });

  it("is unreachable for an affiliate who has never passed the access check", async () => {
    getDbMock.mockResolvedValue(dbWithoutVisibilityColumns([internalRow]));
    accessMock.mockResolvedValue(null);
    const caller = affiliateResourcesRouter.createCaller({ user: affiliate } as never);

    await expect(caller.publishedLiterature()).rejects.toThrow(/Affiliate access required/);
  });
});

describe("affiliateResources.adminSignedFile without the visibility column", () => {
  it("still signs the file, because the Open button needs the key and nothing else", async () => {
    let statements = 0;
    getDbMock.mockResolvedValue({
      select: (fields: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              statements += 1;
              const absent = OPTIONAL.find((name) => fields[name]);
              if (absent) throw unknownColumn(absent);
              return [{ ...internalRow }];
            },
          }),
        }),
      }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const caller = affiliateResourcesRouter.createCaller({ user: admin } as never);

    const file = await caller.adminSignedFile({ id: internalRow.id });

    expect(file).toEqual({
      url: `https://signed.example/${internalRow.fileKey}`,
      filename: internalRow.filename,
      mimeType: internalRow.mimeType,
    });
    expect(statements).toBeGreaterThan(1);
  });

  it("answers NOT_FOUND for an id that is not a library document", async () => {
    getDbMock.mockResolvedValue(dbWithoutVisibilityColumns([]));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const caller = affiliateResourcesRouter.createCaller({ user: admin } as never);

    await expect(caller.adminSignedFile({ id: 4242 })).rejects.toThrow(/not available/);
    expect(signedMock).not.toHaveBeenCalled();
  });
});

describe("every library read goes through the fallback", () => {
  it("leaves no bare select() on affiliate_literature in the server", () => {
    // select() names every column, including the four added by hand, which is
    // exactly what broke on 6 Nov 2026. Named projections or readLiteratureRows.
    for (const path of [
      "server/routers/affiliateLiterature.ts",
      "server/routers/affiliateResources.ts",
      "server/scripts/import-internal-library-documents.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source, path).not.toMatch(/\.select\(\)\s*\.from\(affiliateLiterature\)/);
    }
  });

  it("names the SQL file in the module, so the message and the log cannot drift", () => {
    const module = readFileSync(resolve(process.cwd(), "server/lib/affiliateLiteratureSchema.ts"), "utf8");
    expect(module).toContain("docs/sql/0269_library_visibility_columns.tidb.sql");
  });
});
