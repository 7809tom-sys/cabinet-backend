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
