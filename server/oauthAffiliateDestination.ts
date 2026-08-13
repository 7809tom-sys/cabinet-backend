export type OAuthAffiliateRecord = { id: number; userId: number | null; email: string | null; status?: string | null };

/**
 * Management sign-in is intentionally the only OAuth entry that auto-opens an
 * affiliate Administration route. General Cabinet Dealz sign-ins retain their
 * original safe return location.
 */
export function resolveAffiliateAdministrationDestination({
  returnPath,
  userId,
  email,
  affiliates,
}: {
  returnPath: string;
  userId: number | null | undefined;
  email: string | null | undefined;
  affiliates: OAuthAffiliateRecord[];
}): string | null {
  if (returnPath !== "/affiliate" || !userId) return null;
  const normalizedEmail = (email ?? "").trim().toLowerCase();
  const match = affiliates.find((affiliate) => affiliate.status !== "inactive" && affiliate.userId === userId)
    ?? affiliates.find((affiliate) => normalizedEmail.length > 0
      && affiliate.status !== "inactive"
      && (affiliate.email ?? "").trim().toLowerCase() === normalizedEmail);
  return match ? `/affiliate?viewAs=${match.id}` : null;
}
