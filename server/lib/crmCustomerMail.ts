import { eq } from "drizzle-orm";
import { crmActivities, crmDeals, crmEmailLog } from "../../drizzle/schema";
import { getDb } from "../db";
import { isMissingSchemaError } from "./orderSchemaGuard";
import { ensureAffiliatePipelineDeal, type PipelineDealDraft } from "./crmPipelineAttach";
import { deliverCrmMessage, loadCrmOutboundPlan } from "./crmOutboundMail";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type CrmLoggedAttachment = { filename: string; content: Buffer | string; contentType?: string };

export async function insertCrmEmailLog(
  db: Database,
  values: {
    dealId: number;
    toEmail: string;
    fromEmail: string;
    subject: string;
    body: string;
    sentByUserId?: number | null;
    sentByName?: string | null;
    distributorId?: number | null;
  },
): Promise<void> {
  try {
    await db.insert(crmEmailLog).values(values);
  } catch (error) {
    if (values.distributorId == null || !isMissingSchemaError(error)) throw error;
    const { distributorId, ...rest } = values;
    await db.insert(crmEmailLog).values({
      ...rest,
      body: `${rest.body}\n\nDistributor #${distributorId}`,
    });
  }
}

/**
 * Send one message through the shared Resend-first sender and record it on the
 * deal. Customer quotes, design links, invoices, receipts, and distributor
 * mail all use this so the CRM email log is the history.
 */
export async function sendCrmDealEmail(
  db: Database,
  input: {
    dealId: number;
    affiliateId: number | null;
    to: string;
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    text: string;
    html: string;
    attachments?: CrmLoggedAttachment[];
    replyTo?: string;
    sentByUserId?: number | null;
    sentByName?: string | null;
    activityBody: string;
    logBody?: string;
    distributorId?: number | null;
  },
): Promise<{ from: string; transport: "resend" | "smtp" }> {
  const plan = await loadCrmOutboundPlan(db, input.affiliateId);
  const sent = await deliverCrmMessage(plan, {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
    attachments: input.attachments,
  });
  await insertCrmEmailLog(db, {
    dealId: input.dealId,
    distributorId: input.distributorId ?? null,
    toEmail: input.to,
    fromEmail: sent.from,
    subject: input.subject,
    body: input.logBody ?? input.text,
    sentByUserId: input.sentByUserId ?? null,
    sentByName: input.sentByName ?? null,
  });
  await db.insert(crmActivities).values({
    dealId: input.dealId,
    authorUserId: input.sentByUserId ?? null,
    kind: "email",
    body: input.activityBody,
  });
  await db.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, input.dealId));
  return { from: sent.from, transport: sent.transport };
}

/** Find or create the contact's deal, then send and log. */
export async function sendCrmCustomerEmail(
  db: Database,
  draft: PipelineDealDraft,
  message: Omit<Parameters<typeof sendCrmDealEmail>[1], "dealId" | "affiliateId">,
): Promise<{ dealId: number; from: string; transport: "resend" | "smtp" }> {
  const deal = await ensureAffiliatePipelineDeal(db, draft);
  const sent = await sendCrmDealEmail(db, {
    ...message,
    dealId: deal.id,
    affiliateId: draft.affiliateId,
  });
  return { dealId: deal.id, ...sent };
}
