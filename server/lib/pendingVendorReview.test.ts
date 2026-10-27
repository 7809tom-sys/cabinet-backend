import { describe, expect, it } from "vitest";
import { buildPendingVendorReview, type ReviewVendor } from "./pendingVendorReview";

const uscd = { id: 4, code: "USCD", name: "US Cabinet Depot", isActive: true };
const pelicanLine = { id: 9, code: "PEL", name: "Pelican", isActive: true };

function vendor(partial: Partial<ReviewVendor> & Pick<ReviewVendor, "id" | "name">): ReviewVendor {
  return {
    sourceKey: null,
    contactEmail: "",
    linkedDistributorIds: null,
    isApproved: true,
    isCabinetVendor: true,
    ...partial,
  };
}

describe("pending vendor review", () => {
  it("lists applications, unapproved records, and catalog lines with no vendor record", () => {
    const review = buildPendingVendorReview({
      vendors: [
        vendor({ id: 1, name: "US Cabinet Depot", sourceKey: "dist:4", isApproved: true, isCabinetVendor: true }),
        vendor({
          id: 2,
          name: "Saunders Closets",
          sourceKey: "saunders-closets",
          isApproved: false,
          isCabinetVendor: null,
          contactEmail: "",
        }),
      ],
      distributors: [uscd, pelicanLine, { id: 11, code: "NEW", name: "New Line Cabinets", isActive: true }],
      applications: [{
        id: 8,
        companyName: "Example Millwork",
        contactName: "Alex Example",
        email: "alex@example.com",
        phone: null,
        website: null,
        categories: "Cabinets",
        status: "pending",
      }],
      referencedDistributorIds: [4, 11],
      pelicanProductCount: 3,
    });

    expect(review.count).toBe(4);
    expect(review.items.map((item) => item.key)).toEqual([
      "application:8",
      "vendor:2",
      "distributor:11",
      "catalog:pelican",
    ]);
    const saunders = review.items.find((item) => item.vendorId === 2);
    expect(saunders).toMatchObject({
      kind: "vendor-record",
      isCabinetVendor: null,
      draft: null,
    });
    expect(saunders?.detail).toMatch(/not approved/i);
    expect(saunders?.detail).toMatch(/checkbox has not been chosen/i);
    expect(review.items.find((item) => item.key === "distributor:11")?.draft).toMatchObject({
      name: "New Line Cabinets",
      sourceKey: "dist:11",
      contactEmail: "",
      isApproved: false,
      isCabinetVendor: null,
    });
    expect(review.items.find((item) => item.applicationId === 8)?.draft?.contactEmail).toBe("alex@example.com");
  });

  it("does not list a supplier line that already has an approved vendor, and does not auto-approve anything", () => {
    const review = buildPendingVendorReview({
      vendors: [
        vendor({ id: 3, name: "Pelican Surfaces", sourceKey: "pelican", isApproved: true, isCabinetVendor: false }),
        vendor({ id: 4, name: "Held", sourceKey: "dist:11", isApproved: false, isCabinetVendor: null }),
      ],
      distributors: [pelicanLine, { id: 11, code: "NEW", name: "New Line Cabinets", isActive: true }],
      applications: [],
      referencedDistributorIds: [9, 11],
      pelicanProductCount: 12,
    });
    expect(review.items.map((item) => item.key)).toEqual(["vendor:4"]);
    expect(review.items.every((item) => item.draft?.isApproved !== true)).toBe(true);
  });

  it("asks for a cabinet choice on an approved vendor whose flag is still unset", () => {
    const review = buildPendingVendorReview({
      vendors: [vendor({ id: 6, name: "Unset Supplier", isApproved: true, isCabinetVendor: null })],
      distributors: [],
      applications: [],
      referencedDistributorIds: [],
      pelicanProductCount: 0,
    });
    expect(review.items).toHaveLength(1);
    expect(review.items[0]?.detail).toMatch(/checkbox has not been chosen/i);
    expect(review.items[0]?.detail).not.toMatch(/not approved/i);
  });
});
