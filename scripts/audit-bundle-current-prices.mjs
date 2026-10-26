import { and, eq } from "drizzle-orm";
import { getDb } from "../server/db.ts";
import { bundleDeals, cabinets, distributorSkus, distributors } from "../drizzle/schema.ts";
import { bundlePricePairs } from "../server/lib/bundleDealPricing.ts";

const db = await getDb();
if (!db) throw new Error("Database connection is unavailable.");

const bundles = await db.select({
  id: bundleDeals.id,
  name: bundleDeals.name,
  styleId: bundleDeals.styleId,
  lockedDistributorId: bundleDeals.lockedDistributorId,
  designSnapshot: bundleDeals.designSnapshot,
}).from(bundleDeals).where(eq(bundleDeals.isPublished, true));

for (const bundle of bundles) {
  console.log(`\nBundle #${bundle.id}: ${bundle.name}`);
  for (const pair of bundlePricePairs(bundle.designSnapshot, bundle.styleId)) {
    const rows = await db.select({
      distributorId: distributorSkus.distributorId,
      available: distributorSkus.isAvailable,
      published: distributorSkus.isPublished,
      active: distributors.isActive,
      homeownerPrice: distributorSkus.homeownerPrice,
      listPrice: distributorSkus.listPrice,
    }).from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
      .where(and(eq(cabinets.masterCode, pair.masterCode), eq(distributorSkus.styleId, pair.styleId)));
    const lockedRows = bundle.lockedDistributorId == null ? rows : rows.filter((row) => row.distributorId === bundle.lockedDistributorId);
    const currentRows = lockedRows.filter((row) => row.available && row.published && row.active);
    console.log(`${pair.masterCode} / style ${pair.styleId}: ${currentRows.length ? JSON.stringify(currentRows) : "MISSING CURRENT CANDIDATE"}`);
  }
}
