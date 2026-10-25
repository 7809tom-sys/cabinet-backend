// Server-side CRM webhook dispatcher.
//
// Contract: ALWAYS persist the event to `crm_events` first (source of truth),
// THEN attempt delivery to CRM_WEBHOOK_URL. Delivery is best-effort and never
// throws into the caller — a failed webhook (or an unconfigured URL) must never
// block a lead / design save / order submit. Failed rows stay in the table with
// status "failed"/"pending" so they can be retried or inspected later.

import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { crmEvents, affiliates } from "../../drizzle/schema";
import { ENV } from "./env";
import {
  buildCrmWebhookPayload,
  HOUSE_DEALER,
  type CrmEventType,
  type CrmContactRef,
  type CrmDealerRef,
} from "@shared/crmWebhook";

const DELIVERY_TIMEOUT_MS = 8000;

export interface EmitCrmEventArgs {
  event: CrmEventType;
  contact: CrmContactRef;
  /**
   * White-label attribution. Provide either a resolved dealer ref, OR an
   * affiliateId / referralCode to resolve. Omit entirely for the house pipeline.
   */
  dealer?: CrmDealerRef;
  affiliateId?: number | null;
  referralCode?: string | null;
  data?: Record<string, unknown>;
  link?: string | null;
}

/** Resolve a dealer display name + code from an affiliateId when not supplied. */
async function resolveDealer(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  args: EmitCrmEventArgs,
): Promise<CrmDealerRef> {
  if (args.dealer) return args.dealer;
  const affiliateId = args.affiliateId ?? null;
  if (!affiliateId) {
    // House pipeline, but keep any referral code we were handed for traceability.
    return { ...HOUSE_DEALER, referralCode: args.referralCode ?? null };
  }
  try {
    const rows = await db
      .select({ storeName: affiliates.storeName, referralCode: affiliates.referralCode })
      .from(affiliates)
      .where(eq(affiliates.id, affiliateId))
      .limit(1);
    const a = rows[0];
    if (a) {
      return {
        affiliateId,
        referralCode: args.referralCode ?? a.referralCode ?? null,
        dealerName: a.storeName || "Cabinet Dealz",
      };
    }
  } catch {
    // fall through to a minimal ref
  }
  return { affiliateId, referralCode: args.referralCode ?? null, dealerName: "Cabinet Dealz" };
}

/**
 * Emit a CRM event. Returns the persisted row id (or null when the DB is
 * unavailable). Never throws — callers can `void emitCrmEvent(...)`.
 */
export async function emitCrmEvent(args: EmitCrmEventArgs): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  let eventId: number | null = null;
  try {
    const dealer = await resolveDealer(db, args);
    const payload = buildCrmWebhookPayload({
      event: args.event,
      dealer,
      contact: args.contact,
      data: args.data,
      link: args.link,
    });

    const configured = !!ENV.crmWebhookUrl;
    const res = await db.insert(crmEvents).values({
      eventType: args.event,
      affiliateId: dealer.affiliateId,
      referralCode: dealer.referralCode,
      dealerName: dealer.dealerName,
      userId: args.contact.userId,
      contactName: args.contact.name,
      contactEmail: args.contact.email,
      contactPhone: args.contact.phone,
      payload,
      status: configured ? "pending" : "skipped",
    });
    eventId = (res as unknown as [{ insertId: number }])[0].insertId;

    if (!configured) return eventId;

    // Attempt delivery (best-effort, bounded).
    await deliver(db, eventId, ENV.crmWebhookUrl, payload);
  } catch (err) {
    // Persisting or delivering failed; record what we can but never throw.
    if (eventId != null) {
      try {
        await db
          .update(crmEvents)
          .set({
            status: "failed",
            attempts: sql`${crmEvents.attempts} + 1`,
            lastError: err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000),
          })
          .where(eq(crmEvents.id, eventId));
      } catch {
        /* swallow */
      }
    }
  }
  return eventId;
}

/** POST the payload to the webhook and record the outcome on the event row. */
async function deliver(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  eventId: number,
  url: string,
  payload: unknown,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const ok = resp.status >= 200 && resp.status < 300;
    await db
      .update(crmEvents)
      .set({
        status: ok ? "sent" : "failed",
        attempts: sql`${crmEvents.attempts} + 1`,
        responseStatus: resp.status,
        deliveredAt: ok ? new Date() : null,
        lastError: ok ? null : `Webhook responded ${resp.status}`,
      })
      .where(eq(crmEvents.id, eventId));
  } catch (err) {
    await db
      .update(crmEvents)
      .set({
        status: "failed",
        attempts: sql`${crmEvents.attempts} + 1`,
        lastError:
          err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000),
      })
      .where(eq(crmEvents.id, eventId));
  } finally {
    clearTimeout(timer);
  }
}
