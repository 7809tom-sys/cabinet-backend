import {
  resolveAffiliateRelationship,
  type AffiliateTeamCandidate,
} from "./affiliateResolution";

export type InstallationEstimateAccessUser = {
  id: number;
  email: string | null;
  role: string;
};
export type InstallationEstimateAffiliateRecord = {
  id: number;
  userId: number | null;
  email: string | null;
  status?: string | null;
};
export type InstallationEstimateMembership = {
  affiliateId: number;
  userId: number | null;
  email: string | null;
  isActive: boolean;
  accessCrm: boolean;
  accessDesigner?: boolean;
};

export function resolveInstallationEstimateAffiliateId({
  user,
  requestedAffiliateId,
  affiliates,
  memberships,
  requireDesigner = false,
}: {
  user: InstallationEstimateAccessUser;
  requestedAffiliateId?: number;
  affiliates: InstallationEstimateAffiliateRecord[];
  memberships: InstallationEstimateMembership[];
  requireDesigner?: boolean;
}): number | null {
  if (user.role === "admin" && requestedAffiliateId && requestedAffiliateId > 0)
    return requestedAffiliateId;

  const teamMembers: AffiliateTeamCandidate[] = memberships
    .filter(
      member =>
        member.isActive &&
        member.accessCrm &&
        (!requireDesigner || member.accessDesigner === true)
    )
    .map((member, index) => ({
      id: index + 1,
      affiliateId: member.affiliateId,
      userId: member.userId,
      email: member.email,
      isActive: true,
      accessCrm: true,
      accessDesigner: member.accessDesigner === true,
      accessMarketing: false,
    }));
  return (
    resolveAffiliateRelationship({
      userId: user.id,
      email: user.email,
      affiliates,
      teamMembers,
    }).access?.affiliateId ?? null
  );
}
