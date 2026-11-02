// Resolves the mailbox that customer mail leaves from for one affiliate.
//
// An affiliate is a separate business entity. When it has its own SMTP mailbox
// saved and switched on, quotes, invoices, design links, and follow-ups are
// delivered through that mailbox so the customer sees the affiliate's address.
// Otherwise the platform sender is used exactly as before.
//
// Cabinet Dealz must still see every invoice that the platform helps collect,
// so an invoice send always adds a BCC copy to the affiliate's invoice-copy
// address, which defaults to the Cabinet Dealz admin address.

import { eq } from "drizzle-orm";
import { affiliateEmailSettings } from "../../drizzle/schema";
import {
  affiliateSenderFromAddress,
  invoiceCopyRecipient,
  resolveSmtpSecure,
} from "@shared/affiliateSender";
import { getDb } from "../db";
import {
  resendConfigured,
  sendEmail,
  verifyAffiliateSmtp,
  type AffiliateSmtpSender,
  type EmailAttachment,
  type SendEmailResult,
} from "../email";
import { decryptEmailSettingsPassword } from "./emailSettingsCrypto";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Cabinet Dealz receives a copy of every invoice sent through the platform.
 * An explicit value is used verbatim; a blank value falls back to this address.
 */
export function platformInvoiceCopyAddress(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CABINETDEALZ_ADMIN_EMAIL || env.ORDER_NOTIFY_EMAIL || "").trim();
}

/**
 * True when the shared platform sender can deliver. Used only to describe the
 * fallback in the setup screen; a configured affiliate mailbox does not need it.
 */
export function isPlatformSenderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resendConfigured(env);
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export type AffiliateSenderRecord = {
  affiliateId: number;
  provider: string;
  contactEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  fromName: string;
  replyTo: string;
  signatureHtml: string;
  enabled: boolean;
  invoiceCopyEmail: string;
} | null;

export async function loadAffiliateSenderRecord(
  db: Database,
  affiliateId: number | null | undefined,
): Promise<AffiliateSenderRecord> {
  if (affiliateId == null) return null;
  const [row] = await db
    .select()
    .from(affiliateEmailSettings)
    .where(eq(affiliateEmailSettings.affiliateId, affiliateId))
    .limit(1);
  if (!row) return null;
  return {
    affiliateId: row.affiliateId,
    provider: row.provider,
    contactEmail: row.contactEmail ?? "",
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecure: row.smtpSecure,
    smtpUser: row.smtpUser,
    smtpPass: row.smtpPass,
    smtpFrom: row.smtpFrom,
    fromName: row.fromName,
    replyTo: row.replyTo ?? "",
    signatureHtml: row.signatureHtml ?? "",
    enabled: row.enabled,
    invoiceCopyEmail: row.invoiceCopyEmail ?? "",
  };
}

/**
 * Decrypts the saved app password into a live transport. Returns null when the
 * row is disabled or incomplete, which makes the caller fall back to the
 * platform sender. A malformed envelope is logged and treated as unconfigured
 * rather than failing a customer's invoice.
 */
export function senderFromRecord(
  record: AffiliateSenderRecord,
): AffiliateSmtpSender | null {
  if (!record || !record.enabled) return null;
  const from = affiliateSenderFromAddress(record);
  if (!record.smtpHost.trim() || !record.smtpUser.trim() || !from) return null;
  if (!record.smtpPass.trim()) return null;
  let pass: string;
  try {
    pass = decryptEmailSettingsPassword(record.smtpPass);
  } catch (error) {
    console.error(
      "[AffiliateEmail] Saved sender password could not be decrypted; falling back to the platform sender.",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
  if (!pass) return null;
  return {
    host: record.smtpHost.trim(),
    port: record.smtpPort,
    secure: resolveSmtpSecure(record.smtpPort, record.smtpSecure),
    user: record.smtpUser.trim(),
    pass,
    from,
    fromName: record.fromName,
  };
}

export async function loadAffiliateSender(
  db: Database,
  affiliateId: number | null | undefined,
): Promise<AffiliateSmtpSender | null> {
  return senderFromRecord(await loadAffiliateSenderRecord(db, affiliateId));
}

export type AffiliateDeliveryInput = {
  affiliateId: number | null | undefined;
  to: string;
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Invoices get a Cabinet Dealz copy on BCC. */
  invoice?: boolean;
};

export type AffiliateDeliveryResult = SendEmailResult & {
  /** True when the affiliate's own mailbox carried the message. */
  viaAffiliate: boolean;
  /** The address that received the invoice copy, when one was added. */
  invoiceCopyTo: string | null;
};

/**
 * Deliver one customer-facing message for an affiliate.
 *
 * The affiliate sender wins; anything short of a complete, enabled row uses the
 * shared platform sender. Invoice copies are added here so every invoice path
 * (CRM invoice PDF, order receipt) copies Cabinet Dealz without each caller
 * remembering to do it.
 *
 * `prepared` lets the caller reuse the row it already resolved, so the From the
 * caller reported and the mailbox that actually delivered cannot disagree.
 */
export async function sendAffiliateCustomerEmail(
  db: Database,
  input: AffiliateDeliveryInput,
  env: NodeJS.ProcessEnv = process.env,
  prepared?: { record: AffiliateSenderRecord; sender: AffiliateSmtpSender | null },
): Promise<AffiliateDeliveryResult> {
  const record = prepared
    ? prepared.record
    : await loadAffiliateSenderRecord(db, input.affiliateId);
  const sender = prepared ? prepared.sender : senderFromRecord(record);
  const invoiceCopyTo = input.invoice
    ? invoiceCopyRecord(record, env)
    : null;
  const bcc = mergeBcc(input.bcc, input.to, invoiceCopyTo);
  const result = await sendEmail({
    to: input.to,
    cc: input.cc,
    bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo ?? sender?.from,
    attachments: input.attachments,
    sender,
  });
  return { ...result, viaAffiliate: result.transport === "affiliate_smtp", invoiceCopyTo };
}

/** The invoice copy address for one already-loaded row. */
export function invoiceCopyRecord(
  record: AffiliateSenderRecord,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return invoiceCopyRecipient(record, platformInvoiceCopyAddress(env));
}

function mergeBcc(
  existing: string | string[] | undefined,
  to: string,
  copyTo: string | null,
): string | string[] | undefined {
  const list = (Array.isArray(existing) ? existing : existing ? [existing] : [])
    .flatMap((value) => String(value).split(/[,;]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const copy = (copyTo ?? "").trim();
  if (!copy) return list.length > 0 ? list : undefined;
  if (copy.toLowerCase() === to.trim().toLowerCase()) return list.length > 0 ? list : undefined;
  if (!list.some((value) => value.toLowerCase() === copy.toLowerCase())) list.push(copy);
  return list.length > 0 ? list : undefined;
}

/**
 * Verify the saved mailbox and send one test message to the affiliate's own
 * address. A failure returns the provider's exact text so the owner can see
 * "Invalid login" or a host/port error rather than a generic message.
 */
export async function sendAffiliateTestEmail(
  db: Database,
  affiliateId: number,
  testTo: string,
): Promise<{ ok: true; from: string; to: string } | { ok: false; error: string; from: string | null }> {
  const record = await loadAffiliateSenderRecord(db, affiliateId);
  const sender = senderFromRecord(record);
  if (!sender) {
    return {
      ok: false,
      from: null,
      error: "This affiliate mailbox is not configured and enabled yet. Save the SMTP settings first.",
    };
  }
  const verified = await verifyAffiliateSmtp(sender);
  if (!verified.ok) return { ok: false, error: verified.error, from: sender.from };
  const result = await sendEmail({
    to: testTo,
    subject: "Outbound email test",
    text: `This is a test message from your saved outbound mailbox. Customer quotes, invoices, and follow-ups will be sent from ${sender.from}.`,
    html: `<p>This is a test message from your saved outbound mailbox.</p><p>Customer quotes, invoices, and follow-ups will be sent from <strong>${escapeHtml(sender.from)}</strong>.</p>`,
    sender,
  });
  if (!result.success) {
    return { ok: false, error: result.error ?? "The test message was not accepted.", from: sender.from };
  }
  return { ok: true, from: sender.from, to: testTo };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
