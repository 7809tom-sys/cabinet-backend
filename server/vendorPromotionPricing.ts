import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "./db";
import { cabinets, distributorSkus, distributors, vendorPromotions } from "../drizzle/schema";
import { sellPriceForTier, type PricingTier, type TierMarkupBps } from "@shared/margins";
import {
  choosePromotedPrice,
  reconcilePromotionPrice,
  toPromotionRule,
  type PricedCandidate,
  type VendorPromotionRule,
} from "@shared/vendorPromotions";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function loadActivePromotionRules(db: Db, now = new Date()): Promise<VendorPromotionRule[]> {
  const rows = await db.select({
    id: vendorPromotions.id,
    distributorId: vendorPromotions.distributorId,
    name: vendorPromotions.name,
    skuIds: vendorPromotions.skuIds,
    styleId: vendorPromotions.styleId,
    category: vendorPromotions.category,
    discountType: vendorPromotions.discountType,
    discountValue: vendorPromotions.discountValue,
    isActive: vendorPromotions.isActive,
    startsAt: vendorPromotions.startsAt,
    endsAt: vendorPromotions.endsAt,
  }).from(vendorPromotions).where(and(
    eq(vendorPromotions.isActive, true),
    or(isNull(vendorPromotions.startsAt), lte(vendorPromotions.startsAt, now)),
    or(isNull(vendorPromotions.endsAt), gte(vendorPromotions.endsAt, now)),
  ));
  return rows.map(toPromotionRule);
}

export type CabinetPriceRow = {
  skuId: number;
  distributorId: number;
  cabinetId: number | null;
  styleId: number | null;
  category: string | null;
  yourCost: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  adjustedListPrice: string | null;
  listPrice: string | null;
  retailPriceBasis: "cost_plus_tier" | "source_list" | null;
};

export async function loadPublishedCabinetPriceRows(
  db: Db,
  cabinetIds: number[],
  styleIds: number[],
): Promise<CabinetPriceRow[]> {
  if (cabinetIds.length === 0 || styleIds.length === 0) return [];
  return db.select({
    skuId: distributorSkus.id,
    distributorId: distributorSkus.distributorId,
    cabinetId: distributorSkus.cabinetId,
    styleId: distributorSkus.styleId,
    category: cabinets.category,
    yourCost: distributorSkus.yourCost,
    wholesalePrice: distributorSkus.wholesalePrice,
    contractorPrice: distributorSkus.contractorPrice,
    adjustedListPrice: distributorSkus.adjustedListPrice,
    listPrice: distributorSkus.listPrice,
    retailPriceBasis: distributors.retailPriceBasis,
  }).from(distributorSkus)
    .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
    .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
    .where(and(
      inArray(distributorSkus.cabinetId, cabinetIds),
      inArray(distributorSkus.styleId, styleIds),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.isPublished, true),
    ));
}

export function candidatesForLine(
  rows: readonly CabinetPriceRow[],
  line: { cabinetId: number; styleId: number; distributorId?: number | null },
  settings: TierMarkupBps,
  tier: PricingTier,
): PricedCandidate[] {
  return rows.flatMap((row) => {
    if (row.cabinetId !== line.cabinetId || row.styleId !== line.styleId) return [];
    if (line.distributorId != null && row.distributorId !== line.distributorId) return [];
    const basePrice = sellPriceForTier(row, settings, tier);
    if (basePrice == null) return [];
    return [{
      distributorId: row.distributorId,
      skuId: row.skuId,
      styleId: row.styleId,
      category: row.category,
      basePrice,
    }];
  });
}

type PromoLine = {
  cabinetId: number | null;
  styleId?: number | null;
  distributorId?: number | null;
  productKind?: string | null;
  qty: number;
  unitPrice: number | null;
  linePrice: number | null;
  promoName?: string | null;
  originalUnitPrice?: number | null;
};

/** Apply the owning vendor's extra discount when the submitted price is the normal or already-promoted price. */
export function priceLineWithPromotion<T extends PromoLine>(
  line: T,
  rows: readonly CabinetPriceRow[],
  promos: readonly VendorPromotionRule[],
  settings: TierMarkupBps,
  tier: PricingTier,
  styleIdFallback: number | null,
): T {
  if (line.productKind === "hardware" || line.productKind === "surface") return line;
  const cabinetId = line.cabinetId;
  const styleId = line.styleId ?? styleIdFallback;
  if (cabinetId == null || styleId == null) return line;
  const choice = choosePromotedPrice(
    candidatesForLine(rows, { cabinetId, styleId, distributorId: line.distributorId }, settings, tier),
    promos,
  );
  if (!choice?.promo) return line;
  const unitPrice = reconcilePromotionPrice(line.unitPrice, choice.originalPrice, choice.unitPrice);
  const applied = Math.abs(unitPrice - choice.unitPrice) < 0.02;
  return {
    ...line,
    unitPrice,
    linePrice: Number((unitPrice * line.qty).toFixed(2)),
    promoName: applied ? choice.promo.name : line.promoName ?? null,
    originalUnitPrice: applied ? choice.originalPrice : line.originalUnitPrice ?? null,
  };
}
