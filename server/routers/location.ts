import { z } from "zod";
import { getStateTaxRate, US_STATE_TAX_RATES } from "../../shared/usSalesTax";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { distributors } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { makeRequest, type GeocodingResult, type LatLng } from "../_core/map";
import {
  normalizeZip,
  approxZipCentroid,
  nearestWarehouseMiles,
  haversineMiles,
  DEFAULT_SERVICE_RADIUS_MI,
} from "../../shared/availability";
import { resolvePickupOriginZip, type PickupCandidate } from "../../shared/netsuiteOrder";
import { resolvePresentation } from "../lib/presentation";
import { verifyUsAddress } from "../lib/addressVerification";

// In-memory geocode cache (zip → coord). Process-lifetime only; fine for our use.
const zipCoordCache = new Map<string, LatLng | null>();

async function geocodeZip(zip: string): Promise<LatLng | null> {
  if (zipCoordCache.has(zip)) return zipCoordCache.get(zip)!;
  // Try the offline centroid first (fast, no network); only call Google when we
  // have no offline coordinate, to keep this cheap and resilient.
  const offline = approxZipCentroid(zip);
  if (offline) {
    zipCoordCache.set(zip, offline);
    return offline;
  }
  try {
    const res = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      address: `${zip}, USA`,
      components: "country:US",
    });
    const loc = res.results?.[0]?.geometry?.location ?? null;
    zipCoordCache.set(zip, loc);
    return loc;
  } catch {
    zipCoordCache.set(zip, null);
    return null;
  }
}

export const locationRouter = router({
  // Verify a full US delivery address before a shipping quote or CRM save.
  verifyAddress: publicProcedure
    .input(
      z.object({
        line1: z.string().min(1).max(256),
        line2: z.string().max(256).nullable().optional(),
        city: z.string().min(1).max(128),
        state: z.string().length(2),
        zip: z.string().min(5).max(16),
      })
    )
    .mutation(({ input }) => verifyUsAddress(input)),

  // Given a customer ZIP, report which supply lines (distributors) can serve it
  // within the service radius, with the nearest warehouse distance + lead time.
  availability: publicProcedure
    .input(
      z.object({
        zip: z.string().min(1),
        radiusMi: z.number().positive().max(3000).optional(),
      })
    )
    .query(async ({ input }) => {
      const radius = input.radiusMi ?? DEFAULT_SERVICE_RADIUS_MI;
      const zip = normalizeZip(input.zip);
      if (!zip) {
        return { zip: null, resolved: false, radiusMi: radius, lines: [], inRangeDistributorIds: [] as number[] };
      }

      const customer = await geocodeZip(zip);

      const db = await getDb();
      if (!db) {
        return { zip, resolved: !!customer, radiusMi: radius, lines: [], inRangeDistributorIds: [] as number[] };
      }

      const rows = await db
        .select({
          id: distributors.id,
          warehouseZips: distributors.warehouseZips,
          leadTimeDays: distributors.leadTimeDays,
        })
        .from(distributors)
        .where(eq(distributors.isActive, true));

      const lines = await Promise.all(
        rows.map(async (r) => {
          const zips = (r.warehouseZips ?? []) as string[];
          // Resolve each warehouse zip to a coordinate (offline-first, geocode fallback).
          const coords = await Promise.all(zips.map((z) => geocodeZip(normalizeZip(z) ?? z)));
          const nearest = nearestWarehouseMiles(customer, coords);
          const inRange = nearest !== null && nearest <= radius;
          return {
            distributorId: r.id,
            inRange,
            nearestMiles: nearest === null ? null : Math.round(nearest),
            leadTimeDays: r.leadTimeDays ?? null,
          };
        })
      );

      return {
        zip,
        resolved: !!customer,
        radiusMi: radius,
        lines,
        inRangeDistributorIds: lines.filter((l) => l.inRange).map((l) => l.distributorId),
      };
    }),

  // Given a customer ZIP, list the supply lines that offer LOCAL PICKUP within
  // their configured radius (default 100 miles). Distance is measured from the
  // line's pickup ZIP (or first warehouse ZIP) to the delivery ZIP using precise
  // geocoding when available, falling back to ZIP3 centroids. Never leaks the
  // real supplier name to customers — uses the white-label presentation name.
  pickupOptions: publicProcedure
    .input(z.object({ zip: z.string().min(1) }))
    .query(async ({ input }) => {
      const zip = normalizeZip(input.zip);
      if (!zip) return { zip: null, resolved: false, options: [] as PickupOptionOut[] };

      const customer = await geocodeZip(zip);
      const db = await getDb();
      if (!db) return { zip, resolved: !!customer, options: [] as PickupOptionOut[] };

      const rows = await db
        .select()
        .from(distributors)
        .where(eq(distributors.isActive, true));

      const options: PickupOptionOut[] = [];
      for (const r of rows) {
        if (!r.pickupEnabled) continue;
        const candidate: PickupCandidate = {
          distributorId: r.id,
          displayName: resolvePresentation(r).displayName,
          pickupEnabled: r.pickupEnabled,
          pickupRadiusMiles: r.pickupRadiusMiles ?? 100,
          pickupZip: r.pickupZip,
          pickupAddress: r.pickupAddress,
          warehouseZips: (r.warehouseZips ?? []) as string[],
        };
        const originZip = resolvePickupOriginZip(candidate);
        if (!originZip) continue;
        const origin = await geocodeZip(originZip);
        if (!customer || !origin) continue;
        const distance = haversineMiles(customer, origin);
        const radius = candidate.pickupRadiusMiles > 0 ? candidate.pickupRadiusMiles : 100;
        if (distance > radius) continue;
        options.push({
          distributorId: r.id,
          displayName: candidate.displayName,
          pickupAddress: r.pickupAddress ?? null,
          originZip,
          distanceMiles: Math.round(distance * 10) / 10,
          radiusMiles: radius,
        });
      }
      options.sort((a, b) => a.distanceMiles - b.distanceMiles);
      return { zip, resolved: !!customer, options };
    }),

  // ─── Sales tax rate lookup ────────────────────────────────────────────────
  // Returns the combined state + average local sales tax rate for a US state.
  // Used by the order review form to show an estimated tax amount to the customer.
  getTaxRate: publicProcedure
    .input(z.object({ stateCode: z.string().length(2) }))
    .query(({ input }) => {
      const info = getStateTaxRate(input.stateCode);
      if (!info) return null;
      return {
        stateCode: info.code,
        stateName: info.name,
        rate: info.rate,
        stateRate: info.stateRate,
        hasLocalTax: info.hasLocalTax,
        notes: info.notes ?? null,
      };
    }),

  // Returns the full list of states with their tax rates for the state selector.
  listStates: publicProcedure.query(() => {
    return US_STATE_TAX_RATES.map((s) => ({
      code: s.code,
      name: s.name,
      rate: s.rate,
    }));
  }),
});

type PickupOptionOut = {
  distributorId: number;
  displayName: string;
  pickupAddress: string | null;
  originZip: string;
  distanceMiles: number;
  radiusMiles: number;
};
