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
  "affiliate-w9-id/",
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

/** Short-lived direct URL for an authorized reader. Default lifetime is 15 minutes. */
export async function storageGetSignedUrl(relKey: string, expiresInSeconds = 900): Promise<string> {
  const { storageUrl, serviceKey } = getSupabaseStorageConfig();
  const key = normalizeKey(relKey);
  const expiresIn = Math.min(Math.max(Math.floor(expiresInSeconds), 60), 3600);

  const resp = await fetch(
    `${storageUrl}/object/sign/${bucketForKey(key)}/${encodeKeyPath(key)}`,
    {
      method: "POST",
      headers: { ...authHeaders(serviceKey), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
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

function objectUrl(storageUrl: string, bucket: string, key: string, kind: "read" | "delete" | "write"): string {
  const normalized = normalizeKey(key);
  if (kind === "read") return `${storageUrl}/object/authenticated/${bucket}/${encodeKeyPath(normalized)}`;
  return `${storageUrl}/object/${bucket}/${encodeKeyPath(normalized)}`;
}

async function storageRequest(bucket: string, key: string, method: "GET" | "DELETE"): Promise<Response> {
  const { storageUrl, serviceKey } = getSupabaseStorageConfig();
  return fetch(objectUrl(storageUrl, bucket, key, method === "GET" ? "read" : "delete"), {
    method,
    headers: authHeaders(serviceKey),
  });
}

export async function storageObjectExistsInBucket(bucket: string, key: string): Promise<boolean> {
  const resp = await storageRequest(bucket, key, "GET");
  if (resp.body) await resp.body.cancel().catch(() => undefined);
  return resp.ok;
}

/** Copy one object between buckets without changing its key. Idempotent when the destination already exists. */
export async function storageCopyBetweenBuckets(key: string, fromBucket: string, toBucket: string): Promise<"copied" | "already-present" | "missing"> {
  const normalized = normalizeKey(key);
  if (await storageObjectExistsInBucket(toBucket, normalized)) return "already-present";
  const source = await storageRequest(fromBucket, normalized, "GET");
  if (source.status === 400 || source.status === 404) return "missing";
  if (!source.ok) {
    const msg = await source.text().catch(() => source.statusText);
    throw new Error(`Storage copy read failed (${source.status}): ${msg}`);
  }
  const bytes = Buffer.from(await source.arrayBuffer());
  const contentType = source.headers.get("content-type") || "application/octet-stream";
  const { storageUrl, serviceKey } = getSupabaseStorageConfig();
  const resp = await fetch(objectUrl(storageUrl, toBucket, normalized, "write"), {
    method: "POST",
    headers: {
      ...authHeaders(serviceKey),
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage copy write failed (${resp.status}): ${msg}`);
  }
  return "copied";
}

export async function storageDeleteFromBucket(bucket: string, key: string): Promise<void> {
  const resp = await storageRequest(bucket, key, "DELETE");
  if (resp.status === 404 || resp.status === 400) return;
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage delete failed (${resp.status}): ${msg}`);
  }
}
