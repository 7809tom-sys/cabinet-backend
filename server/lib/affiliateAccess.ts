import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  resolveAffiliateRelationship,
  type AffiliateAccess,
  type AffiliateIdentityLink,
  type AffiliateResolution,
} from "@shared/affiliateResolution";
import { affiliates, affiliateTeamMembers } from "../../drizzle/schema";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

type UserIdentity = {
  id: number;
  email: string | null;
};

// A shared mailbox should still surface every match so two stores are not
// treated as one. This is well above any real affiliate email collision.
const MATCH_LIMIT = 200;

export type { AffiliateAccess, AffiliateIdentityLink, AffiliateResolution };

/**
 * Resolve the signed-in user's affiliate relationship without granting
 * permissions implicitly. Affiliate owners receive every capability; hired
 * team members receive only the capabilities enabled on their invitation.
 * This read never writes affiliates.userId. Sign-in links a unique email match.
 */
export async function loadAffiliateResolution(
  db: Database,
  user: UserIdentity
): Promise<AffiliateResolution> {
  const email = (user.email ?? "").trim().toLowerCase();
  const teamRows = await db
    .select({
      id: affiliateTeamMembers.id,
      affiliateId: affiliateTeamMembers.affiliateId,
      userId: affiliateTeamMembers.userId,
      email: affiliateTeamMembers.email,
      isActive: affiliateTeamMembers.isActive,
      accessCrm: affiliateTeamMembers.accessCrm,
      accessDesigner: affiliateTeamMembers.accessDesigner,
      accessMarketing: affiliateTeamMembers.accessMarketing,
      createdAt: affiliateTeamMembers.createdAt,
    })
    .from(affiliateTeamMembers)
    .where(
      and(
        eq(affiliateTeamMembers.isActive, true),
        or(
          eq(affiliateTeamMembers.userId, user.id),
          ...(email.length > 0
            ? [sql`lower(${affiliateTeamMembers.email}) = ${email}`]
            : [])
        )
      )
    )
    .limit(MATCH_LIMIT);

  const teamAffiliateIds = Array.from(
    new Set(teamRows.map(row => row.affiliateId))
  );
  const affiliateRows = await db
    .select({
      id: affiliates.id,
      userId: affiliates.userId,
      email: affiliates.email,
      status: affiliates.status,
    })
    .from(affiliates)
    .where(
      or(
        eq(affiliates.userId, user.id),
        ...(email.length > 0
          ? [sql`lower(${affiliates.email}) = ${email}`]
          : []),
        ...(teamAffiliateIds.length > 0
          ? [inArray(affiliates.id, teamAffiliateIds)]
          : [])
      )
    )
    .limit(MATCH_LIMIT);

  return resolveAffiliateRelationship({
    userId: user.id,
    email,
    affiliates: affiliateRows,
    teamMembers: teamRows,
  });
}

export async function resolveAffiliateAccess(
  db: Database,
  user: UserIdentity
): Promise<AffiliateAccess | null> {
  const resolution = await loadAffiliateResolution(db, user);
  return resolution.access;
}

/** Persist a unique email match. The WHERE guard refuses to replace a userId that is already set. */
export async function linkResolvedAffiliateIdentity(
  db: Database,
  userId: number,
  link: AffiliateIdentityLink
): Promise<void> {
  if (link.kind === "owner") {
    await db
      .update(affiliates)
      .set({ userId })
      .where(
        and(eq(affiliates.id, link.affiliateId), isNull(affiliates.userId))
      );
    return;
  }
  await db
    .update(affiliateTeamMembers)
    .set({ userId })
    .where(
      and(
        eq(affiliateTeamMembers.id, link.teamMemberId),
        isNull(affiliateTeamMembers.userId)
      )
    );
}
