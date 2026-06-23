import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cabinets, distributorSkus } from "../../drizzle/schema";
import {
  KITCHEN_PACKAGES,
  getPackage,
  competitorAvg,
  type KitchenPackage,
} from "../../shared/packages";

// White-shaker style ids per supply line (resolved from the catalog):
//   Line A (UCD=1): 30046 · Line B (CS=2): 30010 · Line C (SK=3): 30011
const WHITE_SHAKER_STYLE_IDS = [30046, 30010, 30011];
const ASSEMBLY_PER_CABINET = 30; // $ per cabinet (all lines offer assembly)
const EST_FREIGHT_RATE = 0.08; // estimated regional LTL freight (% of cabinet subtotal)

interface PricedLine {
  masterCode: string;
  role: string;
  qty: number;
  unitCost: number | null; // lowest network line, white shaker
  lineTotal: number | null;
  available: boolean;
}

interface PricedPackage {
  slug: string;
  name: string;
  shape: string;
  blurb: string;
  cabinetCount: number;
  lines: PricedLine[];
  cabinetSubtotal: number;
  assemblyFee: number;
  estFreight: number;
  landedCost: number;
  competitors: { name: string; price: number }[];
  competitorAvg: number;
  suggestedRetail: number;
  customerSavings: number; // competitorAvg - suggestedRetail
  affiliateProfit: number; // suggestedRetail - landedCost
  affiliateMargin: number; // profit / suggestedRetail
  cornerUpgrade?: KitchenPackage["cornerUpgrade"];
  room: KitchenPackage["room"];
  layout: KitchenPackage["layout"];
}

// Build a map of masterCode -> lowest white-shaker yourCost across all lines.
async function lowestCostByCode(
  codes: string[]
): Promise<Map<string, number>> {
  const db = await getDb();
  const out = new Map<string, number>();
  if (!db || codes.length === 0) return out;

  // Resolve cabinet ids for the requested codes.
  const cabRows = await db
    .select({ id: cabinets.id, masterCode: cabinets.masterCode })
    .from(cabinets)
    .where(inArray(cabinets.masterCode, codes));

  const idToCode = new Map<number, string>();
  cabRows.forEach((c) => idToCode.set(c.id, c.masterCode));
  const ids = cabRows.map((c) => c.id);
  if (ids.length === 0) return out;

  const skuRows = await db
    .select({
      cabinetId: distributorSkus.cabinetId,
      yourCost: distributorSkus.yourCost,
    })
    .from(distributorSkus)
    .where(
      and(
        inArray(distributorSkus.cabinetId, ids),
        inArray(distributorSkus.styleId, WHITE_SHAKER_STYLE_IDS)
      )
    );

  for (const r of skuRows) {
    const code = idToCode.get(r.cabinetId!);
    if (!code) continue;
    const cost = r.yourCost != null ? Number(r.yourCost) : null;
    if (cost == null || !(cost > 0)) continue;
    const prev = out.get(code);
    if (prev == null || cost < prev) out.set(code, cost);
  }
  return out;
}

async function pricePackage(pkg: KitchenPackage): Promise<PricedPackage> {
  const codes = Array.from(new Set(pkg.bom.map((b) => b.masterCode)));
  const costMap = await lowestCostByCode(codes);

  const lines: PricedLine[] = pkg.bom.map((b) => {
    const unit = costMap.get(b.masterCode) ?? null;
    return {
      masterCode: b.masterCode,
      role: b.role,
      qty: b.qty,
      unitCost: unit,
      lineTotal: unit != null ? Number((unit * b.qty).toFixed(2)) : null,
      available: unit != null,
    };
  });

  const cabinetSubtotal = Number(
    lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0).toFixed(2)
  );
  const assemblyFee = pkg.cabinetCount * ASSEMBLY_PER_CABINET;
  const estFreight = Number((cabinetSubtotal * EST_FREIGHT_RATE).toFixed(2));
  const landedCost = Number(
    (cabinetSubtotal + assemblyFee + estFreight).toFixed(2)
  );

  const avg = Number(competitorAvg(pkg).toFixed(2));
  const suggestedRetail = Number((avg * pkg.retailFactor).toFixed(2));
  const customerSavings = Number((avg - suggestedRetail).toFixed(2));
  const affiliateProfit = Number((suggestedRetail - landedCost).toFixed(2));
  const affiliateMargin =
    suggestedRetail > 0 ? Number((affiliateProfit / suggestedRetail).toFixed(4)) : 0;

  return {
    slug: pkg.slug,
    name: pkg.name,
    shape: pkg.shape,
    blurb: pkg.blurb,
    cabinetCount: pkg.cabinetCount,
    lines,
    cabinetSubtotal,
    assemblyFee,
    estFreight,
    landedCost,
    competitors: pkg.competitors,
    competitorAvg: avg,
    suggestedRetail,
    customerSavings,
    affiliateProfit,
    affiliateMargin,
    cornerUpgrade: pkg.cornerUpgrade,
    room: pkg.room,
    layout: pkg.layout,
  };
}

export const packagesRouter = router({
  list: publicProcedure.query(async () => {
    return Promise.all(KITCHEN_PACKAGES.map((p) => pricePackage(p)));
  }),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const pkg = getPackage(input.slug);
      if (!pkg) return null;
      return pricePackage(pkg);
    }),

  // Resolve a package layout into placeable cabinets (with cabinetId + real
  // dimensions) so the design tool can drop the whole kitchen onto the canvas.
  layout: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const pkg = getPackage(input.slug);
      if (!pkg) return null;
      const db = await getDb();
      if (!db) return null;

      const codes = Array.from(new Set(pkg.layout.map((l) => l.masterCode)));
      const cabRows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          width: cabinets.width,
          depth: cabinets.depth,
          catalogImageUrl: cabinets.catalogImageUrl,
        })
        .from(cabinets)
        .where(inArray(cabinets.masterCode, codes));

      const byCode = new Map(cabRows.map((c) => [c.masterCode, c]));

      const items = pkg.layout
        .map((l) => {
          const cab = byCode.get(l.masterCode);
          if (!cab) return null;
          return {
            cabinetId: cab.id,
            masterCode: cab.masterCode,
            description: cab.description,
            placement: l.placement,
            x: l.x,
            y: l.y,
            rotation: l.rotation,
            width: cab.width ? Number(cab.width) : null,
            depth: cab.depth ? Number(cab.depth) : null,
            catalogImageUrl: cab.catalogImageUrl ?? null,
          };
        })
        .filter(Boolean);

      return {
        slug: pkg.slug,
        name: pkg.name,
        room: pkg.room,
        items,
      };
    }),
});
