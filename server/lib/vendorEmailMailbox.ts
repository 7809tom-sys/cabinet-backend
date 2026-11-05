// Per-vendor contact addresses by purpose, inbound routing, and manual forward.
//
// Three things live behind this module:
//
//   1. The four addresses a vendor publishes (claims, support, sales, sales
//      communication), edited by an admin.
//   2. The inbound webhook. A signed message from one of those addresses is
//      stored, tagged with the vendor and the purpose, and queued to the
//      internal inbox configured for that purpose. Nothing is forwarded here.
//   3. The explicit forward. Only an admin clicking Forward sends a message
//      anywhere, and every attempt is recorded.
//
// A message is never auto-forwarded to a customer: there is no customer path in
// this file at all. The only outbound call is forwardVendorInboundEmail, which
// requires an admin actor and a destination the admin typed.

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  distributors,
  vendorEmailAddresses,
  vendorEmailForwards,
  vendorEmailRoutes,
  vendorInboundEmails,
  type VendorEmailAddress,
  type VendorEmailForward,
  type VendorEmailRoute,
  type VendorInboundEmail,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sendEmail } from "../email";
import { isMissingSchemaError, schemaErrorMessage } from "./orderSchemaGuard";
import {
  VENDOR_EMAIL_PURPOSES,
  bareAddress,
  headerValue,
  matchInboundRecipient,
  normalizeEmailAddress,
  recipientAddresses,
  type VendorEmailPurpose,
  type VendorAddressRow as VendorEmailRowSource,
} from "@shared/vendorEmailPurpose";

export const VENDOR_MAIL_LOG = "[Vendor Mail]";

export const VENDOR_MAIL_SCHEMA_MESSAGE =
  "The vendor email tables are missing. Run the vendor email SQL before using vendor mail.";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type VendorEmailAddressSet = Record<VendorEmailPurpose, string>;

export const EMPTY_VENDOR_ADDRESSES: VendorEmailAddressSet = {
  claims: "",
  support: "",
  sales: "",
  sales_communication: "",
};

export function addressesFromRows(rows: readonly Pick<VendorEmailAddress, "purpose" | "address">[]): VendorEmailAddressSet {
  const out: VendorEmailAddressSet = { ...EMPTY_VENDOR_ADDRESSES };
  for (const row of rows) out[row.purpose] = row.address;
  return out;
}

/** Vendor + the four addresses + the internal route for each purpose. */
export async function loadVendorEmailDirectory(db: Database): Promise<Array<{
  distributorId: number;
  vendorName: string;
  addresses: VendorEmailAddressSet;
}>> {
  const [vendors, addressRows] = await Promise.all([
    db.select({ id: distributors.id, name: distributors.name, brandName: distributors.brandName }).from(distributors),
    db.select().from(vendorEmailAddresses),
  ]);
  const byVendor = new Map<number, VendorEmailAddress[]>();
  for (const row of addressRows) {
    const list = byVendor.get(row.distributorId) ?? [];
    list.push(row);
    byVendor.set(row.distributorId, list);
  }
  return vendors.map((vendor) => ({
    distributorId: vendor.id,
    vendorName: vendor.brandName?.trim() || vendor.name,
    addresses: addressesFromRows(byVendor.get(vendor.id) ?? []),
  }));
}

export async function loadRoutes(db: Database): Promise<Record<VendorEmailPurpose, VendorEmailRoute | null>> {
  const rows = await db.select().from(vendorEmailRoutes);
  const out: Record<VendorEmailPurpose, VendorEmailRoute | null> = {
    claims: null,
    support: null,
    sales: null,
    sales_communication: null,
  };
  for (const row of rows) out[row.purpose] = row;
  return out;
}

/**
 * Saves the four addresses for one vendor in a single round trip.
 *
 * A blank value deletes that purpose's row instead of storing "". Upserting on
 * (distributorId, purpose) keeps a re-save idempotent. Two purposes may not
 * share an address: a shared inbox would make every inbound message ambiguous.
 */
export async function saveVendorEmailAddresses(
  db: Database,
  distributorId: number,
  input: Partial<Record<VendorEmailPurpose, string | null | undefined>>,
): Promise<{ ok: true; addresses: VendorEmailAddressSet } | { ok: false; message: string }> {
  const current = addressesFromRows(
    await db.select().from(vendorEmailAddresses).where(eq(vendorEmailAddresses.distributorId, distributorId)),
  );
  const next: VendorEmailAddressSet = { ...current };
  for (const purpose of VENDOR_EMAIL_PURPOSES) {
    if (!(purpose in input)) continue;
    const raw = input[purpose];
    if (raw == null || !String(raw).trim()) {
      next[purpose] = "";
      continue;
    }
    const normalized = normalizeEmailAddress(raw);
    if (!normalized) return { ok: false, message: `${purpose} is not a usable email address.` };
    next[purpose] = normalized;
  }
  const seen = new Map<string, VendorEmailPurpose>();
  for (const purpose of VENDOR_EMAIL_PURPOSES) {
    const address = next[purpose];
    if (!address) continue;
    const previous = seen.get(address);
    if (previous) {
      return { ok: false, message: `${previous} and ${purpose} cannot share the same address. Each purpose needs its own inbox.` };
    }
    seen.set(address, purpose);
  }
  for (const purpose of VENDOR_EMAIL_PURPOSES) {
    if (!(purpose in input)) continue;
    if (!next[purpose]) {
      await db.delete(vendorEmailAddresses).where(and(
        eq(vendorEmailAddresses.distributorId, distributorId),
        eq(vendorEmailAddresses.purpose, purpose),
      ));
      continue;
    }
    await db.insert(vendorEmailAddresses)
      .values({ distributorId, purpose, address: next[purpose] })
      .onDuplicateKeyUpdate({ set: { address: next[purpose] } });
  }
  return { ok: true, addresses: next };
}

/**
 * Saves the internal recipient for one purpose. An empty address clears it,
 * which leaves inbound mail for that purpose in the unassigned queue.
 */
export async function saveVendorEmailRoute(
  db: Database,
  purpose: VendorEmailPurpose,
  input: { recipientEmail?: string | null; recipientName?: string | null; assigneeUserId?: number | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const recipientEmail = input.recipientEmail == null || !String(input.recipientEmail).trim()
    ? ""
    : normalizeEmailAddress(input.recipientEmail);
  if (recipientEmail === null) return { ok: false, message: "The routing address is not a usable email address." };
  const recipientName = (input.recipientName ?? "").trim().slice(0, 128);
  await db.insert(vendorEmailRoutes)
    .values({
      purpose,
      recipientEmail,
      recipientName,
      assigneeUserId: input.assigneeUserId ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        recipientEmail,
        recipientName,
        assigneeUserId: input.assigneeUserId ?? null,
      },
    });
  return { ok: true };
}

export type InboundPayload = {
  id: string;
  from: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  receivedAt: Date;
};

/**
 * Reads a Resend-style inbound payload. Header shapes differ between providers,
 * so the From/To/Cc headers are the fallback when top-level fields are absent.
 */
export function parseInboundPayload(body: unknown, fallbackId?: string | null): InboundPayload | null {
  if (body == null || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const data = (record.data != null && typeof record.data === "object" ? record.data : record) as Record<string, unknown>;
  const headers = data.headers ?? record.headers;
  const id = String(record.id ?? record.email_id ?? data.id ?? fallbackId ?? "").trim();
  const fromHeader = headerValue(headers, "from");
  const from = bareAddress(typeof data.from === "string" ? data.from : fromHeader);
  if (!id || !from) return null;
  const to = recipientAddresses([
    data.to,
    headerValue(headers, "to"),
  ]);
  const cc = recipientAddresses([
    data.cc,
    headerValue(headers, "cc"),
  ]);
  const subject = String(data.subject ?? headerValue(headers, "subject") ?? "").slice(0, 512);
  const receivedRaw = data.created_at ?? data.createdAt ?? record.created_at ?? headerValue(headers, "date");
  const receivedAt = receivedRaw ? new Date(String(receivedRaw)) : new Date();
  const fromNamePart = fromHeader ? fromHeader.replace(/<[^>]*>/, "").replace(/"/g, "").trim() : "";
  return {
    id: id.slice(0, 256),
    from,
    fromName: fromNamePart ? fromNamePart.slice(0, 256) : null,
    to,
    cc,
    subject,
    text: typeof data.text === "string" ? data.text : null,
    html: typeof data.html === "string" ? data.html : null,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
  };
}

export type IngestResult =
  | { ok: true; id: number; duplicate: boolean; distributorId: number | null; purpose: VendorEmailPurpose | null; routedToEmail: string | null }
  | { ok: false; message: string; schemaMissing?: boolean };

/**
 * Stores one inbound message.
 *
 * The first configured address that matches decides the vendor and purpose; a
 * message that matches nothing is still stored (so nothing is silently lost)
 * with an unassigned vendor and purpose, and it stays in the unassigned queue.
 *
 * There is no forward here. `routedToEmail` is an internal inbox only.
 */
export async function ingestInboundVendorEmail(db: Database, payload: InboundPayload): Promise<IngestResult> {
  const existing = await db.select({ id: vendorInboundEmails.id })
    .from(vendorInboundEmails)
    .where(eq(vendorInboundEmails.providerMessageId, payload.id))
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: true,
      id: existing[0].id,
      duplicate: true,
      distributorId: null,
      purpose: null,
      routedToEmail: null,
    };
  }
  const addressRows = await db.select({
    distributorId: vendorEmailAddresses.distributorId,
    purpose: vendorEmailAddresses.purpose,
    address: vendorEmailAddresses.address,
  }).from(vendorEmailAddresses);
  const match = matchInboundRecipient(payload.to, addressRows as VendorEmailRowSource[]);
  const matchRow = match
    ? addressRows.find((row) => row.distributorId === match.distributorId && row.purpose === match.purpose) ?? null
    : null;
  let routedToEmail: string | null = null;
  let routedToUserId: number | null = null;
  if (match) {
    const [route] = await db.select().from(vendorEmailRoutes)
      .where(eq(vendorEmailRoutes.purpose, match.purpose))
      .limit(1);
    routedToEmail = route?.recipientEmail?.trim() || null;
    routedToUserId = route?.assigneeUserId ?? null;
  }
  try {
    const result = await db.insert(vendorInboundEmails).values({
      providerMessageId: payload.id,
      distributorId: match?.distributorId ?? null,
      purpose: match?.purpose ?? null,
      matchedAddress: matchRow?.address ?? null,
      fromEmail: payload.from,
      fromName: payload.fromName ?? null,
      toEmails: payload.to.join(", ").slice(0, 1024) || null,
      ccEmails: (payload.cc ?? []).join(", ").slice(0, 1024) || null,
      subject: payload.subject,
      textBody: payload.text ?? null,
      htmlBody: payload.html ?? null,
      routedToEmail,
      routedToUserId,
      status: "received",
      receivedAt: payload.receivedAt,
    });
    const inserted = result as unknown as [{ insertId?: number }];
    const id = Number(inserted?.[0]?.insertId ?? 0);
    console.log(`${VENDOR_MAIL_LOG} Stored inbound ${payload.id} from ${payload.from} (vendor ${match?.distributorId ?? "unmatched"}, ${match?.purpose ?? "unmatched"}).`);
    return {
      ok: true,
      id,
      duplicate: false,
      distributorId: match?.distributorId ?? null,
      purpose: match?.purpose ?? null,
      routedToEmail,
    };
  } catch (error) {
    if (isMissingSchemaError(error)) return { ok: false, message: VENDOR_MAIL_SCHEMA_MESSAGE, schemaMissing: true };
    // A concurrent delivery of the same provider id loses the unique race. That
    // is a duplicate, not a failure.
    const message = schemaErrorMessage(error);
    if (/duplicate|ER_DUP_ENTRY/i.test(message)) {
      const [row] = await db.select({ id: vendorInboundEmails.id })
        .from(vendorInboundEmails)
        .where(eq(vendorInboundEmails.providerMessageId, payload.id))
        .limit(1);
      if (row) {
        return { ok: true, id: row.id, duplicate: true, distributorId: null, purpose: null, routedToEmail: null };
      }
    }
    console.error(`${VENDOR_MAIL_LOG} Could not store inbound ${payload.id}: ${message}`);
    return { ok: false, message };
  }
}

export type VendorInboxListItem = {
  id: number;
  distributorId: number | null;
  vendorName: string | null;
  purpose: VendorEmailPurpose | null;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  status: VendorInboundEmail["status"];
  routedToEmail: string | null;
  receivedAt: Date;
};

/** The internal inbox: newest first, optionally narrowed by vendor/purpose/status. */
export async function listVendorInboundEmails(
  db: Database,
  filter?: { distributorId?: number | null; purpose?: VendorEmailPurpose | null; status?: VendorInboundEmail["status"] | null; limit?: number },
): Promise<VendorInboxListItem[]> {
  const conditions = [];
  if (filter?.distributorId != null) conditions.push(eq(vendorInboundEmails.distributorId, filter.distributorId));
  if (filter?.purpose != null) conditions.push(eq(vendorInboundEmails.purpose, filter.purpose));
  if (filter?.status != null) conditions.push(eq(vendorInboundEmails.status, filter.status));
  const query = db.select({
    id: vendorInboundEmails.id,
    distributorId: vendorInboundEmails.distributorId,
    purpose: vendorInboundEmails.purpose,
    fromEmail: vendorInboundEmails.fromEmail,
    fromName: vendorInboundEmails.fromName,
    subject: vendorInboundEmails.subject,
    status: vendorInboundEmails.status,
    routedToEmail: vendorInboundEmails.routedToEmail,
    receivedAt: vendorInboundEmails.receivedAt,
  }).from(vendorInboundEmails);
  const narrowed = conditions.length > 0 ? query.where(and(...conditions)) : query;
  const rows = await narrowed.orderBy(desc(vendorInboundEmails.receivedAt)).limit(Math.min(Math.max(filter?.limit ?? 100, 1), 500));
  const vendorIds = Array.from(new Set(rows.map((row) => row.distributorId).filter((id): id is number => id != null)));
  const vendors = vendorIds.length > 0
    ? await db.select({ id: distributors.id, name: distributors.name, brandName: distributors.brandName }).from(distributors).where(inArray(distributors.id, vendorIds))
    : [];
  const nameById = new Map(vendors.map((vendor) => [vendor.id, vendor.brandName?.trim() || vendor.name]));
  return rows.map((row) => ({
    ...row,
    vendorName: row.distributorId == null ? null : (nameById.get(row.distributorId) ?? null),
  }));
}

export async function getVendorInboundEmail(db: Database, id: number): Promise<{
  message: VendorInboundEmail;
  vendorName: string | null;
  forwards: VendorEmailForward[];
} | null> {
  const [message] = await db.select().from(vendorInboundEmails).where(eq(vendorInboundEmails.id, id)).limit(1);
  if (!message) return null;
  const [vendor] = message.distributorId == null
    ? []
    : await db.select({ name: distributors.name, brandName: distributors.brandName }).from(distributors).where(eq(distributors.id, message.distributorId)).limit(1);
  const forwards = await db.select().from(vendorEmailForwards)
    .where(eq(vendorEmailForwards.inboundEmailId, id))
    .orderBy(desc(vendorEmailForwards.createdAt));
  return {
    message,
    vendorName: vendor ? (vendor.brandName?.trim() || vendor.name) : null,
    forwards,
  };
}

export type ForwardResult =
  | { ok: true; to: string[]; transport?: string; from?: string }
  | { ok: false; message: string };

/**
 * The ONLY outbound path for vendor mail. An admin supplies the destination;
 * nothing is derived from the message and nothing goes to a customer
 * automatically. Every attempt, successful or not, is recorded.
 */
export async function forwardVendorInboundEmail(input: {
  db: Database;
  message: VendorInboundEmail;
  to: string[];
  note?: string | null;
  actor: { id: number; name: string | null };
  send?: typeof sendEmail;
}): Promise<ForwardResult> {
  const to = Array.from(new Set(
    input.to
      .flatMap((value) => String(value).split(/[,;]+/))
      .map((value) => normalizeEmailAddress(value))
      .filter((value): value is string => value != null),
  ));
  if (to.length === 0) return { ok: false, message: "Enter at least one destination email address." };
  const note = (input.note ?? "").trim();
  const subject = input.message.subject?.trim() ? `Fwd: ${input.message.subject.trim()}` : "Fwd: vendor message";
  const header = [
    "---------- Forwarded message ----------",
    `From: ${input.message.fromName ? `${input.message.fromName} <${input.message.fromEmail}>` : input.message.fromEmail}`,
    input.message.toEmails ? `To: ${input.message.toEmails}` : null,
    input.message.ccEmails ? `Cc: ${input.message.ccEmails}` : null,
    `Subject: ${input.message.subject || "(no subject)"}`,
    `Received: ${input.message.receivedAt.toISOString()}`,
  ].filter((line): line is string => line != null).join("\n");
  const body = input.message.textBody?.trim() || stripHtml(input.message.htmlBody) || "(This message had no text body.)";
  const text = [note, header, "", body].filter((part) => part !== "").join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#1a2b4a">
    ${note ? `<p>${escapeHtml(note).replace(/\n/g, "<br>")}</p>` : ""}
    <p style="color:#5a6b85;font-size:12px">---------- Forwarded message ----------<br>
    <strong>From:</strong> ${escapeHtml(input.message.fromEmail)}<br>
    ${input.message.toEmails ? `<strong>To:</strong> ${escapeHtml(input.message.toEmails)}<br>` : ""}
    <strong>Subject:</strong> ${escapeHtml(input.message.subject || "(no subject)")}<br>
    <strong>Received:</strong> ${escapeHtml(input.message.receivedAt.toISOString())}</p>
    ${input.message.htmlBody?.trim() || `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(body)}</pre>`}
  </div>`;

  const sent = await (input.send ?? sendEmail)({
    to: to.join(", "),
    subject,
    text,
    html,
    replyTo: input.message.fromEmail,
  });
  const status: VendorEmailForward["status"] = sent.success ? "sent" : "failed";
  const error = sent.success ? null : (sent.error ?? "The email provider rejected the message.").slice(0, 1024);
  try {
    await input.db.insert(vendorEmailForwards).values({
      inboundEmailId: input.message.id,
      toEmails: to.join(", ").slice(0, 1024),
      note: note ? note.slice(0, 1024) : null,
      sentByUserId: input.actor.id,
      sentByName: input.actor.name?.slice(0, 256) ?? null,
      status,
      error,
      fromEmail: sent.from ?? null,
    });
    if (sent.success) {
      await input.db.update(vendorInboundEmails).set({
        status: "forwarded",
        forwardedAt: new Date(),
        forwardedTo: to.join(", ").slice(0, 1024),
        forwardedByUserId: input.actor.id,
      }).where(eq(vendorInboundEmails.id, input.message.id));
    }
  } catch (errorDuringLog) {
    console.error(`${VENDOR_MAIL_LOG} Forward of ${input.message.id} finished ${status} but was not recorded: ${schemaErrorMessage(errorDuringLog)}`);
  }
  if (!sent.success) {
    console.error(`${VENDOR_MAIL_LOG} Forward of ${input.message.id} failed: ${error}`);
    return { ok: false, message: sent.notConfigured ? "Email is not configured, so the message was not forwarded." : (error ?? "Forward failed.") };
  }
  return { ok: true, to, transport: sent.transport, from: sent.from };
}

/** Messages with no vendor or purpose yet, for the unassigned queue. */
export async function countUnassignedVendorEmails(db: Database): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(vendorInboundEmails)
    .where(and(isNull(vendorInboundEmails.distributorId), eq(vendorInboundEmails.status, "received")));
  return Number(row?.count ?? 0);
}

function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
