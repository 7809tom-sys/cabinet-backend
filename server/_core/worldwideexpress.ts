// ─── Worldwide Express (WWEX) — LTL Rate API Client ─────────────────────────
// WWEX supplies account-specific token and rate endpoints through its account
// representatives. Public marketing pages do not publish stable REST hosts, so
// this client never sends credentials to a guessed hostname.

import type { LiveQuoteRequest, LiveQuoteResult } from "./easypost";

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
): Promise<LiveQuoteResult> {
  try {
    if (!creds.clientId.trim() || !creds.clientSecret.trim()) {
      return { ok: false, amountCents: 0, error: "Worldwide Express Client ID and Client Secret are required." };
    }
    const rateUrl = requireWwexHttpsEndpoint(creds.rateUrl, `${creds.environment} rate`);
    const token = await getAccessToken(creds);

    const accessorials: string[] = [];
    if (req.residential) accessorials.push("RESIDENTIAL_DELIVERY");
    if (req.liftgate) accessorials.push("LIFTGATE_DELIVERY");
    if (req.limitedAccess) accessorials.push("LIMITED_ACCESS");

    const payload = {
      ...(creds.accountNumber.trim() ? { accountNumber: creds.accountNumber.trim() } : {}),
      originZip: req.fromZip,
      destinationZip: req.toZip,
      addressType: req.residential ? "RESIDENTIAL" : "COMMERCIAL",
      freightClass: req.freightClass,
      totalWeightLbs: req.pallets.reduce((sum, pallet) => sum + pallet.weightLbs, 0),
      pallets: req.pallets.map((pallet) => ({
        lengthIn: pallet.lengthIn,
        widthIn: pallet.widthIn,
        heightIn: pallet.heightIn,
        weightLbs: pallet.weightLbs,
      })),
      accessorials,
    };

    const res = await fetch(rateUrl, {
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

    const data = await res.json() as {
      rates?: Array<{ carrier?: string; totalCharge?: number; transitDays?: number; service?: string }>;
    };
    const validRates = (data.rates ?? []).filter(
      (rate) => Number.isFinite(rate.totalCharge) && Number(rate.totalCharge) > 0,
    );
    if (validRates.length === 0) {
      return { ok: false, amountCents: 0, error: "No valid rates returned from Worldwide Express." };
    }
    const best = validRates.reduce((a, b) => Number(a.totalCharge) < Number(b.totalCharge) ? a : b);
    return {
      ok: true,
      amountCents: Math.round(Number(best.totalCharge) * 100),
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
