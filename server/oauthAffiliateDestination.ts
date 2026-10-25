export type OAuthAffiliateRecord = { id: number; userId: number | null; email: string | null; status?: string | null };

/**
 * Every active affiliate owner signs in through their own Affiliate
 * Administration route. Platform administrators are never redirected by this
 * helper, so the central CabinetDealz admin remains admin-only.
 */
export function resolveAffiliateAdministrationDestination({
  returnPath,
  userId,
  email,
  userRole,
  affiliates,
}: {
  returnPath: string;
  userId: number | null | undefined;
  email: string | null | undefined;
  userRole?: string | null;
  affiliates: OAuthAffiliateRecord[];
}): string | null {
  if (!userId || userRole === "admin") return null;
  const normalizedEmail = (email ?? "").trim().toLowerCase();
  const match = affiliates.find((affiliate) => affiliate.status !== "inactive" && affiliate.userId === userId)
    ?? affiliates.find((affiliate) => normalizedEmail.length > 0
      && affiliate.status !== "inactive"
      && (affiliate.email ?? "").trim().toLowerCase() === normalizedEmail);
  return match ? `/affiliate?viewAs=${match.id}` : null;
}
