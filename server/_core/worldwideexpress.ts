// ─── Worldwide Express (WWEX) — LTL Rate API Client ─────────────────────────
// OAuth2 client_credentials (new API) or API key (legacy SpeedShip)
// Docs: https://www.wwex.com/technology/speedship
// Rate endpoint: POST https://api.wwex.com/v1/rates
//
// Credentials required (from Admin → Shipping → Worldwide Express):
//   wwexClientId, wwexClientSecret, wwexAccountNumber, wwexEnvironment
//   (legacy: wwexUsername, wwexPassword)

import type { LiveQuoteRequest, LiveQuoteResult } from "./easypost";

const PROD_BASE = "https://api.wwex.com";
const SANDBOX_BASE = "https://api-sandbox.wwex.com";

interface WWEXCreds {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  username?: string;
  password?: string;
  environment: "sandbox" | "production";
}

// Token cache per credentials.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(creds: WWEXCreds): Promise<string> {
  const cacheKey = `${creds.clientId}:${creds.environment}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 30_000) return cached.token;

  const base = creds.environment === "production" ? PROD_BASE : SANDBOX_BASE;
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Worldwide Express auth failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

export async function worldwideexpressQuote(
  creds: WWEXCreds,
  req: LiveQuoteRequest,
): Promise<LiveQuoteResult> {
  try {
    const base = creds.environment === "production" ? PROD_BASE : SANDBOX_BASE;
    const token = await getAccessToken(creds);

    const accessorials: string[] = [];
    if (req.residential) accessorials.push("RESIDENTIAL_DELIVERY");
    if (req.liftgate) accessorials.push("LIFTGATE_DELIVERY");
    if (req.limitedAccess) accessorials.push("LIMITED_ACCESS");

    const totalWeightLbs = req.pallets.reduce((s, p) => s + p.weightLbs, 0);
    const payload = {
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

    const res = await fetch(`${base}/v1/rates`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, amountCents: 0, error: `Worldwide Express rate error (${res.status}): ${text.slice(0, 200)}` };
    }

    const data = await res.json() as {
      rates?: Array<{ carrier?: string; totalCharge?: number; transitDays?: number; service?: string }>;
    };

    const rates = data.rates ?? [];
    if (rates.length === 0) return { ok: false, amountCents: 0, error: "No rates returned from Worldwide Express." };

    const best = rates.reduce((a, b) => (a.totalCharge ?? Infinity) < (b.totalCharge ?? Infinity) ? a : b);
    return {
      ok: true,
      amountCents: Math.round((best.totalCharge ?? 0) * 100),
      carrier: best.carrier,
      service: best.service,
    };
  } catch (err) {
    return { ok: false, amountCents: 0, error: err instanceof Error ? err.message : "Worldwide Express request failed." };
  }
}

