import { describe, expect, it } from "vitest";
import { resolveInstallationEstimateAffiliateId } from "./installationEstimateAccess";

const affiliates = [
  { id: 10, userId: 100, email: "owner@example.com" },
  { id: 20, userId: null, email: "other@example.com" },
];

describe("installation estimate affiliate access", () => {
  it("honors an administrator’s explicit affiliate target", () => {
    expect(resolveInstallationEstimateAffiliateId({
      user: { id: 1, email: "admin@example.com", role: "admin" },
      requestedAffiliateId: 20,
      affiliates,
      memberships: [],
    })).toBe(20);
  });

  it("keeps an affiliate owner scoped to their own record rather than a requested fallback", () => {
    expect(resolveInstallationEstimateAffiliateId({
      user: { id: 100, email: "owner@example.com", role: "partner" },
      requestedAffiliateId: 20,
      affiliates,
      memberships: [],
    })).toBe(10);
  });

  it("allows only active CRM-enabled team membership and ignores an earlier inaccessible membership", () => {
    expect(resolveInstallationEstimateAffiliateId({
      user: { id: 200, email: "rep@example.com", role: "user" },
      affiliates,
      memberships: [
        { affiliateId: 10, userId: 200, email: "rep@example.com", isActive: true, accessCrm: false },
        { affiliateId: 20, userId: 200, email: "rep@example.com", isActive: true, accessCrm: true },
      ],
    })).toBe(20);
  });

  it("does not guess an owner when one email is on two affiliates", () => {
    expect(resolveInstallationEstimateAffiliateId({
      user: { id: 500, email: "shared@example.com", role: "user" },
      affiliates: [
        { id: 10, userId: null, email: "shared@example.com" },
        { id: 20, userId: null, email: "shared@example.com" },
      ],
      memberships: [],
    })).toBeNull();
  });

  it("denies inactive or non-CRM team members", () => {
    expect(resolveInstallationEstimateAffiliateId({
      user: { id: 300, email: "blocked@example.com", role: "user" },
      affiliates,
      memberships: [{ affiliateId: 10, userId: 300, email: "blocked@example.com", isActive: false, accessCrm: true }],
    })).toBeNull();
  });

  it("requires both CRM and Designer permission only when importing a plan", () => {
    const input = { user: { id: 400, email: "team@example.com", role: "user" }, affiliates,
      memberships: [{ affiliateId: 10, userId: 400, email: "team@example.com", isActive: true, accessCrm: true, accessDesigner: false }] };
    expect(resolveInstallationEstimateAffiliateId(input)).toBe(10);
    expect(resolveInstallationEstimateAffiliateId({ ...input, requireDesigner: true })).toBeNull();
    expect(resolveInstallationEstimateAffiliateId({ ...input, requireDesigner: true,
      memberships: [{ ...input.memberships[0], accessDesigner: true }] })).toBe(10);
    expect(resolveInstallationEstimateAffiliateId({ ...input, requireDesigner: true,
      memberships: [{ ...input.memberships[0], accessCrm: false, accessDesigner: true }] })).toBeNull();
  });
});
