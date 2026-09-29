export type ApprovedVendorAccessRecord = {
  id: number;
  sourceKey: string | null;
  contactEmail: string | null;
  isApproved?: boolean;
};

export type ApprovedVendorDistributorRecord = {
  id: number;
  code: string;
  isActive?: boolean;
};

const PEL_DIST_CODE = "PEL";
// Legacy approved-vendor records used UCD while the live distributor row uses
// USCD. This is an explicit code migration, not name-based matching.
const LEGACY_DISTRIBUTOR_CODE_ALIASES: Record<string, string> = {
  ucd: "uscd",
};

/**
 * Resolve one configured Approved Vendor source key to exactly one active
 * distributor. Names are intentionally never used: an administrator must pick
 * or save a real supply-line key before a portal account can be granted.
 */
export function approvedVendorSourceDistributorId(
  sourceKey: string | null | undefined,
  distributors: readonly ApprovedVendorDistributorRecord[]
): number | null {
  const candidate = { sourceKey: sourceKey ?? null };
  const matchingIds = new Set<number>();
  for (const distributor of distributors) {
    if (distributor.isActive === false) continue;
    if (approvedVendorMatchesDistributor(candidate, distributor)) {
      matchingIds.add(distributor.id);
    }
  }
  return matchingIds.size === 1 ? Array.from(matchingIds)[0] ?? null : null;
}

/**
 * Relates the Approved Vendors record to its single supply line. The source key
 * is administrative configuration, so it is deliberately evaluated exactly
 * against the distributor ID/code rather than using names or fuzzy matching.
 */
export function approvedVendorMatchesDistributor(
  vendor: Pick<ApprovedVendorAccessRecord, "sourceKey">,
  distributor: Pick<ApprovedVendorDistributorRecord, "id" | "code">
): boolean {
  const sourceKey = vendor.sourceKey?.trim().toLowerCase();
  if (!sourceKey) return false;
  const normalizedDistributorCode = distributor.code.trim().toLowerCase();
  return (
    sourceKey === `dist:${distributor.id}` ||
    sourceKey === normalizedDistributorCode ||
    LEGACY_DISTRIBUTOR_CODE_ALIASES[sourceKey] === normalizedDistributorCode ||
    (sourceKey === "pelican" && distributor.code.trim().toUpperCase() === PEL_DIST_CODE)
  );
}

/**
 * An approved supplier contact may self-create its password and receive only
 * the one linked supplier line. The contact address must match exactly after
 * normalization, the line must be active, and ambiguous configurations never
 * grant portal access.
 */
export function approvedVendorContactDistributorId(
  emailLower: string,
  vendors: readonly ApprovedVendorAccessRecord[],
  distributors: readonly ApprovedVendorDistributorRecord[]
): number | null {
  return approvedVendorContactAccess(emailLower, vendors, distributors)?.distributorId ?? null;
}

export type ApprovedVendorContactAccess = {
  vendorLineId: number;
  distributorId: number | null;
};

/**
 * Resolve the one Approved Vendor record owned by a contact. A distributor line
 * is optional: a supplier may log in and maintain its own profile before it has
 * a cabinet catalog. More than one vendor record for one email is deliberately
 * denied as ambiguous rather than guessing a portal scope.
 */
export function approvedVendorContactAccess(
  emailLower: string,
  vendors: readonly ApprovedVendorAccessRecord[],
  distributors: readonly ApprovedVendorDistributorRecord[]
): ApprovedVendorContactAccess | null {
  const normalizedEmail = emailLower.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const matchingVendors = vendors.filter(
    (vendor) => vendor.isApproved !== false && vendor.contactEmail?.trim().toLowerCase() === normalizedEmail
  );
  if (matchingVendors.length !== 1) return null;
  const vendor = matchingVendors[0];
  return {
    vendorLineId: vendor.id,
    distributorId: approvedVendorSourceDistributorId(vendor.sourceKey, distributors),
  };
}
