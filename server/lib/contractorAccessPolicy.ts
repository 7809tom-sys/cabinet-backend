// Affiliate accounts are stored as users.role = "partner". There is no
// "affiliate" value on the users.role enum. The API contract name is accepted
// as well so a caller labeled affiliate is not rejected.
const AFFILIATE_DESK_ROLES = new Set(["admin", "affiliate", "partner"]);

export function canManageAffiliateContractorDesk(role: string): boolean {
  return AFFILIATE_DESK_ROLES.has(role);
}

/** Affiliate accounts are stored as partner. The affiliate label is accepted too. */
export function isAffiliateRole(role: string): boolean {
  return role === "partner" || role === "affiliate";
}

export function canReviewAffiliateContractorRequest(role: string): boolean {
  return role === "admin" || isAffiliateRole(role);
}

export function normalizeContractorEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return email.length > 0 ? email : null;
}

export type ContractorRequestIdentity = {
  id: number;
  userId: number | null;
  contractorEmail: string | null;
  status: string;
};

export type AffiliateScopedRequestIdentity = ContractorRequestIdentity & {
  affiliateId: number | null;
  submittedByUserId: number | null;
};

/**
 * What an affiliate desk submit found for the same contractor:
 * - same-store: a pending row already owned by the submitter's store, so the
 *   caller returns it and inserts nothing.
 * - adopt: a pending row with no store and no submitter (house/orphan), so the
 *   caller stamps it with the submitting store and submitter, which also makes
 *   it show up in that store's own list.
 */
export type AffiliatePendingMatch<T> = {
  kind: "same-store" | "adopt";
  row: T;
};

/**
 * A pending row blocks a new request when it belongs to the same account or
 * the same contractor email, whether it was created by self-service submit
 * (email often null, userId set) or by an affiliate (email set, userId maybe null).
 */
export function findPendingDuplicate<T extends ContractorRequestIdentity>(
  rows: T[],
  key: { userId?: number | null; contractorEmail?: string | null },
): T | null {
  const email = normalizeContractorEmail(key.contractorEmail);
  const matches = rows.filter((row) => {
    if (row.status !== "pending") return false;
    const sameUser = key.userId != null && row.userId === key.userId;
    const sameEmail = email != null && normalizeContractorEmail(row.contractorEmail) === email;
    return sameUser || sameEmail;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const aUser = a.userId != null && a.userId === key.userId ? 1 : 0;
    const bUser = b.userId != null && b.userId === key.userId ? 1 : 0;
    if (aUser !== bUser) return bUser - aUser;
    return b.id - a.id;
  });
  return matches[0];
}

/**
 * Store-scoped duplicate check for affiliate desk submits. A pending row only
 * blocks a store when it is that store's own row or an unowned orphan. Rows
 * filed by another store, or house rows another submitter already claimed, are
 * invisible here so the caller inserts its own pending row instead.
 */
export function findAffiliatePendingMatch<T extends AffiliateScopedRequestIdentity>(
  rows: T[],
  key: { userId?: number | null; contractorEmail?: string | null; affiliateId: number | null },
): AffiliatePendingMatch<T> | null {
  const email = normalizeContractorEmail(key.contractorEmail);
  const matches: AffiliatePendingMatch<T>[] = [];
  for (const row of rows) {
    if (row.status !== "pending") continue;
    const sameUser = key.userId != null && row.userId === key.userId;
    const sameEmail = email != null && normalizeContractorEmail(row.contractorEmail) === email;
    if (!sameUser && !sameEmail) continue;
    // A row with no store and no submitter belongs to nobody yet, so the first
    // store to file it adopts it instead of hiding it forever.
    if (row.affiliateId == null && row.submittedByUserId == null) {
      matches.push({ kind: "adopt", row });
    } else if (row.affiliateId === key.affiliateId) {
      matches.push({ kind: "same-store", row });
    }
  }
  if (matches.length === 0) return null;
  const rank = (match: AffiliatePendingMatch<T>) => (
    (match.row.userId != null && match.row.userId === key.userId ? 2 : 0)
    + (match.kind === "same-store" ? 1 : 0)
  );
  matches.sort((a, b) => rank(b) - rank(a) || b.row.id - a.row.id);
  return matches[0];
}

export function isApprovedUnlinkedContractorRequest(
  row: { userId: number | null; contractorEmail: string | null; status: string },
  email: string | null | undefined,
): boolean {
  const normalized = normalizeContractorEmail(email);
  if (!normalized) return false;
  return row.status === "approved"
    && row.userId == null
    && normalizeContractorEmail(row.contractorEmail) === normalized;
}

export function contractorRequestSource(
  submittedByUserId: number | null | undefined,
): "self" | "affiliate" {
  return submittedByUserId != null ? "affiliate" : "self";
}
