import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { affiliates } from "../../drizzle/schema";
import { resolveAffiliateAccess } from "./affiliateAccess";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

type UserIdentity = { id: number; email: string | null; role: string };

export async function assertAffiliateSocialEditor(
  db: Database,
  user: UserIdentity,
  affiliateId: number,
): Promise<number> {
  if (user.role === "admin") {
    const rows = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
    return affiliateId;
  }
  const access = await resolveAffiliateAccess(db, user);
  if (!access || access.affiliateId !== affiliateId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate access required." });
  }
  if (!access.isOwner && !access.accessMarketing) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the owner, an admin, or a team member with marketing access can edit social links.",
    });
  }
  return access.affiliateId;
}
