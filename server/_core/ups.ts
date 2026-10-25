import type { LiveParcel, LiveParcelQuoteResult, LiveQuoteAddress } from "./easypost";

/**
 * Direct UPS Rating API client.
 *
 * The linked UPS shipper number is used only for a live, read-only rate request.
 * No label, pickup, shipment, billing charge, or UPS account change is created.
 * API credentials are obtained from a UPS Developer Portal application that is
 * linked to the same UPS profile/account number.
 *
 * Official reference: https://developer.ups.com/tag/Rating?loc=en_US
 * - CIE: https://wwwcie.ups.com/api/rating/v2409/Shop
 * - Production: https://onlinetools.ups.com/api/rating/v2409/Shop
 * - OAuth uses client_credentials with HTTP Basic authentication.
 */

export interface UpsCredentials {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  environment: "sandbox" | "production";
}

export interface UpsParcelQuoteRequest {
  fromZip: string;
  toZip: string;
  fromAddress: LiveQuoteAddress;
  toAddress: LiveQuoteAddress;
  parcels: LiveParcel[];
}

const UPS_CIE_BASE = "https://wwwcie.ups.com";
const UPS_PRODUCTION_BASE = "https://onlinetools.ups.com";
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

function baseUrl(environment: UpsCredentials["environment"]): string {
  return environment === "production" ? UPS_PRODUCTION_BASE : UPS_CIE_BASE;
}

function tokenCacheKey(credentials: UpsCredentials): string {
  return `${credentials.environment}:${credentials.clientId}`;
}

function upsAddress(address: LiveQuoteAddress, postalCode: string) {
  return {
    Address: {
      City: address.locality,
      StateProvinceCode: address.region,
      PostalCode: postalCode,
      CountryCode: address.countryCode,
    },
  };
}

function ratePayload(credentials: UpsCredentials, request: UpsParcelQuoteRequest, parcel: LiveParcel) {
  return {
    RateRequest: {
      Request: {
        TransactionReference: {
          CustomerContext: "CabinetDealz live parcel quote",
        },
      },
      PickupType: { Code: "01" },
      CustomerClassification: { Code: "01" },
      Shipment: {
        Shipper: {
          Name: "CabinetDealz",
          ShipperNumber: credentials.accountNumber,
          ...upsAddress(request.fromAddress, request.fromZip),
        },
        ShipFrom: {
          Name: "CabinetDealz",
          ...upsAddress(request.fromAddress, request.fromZip),
        },
        ShipTo: {
          Name: "CabinetDealz customer",
          ...upsAddress(request.toAddress, request.toZip),
        },
        PaymentDetails: {
          ShipmentCharge: [{
            Type: "01",
            BillShipper: { AccountNumber: credentials.accountNumber },
          }],
        },
        NumOfPieces: "1",
        Package: {
          PackagingType: { Code: "02", Description: "Customer Supplied" },
          Dimensions: {
            UnitOfMeasurement: { Code: "IN", Description: "Inches" },
            Length: String(parcel.lengthIn),
            Width: String(parcel.widthIn),
            Height: String(parcel.heightIn),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: "LBS", Description: "Pounds" },
            Weight: String(parcel.weightLbs),
          },
        },
        ShipmentRatingOptions: { NegotiatedRatesIndicator: "" },
      },
    },
  };
}

function finiteCents(value: unknown): number | null {
  const numeric = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function firstRecord(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function rateAmountCents(shipment: JsonRecord): number | null {
  const negotiated = asRecord(shipment.NegotiatedRateCharges);
  const negotiatedTotal = asRecord(negotiated?.TotalCharge);
  const negotiatedCents = finiteCents(negotiatedTotal?.MonetaryValue);
  if (negotiatedCents != null) return negotiatedCents;
  const total = asRecord(shipment.TotalCharges);
  return finiteCents(total?.MonetaryValue);
}

function parseRateResponse(payload: unknown): {
  amountCents: number;
  carrier: string;
  service: string;
  transitDays?: number;
  estimatedDeliveryDate?: string;
} | null {
  const root = asRecord(payload);
  const response = asRecord(root?.RateResponse);
  const rated = response?.RatedShipment;
  const shipments = Array.isArray(rated) ? rated.map(asRecord).filter((row): row is JsonRecord => !!row) : [asRecord(rated)].filter((row): row is JsonRecord => !!row);
  const candidates = shipments.map((shipment) => {
    const amountCents = rateAmountCents(shipment);
    if (amountCents == null) return null;
    const service = asRecord(shipment.Service);
    const time = asRecord(shipment.TimeInTransit);
    const arrival = asRecord(time?.ServiceSummaryEstimatedArrival);
    const transitDays = Number(arrival?.BusinessDaysInTransit ?? time?.BusinessDaysInTransit);
    const estimatedDate = stringValue(arrival?.Date);
    return {
      amountCents,
      carrier: "UPS",
      service: stringValue(service?.Description) ?? stringValue(service?.Code) ?? "UPS service",
      transitDays: Number.isInteger(transitDays) && transitDays > 0 ? transitDays : undefined,
      estimatedDeliveryDate: estimatedDate && /^\d{8}$/.test(estimatedDate)
        ? `${estimatedDate.slice(0, 4)}-${estimatedDate.slice(4, 6)}-${estimatedDate.slice(6, 8)}`
        : undefined,
    };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null);
  return candidates.sort((left, right) => left.amountCents - right.amountCents)[0] ?? null;
}

function basicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

async function accessToken(credentials: UpsCredentials, fetchImpl: typeof fetch): Promise<string> {
  const key = tokenCacheKey(credentials);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 30_000) return cached.accessToken;
  const response = await fetchImpl(`${baseUrl(credentials.environment)}/security/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(credentials.clientId, credentials.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`UPS OAuth authentication failed (${response.status}). Verify the UPS Developer Client ID, Client Secret, and ${credentials.environment} environment.`);
  }
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("UPS OAuth response did not include an access token.");
  tokenCache.set(key, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  });
  return data.access_token;
}

function noRate(error: string): LiveParcelQuoteResult {
  return { ok: false, amountCents: 0, packages: [], error };
}

function validParcel(parcel: LiveParcel): boolean {
  return [parcel.lengthIn, parcel.widthIn, parcel.heightIn, parcel.weightLbs]
    .every((value) => Number.isFinite(value) && value > 0);
}

/** Rate each verified carton directly with UPS; no shipment or label is created. */
export async function upsParcelQuote(
  credentials: UpsCredentials,
  request: UpsParcelQuoteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveParcelQuoteResult> {
  if (!credentials.clientId.trim() || !credentials.clientSecret.trim()) {
    return noRate("UPS Developer Client ID and Client Secret are required for direct UPS parcel rating.");
  }
  if (!credentials.accountNumber.trim()) return noRate("A linked UPS account number is required for direct UPS parcel rating.");
  if (!request.fromZip || !request.toZip || !request.parcels.length || request.parcels.some((parcel) => !validParcel(parcel))) {
    return noRate("Direct UPS rating requires origin, destination, and verified positive carton dimensions and packaged weight.");
  }
  try {
    const token = await accessToken(credentials, fetchImpl);
    const packages: NonNullable<LiveParcelQuoteResult["packages"]> = [];
    for (const parcel of request.parcels) {
      const response = await fetchImpl(`${baseUrl(credentials.environment)}/api/rating/v2409/Shop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          transId: crypto.randomUUID().replaceAll("-", "").slice(0, 32),
          transactionSrc: "CabinetDealz",
        },
        body: JSON.stringify(ratePayload(credentials, request, parcel)),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        return noRate(`UPS Rating API request failed (${response.status}). Verify the linked UPS account, API product access, and ${credentials.environment} environment.`);
      }
      const rate = parseRateResponse(await response.json() as unknown);
      if (!rate) return noRate(`UPS did not return a usable parcel rate for ${parcel.label ?? "a verified carton"}.`);
      packages.push({ label: parcel.label ?? null, ...rate });
    }
    const amountCents = packages.reduce((total, entry) => total + entry.amountCents, 0);
    const transitDays = packages.reduce<number | undefined>((latest, entry) =>
      entry.transitDays != null ? Math.max(latest ?? 0, entry.transitDays) : latest,
    undefined);
    const estimatedDeliveryDate = packages.map((entry) => entry.estimatedDeliveryDate).filter((date): date is string => Boolean(date)).sort().at(-1);
    return {
      ok: true,
      amountCents,
      carrier: "UPS",
      service: Array.from(new Set(packages.map((entry) => entry.service))).join(", ") || undefined,
      transitDays,
      estimatedDeliveryDate,
      packages,
    };
  } catch (error) {
    return noRate(error instanceof Error ? error.message : "Network error contacting UPS Rating API.");
  }
}

export function clearUpsTokenCache(): void {
  tokenCache.clear();
}

/** Read-only connection check: only requests an OAuth token. */
export async function upsTestConnection(credentials: UpsCredentials, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  if (!credentials.clientId.trim() || !credentials.clientSecret.trim()) return { ok: false, error: "Save the UPS Client ID and Client Secret first." };
  try { clearUpsTokenCache(); await accessToken(credentials, fetchImpl); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "UPS connection failed." }; }
}
