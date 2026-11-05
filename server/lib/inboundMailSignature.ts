// Signature verification for the inbound vendor-mail webhook.
//
// Follows the Svix/Resend scheme: the provider signs `${id}.${timestamp}.${raw
// body}` with the endpoint's signing secret and sends
//
//   svix-id: msg_...
//   svix-timestamp: 1712345678
//   svix-signature: v1,<base64 hmac-sha256>[,v1,<another>]
//
// The secret is base64 with a `whsec_` prefix. Verification is the only thing
// that admits a message, so this module is pure (crypto + timing-safe compare)
// and unit-testable without a network or a database.
//
// The secret is read from VENDOR_INBOUND_WEBHOOK_SECRET. Nothing here prints or
// returns it.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Default tolerance for a replayed timestamp, in seconds. */
export const INBOUND_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type InboundSignatureFailure =
  | "missing_secret"
  | "missing_headers"
  | "malformed_secret"
  | "bad_signature"
  | "timestamp_out_of_tolerance";

export type InboundSignatureResult =
  | { ok: true }
  | { ok: false; reason: InboundSignatureFailure };

function secretKey(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  try {
    const key = Buffer.from(withoutPrefix, "base64");
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Verifies one inbound request.
 *
 * A missing secret fails closed: an unconfigured endpoint accepts nothing
 * rather than trusting every caller. The timestamp check rejects a replay
 * outside the tolerance window.
 */
export function verifyInboundSignature(input: {
  secret: string | null | undefined;
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  body: Buffer | string | null | undefined;
  now?: number;
  toleranceSeconds?: number;
}): InboundSignatureResult {
  const secret = (input.secret ?? "").trim();
  if (!secret) return { ok: false, reason: "missing_secret" };
  const key = secretKey(secret);
  if (!key) return { ok: false, reason: "malformed_secret" };
  const id = (input.id ?? "").trim();
  const timestamp = (input.timestamp ?? "").trim();
  const signature = (input.signature ?? "").trim();
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "missing_headers" };
  const tolerance = input.toleranceSeconds ?? INBOUND_SIGNATURE_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - sentAt) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };

  const body = typeof input.body === "string" ? input.body : input.body ?? Buffer.alloc(0);
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.`)
    .update(body)
    .digest("base64");

  // The header may carry several space-separated `v1,<sig>` pairs; any match
  // with a v1 signature is enough.
  let matched = false;
  for (const candidate of signature.split(/\s+/)) {
    const [version, value] = candidate.split(",", 2);
    if (version !== "v1" || !value) continue;
    const left = Buffer.from(value, "base64");
    const right = Buffer.from(expected, "base64");
    if (left.length === right.length && timingSafeEqual(left, right)) {
      matched = true;
      break;
    }
  }
  return matched ? { ok: true } : { ok: false, reason: "bad_signature" };
}

/** Signs a payload the way the provider would. Test and setup helper only. */
export function signInboundPayload(input: {
  secret: string;
  id: string;
  timestamp: string;
  body: Buffer | string;
}): string {
  const key = secretKey(input.secret);
  if (!key) throw new Error("Signing secret is not a usable base64 whsec_ value.");
  const body = typeof input.body === "string" ? input.body : input.body;
  const digest = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.`)
    .update(body)
    .digest("base64");
  return `v1,${digest}`;
}
