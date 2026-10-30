import { and, eq, inArray, isNull } from "drizzle-orm";
import { contractorAccessRequests, users } from "../../drizzle/schema";
import { isApprovedUnlinkedContractorRequest, normalizeContractorEmail } from "./contractorAccessPolicy";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

let missingColumnWarned = false;

type LinkableUser = {
  id: number;
  role: string;
  email?: string | null;
};

/**
 * When someone signs up or signs in with the email on an approved
 * affiliate-submitted contractor request, attach this account and grant
 * role contractor. Only role "user" is promoted. Affiliate (partner), admin,
 * and every other role stay as they are.
 *
 * Called from the live auth writes: createEmailUser (first Supabase sign-up),
 * upsertUser (legacy OAuth upsert), and authenticateSupabaseBearer (every
 * later sign-in, after owner and vendor role sync). A missing column, before
 * docs/sql/0237_affiliate_contractor_requests.tidb.sql is applied, is logged
 * and ignored so sign-in keeps working.
 *
 * Role is updated before userId is written. If the link write fails, the next
 * sign-in still finds the unlinked approved row and retries the link.
 */
export async function linkApprovedContractorAccess<T extends LinkableUser>(
  db: Database,
  user: T,
): Promise<T> {
  const email = normalizeContractorEmail(user.email);
  if (!email) return user;
  let promoted = false;
  try {
    const rows = await db
      .select({
        id: contractorAccessRequests.id,
        userId: contractorAccessRequests.userId,
        contractorEmail: contractorAccessRequests.contractorEmail,
        status: contractorAccessRequests.status,
      })
      .from(contractorAccessRequests)
      .where(and(
        eq(contractorAccessRequests.contractorEmail, email),
        eq(contractorAccessRequests.status, "approved"),
        isNull(contractorAccessRequests.userId),
      ));
    const matches = rows.filter((row) => isApprovedUnlinkedContractorRequest(row, email));
    if (matches.length === 0) return user;
    if (user.role === "user") {
      await db.update(users).set({ role: "contractor" }).where(and(
        eq(users.id, user.id),
        eq(users.role, "user"),
      ));
      promoted = true;
    }
    await db.update(contractorAccessRequests).set({ userId: user.id }).where(and(
      inArray(contractorAccessRequests.id, matches.map((row) => row.id)),
      isNull(contractorAccessRequests.userId),
    ));
  } catch (error) {
    if (!missingColumnWarned) {
      missingColumnWarned = true;
      console.warn(
        "[Auth] Approved contractor link skipped",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  return promoted ? { ...user, role: "contractor" as T["role"] } : user;
}
