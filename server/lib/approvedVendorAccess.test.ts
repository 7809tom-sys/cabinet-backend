import { describe, expect, it } from "vitest";
import {
  approvedVendorContactDistributorId,
  approvedVendorMatchesDistributor,
} from "./approvedVendorAccess";

const distributors = [
  { id: 210001, code: "UCD", isActive: true },
  { id: 210002, code: "MAD", isActive: true },
  { id: 210003, code: "HOLD", isActive: false },
];

describe("approved vendor supplier portal access", () => {
  it("matches only the explicit source key formats", () => {
    expect(approvedVendorMatchesDistributor({ sourceKey: "dist:210001" }, distributors[0])).toBe(true);
    expect(approvedVendorMatchesDistributor({ sourceKey: "ucd" }, distributors[0])).toBe(true);
    expect(approvedVendorMatchesDistributor({ sourceKey: "pelican" }, { id: 99, code: "PEL" })).toBe(true);
    expect(approvedVendorMatchesDistributor({ sourceKey: "supplier name" }, distributors[0])).toBe(false);
  });

  it("links the exact approved contact email to one active supplier line", () => {
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { sourceKey: "dist:210001", contactEmail: " Supplier@Example.com ", isApproved: true },
      ], distributors)
    ).toBe(210001);
  });

  it("does not grant an inactive, unapproved, unmatched, or ambiguous vendor line", () => {
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { sourceKey: "dist:210003", contactEmail: "supplier@example.com", isApproved: true },
      ], distributors)
    ).toBeNull();
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { sourceKey: "dist:210001", contactEmail: "supplier@example.com", isApproved: false },
      ], distributors)
    ).toBeNull();
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { sourceKey: "unknown", contactEmail: "supplier@example.com", isApproved: true },
      ], distributors)
    ).toBeNull();
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { sourceKey: "dist:210001", contactEmail: "supplier@example.com", isApproved: true },
        { sourceKey: "dist:210002", contactEmail: "supplier@example.com", isApproved: true },
      ], distributors)
    ).toBeNull();
  });
});
