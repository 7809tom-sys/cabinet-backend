/**
 * Vendor shipping quotes for every supplier.
 *
 * Priority, for each vendor in a cart:
 * 1. That vendor's own live quote API, when the vendor has saved it and an
 *    administrator has enabled it.
 * 2. That vendor's own posted data: distributor zip / flat / free-over-threshold
 *    rules, a hardware standalone fee, or a carrier rate built only from
 *    supplier-verified package profiles.
 * 3. The site's estimator zones, comparison-package weights, and default freight
 *    class 175. Only this step is labeled an estimate.
 *
 * Posted vendor rates stay on `distributors` (and hardware profiles). Site zones
 * stay on `freight_zones`. This module does not merge those tables.
 *
 * The generic HTTPS contract is what a vendor's system implements. Pelican has
 * no public shipping API; its named adapter stays a stub.
 */

import {
  resolveDistributorShippingRule,
  type DistributorShippingRule,
} from "./distributorShipping";
import {
  estimateFreight,
  totalCartWeight,
  type FreightSettings,
  type FreightZoneRate,
} from "./freight";

export const SHIPPING_QUOTE_CONTRACT_VERSION = "2026-10-26" as const;
export const DEFAULT_SITE_FREIGHT_CLASS = "175";
export const SHIPPING_QUOTE_CACHE_TTL_MS = 120_000;
export const SHIPPING_QUOTE_TIMEOUT_MS = 8_000;
export const SHIPPING_QUOTE_RATE_LIMIT = 20;
export const SHIPPING_QUOTE_RATE_WINDOW_MS = 60_000;

/** Pelican's comparison rule uses 600 lb. Their catalog lists heavier quartz slabs. */
export const QUARTZ_COMPARISON_RULE_ID = "quartz-slab-v1";
export const QUARTZ_ESTIMATE_WEIGHT_LBS = 600;
export const QUARTZ_CATALOG_WEIGHTS_LBS = [
  { label: "3cm", weightLbs: 800 },
  { label: "Super Jumbo", weightLbs: 1080 },
] as const;

export const NEEDS_PELICAN_PACKAGE_DATA =
  "This Pelican SKU needs an enabled shipping profile with verified origin, transport mode, package dimensions, package weight, and source reference.";

export type ShippingQuoteSource = "vendor_live" | "vendor_rates" | "site_estimate";

export const SHIPPING_QUOTE_SOURCE_LABEL: Record<ShippingQuoteSource, string> = {
  vendor_live: "Vendor live quote",
  vendor_rates: "Vendor rates",
  site_estimate: "Site estimate",
};

export type ShippingQuoteProviderKind = "none" | "http" | "pelican" | "carrier_ltl";

export type PackageEvidence = "supplier_verified" | "comparable_estimate" | "missing";

export type ShippingQuoteLine = {
  sku: string;
  qty: number;
  weightLbs: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  freightClass: string | null;
  evidence: PackageEvidence;
  shipFromZip: string | null;
  transportMode: "parcel" | "ltl" | null;
  comparisonRuleId: string | null;
};

export type ShippingQuoteOption = {
  carrier: string | null;
  method: string;
  costCents: number;
  transitDays: number | null;
  expiresAt: string | null;
};

export type VendorShippingQuoteSuccess = {
  ok: true;
  vendorScope: string;
  source: ShippingQuoteSource;
  sourceLabel: string;
  /** True only for the site estimator. Vendor posted rates and live APIs are not estimates. */
  estimate: boolean;
  options: ShippingQuoteOption[];
  note: string | null;
};

export type VendorShippingQuoteFailure = {
  ok: false;
  vendorScope: string;
  source: ShippingQuoteSource | null;
  code: "not_configured" | "timeout" | "provider_error" | "no_rate" | "needs_package_data" | "rate_limited";
  error: string;
  note: string | null;
};

export type VendorShippingQuote = VendorShippingQuoteSuccess | VendorShippingQuoteFailure;

export type ShippingQuoteDraftOption = {
  carrier: string | null;
  method: string;
  costCents: number;
  transitDays: number | null;
  expiresAt?: string | null;
};

export type ProviderAttempt =
  | { ok: true; options: ShippingQuoteDraftOption[] }
  | { ok: false; code: "not_configured" | "timeout" | "provider_error" | "no_rate"; error: string };

/**
 * Connection facts the priority engine is allowed to see. The secret stays in
 * the server closure that performs the HTTP call and is never placed here.
 */
export type VendorLiveConnection = {
  kind: ShippingQuoteProviderKind;
  adminEnabled: boolean;
  vendorEnabled: boolean;
  /** True when the selected adapter has the non-secret fields it needs. */
  configured: boolean;
};

export type VendorShippingQuoteContractItem = {
  sku: string;
  qty: number;
  weightLbs: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  freightClass: string | null;
};

export type VendorShippingQuoteContract = {
  contractVersion: typeof SHIPPING_QUOTE_CONTRACT_VERSION;
  vendorScope: string;
  destinationZip: string;
  shipFromZip: string | null;
  freightClass: string | null;
  serviceCodes: string[];
  items: VendorShippingQuoteContractItem[];
};

export type ShippingQuoteLogEntry = {
  vendorScope: string;
  destinationZip: string;
  source: ShippingQuoteSource | null;
  outcome: "cache" | "quoted" | "fallback" | "unavailable";
  detail: string;
};

export type QuoteCache = {
  get(key: string, nowMs: number): VendorShippingQuoteSuccess | null;
  set(key: string, value: VendorShippingQuoteSuccess, nowMs: number): void;
};

export class ShippingQuoteTimeout extends Error {
  constructor() {
    super("Shipping quote timed out");
    this.name = "ShippingQuoteTimeout";
  }
}

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"]);

export function liveConnectionEligible(live: VendorLiveConnection): boolean {
  return live.kind !== "none" && live.adminEnabled && live.vendorEnabled && live.configured;
}

export function itemsReadyForCarrier(items: ShippingQuoteLine[]): boolean {
  return items.length > 0 && items.every((item) =>
    item.evidence === "supplier_verified"
    && item.weightLbs != null && item.weightLbs > 0
    && item.lengthIn != null && item.lengthIn > 0
    && item.widthIn != null && item.widthIn > 0
    && item.heightIn != null && item.heightIn > 0
    && Boolean(item.shipFromZip),
  );
}

export function assertPublicHttpsQuoteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Quote URL must be a valid https URL.");
  }
  if (url.protocol !== "https:") throw new Error("Quote URL must use https.");
  if (url.username || url.password) throw new Error("Quote URL must not include a password.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Quote URL must be a public https endpoint.");
  }
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)) {
    throw new Error("Quote URL must be a public https endpoint.");
  }
  return url;
}

export function assertAuthHeaderName(name: string): string {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9-]{1,64}$/.test(trimmed)) {
    throw new Error("Auth header name must be letters, numbers, or hyphens.");
  }
  return trimmed;
}

export function normalizeServiceCodes(values: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const code = value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
    if (code) unique.add(code);
    if (unique.size >= 20) break;
  }
  return Array.from(unique);
}

export function shippingQuoteCacheKey(input: {
  vendorScope: string;
  destinationZip: string;
  items: ShippingQuoteLine[];
  live: VendorLiveConnection;
  postedRule: DistributorShippingRule | null;
  hardwareStandaloneCents: number | null;
}): string {
  const items = [...input.items]
    .map((item) => [
      item.sku,
      item.qty,
      item.weightLbs ?? "",
      item.lengthIn ?? "",
      item.widthIn ?? "",
      item.heightIn ?? "",
      item.freightClass ?? "",
      item.evidence,
      item.shipFromZip ?? "",
      item.comparisonRuleId ?? "",
    ].join("~"))
    .sort()
    .join("|");
  const posted = input.postedRule
    ? [
      input.postedRule.mode,
      input.postedRule.flatFeeCents ?? "",
      input.postedRule.freeThresholdCents ?? "",
      input.postedRule.zipRates.map((rate) => `${rate.zipPrefix}:${rate.feeCents}`).join(","),
    ].join(";")
    : "";
  return [
    input.vendorScope,
    input.destinationZip,
    input.live.kind,
    input.live.adminEnabled ? "1" : "0",
    input.live.vendorEnabled ? "1" : "0",
    input.live.configured ? "1" : "0",
    input.hardwareStandaloneCents ?? "",
    posted,
    items,
  ].join("§");
}

export function createShippingQuoteCache(ttlMs = SHIPPING_QUOTE_CACHE_TTL_MS): QuoteCache & { clear(): void } {
  const store = new Map<string, { expiresAt: number; value: VendorShippingQuoteSuccess }>();
  return {
    get(key, nowMs) {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= nowMs) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value, nowMs) {
      store.set(key, { expiresAt: nowMs + ttlMs, value });
    },
    clear() {
      store.clear();
    },
  };
}

export function createShippingQuoteRateLimiter(limit = SHIPPING_QUOTE_RATE_LIMIT, windowMs = SHIPPING_QUOTE_RATE_WINDOW_MS) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string, nowMs: number) {
      const recent = (hits.get(key) ?? []).filter((stamp) => nowMs - stamp < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(nowMs);
      hits.set(key, recent);
      return true;
    },
    clear() {
      hits.clear();
    },
  };
}

export function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ShippingQuoteTimeout());
    }, timeoutMs);
  });
  return Promise.race([work(controller.signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function isShippingQuoteTimeout(error: unknown): boolean {
  if (error instanceof ShippingQuoteTimeout) return true;
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export type VendorConfigActor = {
  isAdmin: boolean;
  vendorLineId: number | null;
  distributorId: number | null;
};

export type VendorConfigTarget = {
  vendorLineId: number;
  distributorIds: readonly number[];
};

/** A vendor may read or change only its own quote settings. Administrators may open any vendor. */
export function vendorConfigAccess(actor: VendorConfigActor, target: VendorConfigTarget): { ok: true } | { ok: false; reason: string } {
  if (actor.isAdmin) return { ok: true };
  if (actor.vendorLineId != null && actor.vendorLineId === target.vendorLineId) return { ok: true };
  if (actor.distributorId != null && target.distributorIds.includes(actor.distributorId)) return { ok: true };
  return { ok: false, reason: "That shipping quote setup belongs to another vendor." };
}

export type PublicVendorQuoteConfig = {
  vendorLineId: number;
  serviceCodes: string[];
  freightClass: string | null;
  shipFromZip: string | null;
  provider: ShippingQuoteProviderKind;
  quoteUrl: string | null;
  authHeaderName: string | null;
  hasSecret: boolean;
  adminEnabled: boolean;
  vendorEnabled: boolean;
};

export function publicVendorQuoteConfig(input: PublicVendorQuoteConfig & { secret?: string | null }): PublicVendorQuoteConfig {
  return {
    vendorLineId: input.vendorLineId,
    serviceCodes: input.serviceCodes,
    freightClass: input.freightClass,
    shipFromZip: input.shipFromZip,
    provider: input.provider,
    quoteUrl: input.quoteUrl,
    authHeaderName: input.authHeaderName,
    hasSecret: input.hasSecret,
    adminEnabled: input.adminEnabled,
    vendorEnabled: input.vendorEnabled,
  };
}

/** Drop the encrypted quote secret before an approved-vendor row reaches a client. */
export function redactVendorLineForClient<T extends { shippingQuoteSecretEncrypted?: string | null }>(line: T) {
  const { shippingQuoteSecretEncrypted, ...rest } = line;
  return {
    ...rest,
    hasShippingQuoteSecret: Boolean(shippingQuoteSecretEncrypted),
  };
}

export function buildVendorShippingQuoteContract(input: {
  vendorScope: string;
  destinationZip: string;
  shipFromZip: string | null;
  freightClass: string | null;
  serviceCodes: readonly string[];
  items: ShippingQuoteLine[];
}): VendorShippingQuoteContract {
  return {
    contractVersion: SHIPPING_QUOTE_CONTRACT_VERSION,
    vendorScope: input.vendorScope,
    destinationZip: input.destinationZip,
    shipFromZip: input.shipFromZip,
    freightClass: input.freightClass,
    serviceCodes: normalizeServiceCodes(input.serviceCodes),
    items: input.items.map((item) => ({
      sku: item.sku,
      qty: item.qty,
      weightLbs: item.weightLbs,
      lengthIn: item.lengthIn,
      widthIn: item.widthIn,
      heightIn: item.heightIn,
      freightClass: item.freightClass,
    })),
  };
}

function finiteNonNegativeInt(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 100_000_000) return null;
  return numeric;
}

/** Keep only the documented fields. A vendor that echoes the auth secret is ignored. */
export function parseVendorHttpQuoteResponse(payload: unknown): ProviderAttempt {
  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "provider_error", error: "Vendor quote response was not a JSON object." };
  }
  const record = payload as { options?: unknown; error?: unknown };
  if (typeof record.error === "string" && record.error.trim() && !Array.isArray(record.options)) {
    return { ok: false, code: "provider_error", error: "Vendor quote endpoint returned an error." };
  }
  if (!Array.isArray(record.options) || record.options.length === 0) {
    return { ok: false, code: "no_rate", error: "Vendor quote endpoint returned no options." };
  }
  const options: ShippingQuoteDraftOption[] = [];
  for (const raw of record.options.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const costCents = finiteNonNegativeInt(row.costCents);
    const method = typeof row.method === "string" ? row.method.trim().slice(0, 120) : "";
    if (costCents == null || !method) continue;
    const transit = finiteNonNegativeInt(row.transitDays);
    const carrier = typeof row.carrier === "string" && row.carrier.trim() ? row.carrier.trim().slice(0, 80) : null;
    const expiresAt = typeof row.expiresAt === "string" && !Number.isNaN(Date.parse(row.expiresAt)) ? row.expiresAt : null;
    options.push({
      carrier,
      method,
      costCents,
      transitDays: transit != null && transit > 0 ? transit : null,
      expiresAt,
    });
  }
  if (options.length === 0) {
    return { ok: false, code: "no_rate", error: "Vendor quote endpoint returned no usable options." };
  }
  return { ok: true, options };
}

export async function requestVendorHttpQuote(input: {
  url: string;
  authHeaderName: string;
  secret: string;
  contract: VendorShippingQuoteContract;
  fetchImpl?: typeof fetch;
  signal: AbortSignal;
}): Promise<ProviderAttempt> {
  const headerName = assertAuthHeaderName(input.authHeaderName);
  const url = assertPublicHttpsQuoteUrl(input.url);
  if (!input.secret.trim()) return { ok: false, code: "not_configured", error: "Vendor quote secret is not configured." };
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        [headerName]: input.secret,
      },
      body: JSON.stringify(input.contract),
      signal: input.signal,
    });
  } catch (error) {
    if (isShippingQuoteTimeout(error) || input.signal.aborted) {
      return { ok: false, code: "timeout", error: "Vendor quote endpoint timed out." };
    }
    return { ok: false, code: "provider_error", error: "Vendor quote endpoint could not be reached." };
  }
  if (!response.ok) {
    return { ok: false, code: "provider_error", error: `Vendor quote endpoint returned HTTP ${response.status}.` };
  }
  try {
    return parseVendorHttpQuoteResponse(await response.json());
  } catch {
    return { ok: false, code: "provider_error", error: "Vendor quote endpoint did not return JSON." };
  }
}

/**
 * Pelican Int'l (buildpelican.com) is a Shopify wholesale store and does not
 * publish a shipping, freight, EDI, or dealer rate API. This adapter is the
 * named place that will call them if they ever provide one.
 *
 * TODO(pelican-live-quote): when Pelican supplies an endpoint, POST
 * `PELICAN_SHIPPING_QUOTE_API_URL` with header
 * `Authorization: Bearer ${PELICAN_SHIPPING_QUOTE_API_KEY}` and the generic
 * vendor contract (`contractVersion`, `shipFromZip`, `destinationZip`,
 * `freightClass`, `serviceCodes`, `items`). Expect
 * `{ options: [{ carrier, method, costCents, transitDays, expiresAt }] }`.
 * Until that contract exists, return not configured. Do not invent a rate.
 */
export function pelicanProviderQuote(env: { enabled: boolean; apiKey: string; apiUrl: string }): ProviderAttempt {
  if (!env.enabled || !env.apiKey.trim()) {
    return {
      ok: false,
      code: "not_configured",
      error: "Pelican shipping quotes are not configured. PELICAN_SHIPPING_QUOTES_ENABLED and PELICAN_SHIPPING_QUOTE_API_KEY stay unset until Pelican provides an API.",
    };
  }
  if (!env.apiUrl.trim()) {
    return {
      ok: false,
      code: "not_configured",
      error: "Pelican has no public shipping API. PELICAN_SHIPPING_QUOTE_API_URL is not set, so the adapter will not call a guessed host.",
    };
  }
  return {
    ok: false,
    code: "not_configured",
    error: "Pelican has no public shipping API yet. The named adapter is installed and will not invent a live rate.",
  };
}

function quoteOptions(
  options: ShippingQuoteDraftOption[],
  nowMs: number,
  ttlMs: number,
): ShippingQuoteOption[] {
  const fallbackExpiry = new Date(nowMs + ttlMs).toISOString();
  return options.map((option) => ({
    carrier: option.carrier,
    method: option.method,
    costCents: option.costCents,
    transitDays: option.transitDays,
    expiresAt: option.expiresAt ?? fallbackExpiry,
  }));
}

function successQuote(input: {
  vendorScope: string;
  source: ShippingQuoteSource;
  options: ShippingQuoteOption[];
  note: string | null;
}): VendorShippingQuoteSuccess {
  return {
    ok: true,
    vendorScope: input.vendorScope,
    source: input.source,
    sourceLabel: SHIPPING_QUOTE_SOURCE_LABEL[input.source],
    estimate: input.source === "site_estimate",
    options: input.options,
    note: input.note,
  };
}

export function quoteFromVendorPostedRates(input: {
  vendorScope: string;
  destinationZip: string;
  postedRule: DistributorShippingRule | null;
  hardwareStandaloneCents: number | null;
  merchandiseSubtotalCents: number;
  nowMs: number;
  ttlMs: number;
}): VendorShippingQuoteSuccess | null {
  if (input.postedRule) {
    const resolved = resolveDistributorShippingRule(input.postedRule, input.destinationZip, input.merchandiseSubtotalCents);
    if (resolved.fixedFeeCents != null) {
      return successQuote({
        vendorScope: input.vendorScope,
        source: "vendor_rates",
        note: null,
        options: quoteOptions([{
          carrier: null,
          method: resolved.label ?? "Vendor posted freight",
          costCents: resolved.fixedFeeCents,
          transitDays: null,
        }], input.nowMs, input.ttlMs),
      });
    }
  }
  if (input.hardwareStandaloneCents != null && input.hardwareStandaloneCents >= 0) {
    return successQuote({
      vendorScope: input.vendorScope,
      source: "vendor_rates",
      note: null,
      options: quoteOptions([{
        carrier: null,
        method: "Vendor posted hardware shipping",
        costCents: input.hardwareStandaloneCents,
        transitDays: null,
      }], input.nowMs, input.ttlMs),
    });
  }
  return null;
}

export function quoteFromSiteEstimator(input: {
  vendorScope: string;
  destinationZip: string;
  items: ShippingQuoteLine[];
  settings: FreightSettings;
  zones: FreightZoneRate[];
  merchandiseSubtotalCents: number;
  nowMs: number;
  ttlMs: number;
}): VendorShippingQuoteSuccess | null {
  const weight = totalCartWeight(
    input.items.map((item) => ({ weightLbs: item.weightLbs, qty: item.qty })),
    input.settings.defaultCabinetWeightLbs,
  );
  const estimate = estimateFreight({
    destinationZip: input.destinationZip,
    totalWeightLbs: weight,
    merchandiseSubtotalCents: input.merchandiseSubtotalCents,
  }, input.settings, input.zones);
  if (!estimate.available) return null;
  const notes: string[] = ["Site estimate from the platform freight zones."];
  if (input.items.some((item) => item.evidence === "comparable_estimate")) {
    notes.push("Package size is a comparison estimate, not supplier-verified carton data.");
  }
  if (input.vendorScope === "pelican" && input.items.some((item) => item.evidence === "missing")) {
    notes.push(NEEDS_PELICAN_PACKAGE_DATA);
  }
  if (input.items.every((item) => !item.freightClass)) {
    notes.push(`Freight class ${DEFAULT_SITE_FREIGHT_CLASS} is the site default.`);
  }
  if (input.items.some((item) => item.comparisonRuleId === QUARTZ_COMPARISON_RULE_ID)) {
    const catalog = QUARTZ_CATALOG_WEIGHTS_LBS.map((row) => `${row.weightLbs} lb ${row.label}`).join(" and ");
    notes.push(`Quartz comparison weight is ${QUARTZ_ESTIMATE_WEIGHT_LBS} lb per slab. Pelican's catalog lists ${catalog}, so this LTL estimate may be low.`);
  }
  return successQuote({
    vendorScope: input.vendorScope,
    source: "site_estimate",
    note: notes.join(" "),
    options: quoteOptions([{
      carrier: null,
      method: estimate.zoneName ? `Estimator zone ${estimate.zoneName}` : "Estimator zone",
      costCents: estimate.totalCents,
      transitDays: null,
    }], input.nowMs, input.ttlMs),
  });
}

export type ShippingQuoteCall = {
  vendorScope: string;
  destinationZip: string;
  shipFromZip: string | null;
  freightClass: string | null;
  serviceCodes: string[];
  items: ShippingQuoteLine[];
};

export async function resolveShippingQuotePriority(input: {
  vendorScope: string;
  destinationZip: string;
  items: ShippingQuoteLine[];
  live: VendorLiveConnection;
  serviceCodes: string[];
  freightClass: string | null;
  shipFromZip: string | null;
  postedRule: DistributorShippingRule | null;
  hardwareStandaloneCents: number | null;
  merchandiseSubtotalCents: number;
  site: { settings: FreightSettings; zones: FreightZoneRate[] };
  nowMs: number;
  cache: QuoteCache;
  cacheTtlMs?: number;
  timeoutMs?: number;
  log: (entry: ShippingQuoteLogEntry) => void;
  quoteLive: (call: ShippingQuoteCall, signal: AbortSignal) => Promise<ProviderAttempt>;
  quoteCarrier: (call: ShippingQuoteCall, signal: AbortSignal) => Promise<ProviderAttempt>;
}): Promise<VendorShippingQuote> {
  const ttlMs = input.cacheTtlMs ?? SHIPPING_QUOTE_CACHE_TTL_MS;
  const timeoutMs = input.timeoutMs ?? SHIPPING_QUOTE_TIMEOUT_MS;
  const key = shippingQuoteCacheKey({
    vendorScope: input.vendorScope,
    destinationZip: input.destinationZip,
    items: input.items,
    live: input.live,
    postedRule: input.postedRule,
    hardwareStandaloneCents: input.hardwareStandaloneCents,
  });
  const cached = input.cache.get(key, input.nowMs);
  if (cached) {
    input.log({
      vendorScope: input.vendorScope,
      destinationZip: input.destinationZip,
      source: cached.source,
      outcome: "cache",
      detail: "Served a fresh cached quote.",
    });
    return cached;
  }

  const call: ShippingQuoteCall = {
    vendorScope: input.vendorScope,
    destinationZip: input.destinationZip,
    shipFromZip: input.shipFromZip ?? input.items.find((item) => item.shipFromZip)?.shipFromZip ?? null,
    freightClass: input.freightClass ?? input.items.find((item) => item.freightClass)?.freightClass ?? null,
    serviceCodes: input.serviceCodes,
    items: input.items,
  };

  const finish = (quote: VendorShippingQuoteSuccess, detail: string) => {
    input.cache.set(key, quote, input.nowMs);
    input.log({
      vendorScope: input.vendorScope,
      destinationZip: input.destinationZip,
      source: quote.source,
      outcome: "quoted",
      detail,
    });
    return quote;
  };

  if (liveConnectionEligible(input.live)) {
    try {
      const attempt = await withTimeout((signal) => input.quoteLive(call, signal), timeoutMs);
      if (attempt.ok && attempt.options.length > 0) {
        return finish(successQuote({
          vendorScope: input.vendorScope,
          source: "vendor_live",
          note: null,
          options: quoteOptions(attempt.options, input.nowMs, ttlMs),
        }), `Live ${input.live.kind} quote succeeded.`);
      }
      input.log({
        vendorScope: input.vendorScope,
        destinationZip: input.destinationZip,
        source: "vendor_live",
        outcome: "fallback",
        detail: attempt.ok ? "Live provider returned no options." : attempt.error,
      });
    } catch (error) {
      input.log({
        vendorScope: input.vendorScope,
        destinationZip: input.destinationZip,
        source: "vendor_live",
        outcome: "fallback",
        detail: isShippingQuoteTimeout(error) ? "Live quote timed out." : "Live quote failed.",
      });
    }
  }

  const posted = quoteFromVendorPostedRates({
    vendorScope: input.vendorScope,
    destinationZip: input.destinationZip,
    postedRule: input.postedRule,
    hardwareStandaloneCents: input.hardwareStandaloneCents,
    merchandiseSubtotalCents: input.merchandiseSubtotalCents,
    nowMs: input.nowMs,
    ttlMs,
  });
  if (posted) return finish(posted, "Used the vendor's posted rates.");

  const liveWasCarrier = input.live.kind === "carrier_ltl" && liveConnectionEligible(input.live);
  if (!liveWasCarrier && itemsReadyForCarrier(input.items)) {
    try {
      const attempt = await withTimeout((signal) => input.quoteCarrier(call, signal), timeoutMs);
      if (attempt.ok && attempt.options.length > 0) {
        const filledClass = input.items.some((item) => !item.freightClass) && !input.freightClass;
        return finish(successQuote({
          vendorScope: input.vendorScope,
          source: "vendor_rates",
          note: filledClass
            ? `Carrier rate used supplier-verified packages. Freight class ${DEFAULT_SITE_FREIGHT_CLASS} filled a blank class and is the site default.`
            : "Carrier rate used supplier-verified package data.",
          options: quoteOptions(attempt.options, input.nowMs, ttlMs),
        }), "Used a carrier rate from supplier-verified packages.");
      }
      input.log({
        vendorScope: input.vendorScope,
        destinationZip: input.destinationZip,
        source: "vendor_rates",
        outcome: "fallback",
        detail: attempt.ok ? "Verified packages produced no carrier rate." : attempt.error,
      });
    } catch (error) {
      input.log({
        vendorScope: input.vendorScope,
        destinationZip: input.destinationZip,
        source: "vendor_rates",
        outcome: "fallback",
        detail: isShippingQuoteTimeout(error) ? "Carrier quote timed out." : "Carrier quote failed.",
      });
    }
  }

  const site = quoteFromSiteEstimator({
    vendorScope: input.vendorScope,
    destinationZip: input.destinationZip,
    items: input.items,
    settings: input.site.settings,
    zones: input.site.zones,
    merchandiseSubtotalCents: input.merchandiseSubtotalCents,
    nowMs: input.nowMs,
    ttlMs,
  });
  if (site) return finish(site, "Used the site estimator.");

  const missingPackage = input.vendorScope === "pelican" && input.items.some((item) => item.evidence === "missing");
  const failure: VendorShippingQuoteFailure = {
    ok: false,
    vendorScope: input.vendorScope,
    source: null,
    code: missingPackage ? "needs_package_data" : "no_rate",
    error: missingPackage ? NEEDS_PELICAN_PACKAGE_DATA : "No vendor rate or site estimate covers that ZIP.",
    note: null,
  };
  input.log({
    vendorScope: input.vendorScope,
    destinationZip: input.destinationZip,
    source: null,
    outcome: "unavailable",
    detail: failure.error,
  });
  return failure;
}
