import { and, eq } from "drizzle-orm";
import { affiliates, affiliatePricingTiers, affiliateStyleBranding } from "../../drizzle/schema";
import { getDb, getPlatformPricingSettings } from "../db";
import type { AffiliateMarkup } from "@shared/affiliateBranding";
import {
  affiliateTierDashboard,
  affiliateTierRule,
  type AffiliateTierView,
  affiliateTierView,
  type StoredAffiliateTier,
} from "./affiliateTierPricing";
import type { AffiliatePricingTierRule } from "@shared/affiliatePricingTier";
import type { AffiliateTierDashboard } from "@shared/affiliatePricingTier";

/**
 * Server-only pricing context for one public affiliate storefront.
 *
 * This exposes markup instructions to server code only. It never exposes the
 * supplier cost or the protected affiliate-cost calculation to customers.
 */
export type AffiliateStorefrontPricing = {
  affiliateId: number;
  markup: AffiliateMarkup;
  /** Decorative Hardware uses supplier list plus this independent affiliate markup. */
  hardwareMarkupBps: number;
  platformSettings: Awaited<ReturnType<typeof getPlatformPricingSettings>>;
  /** Active buy-cost rule. Null keeps the platform affiliate markup. */
  tier: AffiliatePricingTierRule | null;
  tierView: AffiliateTierView | null;
  tierDashboard: AffiliateTierDashboard;
};

function parseCategoryMarkup(value: string | null): Record<string, number> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, markup]) => typeof markup === "number" && Number.isFinite(markup) && markup >= 0),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

async function pricingForAffiliate(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  affiliate: {
    id: number;
    defaultMarkupBps: number | null;
    categoryMarkupJson: string | null;
    hardwareMarkupBps: number | null;
    pricingTierId: number | null;
  },
): Promise<AffiliateStorefrontPricing> {
  const rows = await db
    .select({ styleId: affiliateStyleBranding.styleId, markupBps: affiliateStyleBranding.markupBps })
    .from(affiliateStyleBranding)
    .where(eq(affiliateStyleBranding.affiliateId, affiliate.id));
  const styleMarkupBps: Record<number, number> = {};
  for (const row of rows) {
    if (typeof row.markupBps === "number" && Number.isFinite(row.markupBps) && row.markupBps >= 0) {
      styleMarkupBps[row.styleId] = row.markupBps;
    }
  }
  const tierRow = affiliate.pricingTierId == null
    ? null
    : (await db.select().from(affiliatePricingTiers).where(eq(affiliatePricingTiers.id, affiliate.pricingTierId)).limit(1))[0] ?? null;
  const stored = tierRow ? storedTier(tierRow) : null;
  return {
    affiliateId: affiliate.id,
    markup: {
      globalMarkupBps: affiliate.defaultMarkupBps ?? 0,
      categoryMarkupBps: parseCategoryMarkup(affiliate.categoryMarkupJson),
      styleMarkupBps,
    },
    hardwareMarkupBps: Math.max(0, affiliate.hardwareMarkupBps ?? 0),
    platformSettings: await getPlatformPricingSettings(),
    tier: affiliateTierRule(stored),
    tierView: stored ? affiliateTierView(stored) : null,
    tierDashboard: affiliateTierDashboard(stored),
  };
}

function storedTier(row: typeof affiliatePricingTiers.$inferSelect): StoredAffiliateTier {
  return {
    id: row.id,
    tierCode: row.tierCode,
    tierName: row.tierName,
    basisKind: row.basisKind,
    basisPoints: row.basisPoints,
    volumeThresholdCents: row.volumeThresholdCents,
    examplePlaceholder: row.examplePlaceholder,
    sortOrder: row.sortOrder,
    activeFlag: row.activeFlag,
    notesText: row.notesText,
  };
}

/**
 * Resolve an active affiliate storefront's markup configuration. Disabled,
 * inactive, unknown, and owner scopes never receive an affiliate price context.
 */
export async function loadAffiliateStorefrontPricing(
  storefrontSlug: string | null | undefined,
): Promise<AffiliateStorefrontPricing | null> {
  const slug = storefrontSlug?.trim().toLowerCase();
  if (!slug || slug === "owner") return null;
  const db = await getDb();
  if (!db) return null;

  const [affiliate] = await db
    .select({
      id: affiliates.id,
      defaultMarkupBps: affiliates.defaultMarkupBps,
      categoryMarkupJson: affiliates.categoryMarkupJson,
      hardwareMarkupBps: affiliates.hardwareMarkupBps,
      pricingTierId: affiliates.pricingTierId,
    })
    .from(affiliates)
    .where(and(
      eq(affiliates.slug, slug),
      eq(affiliates.status, "active"),
      eq(affiliates.storefrontEnabled, true),
    ))
    .limit(1);
  if (!affiliate) return null;
  return pricingForAffiliate(db, affiliate);
}

/** Owner, estimator, and CRM pricing. Does not require the public storefront to be enabled. */
export async function loadAffiliatePricingById(
  affiliateId: number,
): Promise<AffiliateStorefrontPricing | null> {
  const db = await getDb();
  if (!db) return null;
  const [affiliate] = await db
    .select({
      id: affiliates.id,
      defaultMarkupBps: affiliates.defaultMarkupBps,
      categoryMarkupJson: affiliates.categoryMarkupJson,
      hardwareMarkupBps: affiliates.hardwareMarkupBps,
      pricingTierId: affiliates.pricingTierId,
    })
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);
  if (!affiliate) return null;
  return pricingForAffiliate(db, affiliate);
}

export async function loadAffiliateTierDashboard(affiliateId: number): Promise<AffiliateTierDashboard> {
  const pricing = await loadAffiliatePricingById(affiliateId);
  return pricing?.tierDashboard ?? { assigned: false, inactive: false, tierName: null, summary: "No pricing tier assigned. Cabinet cost uses the platform affiliate markup until an administrator assigns a tier.", examplePlaceholder: false, volumeLabel: null };
}
