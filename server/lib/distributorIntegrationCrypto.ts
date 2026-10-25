import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ENV } from "../_core/env";

const PREFIX = "cabinetdealz:distributor-integration:v1:";

function encryptionKey(): Buffer {
  if (!ENV.cookieSecret) throw new Error("Server encryption key is unavailable");
  return createHash("sha256").update(`${ENV.cookieSecret}:cabinetdealz:distributor-integration:v1`).digest();
}

export function encryptDistributorSecret(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value.trim(), "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function hasDistributorSecret(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function decryptDistributorSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  const [ivValue, tagValue, encryptedValue] = value.slice(PREFIX.length).split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Saved distributor credential is malformed");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
