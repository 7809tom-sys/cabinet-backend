import { and, eq, or } from "drizzle-orm";
import { affiliates, affiliateTeamMembers } from "../../drizzle/schema";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

type UserIdentity = {
  id: number;
  email: string | null;
};

export type AffiliateAccess = {
  affiliateId: number;
  isOwner: boolean;
  accessCrm: boolean;
  accessDesigner: boolean;
  teamMemberId: number | null;
};

/**
 * Resolve the signed-in user's affiliate relationship without granting
 * permissions implicitly. Affiliate owners receive both capabilities; hired
 * team members receive only the capabilities enabled on their invitation.
 */
export async function resolveAffiliateAccess(
  db: Database,
  user: UserIdentity,
): Promise<AffiliateAccess | null> {
  const email = (user.email ?? "").trim().toLowerCase();
  const teamRows = await db
    .select({
      id: affiliateTeamMembers.id,
      affiliateId: affiliateTeamMembers.affiliateId,
      accessCrm: affiliateTeamMembers.accessCrm,
      accessDesigner: affiliateTeamMembers.accessDesigner,
    })
    .from(affiliateTeamMembers)
    .where(
      and(
        eq(affiliateTeamMembers.isActive, true),
        or(
          eq(affiliateTeamMembers.userId, user.id),
          ...(email.length > 0 ? [eq(affiliateTeamMembers.email, email)] : []),
        ),
      ),
    )
    .orderBy(affiliateTeamMembers.createdAt)
    .limit(1);

  const teamMember = teamRows[0];
  if (teamMember) {
    return {
      affiliateId: teamMember.affiliateId,
      isOwner: false,
      accessCrm: teamMember.accessCrm,
      accessDesigner: teamMember.accessDesigner,
      teamMemberId: teamMember.id,
    };
  }

  const affiliateRows = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(
      or(
        eq(affiliates.userId, user.id),
        ...(email.length > 0 ? [eq(affiliates.email, email)] : []),
      ),
    )
    .limit(1);

  const owner = affiliateRows[0];
  if (!owner) return null;

  return {
    affiliateId: owner.id,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    teamMemberId: null,
  };
}
