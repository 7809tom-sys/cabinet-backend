import { and, eq, inArray } from "drizzle-orm";
import type { AffiliateMarkup } from "@shared/affiliateBranding";
import { resolveAffiliateStorefrontSale } from "@shared/affiliateBranding";
import {
  affiliateTierCodeFromName,
  affiliateTierSummary,
  formatVolumeThreshold,
  unassignedAffiliateTier,
  validateAffiliateTierDraft,
  type AffiliatePricingTierRule,
  type AffiliateTierDashboard,
  type AffiliateTierDraft,
} from "@shared/affiliatePricingTier";
import { cabinets, distributorSkus } from "../../drizzle/schema";
import type { AffiliateStorefrontPricing } from "./affiliateStorefrontPricing";

export type StoredAffiliateTier = {
  id: number;
  tierCode: string;
  tierName: string;
  basisKind: string;
  basisPoints: number;
  volumeThresholdCents: number | null;
  examplePlaceholder: boolean;
  sortOrder: number;
  activeFlag: boolean;
  notesText: string | null;
};

export type AffiliateTierView = {
  id: number;
  tierCode: string;
  tierName: string;
  basis: "cost_multiplier" | "list_discount";
  basisPoints: number;
  volumeThresholdCents: number | null;
  examplePlaceholder: boolean;
  sortOrder: number;
  active: boolean;
  notes: string | null;
  summary: string;
};

export function affiliateTierRule(row: StoredAffiliateTier | null | undefined): AffiliatePricingTierRule | null {
  if (!row?.activeFlag) return null;
  if (row.basisKind !== "cost_multiplier" && row.basisKind !== "list_discount") return null;
  return { basis: row.basisKind, basisPoints: row.basisPoints };
}

export function affiliateTierView(row: StoredAffiliateTier): AffiliateTierView {
  const basis = row.basisKind === "list_discount" ? "list_discount" : "cost_multiplier";
  return {
    id: row.id,
    tierCode: row.tierCode,
    tierName: row.tierName,
    basis,
    basisPoints: row.basisPoints,
    volumeThresholdCents: row.volumeThresholdCents,
    examplePlaceholder: row.examplePlaceholder,
    sortOrder: row.sortOrder,
    active: row.activeFlag,
    notes: row.notesText,
    summary: affiliateTierSummary({
      basis,
      basisPoints: row.basisPoints,
      volumeThresholdCents: row.volumeThresholdCents,
      examplePlaceholder: row.examplePlaceholder,
      active: row.activeFlag,
    }),
  };
}

export function affiliateTierDashboard(row: StoredAffiliateTier | null | undefined): AffiliateTierDashboard {
  if (!row) return unassignedAffiliateTier();
  const view = affiliateTierView(row);
  if (!row.activeFlag) {
    return {
      assigned: true,
      inactive: true,
      tierName: row.tierName,
      summary: `${view.summary}. Platform affiliate markup is used until an active tier is assigned.`,
      examplePlaceholder: row.examplePlaceholder,
      volumeLabel: formatVolumeThreshold(row.volumeThresholdCents),
    };
  }
  return {
    assigned: true,
    inactive: false,
    tierName: row.tierName,
    summary: view.summary,
    examplePlaceholder: row.examplePlaceholder,
    volumeLabel: formatVolumeThreshold(row.volumeThresholdCents),
  };
}

export function dollarsToCents(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function affiliateStorefrontSale(
  pricing: Pick<AffiliateStorefrontPricing, "platformSettings" | "markup" | "tier">,
  sourceCostCents: number,
  opts: {
    categoryKey?: string | null;
    styleId?: number | null;
    listPriceCents?: number | null;
    referenceRetailCents?: number | null;
  } = {},
) {
  return resolveAffiliateStorefrontSale(sourceCostCents, pricing.platformSettings, pricing.markup, {
    ...opts,
    tier: pricing.tier,
  });
}

type PlacedPriceLine = {
  masterCode?: string | null;
  styleId?: number | null;
  category?: string | null;
};

type PriceDb = {
  select: Function;
};

/** Server total for a saved affiliate design. Null when any cabinet line cannot be priced. */
export async function sumPlacedAffiliateSale(
  db: PriceDb,
  pricing: Pick<AffiliateStorefrontPricing, "platformSettings" | "markup" | "tier">,
  placedRaw: unknown,
  fallbackStyleId: number | null,
  distributorId: number | null,
): Promise<number | null> {
  const placed = Array.isArray(placedRaw) ? placedRaw as PlacedPriceLine[] : [];
  const items = new Map<string, { masterCode: string; styleId: number; category: string | null; qty: number }>();
  for (const item of placed) {
    const masterCode = item.masterCode?.trim();
    const styleId = item.styleId ?? fallbackStyleId;
    if (!masterCode || styleId == null) continue;
    const key = `${masterCode.toUpperCase()}:${styleId}`;
    const existing = items.get(key);
    if (existing) existing.qty += 1;
    else items.set(key, { masterCode, styleId, category: item.category ?? null, qty: 1 });
  }
  if (items.size === 0) return null;
  const codes = Array.from(new Set(Array.from(items.values()).map((item) => item.masterCode)));
  const styleIds = Array.from(new Set(Array.from(items.values()).map((item) => item.styleId)));
  const rows = await db
    .select({
      masterCode: cabinets.masterCode,
      category: cabinets.category,
      styleId: distributorSkus.styleId,
      yourCost: distributorSkus.yourCost,
      listPrice: distributorSkus.listPrice,
    })
    .from(distributorSkus)
    .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
    .where(and(
      inArray(cabinets.masterCode, codes),
      inArray(distributorSkus.styleId, styleIds),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.isPublished, true),
      ...(distributorId ? [eq(distributorSkus.distributorId, distributorId)] : []),
    ));
  let totalCents = 0;
  let priced = 0;
  for (const item of Array.from(items.values())) {
    const matches = rows.filter((row: { masterCode: string; styleId: number; yourCost: string | null }) =>
      row.masterCode.toUpperCase() === item.masterCode.toUpperCase() && Number(row.styleId) === item.styleId);
    if (matches.length === 0) continue;
    matches.sort((a: { yourCost: string | null }, b: { yourCost: string | null }) => Number(a.yourCost ?? Infinity) - Number(b.yourCost ?? Infinity));
    const row = matches[0] as { yourCost: string | null; listPrice: string | null; category: string | null };
    const sourceCostCents = dollarsToCents(row.yourCost);
    if (sourceCostCents == null || sourceCostCents <= 0) continue;
    const sale = affiliateStorefrontSale(pricing, sourceCostCents, {
      categoryKey: item.category ?? row.category,
      styleId: item.styleId,
      listPriceCents: dollarsToCents(row.listPrice),
    });
    totalCents += sale.retailCents * item.qty;
    priced += 1;
  }
  if (priced !== items.size) return null;
  return Math.round(totalCents) / 100;
}

export function checkedTierDraft(input: AffiliateTierDraft) {
  return validateAffiliateTierDraft(input);
}

export function nextTierCode(name: string, existing: string[]): string {
  const base = affiliateTierCodeFromName(name);
  if (!existing.includes(base)) return base;
  let suffix = 2;
  while (existing.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export type { AffiliateMarkup };
