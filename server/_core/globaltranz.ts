// ─── GlobalTranz — LTL Rate API Client ──────────────────────────────────────
// API key + Basic auth (username, password, security key)
// Docs: https://www.globaltranz.com/technology/integration-services/
// Rate endpoint: POST https://api.globaltranz.com/v2/rates
//
// Credentials required (from Admin → Shipping → GlobalTranz):
//   gtzApiKey, gtzUsername, gtzPassword, gtzAccountNumber, gtzEnvironment

import type { LiveQuoteRequest, LiveQuoteResult } from "./easypost";

const PROD_BASE = "https://api.globaltranz.com";
const SANDBOX_BASE = "https://api-sandbox.globaltranz.com";

interface GTZCreds {
  apiKey: string;
  username: string;
  password: string;
  accountNumber: string;
  environment: "sandbox" | "production";
}

export async function globaltranzQuote(
  creds: GTZCreds,
  req: LiveQuoteRequest,
): Promise<LiveQuoteResult> {
  try {
    const base = creds.environment === "production" ? PROD_BASE : SANDBOX_BASE;

    const accessorials: string[] = [];
    if (req.residential) accessorials.push("RESIDENTIAL");
    if (req.liftgate) accessorials.push("LIFTGATE");
    if (req.limitedAccess) accessorials.push("LIMITED_ACCESS");

    const totalWeightLbs = req.pallets.reduce((s, p) => s + p.weightLbs, 0);
    const payload = {
      username: creds.username,
      password: creds.password,
      securityKey: creds.apiKey,
      accountNumber: creds.accountNumber,
      originZip: req.fromZip,
      destinationZip: req.toZip,
      addressType: req.residential ? "RESIDENTIAL" : "COMMERCIAL",
      freightClass: req.freightClass,
      totalWeightLbs,
      pallets: req.pallets.map((p) => ({
        lengthIn: p.lengthIn,
        widthIn: p.widthIn,
        heightIn: p.heightIn,
        weightLbs: p.weightLbs,
      })),
      accessorials,
    };

    // GlobalTranz uses Basic auth with API key as the Authorization header value.
    const authHeader = "Basic " + Buffer.from(`${creds.username}:${creds.password}`).toString("base64");

    const res = await fetch(`${base}/v2/rates`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "X-API-Key": creds.apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, amountCents: 0, error: `GlobalTranz rate error (${res.status}): ${text.slice(0, 200)}` };
    }

    const data = await res.json() as {
      rates?: Array<{ carrier?: string; totalCharge?: number; transitDays?: number; service?: string }>;
      rateQuotes?: Array<{ carrierName?: string; totalCharges?: number; transitDays?: number; serviceLevel?: string }>;
    };

    // Support both response shapes (GTZconnect v1 and v2).
    const rates = (data.rates ?? data.rateQuotes ?? []).map((r: Record<string, unknown>) => ({
      carrier: (r.carrier ?? r.carrierName) as string | undefined,
      totalCharge: Number(r.totalCharge ?? r.totalCharges ?? 0),
      service: (r.service ?? r.serviceLevel) as string | undefined,
      transitDays: Number(r.transitDays ?? 0),
    }));

    if (rates.length === 0) return { ok: false, amountCents: 0, error: "No rates returned from GlobalTranz." };

    const best = rates.reduce((a, b) => a.totalCharge < b.totalCharge ? a : b);
    return {
      ok: true,
      amountCents: Math.round(best.totalCharge * 100),
      carrier: best.carrier,
      service: best.service,
      transitDays: Number.isInteger(best.transitDays) && best.transitDays > 0 ? best.transitDays : undefined,
    };
  } catch (err) {
    return { ok: false, amountCents: 0, error: err instanceof Error ? err.message : "GlobalTranz request failed." };
  }
}
