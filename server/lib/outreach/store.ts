// Database-backed OutreachStore (TiDB / MySQL via drizzle). Tables come from
// docs/sql/0286_crm_customer_import_outreach.tidb.sql.

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, lt, or, sql } from "drizzle-orm";
import {
  crmActivities,
  crmContactImportRows,
  crmDealDesigns,
  crmDeals,
  distributors,
  outreachEnrollments,
  outreachEvents,
  outreachMessages,
  outreachSettings,
  outreachSuppressions,
} from "../../../drizzle/schema";
import { normalizeOutreachSettings, outreachStageAdvance, type OutreachSettings, type OutreachSignal } from "@shared/crmOutreach";
import type { getDb } from "../../db";
import { BUILT_IN_BLOCKED_NAMES } from "./ai";
import { readOutreachEnv } from "./config";
import type { ContactContext, EnrollmentRecord, MessageRecord, OutreachStore } from "./engine";

export type OutreachDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const OUTREACH_SETTINGS_ID = 1;

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

function toEnrollment(row: typeof outreachEnrollments.$inferSelect): EnrollmentRecord {
  return {
    id: row.id,
    dealId: row.dealId,
    email: row.email,
    status: row.status,
    currentStep: row.currentStep,
    nextSendAt: row.nextSendAt,
    sentCount: row.sentCount,
    lastSentAt: row.lastSentAt,
    unsubscribeToken: row.unsubscribeToken,
  };
}

function toMessage(row: typeof outreachMessages.$inferSelect): MessageRecord {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    dealId: row.dealId,
    stepIndex: row.stepIndex,
    toEmail: row.toEmail,
    subject: row.subject,
    bodyText: row.bodyText,
    status: row.status,
    providerMessageId: row.providerMessageId,
  };
}

export async function loadOutreachSettings(db: OutreachDb): Promise<OutreachSettings> {
  const [row] = await db.select().from(outreachSettings).where(eq(outreachSettings.id, OUTREACH_SETTINGS_ID)).limit(1);
  return normalizeOutreachSettings(row ?? null);
}

export async function saveOutreachSettings(db: OutreachDb, settings: OutreachSettings, userId: number | null): Promise<void> {
  const values = {
    enabled: settings.enabled,
    mode: settings.mode,
    dailyCap: settings.dailyCap,
    perContactCap: settings.perContactCap,
    senderName: settings.senderName,
    sequence: settings.sequence,
    updatedByUserId: userId,
  };
  await db.insert(outreachSettings).values({ id: OUTREACH_SETTINGS_ID, ...values }).onDuplicateKeyUpdate({ set: values });
}

export function createOutreachStore(db: OutreachDb, env: NodeJS.ProcessEnv = process.env): OutreachStore {
  return {
    getSettings: () => loadOutreachSettings(db),

    async isSuppressed(email) {
      const [row] = await db.select({ id: outreachSuppressions.id }).from(outreachSuppressions)
        .where(eq(outreachSuppressions.email, email.trim().toLowerCase())).limit(1);
      return Boolean(row);
    },

    async suppress(email, reason, source) {
      const normalized = email.trim().toLowerCase();
      if (!normalized) return;
      // First reason wins; a later event never un-suppresses or rewrites it.
      await db.insert(outreachSuppressions).values({ email: normalized, reason, source: source.slice(0, 128) })
        .onDuplicateKeyUpdate({ set: { email: sql`email` } });
      await db.insert(outreachEvents).values({ eventType: "suppressed", email: normalized, detail: { reason, source } });
    },

    async countSentSince(since) {
      const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(outreachMessages)
        .where(and(eq(outreachMessages.status, "sent"), gte(outreachMessages.sentAt, since)));
      return Number(row?.n ?? 0);
    },

    async listDueEnrollments(now, limit) {
      const rows = await db.select().from(outreachEnrollments)
        .where(and(
          eq(outreachEnrollments.status, "active"),
          isNotNull(outreachEnrollments.nextSendAt),
          lte(outreachEnrollments.nextSendAt, now),
          or(isNull(outreachEnrollments.lockedUntil), lt(outreachEnrollments.lockedUntil, now)),
        ))
        .orderBy(asc(outreachEnrollments.nextSendAt))
        .limit(limit);
      return rows.map(toEnrollment);
    },

    async claimEnrollment(id, now, lockUntil) {
      const result = await db.update(outreachEnrollments).set({ lockedUntil: lockUntil })
        .where(and(
          eq(outreachEnrollments.id, id),
          or(isNull(outreachEnrollments.lockedUntil), lt(outreachEnrollments.lockedUntil, now)),
        ));
      return affected(result) === 1;
    },

    async releaseEnrollment(id) {
      await db.update(outreachEnrollments).set({ lockedUntil: null }).where(eq(outreachEnrollments.id, id));
    },

    async hasOpenMessage(enrollmentId, stepIndex) {
      const [row] = await db.select({ id: outreachMessages.id }).from(outreachMessages)
        .where(and(
          eq(outreachMessages.enrollmentId, enrollmentId),
          eq(outreachMessages.stepIndex, stepIndex),
          inArray(outreachMessages.status, ["preview", "pending_approval", "approved", "sending", "sent"]),
        )).limit(1);
      return Boolean(row);
    },

    async loadContactContext(enrollment): Promise<ContactContext | null> {
      const [deal] = await db.select({
        contactName: crmDeals.contactName,
        stage: crmDeals.stage,
        affiliateId: crmDeals.affiliateId,
      }).from(crmDeals).where(eq(crmDeals.id, enrollment.dealId)).limit(1);
      if (!deal) return null;
      const [imported] = await db.select().from(crmContactImportRows).where(eq(crmContactImportRows.dealId, enrollment.dealId)).limit(1);
      const [designs] = await db.select({ n: sql<number>`COUNT(*)` }).from(crmDealDesigns).where(eq(crmDealDesigns.dealId, enrollment.dealId));
      const previous = await db.select({ subject: outreachMessages.subject }).from(outreachMessages)
        .where(and(eq(outreachMessages.enrollmentId, enrollment.id), eq(outreachMessages.status, "sent")))
        .orderBy(asc(outreachMessages.stepIndex));
      const firstName = (deal.contactName ?? "").trim().split(/\s+/)[0] || null;
      return {
        dealStage: deal.stage,
        affiliateId: deal.affiliateId,
        facts: {
          firstName: firstName && /^[A-Za-z][A-Za-z'.-]*$/.test(firstName) ? firstName : null,
          city: imported?.city ?? null,
          state: imported?.state ?? null,
          lastPurchaseDate: imported?.lastPurchaseDate ?? null,
          customerListName: imported?.sourceTag ?? null,
          notesFromList: null,
          savedDesignCount: Number(designs?.n ?? 0),
          previousSubjects: previous.map((row) => row.subject),
        },
      };
    },

    async blockedNames() {
      const rows = await db.select({ name: distributors.name, brandName: distributors.brandName, whiteLabel: distributors.whiteLabel }).from(distributors);
      const fromDb = rows.flatMap((row) => [row.brandName ?? "", row.whiteLabel ? "" : row.name]).filter((name) => name.trim().length >= 3);
      return Array.from(new Set([...BUILT_IN_BLOCKED_NAMES, ...fromDb, ...readOutreachEnv(env).extraBlockedNames]));
    },

    async insertMessage(row) {
      const result = await db.insert(outreachMessages).values({
        enrollmentId: row.enrollmentId,
        dealId: row.dealId,
        stepIndex: row.stepIndex,
        toEmail: row.toEmail,
        subject: row.subject.slice(0, 256),
        bodyText: row.bodyText,
        status: row.status,
        draftSource: row.draftSource,
      });
      const header = Array.isArray(result) ? result[0] : result;
      return Number((header as { insertId?: number }).insertId);
    },

    async updateMessage(id, patch) {
      await db.update(outreachMessages).set(patch).where(eq(outreachMessages.id, id));
    },

    async claimMessageForSend(id) {
      const result = await db.update(outreachMessages).set({ status: "sending" })
        .where(and(eq(outreachMessages.id, id), eq(outreachMessages.status, "approved")));
      return affected(result) === 1;
    },

    async listApprovedMessages(limit) {
      const rows = await db.select().from(outreachMessages).where(eq(outreachMessages.status, "approved"))
        .orderBy(asc(outreachMessages.createdAt)).limit(Math.max(1, limit));
      return rows.map(toMessage);
    },

    async getEnrollment(id) {
      const [row] = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.id, id)).limit(1);
      return row ? toEnrollment(row) : null;
    },

    async findEnrollmentByToken(token) {
      if (!/^[a-f0-9]{32,64}$/i.test(token)) return null;
      const [row] = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.unsubscribeToken, token)).limit(1);
      return row ? toEnrollment(row) : null;
    },

    async findEnrollmentsByEmail(email) {
      const rows = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.email, email.trim().toLowerCase()));
      return rows.map(toEnrollment);
    },

    async findMessageByProviderId(providerMessageId) {
      const [row] = await db.select().from(outreachMessages).where(eq(outreachMessages.providerMessageId, providerMessageId)).limit(1);
      return row ? toMessage(row) : null;
    },

    async updateEnrollment(id, patch) {
      await db.update(outreachEnrollments).set(patch).where(eq(outreachEnrollments.id, id));
    },

    async rejectOpenMessages(enrollmentId) {
      await db.update(outreachMessages).set({ status: "rejected", error: "sequence stopped" })
        .where(and(eq(outreachMessages.enrollmentId, enrollmentId), inArray(outreachMessages.status, ["preview", "pending_approval", "approved"])));
    },

    async logEvent(event) {
      await db.insert(outreachEvents).values({
        eventType: event.eventType.slice(0, 48),
        enrollmentId: event.enrollmentId ?? null,
        messageId: event.messageId ?? null,
        dealId: event.dealId ?? null,
        email: event.email ?? null,
        actorUserId: event.actorUserId ?? null,
        detail: event.detail ?? null,
      });
    },

    async addDealActivity(dealId, body) {
      await db.insert(crmActivities).values({ dealId, kind: "email", body: body.slice(0, 4000) });
    },

    async advanceDealStage(dealId, signal: OutreachSignal) {
      const [deal] = await db.select({ stage: crmDeals.stage }).from(crmDeals).where(eq(crmDeals.id, dealId)).limit(1);
      if (!deal) return null;
      const next = outreachStageAdvance(deal.stage, signal);
      if (!next) return null;
      // Conditional on the stage read above, so a concurrent manual move wins.
      const result = await db.update(crmDeals).set({ stage: next }).where(and(eq(crmDeals.id, dealId), eq(crmDeals.stage, deal.stage)));
      if (affected(result) !== 1) return null;
      await db.insert(crmActivities).values({ dealId, kind: "stage_change", body: `Stage ${deal.stage} → ${next} (outreach ${signal.replace("_", " ")})` });
      return next;
    },
  };
}
