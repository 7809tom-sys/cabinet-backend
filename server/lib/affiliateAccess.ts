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

  const linkedRows = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.userId, user.id)).limit(1);
  const emailRows = email.length > 0
    ? await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.email, email)).limit(2)
    : [];
  // A linked identity is authoritative. An email-only legacy match is allowed
  // only when it identifies exactly one affiliate; never guess across stores.
  const owner = linkedRows[0] ?? (emailRows.length === 1 ? emailRows[0] : undefined);
  if (!owner) return null;

  return {
    affiliateId: owner.id,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    teamMemberId: null,
  };
}
