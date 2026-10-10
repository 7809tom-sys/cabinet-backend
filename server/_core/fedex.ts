import type { LiveParcel, LiveParcelQuoteResult, LiveQuoteAddress } from "./easypost";

/**
 * Direct FedEx Rate API client (read-only: no label, pickup or shipment is created).
 * Keys come from a FedEx Developer Portal project; the account number is the
 * FedEx account the rates are quoted against.
 * - Sandbox: https://apis-sandbox.fedex.com   Production: https://apis.fedex.com
 * - OAuth: POST /oauth/token (client_credentials, form encoded)
 * - Rates: POST /rate/v1/rates/quotes
 */
export interface FedexCredentials {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  environment: "sandbox" | "production";
}
export interface FedexParcelQuoteRequest {
  fromZip: string;
  toZip: string;
  fromAddress: LiveQuoteAddress;
  toAddress: LiveQuoteAddress;
  parcels: LiveParcel[];
}

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();
const baseUrl = (env: FedexCredentials["environment"]) =>
  env === "production" ? "https://apis.fedex.com" : "https://apis-sandbox.fedex.com";

export async function fedexAccessToken(c: FedexCredentials, fetchImpl: typeof fetch = fetch): Promise<string> {
  const key = `${c.environment}:${c.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 30_000) return cached.accessToken;
  const response = await fetchImpl(`${baseUrl(c.environment)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`FedEx OAuth failed (${response.status}). Check the API Key, Secret Key and ${c.environment} environment.`);
  }
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("FedEx OAuth response did not include an access token.");
  tokenCache.set(key, { accessToken: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

function noRate(error: string): LiveParcelQuoteResult {
  return { ok: false, amountCents: 0, packages: [], error };
}
const validParcel = (p: LiveParcel) =>
  [p.lengthIn, p.widthIn, p.heightIn, p.weightLbs].every((v) => Number.isFinite(v) && v > 0);
const addr = (a: LiveQuoteAddress, zip: string) => ({
  address: { city: a.locality, stateOrProvinceCode: a.region, postalCode: zip, countryCode: a.countryCode },
});

/** Pick the cheapest FedEx service for one carton from a rate reply. */
export function parseFedexRateReply(payload: unknown): { amountCents: number; service: string; transitDays?: number } | null {
  const details = (payload as { output?: { rateReplyDetails?: unknown } })?.output?.rateReplyDetails;
  if (!Array.isArray(details)) return null;
  let best: { amountCents: number; service: string } | null = null;
  for (const d of details as Record<string, any>[]) {
    const rated = Array.isArray(d.ratedShipmentDetails) ? d.ratedShipmentDetails : [];
    for (const r of rated) {
      const amount = Number(r?.totalNetCharge ?? r?.totalNetFedExCharge ?? r?.shipmentRateDetail?.totalNetCharge);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const cents = Math.round(amount * 100);
      if (!best || cents < best.amountCents) best = { amountCents: cents, service: String(d.serviceName ?? d.serviceType ?? "FedEx") };
    }
  }
  return best;
}

export async function fedexParcelQuote(
  c: FedexCredentials,
  request: FedexParcelQuoteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveParcelQuoteResult> {
  if (!c.clientId.trim() || !c.clientSecret.trim()) return noRate("FedEx API Key and Secret Key are required for direct FedEx parcel rating.");
  if (!c.accountNumber.trim()) return noRate("A FedEx account number is required for direct FedEx parcel rating.");
  if (!request.fromZip || !request.toZip || !request.parcels.length || request.parcels.some((p) => !validParcel(p))) {
    return noRate("Direct FedEx rating requires origin, destination, and verified positive carton dimensions and packaged weight.");
  }
  try {
    const token = await fedexAccessToken(c, fetchImpl);
    const packages: NonNullable<LiveParcelQuoteResult["packages"]> = [];
    for (const parcel of request.parcels) {
      const response = await fetchImpl(`${baseUrl(c.environment)}/rate/v1/rates/quotes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-locale": "en_US" },
        body: JSON.stringify({
          accountNumber: { value: c.accountNumber },
          rateRequestControlParameters: { returnTransitTimes: true },
          requestedShipment: {
            shipper: addr(request.fromAddress, request.fromZip),
            recipient: addr(request.toAddress, request.toZip),
            pickupType: "USE_SCHEDULED_PICKUP",
            rateRequestType: ["ACCOUNT", "LIST"],
            packagingType: "YOUR_PACKAGING",
            requestedPackageLineItems: [{
              weight: { units: "LB", value: parcel.weightLbs },
              dimensions: { length: Math.ceil(parcel.lengthIn), width: Math.ceil(parcel.widthIn), height: Math.ceil(parcel.heightIn), units: "IN" },
            }],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return noRate(`FedEx Rate API request failed (${response.status}). Verify the account number, Rates API access, and ${c.environment} environment.`);
      const rate = parseFedexRateReply(await response.json() as unknown);
      if (!rate) return noRate(`FedEx did not return a usable parcel rate for ${parcel.label ?? "a verified carton"}.`);
      packages.push({ label: parcel.label ?? null, amountCents: rate.amountCents, carrier: "FedEx", service: rate.service, transitDays: rate.transitDays } as never);
    }
    const amountCents = packages.reduce((t, p) => t + p.amountCents, 0);
    return { ok: true, amountCents, carrier: "FedEx", service: Array.from(new Set(packages.map((p) => p.service))).join(", ") || undefined, packages };
  } catch (error) {
    return noRate(error instanceof Error ? error.message : "Network error contacting FedEx Rate API.");
  }
}

/** Read-only connection check: only requests an OAuth token. */
export async function fedexTestConnection(c: FedexCredentials, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  if (!c.clientId.trim() || !c.clientSecret.trim()) return { ok: false, error: "Save the FedEx API Key and Secret Key first." };
  try { await fedexAccessToken(c, fetchImpl); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "FedEx connection failed." }; }
}
