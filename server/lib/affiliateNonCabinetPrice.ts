import { hardwareRetailCents } from "@shared/hardwareCommerce";
import { positiveAuthorizedSurfaceBase } from "@shared/surfacePricing";
import { resolveAffiliateCatalogSale } from "@shared/affiliateCatalogSalePrice";
import { computeSellPrice } from "../routers/pelican";

type PelicanPriceRow = {
  listPrice: string | null;
  yourCost: string | null;
  retailPrice?: string | null;
  category: string;
  affiliateSalePrice?: string | number | null;
};

/** A Pelican row can be ordered when it is active and published to the catalog or the Designer. */
export function pelicanRecordIsOrderable(product: {
  isActive: boolean;
  showInCatalog: boolean;
  showInDesigner: boolean;
}): boolean {
  return product.isActive === true && (product.showInCatalog === true || product.showInDesigner === true);
}

/**
 * Affiliate Pelican unit price. The automatic price is the existing platform
 * sell price (admin retail, otherwise authorized cost × the category retail
 * markup). It does not add the store's cabinet markup.
 */
export function affiliatePelicanUnitPrice(
  product: PelicanPriceRow,
  retailMarkupByCategory: Record<string, number>,
  categoryAffiliateMarkupBps: number | null,
): number | null {
  return resolveAffiliateCatalogSale({
    fixedPrice: product.affiliateSalePrice,
    categoryMarkupBps: categoryAffiliateMarkupBps,
    cost: positiveAuthorizedSurfaceBase(product),
    automaticPrice: computeSellPrice(product, retailMarkupByCategory),
  });
}

/**
 * Affiliate hardware unit price. The automatic price is the existing one:
 * supplier list plus that store's hardware markup.
 */
export function affiliateHardwareUnitPrice(
  product: {
    listPrice: string | number | null;
    yourCost: string | number | null;
    affiliateSalePrice?: string | number | null;
  },
  storeHardwareMarkupBps: number,
  categoryAffiliateMarkupBps: number | null,
): number | null {
  const automaticCents = hardwareRetailCents(product.listPrice, storeHardwareMarkupBps);
  return resolveAffiliateCatalogSale({
    fixedPrice: product.affiliateSalePrice,
    categoryMarkupBps: categoryAffiliateMarkupBps,
    cost: product.yourCost,
    automaticPrice: automaticCents == null ? null : automaticCents / 100,
  });
}
