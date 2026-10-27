import nodemailer from "nodemailer";
import { TRPCError } from "@trpc/server";
import { decryptEmailSettingsPassword } from "./emailSettingsCrypto";
import { appendEmailSignature, type CrmOutboundPlan } from "@shared/crmMailbox";

export async function deliverCrmMessage(
  plan: CrmOutboundPlan,
  message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
  },
): Promise<void> {
  if (!plan.ok) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: plan.reason });
  }
  const pass = decryptEmailSettingsPassword(plan.smtp.pass);
  const transport = nodemailer.createTransport({
    host: plan.smtp.host,
    port: plan.smtp.port,
    secure: plan.smtp.port === 465,
    auth: { user: plan.smtp.user, pass },
  });
  try {
    await transport.sendMail({
      from: plan.from,
      to: message.to,
      replyTo: plan.replyTo,
      subject: message.subject,
      text: message.text,
      html: appendEmailSignature(message.html, plan.signatureHtml),
      attachments: message.attachments,
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    const hint = code === "EAUTH" || /auth|credentials|535/i.test(raw)
      ? "The mail server rejected the username or password. Check Email setup (for Gmail or Microsoft use an app password)."
      : code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET" || code === "ENOTFOUND"
        ? "Could not reach the mail server. Check the host and port (465 uses SSL, 587 uses STARTTLS)."
        : "The mail server did not accept the message.";
    console.error("[CRM email] send failed", { code, raw });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Send failed: ${hint}` });
  }
}
