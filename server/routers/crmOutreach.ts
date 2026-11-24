// Admin-only: house CRM customer list import and the AI follow-up outreach
// engine (settings, enrolment, preview, approval queue, suppression list and
// audit log). Nothing here sends to a customer directly: real sends only
// happen in the scheduled tick, behind OUTREACH_ENABLED + the admin switch.

import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  crmContactImportRows,
  crmContactImports,
  crmDeals,
  outreachEnrollments,
  outreachEvents,
  outreachMessages,
  outreachSuppressions,
} from "../../drizzle/schema";
import { CONTACT_IMPORT_BATCH_SIZE, CONTACT_IMPORT_MAX_ROWS, isValidContactEmail, normalizeContactEmail } from "@shared/crmContactImport";
import { OUTREACH_CAP_LIMITS, OUTREACH_MODES, normalizeOutreachSettings } from "@shared/crmOutreach";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sendEmail } from "../email";
import { isMissingSchemaError } from "../lib/orderSchemaGuard";
import { OUTREACH_SYSTEM_PROMPT } from "../lib/outreach/ai";
import { OUTREACH_BLOCKER_MESSAGES, effectiveMode, readOutreachEnv, sendBlockers } from "../lib/outreach/config";
import { enrollContacts, finishContactImport, importContactBatch, startContactImport } from "../lib/outreach/contacts";
import { draftForEnrollment, type EnrollmentRecord } from "../lib/outreach/engine";
import { renderOutreachEmail } from "../lib/outreach/render";
import { outreachLlm } from "../lib/outreach/runtime";
import { createOutreachStore, loadOutreachSettings, saveOutreachSettings, type OutreachDb } from "../lib/outreach/store";
import { notifyOwner } from "../_core/notification";

export const OUTREACH_SCHEMA_MESSAGE = "The outreach tables are not in the database yet. Run docs/sql/0286_crm_customer_import_outreach.tidb.sql first.";

async function database(): Promise<OutreachDb> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
  return db;
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingSchemaError(error)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: OUTREACH_SCHEMA_MESSAGE });
    throw error;
  }
}

const importRow = z.object({
  rowNumber: z.number().int().min(1),
  name: z.string().max(256),
  email: z.string().max(320),
  phone: z.string().max(32).nullable(),
  address: z.string().max(512).nullable(),
  city: z.string().max(128).nullable(),
  state: z.string().max(64).nullable(),
  zip: z.string().max(16).nullable(),
  lastPurchaseDate: z.string().max(32).nullable(),
  notes: z.string().max(4000).nullable(),
});

const stepInput = z.object({
  key: z.string().max(48),
  label: z.string().min(1).max(64),
  delayDays: z.number().int().min(0).max(OUTREACH_CAP_LIMITS.maxDelayDays),
  goal: z.string().min(1).max(600),
  offerText: z.string().max(200),
});

async function logAdmin(db: OutreachDb, actorUserId: number, eventType: string, detail: Record<string, unknown>, ids: { messageId?: number; enrollmentId?: number } = {}) {
  await db.insert(outreachEvents).values({ eventType, actorUserId, detail, messageId: ids.messageId ?? null, enrollmentId: ids.enrollmentId ?? null });
}

function previewEnrollment(dealId: number, email: string): EnrollmentRecord {
  return { id: 0, dealId, email, status: "active", currentStep: 0, nextSendAt: null, sentCount: 0, lastSentAt: null, unsubscribeToken: "0".repeat(48) };
}

export const crmOutreachRouter = router({
  // ── Status card ─────────────────────────────────────────────────────────────
  status: adminProcedure.query(() => guard(async () => {
    const db = await database();
    const env = readOutreachEnv();
    const settings = await loadOutreachSettings(db);
    const [enrollmentCounts, messageCounts, sent24h, suppressionCount, imports, tags] = await Promise.all([
      db.select({ status: outreachEnrollments.status, n: sql<number>`COUNT(*)` }).from(outreachEnrollments).groupBy(outreachEnrollments.status),
      db.select({ status: outreachMessages.status, n: sql<number>`COUNT(*)` }).from(outreachMessages).groupBy(outreachMessages.status),
      db.select({ n: sql<number>`COUNT(*)` }).from(outreachMessages).where(and(eq(outreachMessages.status, "sent"), sql`${outreachMessages.sentAt} >= NOW() - INTERVAL 1 DAY`)),
      db.select({ n: sql<number>`COUNT(*)` }).from(outreachSuppressions),
      db.select().from(crmContactImports).orderBy(desc(crmContactImports.createdAt)).limit(20),
      db.select({ sourceTag: crmContactImportRows.sourceTag, n: sql<number>`COUNT(*)` }).from(crmContactImportRows).groupBy(crmContactImportRows.sourceTag),
    ]);
    const blockers = sendBlockers(env, settings);
    const mode = effectiveMode(env, settings.mode);
    const notes = [...blockers.map((b) => OUTREACH_BLOCKER_MESSAGES[b])];
    if (settings.mode === "auto" && mode !== "auto") notes.push(OUTREACH_BLOCKER_MESSAGES.auto_needs_reply_detection);
    return {
      settings,
      effectiveMode: mode,
      sendingLive: blockers.length === 0,
      notes,
      env: {
        envEnabled: env.envEnabled,
        mailingAddress: env.mailingAddress,
        businessName: env.businessName,
        publicBaseUrl: env.publicBaseUrl,
        replyTo: env.replyTo || env.ownerEmail,
        replyDetection: env.inboundSecretSet && Boolean(env.replyTo),
        bounceEvents: env.eventsSecretSet,
        aiConfigured: outreachLlm() != null,
      },
      enrollments: Object.fromEntries(enrollmentCounts.map((row) => [row.status, Number(row.n)])),
      messages: Object.fromEntries(messageCounts.map((row) => [row.status, Number(row.n)])),
      sentLast24h: Number(sent24h[0]?.n ?? 0),
      suppressed: Number(suppressionCount[0]?.n ?? 0),
      imports,
      sourceTags: tags.map((row) => ({ sourceTag: row.sourceTag, contacts: Number(row.n) })),
      systemPrompt: OUTREACH_SYSTEM_PROMPT,
    };
  })),

  saveSettings: adminProcedure
    .input(z.object({
      enabled: z.boolean(),
      mode: z.enum(OUTREACH_MODES),
      dailyCap: z.number().int().min(0).max(OUTREACH_CAP_LIMITS.dailyCapMax),
      perContactCap: z.number().int().min(1).max(OUTREACH_CAP_LIMITS.perContactCapMax),
      senderName: z.string().min(1).max(128),
      sequence: z.array(stepInput).min(1).max(OUTREACH_CAP_LIMITS.maxSteps),
    }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      const before = await loadOutreachSettings(db);
      const next = normalizeOutreachSettings(input);
      await saveOutreachSettings(db, next, ctx.user.id);
      await logAdmin(db, ctx.user.id, "settings_changed", {
        before: { enabled: before.enabled, mode: before.mode, dailyCap: before.dailyCap, perContactCap: before.perContactCap },
        after: { enabled: next.enabled, mode: next.mode, dailyCap: next.dailyCap, perContactCap: next.perContactCap },
        steps: next.sequence.map((step) => ({ key: step.key, delayDays: step.delayDays, offer: Boolean(step.offerText) })),
      });
      return next;
    })),

  // ── Customer list import ────────────────────────────────────────────────────
  startImport: adminProcedure
    .input(z.object({ sourceTag: z.string().trim().min(1).max(128), fileName: z.string().max(256), totalRows: z.number().int().min(0).max(CONTACT_IMPORT_MAX_ROWS) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      const importId = await startContactImport(db, { ...input, userId: ctx.user.id });
      return { importId, batchSize: CONTACT_IMPORT_BATCH_SIZE };
    })),

  importBatch: adminProcedure
    .input(z.object({ importId: z.number().int().positive(), rows: z.array(importRow).min(1).max(CONTACT_IMPORT_BATCH_SIZE) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      return importContactBatch(db, { importId: input.importId, rows: input.rows, userId: ctx.user.id });
    })),

  finishImport: adminProcedure
    .input(z.object({ importId: z.number().int().positive(), clientSkipped: z.number().int().min(0).max(CONTACT_IMPORT_MAX_ROWS) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      const row = await finishContactImport(db, input.importId, input.clientSkipped);
      await logAdmin(db, ctx.user.id, "import_finished", { importId: input.importId, sourceTag: row?.sourceTag, imported: row?.importedCount, duplicates: row?.duplicateCount, skipped: row?.skippedCount });
      return row;
    })),

  // ── Enrolment ───────────────────────────────────────────────────────────────
  enroll: adminProcedure
    .input(z.object({ sourceTag: z.string().trim().min(1).max(128).optional(), dealIds: z.array(z.number().int().positive()).max(5000).optional() })
      .refine((value) => Boolean(value.sourceTag) || Boolean(value.dealIds?.length), "Pick a customer list or contacts."))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      const settings = await loadOutreachSettings(db);
      return enrollContacts(db, { ...input, userId: ctx.user.id, settings });
    })),

  enrollments: adminProcedure
    .input(z.object({ status: z.string().max(32).optional(), limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(({ input }) => guard(async () => {
      const db = await database();
      const query = db.select({
        id: outreachEnrollments.id,
        dealId: outreachEnrollments.dealId,
        email: outreachEnrollments.email,
        status: outreachEnrollments.status,
        currentStep: outreachEnrollments.currentStep,
        nextSendAt: outreachEnrollments.nextSendAt,
        sentCount: outreachEnrollments.sentCount,
        lastSentAt: outreachEnrollments.lastSentAt,
        stopReason: outreachEnrollments.stopReason,
        contactName: crmDeals.contactName,
        stage: crmDeals.stage,
      }).from(outreachEnrollments).leftJoin(crmDeals, eq(crmDeals.id, outreachEnrollments.dealId));
      const filtered = input?.status ? query.where(eq(outreachEnrollments.status, input.status as never)) : query;
      return filtered.orderBy(desc(outreachEnrollments.updatedAt)).limit(input?.limit ?? 100);
    })),

  setEnrollmentStatus: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "paused", "stopped"]) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      const [row] = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Enrolment not found." });
      if (input.status === "active") {
        const [suppressed] = await db.select({ id: outreachSuppressions.id }).from(outreachSuppressions).where(eq(outreachSuppressions.email, row.email)).limit(1);
        if (suppressed) throw new TRPCError({ code: "BAD_REQUEST", message: "This address is on the suppression list and cannot be resumed." });
        if (["unsubscribed", "bounced"].includes(row.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsubscribed or bounced contacts cannot be resumed." });
      }
      await db.update(outreachEnrollments).set({
        status: input.status,
        stopReason: input.status === "active" ? null : `${input.status} by admin`,
        ...(input.status === "active" ? { nextSendAt: row.nextSendAt ?? new Date() } : {}),
      }).where(eq(outreachEnrollments.id, input.id));
      if (input.status !== "active") {
        await db.update(outreachMessages).set({ status: "rejected", error: `${input.status} by admin` })
          .where(and(eq(outreachMessages.enrollmentId, input.id), inArray(outreachMessages.status, ["preview", "pending_approval", "approved"])));
      }
      await logAdmin(db, ctx.user.id, `enrollment_${input.status}`, { from: row.status }, { enrollmentId: input.id });
      return { ok: true };
    })),

  // ── Preview (renders, never sends, never stores) ─────────────────────────────
  preview: adminProcedure
    .input(z.object({ dealId: z.number().int().positive(), stepIndex: z.number().int().min(0).max(OUTREACH_CAP_LIMITS.maxSteps - 1).default(0) }))
    .mutation(({ input }) => guard(async () => {
      const db = await database();
      const [deal] = await db.select({ id: crmDeals.id, email: crmDeals.contactEmail, affiliateId: crmDeals.affiliateId }).from(crmDeals).where(eq(crmDeals.id, input.dealId)).limit(1);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
      const email = normalizeContactEmail(deal.email);
      if (!isValidContactEmail(email)) throw new TRPCError({ code: "BAD_REQUEST", message: "This contact has no valid email." });
      const settings = await loadOutreachSettings(db);
      const env = readOutreachEnv();
      const [enrolled] = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.dealId, deal.id)).limit(1);
      const enrollment = enrolled ? { ...previewEnrollment(deal.id, email), id: enrolled.id, unsubscribeToken: enrolled.unsubscribeToken } : previewEnrollment(deal.id, email);
      const deps = { store: createOutreachStore(db), env, llm: outreachLlm(), sendEmail: async () => ({ success: false, error: "preview never sends" }), notifyOwner: async () => false };
      const drafted = await draftForEnrollment(deps, enrollment, settings, input.stepIndex);
      if (!drafted) throw new TRPCError({ code: "BAD_REQUEST", message: "That step does not exist." });
      const rendered = renderOutreachEmail({ env: { ...env, mailingAddress: env.mailingAddress || "[OUTREACH_MAILING_ADDRESS not set]" }, subject: drafted.draft.subject, bodyText: drafted.draft.body, senderName: settings.senderName, unsubscribeToken: enrollment.unsubscribeToken, messageId: 0, customerListName: drafted.context.facts.customerListName });
      return { step: drafted.step, source: drafted.draft.source, problems: drafted.draft.problems, to: email, subject: rendered.subject, text: rendered.text, html: rendered.html, headers: rendered.headers, replyTo: rendered.replyTo ?? null };
    })),

  /** Sends one rendered preview to OWNER_EMAIL only (never to the customer). */
  sendTestToOwner: adminProcedure
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      const [message] = await db.select().from(outreachMessages).where(eq(outreachMessages.id, input.messageId)).limit(1);
      if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found." });
      const env = readOutreachEnv();
      const settings = await loadOutreachSettings(db);
      const rendered = renderOutreachEmail({ env: { ...env, mailingAddress: env.mailingAddress || "[OUTREACH_MAILING_ADDRESS not set]" }, subject: message.subject, bodyText: message.bodyText, senderName: settings.senderName, unsubscribeToken: "0".repeat(48), messageId: message.id, customerListName: null });
      const result = await sendEmail({ to: env.ownerEmail, subject: `[TEST to you, not the customer] ${rendered.subject}`, text: `This is a test copy of the draft for ${message.toEmail}. The customer did not receive it.\n\n${rendered.text}`, html: rendered.html });
      await logAdmin(db, ctx.user.id, "test_sent_to_owner", { ok: result.success, error: result.error ?? null }, { messageId: message.id });
      if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Test email failed." });
      return { ok: true, to: env.ownerEmail };
    })),

  // ── Approval queue ──────────────────────────────────────────────────────────
  queue: adminProcedure
    .input(z.object({ status: z.enum(["preview", "pending_approval", "approved", "sent", "failed", "rejected", "skipped"]).default("pending_approval"), limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(({ input }) => guard(async () => {
      const db = await database();
      return db.select({
        id: outreachMessages.id,
        enrollmentId: outreachMessages.enrollmentId,
        dealId: outreachMessages.dealId,
        stepIndex: outreachMessages.stepIndex,
        toEmail: outreachMessages.toEmail,
        subject: outreachMessages.subject,
        bodyText: outreachMessages.bodyText,
        draftSource: outreachMessages.draftSource,
        status: outreachMessages.status,
        error: outreachMessages.error,
        sentAt: outreachMessages.sentAt,
        createdAt: outreachMessages.createdAt,
        contactName: crmDeals.contactName,
      }).from(outreachMessages).leftJoin(crmDeals, eq(crmDeals.id, outreachMessages.dealId))
        .where(eq(outreachMessages.status, input?.status ?? "pending_approval"))
        .orderBy(desc(outreachMessages.createdAt)).limit(input?.limit ?? 50);
    })),

  editDraft: adminProcedure
    .input(z.object({ id: z.number().int().positive(), subject: z.string().trim().min(3).max(200), bodyText: z.string().trim().min(20).max(4000) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      const result = await db.update(outreachMessages).set({ subject: input.subject, bodyText: input.bodyText })
        .where(and(eq(outreachMessages.id, input.id), inArray(outreachMessages.status, ["preview", "pending_approval"])));
      await logAdmin(db, ctx.user.id, "draft_edited", {}, { messageId: input.id });
      return { ok: true, result: Boolean(result) };
    })),

  approve: adminProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      await db.update(outreachMessages).set({ status: "approved", approvedByUserId: ctx.user.id, approvedAt: new Date() })
        .where(and(inArray(outreachMessages.id, input.ids), inArray(outreachMessages.status, ["pending_approval", "preview"])));
      await logAdmin(db, ctx.user.id, "approved", { ids: input.ids });
      return { ok: true };
    })),

  reject: adminProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const db = await database();
      await db.update(outreachMessages).set({ status: "rejected", error: "rejected by admin" })
        .where(and(inArray(outreachMessages.id, input.ids), inArray(outreachMessages.status, ["pending_approval", "preview", "approved"])));
      await logAdmin(db, ctx.user.id, "rejected", { ids: input.ids });
      return { ok: true };
    })),

  // ── Suppression list + audit log ────────────────────────────────────────────
  suppressions: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(({ input }) => guard(async () => {
      const db = await database();
      return db.select().from(outreachSuppressions).orderBy(desc(outreachSuppressions.createdAt)).limit(input?.limit ?? 100);
    })),

  addSuppression: adminProcedure
    .input(z.object({ email: z.string().trim().max(320) }))
    .mutation(({ ctx, input }) => guard(async () => {
      const email = normalizeContactEmail(input.email);
      if (!isValidContactEmail(email)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid email address." });
      const db = await database();
      await createOutreachStore(db).suppress(email, "manual", `added by admin ${ctx.user.id}`);
      const enrolled = await db.select({ id: outreachEnrollments.id }).from(outreachEnrollments).where(eq(outreachEnrollments.email, email));
      for (const row of enrolled) {
        await db.update(outreachEnrollments).set({ status: "unsubscribed", stopReason: "suppressed by admin", nextSendAt: null }).where(eq(outreachEnrollments.id, row.id));
        await db.update(outreachMessages).set({ status: "rejected", error: "suppressed by admin" })
          .where(and(eq(outreachMessages.enrollmentId, row.id), inArray(outreachMessages.status, ["preview", "pending_approval", "approved"])));
      }
      return { ok: true };
    })),

  events: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(({ input }) => guard(async () => {
      const db = await database();
      return db.select().from(outreachEvents).orderBy(desc(outreachEvents.createdAt)).limit(input?.limit ?? 100);
    })),

  /** Owner alert check: confirms the "reply / are you a bot" alerts reach Tom. */
  testOwnerAlert: adminProcedure.mutation(async () => {
    const ok = await notifyOwner({ title: "Outreach alert test", content: "This is how outreach replies and \"are you a real person?\" questions will reach you. No customer received anything." });
    return { ok };
  }),
});
