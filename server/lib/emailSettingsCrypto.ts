import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ENV } from "../_core/env";

const PREFIX = "cabinetdealz:smtp:v1:";

function encryptionKey(): Buffer {
  if (!ENV.cookieSecret) {
    throw new Error("Server encryption key is unavailable");
  }
  return createHash("sha256")
    .update(`${ENV.cookieSecret}:cabinetdealz:email-settings:v1`)
    .digest();
}

export function isEncryptedEmailSettingsPassword(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptEmailSettingsPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/**
 * Accepts legacy plaintext only long enough to allow an administrator to test
 * or replace it. New values are always encrypted before persistence.
 */
export function decryptEmailSettingsPassword(value: string): string {
  if (!isEncryptedEmailSettingsPassword(value)) return value;

  const [ivValue, tagValue, encryptedValue] = value.slice(PREFIX.length).split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Saved SMTP credentials are malformed");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
