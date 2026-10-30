import { and, eq, isNotNull } from "drizzle-orm";
import { affiliateContractorMarkups, affiliatePricingTiers, affiliates, contractorAccessRequests } from "../../drizzle/schema";
import { DEFAULT_PRICING_SETTINGS } from "../../shared/pricing";
import { sellPriceForTier, type AffiliateContractorCostContext, type CostBaseRow, type TierMarkupBps } from "../../shared/margins";
import { affiliateTierRule, type StoredAffiliateTier } from "./affiliateTierPricing";
import { getDb, getPlatformPricingSettings, getPricingSettings, type PricingSettingsView } from "../db";

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

type PriceDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * The submitting store. A request that already names affiliateId uses that
 * store. Older requests fall back to the submitter only when that login owns
 * exactly one store. Several stores and no affiliateId leave the tier unknown,
 * so the platform affiliate markup is the cost until a store is known.
 */
async function submittingAffiliateId(db: PriceDb, submission: ApprovedSubmission): Promise<number | null> {
  if (submission.affiliateId != null) return submission.affiliateId;
  if (submission.submittedByUserId == null) return null;
  const stores = await db.select({ id: affiliates.id })
    .from(affiliates)
    .where(eq(affiliates.userId, submission.submittedByUserId))
    .limit(2);
  return stores.length === 1 ? stores[0].id : null;
}

/** Active buy-cost rule for one store. Inactive or missing tiers stay null. */
async function storeAffiliateTier(db: PriceDb, affiliateId: number): Promise<AffiliateContractorCostContext["tier"]> {
  try {
    const [affiliate] = await db.select({ pricingTierId: affiliates.pricingTierId })
      .from(affiliates)
      .where(eq(affiliates.id, affiliateId))
      .limit(1);
    if (affiliate?.pricingTierId == null) return null;
    const [row] = await db.select({
      id: affiliatePricingTiers.id,
      tierCode: affiliatePricingTiers.tierCode,
      tierName: affiliatePricingTiers.tierName,
      basisKind: affiliatePricingTiers.basisKind,
      basisPoints: affiliatePricingTiers.basisPoints,
      volumeThresholdCents: affiliatePricingTiers.volumeThresholdCents,
      examplePlaceholder: affiliatePricingTiers.examplePlaceholder,
      sortOrder: affiliatePricingTiers.sortOrder,
      activeFlag: affiliatePricingTiers.activeFlag,
      notesText: affiliatePricingTiers.notesText,
    }).from(affiliatePricingTiers)
      .where(eq(affiliatePricingTiers.id, affiliate.pricingTierId))
      .limit(1);
    if (!row) return null;
    const stored: StoredAffiliateTier = row;
    return affiliateTierRule(stored);
  } catch (error) {
    console.warn(
      "[Pricing] Affiliate tier lookup skipped",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

/**
 * Affiliate-cost context for a contractor whose latest approved request was
 * filed by a store that has saved a markup row. Loaded once per call.
 *
 * Null when the contractor has no affiliate store, or that store has no markup
 * row. Null keeps today's site contractor tier: Cabinet Dealz cost times
 * pricing_settings.contractorMarkupBps. A saved markup is applied over that
 * store's affiliate cost, not over Cabinet Dealz cost.
 * A missing table, before docs/sql/0238 is applied, keeps the site default.
 */
export async function affiliateContractorCostContextForContractorUser(
  userId: number,
): Promise<AffiliateContractorCostContext | null> {
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
    // No markup row: keep the site contractor default. Do not switch the base.
    if (markup?.markupBps == null) return null;
    const affiliateId = await submittingAffiliateId(db, submission);
    const tier = affiliateId == null ? null : await storeAffiliateTier(db, affiliateId);
    let platformAffiliateMarkupBps = DEFAULT_PRICING_SETTINGS.affiliateMarkupBps;
    try {
      platformAffiliateMarkupBps = (await getPlatformPricingSettings()).affiliateMarkupBps;
    } catch (error) {
      console.warn(
        "[Pricing] Platform affiliate markup lookup skipped",
        error instanceof Error ? error.message : "unknown error",
      );
    }
    return {
      markupBps: markup.markupBps,
      tier,
      platformAffiliateMarkupBps,
    };
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

/**
 * Markup basis points for the affiliate who submitted this contractor's latest
 * approved request. Null when the contractor was not submitted by an affiliate
 * or that affiliate has not saved a markup (site contractor default applies).
 */
export async function affiliateMarkupBpsForContractorUser(userId: number): Promise<number | null> {
  const context = await affiliateContractorCostContextForContractorUser(userId);
  return context?.markupBps ?? null;
}

/**
 * Attach a store cost context only for role "contractor" when a markup row exists.
 * Other roles, and contractors with no markup row, keep the settings object unchanged.
 */
export function attachAffiliateContractorCost<T extends TierMarkupBps>(
  settings: T,
  role: string | null | undefined,
  context: AffiliateContractorCostContext | null,
): T & { affiliateContractorCost?: AffiliateContractorCostContext | null } {
  if (role !== "contractor" || context == null) return settings;
  return { ...settings, affiliateContractorCost: context };
}

/** Site pricing. A contractor with a saved store markup prices over that store's affiliate cost. */
export async function getPricingSettingsForViewer(user: Viewer): Promise<PricingSettingsView & TierMarkupBps> {
  const settings = await getPricingSettings();
  if (!user || user.role !== "contractor") return settings;
  const context = await affiliateContractorCostContextForContractorUser(user.id);
  return attachAffiliateContractorCost(settings, user.role, context);
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

/** Replace a cabinet line's unit price with the affiliate's cost × (1 + markup). Hardware and surfaces stay put. */
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
