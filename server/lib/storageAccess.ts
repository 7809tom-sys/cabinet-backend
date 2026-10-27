import { eq, or } from "drizzle-orm";
import { affiliates } from "../../drizzle/schema";
import { getDb } from "../db";
import { PRIVATE_BUCKET, PUBLIC_BUCKET, bucketForKey } from "../storage";

export type StorageActor = {
  id: number;
  role: string;
  email: string | null;
  distributorId: number | null;
};

export function isPrivateStorageKey(key: string): boolean {
  return bucketForKey(key) === PRIVATE_BUCKET;
}

export function isPublicStorageKey(key: string): boolean {
  return bucketForKey(key) === PUBLIC_BUCKET;
}

/**
 * Unauthenticated reads are limited to public key prefixes. Private keys need
 * an admin, the encoded owner, or the affiliate who uploaded the government ID.
 */
export function privateStorageDecision(key: string, user: StorageActor | null): "public" | "allow" | "deny" | "owner-check" {
  const normalized = key.replace(/^\/+/, "");
  if (!isPrivateStorageKey(normalized)) return "public";
  if (!user) return "deny";
  if (user.role === "admin") return "allow";
  const uploadedBy = /^(?:ocr-uploads|fixture-uploads)\/u(\d+)-/.exec(normalized);
  if (uploadedBy && Number(uploadedBy[1]) === user.id) return "allow";
  const distributorFile = /^(?:distributor-catalogs|vendor-products-source)\/(\d+)\//.exec(normalized);
  if (distributorFile && user.role === "distributor" && user.distributorId === Number(distributorFile[1])) return "allow";
  if (normalized.startsWith("affiliate-w9-id/")) return "owner-check";
  return "deny";
}

export function storageKeyFromStoredUrl(value: string): string {
  const trimmed = value.trim();
  const marker = "/manus-storage/";
  const index = trimmed.indexOf(marker);
  const raw = index >= 0 ? trimmed.slice(index + marker.length).split("?")[0] : trimmed.replace(/^\/+/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function affiliateOwnerCanReadW9Key(user: StorageActor, key: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const variants = [key, `/manus-storage/${key}`];
  const rows = await db
    .select({ userId: affiliates.userId, email: affiliates.email })
    .from(affiliates)
    .where(or(...variants.map((value) => eq(affiliates.w9IdDocumentUrl, value))))
    .limit(5);
  const email = (user.email ?? "").toLowerCase();
  return rows.some((row) => row.userId === user.id || (email.length > 0 && (row.email ?? "").toLowerCase() === email));
}

export async function canReadStorageKey(key: string, user: StorageActor | null): Promise<boolean> {
  const decision = privateStorageDecision(key, user);
  if (decision === "public" || decision === "allow") return true;
  if (decision === "owner-check" && user) return affiliateOwnerCanReadW9Key(user, key.replace(/^\/+/, ""));
  return false;
}
