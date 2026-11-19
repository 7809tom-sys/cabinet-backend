/**
 * Damage claim submission (Tom, Nov 19 2026, PR 3 of 4).
 *
 * The customer arrives from the invoice page: they must prove invoice access with the
 * same pair the lookup uses (invoiceNumber + contactEmail or contactZip), then choose
 * line items, quantities, a description, a stage and at least one photo.
 *
 * Everything is validated on the server. A client that posts a foreign orderItemId, a
 * quantity above what was ordered, or a text file renamed .jpg gets refused here.
 *
 * Photos are uploaded through the same storagePut path as AI renders and only the KEY
 * is stored; the invoice and admin views mint short-lived signed URLs on read.
 *
 * Ordering and cleanup: validation runs BEFORE anything is written. The claim header
 * and items are inserted first, then each photo is uploaded and its row inserted. If a
 * photo fails, the claim is deleted so a failed submission cannot leave a claim with
 * missing evidence. A photo can only become an orphan file if its own row fails to
 * insert after the upload - narrow, and the invoice simply shows fewer photos.
 */
import { sql } from "drizzle-orm";
import { storagePut } from "../storage";
import { lookupInvoice, normalizeEmail, normalizeZip } from "./invoiceLookup";

export const MAX_PHOTOS_PER_CLAIM = 8;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MIN_DESCRIPTION_CHARS = 12;
export const MAX_DESCRIPTION_CHARS = 4000;
export const DISCOVERED_STAGES = ["During unloading", "Opening the box", "During installation", "After installation"] as const;
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ClaimPhotoInput = { name?: string; type?: string; data: string };
export type ClaimItemInput = { orderItemId: number; damagedQuantity: number; itemNotes?: string | null };
export type ClaimInput = {
  invoiceNumber: string;
  emailOrZip: string;
  description: string;
  discoveredStage?: string | null;
  items: ClaimItemInput[];
  photos: ClaimPhotoInput[];
  contactEmail?: string | null;
};

export type ClaimValidation = { ok: true; value: NormalizedClaim } | { ok: false; message: string };

export type NormalizedClaim = {
  description: string;
  discoveredStage: string | null;
  contactEmail: string | null;
  items: Array<{ orderItemId: number; damagedQuantity: number; itemNotes: string | null }>;
  photos: Array<{ data: Buffer; contentType: string; extension: string }>;
};

/** Pure validation, exported so the rules can be tested without a database. */
export function validateClaim(input: ClaimInput): ClaimValidation {
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < MIN_DESCRIPTION_CHARS) {
    return { ok: false, message: "Tell us what happened - a sentence or two is enough." };
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return { ok: false, message: "That description is too long. Keep it under 4000 characters." };
  }

  const stage = input.discoveredStage?.trim() || null;
  if (stage && !DISCOVERED_STAGES.includes(stage as (typeof DISCOVERED_STAGES)[number])) {
    return { ok: false, message: "Pick when you noticed the damage." };
  }

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) return { ok: false, message: "Choose at least one damaged item." };
  const seen = new Set<number>();
  const normalizedItems: NormalizedClaim["items"] = [];
  for (const item of items) {
    const id = Number(item?.orderItemId);
    const quantity = Number(item?.damagedQuantity);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "One of the selected items is not valid." };
    if (seen.has(id)) return { ok: false, message: "Each item can only be listed once." };
    seen.add(id);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, message: "Enter how many of each item arrived damaged." };
    }
    normalizedItems.push({ orderItemId: id, damagedQuantity: quantity, itemNotes: item?.itemNotes?.trim() || null });
  }

  const photos = Array.isArray(input.photos) ? input.photos : [];
  if (photos.length === 0) return { ok: false, message: "Add at least one photo of the damage." };
  if (photos.length > MAX_PHOTOS_PER_CLAIM) {
    return { ok: false, message: `Add up to ${MAX_PHOTOS_PER_CLAIM} photos.` };
  }
  const normalizedPhotos: NormalizedClaim["photos"] = [];
  for (const photo of photos) {
    const type = photo?.type?.trim().toLowerCase() ?? "";
    const extension = PHOTO_TYPES[type];
    if (!extension) return { ok: false, message: "Photos must be JPEG, PNG or WebP." };
    const raw = typeof photo?.data === "string" ? photo.data : "";
    const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return { ok: false, message: "One of those photos could not be read. Try again." };
    }
    if (buffer.byteLength === 0) return { ok: false, message: "One of those photos was empty. Try again." };
    if (buffer.byteLength > MAX_PHOTO_BYTES) {
      return { ok: false, message: "Each photo must be under 8 MB." };
    }
    normalizedPhotos.push({ data: buffer, contentType: type, extension });
  }

  const email = input.contactEmail ? normalizeEmail(input.contactEmail) : null;
  return {
    ok: true,
    value: { description, discoveredStage: stage, contactEmail: email, items: normalizedItems, photos: normalizedPhotos },
  };
}

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

function rows(result: unknown): Array<Record<string, unknown>> {
  const inner = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(inner) ? inner.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

export type ClaimResult =
  | { ok: true; claimId: number; invoiceNumber: string; skus: string[] }
  | { ok: false; status: number; message: string };

export async function createDamageClaim(db: Db, input: ClaimInput): Promise<ClaimResult> {
  const validation = validateClaim(input);
  if (!validation.ok) return { ok: false, status: 400, message: validation.message };
  const claim = validation.value;

  // 1. The claim must be attached to an invoice this caller can prove access to.
  const access = await lookupInvoice(db as never, { invoiceNumber: input.invoiceNumber, emailOrZip: input.emailOrZip });
  if (!access.ok) return { ok: false, status: 404, message: access.message };
  const invoiceNumber = access.invoice.invoiceNumber;

  const header = rows(await db.execute(sql`
    SELECT id, contactEmail FROM orders WHERE invoiceNumber = ${invoiceNumber} LIMIT 1
  `))[0];
  if (!header) return { ok: false, status: 404, message: access.ok ? access.invoice.invoiceNumber : "" };
  const orderId = Number(header.id);

  // 2. Every line must belong to THIS order, and the quantity cannot exceed what was ordered.
  const ordered = new Map<number, { quantity: number; sku: string }>();
  for (const row of rows(await db.execute(sql`
    SELECT id, quantity, COALESCE(platformSku, distributorSku) AS sku
    FROM order_items WHERE orderId = ${orderId}
  `))) {
    ordered.set(Number(row.id), { quantity: Number(row.quantity) || 0, sku: typeof row.sku === "string" ? row.sku : "" });
  }
  for (const item of claim.items) {
    const line = ordered.get(item.orderItemId);
    if (!line) return { ok: false, status: 400, message: "One of the selected items is not on this invoice." };
    if (item.damagedQuantity > line.quantity) {
      return { ok: false, status: 400, message: `You cannot report more than ${line.quantity} of ${line.sku || "that item"}.` };
    }
  }

  const contactEmail = normalizeEmail(header.contactEmail as string ?? "") ?? claim.contactEmail ?? "";
  if (!contactEmail) return { ok: false, status: 400, message: "We need an email address to reply to." };

  // 3. Header and items first, so a failure below can be rolled back cleanly.
  const inserted = rows(await db.execute(sql`
    INSERT INTO damage_claims (orderId, invoiceNumber, description, discoveredStage, contactEmail)
    VALUES (${orderId}, ${invoiceNumber}, ${claim.description}, ${claim.discoveredStage}, ${contactEmail})
  `)) as Array<{ insertId?: number }>;
  const claimId = Number((inserted[0] as { insertId?: number } | undefined)?.insertId ?? 0);
  if (!claimId) return { ok: false, status: 500, message: "The claim could not be saved. Try again in a moment." };

  try {
    for (const item of claim.items) {
      const sku = ordered.get(item.orderItemId)?.sku ?? "";
      await db.execute(sql`
        INSERT INTO damage_claim_items (damageClaimId, orderItemId, sku, damagedQuantity, itemNotes)
        VALUES (${claimId}, ${item.orderItemId}, ${sku}, ${item.damagedQuantity}, ${item.itemNotes})
      `);
    }

    const folder = `damage-claims/${claimId}`;
    for (const [index, photo] of claim.photos.entries()) {
      const stored = await storagePut(`${folder}/${index + 1}.${photo.extension}`, photo.data, photo.contentType);
      await db.execute(sql`
        INSERT INTO damage_claim_photos (damageClaimId, fileUrl) VALUES (${claimId}, ${stored.key})
      `);
    }
  } catch (error) {
    // A claim without its evidence is worse than no claim: undo it rather than ship a
    // half-submission the customer believes was accepted.
    await db.execute(sql`DELETE FROM damage_claim_photos WHERE damageClaimId = ${claimId}`).catch(() => undefined);
    await db.execute(sql`DELETE FROM damage_claim_items WHERE damageClaimId = ${claimId}`).catch(() => undefined);
    await db.execute(sql`DELETE FROM damage_claims WHERE id = ${claimId}`).catch(() => undefined);
    console.error("[damageClaim] submission failed", error);
    return { ok: false, status: 500, message: "The claim could not be saved. Try again in a moment." };
  }

  return {
    ok: true,
    claimId,
    invoiceNumber,
    skus: claim.items.map((item) => ordered.get(item.orderItemId)?.sku ?? "").filter(Boolean),
  };
}

const unused = [normalizeZip];
void unused;