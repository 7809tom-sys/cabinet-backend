import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canManageAffiliateContractorDesk,
  contractorRequestSource,
  findPendingDuplicate,
  isApprovedUnlinkedContractorRequest,
  normalizeContractorEmail,
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
