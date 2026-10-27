import { normalizeAffiliateEmail } from "@shared/affiliateResolution";

/** The configured owner email is an administrator, including on later sign-ins. */
export function isOwnerEmail(
  email: string | null | undefined,
  ownerEmail: string | null | undefined
): boolean {
  const owner = normalizeAffiliateEmail(ownerEmail);
  return owner.length > 0 && normalizeAffiliateEmail(email) === owner;
}

export function shouldPromoteOwnerToAdmin(
  role: string | null | undefined,
  email: string | null | undefined,
  ownerEmail: string | null | undefined
): boolean {
  return role !== "admin" && isOwnerEmail(email, ownerEmail);
}
