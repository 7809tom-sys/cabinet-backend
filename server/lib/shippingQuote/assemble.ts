/**
 * Loads one customer quote from the vendor's own rows and the site estimator.
 * Secrets are used only to call a vendor HTTPS endpoint and are not returned.
 */

import { and, eq, inArray } from "drizzle-orm";
import { buildPallets, packagedCubicFt, type PalletCaps } from "../../../shared/liveFreight";
import { comparisonProfileForPelicanProduct, PELICAN_COMPARISON_ORIGIN } from "../../../shared/pelicanComparablePackaging";
import {
  DEFAULT_SITE_FREIGHT_CLASS,
  buildVendorShippingQuoteContract,
  createShippingQuoteCache,
  liveConnectionEligible,
  pelicanProviderQuote,
  requestVendorHttpQuote,
  resolveShippingQuotePriority,
  type PackageEvidence,
  type QuoteCache,
  type ShippingQuoteLine,
  type ShippingQuoteLogEntry,
  type ShippingQuoteProviderKind,
  type VendorLiveConnection,
  type VendorShippingQuote,
} from "../../../shared/shippingQuote";
import { type FreightSettings, type FreightZoneRate } from "../../../shared/freight";
import { normalizeDistributorZipRates, type DistributorShippingRule, type DistributorShippingRuleMode } from "../../../shared/distributorShipping";
import { approvedVendorLinkedDistributorIds } from "../approvedVendorAccess";
import { ENV } from "../../_core/env";
import { makeRequest, type GeocodingResult } from "../../_core/map";
import type { LiveQuoteAddress } from "../../_core/easypost";
import { decryptDistributorSecret } from "../distributorIntegrationCrypto";
import {
  distributorIntegrations,
  distributors,
  distributorSkus,
  cabinets,
  doorStyles,
  freightQuoteHistory,
  freightZones,
  hardwareShippingProfiles,
  shippingSettings,
  vendorLines,
  vendorProducts,
} from "../../../drizzle/schema";
import { pelicanProducts, pelicanShippingProfiles } from "../../../drizzle/pelicanSchema";
import { dispatchExistingCarrierQuote, type ExistingCarrierCredentials } from "./carriers";

type Database = NonNullable<Awaited<ReturnType<typeof import("../../db").getDb>>>;

export type ShippingQuoteRequestItem = {
  kind: "pelican" | "cabinet" | "vendor_product";
  qty: number;
  pelicanProductId?: number;
  vendorProductId?: number;
  cabinetId?: number;
  masterCode?: string;
  styleId?: number;
  distributorId?: number;
  merchandiseCents?: number;
};

type LoadedLine = {
  index: number;
  kind: ShippingQuoteRequestItem["kind"];
  vendorScope: string;
  vendorName: string;
  distributorId: number | null;
  line: ShippingQuoteLine;
  merchandiseCents: number;
};

const quoteCache: QuoteCache = createShippingQuoteCache();

export function sharedShippingQuoteCache(): QuoteCache {
  return quoteCache;
}

function num(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function zip5(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : null;
}

async function resolveZipAddress(zip: string): Promise<LiveQuoteAddress | null> {
  const normalized = zip.replace(/\D/g, "").slice(0, 5);
  if (normalized.length !== 5) return null;
  try {
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      address: `${normalized}, USA`,
      components: "country:US",
    });
    const components = result.results?.[0]?.address_components ?? [];
    const pick = (type: string, preferShort = false) => {
      const component = components.find((candidate) => candidate.types.includes(type));
      if (!component) return null;
      return preferShort ? component.short_name : component.long_name;
    };
    const locality = pick("locality") ?? pick("postal_town") ?? pick("administrative_area_level_2");
    const region = pick("administrative_area_level_1", true);
    return locality && region ? { locality, region, countryCode: "US" } : null;
  } catch {
    return null;
  }
}

function postedRule(row: {
  shippingRuleMode: DistributorShippingRuleMode;
  shippingFlatFreightFeeCents: number | null;
  shippingFreeFreightThresholdCents: number | null;
  shippingZipRates: unknown;
  shippingExceptions: string | null;
}): DistributorShippingRule {
  return {
    mode: row.shippingRuleMode,
    flatFeeCents: row.shippingFlatFreightFeeCents,
    freeThresholdCents: row.shippingFreeFreightThresholdCents,
    zipRates: normalizeDistributorZipRates(row.shippingZipRates),
    exceptions: row.shippingExceptions,
  };
}

export async function loadShippingQuoteLines(db: Database, items: ShippingQuoteRequestItem[]): Promise<LoadedLine[]> {
  const loaded: LoadedLine[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind === "pelican") {
      if (!item.pelicanProductId) throw new Error("A Pelican quote needs a product id.");
      const [row] = await db.select({
        id: pelicanProducts.id,
        pelicanCode: pelicanProducts.pelicanCode,
        name: pelicanProducts.name,
        category: pelicanProducts.category,
        subCategory: pelicanProducts.subCategory,
        originZip: pelicanShippingProfiles.originZip,
        transportMode: pelicanShippingProfiles.transportMode,
        lengthIn: pelicanShippingProfiles.packageLengthIn,
        widthIn: pelicanShippingProfiles.packageWidthIn,
        heightIn: pelicanShippingProfiles.packageHeightIn,
        weightLbs: pelicanShippingProfiles.packageWeightLbs,
        freightClass: pelicanShippingProfiles.freightClass,
        evidenceType: pelicanShippingProfiles.evidenceType,
        isEnabled: pelicanShippingProfiles.isEnabled,
      }).from(pelicanProducts)
        .leftJoin(pelicanShippingProfiles, eq(pelicanShippingProfiles.pelicanProductId, pelicanProducts.id))
        .where(eq(pelicanProducts.id, item.pelicanProductId))
        .limit(1);
      if (!row) throw new Error("That Pelican product was not found.");
      const verified = row.isEnabled === true && row.evidenceType === "supplier_verified";
      const comparable = !verified ? comparisonProfileForPelicanProduct({
        id: row.id,
        category: row.category,
        subCategory: row.subCategory,
        name: row.name,
        pelicanCode: row.pelicanCode,
      }) : null;
      const evidence: PackageEvidence = verified ? "supplier_verified" : comparable ? "comparable_estimate" : "missing";
      loaded.push({
        index,
        kind: "pelican",
        vendorScope: "pelican",
        vendorName: "Pelican",
        distributorId: null,
        merchandiseCents: item.merchandiseCents ?? 0,
        line: {
          sku: row.pelicanCode,
          qty: item.qty,
          weightLbs: verified ? num(row.weightLbs) : comparable ? num(comparable.packageWeightLbs) : null,
          lengthIn: verified ? num(row.lengthIn) : comparable ? num(comparable.packageLengthIn) : null,
          widthIn: verified ? num(row.widthIn) : comparable ? num(comparable.packageWidthIn) : null,
          heightIn: verified ? num(row.heightIn) : comparable ? num(comparable.packageHeightIn) : null,
          freightClass: verified ? row.freightClass : comparable?.freightClass ?? null,
          evidence,
          shipFromZip: verified ? zip5(row.originZip) : zip5(PELICAN_COMPARISON_ORIGIN.zip),
          transportMode: verified ? row.transportMode : comparable?.transportMode ?? null,
          comparisonRuleId: comparable?.comparisonRuleId ?? null,
        },
      });
      continue;
    }

    if (item.kind === "vendor_product") {
      if (!item.vendorProductId) throw new Error("A vendor product quote needs a product id.");
      const [row] = await db.select({
        id: vendorProducts.id,
        distributorId: vendorProducts.distributorId,
        vendorSku: vendorProducts.vendorSku,
        pkgLength: vendorProducts.pkgLength,
        pkgWidth: vendorProducts.pkgWidth,
        pkgHeight: vendorProducts.pkgHeight,
        pkgWeight: vendorProducts.pkgWeight,
        name: distributors.name,
      }).from(vendorProducts)
        .innerJoin(distributors, eq(distributors.id, vendorProducts.distributorId))
        .where(eq(vendorProducts.id, item.vendorProductId))
        .limit(1);
      if (!row) throw new Error("That vendor product was not found.");
      loaded.push({
        index,
        kind: "vendor_product",
        vendorScope: `dist:${row.distributorId}`,
        vendorName: row.name,
        distributorId: row.distributorId,
        merchandiseCents: item.merchandiseCents ?? 0,
        line: {
          sku: row.vendorSku,
          qty: item.qty,
          weightLbs: num(row.pkgWeight),
          lengthIn: num(row.pkgLength),
          widthIn: num(row.pkgWidth),
          heightIn: num(row.pkgHeight),
          freightClass: null,
          evidence: "missing",
          shipFromZip: null,
          transportMode: null,
          comparisonRuleId: null,
        },
      });
      continue;
    }

    if (!item.distributorId || (!item.cabinetId && !item.masterCode)) {
      throw new Error("A cabinet quote needs its supplier and cabinet.");
    }
    const filters = [eq(distributorSkus.distributorId, item.distributorId)];
    if (item.cabinetId) filters.push(eq(distributorSkus.cabinetId, item.cabinetId));
    if (item.styleId) filters.push(eq(distributorSkus.styleId, item.styleId));
    if (item.masterCode) filters.push(eq(cabinets.masterCode, item.masterCode));
    const query = db.select({
      distributorId: distributorSkus.distributorId,
      sku: distributorSkus.distributorSku,
      platformSku: distributorSkus.platformSku,
      pkgLength: distributorSkus.pkgLength,
      pkgWidth: distributorSkus.pkgWidth,
      pkgHeight: distributorSkus.pkgHeight,
      pkgWeight: distributorSkus.pkgWeight,
      masterCode: cabinets.masterCode,
      warehouseZip: doorStyles.warehouseZip,
      name: distributors.name,
    }).from(distributorSkus)
      .leftJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .leftJoin(doorStyles, eq(doorStyles.id, distributorSkus.styleId))
      .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
      .where(and(...filters))
      .limit(1);
    const [row] = await query;
    if (!row) throw new Error("That cabinet was not found for the selected supplier.");
    loaded.push({
      index,
      kind: "cabinet",
      vendorScope: `dist:${row.distributorId}`,
      vendorName: row.name,
      distributorId: row.distributorId,
      merchandiseCents: item.merchandiseCents ?? 0,
      line: {
        sku: row.platformSku || row.sku || row.masterCode || "CABINET",
        qty: item.qty,
        weightLbs: num(row.pkgWeight),
        lengthIn: num(row.pkgLength),
        widthIn: num(row.pkgWidth),
        heightIn: num(row.pkgHeight),
        freightClass: null,
        evidence: "missing",
        shipFromZip: zip5(row.warehouseZip),
        transportMode: null,
        comparisonRuleId: null,
      },
    });
  }
  return loaded;
}

type VendorLineRow = typeof vendorLines.$inferSelect;

function connectionFromLine(line: VendorLineRow | null, integration: { baseUrl: string | null; authHeaderName: string | null; apiKeyEncrypted: string | null; isEnabled: boolean; adminEnabled: boolean } | null): {
  live: VendorLiveConnection;
  serviceCodes: string[];
  freightClass: string | null;
  shipFromZip: string | null;
  http: { url: string; header: string; secret: string } | null;
} {
  const serviceCodes = Array.isArray(line?.shippingServiceCodes) ? line.shippingServiceCodes.filter((code): code is string => typeof code === "string") : [];
  const freightClass = line?.shippingFreightClass?.trim() || null;
  const shipFromZip = zip5(line?.shipFromZip);
  const kind = (line?.shippingQuoteProvider ?? "none") as ShippingQuoteProviderKind;
  const lineSecret = decryptDistributorSecret(line?.shippingQuoteSecretEncrypted ?? null);
  const lineHttpReady = kind === "http" && Boolean(line?.shippingQuoteUrl && line?.shippingQuoteAuthHeaderName && lineSecret);
  if (line && kind !== "none" && line.shippingQuoteAdminEnabled && line.shippingQuoteVendorEnabled && (kind !== "http" || lineHttpReady)) {
    return {
      live: { kind, adminEnabled: true, vendorEnabled: true, configured: true },
      serviceCodes,
      freightClass,
      shipFromZip,
      http: lineHttpReady ? { url: line.shippingQuoteUrl!, header: line.shippingQuoteAuthHeaderName!, secret: lineSecret! } : null,
    };
  }
  const integrationSecret = decryptDistributorSecret(integration?.apiKeyEncrypted ?? null);
  const integrationReady = Boolean(integration?.isEnabled && integration.adminEnabled && integration.baseUrl && integration.authHeaderName && integrationSecret);
  if (integrationReady) {
    return {
      live: { kind: "http", adminEnabled: true, vendorEnabled: true, configured: true },
      serviceCodes,
      freightClass,
      shipFromZip,
      http: { url: integration!.baseUrl!, header: integration!.authHeaderName!, secret: integrationSecret! },
    };
  }
  return {
    live: { kind: "none", adminEnabled: false, vendorEnabled: false, configured: false },
    serviceCodes,
    freightClass,
    shipFromZip,
    http: null,
  };
}

export async function quoteLoadedLines(input: {
  db: Database;
  destinationZip: string;
  loaded: LoadedLine[];
  nowMs?: number;
  cache?: QuoteCache;
  log?: (entry: ShippingQuoteLogEntry) => void;
}): Promise<Array<VendorShippingQuote & { vendorName: string; itemIndexes: number[] }>> {
  const groups = new Map<string, LoadedLine[]>();
  for (const row of input.loaded) {
    const current = groups.get(row.vendorScope) ?? [];
    current.push(row);
    groups.set(row.vendorScope, current);
  }
  const [settingsRow] = await input.db.select().from(shippingSettings).limit(1);
  const zoneRows = await input.db.select({
    zoneName: freightZones.zoneName,
    zipPrefixes: freightZones.zipPrefixes,
    rateCents: freightZones.rateCents,
  }).from(freightZones);
  const siteSettings: FreightSettings = {
    enabled: settingsRow?.enabled ?? true,
    originZip: settingsRow?.originZip ?? "",
    rateModel: settingsRow?.rateModel ?? "per_cwt",
    handlingFeeCents: settingsRow?.handlingFeeCents ?? 0,
    minChargeCents: settingsRow?.minChargeCents ?? 0,
    liftgateFeeCents: settingsRow?.liftgateFeeCents ?? 0,
    residentialFeeCents: settingsRow?.residentialFeeCents ?? 0,
    insideDeliveryFeeCents: settingsRow?.insideDeliveryFeeCents ?? 0,
    markupBps: settingsRow?.markupBps ?? 0,
    damageFeeBps: settingsRow?.damageFeeBps ?? 0,
    freeFreightThresholdCents: settingsRow?.freeFreightThresholdCents ?? 0,
    defaultCabinetWeightLbs: num(settingsRow?.defaultCabinetWeightLbs) ?? 45,
  };
  const zones: FreightZoneRate[] = zoneRows;
  const credentials = carrierCredentials(settingsRow);
  const caps: PalletCaps = {
    palletLengthIn: num(settingsRow?.palletLengthIn) ?? 96,
    palletWidthIn: num(settingsRow?.palletWidthIn) ?? 40,
    palletHeightIn: num(settingsRow?.palletHeightIn) ?? 60,
    palletMaxWeightLbs: num(settingsRow?.palletMaxWeightLbs) ?? 1200,
    palletMaxCubicFt: num(settingsRow?.palletMaxCubicFt) ?? 100,
    palletTareLbs: num(settingsRow?.palletTareLbs) ?? 50,
  };
  const supplierLines = await input.db.select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive }).from(distributors);
  const approved = await input.db.select().from(vendorLines);
  const results = [];
  for (const [scope, rows] of Array.from(groups.entries())) {
    const distributorId = rows[0]?.distributorId ?? null;
    const vendor = scope === "pelican"
      ? approved.find((line) => line.sourceKey?.trim().toLowerCase() === "pelican" && line.isApproved)
      : approved.find((line) => distributorId != null && approvedVendorLinkedDistributorIds(line, supplierLines).includes(distributorId));
    const integration = distributorId == null ? null : (await input.db.select({
      baseUrl: distributorIntegrations.baseUrl,
      authHeaderName: distributorIntegrations.authHeaderName,
      apiKeyEncrypted: distributorIntegrations.apiKeyEncrypted,
      isEnabled: distributorIntegrations.isEnabled,
      adminEnabled: distributorIntegrations.adminEnabled,
    }).from(distributorIntegrations).where(and(
      eq(distributorIntegrations.distributorId, distributorId),
      eq(distributorIntegrations.integrationType, "shipping"),
      eq(distributorIntegrations.provider, "generic-shipping"),
    )).limit(1))[0] ?? null;
    const connection = connectionFromLine(vendor ?? null, integration);
    let distributorRule: DistributorShippingRule | null = null;
    let hardwareCents: number | null = null;
    let warehouseZip: string | null = null;
    if (distributorId != null) {
      const [distributor] = await input.db.select({
        shippingRuleMode: distributors.shippingRuleMode,
        shippingFlatFreightFeeCents: distributors.shippingFlatFreightFeeCents,
        shippingFreeFreightThresholdCents: distributors.shippingFreeFreightThresholdCents,
        shippingZipRates: distributors.shippingZipRates,
        shippingExceptions: distributors.shippingExceptions,
        warehouseZips: distributors.warehouseZips,
      }).from(distributors).where(eq(distributors.id, distributorId)).limit(1);
      if (distributor) {
        distributorRule = postedRule(distributor);
        warehouseZip = zip5(distributor.warehouseZips?.[0]);
      }
      const hardwareOnly = rows.every((row) => row.kind === "vendor_product");
      if (hardwareOnly) {
        const [hardware] = await input.db.select({
          enabled: hardwareShippingProfiles.enabled,
          cents: hardwareShippingProfiles.standaloneShippingCents,
          originZip: hardwareShippingProfiles.originZip,
        }).from(hardwareShippingProfiles).where(eq(hardwareShippingProfiles.distributorId, distributorId)).limit(1);
        if (hardware?.enabled && hardware.cents != null) hardwareCents = hardware.cents;
        warehouseZip = zip5(hardware?.originZip) ?? warehouseZip;
      }
    }
    const lines = rows.map((row) => ({
      ...row.line,
      shipFromZip: row.line.shipFromZip ?? connection.shipFromZip ?? warehouseZip,
      freightClass: row.line.freightClass ?? connection.freightClass,
    }));
    const shipFromZip = connection.shipFromZip ?? lines.find((line) => line.shipFromZip)?.shipFromZip ?? warehouseZip;
    const quoteCarrier = async (call: { destinationZip: string; shipFromZip: string | null; freightClass: string | null; items: ShippingQuoteLine[] }) => {
      const fromZip = call.shipFromZip ?? shipFromZip ?? "";
      const [fromAddress, toAddress] = await Promise.all([
        fromZip ? resolveZipAddress(fromZip) : Promise.resolve(null),
        resolveZipAddress(call.destinationZip),
      ]);
      const plan = buildPallets(call.items.map((item) => ({
        weightLbs: item.weightLbs ?? 0,
        cubicFt: packagedCubicFt(item.lengthIn, item.widthIn, item.heightIn, 0),
        qty: item.qty,
        maxPackageLengthIn: item.lengthIn,
      })), caps);
      return dispatchExistingCarrierQuote({
        ...credentials,
        fromZip,
        toZip: call.destinationZip,
        freightClass: call.freightClass || DEFAULT_SITE_FREIGHT_CLASS,
        parcels: call.items.map((item) => ({
          lengthIn: item.lengthIn ?? 0,
          widthIn: item.widthIn ?? 0,
          heightIn: item.heightIn ?? 0,
          weightLbs: item.weightLbs ?? 0,
          label: item.sku,
        })),
        pallets: plan.pallets.map((pallet) => ({
          lengthIn: pallet.lengthIn,
          widthIn: pallet.widthIn,
          heightIn: pallet.heightIn,
          weightLbs: pallet.weightLbs,
        })),
        fromAddress,
        toAddress,
      });
    };
    const started = Date.now();
    const quote = await resolveShippingQuotePriority({
      vendorScope: scope,
      destinationZip: input.destinationZip,
      items: lines,
      live: connection.live,
      serviceCodes: connection.serviceCodes,
      freightClass: connection.freightClass,
      shipFromZip,
      postedRule: distributorRule,
      hardwareStandaloneCents: hardwareCents,
      merchandiseSubtotalCents: rows.reduce((sum, row) => sum + row.merchandiseCents, 0),
      site: { settings: siteSettings, zones },
      nowMs: input.nowMs ?? Date.now(),
      cache: input.cache ?? quoteCache,
      log: (entry) => {
        input.log?.(entry);
        void persistQuoteLog(input.db, entry, shipFromZip, Date.now() - started);
      },
      quoteLive: async (call, signal) => {
        if (connection.live.kind === "pelican") {
          return pelicanProviderQuote({
            enabled: ENV.pelicanShippingQuotesEnabled,
            apiKey: ENV.pelicanShippingQuoteApiKey,
            apiUrl: ENV.pelicanShippingQuoteApiUrl,
          });
        }
        if (connection.live.kind === "carrier_ltl") return quoteCarrier(call);
        if (connection.http && liveConnectionEligible(connection.live)) {
          return requestVendorHttpQuote({
            url: connection.http.url,
            authHeaderName: connection.http.header,
            secret: connection.http.secret,
            contract: buildVendorShippingQuoteContract({
              vendorScope: call.vendorScope,
              destinationZip: call.destinationZip,
              shipFromZip: call.shipFromZip,
              freightClass: call.freightClass,
              serviceCodes: call.serviceCodes,
              items: call.items,
            }),
            signal,
          });
        }
        return { ok: false, code: "not_configured", error: "Live quote source is not configured." };
      },
      quoteCarrier,
    });
    results.push({ ...quote, vendorName: rows[0]?.vendorName ?? "Supplier", itemIndexes: rows.map((row) => row.index) });
  }
  return results;
}

function carrierCredentials(row: typeof shippingSettings.$inferSelect | undefined): ExistingCarrierCredentials {
  const environment = (value: string | null | undefined): "sandbox" | "production" => value === "sandbox" ? "sandbox" : "production";
  const ups = row?.upsClientId && row.upsClientSecret && row.upsAccountNumber
    ? { clientId: row.upsClientId, clientSecret: row.upsClientSecret, accountNumber: row.upsAccountNumber, environment: environment(row.upsEnvironment) }
    : null;
  const fedex = row?.fedexClientId && row.fedexClientSecret && row.fedexAccountNumber
    ? { clientId: row.fedexClientId, clientSecret: row.fedexClientSecret, accountNumber: row.fedexAccountNumber, environment: environment(row.fedexEnvironment) }
    : null;
  const freightquote = row?.fqClientId && row.fqClientSecret && row.fqAccountNumber
    ? { clientId: row.fqClientId, clientSecret: row.fqClientSecret, accountNumber: row.fqAccountNumber, environment: environment(row.fqEnvironment) }
    : null;
  const globaltranz = row?.gtzApiKey && row.gtzUsername && row.gtzPassword && row.gtzAccountNumber
    ? { apiKey: row.gtzApiKey, username: row.gtzUsername, password: row.gtzPassword, accountNumber: row.gtzAccountNumber, environment: environment(row.gtzEnvironment) }
    : null;
  const worldwideexpress = row?.wwexClientId && row.wwexClientSecret
    ? {
      clientId: row.wwexClientId,
      clientSecret: row.wwexClientSecret,
      accountNumber: row.wwexAccountNumber ?? "",
      username: row.wwexUsername ?? undefined,
      password: row.wwexPassword ?? undefined,
      environment: environment(row.wwexEnvironment),
      tokenUrl: row.wwexEnvironment === "sandbox" ? row.wwexSandboxTokenUrl : row.wwexProductionTokenUrl,
      rateUrl: row.wwexEnvironment === "sandbox" ? row.wwexSandboxRateUrl : row.wwexProductionRateUrl,
    }
    : null;
  return {
    liveProvider: row?.liveProvider ?? "estimator",
    ups,
    fedex,
    easypostApiKey: row?.liveApiKey ?? null,
    freightquote,
    globaltranz,
    worldwideexpress,
  };
}

async function persistQuoteLog(db: Database, entry: ShippingQuoteLogEntry, fromZip: string | null, durationMs: number) {
  try {
    await db.insert(freightQuoteHistory).values({
      broker: "vendor-shipping-quote",
      fromZip: fromZip || "00000",
      toZip: entry.destinationZip.slice(0, 12),
      palletCount: 0,
      totalWeightLbs: "0",
      freightClass: null,
      ok: entry.outcome === "quoted" || entry.outcome === "cache",
      amountCents: 0,
      carrier: entry.source,
      service: entry.outcome,
      error: entry.outcome === "quoted" || entry.outcome === "cache" ? null : entry.detail.slice(0, 1000),
      durationMs,
      packagesJson: JSON.stringify({ vendorScope: entry.vendorScope, source: entry.source, outcome: entry.outcome }),
    });
  } catch {
    // A quote log must not block the customer result.
  }
}

export function publicShippingQuotes(quotes: Array<VendorShippingQuote & { vendorName: string; itemIndexes: number[] }>) {
  return quotes.map((quote) => ({
    vendorScope: quote.vendorScope,
    vendorName: quote.vendorName,
    itemIndexes: quote.itemIndexes,
    ok: quote.ok,
    source: quote.ok ? quote.source : quote.source,
    sourceLabel: quote.ok ? quote.sourceLabel : null,
    estimate: quote.ok ? quote.estimate : false,
    options: quote.ok ? quote.options : [],
    note: quote.note,
    error: quote.ok ? null : quote.error,
    code: quote.ok ? null : quote.code,
  }));
}
