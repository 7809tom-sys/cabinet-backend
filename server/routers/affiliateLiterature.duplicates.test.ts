import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@shared/libraryFileHash";

const { getDbMock, storagePutMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  storagePutMock: vi.fn(async (key: string) => ({ key: `${key}_stored`, url: `/manus-storage/${key}_stored` })),
}));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../storage", () => ({
  storagePut: storagePutMock,
  storageGetSignedUrl: vi.fn(),
}));

import { affiliateLiteratureRouter } from "./affiliateLiterature";
import { resetAffiliateLiteratureSchemaCache } from "../lib/affiliateLiteratureSchema";

const admin = { id: 1, role: "admin", name: "Tom", email: "tom@example.com" };

function caller() {
  return affiliateLiteratureRouter.createCaller({ user: admin } as never);
}

function unknownColumn(column: string): Error {
  const error = new Error("Failed query: select `contentSha256` from `affiliate_literature`");
  (error as { cause?: unknown }).cause = {
    code: "ER_BAD_FIELD_ERROR",
    errno: 1054,
    sqlMessage: `Unknown column 'affiliate_literature.${column}' in 'field list'`,
  };
  return error;
}

describe("document library duplicate warning", () => {
  const writes: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  let deleted = false;
  let hashRows: Array<Record<string, unknown>> = [];
  let selectedMime = "application/pdf";

  beforeEach(() => {
    writes.length = 0;
    updates.length = 0;
    deleted = false;
    hashRows = [];
    selectedMime = "application/pdf";
    storagePutMock.mockClear();
    resetAffiliateLiteratureSchemaCache();
    getDbMock.mockResolvedValue({
      select: (fields: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              if ("title" in fields) return hashRows;
              return [{ id: 9, mimeType: selectedMime }];
            },
          }),
        }),
      }),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          writes.push(values);
          return [{ insertId: 21 }];
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            updates.push(values);
          },
        }),
      }),
      delete: () => ({
        where: async () => {
          deleted = true;
        },
      }),
    });
  });

  it("stores the hash for a new document and does not store a second copy of the same bytes", async () => {
    const bytes = Buffer.from("%PDF-1.7 spring deck");
    const hash = sha256Hex(bytes);
    const first = await caller().adminUpload({
      title: "Spring deck",
      filename: "spring.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      dataBase64: bytes.toString("base64"),
    });
    expect(first).toMatchObject({ id: 21 });
    expect(writes.at(-1)?.contentSha256).toBe(hash);
    expect(storagePutMock).toHaveBeenCalledTimes(1);

    hashRows = [{
      id: 21,
      title: "Spring deck",
      filename: "spring.pptx",
      url: "/manus-storage/library-documents/spring.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileKey: "library-documents/spring.pptx",
    }];
    storagePutMock.mockClear();
    await expect(caller().adminUpload({
      title: "Spring deck copy",
      filename: "spring-copy.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      dataBase64: bytes.toString("base64"),
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("library id 21"),
    });
    expect(storagePutMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
  });

  it("still accepts a document when the hash column has not been pasted, and says so", async () => {
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              throw unknownColumn("contentSha256");
            },
          }),
        }),
      }),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          writes.push(values);
          return [{ insertId: 22 }];
        },
      }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await caller().adminUpload({
      title: "Price list",
      filename: "prices.pdf",
      mimeType: "application/pdf",
      dataBase64: Buffer.from("%PDF-1.4").toString("base64"),
    });
    expect(result.id).toBe(22);
    expect(writes.at(-1)).not.toHaveProperty("contentSha256");
    expect(warn.mock.calls.flat().join(" ")).toContain("docs/sql/0273_library_commercials_content_hash.tidb.sql");
  });

  it("archives a commercial from the library delete action and still deletes a document row", async () => {
    selectedMime = "video/mp4";
    const archived = await caller().adminDelete({ id: 9 });
    expect(archived).toEqual({ id: 9, archived: true });
    expect(updates[0]).toMatchObject({ isPublished: false, archivedBy: admin.id });
    expect(updates[0].archivedAt).toBeInstanceOf(Date);
    expect(deleted).toBe(false);

    selectedMime = "application/pdf";
    updates.length = 0;
    const removed = await caller().adminDelete({ id: 9 });
    expect(removed).toEqual({ id: 9, archived: false });
    expect(deleted).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("does not let a video through the document upload allowlist", async () => {
    await expect(caller().adminUpload({
      title: "Spot",
      filename: "spot.mp4",
      mimeType: "video/mp4",
      dataBase64: Buffer.from("not-a-real-check").toString("base64"),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storagePutMock).not.toHaveBeenCalled();
  });
});
