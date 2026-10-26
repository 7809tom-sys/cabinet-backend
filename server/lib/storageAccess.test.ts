import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => ({ rows: [] as Array<{ userId: number | null; email: string | null }> }));

vi.mock("../db", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => lookup.rows,
        }),
      }),
    }),
  }),
}));

import { affiliateOwnerCanReadW9Key, privateStorageDecision } from "./storageAccess";

const owner = { id: 9, role: "user", email: "owner@example.com", distributorId: null };

describe("storage access decisions", () => {
  beforeEach(() => {
    lookup.rows = [];
  });

  it("allows public keys anonymously and refuses private keys", () => {
    expect(privateStorageDecision("media-library/logo.jpg", null)).toBe("public");
    expect(privateStorageDecision("ocr-uploads/u7-quote.jpg", null)).toBe("deny");
    expect(privateStorageDecision("affiliate-w9-id/license.jpg", null)).toBe("deny");
    expect(privateStorageDecision("door-match-uploads/sample.jpg", owner)).toBe("deny");
  });

  it("allows the uploading user, the matching distributor, and an admin", () => {
    expect(privateStorageDecision("ocr-uploads/u7-quote.jpg", { ...owner, id: 7 })).toBe("allow");
    expect(privateStorageDecision("ocr-uploads/u7-quote.jpg", owner)).toBe("deny");
    expect(privateStorageDecision("distributor-catalogs/4/file.pdf", { ...owner, role: "distributor", distributorId: 4 })).toBe("allow");
    expect(privateStorageDecision("vendor-products-source/4/file.csv", { ...owner, role: "distributor", distributorId: 8 })).toBe("deny");
    expect(privateStorageDecision("affiliate-w9-id/license.jpg", { ...owner, role: "admin" })).toBe("allow");
    expect(privateStorageDecision("affiliate-w9-id/license.jpg", owner)).toBe("owner-check");
  });

  it("lets only the affiliate owner read a government ID key", async () => {
    lookup.rows = [{ userId: 9, email: "owner@example.com" }];
    await expect(affiliateOwnerCanReadW9Key(owner, "affiliate-w9-id/license.jpg")).resolves.toBe(true);
    await expect(affiliateOwnerCanReadW9Key({ ...owner, id: 4, email: "team@example.com" }, "affiliate-w9-id/license.jpg")).resolves.toBe(false);
  });
});
