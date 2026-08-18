import { eq, isNull } from "drizzle-orm";
import { getDb } from "../server/db.ts";
import { bundleDeals } from "../drizzle/schema.ts";
import { renderBundleFloorPlanSvg } from "../server/lib/bundleFloorPlan.ts";
import { storagePut } from "../server/storage.ts";

const db = await getDb();
if (!db) throw new Error("Database connection is unavailable.");

const missingImages = await db
  .select({ id: bundleDeals.id, name: bundleDeals.name, designSnapshot: bundleDeals.designSnapshot })
  .from(bundleDeals)
  .where(isNull(bundleDeals.floorPlanImageUrl));

for (const bundle of missingImages) {
  const svg = renderBundleFloorPlanSvg(bundle.designSnapshot, bundle.name);
  const { url } = await storagePut(`bundle-floor-plans/${bundle.id}_floor-plan.svg`, svg, "image/svg+xml");
  await db.update(bundleDeals).set({ floorPlanImageUrl: url }).where(eq(bundleDeals.id, bundle.id));
  console.log(`Backfilled floor plan for bundle #${bundle.id}: ${url}`);
}

console.log(`Finished: ${missingImages.length} bundle floor plan image(s) generated.`);
