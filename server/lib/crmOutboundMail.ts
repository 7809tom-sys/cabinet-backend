import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { affiliateEmailSettings, affiliates, emailSettings } from "../../drizzle/schema";
import { appendEmailSignature, resolveCrmOutbound, type CrmOutboundPlan } from "@shared/crmMailbox";
import { getDb } from "../db";
import { resendConfigured, sendEmail } from "../email";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * CRM mail is ready only when RESEND_API_KEY and ORDER_EMAIL_FROM are both set.
 * A saved SMTP row or SMTP_* variables do not make the send ready and are not
 * the transport. The shared sender still has an SMTP fallback for non-CRM mail.
 */
export async function loadCrmOutboundPlan(db: Database, dealAffiliateId: number | null): Promise<CrmOutboundPlan> {
  const [platformRow] = await db.select().from(emailSettings).limit(1);
  const from = resendConfigured(process.env) ? (process.env.ORDER_EMAIL_FROM ?? "").trim() : "";
  const transport = {
    resendReady: from.length > 0,
    resendFrom: from || undefined,
  };
  if (dealAffiliateId == null) {
    return resolveCrmOutbound({
      dealAffiliateId: null,
      storeName: "Cabinet Dealz",
      publicEmail: null,
      affiliate: null,
      platform: platformRow ?? null,
      ...transport,
    });
  }
  const [store] = await db.select({
    storeName: affiliates.storeName,
    publicEmail: affiliates.publicEmail,
    email: affiliates.email,
  }).from(affiliates).where(eq(affiliates.id, dealAffiliateId)).limit(1);
  const [affiliate] = await db.select().from(affiliateEmailSettings).where(eq(affiliateEmailSettings.affiliateId, dealAffiliateId)).limit(1);
  return resolveCrmOutbound({
    dealAffiliateId,
    storeName: store?.storeName ?? "Store",
    publicEmail: store?.publicEmail || store?.email || null,
    affiliate: affiliate ?? null,
    platform: platformRow ?? null,
    ...transport,
  });
}

export async function deliverCrmMessage(
  plan: CrmOutboundPlan,
  message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
  },
): Promise<{ from: string; transport: "resend" | "smtp"; messageId?: string }> {
  if (!plan.ok) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: plan.reason });
  }
  const result = await sendEmail({
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text,
    html: appendEmailSignature(message.html, plan.signatureHtml),
    replyTo: message.replyTo ?? plan.replyTo,
    attachments: message.attachments,
  });
  const path = result.transport === "smtp" ? "SMTP" : result.transport === "resend" ? "Resend" : "Email";
  if (!result.success) {
    console.error(`[CRM email] ${path} failed`, result.error ?? "send failed");
    throw new TRPCError({
      code: result.notConfigured ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: result.notConfigured
        ? "not_configured"
        : "Send failed: The email service did not accept the message.",
    });
  }
  console.log(`[CRM email] ${path} sent`, result.messageId ?? "unknown");
  return { from: result.from || plan.from, transport: result.transport ?? "resend", messageId: result.messageId };
}
