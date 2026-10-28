// ─── Email Service (Hostinger SMTP) ──────────────────────────────────────────
// Sends transactional emails via Nodemailer. Configure the five SMTP_* env vars
// in the Secrets panel (Settings → Secrets) to activate. When the vars are
// absent the service logs a warning and returns a "not configured" result so
// the rest of the app keeps running without crashing.

import nodemailer from "nodemailer";
import { decryptEmailSettingsPassword } from "./lib/emailSettingsCrypto";

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "465", 10);
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER;

export function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (TLS/STARTTLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  notConfigured?: boolean;
}

const ORDER_EMAIL_LOG = "[OrderEmail]";

export function resendConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim());
}

function addressList(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const list = (Array.isArray(value) ? value : value.split(/[,;]+/)).map((item) => item.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

/**
 * HTTPS mail through Resend when RESEND_API_KEY is set. Returns null when the
 * key is absent, or when ORDER_EMAIL_FROM is missing, so the caller can use SMTP.
 */
export async function sendViaResend(
  opts: SendEmailOptions,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SendEmailResult | null> {
  const key = env.RESEND_API_KEY?.trim() ?? "";
  if (!key) return null;
  const from = env.ORDER_EMAIL_FROM?.trim() ?? "";
  if (!from) {
    console.warn(`${ORDER_EMAIL_LOG} RESEND_API_KEY is set but ORDER_EMAIL_FROM is empty. Falling back to SMTP.`);
    return null;
  }
  const attachments = opts.attachments?.map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.isBuffer(attachment.content) ? attachment.content.toString("base64") : Buffer.from(attachment.content).toString("base64"),
  }));
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: addressList(opts.to),
        cc: addressList(opts.cc),
        bcc: addressList(opts.bcc),
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        reply_to: opts.replyTo,
        attachments,
      }),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) {
      const message = body.message || `Resend returned ${response.status}`;
      console.error(`${ORDER_EMAIL_LOG} Resend failed for ${opts.to}: ${message}`);
      return { success: false, error: message };
    }
    console.log(`${ORDER_EMAIL_LOG} Resend sent to ${opts.to} — id: ${body.id ?? "unknown"}`);
    return { success: true, messageId: body.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${ORDER_EMAIL_LOG} Resend failed for ${opts.to}: ${message}`);
    return { success: false, error: message };
  }
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const resend = await sendViaResend(opts);
  if (resend) return resend;
  if (!isEmailConfigured()) {
    console.warn("[Email] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in Secrets.");
    return { success: false, notConfigured: true, error: "SMTP not configured" };
  }

  try {
    const transporter = createTransport();
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
      attachments: opts.attachments,
    });
    console.log(`[Email] Sent to ${opts.to} — messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Email] Failed to send to ${opts.to}:`, message);
    return { success: false, error: message };
  }
}

// Verify SMTP connection (used by admin health-check)
export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    const transporter = createTransport();
    await transporter.verify();
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// ─── DB-backed send (email_settings table) ───────────────────────────────────
// The app stores SMTP config in the `email_settings` table (managed via Admin →
// Email Settings) and toggles it with `enabled`. The CRM email feature uses this
// source, so the distributor PO email uses it too for a single, consistent
// configuration surface. Env-based `sendEmail()` above remains as a fallback.

export interface EmailSettingsRow {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  enabled: boolean;
}

/** True when the saved settings row has host+user+pass AND sending is enabled. */
export function emailSettingsReady(s: EmailSettingsRow | null | undefined): boolean {
  return !!(s && s.enabled && s.smtpHost && s.smtpUser && s.smtpPass);
}

/**
 * Send an email using a settings row loaded from the database. Supports cc,
 * replyTo, and attachments (used for the NetSuite CSV). Returns the same shape
 * as `sendEmail()`.
 */
export async function sendEmailViaSettings(
  s: EmailSettingsRow,
  opts: SendEmailOptions
): Promise<SendEmailResult> {
  const resend = await sendViaResend(opts);
  if (resend) return resend;
  if (!emailSettingsReady(s)) {
    return { success: false, notConfigured: true, error: "Email is not configured or is disabled" };
  }
  try {
    const smtpPass = decryptEmailSettingsPassword(s.smtpPass);
    const transporter = nodemailer.createTransport({
      host: s.smtpHost,
      port: s.smtpPort,
      secure: s.smtpPort === 465,
      auth: { user: s.smtpUser, pass: smtpPass },
    });
    const info = await transporter.sendMail({
      from: (s.smtpFrom || s.smtpUser).trim(),
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
      attachments: opts.attachments,
    });
    console.log(`[Email] (settings) Sent to ${opts.to} — messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Email] (settings) Failed to send to ${opts.to}:`, message);
    return { success: false, error: message };
  }
}
