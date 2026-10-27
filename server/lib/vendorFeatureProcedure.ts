import { TRPCError } from "@trpc/server";
import { distributorProcedure } from "../_core/trpc";
import { getDb } from "../db";
import type { VendorFeature } from "../../shared/vendorFeatures";
import { assertVendorFeature, loadCallerVendor } from "./vendorFeatureAccess";

/**
 * Distributor procedure that also rejects cabinet-only features for a
 * non-cabinet (or not-yet-chosen) vendor. Administrators are not rejected:
 * they can open any vendor, and sample-kit administration stays with them.
 * The portal still hides the feature so the preview matches the vendor.
 */
export function withVendorFeature(feature: VendorFeature) {
  return distributorProcedure.use(async ({ ctx, next }) => {
    if (!ctx.isAdmin) {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const vendor = await loadCallerVendor(db, {
        approvedVendorLineId: ctx.user.approvedVendorLineId ?? null,
        distributorId: ctx.distributorId,
      });
      assertVendorFeature(vendor, feature);
    }
    return next();
  });
}
