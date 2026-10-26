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

const published = {
  id: 5,
  type: "pdf",
  title: "Published brochure",
  body: null,
  url: null,
  category: "brochure",
  metaJson: null,
  sortOrder: 0,
  isPublished: true,
  featured: false,
  filename: "brochure.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10,
  fileKey: "affiliate-resources/files/brochure.pdf",
  thumbnailKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const draft = { ...published, id: 6, title: "EXAMPLE DRAFT", isPublished: false, fileKey: "affiliate-resources/files/draft.pdf" };

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

const user = { id: 9, email: "person@example.com", role: "user" };
const affiliateAccess = {
  affiliateId: 3,
  isOwner: false,
  accessCrm: true,
  accessDesigner: false,
  accessMarketing: false,
  teamMemberId: 8,
};

describe("affiliate resource access", () => {
  beforeEach(() => {
    signedMock.mockClear();
    accessMock.mockReset();
    getDbMock.mockReset();
  });

  it("does not let a non-affiliate read published resources", async () => {
    getDbMock.mockResolvedValue(dbWith([]));
    accessMock.mockResolvedValue(null);
    const caller = affiliateResourcesRouter.createCaller({ user } as never);
    await expect(caller.published()).rejects.toThrow(/Affiliate access required/);
    await expect(caller.publishedLiterature()).rejects.toThrow(/Affiliate access required/);
    await expect(caller.signedFile({ id: 5, kind: "file" })).rejects.toThrow(/Affiliate access required/);
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("lets an affiliate read published rows and not unpublished files", async () => {
    getDbMock.mockResolvedValue(dbWith([published, draft]));
    accessMock.mockResolvedValue(affiliateAccess);
    const caller = affiliateResourcesRouter.createCaller({ user } as never);
    const rows = await caller.published();
    expect(rows.map((row) => row.title)).toEqual(["Published brochure"]);
    expect(rows[0]?.fileKey).toBeNull();
  });

  it("does not sign an unpublished file for an affiliate", async () => {
    getDbMock.mockResolvedValue(dbWith([draft]));
    accessMock.mockResolvedValue(affiliateAccess);
    const caller = affiliateResourcesRouter.createCaller({ user } as never);
    await expect(caller.signedFile({ id: draft.id, kind: "file" })).rejects.toThrow(/not available/);
    expect(signedMock).not.toHaveBeenCalled();
  });

  it("does not let an affiliate write resources", async () => {
    const caller = affiliateResourcesRouter.createCaller({ user } as never);
    await expect(caller.adminSave({
      type: "guide",
      title: "Nope",
      category: "designer",
    })).rejects.toThrow(/permission/);
    await expect(caller.adminSetPublished({ id: 5, isPublished: true })).rejects.toThrow(/permission/);
    await expect(caller.adminDelete({ id: 5 })).rejects.toThrow(/permission/);
  });
});
