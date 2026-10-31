/**
 * Supplier onboarding: which crosswalk rows get a Cabinet Conflict entry, automatically.
 *
 * Tom's standing rule (Oct 31, 2026, every supplier): any UNIQUE or UNSURE item is flagged in the existing
 * Cabinet Conflict mechanism (`cabinets.conflictStatus` / `conflictReason` / `conflictedAt`) by the onboarding
 * generator itself, with no manual step. Flagged items are PUBLISHED and flagged, so the status is
 * `review` (stays public; the same Conflicts tab lists it) and never the hidden `conflict` status.
 *
 * A supplier's onboarding generator must call `onboardingConflictLevel` for every crosswalk row and write an
 * entry for each row that returns "review". `data/distributors/dl-cabinetry/build_unmatched.py` mirrors this rule
 * for DL and `server/dlUnmatchedMasters.test.ts` checks the mirror against this function over all 200 DL rows.
 * Entries use the `Issue / Current value / Source / Needed / Resolved fields` layout of `formatConflictReason`.
 */
import { PUBLIC_CATALOG_REVIEW_STATUS } from "./cabinetConflictFlags";

export const ONBOARDING_CONFLICT_STATUS = PUBLIC_CATALOG_REVIEW_STATUS; // "review": published AND flagged

export type OnboardingCrosswalkRow = {
  supplierSku: string;
  masterCode: string;
  matchType: string;
  confidence: string;
};

/** Match types that mean "no existing master matched": the item is unique to this supplier or unidentified. */
export const UNIQUE_OR_UNSURE_MATCH_TYPES = ["new-master", "conflict-flagged", "none", "skipped", "accessory-report"] as const;

export type OnboardingConflictLevel = typeof ONBOARDING_CONFLICT_STATUS | null;

export function onboardingConflictLevel(row: OnboardingCrosswalkRow): OnboardingConflictLevel {
  if ((UNIQUE_OR_UNSURE_MATCH_TYPES as readonly string[]).includes(row.matchType)) return ONBOARDING_CONFLICT_STATUS;
  const confidence = row.confidence.trim().toLowerCase();
  if (confidence === "medium" || confidence === "low" || confidence === "") return ONBOARDING_CONFLICT_STATUS;
  return null;
}

/** Every crosswalk row that must produce a Cabinet Conflict entry, grouped by the master that carries it. */
export function onboardingConflictMasters(rows: OnboardingCrosswalkRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    if (onboardingConflictLevel(row) === null) continue;
    const key = row.masterCode.trim() || row.supplierSku;
    out.set(key, [...(out.get(key) ?? []), row.supplierSku]);
  }
  return out;
}
