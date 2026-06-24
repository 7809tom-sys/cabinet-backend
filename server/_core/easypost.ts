// ─── EasyPost live LTL freight provider ─────────────────────────────────────────
// Thin server-side client that asks EasyPost for a real LTL freight rate for a
// set of pallets. This is the ONLY freight code that touches the network; all the
// pallet/cube/floor math is pure (see shared/liveFreight.ts) and unit-tested.
//
// We use EasyPost's Shipment API with a single parcel per pallet is not ideal for
// LTL, so instead we create ONE shipment carrying the carrier-package list via the
// "carrier_accounts"/freight flow. EasyPost's freight rating returns rate objects
// with a `rate` in dollars; we pick the lowest and convert to cents.
//
// API key: passed in from shippingSettings.liveApiKey (test keys start with EZTK,
// live keys with EZAK). We never log the key.

export interface LivePallet {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
}

export interface LiveQuoteRequest {
  fromZip: string;
  toZip: string;
  pallets: LivePallet[];
  freightClass: string; // e.g. "175"
  residential?: boolean;
}

export interface LiveQuoteResult {
  ok: boolean;
  amountCents: number; // lowest rate found, in cents
  carrier?: string;
  service?: string;
  error?: string;
}

const EASYPOST_BASE = "https://api.easypost.com/v2";

function authHeader(apiKey: string): string {
  // EasyPost uses HTTP Basic with the API key as the username and empty password.
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

// Build the EasyPost shipment payload for an LTL freight shipment. EasyPost models
// freight via a shipment with `freight` parcels (carrier_package). We send each
// pallet as a parcel item with weight in ounces (EasyPost expects ounces).
function buildPayload(req: LiveQuoteRequest) {
  // EasyPost weight is in ounces.
  const totalWeightOz = req.pallets.reduce((s, p) => s + p.weightLbs * 16, 0);
  // For freight, the largest pallet dims represent the handling unit.
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

export async function easypostQuote(
  apiKey: string,
  req: LiveQuoteRequest,
  fetchImpl: typeof fetch = fetch
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
      body: JSON.stringify(buildPayload(req)),
    });

    if (!res.ok) {
      let msg = `EasyPost HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) msg = body.error.message;
      } catch {
        /* ignore parse error */
      }
      return { ok: false, amountCents: 0, error: msg };
    }

    const data = (await res.json()) as {
      rates?: Array<{ rate?: string; carrier?: string; service?: string }>;
    };
    const rates = data.rates ?? [];
    if (!rates.length) {
      return { ok: false, amountCents: 0, error: "No carrier rates returned for this shipment" };
    }

    let best: { cents: number; carrier?: string; service?: string } | null = null;
    for (const r of rates) {
      const dollars = Number(r.rate);
      if (!Number.isFinite(dollars) || dollars <= 0) continue;
      const cents = Math.round(dollars * 100);
      if (!best || cents < best.cents) {
        best = { cents, carrier: r.carrier, service: r.service };
      }
    }
    if (!best) return { ok: false, amountCents: 0, error: "No usable rate amounts returned" };

    return { ok: true, amountCents: best.cents, carrier: best.carrier, service: best.service };
  } catch (err) {
    return {
      ok: false,
      amountCents: 0,
      error: err instanceof Error ? err.message : "Network error contacting EasyPost",
    };
  }
}
