import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import {
  getDb,
  notInConflict,
  getSplitPantriesByStyle,
  getSplitPantryBySku,
  getDoorStyleById,
  type SplitPantryBundleRow,
  type SplitPantryPartPrices,
} from "../db";
import { cabinets, distributorSkus, pantryBundles } from "../../drizzle/schema";
import {
  resolveStorefrontTier,
  tierLabel,
  type PricingTier,
} from "../../shared/pricingTier";
import { sellPriceForTier, type TierMarkupBps } from "@shared/margins";
import { getPricingSettingsForViewer } from "../lib/affiliateContractorPricing";

// A split-pantry part as presented to the client: the viewer-tier unit price for
// that single piece, plus enough identity to add it to the cart as a real SKU.
export type SplitPantryPartView = {
  role: "top" | "bottom";
  masterCode: string;
  name: string;
  unitPrice: number | null;
};

// One orderable Split Pantry: the two parts + the combined viewer-tier price.
export type SplitPantryView = {
  platformSku: string;
  distributorId: number;
  styleId: number;
  styleLabel: string;
  width: number;
  topHeight: number;
  totalHeight: number;
  tier: PricingTier;
  tierLabel: string;
  combinedPrice: number | null;
  top: SplitPantryPartView;
  bottom: SplitPantryPartView;
};

function partPrices(p: SplitPantryPartPrices | null): {
  yourCost: string | null;
  wholesalePrice: string | null;
  contractorPrice: string | null;
  homeownerPrice: string | null;
  adjustedListPrice: string | null;
  listPrice: string | null;
  retailPriceBasis: "cost_plus_tier" | "source_list";
  vendorWholesale?: string | null;
  vendorMarkupPercent?: string | number | null;
  category: string | null;
} {
  return {
    yourCost: p?.yourCost ?? null,
    wholesalePrice: p?.wholesalePrice ?? null,
    contractorPrice: p?.contractorPrice ?? null,
    homeownerPrice: p?.homeownerPrice ?? null,
    adjustedListPrice: p?.adjustedListPrice ?? null,
    listPrice: p?.listPrice ?? null,
    retailPriceBasis: p?.retailPriceBasis ?? "cost_plus_tier",
    vendorWholesale: p?.vendorWholesale ?? null,
    vendorMarkupPercent: p?.vendorMarkupPercent ?? null,
    category: p?.category ?? null,
  };
}

// Build the viewer-facing Split Pantry from a raw bundle row (with real parts).
// The combined price is the SUM of the two parts priced at the viewer's tier —
// exactly what the customer would pay adding the top and bottom individually.
// Each part's tier price is computed from the viewer's price base × the per-tier
// markup (matches the admin Margins tab), never from a pre-marked-up stored
// column. A contractor tied to a store with a saved markup uses that store's
// affiliate cost. Pantry parts carry their cabinet category so flooring and
// appliances still take the 40/60 split.
function toView(
  b: SplitPantryBundleRow,
  tier: PricingTier,
  styleLabel: string,
  ps: TierMarkupBps,
): SplitPantryView {
  const topUnit = b.top ? sellPriceForTier(partPrices(b.top), ps, tier) : null;
  const botUnit = b.bottom ? sellPriceForTier(partPrices(b.bottom), ps, tier) : null;
  const combined = topUnit != null && botUnit != null ? Math.round((topUnit + botUnit) * 100) / 100 : null;
  const topHeight = b.totalHeight - 54; // bottom is always 54" tall
  return {
    platformSku: b.platformSku,
    distributorId: b.distributorId,
    styleId: b.styleId,
    styleLabel,
    width: b.width,
    topHeight,
    totalHeight: b.totalHeight,
    tier,
    tierLabel: tierLabel(tier),
    combinedPrice: combined,
    top: {
      role: "top",
      masterCode: b.topSku,
      name: b.top?.description ?? `${b.width}\" Wall Cabinet (top)`,
      unitPrice: topUnit,
    },
    bottom: {
      role: "bottom",
      masterCode: b.bottomSku,
      name: b.bottom?.description ?? `${b.width}\" x 54\" Base (bottom)`,
      unitPrice: botUnit,
    },
  };
}

// Resolve the public-facing style label (alias > ourName > code).
function styleLabelOf(style: Awaited<ReturnType<typeof getDoorStyleById>>): string {
  if (!style) return "";
  return style.aliasName || style.ourName || style.styleCode || "";
}

// ─── Split Pantry pairing ──────────────────────────────────────────────────────
// Faircrest (Clark & Son) tall pantries are sold as TWO pieces: a 54"H bottom
// (UCB24/30/3654) plus a same-width top wall cabinet (W..24, heights 30/36/42)
// that together reach 84"/90"/96". When a user adds a split-pantry bottom, the
// order UI auto-adds the matching top in the SAME door style (never mixed).
//
// 18" pantries are single-piece tall utility cabinets and are intentionally not
// part of this pairing (there is no 18" top), so they are excluded by data.

const SUB_CATEGORY = "Split Pantry";

export type SplitPantryTop = {
  cabinetId: number;
  masterCode: string;
  description: string;
  width: number;
  topHeight: number;
  totalHeight: number;
  unitPrice: number | null;
  platformSku: string | null;
  styleId: number;
};

export const pantryRouter = router({
  // List the master codes that are split-pantry BOTTOMS, so the client can
  // recognize when a line item requires an auto-added top.
  listBottoms: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as { cabinetId: number; masterCode: string; width: number }[];
    const rows = await db
      .select({
        cabinetId: cabinets.id,
        masterCode: cabinets.masterCode,
        width: cabinets.width,
      })
      .from(cabinets)
      .where(and(eq(cabinets.subCategory, SUB_CATEGORY), eq(cabinets.isActive, true), notInConflict()));
    return rows
      .filter((r) => /^UCB\d+54$/.test(r.masterCode)) // bottoms only (…54 = 54"H)
      .map((r) => ({
        cabinetId: r.cabinetId,
        masterCode: r.masterCode,
        width: Math.round(Number(r.width ?? 0)),
      }));
  }),

  // Return true if a given cabinetId is a split-pantry bottom.
  isBottom: publicProcedure
    .input(z.object({ cabinetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { isBottom: false, width: 0 };
      const rows = await db
        .select({ masterCode: cabinets.masterCode, width: cabinets.width, sub: cabinets.subCategory })
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      const r = rows[0];
      const isBottom = !!r && r.sub === SUB_CATEGORY && /^UCB\d+54$/.test(r.masterCode);
      return { isBottom, width: isBottom ? Math.round(Number(r!.width ?? 0)) : 0 };
    }),

  // Given a split-pantry bottom (by cabinetId), a desired total height, and a
  // door style, return the matching TOP cabinet + its price in that style.
  // Falls back to the bundle table for authoritative pairing.
  pairForBottom: publicProcedure
    .input(
      z.object({
        bottomCabinetId: z.number().int().positive(),
        totalHeight: z.union([z.literal(84), z.literal(90), z.literal(96)]).default(84),
        styleId: z.number().int().positive(),
      })
    )
    .query(async ({ input }): Promise<SplitPantryTop | null> => {
      const db = await getDb();
      if (!db) return null;

      // Resolve the bottom's width.
      const bRows = await db
        .select({ masterCode: cabinets.masterCode, width: cabinets.width, sub: cabinets.subCategory })
        .from(cabinets)
        .where(eq(cabinets.id, input.bottomCabinetId))
        .limit(1);
      const bottom = bRows[0];
      if (!bottom || bottom.sub !== SUB_CATEGORY || !/^UCB\d+54$/.test(bottom.masterCode)) {
        return null; // not a split-pantry bottom
      }
      const width = Math.round(Number(bottom.width ?? 0));

      // Find the authoritative bundle for this width + height + style.
      const bundleRows = await db
        .select({
          topSku: pantryBundles.topSku,
          topListPrice: pantryBundles.topListPrice,
          width: pantryBundles.width,
          totalHeight: pantryBundles.totalHeight,
        })
        .from(pantryBundles)
        .where(
          and(
            eq(pantryBundles.width, width),
            eq(pantryBundles.totalHeight, input.totalHeight),
            eq(pantryBundles.styleId, input.styleId)
          )
        )
        .limit(1);
      const bundle = bundleRows[0];
      if (!bundle) return null; // finish not available at this size (e.g. N/A)

      // Resolve the top cabinet record + its per-style SKU.
      const topRows = await db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          width: cabinets.width,
          height: cabinets.height,
        })
        .from(cabinets)
        .where(eq(cabinets.masterCode, bundle.topSku))
        .limit(1);
      const top = topRows[0];
      if (!top) return null;

      const skuRows = await db
        .select({ unitPrice: distributorSkus.listPrice, platformSku: distributorSkus.platformSku })
        .from(distributorSkus)
        .where(
          and(
            eq(distributorSkus.cabinetId, top.cabinetId),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        )
        .limit(1);
      const sku = skuRows[0];

      return {
        cabinetId: top.cabinetId,
        masterCode: top.masterCode,
        description: top.description,
        width: Math.round(Number(top.width ?? 0)),
        topHeight: Math.round(Number(top.height ?? 0)),
        totalHeight: bundle.totalHeight,
        unitPrice: sku?.unitPrice != null ? Number(sku.unitPrice) : Number(bundle.topListPrice ?? 0),
        platformSku: sku?.platformSku ?? null,
        styleId: input.styleId,
      };
    }),

  // ── Customer-facing Split Pantry catalog ──────────────────────────────────
  // List every orderable Split Pantry for a door style, priced at the viewer's
  // tier (guests see homeowner/retail). Each entry carries its two real parts so
  // the client can add both to the cart under one grouped heading.
  listByStyle: publicProcedure
    .input(z.object({ styleId: z.number().int().positive() }))
    .query(async ({ ctx, input }): Promise<SplitPantryView[]> => {
      const tier = resolveStorefrontTier(ctx.user);
      const [bundles, style, ps] = await Promise.all([
        getSplitPantriesByStyle(input.styleId),
        getDoorStyleById(input.styleId),
        getPricingSettingsForViewer(ctx.user),
      ]);
      const label = styleLabelOf(style);
      return bundles
        .map((b) => toView(b, tier, label, ps))
        // Only surface pantries whose both parts have a usable price.
        .filter((v) => v.combinedPrice != null)
        .sort((a, b) => a.width - b.width || a.totalHeight - b.totalHeight);
    }),

  // Fetch a single Split Pantry by its platform SKU, priced at the viewer's tier.
  getBySku: publicProcedure
    .input(z.object({ platformSku: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<SplitPantryView | null> => {
      const tier = resolveStorefrontTier(ctx.user);
      const bundle = await getSplitPantryBySku(input.platformSku);
      if (!bundle) return null;
      const [style, ps] = await Promise.all([
        getDoorStyleById(bundle.styleId),
        getPricingSettingsForViewer(ctx.user),
      ]);
      return toView(bundle, tier, styleLabelOf(style), ps);
    }),
});
