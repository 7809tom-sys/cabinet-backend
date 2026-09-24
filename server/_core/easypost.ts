import type { NormalizedParcelPackage, ParcelCarrier } from "../../shared/parcelEligibility";

// ─── EasyPost live freight and parcel provider ──────────────────────────────────
//
// The application separates two truthfully different rating paths:
// - `easypostQuote` sends LTL pallet data and is used for freight shipments.
// - `easypostParcelQuote` sends one verified carton at a time and is used only
//   after the shared carrier-rule gate accepts every carton as a parcel.
//
// Both functions return only live carrier rates; no price is estimated here.
// API key: passed in from shippingSettings.liveApiKey (test keys start with EZTK,
// live keys with EZAK). We never log the key.

export interface LivePallet {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
}

/**
 * One normalized carton for a parcel-carrier rate request. These are the exact
 * whole-inch and whole-pound values already evaluated by the carrier screen.
 */
export type LiveParcel = Pick<NormalizedParcelPackage, "lengthIn" | "widthIn" | "heightIn" | "weightLbs"> & {
  label?: string | null;
};

export interface LiveQuoteAddress {
  locality: string;
  region: string;
  countryCode: "US";
  /** Optional verified lines used only by carriers that require a street envelope. */
  addressLineList?: string[];
}

export interface LiveQuoteRequest {
  fromZip: string;
  toZip: string;
  pallets: LivePallet[];
  freightClass: string; // e.g. "175"
  residential?: boolean;
  liftgate?: boolean;
  limitedAccess?: boolean;
  /** Carrier-specific providers can use verified ZIP-derived city/state data. */
  fromAddress?: LiveQuoteAddress;
  toAddress?: LiveQuoteAddress;
}

export interface LiveParcelQuoteRequest {
  fromZip: string;
  toZip: string;
  parcels: LiveParcel[];
  /** Intersection of carrier envelopes that accepted every normalized carton. */
  eligibleCarriers: ParcelCarrier[];
  residential?: boolean;
}

export interface LiveQuoteResult {
  ok: boolean;
  amountCents: number; // lowest rate found, in cents
  carrier?: string;
  service?: string;
  /** Carrier-reported transit time after shipment pickup. */
  transitDays?: number;
  /** Carrier-reported estimated arrival date in YYYY-MM-DD form, when supplied. */
  estimatedDeliveryDate?: string;
  error?: string;
  /** Remaining provider throttle time, when a carrier explicitly rate-limits a quote request. */
  retryAfterMs?: number;
}

export interface LiveParcelQuoteResult extends LiveQuoteResult {
  /** Actual carrier/service chosen separately for every carton. */
  packages: Array<{
    label: string | null;
    carrier: string;
    service: string;
    amountCents: number;
    transitDays?: number;
    estimatedDeliveryDate?: string;
  }>;
}

const EASYPOST_BASE = "https://api.easypost.com/v2";

function authHeader(apiKey: string): string {
  // EasyPost uses HTTP Basic with the API key as the username and empty password.
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

// Build the EasyPost shipment payload for an LTL freight shipment. EasyPost models
// freight via a shipment with `freight` parcels (carrier_package). We send each
// pallet as a parcel item with weight in ounces (EasyPost expects ounces).
function buildFreightPayload(req: LiveQuoteRequest) {
  const totalWeightOz = req.pallets.reduce((s, p) => s + p.weightLbs * 16, 0);
  const first = req.pallets[0];
  return {
    shipment: {
      to_address: { zip: req.toZip, country: "US", residential: !!req.residential },
      from_address: { zip: req.fromZip, country: "US" },
      parcel: {
        length: first.lengthIn,
        width: first.widthIn,
        height: first.heightIn,
        weight: totalWeightOz,
      },
      options: {
        freight_class: req.freightClass,
        handling_units: req.pallets.length,
      },
    },
  };
}

function buildParcelPayload(req: Pick<LiveParcelQuoteRequest, "fromZip" | "toZip" | "residential">, parcel: LiveParcel) {
  return {
    shipment: {
      to_address: { zip: req.toZip, country: "US", residential: !!req.residential },
      from_address: { zip: req.fromZip, country: "US" },
      parcel: {
        length: parcel.lengthIn,
        width: parcel.widthIn,
        height: parcel.heightIn,
        // EasyPost parcel weight is ounces; the catalog continues to store lbs.
        weight: parcel.weightLbs * 16,
      },
    },
  };
}

function supportedParcelCarrierKey(carrier: string | undefined): ParcelCarrier | null {
  const normalized = (carrier ?? "").toLowerCase();
  if (normalized.includes("ups")) return "ups";
  if (normalized.includes("fedex")) return "fedex";
  if (normalized.includes("usps")) return "usps";
  return null;
}

function isEligibleParcelCarrier(carrier: string | undefined, eligibleCarriers: ParcelCarrier[]): boolean {
  const key = supportedParcelCarrierKey(carrier);
  return key != null && eligibleCarriers.includes(key);
}

function parcelCarrierLabel(carrier: ParcelCarrier): string {
  if (carrier === "fedex") return "FedEx";
  if (carrier === "usps") return "USPS";
  return "UPS";
}

function formatParcelCarrierLabels(carriers: ParcelCarrier[]): string {
  const labels = carriers.map(parcelCarrierLabel);
  if (labels.length < 2) return labels[0] ?? "approved";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

function isNormalizedParcel(parcel: LiveParcel): boolean {
  return [parcel.lengthIn, parcel.widthIn, parcel.heightIn, parcel.weightLbs]
    .every((value) => Number.isInteger(value) && value > 0);
}

function noParcelRate(error: string): LiveParcelQuoteResult {
  return { ok: false, amountCents: 0, error, packages: [] };
}

function parseProviderError(status: number, body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" && message.trim() ? message : `EasyPost HTTP ${status}`;
}

export async function easypostQuote(
  apiKey: string,
  req: LiveQuoteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveQuoteResult> {
  if (!apiKey) return { ok: false, amountCents: 0, error: "Missing API key" };
  if (!req.fromZip) return { ok: false, amountCents: 0, error: "Missing origin ZIP" };
  if (!req.toZip) return { ok: false, amountCents: 0, error: "Missing destination ZIP" };
  if (!req.pallets.length) return { ok: false, amountCents: 0, error: "No pallets to quote" };

  try {
    const res = await fetchImpl(`${EASYPOST_BASE}/shipments`, {
      method: "POST",
      headers: {
        Authorization: authHeader(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildFreightPayload(req)),
    });

    if (!res.ok) {
      let body: unknown = null;
      try { body = await res.json(); } catch { /* retain status */ }
      return { ok: false, amountCents: 0, error: parseProviderError(res.status, body) };
    }

    const data = (await res.json()) as {
      rates?: Array<{
        rate?: string;
        carrier?: string;
        service?: string;
        delivery_days?: number;
        delivery_date?: string;
      }>;
    };
    const rates = data.rates ?? [];
    if (!rates.length) {
      return { ok: false, amountCents: 0, error: "No carrier rates returned for this shipment" };
    }

    let best: {
      cents: number;
      carrier?: string;
      service?: string;
      transitDays?: number;
      estimatedDeliveryDate?: string;
    } | null = null;
    for (const r of rates) {
      const dollars = Number(r.rate);
      if (!Number.isFinite(dollars) || dollars <= 0) continue;
      const cents = Math.round(dollars * 100);
      if (!best || cents < best.cents) {
        best = {
          cents,
          carrier: r.carrier,
          service: r.service,
          transitDays: Number.isInteger(r.delivery_days) && (r.delivery_days ?? 0) > 0 ? r.delivery_days : undefined,
          estimatedDeliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(r.delivery_date ?? "") ? r.delivery_date : undefined,
        };
      }
    }
    if (!best) return { ok: false, amountCents: 0, error: "No usable rate amounts returned" };

    return {
      ok: true,
      amountCents: best.cents,
      carrier: best.carrier,
      service: best.service,
      transitDays: best.transitDays,
      estimatedDeliveryDate: best.estimatedDeliveryDate,
    };
  } catch (err) {
    return {
      ok: false,
      amountCents: 0,
      error: err instanceof Error ? err.message : "Network error contacting EasyPost",
    };
  }
}

/**
 * Rate each verified carton with EasyPost and sum the actual selected rates.
 * EasyPost returns parcel weights in ounces and dimensions in inches; carrier
 * filtering is intentionally limited to UPS, FedEx, and USPS.
 */
export async function easypostParcelQuote(
  apiKey: string,
  req: LiveParcelQuoteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveParcelQuoteResult> {
  if (!apiKey) return noParcelRate("Missing API key");
  if (!req.fromZip) return noParcelRate("Missing origin ZIP");
  if (!req.toZip) return noParcelRate("Missing destination ZIP");
  if (!req.parcels.length) return noParcelRate("No verified parcels to quote");
  if (!req.eligibleCarriers.length) return noParcelRate("No carrier passed the verified parcel eligibility screen.");
  if (req.parcels.some((parcel) => !isNormalizedParcel(parcel))) {
    return noParcelRate("Parcel quotes require the positive whole-inch and whole-pound carton values approved by the parcel eligibility screen.");
  }

  const packages: LiveParcelQuoteResult["packages"] = [];
  try {
    // Rate one carton at a time so we do not invent a multi-box consolidation or
    // use a carrier service that applies only to another carton in the shipment.
    for (const parcel of req.parcels) {
      const res = await fetchImpl(`${EASYPOST_BASE}/shipments`, {
        method: "POST",
        headers: {
          Authorization: authHeader(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildParcelPayload(req, parcel)),
      });
      if (!res.ok) {
        let body: unknown = null;
        try { body = await res.json(); } catch { /* retain status */ }
        return noParcelRate(parseProviderError(res.status, body));
      }

      const data = (await res.json()) as {
        rates?: Array<{
          rate?: string;
          carrier?: string;
          service?: string;
          delivery_days?: number;
          delivery_date?: string;
        }>;
      };
      const candidates = (data.rates ?? [])
        .filter((rate) => isEligibleParcelCarrier(rate.carrier, req.eligibleCarriers))
        .map((rate) => ({
          amountCents: Math.round(Number(rate.rate) * 100),
          carrier: rate.carrier ?? "",
          service: rate.service ?? "",
          transitDays: Number.isInteger(rate.delivery_days) && (rate.delivery_days ?? 0) > 0 ? rate.delivery_days : undefined,
          estimatedDeliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(rate.delivery_date ?? "") ? rate.delivery_date : undefined,
        }))
        .filter((rate) => Number.isFinite(rate.amountCents) && rate.amountCents > 0)
        .sort((a, b) => a.amountCents - b.amountCents);
      const best = candidates[0];
      if (!best) {
        const carrierNames = formatParcelCarrierLabels(req.eligibleCarriers);
        return noParcelRate(`No live ${carrierNames} parcel rate returned for ${parcel.label ?? "a carton"}`);
      }
      packages.push({ label: parcel.label ?? null, ...best });
    }
  } catch (error) {
    return noParcelRate(error instanceof Error ? error.message : "Network error contacting EasyPost");
  }

  const amountCents = packages.reduce((sum, entry) => sum + entry.amountCents, 0);
  const carrier = Array.from(new Set(packages.map((entry) => entry.carrier))).join(", ");
  const service = Array.from(new Set(packages.map((entry) => entry.service))).join(", ");
  const transitDays = packages.reduce<number | undefined>((max, entry) =>
    entry.transitDays != null ? Math.max(max ?? 0, entry.transitDays) : max,
  undefined);
  const estimatedDeliveryDate = packages
    .map((entry) => entry.estimatedDeliveryDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);

  return {
    ok: true,
    amountCents,
    carrier: carrier || undefined,
    service: service || undefined,
    transitDays,
    estimatedDeliveryDate,
    packages,
  };
}
