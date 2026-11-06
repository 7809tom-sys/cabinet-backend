import { beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * The admin library's Open button asks `affiliateResources.adminSignedFile` for a
 * short-lived link, because a literature row's `url` is a private-bucket path the
 * public storage proxy refuses. This pins the contract the admin page relies on:
 * `{ id }` in, `{ url, filename, mimeType }` out, admins only.
 */
const internalDocument = {
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
  visibility: "internal",
  affiliateToggledAt: null,
  affiliateToggledBy: null,
  affiliateToggledByName: null,
  sortOrder: 901,
  uploadedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function dbWith(rows: unknown[]) {
  const whereResult = Object.assign(Promise.resolve(rows), {
    orderBy: async () => rows,
    limit: async () => rows,
  });
  return {
    select: () => ({
      from: () => ({
        orderBy: async () => rows,
        where: () => whereResult,
      }),
    }),
  };
}

const admin = { id: 1, email: "tom@example.com", role: "admin", name: "Tom" };
const nonAdmin = { id: 9, email: "person@example.com", role: "user" };
const affiliateAccess = {
  affiliateId: 3,
  isOwner: false,
  accessCrm: true,
  accessDesigner: false,
  accessMarketing: false,
  teamMemberId: 8,
};

describe("affiliateResources.adminSignedFile", () => {
  beforeEach(() => {
    signedMock.mockClear();
    accessMock.mockReset();
    getDbMock.mockReset();
  });

  it("signs an internal document for an admin without asking for affiliate access", async () => {
    getDbMock.mockResolvedValue(dbWith([internalDocument]));
    const caller = affiliateResourcesRouter.createCaller({ user: admin } as never);

    const file = await caller.adminSignedFile({ id: internalDocument.id });

    expect(file).toEqual({
      url: `https://signed.example/${internalDocument.fileKey}`,
      filename: internalDocument.filename,
      mimeType: internalDocument.mimeType,
    });
    // Signing an admin document must not be gated behind affiliate membership.
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-admin before the row is read", async () => {
    getDbMock.mockResolvedValue(dbWith([internalDocument]));
    const caller = affiliateResourcesRouter.createCaller({ user: nonAdmin } as never);

    await expect(caller.adminSignedFile({ id: internalDocument.id })).rejects.toThrow(/permission/);
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller", async () => {
    getDbMock.mockResolvedValue(dbWith([internalDocument]));
    const caller = affiliateResourcesRouter.createCaller({ user: null } as never);

    await expect(caller.adminSignedFile({ id: internalDocument.id })).rejects.toThrow(/permission/);
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND for an id that is not a library document", async () => {
    getDbMock.mockResolvedValue(dbWith([]));
    const caller = affiliateResourcesRouter.createCaller({ user: admin } as never);

    await expect(caller.adminSignedFile({ id: 4242 })).rejects.toThrow(/not available/);
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("keeps signing an affiliate-library document for an admin after the toggle", async () => {
    const toggled = { ...internalDocument, isPublished: true, visibility: "affiliate" };
    getDbMock.mockResolvedValue(dbWith([toggled]));
    const caller = affiliateResourcesRouter.createCaller({ user: admin } as never);

    const file = await caller.adminSignedFile({ id: toggled.id });
    expect(file.url).toContain(toggled.fileKey);
  });

  it("stays unreachable for an affiliate who only has portal access", async () => {
    getDbMock.mockResolvedValue(dbWith([internalDocument]));
    accessMock.mockResolvedValue(affiliateAccess);
    const caller = affiliateResourcesRouter.createCaller({ user: nonAdmin } as never);

    await expect(caller.adminSignedFile({ id: internalDocument.id })).rejects.toThrow(/permission/);
    expect(signedMock).not.toHaveBeenCalled();
  });
});
