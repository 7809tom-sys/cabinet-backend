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

import { affiliateOwnerCanReadW9Key, canReadStorageKey, privateStorageDecision } from "./storageAccess";

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

  it("keeps onboarding documents off the path-based proxy for everyone, admins included", async () => {
    const key = "affiliate-documents/7/driver_license-1794000000000.jpg";
    expect(privateStorageDecision(key, null)).toBe("affiliate-document");
    expect(privateStorageDecision(key, owner)).toBe("affiliate-document");
    expect(privateStorageDecision(key, { ...owner, role: "admin" })).toBe("affiliate-document");
    // There is no allow branch for this prefix, so a forwarded URL is worthless.
    await expect(canReadStorageKey(key, owner)).resolves.toBe(false);
    await expect(canReadStorageKey(key, { ...owner, id: 1, role: "admin" })).resolves.toBe(false);
    await expect(canReadStorageKey(key, null)).resolves.toBe(false);
  });

  it("keeps salesperson IDs and non-compete files off the public proxy, including for admins", async () => {
    for (const key of [
      "salesperson-identity/4/id-front.jpg",
      "salesperson-legal-documents/non-compete.pdf",
      "salesperson-legal-signatures/4/signed_pdf.pdf",
    ]) {
      expect(privateStorageDecision(key, null)).toBe("affiliate-document");
      expect(privateStorageDecision(key, { ...owner, role: "admin" })).toBe("affiliate-document");
      await expect(canReadStorageKey(key, { ...owner, role: "admin" })).resolves.toBe(false);
      await expect(canReadStorageKey(key, owner)).resolves.toBe(false);
    }
  });
});
