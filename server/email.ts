// ─── Email service (Resend HTTPS) ────────────────────────────────────────────
// Every outbound message goes through Resend's HTTPS API. SMTP is not used.
// Set RESEND_API_KEY and ORDER_EMAIL_FROM. When either is missing, send
// functions log an error and return a not-configured result. They never open
// an SMTP connection.

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
}

/** True only when both the Resend key and the shared From address are set. */
export function resendConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.ORDER_EMAIL_FROM?.trim());
}

/** Readiness for every outbound email. Saved SMTP settings are not consulted. */
export function isEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resendConfigured(env);
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

/**
 * Shared Resend sender. Posts to the HTTPS API, including PDF/CSV attachments
 * (base64) and reply_to. Returns a failed result when Resend is not configured.
 */
export async function sendViaResend(
  opts: SendEmailOptions,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SendEmailResult> {
  const missing = missingResendEnv(env);
  if (missing.length > 0) {
    const error = `Email is not configured. Set ${missing.join(" and ")}.`;
    console.error(`${ORDER_EMAIL_LOG} Resend failed: ${error}`);
    return { success: false, notConfigured: true, error };
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

export async function sendEmail(
  opts: SendEmailOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendEmailResult> {
  return sendViaResend(opts, env);
}
