/**
 * One affiliate identity decision for sign-in destination and portal access.
 * Callers that disagree about which store a person belongs to send the
 * affiliate page back to /signin, and that page's Sign in button starts the
 * cycle again.
 */

export type AffiliateAccess = {
  affiliateId: number;
  isOwner: boolean;
  accessCrm: boolean;
  accessDesigner: boolean;
  accessMarketing: boolean;
  teamMemberId: number | null;
};

export type AffiliateCandidate = {
  id: number;
  userId: number | null;
  email: string | null;
  status?: string | null;
};

export type AffiliateTeamCandidate = {
  id: number;
  affiliateId: number;
  userId: number | null;
  email: string | null;
  isActive?: boolean | null;
  accessCrm: boolean;
  accessDesigner: boolean;
  accessMarketing: boolean;
  createdAt?: Date | string | number | null;
};

/** Written only when an email match is unique and the stored userId is still null. */
export type AffiliateIdentityLink =
  | { kind: "owner"; affiliateId: number }
  | { kind: "team"; teamMemberId: number };

export type AffiliateResolution = {
  access: AffiliateAccess | null;
  /** Eligible affiliates that share the email when no userId or team row wins. Sorted by id. */
  ambiguousAffiliateIds: number[];
  link: AffiliateIdentityLink | null;
};

export type SignInResolutionKind = "admin" | "affiliate" | "ambiguous" | "none";

export type SignInDestination = {
  destination: string;
  affiliateId: number | null;
  resolution: SignInResolutionKind;
  ambiguousAffiliateIds: number[];
};

/** Chosen on an affiliate landing or referral sign-in before the password step. */
export type SignInPortal = "affiliate" | "contractor" | "customer";

export function normalizeAffiliateEmail(
  email: string | null | undefined
): string {
  return (email ?? "").trim().toLowerCase();
}

/** Inactive stores are not a portal. Paused stores still are. Missing status stays eligible. */
export function isPortalAffiliate(status: string | null | undefined): boolean {
  return status !== "inactive";
}

export function signedInHomeForRole(
  userRole: string | null | undefined
): string {
  if (userRole === "admin") return "/admin";
  if (userRole === "distributor") return "/vendor";
  if (userRole === "contractor") return "/contractor";
  return "/account";
}

export function isAdminReturnPath(returnPath: string): boolean {
  const path = pathnameOf(returnPath);
  return path === "/admin" || path.startsWith("/admin/");
}

/** The affiliate dashboard. `/affiliate/setup` is a different page and is left alone. */
export function isAffiliatePortalPath(returnPath: string): boolean {
  return pathnameOf(returnPath) === "/affiliate";
}

export function affiliatePortalPath(affiliateId: number): string {
  return `/affiliate?viewAs=${affiliateId}`;
}

function pathnameOf(returnPath: string): string {
  const path = returnPath.split(/[?#]/)[0] ?? "";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}

function createdAtMillis(
  value: Date | string | number | null | undefined
): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function byId(a: { id: number }, b: { id: number }): number {
  return a.id - b.id;
}

function byAgeThenId(
  a: AffiliateTeamCandidate,
  b: AffiliateTeamCandidate
): number {
  const delta = createdAtMillis(a.createdAt) - createdAtMillis(b.createdAt);
  if (delta !== 0) return delta;
  return a.id - b.id;
}

function ownerAccess(affiliateId: number): AffiliateAccess {
  return {
    affiliateId,
    isOwner: true,
    accessCrm: true,
    accessDesigner: true,
    accessMarketing: true,
    teamMemberId: null,
  };
}

function teamAccess(member: AffiliateTeamCandidate): AffiliateAccess {
  return {
    affiliateId: member.affiliateId,
    isOwner: false,
    accessCrm: Boolean(member.accessCrm),
    accessDesigner: Boolean(member.accessDesigner),
    accessMarketing: Boolean(member.accessMarketing),
    teamMemberId: member.id,
  };
}

function portalAffiliateById(
  affiliates: AffiliateCandidate[],
  affiliateId: number
): AffiliateCandidate | undefined {
  return affiliates.find(affiliate => affiliate.id === affiliateId);
}

function teamRowCanEnter(
  member: AffiliateTeamCandidate,
  affiliates: AffiliateCandidate[]
): boolean {
  if (member.isActive === false) return false;
  const affiliate = portalAffiliateById(affiliates, member.affiliateId);
  // A missing parent row is not proof the store is closed. A known inactive store is.
  if (!affiliate) return true;
  return isPortalAffiliate(affiliate.status);
}

/**
 * Resolve the signed-in person to at most one affiliate.
 *
 * Order: affiliate linked by userId, then an active team row (userId before
 * email, then oldest invitation), then a single affiliate email. Several
 * affiliates sharing an email are not guessed — that grant would make the
 * platform owner an owner of whichever store happened to sort first.
 */
export function resolveAffiliateRelationship({
  userId,
  email,
  affiliates,
  teamMembers,
}: {
  userId: number;
  email: string | null | undefined;
  affiliates: AffiliateCandidate[];
  teamMembers: AffiliateTeamCandidate[];
}): AffiliateResolution {
  const normalizedEmail = normalizeAffiliateEmail(email);
  const eligible = affiliates.filter(affiliate =>
    isPortalAffiliate(affiliate.status)
  );
  const linked = eligible
    .filter(affiliate => affiliate.userId === userId)
    .sort(byId);
  if (linked[0]) {
    return {
      access: ownerAccess(linked[0].id),
      ambiguousAffiliateIds: [],
      link: null,
    };
  }

  const activeTeam = teamMembers.filter(member =>
    teamRowCanEnter(member, affiliates)
  );
  const teamByUser = activeTeam
    .filter(member => member.userId === userId)
    .sort(byAgeThenId);
  if (teamByUser[0]) {
    return {
      access: teamAccess(teamByUser[0]),
      ambiguousAffiliateIds: [],
      link: null,
    };
  }

  const teamByEmail =
    normalizedEmail.length > 0
      ? activeTeam
          .filter(
            member => normalizeAffiliateEmail(member.email) === normalizedEmail
          )
          .sort(byAgeThenId)
      : [];
  if (teamByEmail[0]) {
    const member = teamByEmail[0];
    const link =
      teamByEmail.length === 1 && member.userId == null
        ? { kind: "team" as const, teamMemberId: member.id }
        : null;
    return { access: teamAccess(member), ambiguousAffiliateIds: [], link };
  }

  const emailMatches =
    normalizedEmail.length > 0
      ? eligible
          .filter(
            affiliate =>
              normalizeAffiliateEmail(affiliate.email) === normalizedEmail
          )
          .sort(byId)
      : [];
  if (emailMatches.length === 1) {
    const affiliate = emailMatches[0];
    const alreadyLinked = affiliates.some(
      candidate => candidate.userId === userId
    );
    const link =
      !alreadyLinked && affiliate.userId == null
        ? { kind: "owner" as const, affiliateId: affiliate.id }
        : null;
    return {
      access: ownerAccess(affiliate.id),
      ambiguousAffiliateIds: [],
      link,
    };
  }
  if (emailMatches.length > 1) {
    return {
      access: null,
      ambiguousAffiliateIds: emailMatches.map(affiliate => affiliate.id),
      link: null,
    };
  }
  return { access: null, ambiguousAffiliateIds: [], link: null };
}

export function shouldLinkAffiliateOnLogin(
  userRole: string | null | undefined,
  link: AffiliateIdentityLink | null
): link is AffiliateIdentityLink {
  return userRole !== "admin" && link != null;
}

/**
 * Where to navigate after sign-in. `returnPath` is already the role home when
 * the client did not ask for a specific page.
 */
function portalDestination(
  portal: SignInPortal | null | undefined,
  resolution: AffiliateResolution,
  ambiguousAffiliateIds: number[],
): SignInDestination | null {
  if (portal === "contractor") {
    return {
      destination: "/contractor",
      affiliateId: resolution.access?.affiliateId ?? null,
      resolution: resolution.access ? "affiliate" : "none",
      ambiguousAffiliateIds,
    };
  }
  if (portal === "customer") {
    return {
      destination: "/customer",
      affiliateId: resolution.access?.affiliateId ?? null,
      resolution: resolution.access ? "affiliate" : "none",
      ambiguousAffiliateIds,
    };
  }
  if (portal === "affiliate") {
    if (resolution.access) {
      return {
        destination: affiliatePortalPath(resolution.access.affiliateId),
        affiliateId: resolution.access.affiliateId,
        resolution: "affiliate",
        ambiguousAffiliateIds: [],
      };
    }
    return {
      destination: "/affiliate",
      affiliateId: null,
      resolution: ambiguousAffiliateIds.length > 0 ? "ambiguous" : "none",
      ambiguousAffiliateIds,
    };
  }
  return null;
}

export function resolveSignInDestination({
  returnPath,
  userRole,
  resolution,
  portal = null,
}: {
  returnPath: string;
  userRole?: string | null;
  resolution: AffiliateResolution;
  /** Set only when the person picked Affiliate, Contractor, or Customer. */
  portal?: SignInPortal | null;
}): SignInDestination {
  const ambiguousAffiliateIds = resolution.ambiguousAffiliateIds;
  if (userRole === "admin") {
    return {
      destination: returnPath,
      affiliateId: null,
      resolution: "admin",
      ambiguousAffiliateIds,
    };
  }
  const chosen = portalDestination(portal, resolution, ambiguousAffiliateIds);
  if (chosen) return chosen;
  // Admin role wins above. An explicit /admin request is never replaced either,
  // including when the same email is also an affiliate login.
  if (isAdminReturnPath(returnPath)) {
    return {
      destination: returnPath,
      affiliateId: resolution.access?.affiliateId ?? null,
      resolution: resolution.access
        ? "affiliate"
        : ambiguousAffiliateIds.length > 0
          ? "ambiguous"
          : "none",
      ambiguousAffiliateIds,
    };
  }
  if (resolution.access) {
    return {
      destination: affiliatePortalPath(resolution.access.affiliateId),
      affiliateId: resolution.access.affiliateId,
      resolution: "affiliate",
      ambiguousAffiliateIds: [],
    };
  }
  // Unresolved people must not be sent back to the affiliate landing. Its
  // Sign in button returns here with returnTo=/affiliate and the cycle repeats.
  const destination = isAffiliatePortalPath(returnPath)
    ? signedInHomeForRole(userRole)
    : returnPath;
  return {
    destination,
    affiliateId: null,
    resolution: ambiguousAffiliateIds.length > 0 ? "ambiguous" : "none",
    ambiguousAffiliateIds,
  };
}
