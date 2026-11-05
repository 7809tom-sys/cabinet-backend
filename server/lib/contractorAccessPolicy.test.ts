import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canManageAffiliateContractorDesk,
  contractorRequestSource,
  findAffiliatePendingMatch,
  findPendingDuplicate,
  isApprovedUnlinkedContractorRequest,
  normalizeContractorEmail,
  type AffiliateScopedRequestIdentity,
  type ContractorRequestIdentity,
} from "./contractorAccessPolicy";

function row(over: Partial<ContractorRequestIdentity> & Pick<ContractorRequestIdentity, "id">): ContractorRequestIdentity {
  return {
    userId: null,
    contractorEmail: null,
    status: "pending",
    ...over,
  };
}

describe("contractor access affiliate desk policy", () => {
  it("allows affiliate accounts (stored as partner), the affiliate label, and admin", () => {
    expect(canManageAffiliateContractorDesk("partner")).toBe(true);
    expect(canManageAffiliateContractorDesk("affiliate")).toBe(true);
    expect(canManageAffiliateContractorDesk("admin")).toBe(true);
    for (const role of ["user", "contractor", "designer", "distributor", "dealer", "sales_rep"]) {
      expect(canManageAffiliateContractorDesk(role)).toBe(false);
    }
  });

  it("normalizes contractor email", () => {
    expect(normalizeContractorEmail("  Pat@Example.com ")).toBe("pat@example.com");
    expect(normalizeContractorEmail("")).toBeNull();
    expect(normalizeContractorEmail(null)).toBeNull();
  });

  it("treats a self-service pending row and an affiliate pending row as the same request", () => {
    const selfService = row({ id: 4, userId: 8, contractorEmail: null });
    const affiliate = row({ id: 7, userId: null, contractorEmail: "Pat@Shop.test" });
    const other = row({ id: 1, userId: 99, contractorEmail: "other@shop.test" });
    const approved = row({ id: 9, userId: 8, contractorEmail: "pat@shop.test", status: "approved" });

    expect(findPendingDuplicate([other, approved, selfService], {
      userId: 8,
      contractorEmail: "pat@shop.test",
    })?.id).toBe(4);

    expect(findPendingDuplicate([other, affiliate], {
      userId: 8,
      contractorEmail: "PAT@shop.test",
    })?.id).toBe(7);

    expect(findPendingDuplicate([other, approved], {
      userId: 8,
      contractorEmail: "pat@shop.test",
    })).toBeNull();
  });

  it("links only an approved request that has this email and no account yet", () => {
    expect(isApprovedUnlinkedContractorRequest(
      { userId: null, contractorEmail: "Pat@Shop.test", status: "approved" },
      " pat@shop.test ",
    )).toBe(true);
    expect(isApprovedUnlinkedContractorRequest(
      { userId: null, contractorEmail: "pat@shop.test", status: "pending" },
      "pat@shop.test",
    )).toBe(false);
    expect(isApprovedUnlinkedContractorRequest(
      { userId: 8, contractorEmail: "pat@shop.test", status: "approved" },
      "pat@shop.test",
    )).toBe(false);
    expect(isApprovedUnlinkedContractorRequest(
      { userId: null, contractorEmail: "other@shop.test", status: "approved" },
      "pat@shop.test",
    )).toBe(false);
  });

  it("marks affiliate-submitted rows by the submitter", () => {
    expect(contractorRequestSource(null)).toBe("self");
    expect(contractorRequestSource(undefined)).toBe("self");
    expect(contractorRequestSource(9)).toBe("affiliate");
  });
});

describe("affiliate store-scoped pending check", () => {
  function scoped(
    over: Partial<AffiliateScopedRequestIdentity> & Pick<AffiliateScopedRequestIdentity, "id">,
  ): AffiliateScopedRequestIdentity {
    return {
      userId: null,
      contractorEmail: null,
      status: "pending",
      affiliateId: null,
      submittedByUserId: null,
      ...over,
    };
  }

  it("treats the same store's own pending row as a duplicate", () => {
    const own = scoped({ id: 7, contractorEmail: "pat@shop.test", affiliateId: 70, submittedByUserId: 9 });
    expect(findAffiliatePendingMatch([own], { contractorEmail: "PAT@shop.test", affiliateId: 70 }))
      .toMatchObject({ kind: "same-store", row: { id: 7 } });

    const linked = scoped({ id: 8, userId: 8, affiliateId: 70, submittedByUserId: 9 });
    expect(findAffiliatePendingMatch([linked], { userId: 8, affiliateId: 70 }))
      .toMatchObject({ kind: "same-store", row: { id: 8 } });
  });

  it("adopts only a pending row with no store and no submitter", () => {
    const orphan = scoped({ id: 5, userId: 8, contractorEmail: "pat@shop.test" });
    expect(findAffiliatePendingMatch([orphan], { userId: 8, contractorEmail: "pat@shop.test", affiliateId: 70 }))
      .toEqual({ kind: "adopt", row: orphan });

    // A house row another submitter already filed is not adoptable.
    const claimed = scoped({ id: 6, contractorEmail: "pat@shop.test", submittedByUserId: 3 });
    expect(findAffiliatePendingMatch([claimed], { contractorEmail: "pat@shop.test", affiliateId: 70 })).toBeNull();
  });

  it("ignores another store's pending row instead of revealing or adopting it", () => {
    const otherStore = scoped({ id: 9, contractorEmail: "pat@shop.test", affiliateId: 80, submittedByUserId: 10 });
    expect(findAffiliatePendingMatch([otherStore], { contractorEmail: "pat@shop.test", affiliateId: 70 })).toBeNull();
    expect(findAffiliatePendingMatch([otherStore], { contractorEmail: "pat@shop.test", affiliateId: null })).toBeNull();
  });

  it("ignores approved or rejected rows and prefers the caller's own account row", () => {
    const approved = scoped({ id: 2, contractorEmail: "pat@shop.test", affiliateId: 70, status: "approved" });
    const ownStore = scoped({ id: 3, contractorEmail: "pat@shop.test", affiliateId: 70 });
    const byAccount = scoped({ id: 4, userId: 8, affiliateId: 70 });
    const orphan = scoped({ id: 1, contractorEmail: "pat@shop.test" });

    expect(findAffiliatePendingMatch([approved], { contractorEmail: "pat@shop.test", affiliateId: 70 })).toBeNull();
    expect(findAffiliatePendingMatch([orphan, ownStore, byAccount], {
      userId: 8,
      contractorEmail: "pat@shop.test",
      affiliateId: 70,
    })).toMatchObject({ kind: "same-store", row: { id: 4 } });
  });
});

describe("affiliate contractor SQL", () => {
  const sql = readFileSync("docs/sql/0237_affiliate_contractor_requests.tidb.sql", "utf8");

  it("keeps the hand-run TiDB script qualified, idempotent, and free of drizzle migrations", () => {
    expect(sql).toContain("cabinet_dealz.contractor_access_requests");
    expect(sql).toContain("MODIFY COLUMN userId INT NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS submittedByUserId INT NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS contractorName VARCHAR(256) NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS contractorEmail VARCHAR(320) NULL");
    expect(sql).toContain("contractor_access_requests_email_status_idx");
    expect(sql).toContain("(contractorEmail, status)");
    expect(sql).toContain("contractor_access_requests_submitter_idx");
    expect(sql).toContain("(submittedByUserId)");
    expect(sql).not.toMatch(/\bAS\s+(user|order|status|key)\b/i);
    expect(sql.match(/^-- \d+$/gm)).toEqual(["-- 1", "-- 2", "-- 3", "-- 4", "-- 5", "-- 6"]);
  });
});
