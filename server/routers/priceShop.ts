import { z } from "zod";
import { eq, and, or, isNull, inArray, desc } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb, notInConflict, getPricingSettings } from "../db";
import { getPricingSettingsForViewer } from "../lib/affiliateContractorPricing";
import {
  cabinets,
  distributors,
  doorStyles,
  distributorSkus,
  pelicanCategoryMarkups,
  priceShopSnapshots,
  bundleDeals,
  kitchenDesigns,
} from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { resolveStorefrontTier, visiblePricesForViewer } from "../../shared/pricingTier";
import { sellPriceForTier } from "@shared/margins";
import { TRPCError } from "@trpc/server";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { storagePut } from "../storage";
import { bundlePricePairs, bundleSurfaceIds, calculateCurrentBundlePrice, publishedBundlePrice, type BundlePriceCandidate, type BundleSnapshotLike } from "../lib/bundleDealPricing";
import { decidePackageAccess, planKitchenPackageCopy, resolvePackagePrice, type PackageLineItem } from "@shared/kitchenPackage";
import { decideAssistAccess } from "@shared/customerDirectory";

// ─── 10×10 Kitchen Layout ────────────────────────────────────────────────────
// Industry-standard 10×10 kitchen benchmark (120" × 120").
// Excludes trim, crown molding, and lazy Susan blind corners.
// Uses standard 30" wall cabinets. No shipping included.
const LAYOUT_ITEMS_10x10 = [
  { masterCodes: ["W-30-30"], label: "Wall 30×30", qty: 2 },
  { masterCodes: ["W-36-30"], label: "Wall 36×30", qty: 1 },
  { masterCodes: ["W-12-30"], label: "Wall 12×30", qty: 1 },
  { masterCodes: ["W-18-30"], label: "Wall 18×30", qty: 1 },
  { masterCodes: ["B-36"], label: "Base 36\"", qty: 1 },
  { masterCodes: ["B-18"], label: "Base 18\"", qty: 1 },
  { masterCodes: ["B-30"], label: "Base 30\"", qty: 1 },
  { masterCodes: ["SB-36"], label: "Sink Base 36\"", qty: 1 },
  { masterCodes: ["DB-18-3"], label: "Drawer Base 18\" (3-drawer)", qty: 1 },
] as const;

// ─── 19'L Kitchen Layout ─────────────────────────────────────────────────────
// Standard layout from the Cardell Designer Collection showroom card.
// This is the same cabinet set used across all brands for apples-to-apples comparison.
// Some cabinets have multiple master codes across distributors (e.g. DCW-24-30 for UCD/Skyline,
// WDC-24-30 for Clark & Son). We list alternatives so pricing covers all styles.
const LAYOUT_ITEMS = [
  { masterCodes: ["DCW-24-30", "WDC-24-30"], label: "Diagonal Corner Wall 24×30", qty: 1 },
  { masterCodes: ["W-30-30"], label: "Wall 30×30", qty: 1 },
  { masterCodes: ["W-36-12-24"], label: "Refrigerator Wall 36×12 (24\" deep)", qty: 1 },
  { masterCodes: ["ERB-36", "LSB36", "LS-36-12"], label: "36\" Easy Reach Base", qty: 1 },
  { masterCodes: ["B-18"], label: "Base 18\"", qty: 2 },
  { masterCodes: ["W-12-30"], label: "Wall 12×30", qty: 1 },
  { masterCodes: ["SB-36"], label: "Sink Base 36\"", qty: 1 },
  { masterCodes: ["W-18-30"], label: "Wall 18×30", qty: 2 },
  { masterCodes: ["DB-18-3"], label: "Drawer Base 18\" (3-drawer)", qty: 1 },
  { masterCodes: ["W-30-12"], label: "Bridge Wall 30×12", qty: 1 },
] as const;

type BundlePricingRow = {
  designSnapshot: unknown;
  styleId: number | null;
  lockedDistributorId: number | null;
  homeownerPrice: string | null;
  bomSnapshotTotal?: string | null;
};

const DEFAULT_PELICAN_MARKUP_BPS: Record<string, number> = {
  Flooring: 6500,
  "Tile & Mosaic": 5500,
  "Sinks & Faucets": 3800,
  "Toilets & Bidets": 3500,
  "Shower & Bath": 2200,
  "Quartz Slabs (Countertops)": 1800,
};

function currentSurfaceHomeownerPrice(
  product: { listPrice: string | null; yourCost: string | null; category: string },
  markupByCategory: Map<string, number>,
): number | null {
  const currentCost = product.yourCost ?? product.listPrice;
  if (currentCost == null) return null;
  const cost = Number(currentCost);
  if (!Number.isFinite(cost)) return null;
  const markupBps = markupByCategory.get(product.category) ?? DEFAULT_PELICAN_MARKUP_BPS[product.category] ?? 0;
  return Math.round(cost * (1 + markupBps / 10000) * 100) / 100;
}

/**
 * Reprices a list of saved bundle snapshots at read time. This deliberately
 * does not use the total saved when the bundle was created: storefronts and
 * dashboards always display the current active catalog total instead.
 */
async function withCurrentBundleHomeownerPrices<T extends BundlePricingRow>(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rows: T[],
) {
  const requestedPairs = rows.flatMap((row) => bundlePricePairs(row.designSnapshot as BundleSnapshotLike, row.styleId));
  const requestedSurfaceIds = Array.from(new Set(rows.flatMap((row) => bundleSurfaceIds(row.designSnapshot as BundleSnapshotLike))));
  const masterCodes = Array.from(new Set(requestedPairs.map((pair) => pair.masterCode)));
  const styleIds = Array.from(new Set(requestedPairs.map((pair) => pair.styleId)));
  const pricingSettings = await getPricingSettings();

  let candidates: BundlePriceCandidate[] = [];
  let surfaceCandidates: Array<{ id: number; homeownerPrice: number | null }> = [];
  if (masterCodes.length > 0 && styleIds.length > 0) {
    const currentRows = await db
      .select({
        masterCode: cabinets.masterCode,
        styleId: distributorSkus.styleId,
        distributorId: distributorSkus.distributorId,
        listPrice: distributorSkus.listPrice,
        adjustedListPrice: distributorSkus.adjustedListPrice,
        wholesalePrice: distributorSkus.wholesalePrice,
        contractorPrice: distributorSkus.contractorPrice,
        homeownerPrice: distributorSkus.homeownerPrice,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
      .where(
        and(
          inArray(cabinets.masterCode, masterCodes),
          inArray(distributorSkus.styleId, styleIds),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true),
          eq(distributors.isActive, true),
          notInConflict(),
        ),
      );

    candidates = currentRows.map((row) => ({
      masterCode: row.masterCode,
      styleId: Number(row.styleId),
      distributorId: Number(row.distributorId),
      homeownerPrice: sellPriceForTier(row, pricingSettings, "homeowner"),
    }));
  }

  if (requestedSurfaceIds.length > 0) {
    const [surfaceRows, markupRows] = await Promise.all([
      db.select({
        id: pelicanProducts.id,
        category: pelicanProducts.category,
        listPrice: pelicanProducts.listPrice,
        yourCost: pelicanProducts.yourCost,
      }).from(pelicanProducts).where(and(inArray(pelicanProducts.id, requestedSurfaceIds), eq(pelicanProducts.isActive, true))),
      db.select({ category: pelicanCategoryMarkups.category, markupBps: pelicanCategoryMarkups.markupBps }).from(pelicanCategoryMarkups),
    ]);
    const markupByCategory = new Map(markupRows.map((row) => [row.category, row.markupBps]));
    surfaceCandidates = surfaceRows.map((row) => ({
      id: row.id,
      homeownerPrice: currentSurfaceHomeownerPrice(row, markupByCategory),
    }));
  }

  return rows.map((row) => {
    const livePrice = calculateCurrentBundlePrice({
      snapshot: row.designSnapshot as BundleSnapshotLike,
      bundleStyleId: row.styleId,
      lockedDistributorId: row.lockedDistributorId,
      candidates,
      surfaceCandidates,
    });
    const savedHomeownerPrice = publishedBundlePrice(row.homeownerPrice);
    const bomBaseline = publishedBundlePrice(row.bomSnapshotTotal);
    const currentHomeownerPrice = livePrice.total?.toFixed(2) ?? null;
    const compared = bomBaseline ?? savedHomeownerPrice;
    const currentPriceStatus = currentHomeownerPrice === null
      ? "incomplete" as const
      : compared === null || Number(compared) !== Number(currentHomeownerPrice)
        ? "needs_refresh" as const
        : "current" as const;
    return {
      ...row,
      // A package intentionally keeps its approved storefront amount. A cost,
      // price, or SKU mapping change therefore requires its owner to refresh
      // the package instead of silently changing a shopper's kit total.
      homeownerPrice: savedHomeownerPrice,
      displayPrice: savedHomeownerPrice,
      currentHomeownerPrice,
      currentPriceStatus,
      currentPriceMissingItemCount: livePrice.missingItemCount,
      fixtureCount: bundleSurfaceIds(row.designSnapshot as BundleSnapshotLike).length,
    };
  });
}

export const priceShopRouter = router({
  // Returns the layout definition (no pricing) for the UI to render the diagram
  getLayout: publicProcedure.query(() => {
    return {
      name: "The 19'L",
      description:
        "A common L-shaped kitchen layout (90\" × 138\") used across all styles and brands for easy comparison.",
      totalLinearFeet: 19,
      items: LAYOUT_ITEMS.map((i) => ({
        masterCode: i.masterCodes[0],
        label: i.label,
        qty: i.qty,
      })),
    };
  }),

  // Prices the full 19'L layout across all available door styles.
  // Returns one entry per style with total price and per-cabinet breakdown.
  // Admin users also see yourCost for margin visibility.
  priceAllStyles: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const viewerTier = resolveStorefrontTier(ctx.user);
    const isAdmin = ctx.user?.role === "admin";
    const ps = await getPricingSettingsForViewer(ctx.user);

    // 1. Resolve master codes → cabinet IDs (support multiple alternatives per item)
    const allMasterCodes = LAYOUT_ITEMS.flatMap((i) => [...i.masterCodes]);
    const cabinetRows = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode })
      .from(cabinets)
      .where(and(inArray(cabinets.masterCode, allMasterCodes), eq(cabinets.isActive, true)));

    const codeToId = new Map<string, number>();
    for (const r of cabinetRows) {
      codeToId.set(r.masterCode, r.id);
    }

    // Map each layout item index to all its cabinet IDs
    const itemCabinetIds: number[][] = LAYOUT_ITEMS.map((item) =>
      item.masterCodes.map((c) => codeToId.get(c)).filter((id): id is number => id != null)
    );

    const cabinetIds = Array.from(codeToId.values());
    if (cabinetIds.length === 0) return [];

    // 2. Fetch all available + published SKUs for these cabinets
    const skuRows = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        styleId: distributorSkus.styleId,
        listPrice: distributorSkus.listPrice,
        adjustedListPrice: distributorSkus.adjustedListPrice,
        wholesalePrice: distributorSkus.wholesalePrice,
        contractorPrice: distributorSkus.contractorPrice,
        homeownerPrice: distributorSkus.homeownerPrice,
        yourCost: distributorSkus.yourCost,
        platformSku: distributorSkus.platformSku,
        retailPriceBasis: distributors.retailPriceBasis,
        vendorWholesale: distributorSkus.vendorWholesale,
        vendorMarkupPercent: distributors.markupPercent,
      })
      .from(distributorSkus)
      .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(
        and(
          inArray(distributorSkus.cabinetId, cabinetIds),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true),
          eq(distributors.isActive, true),
          notInConflict()
        )
      );

    // 3. Group by (cabinetId, styleId) → best (cheapest) row
    const bestPerPair = new Map<string, (typeof skuRows)[number]>();
    for (const r of skuRows) {
      const key = `${r.cabinetId}:${r.styleId}`;
      const cur = bestPerPair.get(key);
      if (!cur) {
        bestPerPair.set(key, r);
        continue;
      }
      const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
      const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
      if (a < b) bestPerPair.set(key, r);
    }

    // 4. Fetch style metadata for all styles that have at least one priced row
    const allStyleIds = Array.from(new Set(skuRows.map((r) => r.styleId)));
    const styleRows = await db
      .select({
        id: doorStyles.id,
        styleCode: doorStyles.styleCode,
        ourName: doorStyles.ourName,
        doorStyle: doorStyles.doorStyle,
        finish: doorStyles.finish,
        color: doorStyles.color,
        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
      })
      .from(doorStyles)
      .where(and(inArray(doorStyles.id, allStyleIds), eq(doorStyles.isActive, true)));

    const styleMap = new Map<number, (typeof styleRows)[number]>();
    for (const s of styleRows) styleMap.set(s.id, s);

    // 5. For each style, compute the total layout price
    type BreakdownItem = {
      masterCode: string;
      label: string;
      qty: number;
      unitPrice: string | null;
      lineTotal: string | null;
      unitCost: string | null; // admin only - your cost per unit
      lineCost: string | null; // admin only - your cost × qty
      available: boolean;
    };

    type StyleResult = {
      styleId: number;
      styleCode: string | null;
      name: string | null;
      doorStyle: string | null;
      finish: string | null;
      color: string | null;
      thumbnailImageUrl: string | null;
      doorSampleImageUrl: string | null;
      totalPrice: string | null;
      totalCost: string | null; // admin only
      breakdown: BreakdownItem[];
      completeness: number; // fraction of items available (0-1)
    };

    const results: StyleResult[] = [];

    for (const style of styleRows) {
      let total = 0;
      let totalCost = 0;
      let itemsAvailable = 0;
      const totalItems = LAYOUT_ITEMS.reduce((s, i) => s + i.qty, 0);
      const breakdown: BreakdownItem[] = [];

      for (let idx = 0; idx < LAYOUT_ITEMS.length; idx++) {
        const item = LAYOUT_ITEMS[idx];
        const cabIds = itemCabinetIds[idx];
        if (cabIds.length === 0) {
          breakdown.push({
            masterCode: item.masterCodes[0],
            label: item.label,
            qty: item.qty,
            unitPrice: null,
            lineTotal: null,
            unitCost: null,
            lineCost: null,
            available: false,
          });
          continue;
        }

        // Find the best (cheapest) row across all alternative cabinet IDs for this style
        let row: (typeof skuRows)[number] | undefined;
        for (const cabId of cabIds) {
          const key = `${cabId}:${style.id}`;
          const candidate = bestPerPair.get(key);
          if (candidate) {
            if (!row) { row = candidate; }
            else {
              const a = Number(candidate.contractorPrice ?? candidate.wholesalePrice ?? Infinity);
              const b = Number(row.contractorPrice ?? row.wholesalePrice ?? Infinity);
              if (a < b) row = candidate;
            }
          }
        }
        if (!row) {
          breakdown.push({
            masterCode: item.masterCodes[0],
            label: item.label,
            qty: item.qty,
            unitPrice: null,
            lineTotal: null,
            unitCost: null,
            lineCost: null,
            available: false,
          });
          continue;
        }

        // Compute sell price using the same logic as the catalog
        const costRow = {
          wholesalePrice: row.wholesalePrice,
          adjustedListPrice: row.adjustedListPrice,
          yourCost: row.yourCost,
          listPrice: row.listPrice,
          retailPriceBasis: row.retailPriceBasis,
        };

        let displayPrice: number | null = null;
        if (viewerTier === "homeowner" || !viewerTier) {
          displayPrice = sellPriceForTier(costRow, ps, "homeowner");
        } else if (viewerTier === "contractor") {
          displayPrice = sellPriceForTier(costRow, ps, "contractor");
        } else if (viewerTier === "wholesale") {
          displayPrice = sellPriceForTier(costRow, ps, "wholesale");
        } else {
          displayPrice = sellPriceForTier(costRow, ps, "homeowner");
        }

        // Your cost (admin only)
        const unitCost = row.yourCost ? Number(row.yourCost) : null;

        if (displayPrice != null) {
          const lineTotal = displayPrice * item.qty;
          total += lineTotal;
          if (unitCost != null) totalCost += unitCost * item.qty;
          itemsAvailable += item.qty;
          breakdown.push({
            masterCode: item.masterCodes[0],
            label: item.label,
            qty: item.qty,
            unitPrice: displayPrice.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            unitCost: isAdmin && unitCost != null ? unitCost.toFixed(2) : null,
            lineCost: isAdmin && unitCost != null ? (unitCost * item.qty).toFixed(2) : null,
            available: true,
          });
        } else {
          breakdown.push({
            masterCode: item.masterCodes[0],
            label: item.label,
            qty: item.qty,
            unitPrice: null,
            lineTotal: null,
            unitCost: null,
            lineCost: null,
            available: false,
          });
        }
      }

      results.push({
        styleId: style.id,
        styleCode: style.styleCode,
        name: style.ourName,
        doorStyle: style.doorStyle,
        finish: style.finish,
        color: style.color,
        thumbnailImageUrl: style.thumbnailImageUrl,
        doorSampleImageUrl: style.doorSampleImageUrl,
        totalPrice: itemsAvailable > 0 ? total.toFixed(2) : null,
        totalCost: isAdmin && totalCost > 0 ? totalCost.toFixed(2) : null,
        breakdown,
        completeness: totalItems > 0 ? itemsAvailable / totalItems : 0,
      });
    }

    // Sort by total price ascending (styles with full completeness first)
    return results
      .filter((r) => r.completeness > 0)
      .sort((a, b) => {
        // Full completeness first
        if (a.completeness === 1 && b.completeness < 1) return -1;
        if (b.completeness === 1 && a.completeness < 1) return 1;
        // Then by price
        const pa = Number(a.totalPrice ?? Infinity);
        const pb = Number(b.totalPrice ?? Infinity);
        return pa - pb;
      });
  }),

  // ─── 10×10 Layout Pricing ────────────────────────────────────────────────────
  get10x10Layout: publicProcedure.query(() => {
    return {
      name: "The 10×10",
      description: "Industry-standard 10×10 kitchen benchmark (120\" × 120\"). No trim, crown, or lazy Susan. Standard 30\" wall cabinets. Shipping not included.",
      totalLinearFeet: 20,
      items: LAYOUT_ITEMS_10x10.map((i) => ({
        masterCode: i.masterCodes[0],
        label: i.label,
        qty: i.qty,
      })),
    };
  }),

  price10x10Styles: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const viewerTier = resolveStorefrontTier(ctx.user);
    const isAdmin = ctx.user?.role === "admin";
    const ps = await getPricingSettingsForViewer(ctx.user);

    const allMasterCodes = LAYOUT_ITEMS_10x10.flatMap((i) => [...i.masterCodes]);
    const cabinetRows = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode })
      .from(cabinets)
      .where(and(inArray(cabinets.masterCode, allMasterCodes), eq(cabinets.isActive, true)));
    const codeToId = new Map<string, number>();
    for (const r of cabinetRows) codeToId.set(r.masterCode, r.id);
    const itemCabinetIds: number[][] = LAYOUT_ITEMS_10x10.map((item) =>
      item.masterCodes.map((c) => codeToId.get(c)).filter((id): id is number => id != null)
    );
    const cabinetIds = Array.from(codeToId.values());
    if (cabinetIds.length === 0) return [];

    const skuRows = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        styleId: distributorSkus.styleId,
        listPrice: distributorSkus.listPrice,
        adjustedListPrice: distributorSkus.adjustedListPrice,
        wholesalePrice: distributorSkus.wholesalePrice,
        contractorPrice: distributorSkus.contractorPrice,
        homeownerPrice: distributorSkus.homeownerPrice,
        yourCost: distributorSkus.yourCost,
        retailPriceBasis: distributors.retailPriceBasis,
        vendorWholesale: distributorSkus.vendorWholesale,
        vendorMarkupPercent: distributors.markupPercent,
      })
      .from(distributorSkus)
      .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(and(
        inArray(distributorSkus.cabinetId, cabinetIds),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        eq(distributors.isActive, true),
        notInConflict()
      ));

    const bestPerPair = new Map<string, (typeof skuRows)[number]>();
    for (const r of skuRows) {
      const key = `${r.cabinetId}:${r.styleId}`;
      const cur = bestPerPair.get(key);
      if (!cur) { bestPerPair.set(key, r); continue; }
      const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
      const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
      if (a < b) bestPerPair.set(key, r);
    }

    const allStyleIds = Array.from(new Set(skuRows.map((r) => r.styleId)));
    if (allStyleIds.length === 0) return [];
    const styleRows = await db
      .select({
        id: doorStyles.id,
        styleCode: doorStyles.styleCode,
        ourName: doorStyles.ourName,
        doorStyle: doorStyles.doorStyle,
        finish: doorStyles.finish,
        color: doorStyles.color,
        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
      })
      .from(doorStyles)
      .where(and(inArray(doorStyles.id, allStyleIds), eq(doorStyles.isActive, true)));

    type BreakdownItem = { masterCode: string; label: string; qty: number; unitPrice: string | null; lineTotal: string | null; unitCost: string | null; lineCost: string | null; available: boolean; };
    type StyleResult = { styleId: number; styleCode: string | null; name: string | null; doorStyle: string | null; finish: string | null; color: string | null; thumbnailImageUrl: string | null; doorSampleImageUrl: string | null; totalPrice: string | null; totalCost: string | null; breakdown: BreakdownItem[]; completeness: number; };

    const results: StyleResult[] = [];
    const totalItems = LAYOUT_ITEMS_10x10.reduce((s, i) => s + i.qty, 0);

    for (const style of styleRows) {
      let total = 0, totalCost = 0, itemsAvailable = 0;
      const breakdown: BreakdownItem[] = [];
      for (let idx = 0; idx < LAYOUT_ITEMS_10x10.length; idx++) {
        const item = LAYOUT_ITEMS_10x10[idx];
        const cabIds = itemCabinetIds[idx];
        if (cabIds.length === 0) { breakdown.push({ masterCode: item.masterCodes[0], label: item.label, qty: item.qty, unitPrice: null, lineTotal: null, unitCost: null, lineCost: null, available: false }); continue; }
        let row: (typeof skuRows)[number] | undefined;
        for (const cabId of cabIds) {
          const candidate = bestPerPair.get(`${cabId}:${style.id}`);
          if (candidate) { if (!row) { row = candidate; } else { const a = Number(candidate.contractorPrice ?? candidate.wholesalePrice ?? Infinity); const b = Number(row.contractorPrice ?? row.wholesalePrice ?? Infinity); if (a < b) row = candidate; } }
        }
        if (!row) { breakdown.push({ masterCode: item.masterCodes[0], label: item.label, qty: item.qty, unitPrice: null, lineTotal: null, unitCost: null, lineCost: null, available: false }); continue; }
        const costRow = { wholesalePrice: row.wholesalePrice, adjustedListPrice: row.adjustedListPrice, yourCost: row.yourCost, listPrice: row.listPrice, retailPriceBasis: row.retailPriceBasis };
        const displayPrice = sellPriceForTier(costRow, ps, viewerTier === "homeowner" || !viewerTier ? "homeowner" : viewerTier === "contractor" ? "contractor" : "wholesale");
        const unitCost = row.yourCost ? Number(row.yourCost) : null;
        if (displayPrice != null) {
          const lineTotal = displayPrice * item.qty;
          total += lineTotal;
          if (unitCost != null) totalCost += unitCost * item.qty;
          itemsAvailable += item.qty;
          breakdown.push({ masterCode: item.masterCodes[0], label: item.label, qty: item.qty, unitPrice: displayPrice.toFixed(2), lineTotal: lineTotal.toFixed(2), unitCost: isAdmin && unitCost != null ? unitCost.toFixed(2) : null, lineCost: isAdmin && unitCost != null ? (unitCost * item.qty).toFixed(2) : null, available: true });
        } else {
          breakdown.push({ masterCode: item.masterCodes[0], label: item.label, qty: item.qty, unitPrice: null, lineTotal: null, unitCost: null, lineCost: null, available: false });
        }
      }
      results.push({ styleId: style.id, styleCode: style.styleCode, name: style.ourName, doorStyle: style.doorStyle, finish: style.finish, color: style.color, thumbnailImageUrl: style.thumbnailImageUrl, doorSampleImageUrl: style.doorSampleImageUrl, totalPrice: itemsAvailable > 0 ? total.toFixed(2) : null, totalCost: isAdmin && totalCost > 0 ? totalCost.toFixed(2) : null, breakdown, completeness: totalItems > 0 ? itemsAvailable / totalItems : 0 });
    }
    return results.filter((r) => r.completeness > 0).sort((a, b) => {
      if (a.completeness === 1 && b.completeness < 1) return -1;
      if (b.completeness === 1 && a.completeness < 1) return 1;
      return Number(a.totalPrice ?? Infinity) - Number(b.totalPrice ?? Infinity);
    });
  }),

  // ─── Price Shop Snapshots ─────────────────────────────────────────────────────
  saveSnapshot: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      layoutType: z.enum(["10x10", "19L"]).default("10x10"),
      data: z.array(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(priceShopSnapshots).values({
        name: input.name,
        layoutType: input.layoutType,
        snapshotData: input.data,
        totalStyles: input.data.length,
        createdBy: ctx.user.id,
      });
      return { ok: true };
    }),

  listSnapshots: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(priceShopSnapshots).orderBy(desc(priceShopSnapshots.createdAt));
  }),

  deleteSnapshot: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(priceShopSnapshots).where(eq(priceShopSnapshots.id, input.id));
      return { ok: true };
    }),

  // ─── Bundle Deals ─────────────────────────────────────────────────────────────
  saveBundleDeal: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      designSnapshot: z.any(),
      styleId: z.number().optional(),
      styleName: z.string().optional(),
      homeownerPrice: z.number().optional(),
      yourCost: z.number().optional(),
      roomWidthInches: z.number().optional(),
      roomDepthInches: z.number().optional(),
      cabinetCount: z.number().default(0),
      floorPlanImageUrl: z.string().optional(),
      heroImageUrl: z.string().max(512).optional(),
      affiliateId: z.number().optional(),
      distributorId: z.number().optional(),
      lockedDistributorId: z.number().optional(),
      sourceDesignId: z.number().int().positive().nullable().optional(),
      lineItems: z.array(z.object({
        label: z.string(),
        code: z.string(),
        category: z.string(),
        supplier: z.string(),
        qty: z.number(),
        unitPrice: z.number().nullable(),
        lineTotal: z.number().nullable(),
        section: z.enum(["cabinet", "other"]),
      })).optional(),
      priceOverride: z.number().min(0).nullable().optional(),
      discountAmount: z.number().min(0).nullable().optional(),
      layoutLabel: z.string().max(64).optional(),
      doorColor: z.string().max(128).optional(),
      featuredOnHome: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const access = ctx.user.role === "admin" ? null : await resolveAffiliateAccess(db, ctx.user);
      const packageAccess = decidePackageAccess({
        role: ctx.user.role,
        access,
        requestedAffiliateId: input.affiliateId ?? null,
      });
      let ownerAffiliateId: number | null = null;
      let ownerDistributorId: number | null = null;
      if (packageAccess.ok) {
        ownerAffiliateId = packageAccess.affiliateId;
      } else if (ctx.user.distributorId) {
        ownerDistributorId = ctx.user.distributorId;
      } else {
        throw new TRPCError({ code: "FORBIDDEN", message: packageAccess.message });
      }
      const lineItems = (input.lineItems ?? []) as PackageLineItem[];
      const price = resolvePackagePrice({
        lineItems,
        override: input.priceOverride,
        discount: input.discountAmount,
      });
      const finalPrice = lineItems.length > 0 ? price.finalPrice : (input.homeownerPrice ?? price.finalPrice);
      const planned = planKitchenPackageCopy({
        sourceDesignId: input.sourceDesignId ?? null,
        snapshot: input.designSnapshot as Record<string, unknown>,
        lineItems,
        price: { autoSum: lineItems.length > 0 ? price.autoSum : finalPrice, finalPrice },
        affiliateId: ownerAffiliateId,
        name: input.name,
      });
      if (planned.updatesSourceDesign || planned.movesSourceDesign) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A kitchen package is a copy and cannot move the source design." });
      }
      const [result] = await db.insert(bundleDeals).values({
        name: planned.bundle.name,
        description: input.description,
        designSnapshot: planned.bundle.designSnapshot,
        styleId: input.styleId,
        styleName: input.styleName,
        homeownerPrice: planned.bundle.homeownerPrice,
        yourCost: input.yourCost?.toFixed(2),
        roomWidthInches: input.roomWidthInches,
        roomDepthInches: input.roomDepthInches,
        cabinetCount: input.cabinetCount,
        floorPlanImageUrl: input.floorPlanImageUrl,
        heroImageUrl: input.heroImageUrl,
        affiliateId: ownerAffiliateId,
        distributorId: ownerDistributorId,
        lockedDistributorId: input.lockedDistributorId ?? (ownerDistributorId ? ownerDistributorId : null),
        sourceDesignId: planned.bundle.sourceDesignId,
        lineItemsJson: lineItems,
        bomSnapshotTotal: planned.bundle.bomSnapshotTotal,
        priceOverride: input.priceOverride != null ? input.priceOverride.toFixed(2) : null,
        discountAmount: input.discountAmount != null ? input.discountAmount.toFixed(2) : null,
        priceSnapshottedAt: new Date(),
        layoutLabel: input.layoutLabel,
        doorColor: input.doorColor,
        featuredOnHome: input.featuredOnHome ?? false,
        createdBy: ctx.user.id,
      });
      return { ok: true, id: (result as { insertId?: number }).insertId ?? (result as unknown as [{ insertId: number }])[0]?.insertId };
    }),

  listBundleDeals: protectedProcedure
    .input(z.object({ affiliateId: z.number().optional(), distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const selectFields = {
        id: bundleDeals.id,
        name: bundleDeals.name,
        description: bundleDeals.description,
        styleName: bundleDeals.styleName,
        styleId: bundleDeals.styleId,
        homeownerPrice: bundleDeals.homeownerPrice,
        yourCost: bundleDeals.yourCost,
        designSnapshot: bundleDeals.designSnapshot,
        lockedDistributorId: bundleDeals.lockedDistributorId,
        cabinetCount: bundleDeals.cabinetCount,
        isPublished: bundleDeals.isPublished,
        heroImageUrl: bundleDeals.heroImageUrl,
        floorPlanImageUrl: bundleDeals.floorPlanImageUrl,
        roomWidthInches: bundleDeals.roomWidthInches,
        roomDepthInches: bundleDeals.roomDepthInches,
        sortOrder: bundleDeals.sortOrder,
        affiliateId: bundleDeals.affiliateId,
        distributorId: bundleDeals.distributorId,
        bomSnapshotTotal: bundleDeals.bomSnapshotTotal,
        featuredOnHome: bundleDeals.featuredOnHome,
        lineItemsJson: bundleDeals.lineItemsJson,
        sourceDesignId: bundleDeals.sourceDesignId,
        layoutLabel: bundleDeals.layoutLabel,
        doorColor: bundleDeals.doorColor,
        priceOverride: bundleDeals.priceOverride,
        discountAmount: bundleDeals.discountAmount,
        createdAt: bundleDeals.createdAt,
      };
      // Admin sees all; affiliate/vendor sees only their own
      if (ctx.user.role === "admin" && !input?.affiliateId && !input?.distributorId) {
        return withCurrentBundleHomeownerPrices(db, await db.select(selectFields).from(bundleDeals).orderBy(desc(bundleDeals.createdAt)));
      }
      if (input?.affiliateId && ctx.user.role === "admin") {
        return withCurrentBundleHomeownerPrices(db, await db.select(selectFields).from(bundleDeals).where(eq(bundleDeals.affiliateId, input.affiliateId)).orderBy(desc(bundleDeals.createdAt)));
      }
      if (input?.distributorId && ctx.user.role === "admin") {
        return withCurrentBundleHomeownerPrices(db, await db.select(selectFields).from(bundleDeals).where(eq(bundleDeals.distributorId, input.distributorId)).orderBy(desc(bundleDeals.createdAt)));
      }
      // Non-admin: resolve their affiliate or distributor
      const access = await resolveAffiliateAccess(db, ctx.user);
      if (access && (access.isOwner || access.accessDesigner)) {
        return withCurrentBundleHomeownerPrices(db, await db.select(selectFields).from(bundleDeals).where(eq(bundleDeals.affiliateId, access.affiliateId)).orderBy(desc(bundleDeals.createdAt)));
      }
      if (ctx.user.distributorId) {
        return withCurrentBundleHomeownerPrices(db, await db.select(selectFields).from(bundleDeals).where(eq(bundleDeals.distributorId, ctx.user.distributorId)).orderBy(desc(bundleDeals.createdAt)));
      }
      throw new TRPCError({ code: "FORBIDDEN" });
    }),

  toggleBundlePublished: protectedProcedure
    .input(z.object({ id: z.number(), published: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Verify ownership
      if (ctx.user.role !== "admin") {
        const [row] = await db.select({ affiliateId: bundleDeals.affiliateId, distributorId: bundleDeals.distributorId }).from(bundleDeals).where(eq(bundleDeals.id, input.id)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const access = await resolveAffiliateAccess(db, ctx.user);
        const ownsBundle = (access && (access.isOwner || access.accessDesigner) && row.affiliateId === access.affiliateId) || (ctx.user.distributorId && row.distributorId === ctx.user.distributorId);
        if (!ownsBundle) throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.update(bundleDeals).set({ isPublished: input.published }).where(eq(bundleDeals.id, input.id));
      return { ok: true };
    }),

  deleteBundleDeal: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Verify ownership
      if (ctx.user.role !== "admin") {
        const [row] = await db.select({ affiliateId: bundleDeals.affiliateId, distributorId: bundleDeals.distributorId }).from(bundleDeals).where(eq(bundleDeals.id, input.id)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const access = await resolveAffiliateAccess(db, ctx.user);
        const ownsBundle = (access && (access.isOwner || access.accessDesigner) && row.affiliateId === access.affiliateId) || (ctx.user.distributorId && row.distributorId === ctx.user.distributorId);
        if (!ownsBundle) throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.delete(bundleDeals).where(eq(bundleDeals.id, input.id));
      return { ok: true };
    }),

  saveDesignAsPackage: protectedProcedure
    .input(z.object({
      designId: z.number().int().positive(),
      name: z.string().min(1).max(200),
      description: z.string().max(4000).optional(),
      priceOverride: z.number().min(0).nullable().optional(),
      discountAmount: z.number().min(0).nullable().optional(),
      layoutLabel: z.string().max(64).optional(),
      doorColor: z.string().max(128).optional(),
      heroImageUrl: z.string().max(512).optional(),
      lineItems: z.array(z.object({
        label: z.string(),
        code: z.string(),
        category: z.string(),
        supplier: z.string(),
        qty: z.number(),
        unitPrice: z.number().nullable(),
        lineTotal: z.number().nullable(),
        section: z.enum(["cabinet", "other"]),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [design] = await db.select().from(kitchenDesigns).where(eq(kitchenDesigns.id, input.designId)).limit(1);
      if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
      const access = ctx.user.role === "admin" ? null : await resolveAffiliateAccess(db, ctx.user);
      const assist = decideAssistAccess({ role: ctx.user.role, access, designAffiliateId: design.affiliateId });
      const ownDesign = design.userId === ctx.user.id && access && (access.isOwner || access.accessDesigner) && access.affiliateId === design.affiliateId;
      if (!assist.ok && !ownDesign) throw new TRPCError({ code: "FORBIDDEN", message: assist.ok ? "Forbidden" : assist.message });
      const placed = Array.isArray(design.placedCabinets) ? design.placedCabinets as Array<{ masterCode?: string }> : [];
      const grouped = new Map<string, PackageLineItem>();
      for (const item of placed) {
        const code = item.masterCode?.trim() ?? "";
        if (!code) continue;
        const existing = grouped.get(code);
        if (existing) existing.qty += 1;
        else grouped.set(code, { label: code, code, category: "Cabinet", supplier: "", qty: 1, unitPrice: null, lineTotal: null, section: "cabinet" });
      }
      const lineItems = (input.lineItems?.length ? input.lineItems : Array.from(grouped.values())) as PackageLineItem[];
      const price = resolvePackagePrice({ lineItems, override: input.priceOverride, discount: input.discountAmount });
      const snapshot = {
        room: design.roomData,
        placed: design.placedCabinets,
        styleId: design.selectedStyleId,
        lockedDistributorId: design.selectedDistributorId,
        roomType: design.roomType,
        selectedSurfaces: design.selectedSurfaces,
        threeDPresentation: design.threeDPresentation,
      };
      const planned = planKitchenPackageCopy({
        sourceDesignId: design.id,
        snapshot,
        lineItems,
        price,
        affiliateId: design.affiliateId,
        name: input.name,
      });
      if (planned.updatesSourceDesign) throw new TRPCError({ code: "BAD_REQUEST", message: "Packages copy a design; they do not move it." });
      const [result] = await db.insert(bundleDeals).values({
        name: input.name,
        description: input.description,
        designSnapshot: snapshot,
        styleId: design.selectedStyleId,
        homeownerPrice: planned.bundle.homeownerPrice,
        cabinetCount: placed.length,
        heroImageUrl: input.heroImageUrl ?? design.thumbnailUrl,
        affiliateId: design.affiliateId,
        lockedDistributorId: design.selectedDistributorId,
        sourceDesignId: design.id,
        lineItemsJson: lineItems,
        bomSnapshotTotal: planned.bundle.bomSnapshotTotal,
        priceOverride: input.priceOverride != null ? input.priceOverride.toFixed(2) : null,
        discountAmount: input.discountAmount != null ? input.discountAmount.toFixed(2) : null,
        priceSnapshottedAt: new Date(),
        layoutLabel: input.layoutLabel,
        doorColor: input.doorColor,
        createdBy: ctx.user.id,
      });
      return { ok: true as const, id: (result as { insertId?: number }).insertId ?? (result as unknown as [{ insertId: number }])[0]?.insertId, sourceDesignId: design.id };
    }),

  refreshBundlePrices: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), updatePackagePrice: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(bundleDeals).where(eq(bundleDeals.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin") {
        const access = await resolveAffiliateAccess(db, ctx.user);
        const owns = (access && (access.isOwner || access.accessDesigner) && row.affiliateId === access.affiliateId) || (ctx.user.distributorId != null && row.distributorId === ctx.user.distributorId);
        if (!owns) throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [priced] = await withCurrentBundleHomeownerPrices(db, [row]);
      const live = priced.currentHomeownerPrice;
      const changed = priced.currentPriceStatus === "needs_refresh";
      if (live != null) {
        const patch: { bomSnapshotTotal: string; priceSnapshottedAt: Date; homeownerPrice?: string } = {
          bomSnapshotTotal: live,
          priceSnapshottedAt: new Date(),
        };
        if (input.updatePackagePrice) {
          const discount = row.discountAmount != null ? Number(row.discountAmount) : 0;
          const next = row.priceOverride != null ? Number(row.priceOverride) : Math.max(0, Number(live) - (Number.isFinite(discount) ? discount : 0));
          patch.homeownerPrice = next.toFixed(2);
        }
        await db.update(bundleDeals).set(patch).where(eq(bundleDeals.id, row.id));
      }
      return { changed, live, previous: row.bomSnapshotTotal ?? row.homeownerPrice };
    }),

  toggleBundleFeatured: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), featured: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select({ affiliateId: bundleDeals.affiliateId, distributorId: bundleDeals.distributorId }).from(bundleDeals).where(eq(bundleDeals.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin") {
        const access = await resolveAffiliateAccess(db, ctx.user);
        const owns = (access && (access.isOwner || access.accessDesigner) && row.affiliateId === access.affiliateId) || (ctx.user.distributorId != null && row.distributorId === ctx.user.distributorId);
        if (!owns) throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.update(bundleDeals).set({ featuredOnHome: input.featured }).where(eq(bundleDeals.id, input.id));
      return { ok: true };
    }),

  // Public: list all published bundles for the storefront
  listPublishedBundles: publicProcedure
    .input(z.object({ affiliateId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(bundleDeals.isPublished, true)];
      // A storefront shows only its own packages. The main site shows unscoped packages.
      conditions.push(input?.affiliateId ? eq(bundleDeals.affiliateId, input.affiliateId) : isNull(bundleDeals.affiliateId));
      const publishedBundles = await db.select({
        id: bundleDeals.id,
        name: bundleDeals.name,
        description: bundleDeals.description,
        styleName: bundleDeals.styleName,
        styleId: bundleDeals.styleId,
        homeownerPrice: bundleDeals.homeownerPrice,
        designSnapshot: bundleDeals.designSnapshot,
        lockedDistributorId: bundleDeals.lockedDistributorId,
        cabinetCount: bundleDeals.cabinetCount,
        heroImageUrl: bundleDeals.heroImageUrl,
        floorPlanImageUrl: bundleDeals.floorPlanImageUrl,
        roomWidthInches: bundleDeals.roomWidthInches,
        roomDepthInches: bundleDeals.roomDepthInches,
        sortOrder: bundleDeals.sortOrder,
        featuredOnHome: bundleDeals.featuredOnHome,
        lineItemsJson: bundleDeals.lineItemsJson,
        layoutLabel: bundleDeals.layoutLabel,
        doorColor: bundleDeals.doorColor,
        bomSnapshotTotal: bundleDeals.bomSnapshotTotal,
        createdAt: bundleDeals.createdAt,
      }).from(bundleDeals)
        .where(and(...conditions))
        .orderBy(bundleDeals.sortOrder, desc(bundleDeals.createdAt));
      return withCurrentBundleHomeownerPrices(db, publishedBundles);
    }),

  // Public: get a single bundle's full snapshot for loading into the designer
  uploadBundleFloorPlan: protectedProcedure
    .input(z.object({
      bundleId: z.number(),
      imageBase64: z.string(),
      target: z.enum(["floor", "hero"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Verify ownership
      const [row] = await db.select({ affiliateId: bundleDeals.affiliateId, distributorId: bundleDeals.distributorId, createdBy: bundleDeals.createdBy }).from(bundleDeals).where(eq(bundleDeals.id, input.bundleId)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && row.createdBy !== ctx.user.id) {
        const access = await resolveAffiliateAccess(db, ctx.user);
        const owns = (access && (access.isOwner || access.accessDesigner) && row.affiliateId === access.affiliateId) || (ctx.user.distributorId && row.distributorId === ctx.user.distributorId);
        if (!owns) throw new TRPCError({ code: "FORBIDDEN" });
      }
      const buffer = Buffer.from(input.imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const key = `bundle-floor-plans/${input.bundleId}_${Date.now()}.png`;
      const { url } = await storagePut(key, buffer, "image/png");
      await db.update(bundleDeals).set(input.target === "hero" ? { heroImageUrl: url } : { floorPlanImageUrl: url }).where(eq(bundleDeals.id, input.bundleId));
      return { ok: true, url };
    }),

  getBundleDeal: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(bundleDeals)
        .where(and(eq(bundleDeals.id, input.id), eq(bundleDeals.isPublished, true)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const [pricedBundle] = await withCurrentBundleHomeownerPrices(db, [row]);
      if (pricedBundle.currentPriceStatus !== "current") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: pricedBundle.currentPriceStatus === "needs_refresh"
            ? "This Kitchen Package needs the affiliate to refresh its price or SKU mapping before checkout."
            : "This Kitchen Package has an incomplete current BOM and cannot be checked out.",
        });
      }
      return pricedBundle;
    }),
});
