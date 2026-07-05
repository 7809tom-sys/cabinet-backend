import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb, notInConflict, getPricingSettings } from "../db";
import {
  cabinets,
  distributors,
  doorStyles,
  distributorSkus,
} from "../../drizzle/schema";
import { resolveStorefrontTier, visiblePricesForViewer } from "../../shared/pricingTier";
import { sellPriceForTier } from "@shared/margins";

// ─── 19'L Kitchen Layout ─────────────────────────────────────────────────────
// Standard layout from the Cardell Designer Collection showroom card.
// This is the same cabinet set used across all brands for apples-to-apples comparison.
const LAYOUT_ITEMS = [
  { masterCode: "DCW-24-30", label: "Diagonal Corner Wall 24×30", qty: 1 },
  { masterCode: "W-30-30", label: "Wall 30×30", qty: 1 },
  { masterCode: "W-36-12-24", label: "Refrigerator Wall 36×12 (24\" deep)", qty: 1 },
  { masterCode: "LSB36", label: "36\" Lazy Susan Base", qty: 1 },
  { masterCode: "B-18", label: "Base 18\"", qty: 2 },
  { masterCode: "W-12-30", label: "Wall 12×30", qty: 1 },
  { masterCode: "SB-36", label: "Sink Base 36\"", qty: 1 },
  { masterCode: "W-18-30", label: "Wall 18×30", qty: 2 },
  { masterCode: "DB-18-3", label: "Drawer Base 18\" (3-drawer)", qty: 1 },
  { masterCode: "W-30-12", label: "Bridge Wall 30×12", qty: 1 },
] as const;

export const priceShopRouter = router({
  // Returns the layout definition (no pricing) for the UI to render the diagram
  getLayout: publicProcedure.query(() => {
    return {
      name: "The 19'L",
      description:
        "A common L-shaped kitchen layout (90\" × 138\") used across all styles and brands for easy comparison.",
      totalLinearFeet: 19,
      items: LAYOUT_ITEMS.map((i) => ({
        masterCode: i.masterCode,
        label: i.label,
        qty: i.qty,
      })),
    };
  }),

  // Prices the full 19'L layout across all available door styles.
  // Returns one entry per style with total price and per-cabinet breakdown.
  priceAllStyles: publicProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const viewerTier = resolveStorefrontTier(ctx.user);
    const isAdmin = ctx.user?.role === "admin";
    const ps = await getPricingSettings();

    // 1. Resolve master codes → cabinet IDs
    const masterCodes = LAYOUT_ITEMS.map((i) => i.masterCode);
    const cabinetRows = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode })
      .from(cabinets)
      .where(and(inArray(cabinets.masterCode, masterCodes), eq(cabinets.isActive, true)));

    const codeToId = new Map<string, number>();
    for (const r of cabinetRows) {
      codeToId.set(r.masterCode, r.id);
    }

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
      breakdown: BreakdownItem[];
      completeness: number; // fraction of items available (0-1)
    };

    const results: StyleResult[] = [];

    for (const style of styleRows) {
      let total = 0;
      let itemsAvailable = 0;
      const totalItems = LAYOUT_ITEMS.reduce((s, i) => s + i.qty, 0);
      const breakdown: BreakdownItem[] = [];

      for (const item of LAYOUT_ITEMS) {
        const cabId = codeToId.get(item.masterCode);
        if (!cabId) {
          breakdown.push({
            masterCode: item.masterCode,
            label: item.label,
            qty: item.qty,
            unitPrice: null,
            lineTotal: null,
            available: false,
          });
          continue;
        }

        const key = `${cabId}:${style.id}`;
        const row = bestPerPair.get(key);
        if (!row) {
          breakdown.push({
            masterCode: item.masterCode,
            label: item.label,
            qty: item.qty,
            unitPrice: null,
            lineTotal: null,
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

        if (displayPrice != null) {
          const lineTotal = displayPrice * item.qty;
          total += lineTotal;
          itemsAvailable += item.qty;
          breakdown.push({
            masterCode: item.masterCode,
            label: item.label,
            qty: item.qty,
            unitPrice: displayPrice.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            available: true,
          });
        } else {
          breakdown.push({
            masterCode: item.masterCode,
            label: item.label,
            qty: item.qty,
            unitPrice: null,
            lineTotal: null,
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
});
