import { TRPCError } from "@trpc/server";
import { appendEmailSignature, type CrmOutboundPlan } from "@shared/crmMailbox";
import { sendViaResend } from "../email";

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
  const result = await sendViaResend({
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: appendEmailSignature(message.html, plan.signatureHtml),
    replyTo: plan.replyTo,
    attachments: message.attachments,
  });
  if (!result.success) {
    console.error("[CRM email] Resend failed", result.error ?? "send failed");
    throw new TRPCError({
      code: result.notConfigured ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: result.notConfigured
        ? "not_configured"
        : "Send failed: The email service did not accept the message.",
    });
  }
  console.log("[CRM email] Resend sent", result.messageId ?? "unknown");
}
