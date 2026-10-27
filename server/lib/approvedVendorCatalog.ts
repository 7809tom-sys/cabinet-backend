import { eq } from "drizzle-orm";
import { distributors, vendorLines } from "../../drizzle/schema";
import { getDb } from "../db";
import { approvedVendorLinkedDistributorIds } from "./approvedVendorAccess";

/**
 * Catalog lines a signed-in vendor may open. The account's own distributor id
 * stays allowed, and every active line on its approved vendor record is added.
 */
export async function loadLinkedCatalogLineIds(user: {
  distributorId?: number | null;
  approvedVendorLineId?: number | null;
}): Promise<number[]> {
  const ids = new Set<number>();
  if (user.distributorId != null) ids.add(user.distributorId);
  if (user.approvedVendorLineId == null) return Array.from(ids).sort((left, right) => left - right);
  const db = await getDb();
  if (!db) return Array.from(ids).sort((left, right) => left - right);
  const [vendor] = await db
    .select({
      sourceKey: vendorLines.sourceKey,
      linkedDistributorIds: vendorLines.linkedDistributorIds,
      isApproved: vendorLines.isApproved,
    })
    .from(vendorLines)
    .where(eq(vendorLines.id, user.approvedVendorLineId))
    .limit(1);
  if (!vendor?.isApproved) return Array.from(ids).sort((left, right) => left - right);
  const lines = await db
    .select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive })
    .from(distributors);
  for (const id of approvedVendorLinkedDistributorIds(vendor, lines)) ids.add(id);
  return Array.from(ids).sort((left, right) => left - right);
}
