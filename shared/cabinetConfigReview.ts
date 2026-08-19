export type CabinetConfigReviewCandidate = {
  isActive: boolean | null | undefined;
  configVerified: boolean | null | undefined;
};

/** True when a cabinet needs an administrator configuration review. */
export function needsCabinetConfigAttention(candidate: CabinetConfigReviewCandidate): boolean {
  return candidate.isActive === false || candidate.configVerified !== true;
}

/** Status labels for the review queue. A cabinet may require both corrections. */
export function cabinetConfigAttentionReasons(candidate: CabinetConfigReviewCandidate): Array<"Inactive" | "Unverified"> {
  const reasons: Array<"Inactive" | "Unverified"> = [];
  if (candidate.isActive === false) reasons.push("Inactive");
  if (candidate.configVerified !== true) reasons.push("Unverified");
  return reasons;
}

/** Deep link that opens the exact cabinet record in the existing Cabinet Config editor. */
export function cabinetConfigQuickEditUrl(cabinetId: number): string {
  return `/admin?tab=cabinet-config&cabinetId=${cabinetId}`;
}

/** Converts the database's compact distributor-line list into stable display labels. */
export function distributorLineLabels(distributorNames: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (distributorNames ?? "")
        .split("|")
        .map((name) => name.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}
