import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { affiliates, emailSettings } from "../../drizzle/schema";
import { appendEmailSignature, resolveCrmOutbound, type CrmOutboundPlan } from "@shared/crmMailbox";
import { getDb } from "../db";
import { resendConfigured } from "../email";
import {
  loadAffiliateSenderRecord,
  sendAffiliateCustomerEmail,
  senderFromRecord,
  type AffiliateSenderRecord,
} from "./affiliateSender";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type CrmOutboundResolution = {
  plan: CrmOutboundPlan;
  /** The affiliate row the plan was built from, so delivery reuses it. */
  record: AffiliateSenderRecord;
};

/**
 * CRM mail is ready when the platform can deliver it OR the deal's affiliate has
 * its own enabled mailbox. House mail keeps the shared Resend sender and is
 * ready only when RESEND_API_KEY and ORDER_EMAIL_FROM are both set.
 *
 * The affiliate row is read once here and handed to delivery, so the From the
 * caller reports is exactly the mailbox that carries the message.
 */
export async function loadCrmOutboundPlan(db: Database, dealAffiliateId: number | null): Promise<CrmOutboundResolution> {
  const [platformRow] = await db.select().from(emailSettings).limit(1);
  const from = resendConfigured(process.env) ? (process.env.ORDER_EMAIL_FROM ?? "").trim() : "";
  const transport = {
    resendReady: from.length > 0,
    resendFrom: from || undefined,
  };
  if (dealAffiliateId == null) {
    return {
      plan: resolveCrmOutbound({
        dealAffiliateId: null,
        storeName: "Cabinet Dealz",
        publicEmail: null,
        affiliate: null,
        platform: platformRow ?? null,
        ...transport,
      }),
      record: null,
    };
  }
  const [store] = await db.select({
    storeName: affiliates.storeName,
    publicEmail: affiliates.publicEmail,
    email: affiliates.email,
  }).from(affiliates).where(eq(affiliates.id, dealAffiliateId)).limit(1);
  const record = await loadAffiliateSenderRecord(db, dealAffiliateId);
  return {
    plan: resolveCrmOutbound({
      dealAffiliateId,
      storeName: store?.storeName ?? "Store",
      publicEmail: store?.publicEmail || store?.email || null,
      affiliate: record,
      platform: platformRow ?? null,
      ...transport,
    }),
    record,
  };
}

/**
 * Deliver one customer-facing CRM message. The resolution from
 * loadCrmOutboundPlan carries both the plan and the affiliate row it came from,
 * so the mailbox that actually sends is the one the caller reported.
 */
export async function deliverCrmMessage(
  resolution: CrmOutboundResolution,
  message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
    /** The deal's affiliate. Its own mailbox is used when one is configured. */
    affiliateId?: number | null;
    /** Customer invoices also copy Cabinet Dealz on BCC. */
    invoice?: boolean;
    /** Supplier mail keeps the platform sender even for an affiliate deal. */
    platformSender?: boolean;
  },
): Promise<{ from: string; transport: "resend" | "smtp" | "affiliate_smtp"; messageId?: string; invoiceCopyTo: string | null }> {
  const { plan, record } = resolution;
  if (!plan.ok) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: plan.reason });
  }
  const db = await getDb();
  const html = appendEmailSignature(message.html, plan.signatureHtml);
  const base = {
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text,
    html,
    replyTo: message.replyTo ?? plan.replyTo,
    attachments: message.attachments,
    invoice: message.invoice,
    affiliateId: message.platformSender
      ? null
      : message.affiliateId ?? plan.affiliateId,
  };
  const prepared = record && !message.platformSender
    ? { record, sender: senderFromRecord(record) }
    : undefined;
  const result = db
    ? await sendAffiliateCustomerEmail(db, base, process.env, prepared)
    : await (async () => {
      // Without a database there is no affiliate row to read and no invoice-copy
      // default, so the shared sender carries the message.
      const { sendEmail } = await import("../email");
      return { ...(await sendEmail(base)), viaAffiliate: false, invoiceCopyTo: null };
    })();
  const path = result.transport === "affiliate_smtp"
    ? "affiliate SMTP"
    : result.transport === "smtp"
      ? "SMTP"
      : result.transport === "resend"
        ? "Resend"
        : "Email";
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
  return {
    from: result.from || plan.from,
    transport: result.transport ?? "resend",
    messageId: result.messageId,
    invoiceCopyTo: result.invoiceCopyTo,
  };
}
