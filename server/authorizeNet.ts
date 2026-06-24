// ─── Authorize.Net charge helper ───────────────────────────────────────────────
// Server-side charge against the Authorize.Net JSON transaction API using an
// Accept.js opaque payment nonce (the browser tokenizes the card; raw card data
// NEVER reaches our server). Pure fetch — works on the Node serverless runtime.
//
// Flow: client loads Accept.js with the merchant CLIENT KEY + API LOGIN ID, the
// customer types their card, Accept.js returns { dataDescriptor, dataValue }.
// That opaque pair is posted to our server, which charges it here with the SECRET
// transaction key via an authCaptureTransaction (charge 100% upfront).

const SANDBOX_ENDPOINT = "https://apitest.authorize.net/xml/v1/request.api";
const PRODUCTION_ENDPOINT = "https://api.authorize.net/xml/v1/request.api";

export interface AuthNetCredentials {
  apiLoginId: string;
  transactionKey: string;
  environment: "sandbox" | "production";
}

export interface OpaqueData {
  dataDescriptor: string;
  dataValue: string;
}

export interface ChargeInput {
  amountCents: number;
  opaqueData: OpaqueData;
  invoiceNumber?: string; // e.g. order request number
  description?: string;
  customer?: {
    name?: string;
    email?: string;
  };
}

export interface ChargeResult {
  status: "approved" | "declined" | "error";
  transactionId: string | null;
  authCode: string | null;
  responseCode: string | null; // 1=approved,2=declined,3=error,4=held
  avsResultCode: string | null;
  cardLast4: string | null;
  cardType: string | null;
  message: string;
}

/** Resolve the gateway endpoint for the configured environment. */
export function endpointFor(environment: "sandbox" | "production"): string {
  return environment === "production" ? PRODUCTION_ENDPOINT : SANDBOX_ENDPOINT;
}

/**
 * Charge an Accept.js opaque payment nonce for the full amount (auth + capture).
 * Returns a normalized result; never throws on a declined/error gateway response
 * (those are returned as status "declined"/"error"), only throws on a network /
 * transport failure so the caller can record an "error" payment row.
 */
export async function chargeOpaque(
  creds: AuthNetCredentials,
  input: ChargeInput,
): Promise<ChargeResult> {
  const amount = (Math.max(0, Math.round(input.amountCents)) / 100).toFixed(2);

  // Authorize.Net is order-sensitive about JSON keys; build the exact shape.
  const body = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: creds.apiLoginId,
        transactionKey: creds.transactionKey,
      },
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount,
        payment: {
          opaqueData: {
            dataDescriptor: input.opaqueData.dataDescriptor,
            dataValue: input.opaqueData.dataValue,
          },
        },
        ...(input.invoiceNumber || input.description
          ? {
              order: {
                ...(input.invoiceNumber ? { invoiceNumber: input.invoiceNumber.slice(0, 20) } : {}),
                ...(input.description ? { description: input.description.slice(0, 255) } : {}),
              },
            }
          : {}),
        ...(input.customer?.email
          ? { customer: { email: input.customer.email.slice(0, 255) } }
          : {}),
      },
    },
  };

  const res = await fetch(endpointFor(creds.environment), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Authorize.Net returns JSON but historically prefixes a BOM; strip it.
  const raw = await res.text();
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  let parsed: AuthNetResponse;
  try {
    parsed = JSON.parse(cleaned) as AuthNetResponse;
  } catch {
    return {
      status: "error",
      transactionId: null,
      authCode: null,
      responseCode: null,
      avsResultCode: null,
      cardLast4: null,
      cardType: null,
      message: "Could not parse the payment gateway response.",
    };
  }

  return normalizeResponse(parsed);
}

// ─── Response normalization ────────────────────────────────────────────────────

interface AuthNetResponse {
  transactionResponse?: {
    responseCode?: string; // "1" approved, "2" declined, "3" error, "4" held
    authCode?: string;
    avsResultCode?: string;
    transId?: string;
    accountNumber?: string; // masked, e.g. "XXXX1111"
    accountType?: string; // e.g. "Visa"
    messages?: Array<{ code?: string; description?: string }>;
    errors?: Array<{ errorCode?: string; errorText?: string }>;
  };
  messages?: {
    resultCode?: string; // "Ok" | "Error"
    message?: Array<{ code?: string; text?: string }>;
  };
}

function last4(masked: string | undefined): string | null {
  if (!masked) return null;
  const digits = masked.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function normalizeResponse(parsed: AuthNetResponse): ChargeResult {
  const tr = parsed.transactionResponse;
  const code = tr?.responseCode ?? null;

  if (code === "1") {
    return {
      status: "approved",
      transactionId: tr?.transId ?? null,
      authCode: tr?.authCode ?? null,
      responseCode: code,
      avsResultCode: tr?.avsResultCode ?? null,
      cardLast4: last4(tr?.accountNumber),
      cardType: tr?.accountType ?? null,
      message: tr?.messages?.[0]?.description ?? "Approved.",
    };
  }

  // Declined (2) / held-for-review (4) vs hard error (3 or top-level Error).
  const trError = tr?.errors?.[0]?.errorText;
  const topError = parsed.messages?.message?.[0]?.text;
  const message = trError ?? topError ?? "The payment could not be processed.";

  if (code === "2" || code === "4") {
    return {
      status: "declined",
      transactionId: tr?.transId ?? null,
      authCode: tr?.authCode ?? null,
      responseCode: code,
      avsResultCode: tr?.avsResultCode ?? null,
      cardLast4: last4(tr?.accountNumber),
      cardType: tr?.accountType ?? null,
      message,
    };
  }

  return {
    status: "error",
    transactionId: tr?.transId ?? null,
    authCode: null,
    responseCode: code,
    avsResultCode: tr?.avsResultCode ?? null,
    cardLast4: last4(tr?.accountNumber),
    cardType: tr?.accountType ?? null,
    message,
  };
}
