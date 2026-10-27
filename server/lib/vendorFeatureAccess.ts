import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { getDb } from "../db";
import { distributors, vendorLines } from "../../drizzle/schema";
import { approvedVendorMatchesDistributor } from "./approvedVendorAccess";
import { hasVendorFeature, type VendorFeature, type VendorFeatureSource } from "../../shared/vendorFeatures";

export type FeatureDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function assertVendorFeature(
  vendor: VendorFeatureSource | null | undefined,
  feature: VendorFeature,
): void {
  if (hasVendorFeature(vendor, feature)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "This cabinet-only supplier feature is not enabled for this vendor type.",
  });
}

export async function loadCallerVendor(
  db: FeatureDb,
  caller: { approvedVendorLineId?: number | null; distributorId?: number | null },
): Promise<VendorFeatureSource | null> {
  if (caller.approvedVendorLineId != null) {
    const [row] = await db
      .select({
        isCabinetVendor: vendorLines.isCabinetVendor,
        isApproved: vendorLines.isApproved,
      })
      .from(vendorLines)
      .where(eq(vendorLines.id, caller.approvedVendorLineId))
      .limit(1);
    if (!row?.isApproved) return null;
    return { isCabinetVendor: row.isCabinetVendor };
  }

  if (caller.distributorId == null) return null;
  const [line] = await db
    .select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive })
    .from(distributors)
    .where(eq(distributors.id, caller.distributorId))
    .limit(1);
  if (!line) return null;
  const vendors = await db
    .select({
      sourceKey: vendorLines.sourceKey,
      linkedDistributorIds: vendorLines.linkedDistributorIds,
      isApproved: vendorLines.isApproved,
      isCabinetVendor: vendorLines.isCabinetVendor,
    })
    .from(vendorLines);
  const match = vendors.find((vendor) => vendor.isApproved && approvedVendorMatchesDistributor(vendor, line));
  return match ? { isCabinetVendor: match.isCabinetVendor } : null;
}
