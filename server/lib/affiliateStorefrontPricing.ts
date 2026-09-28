import { and, eq } from "drizzle-orm";
import { affiliates, affiliateStyleBranding } from "../../drizzle/schema";
import { getDb, getPlatformPricingSettings } from "../db";
import type { AffiliateMarkup } from "@shared/affiliateBranding";

/**
 * Server-only pricing context for one public affiliate storefront.
 *
 * This exposes markup instructions to server code only. It never exposes the
 * supplier cost or the protected affiliate-cost calculation to customers.
 */
export type AffiliateStorefrontPricing = {
  affiliateId: number;
  markup: AffiliateMarkup;
  platformSettings: Awaited<ReturnType<typeof getPlatformPricingSettings>>;
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
    })
    .from(affiliates)
    .where(and(
      eq(affiliates.slug, slug),
      eq(affiliates.status, "active"),
      eq(affiliates.storefrontEnabled, true),
    ))
    .limit(1);
  if (!affiliate) return null;

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

  return {
    affiliateId: affiliate.id,
    markup: {
      globalMarkupBps: affiliate.defaultMarkupBps ?? 0,
      categoryMarkupBps: parseCategoryMarkup(affiliate.categoryMarkupJson),
      styleMarkupBps,
    },
    platformSettings: await getPlatformPricingSettings(),
  };
}
