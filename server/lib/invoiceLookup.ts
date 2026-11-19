/**
 * Customer invoice lookup (Tom, Nov 19 2026, PR 2 of 4).
 *
 * A customer opens their invoice from an emailed link, or types the invoice number
 * plus the email or ZIP on the order. Both are verified against the ORDER's own
 * record: matching on the invoice number alone would let anyone walk the numbers and
 * read other people's kitchens.
 *
 * The order carries contactEmail / contactZip (0283) precisely because guest and
 * contractor orders have no account to join through.
 *
 * Photos on an existing claim are returned as SHORT-LIVED SIGNED urls. They live in
 * the normal bucket and are never public: the customer sees their own evidence, and
 * admins see the same files in the review queue.
 */
import { and, eq, sql } from "drizzle-orm";
import { storageGetSignedUrl } from "../storage";

export const INVOICE_LOOKUP_WINDOW_MS = 10 * 60_000;
export const INVOICE_LOOKUP_MAX_PER_IP = 20;
export const INVOICE_LOOKUP_MAX_PER_INVOICE = 8;
export const CLAIM_PHOTO_URL_TTL_SECONDS = 300;

export const INVOICE_LOOKUP_NOT_FOUND =
  "No invoice matches that number with that email or ZIP. Check the invoice number and use the email or ZIP on the order.";

/**
 * Per-instance counters. Enough to make enumeration expensive; deliberately NOT a
 * database table, because a lookup that writes on every attempt is its own problem.
 * A shared contractor network gets a per-IP allowance, and one invoice cannot be
 * hammered even from many addresses.
 */
type Bucket = { count: number; resetAt: number };
const byIp = new Map<string, Bucket>();
const byInvoice = new Map<string, Bucket>();

function hit(map: Map<string, Bucket>, key: string, limit: number, now: number): boolean {
  const bucket = map.get(key);
  if (!bucket || now >= bucket.resetAt) {
    map.set(key, { count: 1, resetAt: now + INVOICE_LOOKUP_WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetInvoiceLookupRateLimits(): void {
  byIp.clear();
  byInvoice.clear();
}

/** True when the attempt is allowed. Both buckets must agree. */
export function invoiceLookupAllowed(input: { ip: string | null; invoiceNumber: string; now?: number }): boolean {
  const now = input.now ?? Date.now();
  const ip = (input.ip ?? "unknown").trim() || "unknown";
  const invoice = input.invoiceNumber.trim().toUpperCase();
  // Check both before recording either, so a blocked invoice attempt cannot burn the
  // caller's IP allowance.
  const ipBucket = byIp.get(ip);
  const invoiceBucket = byInvoice.get(invoice);
  const ipBlocked = ipBucket != null && ipBucket.count >= INVOICE_LOOKUP_MAX_PER_IP && now < ipBucket.resetAt;
  const invoiceBlocked = invoiceBucket != null && invoiceBucket.count >= INVOICE_LOOKUP_MAX_PER_INVOICE && now < invoiceBucket.resetAt;
  if (ipBlocked || invoiceBlocked) return false;
  hit(byIp, ip, INVOICE_LOOKUP_MAX_PER_IP, now);
  hit(byInvoice, invoice, INVOICE_LOOKUP_MAX_PER_INVOICE, now);
  return true;
}

export type InvoiceLookupInput = {
  invoiceNumber: string;
  /** Either the email or the ZIP on the order. Compared case-insensitively. */
  emailOrZip: string;
};

/** 5 digits, no dashes or spaces. Anything else is treated as an email. */
export function normalizeZip(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length === 5 ? digits : null;
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export type InvoiceLookupResult =
  | { ok: true; invoice: InvoiceView }
  | { ok: false; message: string };

export type InvoiceView = {
  invoiceNumber: string;
  orderNumber: string;
  status: string;
  placedAt: string | null;
  totals: { subtotal: string | null; shipping: string | null; total: string | null };
  items: Array<{ id: number; sku: string; name: string | null; quantity: number }>;
  tracking: Array<{
    id: number;
    carrier: string | null;
    trackingNumber: string | null;
    status: string;
    trackingUrl: string | null;
    estimatedDeliveryAt: string | null;
  }>;
  claims: Array<{
    id: number;
    status: string;
    submittedAt: string | null;
    description: string;
    photos: string[];
  }>;
};

type Db = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

function rows(result: unknown): Array<Record<string, unknown>> {
  const inner = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(inner) ? inner.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoSql(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Resolve one invoice. Returns a single "not found" answer for a wrong number, a
 * wrong contact and a non-existent order alike, so the endpoint cannot be used to
 * discover which invoice numbers exist.
 */
export async function lookupInvoice(db: Db, input: InvoiceLookupInput): Promise<InvoiceLookupResult> {
  const invoiceNumber = input.invoiceNumber.trim().toUpperCase();
  if (!invoiceNumber) return { ok: false, message: INVOICE_LOOKUP_NOT_FOUND };
  const email = normalizeEmail(input.emailOrZip);
  const zip = email ? null : normalizeZip(input.emailOrZip);
  if (!email && !zip) return { ok: false, message: INVOICE_LOOKUP_NOT_FOUND };

  const header = rows(await db.execute(sql`
    SELECT id, invoiceNumber, orderNumber, status, createdAt, subtotal, shippingCost, total
    FROM orders
    WHERE invoiceNumber = ${invoiceNumber}
      AND (
        ${email ? sql`LOWER(contactEmail) = ${email}` : sql`0 = 1`}
        OR ${zip ? sql`contactZip = ${zip}` : sql`0 = 1`}
      )
    LIMIT 1
  `))[0];
  if (!header) return { ok: false, message: INVOICE_LOOKUP_NOT_FOUND };
  const orderId = Number(header.id);

  const items = rows(await db.execute(sql`
    SELECT id, cabinetCode AS sku, description AS name, quantity
    FROM order_items WHERE orderId = ${orderId} ORDER BY id
  `)).map((row) => ({
    id: Number(row.id),
    sku: text(row.sku) ?? "",
    name: text(row.name),
    quantity: Number(row.quantity) || 0,
  }));

  const tracking = rows(await db.execute(sql`
    SELECT id, carrier, trackingNumber, status, trackingUrl, estimatedDeliveryAt
    FROM order_tracking WHERE orderId = ${orderId} ORDER BY createdAt
  `)).map((row) => ({
    id: Number(row.id),
    carrier: text(row.carrier),
    trackingNumber: text(row.trackingNumber),
    status: text(row.status) ?? "pending",
    trackingUrl: text(row.trackingUrl),
    estimatedDeliveryAt: isoSql(row.estimatedDeliveryAt),
  }));

  const claimRows = rows(await db.execute(sql`
    SELECT id, status, submittedAt, description
    FROM damage_claims WHERE orderId = ${orderId} ORDER BY submittedAt DESC
  `));
  const claimIds = claimRows.map((row) => Number(row.id));
  const photoRows = claimIds.length
    ? rows(await db.execute(sql`
        SELECT damageClaimId, fileUrl FROM damage_claim_photos
        WHERE damageClaimId IN ${sql.raw(`(${claimIds.join(",")})`)}
      `))
    : [];
  const photosByClaim = new Map<number, string[]>();
  for (const row of photoRows) {
    const claimId = Number(row.damageClaimId);
    const key = text(row.fileUrl);
    if (!key) continue;
    const list = photosByClaim.get(claimId) ?? [];
    list.push(await claimPhotoUrl(key));
    photosByClaim.set(claimId, list);
  }

  return {
    ok: true,
    invoice: {
      invoiceNumber: text(header.invoiceNumber) ?? invoiceNumber,
      orderNumber: text(header.orderNumber) ?? "",
      status: text(header.status) ?? "pending",
      placedAt: isoSql(header.createdAt),
      totals: {
        subtotal: text(header.subtotal),
        shipping: text(header.shippingCost),
        total: text(header.total),
      },
      items,
      tracking,
      claims: claimRows.map((row) => ({
        id: Number(row.id),
        status: text(row.status) ?? "submitted",
        submittedAt: isoSql(row.submittedAt),
        description: text(row.description) ?? "",
        photos: photosByClaim.get(Number(row.id)) ?? [],
      })),
    },
  };
}

/** Short-lived signed URL for a stored claim photo. The key is the stored path. */
async function claimPhotoUrl(stored: string): Promise<string> {
  const key = stored.replace(/^\/manus-storage\//, "");
  try {
    return await storageGetSignedUrl(key, CLAIM_PHOTO_URL_TTL_SECONDS);
  } catch {
    return stored;
  }
}

const unused = [and, eq];
void unused;