// Storage helpers backed by Supabase Storage.
// Uploads use the server-only service-role key. Stored URLs keep the legacy
// /manus-storage/{key} shape so existing database rows never need rewriting;
// the storage proxy resolves that key to the right Supabase bucket.

import { ENV } from "./_core/env";

export const PUBLIC_BUCKET = "site-media";
export const PRIVATE_BUCKET = "private-files";

// Uploaded quotes, OCR sources, customer photos and vendor documents. Every
// other key (catalog images, logos, room scenes, previews, PDFs) is site media.
const PRIVATE_KEY_PREFIXES = [
  "ocr-uploads/",
  "fixture-uploads/",
  "door-match-uploads/",
  "distributor-catalogs/",
  "vendor-products-source/",
  // Affiliate sales-education files. The public storage proxy refuses this prefix.
  "affiliate-resources/",
];

export function bucketForKey(key: string): string {
  return PRIVATE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    ? PRIVATE_BUCKET
    : PUBLIC_BUCKET;
}

function getSupabaseStorageConfig() {
  const url = ENV.supabaseUrl;
  const serviceKey = ENV.supabaseServiceRoleKey;

  if (!url || !serviceKey) {
    throw new Error(
      "Storage config missing: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return { storageUrl: `${url.replace(/\/+$/, "")}/storage/v1`, serviceKey };
}

function authHeaders(serviceKey: string): Record<string, string> {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/** Encode each path segment, keeping the "/" separators. */
function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/**
 * Upload bytes under an exact key (no hash suffix). Used by storagePut and by
 * the one-time migration that copies legacy files under their original keys.
 */
export async function storageUploadExact(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  options: { upsert?: boolean } = {},
): Promise<void> {
  const { storageUrl, serviceKey } = getSupabaseStorageConfig();
  const normalized = normalizeKey(key);
  const body =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const resp = await fetch(
    `${storageUrl}/object/${bucketForKey(normalized)}/${encodeKeyPath(normalized)}`,
    {
      method: "POST",
      headers: {
        ...authHeaders(serviceKey),
        "Content-Type": contentType,
        "Cache-Control": "max-age=31536000",
        "x-upsert": options.upsert ? "true" : "false",
      },
      body,
    },
  );

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage upload failed (${resp.status}): ${msg}`);
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await storageUploadExact(key, data, contentType);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

/** Short-lived direct URL for server-side reads of a stored object. */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { storageUrl, serviceKey } = getSupabaseStorageConfig();
  const key = normalizeKey(relKey);

  const resp = await fetch(
    `${storageUrl}/object/sign/${bucketForKey(key)}/${encodeKeyPath(key)}`,
    {
      method: "POST",
      headers: { ...authHeaders(serviceKey), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  );

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { signedURL } = (await resp.json()) as { signedURL?: string };
  if (!signedURL) throw new Error("Storage returned an empty signed URL");
  return `${storageUrl}${signedURL.startsWith("/") ? "" : "/"}${signedURL}`;
}

/** Fetch a stored object's bytes with the service-role key (works for both buckets). */
export async function storageFetchObject(relKey: string): Promise<Response> {
  const { storageUrl, serviceKey } = getSupabaseStorageConfig();
  const key = normalizeKey(relKey);
  return fetch(
    `${storageUrl}/object/authenticated/${bucketForKey(key)}/${encodeKeyPath(key)}`,
    { headers: authHeaders(serviceKey) },
  );
}
