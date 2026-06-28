// ─── Email Service (Hostinger SMTP) ──────────────────────────────────────────
// Sends transactional emails via Nodemailer. Configure the five SMTP_* env vars
// in the Secrets panel (Settings → Secrets) to activate. When the vars are
// absent the service logs a warning and returns a "not configured" result so
// the rest of the app keeps running without crashing.

import nodemailer from "nodemailer";

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

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  notConfigured?: boolean;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    console.warn("[Email] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in Secrets.");
    return { success: false, notConfigured: true, error: "SMTP not configured" };
  }

  try {
    const transporter = createTransport();
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
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
