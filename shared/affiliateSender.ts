// Per-affiliate outbound sender rules shared by the server and the client.
//
// Each affiliate (a contractor or distributor storefront) is a separate legal
// entity, so customer mail — quotes, invoices, design links, follow-ups — must
// leave from that affiliate's own mailbox. This module holds only pure
// decisions: whether a saved sender is usable, which address it sends from,
// and where the platform owner's invoice copy goes. The stored SMTP password
// is an opaque encrypted envelope and is never part of a public shape.

export const AFFILIATE_SMTP_DEFAULT_PORT = 587;

/** Yahoo is the reference provider for the reported First Class mailbox. */
export const AFFILIATE_SMTP_DEFAULT_HOST = "smtp.mail.yahoo.com";

export type AffiliateSenderConfig = {
  /** The affiliate's own customer-facing address. Also the test-email recipient. */
  contactEmail: string;
  smtpHost: string;
  smtpPort: number;
  /** true for implicit TLS (465), false for STARTTLS (587). */
  smtpSecure: boolean;
  smtpUser: string;
  /** Encrypted envelope at rest. Never returned by a procedure. */
  smtpPass: string;
  smtpFrom: string;
  fromName: string;
  enabled: boolean;
};

/** A saved row may carry blank columns as null; both shapes are accepted. */
export type AffiliateSenderInput =
  | Partial<{ [K in keyof AffiliateSenderConfig]: AffiliateSenderConfig[K] | null }>
  | null
  | undefined;

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUsableSenderEmail(value: string | null | undefined): boolean {
  const email = clean(value);
  return email.length > 0 && email.length <= 320 && EMAIL_PATTERN.test(email);
}

/**
 * The From address the customer sees. The affiliate's own contact address wins
 * so a leftover provider-from cannot silently send as a different mailbox.
 */
export function affiliateSenderFromAddress(config: AffiliateSenderInput): string {
  if (!config) return "";
  return clean(config.contactEmail) || clean(config.smtpFrom) || clean(config.smtpUser);
}

/** From header, `"Store" <address>`, with header-breaking characters removed. */
export function formatAffiliateFrom(name: string | null | undefined, address: string): string {
  const email = clean(address);
  const display = (name ?? "").replace(/[\r\n"<>,;]/g, "").trim();
  if (!safeHeaderValue(email) || !display) return email;
  return `"${display}" <${email}>`;
}

function safeHeaderValue(value: string): boolean {
  return value.length > 0 && !/[\r\n]/.test(value);
}

/**
 * A sender is usable only when the affiliate switched it on AND every field the
 * SMTP handshake needs is present. A partial row must fall back to the platform
 * sender instead of failing a customer's invoice.
 */
export function affiliateSenderReady(config: AffiliateSenderInput): boolean {
  if (!config || !config.enabled) return false;
  const host = clean(config.smtpHost);
  const user = clean(config.smtpUser);
  const port = Number(config.smtpPort);  return Boolean(
    host
    && user
    && clean(config.smtpPass)
    && isUsableSenderEmail(affiliateSenderFromAddress(config))
    && Number.isInteger(port)
    && port > 0
    && port <= 65535
  );
}

/** 465 is implicit TLS. Any other port speaks STARTTLS when asked to. */
export function resolveSmtpSecure(port: number, secure: boolean | null | undefined): boolean {
  if (secure != null) return secure;
  return Number(port) === 465;
}

export function normalizeSmtpPort(value: number | string | null | undefined): number {
  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return AFFILIATE_SMTP_DEFAULT_PORT;
  return Math.trunc(port);
}

/**
 * Where Cabinet Dealz receives a copy of every invoice. The affiliate's saved
 * value wins; otherwise the configured platform admin address.
 */
export function invoiceCopyRecipient(
  config: { invoiceCopyEmail?: string | null } | null | undefined,
  platformDefault: string | null | undefined,
): string | null {
  const saved = clean(config?.invoiceCopyEmail);
  if (isUsableSenderEmail(saved)) return saved;
  const fallback = clean(platformDefault);
  return isUsableSenderEmail(fallback) ? fallback : null;
}

/** Add the invoice copy to BCC, skipping the address if the customer already is it. */
export function buildInvoiceCopyBcc(
  to: string,
  copyTo: string | null | undefined,
  existing?: string | string[] | null,
): string[] {
  const copy = clean(copyTo).toLowerCase();
  const existingList = (Array.isArray(existing) ? existing : existing ? [existing] : [])
    .flatMap((value) => String(value).split(/[,;]+/))
    .map(clean)
    .filter(Boolean);
  if (!isUsableSenderEmail(copy)) return existingList;
  if (clean(to).toLowerCase() === copy) return existingList;
  const already = existingList.some((value) => value.toLowerCase() === copy);
  return already ? existingList : [...existingList, copy];
}
