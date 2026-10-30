import { and, eq, isNotNull } from "drizzle-orm";
import { affiliateContractorMarkups, contractorAccessRequests } from "../../drizzle/schema";
import { pricingSettingsWithAffiliateContractorMarkup } from "../../shared/affiliateContractorMarkup";
import { sellPriceForTier, type CostBaseRow, type TierMarkupBps } from "../../shared/margins";
import { getDb, getPricingSettings, type PricingSettingsView } from "../db";

type Viewer = { id: number; role: string } | null | undefined;

type ApprovedSubmission = {
  id: number;
  userId: number | null;
  status: string;
  submittedByUserId: number | null;
  affiliateId?: number | null;
  reviewedAt: Date | null;
};

let missingTableWarned = false;

export function latestAffiliateSubmission(rows: ApprovedSubmission[], userId: number): ApprovedSubmission | null {
  const eligible = rows.filter((row) =>
    row.userId === userId && row.status === "approved" && row.submittedByUserId != null,
  );
  eligible.sort((a, b) => {
    const aTime = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0;
    const bTime = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.id - a.id;
  });
  return eligible[0] ?? null;
}

/**
 * Markup basis points for the affiliate who submitted this contractor's latest
 * approved request. Null when the contractor was not submitted by an affiliate
 * or that affiliate has not saved a markup (site default applies).
 * A missing table, before docs/sql/0238 is applied, keeps the site default.
 */
export async function affiliateMarkupBpsForContractorUser(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const requests = await db.select({
      id: contractorAccessRequests.id,
      userId: contractorAccessRequests.userId,
      status: contractorAccessRequests.status,
      submittedByUserId: contractorAccessRequests.submittedByUserId,
      affiliateId: contractorAccessRequests.affiliateId,
      reviewedAt: contractorAccessRequests.reviewedAt,
    }).from(contractorAccessRequests).where(and(
      eq(contractorAccessRequests.userId, userId),
      eq(contractorAccessRequests.status, "approved"),
      isNotNull(contractorAccessRequests.submittedByUserId),
    ));
    const submission = latestAffiliateSubmission(requests, userId);
    if (submission?.submittedByUserId == null) return null;
    // Prefer the store that filed the request. A user-keyed row is only the
    // fallback for requests filed before affiliateId existed.
    const [markup] = submission.affiliateId != null
      ? await db.select({ markupBps: affiliateContractorMarkups.markupBps })
        .from(affiliateContractorMarkups)
        .where(eq(affiliateContractorMarkups.affiliateId, submission.affiliateId))
        .limit(1)
      : await db.select({ markupBps: affiliateContractorMarkups.markupBps })
        .from(affiliateContractorMarkups)
        .where(eq(affiliateContractorMarkups.affiliateUserId, submission.submittedByUserId))
        .limit(1);
    return markup?.markupBps ?? null;
  } catch (error) {
    if (!missingTableWarned) {
      missingTableWarned = true;
      console.warn(
        "[Pricing] Affiliate contractor markup lookup skipped",
        error instanceof Error ? error.message : "unknown error",
      );
    }
    return null;
  }
}

/** Site pricing, with contractorMarkupBps replaced only for a contractor whose affiliate set a markup. */
export async function getPricingSettingsForViewer(user: Viewer): Promise<PricingSettingsView> {
  const settings = await getPricingSettings();
  if (!user || user.role !== "contractor") return settings;
  const markupBps = await affiliateMarkupBpsForContractorUser(user.id);
  return pricingSettingsWithAffiliateContractorMarkup(settings, markupBps);
}

type PricedLine = {
  cabinetId?: number | null;
  styleId?: number | null;
  distributorId?: number | null;
  productKind?: string | null;
  qty: number;
  unitPrice: number | null;
  linePrice: number | null;
};

type PriceRow = CostBaseRow & {
  cabinetId: number | null;
  styleId: number | null;
  distributorId: number;
};

/** Replace a cabinet line's unit price with cost × (1 + affiliate markup). Hardware and surfaces stay put. */
export function withAffiliateContractorUnitPrice<T extends PricedLine>(
  line: T,
  rows: readonly PriceRow[],
  settings: TierMarkupBps,
): T {
  if (line.productKind === "hardware" || line.productKind === "surface") return line;
  if (line.cabinetId == null || line.styleId == null) return line;
  let best: number | null = null;
  for (const row of rows) {
    if (row.cabinetId !== line.cabinetId || row.styleId !== line.styleId) continue;
    if (line.distributorId != null && row.distributorId !== line.distributorId) continue;
    const price = sellPriceForTier(row, settings, "contractor");
    if (price == null) continue;
    if (best == null || price < best) best = price;
  }
  if (best == null) return line;
  return { ...line, unitPrice: best, linePrice: Number((best * line.qty).toFixed(2)) };
}
