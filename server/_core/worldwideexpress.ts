// ─── Worldwide Express (WWEX) — LTL Rate API Client ─────────────────────────
// WWEX supplies account-specific token and rate endpoints through its account
// representatives. Public marketing pages do not publish stable REST hosts, so
// this client never sends credentials to a guessed hostname.

import type { LivePallet, LiveQuoteAddress, LiveQuoteRequest, LiveQuoteResult } from "./easypost";

interface WWEXCreds {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  username?: string;
  password?: string;
  environment: "sandbox" | "production";
  tokenUrl?: string | null;
  rateUrl?: string | null;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const throttleCache = new Map<string, number>();

const SPEEDSHIP_STAGING_AUDIENCE = "staging-wwex-apig";
const SPEEDSHIP_LTL_FREIGHT_CLASSES = new Set([
  "50", "55", "60", "65", "70", "77.5", "85", "92.5", "100", "110", "125", "150", "175", "200", "250", "300", "400", "500",
]);
// Official production OpenID discovery publishes this token endpoint. The rate
// endpoint remains account-specific and is never guessed from a hostname.
const WWEX_PRODUCTION_TOKEN_URL = "https://auth.wwex.com/oauth/token";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function finiteMoney(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function providerCacheKey(creds: WWEXCreds, tokenUrl: string): string {
  return `${creds.clientId}:${creds.environment}:${tokenUrl}`;
}

function throttleDelayMs(response: Response): number {
  const requestedSeconds = Number(response.headers.get("retry-after"));
  const requestedMs = Number.isFinite(requestedSeconds) && requestedSeconds > 0
    ? requestedSeconds * 1000
    : 2 * 60 * 1000;
  return Math.min(Math.max(requestedMs, 30_000), 15 * 60 * 1000);
}

class WorldwideExpressThrottleError extends Error {
  constructor(public readonly retryAfterMs: number, environment: WWEXCreds["environment"]) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    super(`Worldwide Express ${environment} is temporarily rate-limited. Wait about ${minutes} minute${minutes === 1 ? "" : "s"} before trying again; saved credentials do not need to be replaced.`);
    this.name = "WorldwideExpressThrottleError";
  }
}

function throttleError(environment: WWEXCreds["environment"], delayMs: number): WorldwideExpressThrottleError {
  return new WorldwideExpressThrottleError(delayMs, environment);
}

export function normalizeSpeedshipFreightClass(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return SPEEDSHIP_LTL_FREIGHT_CLASSES.has(normalized) ? normalized : null;
}

function speedshipAddress(
  address: LiveQuoteAddress | undefined,
  postalCode: string,
  locationType: "COMMERCIAL" | "RESIDENTIAL" | "LIMITED_ACCESS",
  contactType: "SENDER" | "RECEIVER",
) {
  if (!address) {
    throw new Error("Worldwide Express requires a verified city and state for the origin and destination ZIP codes.");
  }
  return {
    address: {
      // Speedship requires a non-empty address-line array even when an Operations
      // test is intentionally ZIP-based. This is an inquiry marker, not a claimed
      // customer street address; final customer quotes still validate their address.
      addressLineList: address.addressLineList?.filter((line) => line.trim().length > 0).slice(0, 3)
        ?? ["ZIP-based carrier rate inquiry"],
      locality: address.locality,
      region: address.region,
      postalCode,
      countryCode: address.countryCode,
      companyName: "CabinetDealz freight quote",
      contactList: [{
        firstName: "CabinetDealz",
        lastName: "Shipping",
        phone: contactType === "SENDER" ? "2148888888" : "9728888888",
        contactType,
      }],
    },
    locationType,
  };
}

function speedshipHandlingUnit(pallet: LivePallet, freightClass: string) {
  const weight = Math.max(1, Math.round(pallet.weightLbs));
  return {
    billedDimension: {
      length: { value: String(Math.max(1, Math.round(pallet.lengthIn))), unit: "in" },
      width: { value: String(Math.max(1, Math.round(pallet.widthIn))), unit: "in" },
      height: { value: String(Math.max(1, Math.round(pallet.heightIn))), unit: "in" },
      dimensionType: "NET",
    },
    isMixedClass: false,
    isStackable: false,
    packagingType: "PLT",
    quantity: 1,
    weight: { value: weight, unit: "LB" },
    totalWeight: { value: weight, unit: "LB" },
    shippedItemList: [{
      commodityClass: freightClass,
      commodityDescription: "Cabinets",
      commodityType: "BOX",
      isHazMat: false,
      quantity: "1",
      weight: { value: weight, unit: "LB" },
    }],
  };
}

function speedshipTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((output, part) => ({ ...output, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Speedship rate tests use a future pickup timestamp and do not create a booking. */
function nextPickupTimestamp(date = new Date()): string {
  const candidate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(candidate).reduce<Record<string, string>>((output, part) => ({ ...output, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day} 11:00:00`;
}

/** Build the documented Speedship V4 LTL shopFlow request from a real pallet plan. */
export function buildSpeedshipShopFlowPayload(req: LiveQuoteRequest, date = new Date()) {
  const destinationLocationType = req.residential
    ? "RESIDENTIAL"
    : req.limitedAccess
      ? "LIMITED_ACCESS"
      : "COMMERCIAL";
  const handlingUnitList = req.pallets.map((pallet) => speedshipHandlingUnit(pallet, req.freightClass));
  const totalWeight = handlingUnitList.reduce((sum, unit) => sum + unit.weight.value, 0);

  return {
    request: {
      productType: "LTL",
      returnSelectedServiceOnly: false,
      preferredVendorList: [],
      shipment: {
        appointmentDeliveryFlag: false,
        carrierTerminalPickupFlag: false,
        handlingCharge: { value: "0", unit: "AMOUNT" },
        handlingUnitList,
        holdAtTerminalFlag: false,
        insuranceRequestFlag: false,
        isGuaranteed: false,
        marksNumbers: "",
        originAddress: speedshipAddress(req.fromAddress, req.fromZip, "COMMERCIAL", "SENDER"),
        protectionFromColdFlag: false,
        destinationAddress: speedshipAddress(req.toAddress, req.toZip, destinationLocationType, "RECEIVER"),
        shipmentDate: nextPickupTimestamp(date),
        shipmentReferenceList: [],
        sortAndSegregateFlag: false,
        totalHandlingUnitCount: handlingUnitList.length,
        totalWeight: { value: totalWeight, unit: "LB" },
        liftgatePickupFlag: false,
        insidePickupFlag: false,
        constructionSitePickupFlag: false,
        residentialPickupFlag: false,
        liftgateDeliveryFlag: Boolean(req.liftgate),
        insideDeliveryFlag: false,
        constructionSiteDeliveryFlag: false,
        notifyBeforeDeliveryFlag: false,
        skipAddressVerification: true,
        tradeshowDeliveryFlag: false,
        tradeshowDeliveryName: "",
        tradeshowPickupFlag: false,
        tradeshowPickupName: "",
      },
    },
  };
}

/**
 * Speedship response objects differ by carrier/service. Collect documented
 * charge fields only, then choose the lowest usable carrier quote.
 */
export function parseSpeedshipRates(payload: unknown): Array<{ amountCents: number; carrier?: string; service?: string }> {
  const found: Array<{ amountCents: number; carrier?: string; service?: string }> = [];
  const collectOfferRates = (value: unknown): boolean => {
    const record = asRecord(value);
    if (!record) return false;
    const offers = Array.isArray(record.offerList) ? record.offerList : null;
    if (offers) {
      for (const offer of offers) {
        const offerRecord = asRecord(offer);
        if (!offerRecord) continue;
        const vendor = asRecord(offerRecord.primaryVendor);
        const carrier = typeof vendor?.preferredName === "string" ? vendor.preferredName
          : typeof vendor?.legalName === "string" ? vendor.legalName
            : typeof vendor?.vendorId === "string" ? vendor.vendorId
              : undefined;
        const products = Array.isArray(offerRecord.offeredProductList) ? offerRecord.offeredProductList : [];
        for (const product of products) {
          const productRecord = asRecord(product);
          if (!productRecord) continue;
          const offerPrice = finiteMoney(productRecord.offerPrice)
            ?? finiteMoney(asRecord(productRecord.offerPrice)?.value);
          if (offerPrice == null) continue;
          const service = typeof productRecord.serviceName === "string" ? productRecord.serviceName
            : typeof productRecord.serviceType === "string" ? productRecord.serviceType
              : undefined;
          found.push({ amountCents: Math.round(offerPrice * 100), carrier, service });
        }
      }
      return true;
    }
    for (const nested of Object.values(record)) {
      if (collectOfferRates(nested)) return true;
    }
    return false;
  };
  // A Speedship offer list is authoritative. Do not fall through to the generic
  // parser and mistake one freight or fuel charge for the carrier's full offer.
  if (collectOfferRates(payload)) return found;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = asRecord(value);
    if (!record) return;

    const directCharge = finiteMoney(record.totalCharge)
      ?? finiteMoney(record.totalAmount)
      ?? finiteMoney(record.totalRate)
      ?? finiteMoney(record.rate);
    const nestedCharge = asRecord(record.totalCharge)?.amount
      ?? asRecord(record.totalAmount)?.amount
      ?? asRecord(record.totalRate)?.amount;
    const amount = directCharge ?? finiteMoney(nestedCharge);
    if (amount != null) {
      const carrier = typeof record.carrierName === "string" ? record.carrierName
        : typeof record.carrier === "string" ? record.carrier
          : typeof record.vendorName === "string" ? record.vendorName
            : typeof record.scac === "string" ? record.scac
              : undefined;
      const service = typeof record.serviceName === "string" ? record.serviceName
        : typeof record.service === "string" ? record.service
          : typeof record.serviceType === "string" ? record.serviceType
            : undefined;
      found.push({ amountCents: Math.round(amount * 100), carrier, service });
    }
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return found;
}

export function clearWorldwideExpressTokenCache(): void {
  tokenCache.clear();
  throttleCache.clear();
}

export function requireWwexHttpsEndpoint(value: string | null | undefined, label: string): string {
  const raw = value?.trim();
  if (!raw) {
    throw new Error(`Worldwide Express ${label} URL is not configured. Enter the verified URL supplied by your WWEX representative.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Worldwide Express ${label} URL is invalid.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`Worldwide Express ${label} URL must be a credential-free HTTPS address.`);
  }
  return parsed.toString();
}

async function getAccessToken(creds: WWEXCreds): Promise<string> {
  const tokenUrl = requireWwexHttpsEndpoint(
    creds.tokenUrl ?? (creds.environment === "production" ? WWEX_PRODUCTION_TOKEN_URL : null),
    `${creds.environment} token`,
  );
  const cacheKey = providerCacheKey(creds, tokenUrl);
  const retryAt = throttleCache.get(cacheKey);
  if (retryAt && retryAt > Date.now()) {
    throw throttleError(creds.environment, retryAt - Date.now());
  }
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 30_000) return cached.token;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      ...(creds.environment === "sandbox" ? { audience: SPEEDSHIP_STAGING_AUDIENCE } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) {
    const delayMs = throttleDelayMs(res);
    throttleCache.set(cacheKey, Date.now() + delayMs);
    throw throttleError(creds.environment, delayMs);
  }
  if (!res.ok) {
    throw new Error(`Worldwide Express authentication failed (${res.status}). Verify the ${creds.environment} credentials and token URL.`);
  }
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Worldwide Express authentication response did not include an access token.");
  }
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

export async function worldwideexpressQuote(
  creds: WWEXCreds,
  req: LiveQuoteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveQuoteResult> {
  try {
    if (!creds.clientId.trim() || !creds.clientSecret.trim()) {
      return { ok: false, amountCents: 0, error: "Worldwide Express Client ID and Client Secret are required." };
    }
    const rateUrl = requireWwexHttpsEndpoint(creds.rateUrl, `${creds.environment} rate`);
    const tokenUrl = requireWwexHttpsEndpoint(
      creds.tokenUrl ?? (creds.environment === "production" ? WWEX_PRODUCTION_TOKEN_URL : null),
      `${creds.environment} token`,
    );
    const cacheKey = providerCacheKey(creds, tokenUrl);
    const retryAt = throttleCache.get(cacheKey);
    if (retryAt && retryAt > Date.now()) {
      const retryAfterMs = retryAt - Date.now();
      return { ok: false, amountCents: 0, retryAfterMs, error: throttleError(creds.environment, retryAfterMs).message };
    }
    const token = await getAccessToken(creds);

    const payload = buildSpeedshipShopFlowPayload(req);
    const res = await fetchImpl(rateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) {
      const delayMs = throttleDelayMs(res);
      throttleCache.set(cacheKey, Date.now() + delayMs);
      return { ok: false, amountCents: 0, retryAfterMs: delayMs, error: throttleError(creds.environment, delayMs).message };
    }
    if (!res.ok) {
      return {
        ok: false,
        amountCents: 0,
        error: `Worldwide Express rate request failed (${res.status}). Verify the ${creds.environment} rate URL and account access.`,
      };
    }

    const data = await res.json() as unknown;
    const validRates = parseSpeedshipRates(data);
    if (validRates.length === 0) {
      return { ok: false, amountCents: 0, error: "No valid rates returned from Worldwide Express." };
    }
    const best = validRates.reduce((a, b) => a.amountCents < b.amountCents ? a : b);
    return {
      ok: true,
      amountCents: best.amountCents,
      carrier: best.carrier,
      service: best.service,
    };
  } catch (err) {
    if (err instanceof WorldwideExpressThrottleError) {
      return { ok: false, amountCents: 0, retryAfterMs: err.retryAfterMs, error: err.message };
    }
    return {
      ok: false,
      amountCents: 0,
      error: err instanceof Error ? err.message : "Worldwide Express request failed.",
    };
  }
}
