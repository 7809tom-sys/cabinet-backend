import { z } from "zod";
import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  shippingSettings,
  freightZones,
  cabinets,
  distributors,
  distributorSkus,
  doorStyles,
  kitchenDesigns,
  type ShippingSettings,
} from "../../drizzle/schema";
import {
  normalizeZip,
  approxZipCentroid,
  pickNearestWarehouseZip,
  type WarehouseRef,
} from "../../shared/availability";
import { makeRequest, type GeocodingResult, type LatLng } from "../_core/map";
import {
  type FreightSettings,
  type FreightQuote,
  type FreightQuoteLine,
  combineStyleFreightGroups,
  type FreightRateGroup,
} from "@shared/freight";
import {
  buildPallets,
  packagedCubicFt,
  applyKitchenFloor,
  isKitchenOrder,
  totalPackagedLoad,
  type PalletCaps,
  type FreightItemPackage,
} from "@shared/liveFreight";
import { easypostQuote, type LiveQuoteAddress } from "../_core/easypost";

// ─── Settings loading + defaults ────────────────────────────────────────────────
import { freightquoteQuote } from "../_core/freightquote";
import { globaltranzQuote } from "../_core/globaltranz";
import { normalizeSpeedshipFreightClass, worldwideexpressQuote } from "../_core/worldwideexpress";
import { logFreightApiCall, getFreightApiLogs } from "../_core/freightApiLog";
import { createFreightQuoteToken } from "../_core/freightQuoteToken";
import { getPricingSettings } from "../db";
import { sellPriceForTier } from "@shared/margins";

// ─── Settings loading + defaults ────────────────────────────────────────────────
const DEFAULT_SETTINGS: FreightSettings = {
  enabled: true,
  originZip: "",
  rateModel: "per_cwt",
  handlingFeeCents: 0,
  minChargeCents: 8900,
  liftgateFeeCents: 7500,
  residentialFeeCents: 6500,
  insideDeliveryFeeCents: 5000,
  markupBps: 1500,
  damageFeeBps: 0,
  freeFreightThresholdCents: 0,
  defaultCabinetWeightLbs: 45,
};

function rowToSettings(row: ShippingSettings): FreightSettings {
  return {
    enabled: row.enabled,
    originZip: row.originZip,
    rateModel: row.rateModel,
    handlingFeeCents: row.handlingFeeCents,
    minChargeCents: row.minChargeCents,
    liftgateFeeCents: row.liftgateFeeCents,
    residentialFeeCents: row.residentialFeeCents,
    insideDeliveryFeeCents: row.insideDeliveryFeeCents,
    markupBps: row.markupBps,
    damageFeeBps: row.damageFeeBps,
    freeFreightThresholdCents: row.freeFreightThresholdCents,
    defaultCabinetWeightLbs: Number(row.defaultCabinetWeightLbs),
  };
}

function rowToPalletCaps(row: ShippingSettings): PalletCaps {
  return {
    standardPalletLengthIn: Number(row.standardPalletLengthIn),
    palletLengthIn: Number(row.palletLengthIn),
    palletWidthIn: Number(row.palletWidthIn),
    palletHeightIn: Number(row.palletHeightIn),
    palletMaxWeightLbs: Number(row.palletMaxWeightLbs),
    palletMaxCubicFt: Number(row.palletMaxCubicFt),
    palletTareLbs: Number(row.palletTareLbs),
  };
}

async function loadSettingsRow(): Promise<ShippingSettings | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(shippingSettings).limit(1);
  return rows[0] ?? null;
}

const accessorialsSchema = z
  .object({
    liftgate: z.boolean().optional(),
    residential: z.boolean().optional(),
    insideDelivery: z.boolean().optional(),
    limitedAccess: z.boolean().optional(),
  })
  .optional();

const itemsSchema = z
  .array(
    z.object({
      cabinetId: z.number().int().positive().nullable(),
      masterCode: z.string().max(64).nullable().optional(),
      styleId: z.number().int().positive().nullable().optional(),
      distributorId: z.number().int().positive().nullable().optional(),
      qty: z.number().int().min(1).max(999),
      weightLbs: z.number().min(0).max(5000).nullable().optional(),
    })
  )
  .max(500)
  .default([]);

type FreightItemInput = {
  cabinetId: number | null;
  masterCode?: string | null;
  styleId?: number | null;
  distributorId?: number | null;
  qty: number;
  weightLbs?: number | null;
};

function attachFreightQuoteToken(
  quote: FreightQuote,
  input: {
    destinationZip: string;
    items: FreightItemInput[];
    merchandiseSubtotalCents: number;
    accessorials?: { residential?: boolean; liftgate?: boolean };
  },
): FreightQuote {
  if (!quote.available) return quote;
  return {
    ...quote,
    quoteToken: createFreightQuoteToken({
      totalCents: quote.totalCents,
      merchandiseSubtotalCents: input.merchandiseSubtotalCents,
      destinationZip: input.destinationZip,
      residential: input.accessorials?.residential === true,
      liftgate: input.accessorials?.liftgate === true,
      items: input.items,
    }),
  };
}

// Resolve packaged weight + cubic feet per order line from the catalog, with the
// configured fallbacks. Returns both the per-line packages (for pallet building)
// and the flat per-line weights (for the legacy estimator).
async function resolvePackages(
  items: FreightItemInput[],
  row: ShippingSettings | null,
  fallbackWeight: number
): Promise<{ packages: FreightItemPackage[]; weighted: { weightLbs: number | null; qty: number }[] }> {
  const fallbackCubicFt = row ? Number(row.defaultCabinetCubicFt) : 8;

  const ids = items
    .map((i) => i.cabinetId)
    .filter((id): id is number => typeof id === "number");
  const codes = items
    .map((i) => i.masterCode)
    .filter((c): c is string => typeof c === "string" && c.length > 0);

  type Pkg = {
    weight: number | null;
    l: number | null;
    w: number | null;
    h: number | null;
    physicalWidth: number | null;
    physicalHeight: number | null;
    physicalDepth: number | null;
    isTrim: boolean;
  };
  const byId = new Map<number, Pkg>();
  const byCode = new Map<string, Pkg>();

  if (ids.length > 0 || codes.length > 0) {
    const db = await getDb();
    if (db) {
      if (ids.length > 0) {
        const rows = await db
          .select({
            id: cabinets.id,
            weight: cabinets.pkgWeight,
            fallbackWeight: cabinets.weight,
            l: cabinets.pkgLength,
            w: cabinets.pkgWidth,
            h: cabinets.pkgHeight,
            physicalWidth: cabinets.width,
            physicalHeight: cabinets.height,
            physicalDepth: cabinets.depth,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
          })
          .from(cabinets)
          .where(inArray(cabinets.id, ids));
        for (const r of rows) {
          byId.set(r.id, {
            weight: r.weight != null
              ? Number(r.weight)
              : r.fallbackWeight != null
                ? Number(r.fallbackWeight)
                : null,
            l: r.l != null ? Number(r.l) : null,
            w: r.w != null ? Number(r.w) : null,
            h: r.h != null ? Number(r.h) : null,
            physicalWidth: r.physicalWidth != null ? Number(r.physicalWidth) : null,
            physicalHeight: r.physicalHeight != null ? Number(r.physicalHeight) : null,
            physicalDepth: r.physicalDepth != null ? Number(r.physicalDepth) : null,
            isTrim: /trim|molding|moulding|crown|valance|toe.?kick/i.test(`${r.category ?? ""} ${r.subCategory ?? ""}`),
          });
        }
      }
      if (codes.length > 0) {
        const rows = await db
          .select({
            code: cabinets.masterCode,
            weight: cabinets.pkgWeight,
            fallbackWeight: cabinets.weight,
            l: cabinets.pkgLength,
            w: cabinets.pkgWidth,
            h: cabinets.pkgHeight,
            physicalWidth: cabinets.width,
            physicalHeight: cabinets.height,
            physicalDepth: cabinets.depth,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
          })
          .from(cabinets)
          .where(inArray(cabinets.masterCode, codes));
        for (const r of rows) {
          byCode.set(r.code, {
            weight: r.weight != null
              ? Number(r.weight)
              : r.fallbackWeight != null
                ? Number(r.fallbackWeight)
                : null,
            l: r.l != null ? Number(r.l) : null,
            w: r.w != null ? Number(r.w) : null,
            h: r.h != null ? Number(r.h) : null,
            physicalWidth: r.physicalWidth != null ? Number(r.physicalWidth) : null,
            physicalHeight: r.physicalHeight != null ? Number(r.physicalHeight) : null,
            physicalDepth: r.physicalDepth != null ? Number(r.physicalDepth) : null,
            isTrim: /trim|molding|moulding|crown|valance|toe.?kick/i.test(`${r.category ?? ""} ${r.subCategory ?? ""}`),
          });
        }
      }
    }
  }

  const packages: FreightItemPackage[] = [];
  const weighted: { weightLbs: number | null; qty: number }[] = [];

  for (const it of items) {
    const pkg =
      it.cabinetId != null
        ? byId.get(it.cabinetId)
        : it.masterCode
          ? byCode.get(it.masterCode)
          : undefined;

    const resolvedWeight =
      it.weightLbs != null ? it.weightLbs : pkg?.weight ?? null;
    weighted.push({ weightLbs: resolvedWeight, qty: it.qty });

    const cubicFt = packagedCubicFt(
      pkg?.l ?? null,
      pkg?.w ?? null,
      pkg?.h ?? null,
      fallbackCubicFt
    );
    packages.push({
      weightLbs: resolvedWeight != null && resolvedWeight > 0 ? resolvedWeight : fallbackWeight,
      cubicFt,
      qty: it.qty,
      maxPackageLengthIn: Math.max(
        pkg?.l ?? 0,
        pkg?.w ?? 0,
        pkg?.h ?? 0,
        pkg?.physicalWidth ?? 0,
        pkg?.physicalHeight ?? 0,
        pkg?.physicalDepth ?? 0,
      ) || null,
      isTrim: pkg?.isTrim ?? false,
    });
  }

  return { packages, weighted };
}

// ─── Freight origin resolution (nearest distributor warehouse) ───────────────
// In-memory geocode cache (zip → coord). Process-lifetime only; mirrors the
// location router so destination/warehouse ZIPs resolve offline-first.
const zipCoordCache = new Map<string, LatLng | null>();
const zipAddressCache = new Map<string, LiveQuoteAddress | null>();

async function geocodeZip(zip: string): Promise<LatLng | null> {
  if (zipCoordCache.has(zip)) return zipCoordCache.get(zip)!;
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

function addressComponent(
  components: GeocodingResult["results"][number]["address_components"],
  type: string,
  preferShort = false,
): string | null {
  const component = components.find((candidate) => candidate.types.includes(type));
  if (!component) return null;
  return preferShort ? component.short_name : component.long_name;
}

/** Resolve non-invented city/state metadata required by the Speedship LTL request. */
async function resolveZipAddress(zip: string): Promise<LiveQuoteAddress | null> {
  const normalized = normalizeZip(zip);
  if (!normalized) return null;
  if (zipAddressCache.has(normalized)) return zipAddressCache.get(normalized)!;
  try {
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      address: `${normalized}, USA`,
      components: "country:US",
    });
    const components = result.results?.[0]?.address_components ?? [];
    const locality = addressComponent(components, "locality")
      ?? addressComponent(components, "postal_town")
      ?? addressComponent(components, "administrative_area_level_2");
    const region = addressComponent(components, "administrative_area_level_1", true);
    const address = locality && region ? { locality, region, countryCode: "US" as const } : null;
    zipAddressCache.set(normalized, address);
    return address;
  } catch {
    zipAddressCache.set(normalized, null);
    return null;
  }
}

/**
 * Figure out which distributor(s) the cart's cabinets belong to. We look up the
 * distributor_skus rows for the cabinetIds present in the cart. A well-formed
 * order is single-line (one distributor), so we use the most common distributor.
 * Returns null when no cabinetIds resolve to a SKU.
 */
async function resolveCartDistributorId(
  items: FreightItemInput[],
  explicit?: number | null
): Promise<number | null> {
  if (explicit != null) return explicit;
  const ids = items
    .map((i) => i.cabinetId)
    .filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ distributorId: distributorSkus.distributorId })
    .from(distributorSkus)
    .where(inArray(distributorSkus.cabinetId, ids));
  if (rows.length === 0) return null;
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.distributorId, (counts.get(r.distributorId) ?? 0) + 1);
  let bestId: number | null = null;
  let bestN = -1;
  for (const [id, n] of Array.from(counts.entries())) {
    if (n > bestN) {
      bestN = n;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Resolve the freight ORIGIN ZIP: ship from the distributor warehouse nearest to
 * the destination instead of one fixed origin. Falls back to `fallbackZip`
 * (settings.originZip) when the distributor has no warehouse ZIPs or cannot be
 * resolved.
 */
async function resolveOriginZip(
  destinationZip: string,
  distributorId: number | null,
  fallbackZip: string
): Promise<string> {
  if (distributorId == null) return fallbackZip;
  const db = await getDb();
  if (!db) return fallbackZip;
  const rows = await db
    .select({ warehouseZips: distributors.warehouseZips })
    .from(distributors)
    .where(eq(distributors.id, distributorId))
    .limit(1);
  const zips = (rows[0]?.warehouseZips ?? []) as string[];
  const normalized = zips
    .map((z) => normalizeZip(z))
    .filter((z): z is string => !!z);
  if (normalized.length === 0) return fallbackZip;

  const customer = await geocodeZip(normalizeZip(destinationZip) ?? destinationZip);
  const warehouses: WarehouseRef[] = await Promise.all(
    normalized.map(async (zip) => ({ zip, coord: await geocodeZip(zip) }))
  );
  const nearest = pickNearestWarehouseZip(customer, warehouses);
  return nearest ?? fallbackZip;
}

export function normalizedDoorStyleOriginZips(
  storedOrigins: string[] | null | undefined,
  legacyOrigin: string | null | undefined,
): string[] {
  return Array.from(new Set([...(storedOrigins ?? []), legacyOrigin ?? ""]
    .map((zip) => normalizeZip(zip))
    .filter((zip): zip is string => Boolean(zip))));
}

async function chooseNearestDoorStyleOriginZip(
  destinationZip: string,
  originZips: string[],
): Promise<string> {
  if (originZips.length <= 1) return originZips[0] ?? "";
  const customer = await geocodeZip(normalizeZip(destinationZip) ?? destinationZip);
  const warehouses: WarehouseRef[] = await Promise.all(
    originZips.map(async (zip) => ({ zip, coord: await geocodeZip(zip) })),
  );
  return pickNearestWarehouseZip(customer, warehouses) ?? originZips[0];
}

type StyleFreightGroup = {
  key: string;
  label: string;
  originZip: string;
  flatFreightFeeCents: number | null;
  usedOperationsOriginFallback: boolean;
  missingOriginStyle: {
    id: number;
    name: string;
    distributorId: number;
    distributorName: string;
  } | null;
  items: FreightItemInput[];
};

type FreightSimulationMode = "pallet_preview" | "saved_configuration" | "plan_b";

type FreightSimulationGroup = {
  key: string;
  label: string;
  originZip: string;
  planBFeeCents: number | null;
  source: "preview" | "live" | "plan_b" | "estimator" | "unavailable";
  carrier: string | null;
  baseAmountCents: number | null;
  liveError: string | null;
  carrierRetryAt: number | null;
  usedOperationsOriginFallback: boolean;
  missingOriginStyle: {
    id: number;
    name: string;
    distributorId: number;
    distributorName: string;
  } | null;
  palletCount: number;
  totalWeightLbs: number;
  totalContentsWeightLbs: number;
  totalCubicFt: number;
  pallets: Array<{
    lengthIn: number;
    widthIn: number;
    heightIn: number;
    weightLbs: number;
    contentsWeightLbs: number;
    contentsCubicFt: number;
  }>;
};

async function resolveStyleFreightGroups(input: {
  destinationZip: string;
  items: FreightItemInput[];
  explicitDistributorId?: number | null;
  fallbackOriginZip: string;
  /** Operations-only test escape hatch; customer quotes still require a style ZIP. */
  allowMissingStyleOriginFallback?: boolean;
}): Promise<StyleFreightGroup[]> {
  const db = await getDb();
  const requestedStyleIds = Array.from(
    new Set(
      input.items
        .map((item) => item.styleId)
        .filter((styleId): styleId is number => typeof styleId === "number" && styleId > 0),
    ),
  );
  const cabinetIds = Array.from(
    new Set(
      input.items
        .map((item) => item.cabinetId)
        .filter((cabinetId): cabinetId is number => typeof cabinetId === "number" && cabinetId > 0),
    ),
  );

  type StyleMeta = {
    id: number;
    distributorId: number;
    distributorName: string;
    ourName: string;
    aliasName: string | null;
    warehouseZip: string | null;
    warehouseZips: string[] | null;
    flatFreightFeeCents: number | null;
  };
  const styleById = new Map<number, StyleMeta>();
  const candidatesByCabinet = new Map<number, StyleMeta[]>();

  if (db && requestedStyleIds.length > 0) {
    const rows = await db
      .select({
        id: doorStyles.id,
        distributorId: doorStyles.distributorId,
        distributorName: distributors.name,
        ourName: doorStyles.ourName,
        aliasName: doorStyles.aliasName,
        warehouseZip: doorStyles.warehouseZip,
        warehouseZips: doorStyles.warehouseZips,
        flatFreightFeeCents: doorStyles.flatFreightFeeCents,
      })
      .from(doorStyles)
      .innerJoin(distributors, eq(doorStyles.distributorId, distributors.id))
      .where(inArray(doorStyles.id, requestedStyleIds));
    for (const row of rows) styleById.set(row.id, row);
  }

  if (db && cabinetIds.length > 0) {
    const rows = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        id: doorStyles.id,
        distributorId: doorStyles.distributorId,
        distributorName: distributors.name,
        ourName: doorStyles.ourName,
        aliasName: doorStyles.aliasName,
        warehouseZip: doorStyles.warehouseZip,
        warehouseZips: doorStyles.warehouseZips,
        flatFreightFeeCents: doorStyles.flatFreightFeeCents,
      })
      .from(distributorSkus)
      .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .innerJoin(distributors, eq(doorStyles.distributorId, distributors.id))
      .where(inArray(distributorSkus.cabinetId, cabinetIds));
    for (const row of rows) {
      const candidate: StyleMeta = row;
      const current = candidatesByCabinet.get(row.cabinetId) ?? [];
      current.push(candidate);
      candidatesByCabinet.set(row.cabinetId, current);
    }
  }

  const groups = new Map<string, StyleFreightGroup>();
  for (const item of input.items) {
    const requestedStyleId = item.styleId ?? null;
    const directStyle = requestedStyleId ? styleById.get(requestedStyleId) : undefined;
    const candidates = item.cabinetId ? candidatesByCabinet.get(item.cabinetId) ?? [] : [];
    const requestedDistributorId = item.distributorId ?? input.explicitDistributorId ?? null;
    const matchedStyle = requestedStyleId
      ? (directStyle && (!requestedDistributorId || directStyle.distributorId === requestedDistributorId)
          ? directStyle
          : undefined)
      : candidates.find(
          (candidate) => !requestedDistributorId || candidate.distributorId === requestedDistributorId,
        ) ?? (candidates.length === 1 ? candidates[0] : undefined);

    if (requestedStyleId && !matchedStyle) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The selected cabinet style could not be matched to its shipping origin. Review Featured Door Styles and request a new quote.",
      });
    }

    const distributorId = matchedStyle?.distributorId ?? requestedDistributorId;
    const styleOriginZips = normalizedDoorStyleOriginZips(
      matchedStyle?.warehouseZips,
      matchedStyle?.warehouseZip,
    );
    const usedOperationsOriginFallback = Boolean(matchedStyle && styleOriginZips.length === 0);
    if (matchedStyle && styleOriginZips.length === 0 && !input.allowMissingStyleOriginFallback) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${matchedStyle.aliasName || matchedStyle.ourName} does not have a Shipping Origin ZIP in Featured Door Styles.`,
      });
    }
    const originZip = styleOriginZips.length > 0
      ? await chooseNearestDoorStyleOriginZip(input.destinationZip, styleOriginZips)
      : await resolveOriginZip(input.destinationZip, distributorId, input.fallbackOriginZip);
    const key = matchedStyle
      ? `style:${matchedStyle.id}:${originZip}`
      : `fallback:${distributorId ?? "global"}:${originZip}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const styleLabel = matchedStyle?.aliasName || matchedStyle?.ourName;
    groups.set(key, {
      key,
      label: `${styleLabel || "Configured supply line"} · ${usedOperationsOriginFallback ? "Operations test origin" : "origin"} ${originZip}`,
      originZip,
      flatFreightFeeCents: matchedStyle?.flatFreightFeeCents ?? null,
      usedOperationsOriginFallback,
      missingOriginStyle: usedOperationsOriginFallback && matchedStyle
        ? {
            id: matchedStyle.id,
            name: matchedStyle.aliasName || matchedStyle.ourName,
            distributorId: matchedStyle.distributorId,
            distributorName: matchedStyle.distributorName,
          }
        : null,
      items: [item],
    });
  }

  return Array.from(groups.values());
}

// Build a stable FreightQuote from a live carrier amount.
function liveQuoteToFreightQuote(
  carrierCents: number,
  settings: FreightSettings,
  merchandiseSubtotalCents: number,
  isKitchen: boolean,
  kitchenFloorCents: number,
  billableWeightLbs: number,
  palletCount: number,
  carrierLabel: string | null
): FreightQuote {
  const lines: FreightQuoteLine[] = [];
  lines.push({
    label: `LTL freight${carrierLabel ? ` — ${carrierLabel}` : ""} (${palletCount} pallet${palletCount === 1 ? "" : "s"})`,
    amountCents: carrierCents,
  });

  if (settings.handlingFeeCents > 0) {
    lines.push({ label: "Handling", amountCents: settings.handlingFeeCents });
  }

  let freightBeforeMarkupCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const markupCents = Math.round((freightBeforeMarkupCents * settings.markupBps) / 10000);
  const damageFeeCents = Math.round((freightBeforeMarkupCents * settings.damageFeeBps) / 10000);

  let totalCents = freightBeforeMarkupCents + markupCents + damageFeeCents;

  // Kitchen floor (raise up to $800 for kitchen-scale orders).
  const floor = applyKitchenFloor({
    ratedFreightCents: totalCents,
    isKitchen,
    kitchenFreightFloorCents: kitchenFloorCents,
  });
  if (floor.floorApplied) {
    lines.push({
      label: "Kitchen freight minimum",
      amountCents: floor.finalCents - totalCents,
    });
    totalCents = floor.finalCents;
  }

  // Free-freight threshold on merchandise subtotal.
  const freeFreightApplied =
    settings.freeFreightThresholdCents > 0 &&
    merchandiseSubtotalCents >= settings.freeFreightThresholdCents;
  if (freeFreightApplied) totalCents = 0;

  return {
    available: true,
    zoneName: carrierLabel,
    billableWeightLbs,
    lines,
    freightBeforeMarkupCents,
    markupCents,
    damageFeeCents,
    totalCents,
    freeFreightApplied,
  };
}

type LiveRateRequest = Parameters<typeof easypostQuote>[1];
type LiveRateResult = {
  ok: boolean;
  amountCents: number;
  carrier?: string;
  service?: string;
  error?: string;
  retryAfterMs?: number;
};

async function requestLiveRate(input: {
  provider: NonNullable<ShippingSettings["liveProvider"]>;
  settings: ShippingSettings;
  liveApiKey: string;
  request: LiveRateRequest;
  palletCount: number;
  totalWeightLbs: number;
}): Promise<LiveRateResult> {
  const startedAt = Date.now();
  let live: LiveRateResult;
  if (input.provider === "freightquote") {
    live = await freightquoteQuote(
      {
        clientId: input.settings.fqClientId ?? "",
        clientSecret: input.settings.fqClientSecret ?? "",
        accountNumber: input.settings.fqAccountNumber ?? "",
        environment: (input.settings.fqEnvironment ?? "sandbox") as "sandbox" | "production",
      },
      input.request,
    );
  } else if (input.provider === "globaltranz") {
    live = await globaltranzQuote(
      {
        apiKey: input.settings.gtzApiKey ?? "",
        username: input.settings.gtzUsername ?? "",
        password: input.settings.gtzPassword ?? "",
        accountNumber: input.settings.gtzAccountNumber ?? "",
        environment: (input.settings.gtzEnvironment ?? "sandbox") as "sandbox" | "production",
      },
      input.request,
    );
  } else if (input.provider === "worldwideexpress") {
    const isProduction = input.settings.wwexEnvironment === "production";
    const [fromAddress, toAddress] = await Promise.all([
      resolveZipAddress(input.request.fromZip),
      resolveZipAddress(input.request.toZip),
    ]);
    live = await worldwideexpressQuote(
      {
        clientId: input.settings.wwexClientId ?? "",
        clientSecret: input.settings.wwexClientSecret ?? "",
        accountNumber: input.settings.wwexAccountNumber ?? "",
        username: input.settings.wwexUsername ?? undefined,
        password: input.settings.wwexPassword ?? undefined,
        environment: (input.settings.wwexEnvironment ?? "sandbox") as "sandbox" | "production",
        tokenUrl: isProduction
          ? input.settings.wwexProductionTokenUrl
          : input.settings.wwexSandboxTokenUrl,
        rateUrl: isProduction
          ? input.settings.wwexProductionRateUrl
          : input.settings.wwexSandboxRateUrl,
      },
      { ...input.request, fromAddress: fromAddress ?? undefined, toAddress: toAddress ?? undefined },
    );
  } else {
    live = await easypostQuote(input.liveApiKey, input.request);
  }

  logFreightApiCall({
    broker: input.provider,
    fromZip: input.request.fromZip,
    toZip: input.request.toZip,
    palletCount: input.palletCount,
    totalWeightLbs: input.totalWeightLbs,
    freightClass: input.request.freightClass,
    accessorials: [
      input.request.residential ? "RESIDENTIAL" : null,
      input.request.liftgate ? "LIFTGATE" : null,
      input.request.limitedAccess ? "LIMITED_ACCESS" : null,
    ].filter(Boolean) as string[],
    ok: live.ok,
    amountCents: live.amountCents,
    carrier: live.carrier,
    service: live.service,
    error: live.error,
    durationMs: Date.now() - startedAt,
  });
  return live;
}

function liveProviderEnvironment(row: ShippingSettings): "sandbox" | "production" | null {
  if (row.liveProvider === "freightquote") return row.fqEnvironment ?? "sandbox";
  if (row.liveProvider === "globaltranz") return row.gtzEnvironment ?? "sandbox";
  if (row.liveProvider === "worldwideexpress") return row.wwexEnvironment ?? "sandbox";
  return null;
}

async function simulateFreight(input: {
  destinationZip: string;
  items: FreightItemInput[];
  merchandiseSubtotalCents: number;
  accessorials?: {
    liftgate?: boolean;
    residential?: boolean;
    insideDelivery?: boolean;
    limitedAccess?: boolean;
  };
  mode: FreightSimulationMode;
  allowMissingStyleOriginFallback?: boolean;
  forceCarrierQuote?: boolean;
  useWwexStagingConnection?: boolean;
}) {
  const settingsRow = await loadSettingsRow();
  if (!settingsRow) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Save Operations shipping settings before running a freight simulation.",
    });
  }

  const destinationZip = normalizeZip(input.destinationZip);
  if (!destinationZip) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid 5-digit destination ZIP." });
  }

  const settings = rowToSettings(settingsRow);
  const caps = rowToPalletCaps(settingsRow);
  const overall = await resolvePackages(input.items, settingsRow, settings.defaultCabinetWeightLbs);
  const overallLoad = totalPackagedLoad(overall.packages);
  const isKitchen = isKitchenOrder(overallLoad.units, settingsRow.kitchenMinCabinets);
  const styleGroups = await resolveStyleFreightGroups({
    destinationZip,
    items: input.items,
    fallbackOriginZip: settings.originZip,
    allowMissingStyleOriginFallback: input.allowMissingStyleOriginFallback,
  });

  const groups: FreightSimulationGroup[] = [];
  const rateGroups: FreightRateGroup[] = [];
  const unavailable: string[] = [];
  let totalBillableWeightLbs = 0;
  const shouldRequestCarrier = input.mode === "saved_configuration";
  const shouldUseWwexStaging = input.useWwexStagingConnection === true;
  const carrierSettings = shouldUseWwexStaging
    ? { ...settingsRow, liveProvider: "worldwideexpress" as const, wwexEnvironment: "sandbox" as const }
    : settingsRow;
  const savedSpeedshipClass = normalizeSpeedshipFreightClass(settingsRow.freightClass);
  const freightClass = shouldUseWwexStaging ? savedSpeedshipClass ?? "175" : settingsRow.freightClass;
  const freightClassDefaultedForStaging = shouldUseWwexStaging && savedSpeedshipClass == null;

  for (const group of styleGroups) {
    const resolvedGroup = await resolvePackages(
      group.items,
      settingsRow,
      settings.defaultCabinetWeightLbs,
    );
    const plan = buildPallets(resolvedGroup.packages, caps);
    totalBillableWeightLbs += plan.totalWeightLbs;
    const detail: FreightSimulationGroup = {
      key: group.key,
      label: group.label,
      originZip: group.originZip,
      planBFeeCents: group.flatFreightFeeCents,
      source: "preview",
      carrier: null,
      baseAmountCents: null,
      liveError: null,
      carrierRetryAt: null,
      palletCount: plan.palletCount,
      totalWeightLbs: plan.totalWeightLbs,
      totalContentsWeightLbs: plan.totalContentsWeightLbs,
      totalCubicFt: plan.totalCubicFt,
      pallets: plan.pallets,
      usedOperationsOriginFallback: group.usedOperationsOriginFallback,
      missingOriginStyle: group.missingOriginStyle,
    };

    if (input.mode === "plan_b") {
      if (group.flatFreightFeeCents == null) {
        detail.source = "unavailable";
        detail.liveError = "No Plan B fee is configured for this Featured Door Style.";
        unavailable.push(`${group.label}: no Plan B fee configured`);
      } else {
        detail.source = "plan_b";
        detail.baseAmountCents = group.flatFreightFeeCents;
        rateGroups.push({
          key: group.key,
          label: `${group.label} · ${plan.palletCount} pallet${plan.palletCount === 1 ? "" : "s"}`,
          originZip: group.originZip,
          source: "plan_b",
          baseAmountCents: group.flatFreightFeeCents,
          palletCount: plan.palletCount,
        });
      }
    } else if (shouldRequestCarrier && carrierSettings.liveProvider !== "estimator") {
      const live = await requestLiveRate({
        provider: carrierSettings.liveProvider,
        settings: carrierSettings,
        liveApiKey: carrierSettings.liveApiKey ?? "",
        request: {
          fromZip: group.originZip,
          toZip: destinationZip,
          pallets: plan.pallets.map((pallet) => ({
            lengthIn: pallet.lengthIn,
            widthIn: pallet.widthIn,
            heightIn: pallet.heightIn,
            weightLbs: pallet.weightLbs,
          })),
          freightClass,
          residential: input.accessorials?.residential,
          liftgate: input.accessorials?.liftgate,
          limitedAccess: input.accessorials?.limitedAccess,
        },
        palletCount: plan.palletCount,
        totalWeightLbs: plan.totalWeightLbs,
      });
      const carrier = [live.carrier, live.service].filter(Boolean).join(" ") || null;
      detail.carrier = carrier;
      detail.liveError = live.ok ? null : live.error ?? "Carrier unavailable";
      detail.carrierRetryAt = !live.ok && typeof live.retryAfterMs === "number"
        ? Date.now() + live.retryAfterMs
        : null;
      if (live.ok) {
        detail.source = "live";
        detail.baseAmountCents = live.amountCents;
        rateGroups.push({
          key: group.key,
          label: `${group.label}${carrier ? ` · ${carrier}` : ""} · ${plan.palletCount} pallet${plan.palletCount === 1 ? "" : "s"}`,
          originZip: group.originZip,
          source: "live",
          baseAmountCents: live.amountCents,
          carrier,
          palletCount: plan.palletCount,
        });
      } else if (!input.forceCarrierQuote && group.flatFreightFeeCents != null) {
        detail.source = "plan_b";
        detail.baseAmountCents = group.flatFreightFeeCents;
        rateGroups.push({
          key: group.key,
          label: `${group.label} · ${plan.palletCount} pallet${plan.palletCount === 1 ? "" : "s"}`,
          originZip: group.originZip,
          source: "plan_b",
          baseAmountCents: group.flatFreightFeeCents,
          palletCount: plan.palletCount,
        });
      } else {
        detail.source = "unavailable";
        unavailable.push(`${group.label}: ${detail.liveError}`);
      }
    } else if (shouldRequestCarrier) {
      detail.source = "unavailable";
      detail.liveError = "Select a configured carrier connection before requesting a shipping quote.";
      unavailable.push(`${group.label}: ${detail.liveError}`);
    }

    groups.push(detail);
  }

  let quote: FreightQuote | null = null;
  if (input.mode !== "pallet_preview" && unavailable.length === 0) {
    quote = combineStyleFreightGroups({
      groups: rateGroups,
      settings,
      accessorials: input.accessorials,
      merchandiseSubtotalCents: input.merchandiseSubtotalCents,
      billableWeightLbs: totalBillableWeightLbs,
      isKitchen,
      kitchenFreightFloorCents: settingsRow.kitchenFreightFloorCents,
    });
  }

  if (input.mode !== "pallet_preview" && unavailable.length > 0) {
    quote = {
      available: false,
      zoneName: null,
      billableWeightLbs: totalBillableWeightLbs,
      lines: [],
      freightBeforeMarkupCents: 0,
      markupCents: 0,
      damageFeeCents: 0,
      totalCents: 0,
      freeFreightApplied: false,
      reason: `Simulation unavailable for ${unavailable.join("; ")}.`,
    };
  }

  return {
    testOnly: true as const,
    simulatedAt: Date.now(),
    mode: input.mode,
    destinationZip,
    deliveryType: input.accessorials?.residential ? "residential" as const : "business" as const,
    liftgate: input.accessorials?.liftgate === true,
    quoteMode: settingsRow.quoteMode,
    provider: carrierSettings.liveProvider,
    providerEnvironment: liveProviderEnvironment(carrierSettings),
    carrierRetryAt: groups.reduce<number | null>((latest, group) => {
      if (group.carrierRetryAt == null) return latest;
      return latest == null || group.carrierRetryAt > latest ? group.carrierRetryAt : latest;
    }, null),
    freightClass,
    freightClassDefaultedForStaging,
    merchandiseSubtotalCents: input.merchandiseSubtotalCents,
    totalUnits: overallLoad.units,
    isKitchen,
    totalBillableWeightLbs,
    groups,
    quote,
    note: input.mode === "pallet_preview"
      ? "Pallet preview only. No carrier request, order, checkout, or payment was created."
      : "Administrator simulation only. No order, checkout, payment, or signed customer quote was created.",
  };
}

type SavedDesignPlacement = {
  cabinetId?: unknown;
  styleId?: unknown;
  distributorId?: unknown;
  qty?: unknown;
};

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Convert a saved Designer plan into the same verified catalog lines used by
 * customer freight. Appliances and stale/missing catalog selections are kept
 * out of the carrier request instead of being assigned an invented package.
 */
async function savedDesignFreightInput(designId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const designs = await db
    .select({
      id: kitchenDesigns.id,
      name: kitchenDesigns.name,
      placedCabinets: kitchenDesigns.placedCabinets,
      selectedStyleId: kitchenDesigns.selectedStyleId,
      selectedDistributorId: kitchenDesigns.selectedDistributorId,
      updatedAt: kitchenDesigns.updatedAt,
    })
    .from(kitchenDesigns)
    .where(eq(kitchenDesigns.id, designId))
    .limit(1);
  const design = designs[0];
  if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Saved design not found." });

  const defaultStyleId = positiveInteger(design.selectedStyleId);
  const defaultDistributorId = positiveInteger(design.selectedDistributorId);
  const placements = Array.isArray(design.placedCabinets)
    ? design.placedCabinets as SavedDesignPlacement[]
    : [];
  const requested = new Map<string, { cabinetId: number; styleId: number; distributorId: number; qty: number }>();
  let excludedPlacementUnits = 0;

  for (const placement of placements) {
    const cabinetId = positiveInteger(placement.cabinetId);
    const styleId = positiveInteger(placement.styleId) ?? defaultStyleId;
    const distributorId = positiveInteger(placement.distributorId) ?? defaultDistributorId;
    const qty = Math.max(1, Math.min(999, positiveInteger(placement.qty) ?? 1));
    if (!cabinetId || !styleId || !distributorId) {
      excludedPlacementUnits += qty;
      continue;
    }
    const key = `${cabinetId}:${styleId}:${distributorId}`;
    const existing = requested.get(key);
    requested.set(key, existing ? { ...existing, qty: existing.qty + qty } : { cabinetId, styleId, distributorId, qty });
  }

  if (requested.size === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This saved design has no cabinet selections with a door style and distributor. Select a priced cabinet line in the Designer first.",
    });
  }

  const requestedLines = Array.from(requested.values());
  const skuRows = await db
    .select({
      cabinetId: distributorSkus.cabinetId,
      styleId: distributorSkus.styleId,
      distributorId: distributorSkus.distributorId,
      yourCost: distributorSkus.yourCost,
      wholesalePrice: distributorSkus.wholesalePrice,
      adjustedListPrice: distributorSkus.adjustedListPrice,
      listPrice: distributorSkus.listPrice,
    })
    .from(distributorSkus)
    .where(and(
      inArray(distributorSkus.cabinetId, Array.from(new Set(requestedLines.map((line) => line.cabinetId)))),
      inArray(distributorSkus.styleId, Array.from(new Set(requestedLines.map((line) => line.styleId)))),
      inArray(distributorSkus.distributorId, Array.from(new Set(requestedLines.map((line) => line.distributorId)))),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.status, "approved"),
    ));
  const skuByIdentity = new Map(skuRows.map((row) => [`${row.cabinetId}:${row.styleId}:${row.distributorId}`, row]));
  const pricingSettings = await getPricingSettings();
  const items: FreightItemInput[] = [];
  let unmatchedCatalogUnits = 0;
  let unpricedCatalogUnits = 0;
  let merchandiseSubtotalCents = 0;

  for (const line of requestedLines) {
    const sku = skuByIdentity.get(`${line.cabinetId}:${line.styleId}:${line.distributorId}`);
    if (!sku) {
      unmatchedCatalogUnits += line.qty;
      continue;
    }
    items.push(line);
    const sellPrice = sellPriceForTier(sku, pricingSettings, "homeowner");
    if (sellPrice == null || sellPrice <= 0) {
      unpricedCatalogUnits += line.qty;
      continue;
    }
    merchandiseSubtotalCents += Math.round(sellPrice * 100) * line.qty;
  }

  if (items.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "None of this saved design’s cabinet selections are currently available in the selected vendor catalog.",
    });
  }

  return {
    items,
    merchandiseSubtotalCents,
    savedDesign: {
      id: design.id,
      name: design.name,
      updatedAt: design.updatedAt,
      placedCabinetUnits: placements.reduce((total, placement) => total + (positiveInteger(placement.qty) ?? 1), 0),
      quotedCabinetUnits: items.reduce((total, item) => total + item.qty, 0),
      excludedPlacementUnits,
      unmatchedCatalogUnits,
      unpricedCatalogUnits,
    },
  };
}

export const freightRouter = router({
  // ─── Public: estimate/quote freight for a cart ──────────────────────────────
  estimate: publicProcedure
    .input(
      z.object({
        destinationZip: z.string().min(3).max(16),
        items: itemsSchema,
        merchandiseSubtotalCents: z.number().int().min(0).default(0),
        accessorials: accessorialsSchema,
        // Optional: explicit supply line for this cart. When omitted we infer it
        // from the cart's cabinetIds so freight ships from the nearest warehouse.
        distributorId: z.number().int().positive().nullable().optional(),
      })
    )
    .query(async ({ input }): Promise<FreightQuote> => {
      const settingsRow = await loadSettingsRow();
      const settings = settingsRow ? rowToSettings(settingsRow) : DEFAULT_SETTINGS;

      const { packages } = await resolvePackages(
        input.items,
        settingsRow,
        settings.defaultCabinetWeightLbs
      );

      const liveProvider = settingsRow?.liveProvider ?? "estimator";
      const liveKey = settingsRow?.liveApiKey ?? "";
      const liveFreightClass = liveProvider === "worldwideexpress"
        ? normalizeSpeedshipFreightClass(settingsRow?.freightClass) ?? "175"
        : settingsRow?.freightClass ?? "175";

      // ── CARRIER QUOTE: one shipment per authoritative style origin ──────────
      if (liveProvider !== "estimator" && settingsRow) {
        const caps = rowToPalletCaps(settingsRow);
        const load = totalPackagedLoad(packages);
        const isKitchen = isKitchenOrder(load.units, settingsRow.kitchenMinCabinets);
        if (load.units === 0) {
          return {
            available: false,
            zoneName: null,
            billableWeightLbs: 0,
            lines: [],
            freightBeforeMarkupCents: 0,
            markupCents: 0,
            damageFeeCents: 0,
            totalCents: 0,
            freeFreightApplied: false,
            reason: "Add cabinets to get a live shipping quote.",
          };
        }

        const styleGroups = await resolveStyleFreightGroups({
          destinationZip: input.destinationZip,
          items: input.items,
          explicitDistributorId: input.distributorId,
          fallbackOriginZip: settings.originZip,
        });
        const rateGroups: FreightRateGroup[] = [];
        const failedGroups: string[] = [];
        let totalBillableWeightLbs = 0;

        for (const group of styleGroups) {
          const resolvedGroup = await resolvePackages(
            group.items,
            settingsRow,
            settings.defaultCabinetWeightLbs,
          );
          const plan = buildPallets(resolvedGroup.packages, caps);
          totalBillableWeightLbs += plan.totalWeightLbs;
          const liveReq: LiveRateRequest = {
            fromZip: group.originZip,
            toZip: input.destinationZip,
            pallets: plan.pallets.map((pallet) => ({
              lengthIn: pallet.lengthIn,
              widthIn: pallet.widthIn,
              heightIn: pallet.heightIn,
              weightLbs: pallet.weightLbs,
            })),
            freightClass: liveFreightClass,
            residential: input.accessorials?.residential,
            liftgate: input.accessorials?.liftgate,
            limitedAccess: input.accessorials?.limitedAccess,
          };
          const live = await requestLiveRate({
            provider: liveProvider,
            settings: settingsRow,
            liveApiKey: liveKey,
            request: liveReq,
            palletCount: plan.palletCount,
            totalWeightLbs: plan.totalWeightLbs,
          });
          const carrierLabel = [live.carrier, live.service].filter(Boolean).join(" ") || null;

          if (live.ok) {
            rateGroups.push({
              key: group.key,
              label: `${group.label}${carrierLabel ? ` · ${carrierLabel}` : ""} · ${plan.palletCount} pallet${plan.palletCount === 1 ? "" : "s"}`,
              originZip: group.originZip,
              source: "live",
              baseAmountCents: live.amountCents,
              carrier: carrierLabel,
              palletCount: plan.palletCount,
            });
          } else {
            failedGroups.push(`${group.label}: ${live.error ?? "carrier unavailable"}`);
          }
        }

        if (failedGroups.length > 0) {
          return {
            available: false,
            zoneName: null,
            billableWeightLbs: totalBillableWeightLbs,
            lines: [],
            freightBeforeMarkupCents: 0,
            markupCents: 0,
            damageFeeCents: 0,
            totalCents: 0,
            freeFreightApplied: false,
            reason: `Carrier shipping is unavailable for ${failedGroups.join("; ")}.`,
          };
        }

        return attachFreightQuoteToken(combineStyleFreightGroups({
          groups: rateGroups,
          settings,
          accessorials: input.accessorials,
          merchandiseSubtotalCents: input.merchandiseSubtotalCents,
          billableWeightLbs: totalBillableWeightLbs,
          isKitchen,
          kitchenFreightFloorCents: settingsRow.kitchenFreightFloorCents,
        }), input);
      }

      // Quote requests never substitute table estimates or Plan B fees for a
      // carrier response. An unconfigured carrier is visibly unavailable.
      return {
        available: false,
        zoneName: null,
        billableWeightLbs: 0,
        lines: [],
        freightBeforeMarkupCents: 0,
        markupCents: 0,
        damageFeeCents: 0,
        totalCents: 0,
        freeFreightApplied: false,
        reason: "Carrier shipping is unavailable because a carrier connection has not been configured.",
      };
    }),

  // ─── Admin: read current settings + zones ───────────────────────────────────
  adminGet: adminProcedure.query(async () => {
    const settingsRow = await loadSettingsRow();
    const db = await getDb();
    const zoneRows = db
      ? await db.select().from(freightZones).orderBy(asc(freightZones.sortOrder))
      : [];
    // Never leak the raw API key to the client; report only whether one is set.
    const safeSettings = settingsRow
      ? {
          ...settingsRow,
          liveApiKey: null, hasLiveApiKey: !!settingsRow.liveApiKey,
          fqClientSecret: null, hasFqClientSecret: !!settingsRow.fqClientSecret,
          gtzPassword: null, hasGtzPassword: !!settingsRow.gtzPassword,
          gtzApiKey: null, hasGtzApiKey: !!settingsRow.gtzApiKey,
          wwexClientSecret: null, hasWwexClientSecret: !!settingsRow.wwexClientSecret,
          wwexPassword: null, hasWwexPassword: !!settingsRow.wwexPassword,
        }
      : null;
    return { settings: safeSettings, zones: zoneRows };
  }),

  // ─── Admin: search real catalog/style combinations for test orders ───────────
  adminSearchSimulationItems: adminProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const query = `%${input.query.trim()}%`;
      const rows = await db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          pkgWeight: cabinets.pkgWeight,
          fallbackWeight: cabinets.weight,
          pkgLength: cabinets.pkgLength,
          pkgWidth: cabinets.pkgWidth,
          pkgHeight: cabinets.pkgHeight,
          styleId: doorStyles.id,
          styleName: doorStyles.ourName,
          styleAlias: doorStyles.aliasName,
          distributorId: doorStyles.distributorId,
          distributorName: doorStyles.distributorName,
          originZip: doorStyles.warehouseZip,
          planBFeeCents: doorStyles.flatFreightFeeCents,
          distributorSku: distributorSkus.distributorSku,
          platformSku: distributorSkus.platformSku,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(
          eq(cabinets.isActive, true),
          eq(doorStyles.isActive, true),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.status, "approved"),
          or(
            like(cabinets.masterCode, query),
            like(cabinets.description, query),
            like(distributorSkus.distributorSku, query),
            like(distributorSkus.platformSku, query),
            like(doorStyles.ourName, query),
            like(doorStyles.aliasName, query),
          ),
        ))
        .orderBy(asc(cabinets.masterCode), asc(doorStyles.ourName))
        .limit(30);

      return rows.map((row) => ({
        cabinetId: row.cabinetId,
        masterCode: row.masterCode,
        description: row.description,
        category: row.category,
        distributorSku: row.distributorSku,
        platformSku: row.platformSku,
        styleId: row.styleId,
        styleName: row.styleAlias || row.styleName,
        distributorId: row.distributorId,
        distributorName: row.distributorName,
        originZip: normalizeZip(row.originZip ?? "") || null,
        planBFeeCents: row.planBFeeCents,
        packageWeightLbs: row.pkgWeight != null
          ? Number(row.pkgWeight)
          : row.fallbackWeight != null
            ? Number(row.fallbackWeight)
            : null,
        packageDimensionsIn: row.pkgLength != null && row.pkgWidth != null && row.pkgHeight != null
          ? {
              length: Number(row.pkgLength),
              width: Number(row.pkgWidth),
              height: Number(row.pkgHeight),
            }
          : null,
      }));
    }),

  // ─── Admin: choose a saved design for a test-only freight simulation ─────────
  adminListSimulationDesigns: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: kitchenDesigns.id,
        name: kitchenDesigns.name,
        placedCabinets: kitchenDesigns.placedCabinets,
        selectedStyleId: kitchenDesigns.selectedStyleId,
        selectedDistributorId: kitchenDesigns.selectedDistributorId,
        updatedAt: kitchenDesigns.updatedAt,
      })
      .from(kitchenDesigns)
      .orderBy(desc(kitchenDesigns.updatedAt))
      .limit(100);
    return rows
      .map((row) => {
        const placements = Array.isArray(row.placedCabinets) ? row.placedCabinets as SavedDesignPlacement[] : [];
        const cabinetUnits = placements.reduce((total, placement) => total + (positiveInteger(placement.cabinetId) ? positiveInteger(placement.qty) ?? 1 : 0), 0);
        return {
          id: row.id,
          name: row.name,
          updatedAt: row.updatedAt,
          cabinetUnits,
          readyForFreight: cabinetUnits > 0 && positiveInteger(row.selectedStyleId) != null && positiveInteger(row.selectedDistributorId) != null,
        };
      })
      .filter((row) => row.cabinetUnits > 0);
  }),

  // ─── Admin: simulate a complete order without creating checkout state ────────
  adminSimulateFreight: adminProcedure
    .input(z.object({
      destinationZip: z.string().min(3).max(16),
      items: itemsSchema.refine((items) => items.length > 0, "Add at least one sample item."),
      merchandiseSubtotalCents: z.number().int().min(0).max(100000000),
      accessorials: accessorialsSchema,
      mode: z.enum(["pallet_preview", "saved_configuration", "plan_b"]),
    }))
    .mutation(({ input }) => simulateFreight(input)),

  // ─── Admin: simulate one saved design without creating order state ──────────
  adminSimulateSavedDesignFreight: adminProcedure
    .input(z.object({
      designId: z.number().int().positive(),
      destinationZip: z.string().min(3).max(16),
      accessorials: accessorialsSchema,
      mode: z.enum(["pallet_preview", "saved_configuration", "plan_b"]),
    }))
    .mutation(async ({ input }) => {
      const plan = await savedDesignFreightInput(input.designId);
      const simulation = await simulateFreight({
        destinationZip: input.destinationZip,
        items: plan.items,
        merchandiseSubtotalCents: plan.merchandiseSubtotalCents,
        accessorials: input.accessorials,
        mode: input.mode,
        allowMissingStyleOriginFallback: true,
        forceCarrierQuote: true,
        useWwexStagingConnection: true,
      });
      return { ...simulation, savedDesign: plan.savedDesign };
    }),

  // ─── Admin: update settings (upserts the single row) ────────────────────────
  adminUpdateSettings: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        originZip: z.string().max(16),
        rateModel: z.enum(["per_cwt", "flat"]),
        handlingFeeCents: z.number().int().min(0).max(100000),
        minChargeCents: z.number().int().min(0).max(1000000),
        liftgateFeeCents: z.number().int().min(0).max(100000),
        residentialFeeCents: z.number().int().min(0).max(100000),
        insideDeliveryFeeCents: z.number().int().min(0).max(100000),
        markupBps: z.number().int().min(0).max(20000),
        damageFeeBps: z.number().int().min(0).max(10000),
        freeFreightThresholdCents: z.number().int().min(0).max(100000000),
        defaultCabinetWeightLbs: z.number().min(1).max(1000),
        // Live-quote / pallet / floor controls.
        quoteMode: z.enum(["estimator", "live"]),
        liveProvider: z.enum(["estimator", "easypost", "shippo", "freightquote", "globaltranz", "worldwideexpress"]),
        // Freightquote (C.H. Robinson) credentials
        fqClientId: z.string().max(255).nullable().optional(),
        fqClientSecret: z.string().max(255).nullable().optional(),
        fqAccountNumber: z.string().max(64).nullable().optional(),
        fqEnvironment: z.enum(["sandbox", "production"]).optional(),
        // GlobalTranz credentials
        gtzApiKey: z.string().max(255).nullable().optional(),
        gtzUsername: z.string().max(128).nullable().optional(),
        gtzPassword: z.string().max(255).nullable().optional(),
        gtzAccountNumber: z.string().max(64).nullable().optional(),
        gtzEnvironment: z.enum(["sandbox", "production"]).optional(),
        // WWEX Client ID and Client Secret use saveWwexCredentials exclusively.
        // Keeping them out of this broad form mutation prevents a stale form
        // snapshot from overwriting a newer paired credential save.
        wwexAccountNumber: z.string().max(64).nullable().optional(),
        wwexUsername: z.string().max(128).nullable().optional(),
        wwexPassword: z.string().max(255).nullable().optional(),
        wwexEnvironment: z.enum(["sandbox", "production"]).optional(),
        wwexSandboxTokenUrl: z.string().max(512).nullable().optional(),
        wwexSandboxRateUrl: z.string().max(512).nullable().optional(),
        wwexProductionTokenUrl: z.string().max(512).nullable().optional(),
        wwexProductionRateUrl: z.string().max(512).nullable().optional(),
        // Optional: only set the key when provided (keeps existing if omitted).
        liveApiKey: z.string().max(255).nullable().optional(),
        kitchenFreightFloorCents: z.number().int().min(0).max(100000000),
        kitchenMinCabinets: z.number().int().min(1).max(100),
        standardPalletLengthIn: z.number().min(12).max(96),
        palletLengthIn: z.number().min(12).max(240),
        palletWidthIn: z.number().min(12).max(120),
        palletHeightIn: z.number().min(12).max(120),
        palletMaxWeightLbs: z.number().min(50).max(10000),
        palletMaxCubicFt: z.number().min(5).max(2000),
        palletTareLbs: z.number().min(0).max(500),
        freightClass: z.string().min(1).max(8),
        defaultCabinetCubicFt: z.number().min(0.5).max(200),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const existing = await loadSettingsRow();

      const { liveApiKey, ...rest } = input;
      const values: Record<string, unknown> = {
        ...rest,
        defaultCabinetWeightLbs: String(input.defaultCabinetWeightLbs),
        standardPalletLengthIn: String(input.standardPalletLengthIn),
        palletLengthIn: String(input.palletLengthIn),
        palletWidthIn: String(input.palletWidthIn),
        palletHeightIn: String(input.palletHeightIn),
        palletMaxWeightLbs: String(input.palletMaxWeightLbs),
        palletMaxCubicFt: String(input.palletMaxCubicFt),
        palletTareLbs: String(input.palletTareLbs),
        defaultCabinetCubicFt: String(input.defaultCabinetCubicFt),
        updatedAt: new Date(),
      };
      // Only overwrite the key when a non-empty value is explicitly provided.
      if (typeof liveApiKey === "string" && liveApiKey.length > 0) {
        values.liveApiKey = liveApiKey;
      }
      // Broker credentials: only overwrite when a non-empty value is provided.
      const credFields = [
        "fqClientId", "fqClientSecret", "fqAccountNumber",
        "gtzApiKey", "gtzUsername", "gtzPassword", "gtzAccountNumber",
        "wwexAccountNumber", "wwexUsername", "wwexPassword",
      ] as const;
      for (const field of credFields) {
        const v = (input as Record<string, unknown>)[field];
        if (typeof v === "string" && v.length > 0) values[field] = v;
        else if (v === null) values[field] = null;
      }
      if (input.fqEnvironment) values.fqEnvironment = input.fqEnvironment;
      if (input.gtzEnvironment) values.gtzEnvironment = input.gtzEnvironment;
      if (input.wwexEnvironment) values.wwexEnvironment = input.wwexEnvironment;

      if (existing) {
        await db.update(shippingSettings).set(values).where(eq(shippingSettings.id, existing.id));
      } else {
        await db.insert(shippingSettings).values(values as typeof shippingSettings.$inferInsert);
      }
      return { ok: true };
    }),

  // ─── Admin: save WWEX OAuth credentials without requiring the full settings form ──
  saveWwexCredentials: adminProcedure
    .input(z.object({
      wwexClientId: z.string().trim().min(1).max(255),
      wwexClientSecret: z.string().trim().min(1).max(255),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const existing = await loadSettingsRow();
      const values = {
        wwexClientId: input.wwexClientId,
        wwexClientSecret: input.wwexClientSecret,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(shippingSettings).set(values).where(eq(shippingSettings.id, existing.id));
      } else {
        await db.insert(shippingSettings).values(values);
      }

      // Deliberately return no credential value. The client only needs a safe
      // confirmation that both fields were persisted together.
      return { ok: true, wwexClientId: input.wwexClientId, hasWwexClientSecret: true };
    }),

  // ─── Admin: test a live quote with the stored key + an example shipment ──────
  testLiveQuote: adminProcedure
    .input(
      z.object({
        destinationZip: z.string().min(3).max(16),
        // Example pallet load to test with (defaults to one full 8 ft pallet).
        testWeightLbs: z.number().min(50).max(10000).default(900),
        testCubicFt: z.number().min(5).max(2000).default(80),
        residential: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const row = await loadSettingsRow();
      if (!row) {
        return { ok: false, error: "Shipping settings have not been saved yet." };
      }
      if (!row.originZip) {
        return { ok: false, error: "Set an origin ZIP before testing a live quote." };
      }

      const caps = rowToPalletCaps(row);
      const plan = buildPallets(
        [{ weightLbs: input.testWeightLbs, cubicFt: input.testCubicFt, qty: 1 }],
        caps
      );

      if (row.liveProvider === "estimator") {
        return { ok: false, error: "Select a live freight provider before testing." };
      }
      const live = await requestLiveRate({
        provider: row.liveProvider,
        settings: row,
        liveApiKey: row.liveApiKey ?? "",
        palletCount: plan.palletCount,
        totalWeightLbs: plan.totalWeightLbs,
        request: {
        fromZip: row.originZip,
        toZip: input.destinationZip,
        pallets: plan.pallets.map((p) => ({
          lengthIn: p.lengthIn,
          widthIn: p.widthIn,
          heightIn: p.heightIn,
          weightLbs: p.weightLbs,
        })),
        freightClass: row.freightClass,
        residential: input.residential,
        },
      });

      if (!live.ok) return { ok: false, error: live.error ?? "Live quote failed." };

      const carrierLabel = [live.carrier, live.service].filter(Boolean).join(" ") || null;
      return {
        ok: true,
        amountCents: live.amountCents,
        carrier: carrierLabel,
        palletCount: plan.palletCount,
        billableWeightLbs: plan.totalWeightLbs,
      };
    }),

  // ─── Admin: replace the full estimator zone table (legacy) ──────────────────
  adminSaveZones: adminProcedure
    .input(
      z.object({
        zones: z
          .array(
            z.object({
              zoneName: z.string().min(1).max(64),
              zipPrefixes: z.string().min(1).max(255),
              rateCents: z.number().int().min(0).max(10000000),
            })
          )
          .max(100),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.delete(freightZones);
      if (input.zones.length > 0) {
        await db.insert(freightZones).values(
          input.zones.map((zone, i) => ({
            zoneName: zone.zoneName,
            zipPrefixes: zone.zipPrefixes,
            rateCents: zone.rateCents,
            sortOrder: i,
          }))
        );
      }
      return { ok: true, count: input.zones.length };
    }),

  // ─── Admin: get recent freight API call logs ─────────────────────────────────
  adminGetApiLogs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(({ input }) => getFreightApiLogs(input.limit)),

});
