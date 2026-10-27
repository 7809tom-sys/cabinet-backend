import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * W-9 tax identifiers (SSN/EIN) are encrypted at rest.
 * Set the environment variable W9_TAX_ID_ENCRYPTION_KEY to a long random secret.
 * The value is hashed into an AES-256-GCM key and is never logged or returned.
 */
export const W9_TAX_ID_ENCRYPTION_KEY_ENV = "W9_TAX_ID_ENCRYPTION_KEY";

const PREFIX = "cabinetdealz:w9tax:v1:";

function encryptionKey(): Buffer {
  const secret = process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV] ?? "";
  if (secret.trim().length < 16) {
    throw new Error(`${W9_TAX_ID_ENCRYPTION_KEY_ENV} is not configured`);
  }
  return createHash("sha256").update(`cabinetdealz:w9-tax-id:v1:${secret}`).digest();
}

export function isEncryptedW9TaxId(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptW9TaxId(digits: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Decrypts a stored envelope. Legacy plaintext is returned only so a backfill can encrypt it. */
export function decryptW9TaxId(value: string): string {
  if (!isEncryptedW9TaxId(value)) return value;
  const [ivValue, tagValue, encryptedValue] = value.slice(PREFIX.length).split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Saved tax ID is malformed");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last four digits for display. Never returns a slice of ciphertext. */
export function w9TaxIdLast4(stored: string | null | undefined, last4Column: string | null | undefined): string | null {
  if (last4Column && /^\d{4}$/.test(last4Column)) return last4Column;
  if (!stored || isEncryptedW9TaxId(stored)) return null;
  const digits = stored.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function maskW9TaxId(last4: string | null | undefined): string | null {
  if (!last4 || !/^\d{4}$/.test(last4)) return null;
  return `***-**-${last4}`;
}
