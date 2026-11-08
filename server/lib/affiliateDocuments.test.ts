import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateDocuments } from "../../drizzle/schema";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", () => ({ getDb: getDbMock }));

import {
  affiliateDocumentGate,
  affiliateDocumentMimeMatches,
  affiliateDocumentView,
  decodeAffiliateDocumentUpload,
  displayNameFor,
  hasRequiredDocuments,
  loadCurrentAffiliateDocuments,
  sniffAffiliateDocumentMime,
} from "./affiliateDocuments";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const pdf = Buffer.from("%PDF-1.4 trailing");
const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(8)]);
const heif = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmif1"), Buffer.alloc(8)]);
const text = Buffer.from("hello, definitely not a photo");

describe("byte sniffing", () => {
  it("identifies the four accepted families and nothing else", () => {
    expect(sniffAffiliateDocumentMime(jpeg)).toBe("image/jpeg");
    expect(sniffAffiliateDocumentMime(png)).toBe("image/png");
    expect(sniffAffiliateDocumentMime(pdf)).toBe("application/pdf");
    expect(sniffAffiliateDocumentMime(heic)).toBe("image/heic");
    expect(sniffAffiliateDocumentMime(heif)).toBe("image/heic");
    expect(sniffAffiliateDocumentMime(text)).toBeNull();
    expect(sniffAffiliateDocumentMime(Buffer.alloc(0))).toBeNull();
  });

  it("requires the claimed type and the bytes to agree", () => {
    expect(affiliateDocumentMimeMatches("image/jpeg", "image/jpeg")).toBe(true);
    expect(affiliateDocumentMimeMatches("application/pdf", "application/pdf")).toBe(true);
    expect(affiliateDocumentMimeMatches("image/heif", "image/heic")).toBe(true);
    expect(affiliateDocumentMimeMatches("image/png", "image/jpeg")).toBe(false);
    expect(affiliateDocumentMimeMatches("image/jpeg", null)).toBe(false);
    expect(affiliateDocumentMimeMatches("application/pdf", "image/png")).toBe(false);
  });
});

describe("upload decoding", () => {
  it("accepts a data URL as well as bare base64", () => {
    expect(decodeAffiliateDocumentUpload(`data:image/jpeg;base64,${jpeg.toString("base64")}`)).toEqual(jpeg);
    expect(decodeAffiliateDocumentUpload(jpeg.toString("base64"))).toEqual(jpeg);
    expect(decodeAffiliateDocumentUpload(jpeg.toString("base64").replace(/(.{8})/g, "$1\n"))).toEqual(jpeg);
  });

  it("refuses empty, malformed, and oversized input", () => {
    expect(() => decodeAffiliateDocumentUpload("")).toThrow(/could not be read/);
    expect(() => decodeAffiliateDocumentUpload("not base64 !!")).toThrow(/could not be read/);
    const oversized = `data:application/pdf;base64,${Buffer.alloc(10 * 1024 * 1024 + 32, 0x41).toString("base64")}`;
    expect(() => decodeAffiliateDocumentUpload(oversized)).toThrow(/10 MB or smaller/);
  });

  it("exactly 10 MB is allowed", () => {
    const atLimit = Buffer.alloc(10 * 1024 * 1024, 0x41);
    expect(decodeAffiliateDocumentUpload(atLimit.toString("base64")).length).toBe(atLimit.length);
  });
});

describe("display name", () => {
  it("strips path separators and keeps only a harmless label", () => {
    expect(displayNameFor("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(displayNameFor("license.png")).toBe("license.png");
    expect(displayNameFor("   ")).toBeNull();
    expect(displayNameFor(undefined)).toBeNull();
    expect(displayNameFor("a".repeat(400))?.length).toBe(200);
  });

  it("masks digit runs so a Social Security number in a filename is never stored", () => {
    expect(displayNameFor("ssn 123-45-6789.jpg")).toBe("ssn ###-##-####.jpg");
    expect(displayNameFor("license_20261107.png")).toBe("license_####.png");
    expect(displayNameFor("ssn 123-45-6789.jpg")).not.toContain("6789");
    expect(displayNameFor("123456789.png")).toBe("####.png");
  });
});

describe("affiliateDocumentView", () => {
  it("never carries the storage key or a url", () => {
    const view = affiliateDocumentView({
      id: 3,
      docType: "ssn_card",
      status: "pending",
      mimeType: "image/png",
      sizeBytes: 12,
      originalName: "card.png",
      note: null,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      reviewedAt: null,
      supersededAt: null,
      storageKey: "affiliate-documents/7/ssn_card-1.png",
      url: "/manus-storage/affiliate-documents/7/ssn_card-1.png",
    } as never);
    expect(view).toMatchObject({ id: 3, docType: "ssn_card", status: "pending", superseded: false });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("affiliate-documents/");
    expect(serialized).not.toContain("manus-storage");
  });
});

describe("hasRequiredDocuments", () => {
  const rows: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    rows.length = 0;
    getDbMock.mockReset();
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => rows,
            then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => (
              Promise.resolve(rows).then(resolve, reject)
            ),
          }),
        }),
      }),
    });
  });

  it("returns false when the database is unavailable, without throwing", async () => {
    getDbMock.mockResolvedValue(null);
    await expect(hasRequiredDocuments(7)).resolves.toBe(false);
  });

  it("reads only current rows and requires all three approvals", async () => {
    rows.push(
      { id: 1, docType: "driver_license", status: "approved", supersededAt: null },
      { id: 2, docType: "ssn_card", status: "approved", supersededAt: null },
      { id: 3, docType: "business_card", status: "pending", supersededAt: null },
    );
    await expect(hasRequiredDocuments(7)).resolves.toBe(false);
    rows[2].status = "approved";
    await expect(hasRequiredDocuments(7)).resolves.toBe(true);

    const gate = await affiliateDocumentGate(7);
    expect(gate.hasRequiredDocuments).toBe(true);
    expect(gate.documents.map((document) => document.status)).toEqual(["approved", "approved", "approved"]);
  });

  it("accepts an explicit database handle so callers can reuse one connection", async () => {
    const db = await getDbMock();
    rows.push(
      { id: 1, docType: "driver_license", status: "approved", supersededAt: null },
      { id: 2, docType: "ssn_card", status: "approved", supersededAt: null },
      { id: 3, docType: "business_card", status: "approved", supersededAt: null },
    );
    getDbMock.mockClear();
    await expect(hasRequiredDocuments(7, db)).resolves.toBe(true);
    expect(getDbMock).not.toHaveBeenCalled();
    await expect(loadCurrentAffiliateDocuments(db, 7)).resolves.toHaveLength(3);
    expect(db).toBeTruthy();
    expect(affiliateDocuments).toBeTruthy();
  });
});
