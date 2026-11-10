/**
 * Affiliate Publish tab.
 *
 * A missing row is not published. Cabinet catalog checks the distributor id.
 * A vendor with no distributor line is stored and checked as subjectKind vendor.
 * Admin and house (non-affiliate) reads are not part of this decision.
 */

export const AFFILIATE_FEATURE_KEYS = [
  "kitchen_designer",
  "bathroom_builder",
  "laundry_builder",
  "closet_builder",
  "closet_studio",
  "other_room_designer",
  "cabinet_catalog",
  "pelican_catalog",
  "hardware_catalog",
  "closet_catalog",
  "kitchen_packages",
  "samples",
  "promotions",
  "image_cabinet",
  "installation_estimates",
  "quote",
] as const;

export type AffiliateFeatureKey = (typeof AFFILIATE_FEATURE_KEYS)[number];

export const DESIGNER_FEATURE_KEYS = [
  "kitchen_designer",
  "bathroom_builder",
  "laundry_builder",
  "closet_builder",
  "other_room_designer",
] as const satisfies readonly AffiliateFeatureKey[];

export type PublishSubjectKind = "distributor" | "vendor";

export type PublishSubject = {
  kind: PublishSubjectKind;
  id: number;
};

export type AffiliateFeaturePublishRow = {
  subjectKind: PublishSubjectKind;
  subjectId: number;
  featureKey: string;
  published: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
};

export function isAffiliateFeatureKey(value: string): value is AffiliateFeatureKey {
  return (AFFILIATE_FEATURE_KEYS as readonly string[]).includes(value);
}

export type PublishFlag = {
  subjectKind: string;
  subjectId: number;
  featureKey: string;
  published: boolean;
};

export function publishFlagOn(
  rows: readonly PublishFlag[],
  subject: PublishSubject,
  featureKeys: readonly string[],
): boolean {
  return rows.some((row) =>
    row.published === true
    && featureKeys.includes(row.featureKey)
    && row.subjectKind === subject.kind
    && Number(row.subjectId) === subject.id,
  );
}

export type FeatureReadDecisionInput = {
  /** Platform administrators are never blocked. */
  role?: string | null;
  /** Null means this request is not an affiliate read. */
  affiliateId: number | null;
  featureKeys: readonly string[];
  /**
   * Cabinet-line reads name the distributor. Other reads leave this empty and
   * are allowed when any subject the affiliate carries has the feature on.
   */
  distributorId?: number | null;
  /** Distributors this affiliate carries. An empty selection is already expanded to active lines. */
  carriedDistributorIds: readonly number[];
  /** Approved vendors that have no distributor line. They apply to every affiliate. */
  vendorIdsWithoutLine: readonly number[];
  /**
   * Cabinet catalog is a distributor switch. A vendor row does not publish it.
   * Other features can be published on a vendor that has no distributor line.
   */
  includeVendorsWithoutLine?: boolean;
  rows: readonly PublishFlag[];
};

export function decideAffiliateFeatureRead(
  input: FeatureReadDecisionInput,
): { allowed: true } | { allowed: false } {
  if (input.role === "admin" || input.affiliateId == null) return { allowed: true };
  const keys = input.featureKeys;
  if (input.distributorId != null) {
    const carried = input.carriedDistributorIds.includes(input.distributorId);
    const published = carried && publishFlagOn(input.rows, { kind: "distributor", id: input.distributorId }, keys);
    return published ? { allowed: true } : { allowed: false };
  }
  const vendorIds = input.includeVendorsWithoutLine === false ? [] : input.vendorIdsWithoutLine;
  const subjects: PublishSubject[] = [
    ...input.carriedDistributorIds.map((id) => ({ kind: "distributor" as const, id })),
    ...vendorIds.map((id) => ({ kind: "vendor" as const, id })),
  ];
  const published = subjects.some((subject) => publishFlagOn(input.rows, subject, keys));
  return published ? { allowed: true } : { allowed: false };
}

export const AFFILIATE_FEATURE_UNPUBLISHED = "This feature is not published for affiliates.";

export function catalogFeatureKey(kind: "cabinet" | "hardware" | "surface" | "closet"): AffiliateFeatureKey {
  if (kind === "hardware") return "hardware_catalog";
  if (kind === "surface") return "pelican_catalog";
  if (kind === "closet") return "closet_catalog";
  return "cabinet_catalog";
}
