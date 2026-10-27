import {
  resolveAffiliateRelationship,
  resolveSignInDestination,
  type AffiliateCandidate,
  type AffiliateTeamCandidate,
} from "@shared/affiliateResolution";

export type OAuthAffiliateRecord = AffiliateCandidate;

/**
 * Active affiliate owners and team members sign in to their own Affiliate
 * Administration route. Platform administrators are never redirected, and an
 * explicit /admin return is never replaced. Returns null when the caller
 * should keep `returnPath`.
 */
export function resolveAffiliateAdministrationDestination({
  returnPath,
  userId,
  email,
  userRole,
  affiliates,
  teamMembers = [],
}: {
  returnPath: string;
  userId: number | null | undefined;
  email: string | null | undefined;
  userRole?: string | null;
  affiliates: OAuthAffiliateRecord[];
  teamMembers?: AffiliateTeamCandidate[];
}): string | null {
  if (!userId) return null;
  const decision = resolveSignInDestination({
    returnPath,
    userRole,
    resolution: resolveAffiliateRelationship({
      userId,
      email,
      affiliates,
      teamMembers,
    }),
  });
  return decision.destination === returnPath ? null : decision.destination;
}
