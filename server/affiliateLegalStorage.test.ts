/**
 * Signed contracts and their audit trails are private, and there is exactly one
 * way to read them.
 *
 * These assertions protect the part that is easy to lose later: no prefix rule
 * may start serving a signed contract from a public or authenticated path, so
 * the only reader stays affiliateLegal.signedCopyLink (owner or admin).
 */
import { describe, expect, it } from "vitest";
import { PRIVATE_BUCKET, PUBLIC_BUCKET, bucketForKey } from "./storage";
import { canReadStorageKey, privateStorageDecision } from "./lib/storageAccess";

const SIGNED_PDF = "affiliate-legal-signatures/a3/v21/signed-7.pdf";
const AUDIT_LOG = "affiliate-legal-signatures/a3/v21/audit-7.pdf";
const CONTRACT_PDF = "affiliate-legal-documents/11/v1-agreement.pdf";

const admin = { id: 1, role: "admin", email: "admin@cabinetdealz.test", distributorId: null };
const owner = { id: 42, role: "partner", email: "ada@example.test", distributorId: null };

describe("legal contract storage", () => {
  it("keeps contracts, signed copies, and audit trails in the private bucket", () => {
    for (const key of [SIGNED_PDF, AUDIT_LOG, CONTRACT_PDF]) {
      expect(bucketForKey(key)).toBe(PRIVATE_BUCKET);
      expect(bucketForKey(key)).not.toBe(PUBLIC_BUCKET);
    }
  });

  it("never serves a signed copy from a storage path, even to an admin", async () => {
    // Admins reach a signed copy through signedCopyLink, which issues a
    // short-lived URL. The proxy path stays closed so a leaked key cannot be
    // used by an arbitrary signed-in session.
    expect(privateStorageDecision(SIGNED_PDF, admin)).toBe("deny");
    expect(privateStorageDecision(SIGNED_PDF, owner)).toBe("deny");
    expect(await canReadStorageKey(SIGNED_PDF, admin)).toBe(false);
    expect(await canReadStorageKey(SIGNED_PDF, owner)).toBe(false);
  });

  it("never serves a contract PDF or an audit trail from a storage path either", () => {
    for (const key of [AUDIT_LOG, CONTRACT_PDF]) {
      expect(privateStorageDecision(key, admin)).toBe("deny");
      expect(privateStorageDecision(key, owner)).toBe("deny");
      expect(privateStorageDecision(key, null)).toBe("deny");
    }
  });

  it("keeps the prefixes distinct from the affiliate-resource prefix, which is also private", () => {
    expect(bucketForKey("affiliate-resources/files/brochure.pdf")).toBe(PRIVATE_BUCKET);
    expect(privateStorageDecision("affiliate-resources/files/brochure.pdf", owner)).toBe("deny");
  });
});
