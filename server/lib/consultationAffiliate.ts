import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { affiliates } from "../../drizzle/schema";
import { normalizeReferralCode } from "@shared/affiliate";
import { getDb } from "../db";
import { resolveAffiliateAccess } from "./affiliateAccess";

/**
 * Browser keys used for referral attribution. The storefront currently persists
 * these in localStorage and sends them on the booking request. The same names
 * are also read from the Cookie header when a browser sends them, and they are
 * resolved to an affiliate on the server. A numeric affiliate id from the
 * client is never accepted.
 */
export const CONSULTATION_REFERRAL_COOKIE = "cd_referral_code";
export const CONSULTATION_AFFILIATE_SLUG_COOKIE = "cd_affiliate_slug";

export class ConsultationAttributionError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "PRECONDITION_FAILED",
    message: string,
  ) {
    super(message);
  }
}

export type AffiliateSlugRecord = {
  id: number;
  status: string;
  storefrontEnabled: boolean | null;
  referralCode: string | null;
};

export type AffiliateReferralRecord = {
  id: number;
  status: string;
  referralCode: string | null;
};

export type AffiliateDirectory = {
  findBySlug: (slug: string) => Promise<AffiliateSlugRecord | null>;
  findByReferralCode: (code: string) => Promise<AffiliateReferralRecord | null>;
};

type ViewerUser = { id: number; email: string | null; role: string };
type ViewerDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ConsultationViewer = {
  role: "admin" | "affiliate";
  /** Null only for an admin who asked for every store, including house bookings. */
  affiliateId: number | null;
};

function normalizeStoreSlug(value: string | null | undefined): string | null {
  const slug = (value ?? "").trim().toLowerCase();
  if (!slug || slug === "owner") return null;
  return slug;
}

export function readRequestCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const splitAt = part.indexOf("=");
    if (splitAt === -1) continue;
    if (part.slice(0, splitAt).trim() !== name) continue;
    const raw = part.slice(splitAt + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * Collapse storefront slug, referral code, public host, and cookies into one
 * slug and one referral code. Disagreeing sources are rejected instead of
 * picking a winner from the client.
 */
export function collectConsultationAttribution(input: {
  affiliateSlug?: string | null;
  referralCode?: string | null;
  hostSlug?: string | null;
  cookieSlug?: string | null;
  cookieReferralCode?: string | null;
}): { slug: string | null; referralCode: string | null } {
  const slugs = [input.affiliateSlug, input.hostSlug, input.cookieSlug]
    .map(normalizeStoreSlug)
    .filter((slug): slug is string => Boolean(slug));
  const uniqueSlugs = Array.from(new Set(slugs));
  if (uniqueSlugs.length > 1) {
    throw new ConsultationAttributionError(
      "PRECONDITION_FAILED",
      "The storefront does not match the referral.",
    );
  }

  const codes = [input.referralCode, input.cookieReferralCode]
    .map((code) => normalizeReferralCode(code ?? ""))
    .filter((code) => code.length > 0);
  const uniqueCodes = Array.from(new Set(codes));
  if (uniqueCodes.length > 1) {
    throw new ConsultationAttributionError(
      "PRECONDITION_FAILED",
      "The referral does not match the active store.",
    );
  }

  return {
    slug: uniqueSlugs[0] ?? null,
    referralCode: uniqueCodes[0] ?? null,
  };
}

/**
 * Same attribution as a storefront lead (active, storefront-enabled slug) and
 * an order (active referral code). The returned id is the only affiliate id
 * written onto the consultation.
 */
export async function resolveBookedConsultationAffiliate(
  lookup: AffiliateDirectory,
  input: {
    affiliateSlug?: string | null;
    referralCode?: string | null;
    hostSlug?: string | null;
    cookieSlug?: string | null;
    cookieReferralCode?: string | null;
  },
): Promise<number | null> {
  const { slug, referralCode } = collectConsultationAttribution(input);
  let fromSlug: number | null = null;
  if (slug) {
    const store = await lookup.findBySlug(slug);
    if (!store || store.status !== "active" || !store.storefrontEnabled) {
      throw new ConsultationAttributionError("NOT_FOUND", "This affiliate store is not available.");
    }
    fromSlug = store.id;
  }

  let fromReferral: number | null = null;
  if (referralCode) {
    const affiliate = await lookup.findByReferralCode(referralCode);
    if (affiliate && affiliate.status === "active") fromReferral = affiliate.id;
  }

  if (fromSlug != null && fromReferral != null && fromSlug !== fromReferral) {
    throw new ConsultationAttributionError(
      "PRECONDITION_FAILED",
      "The referral does not match the active store.",
    );
  }
  return fromSlug ?? fromReferral;
}

/**
 * Affiliate owners, team members with CRM or designer access, and admins.
 * A logged-in customer with no affiliate relationship is forbidden.
 * Admin may target one affiliate; omitting it returns every store, including
 * house bookings whose affiliateId is null.
 */
export async function resolveConsultationViewer(
  db: ViewerDb,
  user: ViewerUser,
  requestedAffiliateId?: number,
): Promise<ConsultationViewer> {
  if (user.role === "admin") {
    if (requestedAffiliateId != null) {
      const rows = await db
        .select({ id: affiliates.id })
        .from(affiliates)
        .where(eq(affiliates.id, requestedAffiliateId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
      return { role: "admin", affiliateId: requestedAffiliateId };
    }
    return { role: "admin", affiliateId: null };
  }

  const access = await resolveAffiliateAccess(db, user);
  const permitted = Boolean(access && (access.isOwner || access.accessCrm || access.accessDesigner));
  if (!access || !permitted) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to design appointments." });
  }
  if (requestedAffiliateId != null && requestedAffiliateId !== access.affiliateId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to design appointments." });
  }
  return { role: "affiliate", affiliateId: access.affiliateId };
}

export function consultationVisibleToViewer(
  rowAffiliateId: number | null,
  viewer: ConsultationViewer,
): boolean {
  if (viewer.role === "admin" && viewer.affiliateId == null) return true;
  return rowAffiliateId != null && rowAffiliateId === viewer.affiliateId;
}

/**
 * Backfill decision. A linked design or the consultation's own CRM deal is
 * certain. Those two must agree when both are set. An email lead is used only
 * when neither direct link has an affiliate, and every attributed lead for
 * that email names the same affiliate. Anything else stays null.
 */
export function certainConsultationAffiliateId(input: {
  designAffiliateId?: number | null;
  dealAffiliateId?: number | null;
  leadAffiliateIds?: Array<number | null | undefined>;
}): number | null {
  const designAffiliateId = positiveId(input.designAffiliateId);
  const dealAffiliateId = positiveId(input.dealAffiliateId);
  if (designAffiliateId != null && dealAffiliateId != null && designAffiliateId !== dealAffiliateId) {
    return null;
  }
  if (designAffiliateId != null || dealAffiliateId != null) {
    return designAffiliateId ?? dealAffiliateId;
  }
  const leadIds = Array.from(new Set((input.leadAffiliateIds ?? []).map(positiveId).filter((id): id is number => id != null)));
  return leadIds.length === 1 ? leadIds[0] : null;
}

function positiveId(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Shipped with the migration and not executed by this change. Railway does not
 * run drizzle migrations on process start (`pnpm start` only). Apply
 * drizzle/0215_consultation_affiliate.sql manually, the same way 0205 was applied.
 * Rebase this journal entry so it follows 0214 after earlier migrations merge.
 */
export const CONSULTATION_AFFILIATE_BACKFILL_SQL = `
UPDATE \`design_consultations\` c
LEFT JOIN \`kitchen_designs\` d ON d.id = c.designId
LEFT JOIN \`crm_deals\` deal ON deal.id = c.dealId
SET c.affiliateId = COALESCE(d.affiliateId, deal.affiliateId)
WHERE c.affiliateId IS NULL
  AND (d.affiliateId IS NOT NULL OR deal.affiliateId IS NOT NULL)
  AND (d.affiliateId IS NULL OR deal.affiliateId IS NULL OR d.affiliateId = deal.affiliateId);
UPDATE \`design_consultations\` c
LEFT JOIN \`kitchen_designs\` d ON d.id = c.designId
LEFT JOIN \`crm_deals\` deal ON deal.id = c.dealId
INNER JOIN (
  SELECT LOWER(email) AS emailKey, MIN(affiliateId) AS affiliateId
  FROM \`design_leads\`
  WHERE affiliateId IS NOT NULL
  GROUP BY LOWER(email)
  HAVING COUNT(DISTINCT affiliateId) = 1
) dl ON LOWER(c.customerEmail) = dl.emailKey
SET c.affiliateId = dl.affiliateId
WHERE c.affiliateId IS NULL
  AND d.affiliateId IS NULL
  AND deal.affiliateId IS NULL;
`.trim();
