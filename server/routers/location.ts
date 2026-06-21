import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { distributors } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { makeRequest, type GeocodingResult, type LatLng } from "../_core/map";
import {
  normalizeZip,
  approxZipCentroid,
  nearestWarehouseMiles,
  DEFAULT_SERVICE_RADIUS_MI,
} from "../../shared/availability";

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
});
