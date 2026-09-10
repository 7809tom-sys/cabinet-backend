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

const SPEEDSHIP_STAGING_AUDIENCE = "staging-wwex-apig";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function finiteMoney(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function speedshipAddress(address: LiveQuoteAddress | undefined, postalCode: string, locationType: "COMMERCIAL" | "RESIDENTIAL" | "LIMITED_ACCESS") {
  if (!address) {
    throw new Error("Worldwide Express requires a verified city and state for the origin and destination ZIP codes.");
  }
  return {
    address: {
      // Speedship documents the array itself as required. A city/state/ZIP quote
      // does not invent a customer's street address before checkout collects one.
      addressLineList: [],
      locality: address.locality,
      region: address.region,
      postalCode,
      countryCode: address.countryCode,
      companyName: "CabinetDealz freight quote",
      contactList: [],
    },
    locationType,
  };
}

function speedshipHandlingUnit(pallet: LivePallet, freightClass: string) {
  const weight = Math.max(1, Math.round(pallet.weightLbs));
  return {
    dimensions: {
      length: { value: Math.max(1, Math.round(pallet.lengthIn)), unit: "in" },
      width: { value: Math.max(1, Math.round(pallet.widthIn)), unit: "in" },
      height: { value: Math.max(1, Math.round(pallet.heightIn)), unit: "in" },
      dimensionType: "NET",
    },
    packagingType: "PLT",
    quantity: 1,
    weight: { value: weight, unit: "LB" },
    shippedItemList: [{
      commodityClass: freightClass,
      commodityDescription: "Cabinets",
      isHazMat: false,
      quantity: 1,
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
        handlingUnitList,
        originAddress: speedshipAddress(req.fromAddress, req.fromZip, "COMMERCIAL"),
        destinationAddress: speedshipAddress(req.toAddress, req.toZip, destinationLocationType),
        shipmentDate: speedshipTimestamp(date),
        totalHandlingUnitCount: handlingUnitList.length,
        totalWeight: { value: totalWeight, unit: "LB" },
        residentialPickupFlag: false,
        liftgateDeliveryFlag: Boolean(req.liftgate),
        insideDeliveryFlag: false,
        constructionSiteDeliveryFlag: false,
        notifyBeforeDeliveryFlag: false,
        skipAddressVerification: true,
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
  const tokenUrl = requireWwexHttpsEndpoint(creds.tokenUrl, `${creds.environment} token`);
  const cacheKey = `${creds.clientId}:${creds.environment}:${tokenUrl}`;
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
    return {
      ok: false,
      amountCents: 0,
      error: err instanceof Error ? err.message : "Worldwide Express request failed.",
    };
  }
}
