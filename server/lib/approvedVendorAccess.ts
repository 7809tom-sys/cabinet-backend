export type ApprovedVendorAccessRecord = {
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
  return (
    sourceKey === `dist:${distributor.id}` ||
    sourceKey === distributor.code.trim().toLowerCase() ||
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
  const normalizedEmail = emailLower.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const matchedLineIds = new Set<number>();
  for (const vendor of vendors) {
    if (vendor.isApproved === false || vendor.contactEmail?.trim().toLowerCase() !== normalizedEmail) {
      continue;
    }
    for (const distributor of distributors) {
      if (distributor.isActive === false) continue;
      if (approvedVendorMatchesDistributor(vendor, distributor)) {
        matchedLineIds.add(distributor.id);
      }
    }
  }

  return matchedLineIds.size === 1 ? Array.from(matchedLineIds)[0] ?? null : null;
}
