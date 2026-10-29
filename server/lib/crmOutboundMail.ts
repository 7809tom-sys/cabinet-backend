import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { affiliateEmailSettings, affiliates, emailSettings } from "../../drizzle/schema";
import { appendEmailSignature, resolveCrmOutbound, type CrmOutboundPlan } from "@shared/crmMailbox";
import { getDb } from "../db";
import {
  isEmailConfigured,
  outboundFromAddress,
  sendEmail,
  type EmailSettingsRow,
} from "../email";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function settingsRow(row: typeof emailSettings.$inferSelect | undefined): EmailSettingsRow | null {
  if (!row) return null;
  return {
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUser: row.smtpUser,
    smtpPass: row.smtpPass,
    smtpFrom: row.smtpFrom,
    enabled: row.enabled,
  };
}

/** Ready when Resend is configured, otherwise when SMTP env or saved settings can send. */
export async function loadCrmOutboundPlan(db: Database, dealAffiliateId: number | null): Promise<CrmOutboundPlan> {
  const [platformRow] = await db.select().from(emailSettings).limit(1);
  const platform = settingsRow(platformRow);
  const ready = isEmailConfigured(process.env, platform);
  const from = outboundFromAddress(process.env, platform);
  const transport = {
    resendReady: ready,
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
