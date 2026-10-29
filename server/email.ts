// ─── Email service ───────────────────────────────────────────────────────────
// Resend HTTPS is the sender when RESEND_API_KEY and ORDER_EMAIL_FROM are set.
// Otherwise delivery falls back to SMTP from SMTP_* or a saved email_settings
// row. The chosen path is logged. Passwords are never logged.

import nodemailer from "nodemailer";
import { decryptEmailSettingsPassword } from "./lib/emailSettingsCrypto";

const ORDER_EMAIL_LOG = "[OrderEmail]";

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
  transport?: "resend" | "smtp";
  from?: string;
}

export interface EmailSettingsRow {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  enabled: boolean;
}

/** True only when both the Resend key and the shared From address are set. */
export function resendConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.ORDER_EMAIL_FROM?.trim());
}

export function envSmtpConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASS?.trim());
}

/** True when the saved settings row has host, user, password, and sending enabled. */
export function emailSettingsReady(s: EmailSettingsRow | null | undefined): boolean {
  return !!(s && s.enabled && s.smtpHost && s.smtpUser && s.smtpPass);
}

/** Ready when Resend or an SMTP fallback can send. */
export function isEmailConfigured(
  env: NodeJS.ProcessEnv = process.env,
  settings?: EmailSettingsRow | null,
): boolean {
  return resendConfigured(env) || envSmtpConfigured(env) || emailSettingsReady(settings);
}

export function outboundFromAddress(
  env: NodeJS.ProcessEnv = process.env,
  settings?: EmailSettingsRow | null,
): string {
  if (resendConfigured(env)) return env.ORDER_EMAIL_FROM!.trim();
  if (envSmtpConfigured(env)) return (env.SMTP_FROM || env.SMTP_USER || "").trim();
  if (settings && emailSettingsReady(settings)) return (settings.smtpFrom || settings.smtpUser).trim();
  return "";
}

function addressList(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const list = (Array.isArray(value) ? value : value.split(/[,;]+/)).map((item) => item.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function missingResendEnv(env: NodeJS.ProcessEnv): string[] {
  const missing: string[] = [];
  if (!env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (!env.ORDER_EMAIL_FROM?.trim()) missing.push("ORDER_EMAIL_FROM");
  return missing;
}

type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string };

function envSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig | null {
  if (!envSmtpConfigured(env)) return null;
  const port = Number.parseInt(env.SMTP_PORT ?? "465", 10);
  return {
    host: env.SMTP_HOST!.trim(),
    port: Number.isFinite(port) ? port : 465,
    user: env.SMTP_USER!.trim(),
    pass: env.SMTP_PASS ?? "",
    from: (env.SMTP_FROM || env.SMTP_USER || "").trim(),
  };
}

/**
 * Shared Resend sender. Posts to the HTTPS API, including PDF attachments
 * (base64) and reply_to. Returns notConfigured without logging when Resend
 * is unset so the caller can fall back to SMTP.
 */
export async function sendViaResend(
  opts: SendEmailOptions,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SendEmailResult> {
  const missing = missingResendEnv(env);
  if (missing.length > 0) {
    return { success: false, notConfigured: true, error: `Email is not configured. Set ${missing.join(" and ")}.` };
  }
  const key = env.RESEND_API_KEY!.trim();
  const from = env.ORDER_EMAIL_FROM!.trim();
  const attachments = opts.attachments?.map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.isBuffer(attachment.content)
      ? attachment.content.toString("base64")
      : Buffer.from(attachment.content).toString("base64"),
    ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
  }));
  const replyTo = opts.replyTo?.trim() || undefined;
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
        reply_to: replyTo,
        attachments,
      }),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) {
      const message = body.message || `Resend returned ${response.status}`;
      console.error(`${ORDER_EMAIL_LOG} Resend failed for ${opts.to}: ${message}`);
      return { success: false, error: message, transport: "resend" };
    }
    console.log(`${ORDER_EMAIL_LOG} Resend sent to ${opts.to} — id: ${body.id ?? "unknown"}`);
    return { success: true, messageId: body.id, transport: "resend", from };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${ORDER_EMAIL_LOG} Resend failed for ${opts.to}: ${message}`);
    return { success: false, error: message, transport: "resend" };
  }
}

async function sendViaSmtp(config: SmtpConfig, opts: SendEmailOptions): Promise<SendEmailResult> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  const info = await transport.sendMail({
    from: config.from,
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    replyTo: opts.replyTo,
    attachments: opts.attachments,
  });
  return { success: true, messageId: info.messageId, transport: "smtp", from: config.from };
}

async function loadSavedEmailSettings(): Promise<EmailSettingsRow | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { getDb } = await import("./db");
    const { emailSettings } = await import("../drizzle/schema");
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(emailSettings).limit(1);
    if (!row) return null;
    return {
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpUser: row.smtpUser,
      smtpPass: row.smtpPass,
      smtpFrom: row.smtpFrom,
      enabled: row.enabled,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Email] Could not load saved SMTP settings: ${message}`);
    return null;
  }
}

/**
 * Send through Resend when it is configured. Otherwise use SMTP from the
 * environment, then a saved email_settings row. A custom env object skips the
 * database lookup so tests do not open a connection.
 */
export async function sendEmail(
  opts: SendEmailOptions,
  env: NodeJS.ProcessEnv = process.env,
  settings?: EmailSettingsRow | null,
): Promise<SendEmailResult> {
  if (resendConfigured(env)) {
    const result = await sendViaResend(opts, env);
    if (result.success) {
      console.log(`[Email] sent via Resend to ${opts.to} — id: ${result.messageId ?? "unknown"}`);
    } else {
      console.error(`[Email] Resend failed for ${opts.to}: ${result.error ?? "send failed"}`);
    }
    return result;
  }

  const smtp = envSmtpConfig(env);
  if (smtp) {
    try {
      const result = await sendViaSmtp(smtp, opts);
      console.log(`[Email] sent via SMTP to ${opts.to} — id: ${result.messageId ?? "unknown"}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Email] SMTP failed for ${opts.to}: ${message}`);
      return { success: false, error: message, transport: "smtp" };
    }
  }

  const row = settings !== undefined ? settings : env === process.env ? await loadSavedEmailSettings() : null;
  if (row && emailSettingsReady(row)) {
    try {
      const smtpPass = decryptEmailSettingsPassword(row.smtpPass);
      const result = await sendViaSmtp({
        host: row.smtpHost,
        port: row.smtpPort,
        user: row.smtpUser,
        pass: smtpPass,
        from: (row.smtpFrom || row.smtpUser).trim(),
      }, opts);
      console.log(`[Email] sent via SMTP settings to ${opts.to} — id: ${result.messageId ?? "unknown"}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Email] SMTP settings failed for ${opts.to}: ${message}`);
      return { success: false, error: message, transport: "smtp" };
    }
  }

  const error = "Email is not configured. Set RESEND_API_KEY and ORDER_EMAIL_FROM, or SMTP_HOST, SMTP_USER, and SMTP_PASS.";
  console.error(`[Email] send failed: ${error}`);
  return { success: false, notConfigured: true, error };
}
