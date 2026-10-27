import { approvedVendorMatchesDistributor, type ApprovedVendorAccessRecord } from "./approvedVendorAccess";

export type ReviewVendor = ApprovedVendorAccessRecord & {
  name: string;
  isCabinetVendor: boolean | null;
};

export type ReviewDistributor = {
  id: number;
  code: string;
  name: string;
  isActive?: boolean;
};

export type ReviewApplication = {
  id: number;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  website: string | null;
  categories: string | null;
  status: string;
};

export type PendingVendorReviewItem = {
  key: string;
  kind: "application" | "vendor-record" | "catalog-reference";
  title: string;
  detail: string;
  isCabinetVendor: boolean | null;
  applicationId?: number;
  vendorId?: number;
  distributorId?: number;
  draft: {
    name: string;
    sourceKey: string | null;
    category: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    websiteUrl: string;
    isApproved: false;
    isCabinetVendor: null;
  } | null;
};

function approvedCover(vendors: readonly ReviewVendor[], distributor: ReviewDistributor): boolean {
  return vendors.some((vendor) => vendor.isApproved !== false && approvedVendorMatchesDistributor(vendor, distributor));
}

/**
 * Vendors an administrator still has to act on. Nothing here is approved
 * automatically. Catalog references are distributor lines or Pelican products
 * that do not yet have an approved vendor record.
 */
export function buildPendingVendorReview(input: {
  vendors: readonly ReviewVendor[];
  distributors: readonly ReviewDistributor[];
  applications: readonly ReviewApplication[];
  referencedDistributorIds: readonly number[];
  pelicanProductCount: number;
}): { count: number; items: PendingVendorReviewItem[] } {
  const items: PendingVendorReviewItem[] = [];

  for (const application of input.applications) {
    if (application.status !== "pending") continue;
    items.push({
      key: `application:${application.id}`,
      kind: "application",
      title: application.companyName,
      detail: [
        application.contactName,
        application.email,
        application.categories ? `Categories: ${application.categories}` : null,
      ].filter(Boolean).join(" · "),
      isCabinetVendor: null,
      applicationId: application.id,
      draft: {
        name: application.companyName,
        sourceKey: null,
        category: application.categories ?? "",
        contactName: application.contactName,
        contactEmail: application.email,
        contactPhone: application.phone ?? "",
        websiteUrl: application.website ?? "",
        isApproved: false,
        isCabinetVendor: null,
      },
    });
  }

  for (const vendor of input.vendors) {
    const needsApproval = vendor.isApproved === false;
    const needsCabinetChoice = vendor.isCabinetVendor == null;
    if (!needsApproval && !needsCabinetChoice) continue;
    const reasons = [
      needsApproval ? "Vendor record is not approved yet." : null,
      needsCabinetChoice ? "Cabinet vendor checkbox has not been chosen." : null,
    ].filter(Boolean);
    items.push({
      key: `vendor:${vendor.id}`,
      kind: "vendor-record",
      title: vendor.name,
      detail: reasons.join(" "),
      isCabinetVendor: vendor.isCabinetVendor,
      vendorId: vendor.id,
      draft: null,
    });
  }

  const referenced = new Set(input.referencedDistributorIds);
  for (const distributor of input.distributors) {
    if (distributor.isActive === false || !referenced.has(distributor.id)) continue;
    if (approvedCover(input.vendors, distributor)) continue;
    const pendingRecord = input.vendors.some((vendor) => approvedVendorMatchesDistributor(vendor, distributor));
    if (pendingRecord) continue;
    items.push({
      key: `distributor:${distributor.id}`,
      kind: "catalog-reference",
      title: distributor.name,
      detail: `Supplier line ${distributor.code} is referenced by a catalog import or products, and it has no vendor record.`,
      isCabinetVendor: null,
      distributorId: distributor.id,
      draft: {
        name: distributor.name,
        sourceKey: `dist:${distributor.id}`,
        category: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        websiteUrl: "",
        isApproved: false,
        isCabinetVendor: null,
      },
    });
  }

  const pelicanApproved = input.vendors.some(
    (vendor) => vendor.isApproved !== false && vendor.sourceKey?.trim().toLowerCase() === "pelican",
  );
  const pelicanRecord = input.vendors.some((vendor) => vendor.sourceKey?.trim().toLowerCase() === "pelican");
  if (input.pelicanProductCount > 0 && !pelicanApproved && !pelicanRecord) {
    items.push({
      key: "catalog:pelican",
      kind: "catalog-reference",
      title: "Pelican",
      detail: "pelican_products has rows, and no vendor record uses source key pelican.",
      isCabinetVendor: null,
      draft: {
        name: "Pelican",
        sourceKey: "pelican",
        category: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        websiteUrl: "",
        isApproved: false,
        isCabinetVendor: null,
      },
    });
  }

  return { count: items.length, items };
}
