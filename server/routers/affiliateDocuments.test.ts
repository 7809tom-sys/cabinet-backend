/**
 * Affiliate onboarding document uploads (driver's license, Social Security
 * card, business card, optional reseller certificate).
 *
 * Everything here runs against an in-memory table map and a stubbed storage
 * client: no database, no Supabase, and no real file ever leaves the process.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateDocuments, affiliates } from "../../drizzle/schema";

const { getDbMock, accessMock, putMock, signedMock, deleteMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
  putMock: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })),
  signedMock: vi.fn(async (key: string) => `https://signed.example/${key}`),
  deleteMock: vi.fn(async () => undefined),
}));

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/affiliateAccess", () => ({ resolveAffiliateAccess: accessMock }));
vi.mock("../storage", () => ({
  PRIVATE_BUCKET: "private-files",
  storagePut: putMock,
  storageGetSignedUrl: signedMock,
  storageDeleteFromBucket: deleteMock,
}));

import { affiliateDocumentsRouter } from "./affiliateDocuments";
import { hasRequiredDocuments } from "../lib/affiliateDocuments";

type Row = Record<string, unknown>;
type State = {
  affiliates: Row[];
  documents: Row[];
  nextId: number;
  updates: Row[];
  puts: string[];
};

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const pdfBytes = Buffer.from("%PDF-1.7\nbody");
const heicBytes = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(8)]);
const textBytes = Buffer.from("not a document at all");

const base64 = (bytes: Buffer) => bytes.toString("base64");

/** Drizzle conditions are node trees, not strings; flatten and interpret the few comparisons used here. */
function flatten(node: unknown, out: unknown[] = []): unknown[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, out);
    return out;
  }
  if (typeof node === "object") {
    const name = (node as { constructor?: { name?: string } }).constructor?.name;
    if (name === "StringChunk") {
      const raw = (node as { value?: unknown }).value;
      out.push(Array.isArray(raw) ? raw.join("") : String(raw ?? ""));
      return out;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (chunks) {
      for (const chunk of chunks) flatten(chunk, out);
      return out;
    }
    // Column and Param nodes.
    out.push(node);
    return out;
  }
  out.push(node);
  return out;
}

const isColumnNode = (node: unknown) =>
  !!node && typeof node === "object" && typeof (node as { name?: unknown }).name === "string"
  && !Array.isArray((node as { queryChunks?: unknown[] }).queryChunks);

const paramValue = (node: unknown) => (node as { value?: unknown })?.value;

/** Only eq() and isNull() are emitted by the router. */
function matches(condition: unknown, row: Row): boolean {
  if (condition == null) return true;
  const tokens = flatten(condition);
  let result = true;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!isColumnNode(token)) continue;
    const column = (token as { name: string }).name;
    const operator = String(tokens[index + 1] ?? "").trim().toLowerCase();
    if (operator === "is null") {
      result = result && (row[column] ?? null) === null;
      index += 1;
      continue;
    }
    if (operator === "!=" || operator === "<>") {
      const expected = paramValue(tokens[index + 2]);
      index += 2;
      result = result && (row[column] ?? null) !== (expected ?? null);
      continue;
    }
    if (operator.includes("=")) {
      const expected = paramValue(tokens[index + 2]);
      index += 2;
      result = result && (row[column] ?? null) === (expected ?? null);
    }
  }
  return result;
}

function memoryDb(state: State) {
  const rowsFor = (table: unknown): Row[] => {
    if (table === affiliates) return state.affiliates;
    if (table === affiliateDocuments) return state.documents;
    throw new Error("Unexpected table in affiliate document test");
  };

  const selectBuilder = (table: unknown, projection?: Record<string, unknown>) => {
    let condition: unknown;
    let joinedAffiliate = false;
    const matched = () => rowsFor(table).filter((row) => matches(condition, row));

    /** A left join on affiliates supplies the store columns; the fake fills them in. */
    const withJoin = (row: Row): Row => {
      if (!joinedAffiliate || table !== affiliateDocuments) return row;
      const store = state.affiliates.find((candidate) => candidate.id === row.affiliateId);
      return {
        ...row,
        storeName: store?.storeName ?? null,
        slug: store?.slug ?? null,
        affiliateEmail: store?.email ?? null,
      };
    };

    const shape = (row: Row): Row => {
      if (!projection) return { ...withJoin(row) };
      const source = withJoin(row);
      const out: Row = {};
      for (const [key, column] of Object.entries(projection)) {
        const name = (column as { name?: string }).name;
        if (name) {
          out[key] = source[name];
          continue;
        }
        // A whole-table projection: keep every column of the row.
        if (column === affiliateDocuments) {
          Object.assign(out, source);
          continue;
        }
        // `count(*)` has no column; the row count is what it asks for.
        out[key] = matched().length;
      }
      return out;
    };

    const builder: Record<string, unknown> = {
      leftJoin: () => {
        joinedAffiliate = true;
        return builder;
      },
      where: (next: unknown) => {
        condition = next;
        return builder;
      },
      orderBy: () => builder,
      limit: async (count: number) => matched().slice(0, count).map(shape),
      then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) => (
        Promise.resolve(matched().map(shape)).then(resolve, reject)
      ),
    };
    return builder;
  };

  const applyUpdate = (table: unknown, patch: Row, condition: unknown) => {
    let changed = 0;
    for (const row of rowsFor(table)) {
      if (!matches(condition, row)) continue;
      Object.assign(row, patch);
      changed += 1;
    }
    state.updates.push({ table: String(table === affiliateDocuments ? "documents" : "other"), ...patch });
    return { affectedRows: changed };
  };

  const db = {
    select: (projection?: Record<string, unknown>) => ({
      from: (table: unknown) => selectBuilder(table, projection),
    }),
    insert: (table: unknown) => ({
      values: async (values: Row) => {
        if (table !== affiliateDocuments) throw new Error("Unexpected insert");
        const id = state.nextId++;
        state.documents.push({
          id,
          status: "pending",
          note: null,
          reviewedAt: null,
          reviewedBy: null,
          uploadedBy: null,
          originalName: null,
          supersededAt: null,
          supersededByDocumentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...values,
        });
        return [{ insertId: id }];
      },
    }),
    update: (table: unknown) => ({
      set: (patch: Row) => ({
        where: async (condition: unknown) => applyUpdate(table, patch, condition),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };

  getDbMock.mockResolvedValue(db);
  return state;
}

function state(overrides: Partial<State> = {}): State {
  return {
    affiliates: [
      { id: 7, storeName: "Ada's Cabinets", slug: "ada", email: "ada@shop.test" },
      { id: 9, storeName: "Bea's Cabinets", slug: "bea", email: "bea@shop.test" },
    ],
    documents: [],
    nextId: 1,
    updates: [],
    puts: [],
    ...overrides,
  };
}

const owner = (id = 11) => accessMock.mockResolvedValue({
  affiliateId: 7,
  isOwner: true,
  accessCrm: true,
  accessDesigner: true,
  accessMarketing: true,
  teamMemberId: null,
});
const otherOwner = () => accessMock.mockResolvedValue({
  affiliateId: 9,
  isOwner: true,
  accessCrm: true,
  accessDesigner: true,
  accessMarketing: false,
  teamMemberId: null,
});

function caller(user: { id: number; email: string | null; role: string } | null) {
  return affiliateDocumentsRouter.createCaller({ user } as never);
}

const affiliateUser = { id: 11, email: "ada@shop.test", role: "partner" as const };
const otherAffiliateUser = { id: 12, email: "bea@shop.test", role: "partner" as const };
const adminUser = { id: 1, email: "admin@cabinetdealz.test", role: "admin" as const };

async function uploadAllRequired(affiliateCaller = caller(affiliateUser)) {
  await affiliateCaller.upload({ docType: "driver_license", mimeType: "image/jpeg", fileBase64: base64(jpegBytes) });
  await affiliateCaller.upload({ docType: "ssn_card", mimeType: "image/png", fileBase64: base64(pngBytes) });
  await affiliateCaller.upload({ docType: "business_card", mimeType: "application/pdf", fileBase64: base64(pdfBytes) });
}

beforeEach(() => {
  getDbMock.mockReset();
  accessMock.mockReset();
  putMock.mockClear();
  signedMock.mockClear();
  deleteMock.mockClear();
  owner();
});

describe("affiliate document upload", () => {
  it("stores the driver's license under the private prefix and returns no path or key", async () => {
    const db = memoryDb(state());
    const result = await caller(affiliateUser).upload({
      docType: "driver_license",
      mimeType: "image/jpeg",
      fileBase64: base64(jpegBytes),
      fileName: "../../my license.jpg",
    });

    expect(putMock).toHaveBeenCalledTimes(1);
    const storedKey = putMock.mock.calls[0][0] as unknown as string;
    expect(storedKey).toMatch(/^affiliate-documents\/7\/driver_license-\d+\.jpg$/);
    // The client's filename never reaches the key.
    expect(storedKey).not.toContain("my");
    expect(storedKey).not.toContain("..");
    expect(db.documents).toHaveLength(1);
    expect(db.documents[0]).toMatchObject({
      affiliateId: 7,
      docType: "driver_license",
      status: "pending",
      mimeType: "image/jpeg",
      storageKey: storedKey,
      originalName: ".._.._my license.jpg",
      uploadedBy: 11,
    });
    expect(result.ok).toBe(true);
    // The response view carries metadata only: no storage key, no URL.
    expect(JSON.stringify(result)).not.toContain("affiliate-documents/");
    expect(JSON.stringify(result)).not.toContain("manus-storage");
    expect(JSON.stringify(result)).not.toContain("signed.example");
  });

  it("accepts HEIC (an iPhone photo) and PDF", async () => {
    const db = memoryDb(state());
    await caller(affiliateUser).upload({ docType: "driver_license", mimeType: "image/heic", fileBase64: base64(heicBytes) });
    await caller(affiliateUser).upload({ docType: "business_card", mimeType: "application/pdf", fileBase64: base64(pdfBytes) });
    expect(db.documents.map((row) => row.mimeType)).toEqual(["image/heic", "application/pdf"]);
    expect(db.documents.map((row) => row.storageKey)).toEqual([
      expect.stringMatching(/\.heic$/),
      expect.stringMatching(/\.pdf$/),
    ]);
  });

  it("refuses a file whose bytes are not the type it claims to be", async () => {
    const db = memoryDb(state());
    await expect(caller(affiliateUser).upload({
      docType: "ssn_card",
      mimeType: "image/jpeg",
      fileBase64: base64(textBytes),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.documents).toHaveLength(0);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("refuses a type that is not on the allow list and never touches storage", async () => {
    memoryDb(state());
    await expect(caller(affiliateUser).upload({
      docType: "business_card",
      mimeType: "image/svg+xml",
      fileBase64: base64(pngBytes),
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller(affiliateUser).upload({
      docType: "passport",
      mimeType: "image/png",
      fileBase64: base64(pngBytes),
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(putMock).not.toHaveBeenCalled();
  });

  it("refuses a document over 10 MB before decoding it", async () => {
    memoryDb(state());
    const tooBig = Buffer.alloc(10 * 1024 * 1024 + 16, 0x41);
    await expect(caller(affiliateUser).upload({
      docType: "driver_license",
      mimeType: "application/pdf",
      fileBase64: tooBig.toString("base64"),
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Documents must be 10 MB or smaller." });
    expect(putMock).not.toHaveBeenCalled();
  });

  it("keeps history on replace: the old upload is superseded, the new one starts pending", async () => {
    const db = memoryDb(state());
    const first = await caller(affiliateUser).upload({
      docType: "driver_license",
      mimeType: "image/jpeg",
      fileBase64: base64(jpegBytes),
    });
    const firstId = (first.document as { id: number }).id;
    await caller(adminUser).adminReview({ documentId: firstId, action: "approve" });

    const second = await caller(affiliateUser).upload({
      docType: "driver_license",
      mimeType: "image/png",
      fileBase64: base64(pngBytes),
    });
    const secondId = (second.document as { id: number }).id;

    expect(db.documents).toHaveLength(2);
    const old = db.documents.find((row) => row.id === firstId)!;
    expect(old.status).toBe("approved");
    expect(old.supersededAt).toBeInstanceOf(Date);
    expect(old.supersededByDocumentId).toBe(secondId);
    // The replacement is unreviewed, so the driver's license does not count yet.
    expect(db.documents.find((row) => row.id === secondId)).toMatchObject({ status: "pending", supersededAt: null });
  });

  it("deletes the stored bytes when the row cannot be saved, so no orphan copy of a license is left", async () => {
    const db = memoryDb(state());
    // Force the insert to fail after the upload has already landed.
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => ({ orderBy: async () => db.documents, limit: async () => db.affiliates.slice(0, 1) }) }),
      }),
      insert: () => ({
        values: async () => {
          throw new Error("insert failed");
        },
      }),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        insert: () => ({
          values: async () => {
            throw new Error("insert failed");
          },
        }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      }),
    });

    await expect(caller(affiliateUser).upload({
      docType: "ssn_card",
      mimeType: "image/png",
      fileBase64: base64(pngBytes),
    })).rejects.toThrow(/insert failed/);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith("private-files", putMock.mock.calls[0][0]);
  });
});

describe("access control", () => {
  it("requires a signed-in affiliate owner", async () => {
    memoryDb(state());
    await expect(caller(null).status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    accessMock.mockResolvedValue(null);
    await expect(caller({ id: 90, email: "nobody@shop.test", role: "user" }).status())
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    // A team member with CRM access is still not the owner: the license and SSN
    // card are the owner's, not the store's.
    accessMock.mockResolvedValue({
      affiliateId: 7,
      isOwner: false,
      accessCrm: true,
      accessDesigner: true,
      accessMarketing: true,
      teamMemberId: 3,
    });
    await expect(caller({ id: 40, email: "manager@shop.test", role: "user" }).status())
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the affiliate owner can manage onboarding documents." });
    await expect(caller({ id: 40, email: "manager@shop.test", role: "user" }).upload({
      docType: "ssn_card",
      mimeType: "image/png",
      fileBase64: base64(pngBytes),
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not let one affiliate read another affiliate's documents or signed link", async () => {
    const db = memoryDb(state());
    await caller(affiliateUser).upload({ docType: "ssn_card", mimeType: "image/png", fileBase64: base64(pngBytes) });
    const documentId = db.documents[0].id as number;

    otherOwner();
    const other = caller(otherAffiliateUser);
    const status = await other.status();
    expect(status.affiliateId).toBe(9);
    expect(status.uploads).toEqual([]);
    expect(status.hasRequiredDocuments).toBe(false);

    await expect(other.link({ documentId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("refuses admin review and admin lists to non-admins", async () => {
    memoryDb(state());
    await expect(caller(affiliateUser).adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(affiliateUser).adminReview({ documentId: 1, action: "approve" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(affiliateUser).adminLink({ documentId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(affiliateUser).adminGate({ affiliateId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("signs a link only for the caller's own current document", async () => {
    const db = memoryDb(state());
    await caller(affiliateUser).upload({ docType: "driver_license", mimeType: "image/jpeg", fileBase64: base64(jpegBytes) });
    const link = await caller(affiliateUser).link({ documentId: db.documents[0].id as number });
    expect(link.expiresInSeconds).toBe(300);
    expect(link.url).toContain("affiliate-documents/7/driver_license-");
    expect(signedMock).toHaveBeenCalledWith(expect.stringContaining("affiliate-documents/7/"), 300);

    // A superseded upload is history, not the document the affiliate may open.
    await caller(affiliateUser).upload({ docType: "driver_license", mimeType: "image/png", fileBase64: base64(pngBytes) });
    await expect(caller(affiliateUser).link({ documentId: db.documents[0].id as number }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("admin review and the onboarding gate", () => {
  it("opens the gate only when all three required documents are approved", async () => {
    const db = memoryDb(state());
    await uploadAllRequired();
    expect(db.documents).toHaveLength(3);

    const before = await caller(affiliateUser).status();
    expect(before.hasRequiredDocuments).toBe(false);
    expect(before.missingDocumentTypes).toEqual(["driver_license", "ssn_card", "business_card"]);

    for (const row of [...db.documents]) {
      const result = await caller(adminUser).adminReview({ documentId: row.id as number, action: "approve" });
      expect(result.ok).toBe(true);
    }

    const after = await caller(affiliateUser).status();
    expect(after.hasRequiredDocuments).toBe(true);
    expect(after.missingDocumentTypes).toEqual([]);
    await expect(hasRequiredDocuments(7)).resolves.toBe(true);
    await expect(hasRequiredDocuments(9)).resolves.toBe(false);
  });

  it("keeps the gate closed while a required document is rejected, and records the note", async () => {
    const db = memoryDb(state());
    await uploadAllRequired();
    for (const row of db.documents.filter((doc) => doc.docType !== "ssn_card")) {
      await caller(adminUser).adminReview({ documentId: row.id as number, action: "approve" });
    }
    const ssnRow = db.documents.find((doc) => doc.docType === "ssn_card")!;
    const rejected = await caller(adminUser).adminReview({
      documentId: ssnRow.id as number,
      action: "reject",
      note: "The card is cut off. Please upload a full photo.",
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.hasRequiredDocuments).toBe(false);
    expect(ssnRow).toMatchObject({
      status: "rejected",
      reviewedBy: 1,
      note: "The card is cut off. Please upload a full photo.",
    });
    expect(ssnRow.reviewedAt).toBeInstanceOf(Date);

    const status = await caller(affiliateUser).status();
    expect(status.requiredDocuments.find((document) => document.docType === "ssn_card")?.status).toBe("rejected");
    expect(status.documents.find((document) => document.docType === "ssn_card")?.required).toBe(true);
    expect(status.documents.find((document) => document.docType === "reseller_certificate")?.required).toBe(false);
  });

  it("does not let an admin review a superseded upload", async () => {
    const db = memoryDb(state());
    await caller(affiliateUser).upload({ docType: "business_card", mimeType: "image/jpeg", fileBase64: base64(jpegBytes) });
    const oldId = db.documents[0].id as number;
    await caller(affiliateUser).upload({ docType: "business_card", mimeType: "image/png", fileBase64: base64(pngBytes) });

    await expect(caller(adminUser).adminReview({ documentId: oldId, action: "approve" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "This upload has been replaced. Review the current document instead." });
  });

  it("lists every pending upload for admins, and one store's uploads when scoped", async () => {
    const db = memoryDb(state());
    await uploadAllRequired();
    otherOwner();
    await caller(otherAffiliateUser).upload({ docType: "driver_license", mimeType: "image/jpeg", fileBase64: base64(jpegBytes) });
    owner();

    const pending = await caller(adminUser).adminList();
    expect(pending.documents).toHaveLength(4);
    expect(pending.pendingCount).toBe(4);
    expect(pending.documents.every((document) => document.status === "pending")).toBe(true);
    expect(pending.documents.map((document) => document.affiliateId)).toEqual(
      expect.arrayContaining([7, 7, 7, 9]),
    );
    expect(pending.documents[0]).toMatchObject({ storeName: expect.any(String) });

    const scoped = await caller(adminUser).adminList({ affiliateId: 7 });
    expect(scoped.documents).toHaveLength(3);
    expect(scoped.documents.every((document) => document.affiliateId === 7)).toBe(true);
    expect(scoped.gate?.hasRequiredDocuments).toBe(false);
    expect(db.documents).toHaveLength(4);

    const count = await caller(adminUser).adminPendingCount();
    expect(count.pending).toBe(4);
  });

  it("gives a reviewer a short-lived link that is built from the stored key, not the request", async () => {
    const db = memoryDb(state());
    await caller(affiliateUser).upload({ docType: "reseller_certificate", mimeType: "application/pdf", fileBase64: base64(pdfBytes) });
    const link = await caller(adminUser).adminLink({ documentId: db.documents[0].id as number });
    expect(link).toMatchObject({ affiliateId: 7, docType: "reseller_certificate", expiresInSeconds: 300, superseded: false });
    expect(link.url).toContain("affiliate-documents/7/reseller_certificate-");
    expect(signedMock).toHaveBeenCalledWith(expect.stringContaining("affiliate-documents/7/"), 300);
  });

  it("reports one store's gate to an admin and refuses an unknown store", async () => {
    const db = memoryDb(state());
    await uploadAllRequired();
    for (const row of [...db.documents]) {
      await caller(adminUser).adminReview({ documentId: row.id as number, action: "approve" });
    }
    const gate = await caller(adminUser).adminGate({ affiliateId: 7 });
    expect(gate).toMatchObject({ affiliateId: 7, storeName: "Ada's Cabinets", hasRequiredDocuments: true });
    expect(gate.requiredDocuments.map((document) => document.status)).toEqual(["approved", "approved", "approved"]);
    expect(gate.optionalDocumentTypes).toEqual(["reseller_certificate"]);

    await expect(caller(adminUser).adminGate({ affiliateId: 404 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
