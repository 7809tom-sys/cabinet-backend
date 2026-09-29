import { describe, expect, it } from "vitest";
import {
  approvedVendorContactAccess,
  approvedVendorContactDistributorId,
  approvedVendorMatchesDistributor,
  approvedVendorSourceDistributorId,
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
    expect(approvedVendorMatchesDistributor({ sourceKey: "UCD" }, { id: 210002, code: "USCD" })).toBe(true);
  });

  it("resolves one active source key without ever using a vendor name", () => {
    expect(approvedVendorSourceDistributorId("dist:210001", distributors)).toBe(210001);
    expect(approvedVendorSourceDistributorId("mad", distributors)).toBe(210002);
    expect(approvedVendorSourceDistributorId("pelican", [{ id: 9, code: "PEL", isActive: true }])).toBe(9);
    expect(approvedVendorSourceDistributorId("dist:210003", distributors)).toBeNull();
    expect(approvedVendorSourceDistributorId("Kitchen Crest", distributors)).toBeNull();
    expect(approvedVendorSourceDistributorId(null, distributors)).toBeNull();
    expect(approvedVendorSourceDistributorId("UCD", [{ id: 210002, code: "USCD", isActive: true }])).toBe(210002);
  });

  it("links the exact approved contact email to one active supplier line", () => {
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { id: 1, sourceKey: "dist:210001", contactEmail: " Supplier@Example.com ", isApproved: true },
      ], distributors)
    ).toBe(210001);
  });

  it("does not grant an inactive, unapproved, unmatched, or ambiguous vendor line", () => {
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { id: 1, sourceKey: "dist:210003", contactEmail: "supplier@example.com", isApproved: true },
      ], distributors)
    ).toBeNull();
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { id: 1, sourceKey: "dist:210001", contactEmail: "supplier@example.com", isApproved: false },
      ], distributors)
    ).toBeNull();
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { id: 1, sourceKey: "unknown", contactEmail: "supplier@example.com", isApproved: true },
      ], distributors)
    ).toBeNull();
    expect(
      approvedVendorContactDistributorId("supplier@example.com", [
        { id: 1, sourceKey: "dist:210001", contactEmail: "supplier@example.com", isApproved: true },
        { id: 2, sourceKey: "dist:210002", contactEmail: "supplier@example.com", isApproved: true },
      ], distributors)
    ).toBeNull();
  });

  it("gives one approved contact its own vendor record before a catalog line is linked", () => {
    expect(approvedVendorContactAccess("vendor@example.com", [
      { id: 7, sourceKey: null, contactEmail: "vendor@example.com", isApproved: true },
    ], distributors)).toEqual({ vendorLineId: 7, distributorId: null });
  });
});
