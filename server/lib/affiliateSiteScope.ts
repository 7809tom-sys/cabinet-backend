import { and, eq, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { affiliateTeamMembers, affiliates } from "../../drizzle/schema";
import type { DirectoryMode } from "@shared/customerDirectory";
import { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type SiteUser = { id: number; email: string | null; role: string };

export type SiteScope =
  | { mode: "store"; affiliateId: number }
  | { mode: "house" }
  | { mode: "all" };

export type SiteScopeInput = {
  affiliateId?: number | null;
  slug?: string | null;
  /** Same field checkout uses. "owner" is the house storefront. */
  storeScope?: string | null;
  adminAll?: boolean;
  house?: boolean;
};

const CHOOSE_STORE = "Choose which affiliate store to view.";
const ADMIN_OPT_IN = "Open the admin directory to view every store.";

export function rowBelongsToSite(
  rowAffiliateId: number | null | undefined,
  scope: { mode: DirectoryMode; affiliateId?: number | null },
): boolean {
  if (scope.mode === "all") return true;
  if (scope.mode === "house") return rowAffiliateId == null;
  return rowAffiliateId === scope.affiliateId;
}

function normalizedEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function normalizedSlug(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Stores this login owns (user id or email) plus stores where they are an
 * active team member. affiliates.userId is not unique, so this returns every
 * match instead of the first row.
 */
export async function listAccessibleAffiliateIds(
  db: Database,
  user: SiteUser,
  options?: { crm?: boolean },
): Promise<number[]> {
  const email = normalizedEmail(user.email);
  const owned = await db
    .select({ id: affiliates.id, status: affiliates.status })
    .from(affiliates)
    .where(or(
      eq(affiliates.userId, user.id),
      ...(email ? [sql`lower(${affiliates.email}) = ${email}`] : []),
    ));
  const team = await db
    .select({ affiliateId: affiliateTeamMembers.affiliateId })
    .from(affiliateTeamMembers)
    .where(and(
      eq(affiliateTeamMembers.isActive, true),
      ...(options?.crm ? [eq(affiliateTeamMembers.accessCrm, true)] : []),
      or(
        eq(affiliateTeamMembers.userId, user.id),
        ...(email ? [sql`lower(${affiliateTeamMembers.email}) = ${email}`] : []),
      ),
    ));
  const ids = new Set<number>();
  for (const row of owned) {
    if (row.status === "inactive") continue;
    ids.add(row.id);
  }
  for (const row of team) ids.add(row.affiliateId);
  return Array.from(ids).sort((a, b) => a - b);
}

/** Checkout attribution: an active store slug, or null for the house storefront. */
export async function affiliateIdFromStoreScope(
  db: Database,
  storeScope: string | null | undefined,
): Promise<number | null> {
  const slug = normalizedSlug(storeScope);
  if (!slug || slug === "owner") return null;
  const [row] = await db
    .select({ id: affiliates.id, status: affiliates.status })
    .from(affiliates)
    .where(eq(affiliates.slug, slug))
    .limit(1);
  if (!row || row.status !== "active") {
    throw new TRPCError({ code: "NOT_FOUND", message: "This affiliate store is not available." });
  }
  return row.id;
}

/**
 * Affiliate desk / storefront scope. adminAll is the only path that returns
 * every store, and only for role admin. A missing id never means "all rows".
 */
export async function resolveAffiliateSiteScope(
  db: Database,
  user: SiteUser,
  input: SiteScopeInput = {},
): Promise<SiteScope> {
  if (input.adminAll) {
    if (user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can view every store." });
    }
    return { mode: "all" };
  }
  if (input.house) {
    if (user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "House records are on the admin page." });
    }
    return { mode: "house" };
  }

  const slug = normalizedSlug(input.slug ?? input.storeScope);
  let requestedId = input.affiliateId != null && input.affiliateId > 0 ? input.affiliateId : null;
  if (slug && slug !== "owner") {
    requestedId = await affiliateIdFromStoreScope(db, slug);
  } else if (requestedId != null && user.role === "admin") {
    const [row] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, requestedId)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
  }

  const accessible = await listAccessibleAffiliateIds(db, user);
  if (requestedId != null) {
    if (user.role === "admin" || accessible.includes(requestedId)) {
      return { mode: "store", affiliateId: requestedId };
    }
    throw new TRPCError({ code: "FORBIDDEN", message: "You can only view this store's own records." });
  }
  if (accessible.length === 1) return { mode: "store", affiliateId: accessible[0] };
  if (accessible.length > 1) throw new TRPCError({ code: "BAD_REQUEST", message: CHOOSE_STORE });
  if (user.role === "admin") throw new TRPCError({ code: "BAD_REQUEST", message: ADMIN_OPT_IN });
  throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account is linked to your login." });
}

/** Direct (house) attribution when an admin files a contractor with no store. */
export async function resolveContractorSubmitAffiliateId(
  db: Database,
  user: SiteUser,
  input: SiteScopeInput = {},
): Promise<number | null> {
  const slug = normalizedSlug(input.slug ?? input.storeScope);
  const named = (slug && slug !== "owner") || (input.affiliateId != null && input.affiliateId > 0);
  if (!named && user.role === "admin") {
    const accessible = await listAccessibleAffiliateIds(db, user);
    if (accessible.length === 1) return accessible[0];
    if (accessible.length > 1) throw new TRPCError({ code: "BAD_REQUEST", message: CHOOSE_STORE });
    return null;
  }
  const scope = await resolveAffiliateSiteScope(db, user, input);
  return scope.mode === "store" ? scope.affiliateId : null;
}
