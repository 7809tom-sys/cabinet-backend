// Pallet photo on ship.
//
// The warehouse photographs the finished pallet before it leaves. The image
// goes into the platform's existing Supabase storage; order_requests only keeps
// the URL plus who uploaded it.
//
// Access is decided here so the procedure, the detail read, and the tests all
// agree: admins anywhere, the routed distributor or an affiliated store on its
// own order, and the customer who placed it. Nobody else can see the photo.

import { eq, sql } from "drizzle-orm";
import { orderRequests } from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { isMissingSchemaError } from "./orderSchemaGuard";

export const PALLET_PHOTO_LOG = "[Pallet Photo]";
export const PALLET_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export type PalletPhotoUploader = {
  id: number;
  role: string;
  distributorId?: number | null;
  approvedVendorLineId?: number | null;
  /** Affiliate ids this user may act for (owner or team member), when known. */
  affiliateIds?: number[] | null;
};

export type PalletPhotoOrderRow = {
  id: number;
  userId?: number | null;
  affiliateId?: number | null;
  distributorId?: number | null;
};

/**
 * Who may attach or read a pallet photo for this order.
 *
 * `distributorId` on a user row is the supplier line the user belongs to; the
 * distributor portal has already resolved linked lines for a multi-line user,
 * so callers pass those as `affiliateIds`-style scopes only where relevant.
 * An affiliate owner/team member may act for any affiliate id they are linked
 * to, which the caller resolves.
 */
export function canAccessOrderPalletPhoto(
  user: PalletPhotoUploader | null | undefined,
  order: PalletPhotoOrderRow,
  opts?: { linkedDistributorIds?: readonly number[]; affiliateIds?: readonly number[] },
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  // The distributor that owns the fulfillment line.
  const linkedDistributorIds = new Set<number>([
    ...(opts?.linkedDistributorIds ?? []),
    ...(user.distributorId != null ? [user.distributorId] : []),
    ...(user.approvedVendorLineId != null ? [user.approvedVendorLineId] : []),
  ]);
  if (order.distributorId != null && linkedDistributorIds.has(order.distributorId)) return true;
  // The store whose storefront took the order, or a team member of it.
  if (order.affiliateId != null) {
    const affiliateIds = new Set<number>([
      ...(opts?.affiliateIds ?? []),
      ...(user.affiliateIds ?? []),
    ]);
    if (affiliateIds.has(order.affiliateId)) return true;
  }
  // The signed-in customer who placed the order.
  if (order.userId != null && user.id === order.userId) return true;
  return false;
}

const DATA_URL = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export type ParsedPalletPhoto = {
  bytes: Buffer;
  contentType: string;
  extension: string;
};

/**
 * Decodes a base64 image data URL, refusing anything that is not a real image
 * of a sane size. `sharp`-free on purpose: the bytes are checked by signature
 * so a mislabeled file cannot be stored as image/jpeg.
 */
export function parsePalletPhotoDataUrl(value: string): ParsedPalletPhoto {
  const match = value.trim().match(DATA_URL);
  if (!match) throw new Error("Upload the pallet photo as a JPEG, PNG, or WebP image.");
  const [, mime, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new Error("The pallet photo was empty.");
  if (bytes.length > PALLET_PHOTO_MAX_BYTES) throw new Error("The pallet photo is too large. Use an image under 8 MB.");
  const detected = sniffImageType(bytes);
  if (!detected) throw new Error("The pallet photo is not a readable JPEG, PNG, or WebP image.");
  const contentType = detected === "jpg" ? "image/jpeg" : `image/${detected}`;
  // Trust the bytes over the declared data-URL type.
  if (mime === "image/jpg" && detected !== "jpg") {
    throw new Error("The pallet photo does not match its declared file type.");
  }
  return { bytes, contentType, extension: detected === "jpg" ? "jpg" : detected };
}

function sniffImageType(bytes: Buffer): "jpg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

/** The storage key for one order's pallet photo. Kept stable per upload id. */
export function palletPhotoKey(orderId: number, extension: string, unique: string): string {
  const safe = unique.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "photo";
  return `order-pallet-photos/${orderId}/${Date.now()}-${safe}.${extension}`;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as Array<Record<string, unknown>>;
    if (first && typeof first === "object") return result as Array<Record<string, unknown>>;
  }
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

export type StoredPalletPhoto = {
  url: string | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
};

const EMPTY_PALLET_PHOTO: StoredPalletPhoto = { url: null, uploadedAt: null, uploadedBy: null };

/** Null when the column is not applied yet; never throws for missing SQL. */
export async function readPalletPhotos(
  db: Pick<Database, "execute">,
  orderIds: number[],
): Promise<Map<number, StoredPalletPhoto>> {
  const map = new Map<number, StoredPalletPhoto>();
  if (orderIds.length === 0) return map;
  const ids = sql.join(orderIds.map((id) => sql`${id}`), sql`, `);
  try {
    const result = await db.execute(sql`
      SELECT id, palletPhotoUrl, palletPhotoUploadedAt, palletPhotoUploadedBy
      FROM order_requests
      WHERE id IN (${ids})
    `);
    for (const row of rowsFrom(result)) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      const uploadedAt = row.palletPhotoUploadedAt;
      map.set(id, {
        url: typeof row.palletPhotoUrl === "string" && row.palletPhotoUrl.trim() ? row.palletPhotoUrl.trim() : null,
        uploadedAt: uploadedAt instanceof Date
          ? (Number.isNaN(uploadedAt.getTime()) ? null : uploadedAt.toISOString())
          : (typeof uploadedAt === "string" && uploadedAt.trim() ? uploadedAt.trim() : null),
        uploadedBy: typeof row.palletPhotoUploadedBy === "string" && row.palletPhotoUploadedBy.trim()
          ? row.palletPhotoUploadedBy.trim()
          : null,
      });
    }
  } catch (error) {
    if (isMissingSchemaError(error)) return map;
    console.error(`${PALLET_PHOTO_LOG} Could not read pallet photos: ${error instanceof Error ? error.message : String(error)}`);
  }
  return map;
}

export async function readPalletPhotoForOrder(
  db: Pick<Database, "execute">,
  orderId: number,
): Promise<StoredPalletPhoto> {
  return (await readPalletPhotos(db, [orderId])).get(orderId) ?? EMPTY_PALLET_PHOTO;
}

export type StorePalletPhotoResult =
  | { ok: true; photo: StoredPalletPhoto }
  | { ok: false; schemaMissing: boolean; message: string };

/**
 * Stores one order's pallet photo and stamps the order row. The image is
 * uploaded first: a failed storage write leaves the previous photo untouched
 * rather than pointing a column at a key that was never written.
 */
export async function storeOrderPalletPhoto(input: {
  orderId: number;
  uploadedBy: string;
  dataUrl: string;
  put?: (key: string, bytes: Buffer, contentType: string) => Promise<{ key: string; url: string }>;
}): Promise<StorePalletPhotoResult> {
  let parsed: ParsedPalletPhoto;
  try {
    parsed = parsePalletPhotoDataUrl(input.dataUrl);
  } catch (error) {
    return { ok: false, schemaMissing: false, message: error instanceof Error ? error.message : String(error) };
  }
  const db = await getDb();
  if (!db) return { ok: false, schemaMissing: false, message: "Database not available" };
  const unique = `${input.orderId}${input.uploadedBy}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) + Math.random().toString(36).slice(2, 8);
  const key = palletPhotoKey(input.orderId, parsed.extension, unique);
  let url: string;
  try {
    const put = input.put ?? storagePut;
    const stored = await put(key, parsed.bytes, parsed.contentType);
    url = stored.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${PALLET_PHOTO_LOG} Storage write failed for order ${input.orderId}: ${message}`);
    return { ok: false, schemaMissing: false, message: "The pallet photo could not be saved to file storage." };
  }
  const uploadedBy = input.uploadedBy.trim().slice(0, 256) || "Unknown";
  try {
    await db.execute(sql`
      UPDATE order_requests
      SET palletPhotoUrl = ${url},
          palletPhotoUploadedAt = CURRENT_TIMESTAMP,
          palletPhotoUploadedBy = ${uploadedBy}
      WHERE id = ${input.orderId}
    `);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      const message = "The order_requests pallet photo columns are missing. Run the pallet photo SQL before uploading a photo.";
      console.error(`${PALLET_PHOTO_LOG} ${message} Order ${input.orderId}.`);
      return { ok: false, schemaMissing: true, message };
    }
    console.error(`${PALLET_PHOTO_LOG} Could not stamp order ${input.orderId}: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, schemaMissing: false, message: "The pallet photo was uploaded but the order could not be updated." };
  }
  const photo = await readPalletPhotoForOrder(db, input.orderId);
  return {
    ok: true,
    photo: photo.url ? photo : { url, uploadedAt: new Date().toISOString(), uploadedBy },
  };
}

/** True when this order row exists, used before an upload attempts storage. */
export async function orderExistsForPalletPhoto(db: Database, orderId: number): Promise<boolean> {
  const [row] = await db.select({ id: orderRequests.id }).from(orderRequests).where(eq(orderRequests.id, orderId)).limit(1);
  return row != null;
}
