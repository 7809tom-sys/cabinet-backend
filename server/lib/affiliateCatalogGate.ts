import { and, eq } from "drizzle-orm";
import {
  affiliateHiddenCatalogProducts,
  affiliateStyleBranding,
  affiliates,
} from "../../drizzle/schema";
import type { CatalogKind } from "@shared/affiliateStorefrontControls";
import { cabinetProductKey } from "@shared/affiliateStorefrontControls";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export type AffiliateCatalogGate = {
  affiliateId: number;
  keys: Record<CatalogKind, Set<string>>;
  disabledStyleIds: Set<number>;
};

const EMPTY_KEYS = (): Record<CatalogKind, Set<string>> => ({
  cabinet: new Set(),
  hardware: new Set(),
  surface: new Set(),
  closet: new Set(),
});

export async function loadAffiliateCatalogGate(
  db: Database,
  slug: string | null | undefined,
): Promise<AffiliateCatalogGate | null> {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return null;
  const [affiliate] = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(eq(affiliates.slug, normalized))
    .limit(1);
  if (!affiliate) return null;
  const [hidden, disabled] = await Promise.all([
    db.select({
      catalogKind: affiliateHiddenCatalogProducts.catalogKind,
      productKey: affiliateHiddenCatalogProducts.productKey,
    }).from(affiliateHiddenCatalogProducts).where(eq(affiliateHiddenCatalogProducts.affiliateId, affiliate.id)),
    db.select({ styleId: affiliateStyleBranding.styleId })
      .from(affiliateStyleBranding)
      .where(and(eq(affiliateStyleBranding.affiliateId, affiliate.id), eq(affiliateStyleBranding.isEnabled, false))),
  ]);
  const keys = EMPTY_KEYS();
  for (const row of hidden) keys[row.catalogKind].add(row.productKey);
  return {
    affiliateId: affiliate.id,
    keys,
    disabledStyleIds: new Set(disabled.map((row) => row.styleId)),
  };
}

export function hiddenNumericIds(gate: AffiliateCatalogGate | null, kind: CatalogKind): number[] {
  if (!gate) return [];
  return Array.from(gate.keys[kind]).map((key) => Number(key)).filter((id) => Number.isInteger(id) && id > 0);
}

export function filterCabinetSourceRows<T extends {
  sourceMasterCode: string | null;
  sourceDistributorId: number;
  sourceStyleId: number;
}>(rows: T[], gate: AffiliateCatalogGate | null): T[] {
  if (!gate) return rows;
  return rows.filter((row) => {
    if (gate.disabledStyleIds.has(row.sourceStyleId)) return false;
    const code = row.sourceMasterCode?.trim();
    if (!code) return true;
    return !gate.keys.cabinet.has(cabinetProductKey(row.sourceDistributorId, code));
  });
}
