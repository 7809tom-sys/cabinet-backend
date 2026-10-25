import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizeFreightQuoteDeliveryAddress,
  type FreightQuoteDeliveryAddress,
} from "@shared/freightQuoteAddress";

export type FreightQuoteTokenItem = {
  cabinetId?: number | null;
  masterCode?: string | null;
  styleId?: number | null;
  distributorId?: number | null;
  pelicanProductId?: number | null;
  vendorProductId?: number | null;
  qty: number;
};

export type FreightQuoteTokenPayload = {
  totalCents: number;
  merchandiseSubtotalCents: number;
  destinationZip: string;
  /** SHA-256 hash of the normalized complete delivery address; raw address is never stored in this token. */
  destinationAddressHash: string;
  residential: boolean;
  liftgate: boolean;
  /** Distinguishes a normal carrier quote from the Hardware Resources shipment quote. */
  quoteKind?: "freight" | "hardware";
  /** Hardware-only shipping authorization; bundled-free still requires verified kitchen freight at order submission. */
  hardwareShippingMode?: "standalone_profile" | "bundled_free";
  /** Hardware-only, server-resolved vendor profile origin. Never supplied by the browser. */
  originZip?: string;
  /** Hardware Resources profile revision when the token was issued. */
  profileRevision?: number;
  itemsHash: string;
  expiresAt: number;
};

function quoteSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Freight quote signing is unavailable.");
  return secret;
}

export function freightItemsHash(items: FreightQuoteTokenItem[]): string {
  const normalized = items
    .map((item) => ({
      cabinetId: item.cabinetId ?? null,
      masterCode: item.masterCode?.trim().toUpperCase() || null,
      styleId: item.styleId ?? null,
      distributorId: item.distributorId ?? null,
      pelicanProductId: item.pelicanProductId ?? null,
      vendorProductId: item.vendorProductId ?? null,
      qty: Math.max(1, Math.round(item.qty)),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("base64url");
}

export function freightQuoteDestinationAddressHash(address: FreightQuoteDeliveryAddress): string {
  const normalized = normalizeFreightQuoteDeliveryAddress(address);
  if (!normalized) throw new Error("A complete delivery address is required before requesting freight.");
  return createHash("sha256").update(JSON.stringify(normalized)).digest("base64url");
}

export function createFreightQuoteToken(input: Omit<FreightQuoteTokenPayload, "itemsHash" | "expiresAt" | "destinationZip" | "destinationAddressHash"> & {
  deliveryAddress: FreightQuoteDeliveryAddress;
  items: FreightQuoteTokenItem[];
  ttlMs?: number;
}): string {
  const deliveryAddress = normalizeFreightQuoteDeliveryAddress(input.deliveryAddress);
  if (!deliveryAddress) throw new Error("A complete delivery address is required before requesting freight.");
  const payload: FreightQuoteTokenPayload = {
    totalCents: Math.max(0, Math.round(input.totalCents)),
    merchandiseSubtotalCents: Math.max(0, Math.round(input.merchandiseSubtotalCents)),
    destinationZip: deliveryAddress.zip,
    destinationAddressHash: freightQuoteDestinationAddressHash(deliveryAddress),
    residential: input.residential,
    liftgate: input.liftgate,
    ...(input.quoteKind ? { quoteKind: input.quoteKind } : {}),
    ...(input.hardwareShippingMode ? { hardwareShippingMode: input.hardwareShippingMode } : {}),
    ...(input.originZip ? { originZip: input.originZip.trim() } : {}),
    ...(input.profileRevision != null ? { profileRevision: Math.max(0, Math.round(input.profileRevision)) } : {}),
    itemsHash: freightItemsHash(input.items),
    expiresAt: Date.now() + (input.ttlMs ?? 30 * 60 * 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", quoteSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyFreightQuoteToken(token: string): FreightQuoteTokenPayload {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw new Error("Freight quote token is invalid.");
  const expected = createHmac("sha256", quoteSecret()).update(encoded).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    throw new Error("Freight quote token is invalid.");
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Freight quote token is invalid.");
  }
  let payload: FreightQuoteTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Freight quote token is invalid.");
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
    throw new Error("Freight quote has expired. Request a new live shipping quote.");
  }
  return payload;
}
