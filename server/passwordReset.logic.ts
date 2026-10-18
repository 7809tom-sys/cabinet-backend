import { createHash } from "node:crypto";

/** Password-reset links are intentionally short-lived and must be used once. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** Store only a SHA-256 digest; the delivered raw token is never persisted. */
export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetExpiry(now = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
}

export function passwordResetUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}
