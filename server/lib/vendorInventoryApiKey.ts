import { createHash, randomBytes } from "node:crypto";

export function generateInventoryApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `vif_${randomBytes(24).toString("hex")}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashInventoryApiKey(raw) };
}

export function hashInventoryApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
