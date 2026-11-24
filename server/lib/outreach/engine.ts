// Outreach engine: drafts due emails, sends approved ones within the caps, and
// reacts to replies, unsubscribes, bounces, clicks and design starts. All I/O
// goes through injected dependencies so tests run with a fake store, a mocked
// mailer and a mocked AI.

import type { OutreachSettings, OutreachSignal, OutreachStep } from "@shared/crmOutreach";
import type { SendEmailOptions, SendEmailResult } from "../../email";
import { draftOutreachEmail, type LlmInvoke, type OutreachContactFacts } from "./ai";
import { effectiveMode, sendBlockers, type OutreachEnv } from "./config";
import { renderOutreachEmail, OUTREACH_LINK_TARGETS, type OutreachLinkKey } from "./render";
import { bareAddress, classifyReply, latestReplyText } from "./replies";

export type EnrollmentStatus = "active" | "paused" | "completed" | "replied" | "unsubscribed" | "bounced" | "needs_owner" | "stopped";
export type MessageStatus = "preview" | "pending_approval" | "approved" | "sending" | "sent" | "failed" | "rejected" | "skipped";
export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual" | "reply_stop";

export type EnrollmentRecord = {
  id: number;
  dealId: number;
  email: string;
  status: EnrollmentStatus;
  currentStep: number;
  nextSendAt: Date | null;
  sentCount: number;
  lastSentAt: Date | null;
  unsubscribeToken: string;
};

export type MessageRecord = {
  id: number;
  enrollmentId: number;
  dealId: number;
  stepIndex: number;
  toEmail: string;
  subject: string;
  bodyText: string;
  status: MessageStatus;
  providerMessageId?: string | null;
};

export type ContactContext = {
  facts: OutreachContactFacts;
  dealStage: string;
  affiliateId: number | null;
};

export type OutreachEventInput = {
  eventType: string;
  enrollmentId?: number | null;
  messageId?: number | null;
  dealId?: number | null;
  email?: string | null;
  actorUserId?: number | null;
  detail?: Record<string, unknown>;
};

export interface OutreachStore {
  getSettings(): Promise<OutreachSettings>;
  isSuppressed(email: string): Promise<boolean>;
  suppress(email: string, reason: SuppressionReason, source: string): Promise<void>;
  countSentSince(since: Date): Promise<number>;
  listDueEnrollments(now: Date, limit: number): Promise<EnrollmentRecord[]>;
  claimEnrollment(id: number, now: Date, lockUntil: Date): Promise<boolean>;
  releaseEnrollment(id: number): Promise<void>;
  hasOpenMessage(enrollmentId: number, stepIndex: number): Promise<boolean>;
  loadContactContext(enrollment: EnrollmentRecord): Promise<ContactContext | null>;
  blockedNames(): Promise<string[]>;
  insertMessage(row: Omit<MessageRecord, "id"> & { draftSource: "ai" | "fallback" }): Promise<number>;
  updateMessage(id: number, patch: Partial<{ status: MessageStatus; providerMessageId: string | null; transport: string | null; fromAddress: string | null; error: string | null; sentAt: Date | null }>): Promise<void>;
  claimMessageForSend(id: number): Promise<boolean>;
  listApprovedMessages(limit: number): Promise<MessageRecord[]>;
  getEnrollment(id: number): Promise<EnrollmentRecord | null>;
  findEnrollmentByToken(token: string): Promise<EnrollmentRecord | null>;
  findEnrollmentsByEmail(email: string): Promise<EnrollmentRecord[]>;
  findMessageByProviderId(providerMessageId: string): Promise<MessageRecord | null>;
  updateEnrollment(id: number, patch: Partial<{ status: EnrollmentStatus; currentStep: number; nextSendAt: Date | null; sentCount: number; lastSentAt: Date | null; stopReason: string | null }>): Promise<void>;
  rejectOpenMessages(enrollmentId: number): Promise<void>;
  logEvent(event: OutreachEventInput): Promise<void>;
  addDealActivity(dealId: number, body: string): Promise<void>;
  advanceDealStage(dealId: number, signal: OutreachSignal): Promise<string | null>;
}

export type OutreachDeps = {
  store: OutreachStore;
  env: OutreachEnv;
  sendEmail: (opts: SendEmailOptions & { headers?: Record<string, string> }) => Promise<SendEmailResult>;
  llm: LlmInvoke | null;
  notifyOwner: (title: string, content: string) => Promise<boolean>;
  now?: () => Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** No contact gets two outreach emails within this window, whatever the sequence says. */
export const MIN_GAP_BETWEEN_SENDS_MS = 20 * 60 * 60 * 1000;
const ENROLLMENT_LOCK_MS = 10 * 60 * 1000;
const MAX_DRAFTS_PER_TICK = 50;

export type TickReport = {
  ran: boolean;
  reason?: string;
  mode?: "preview" | "approval" | "auto";
  drafted: number;
  sent: number;
  failed: number;
  skipped: number;
  completed: number;
  capRemaining?: number;
};

/** Permanent delivery failures: the address is treated as bounced and suppressed. */
export function isPermanentFailure(error: string | undefined): boolean {
  if (!error) return false;
  return /\b5\.\d\.\d\b|\b55[0-4]\b|mailbox (unavailable|not found|does not exist)|user unknown|no such user|recipient (address )?rejected|invalid (recipient|address|email)|does not exist|hard bounce|bounced/i.test(error);
}

function stepAt(settings: OutreachSettings, index: number): OutreachStep | null {
  return settings.sequence[index] ?? null;
}

async function stopEnrollment(deps: OutreachDeps, enrollment: EnrollmentRecord, status: EnrollmentStatus, reason: string) {
  await deps.store.updateEnrollment(enrollment.id, { status, stopReason: reason, nextSendAt: null });
  await deps.store.rejectOpenMessages(enrollment.id);
  await deps.store.logEvent({ eventType: `stopped_${status}`, enrollmentId: enrollment.id, dealId: enrollment.dealId, email: enrollment.email, detail: { reason } });
}

/** Draft one email for an enrollment's current step. Used by the tick and by Preview. */
export async function draftForEnrollment(deps: OutreachDeps, enrollment: EnrollmentRecord, settings: OutreachSettings, stepIndex = enrollment.currentStep) {
  const step = stepAt(settings, stepIndex);
  if (!step) return null;
  const context = await deps.store.loadContactContext(enrollment);
  if (!context) return null;
  const blockedNames = await deps.store.blockedNames();
  const draft = await draftOutreachEmail({
    facts: context.facts,
    step,
    stepIndex,
    senderName: settings.senderName,
    blockedNames,
    now: (deps.now ?? (() => new Date()))(),
    llm: deps.llm,
  });
  return { draft, step, context };
}

/**
 * One scheduler tick. Off unless OUTREACH_ENABLED=true AND the admin switch is
 * on. Preview mode drafts but never sends. Approval mode sends only drafts Tom
 * approved. Auto mode drafts and sends. Every send re-checks the suppression
 * list, the daily cap and the per-contact cap first.
 */
export async function runOutreachTick(deps: OutreachDeps): Promise<TickReport> {
  const now = (deps.now ?? (() => new Date()))();
  const report: TickReport = { ran: false, drafted: 0, sent: 0, failed: 0, skipped: 0, completed: 0 };
  if (!deps.env.envEnabled) return { ...report, reason: "OUTREACH_ENABLED is off" };
  const settings = await deps.store.getSettings();
  if (!settings.enabled) return { ...report, reason: "admin switch is off" };
  const mode = effectiveMode(deps.env, settings.mode);
  report.ran = true;
  report.mode = mode;

  // ── Drafting ────────────────────────────────────────────────────────────────
  const due = await deps.store.listDueEnrollments(now, MAX_DRAFTS_PER_TICK);
  for (const enrollment of due) {
    if (!(await deps.store.claimEnrollment(enrollment.id, now, new Date(now.getTime() + ENROLLMENT_LOCK_MS)))) continue;
    try {
      if (await deps.store.isSuppressed(enrollment.email)) {
        await stopEnrollment(deps, enrollment, "unsubscribed", "address is on the suppression list");
        report.skipped += 1;
        continue;
      }
      if (enrollment.sentCount >= settings.perContactCap || !stepAt(settings, enrollment.currentStep)) {
        await deps.store.updateEnrollment(enrollment.id, { status: "completed", nextSendAt: null, stopReason: "sequence finished" });
        await deps.store.logEvent({ eventType: "completed", enrollmentId: enrollment.id, dealId: enrollment.dealId, email: enrollment.email });
        report.completed += 1;
        continue;
      }
      if (await deps.store.hasOpenMessage(enrollment.id, enrollment.currentStep)) continue;
      const drafted = await draftForEnrollment(deps, enrollment, settings);
      if (!drafted) { report.skipped += 1; continue; }
      if (drafted.context.affiliateId != null) {
        // House outreach only. An affiliate's customer is never emailed from here.
        await stopEnrollment(deps, enrollment, "stopped", "contact belongs to an affiliate");
        report.skipped += 1;
        continue;
      }
      const status: MessageStatus = mode === "preview" ? "preview" : mode === "approval" ? "pending_approval" : "approved";
      const messageId = await deps.store.insertMessage({
        enrollmentId: enrollment.id,
        dealId: enrollment.dealId,
        stepIndex: enrollment.currentStep,
        toEmail: enrollment.email,
        subject: drafted.draft.subject,
        bodyText: drafted.draft.body,
        status,
        draftSource: drafted.draft.source,
      });
      await deps.store.logEvent({
        eventType: "drafted",
        enrollmentId: enrollment.id,
        messageId,
        dealId: enrollment.dealId,
        email: enrollment.email,
        detail: { status, step: drafted.step.key, source: drafted.draft.source, problems: drafted.draft.problems },
      });
      report.drafted += 1;
    } finally {
      await deps.store.releaseEnrollment(enrollment.id);
    }
  }

  // ── Sending ────────────────────────────────────────────────────────────────
  if (mode === "preview" || sendBlockers(deps.env, settings).length) return report;
  const sentToday = await deps.store.countSentSince(new Date(now.getTime() - DAY_MS));
  let remaining = Math.max(0, settings.dailyCap - sentToday);
  report.capRemaining = remaining;
  if (remaining === 0) return report;
  const approved = await deps.store.listApprovedMessages(remaining);
  for (const message of approved) {
    if (remaining <= 0) break;
    if (!(await deps.store.claimMessageForSend(message.id))) continue;
    const outcome = await sendOne(deps, message, settings, now);
    if (outcome === "sent") { report.sent += 1; remaining -= 1; }
    else if (outcome === "failed") report.failed += 1;
    else report.skipped += 1;
  }
  report.capRemaining = remaining;
  return report;
}

async function sendOne(deps: OutreachDeps, message: MessageRecord, settings: OutreachSettings, now: Date): Promise<"sent" | "failed" | "skipped"> {
  const { store } = deps;
  const enrollment = await store.getEnrollment(message.enrollmentId);
  const skip = async (reason: string, status: MessageStatus = "skipped") => {
    await store.updateMessage(message.id, { status, error: reason });
    await store.logEvent({ eventType: "send_skipped", enrollmentId: message.enrollmentId, messageId: message.id, dealId: message.dealId, email: message.toEmail, detail: { reason } });
    return "skipped" as const;
  };
  if (!enrollment || enrollment.status !== "active") return skip("enrollment is not active");
  if (enrollment.currentStep !== message.stepIndex) return skip("draft is for a different step");
  if (enrollment.email !== message.toEmail) return skip("address changed since the draft");
  if (await store.isSuppressed(message.toEmail)) {
    await stopEnrollment(deps, enrollment, "unsubscribed", "address is on the suppression list");
    return skip("address is on the suppression list");
  }
  if (enrollment.sentCount >= settings.perContactCap) return skip("per-contact cap reached");
  if (enrollment.lastSentAt && now.getTime() - enrollment.lastSentAt.getTime() < MIN_GAP_BETWEEN_SENDS_MS) {
    // Too soon after the last email: put it back for a later tick.
    await store.updateMessage(message.id, { status: "approved" });
    return "skipped";
  }
  const context = await store.loadContactContext(enrollment);
  const rendered = renderOutreachEmail({
    env: deps.env,
    subject: message.subject,
    bodyText: message.bodyText,
    senderName: settings.senderName,
    unsubscribeToken: enrollment.unsubscribeToken,
    messageId: message.id,
    customerListName: context?.facts.customerListName ?? null,
  });
  let result: SendEmailResult;
  try {
    result = await deps.sendEmail({
      to: message.toEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      replyTo: rendered.replyTo,
      headers: rendered.headers,
    });
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!result.success) {
    const error = (result.error ?? "send failed").slice(0, 1000);
    await store.updateMessage(message.id, { status: "failed", error, transport: result.transport ?? null });
    await store.logEvent({ eventType: "send_failed", enrollmentId: enrollment.id, messageId: message.id, dealId: message.dealId, email: message.toEmail, detail: { error } });
    if (isPermanentFailure(error)) {
      await store.suppress(message.toEmail, "bounce", `send failure: ${error.slice(0, 100)}`);
      await stopEnrollment(deps, enrollment, "bounced", "permanent delivery failure");
    }
    return "failed";
  }
  await store.updateMessage(message.id, {
    status: "sent",
    providerMessageId: result.messageId ?? null,
    transport: result.transport ?? null,
    fromAddress: result.from ?? null,
    sentAt: now,
    error: null,
  });
  const nextIndex = enrollment.currentStep + 1;
  const nextStep = stepAt(settings, nextIndex);
  const sentCount = enrollment.sentCount + 1;
  const finished = !nextStep || sentCount >= settings.perContactCap;
  await store.updateEnrollment(enrollment.id, {
    sentCount,
    lastSentAt: now,
    currentStep: nextIndex,
    status: finished ? "completed" : "active",
    nextSendAt: finished ? null : new Date(now.getTime() + Math.max(1, nextStep!.delayDays) * DAY_MS),
    stopReason: finished ? "sequence finished" : null,
  });
  await store.logEvent({
    eventType: "sent",
    enrollmentId: enrollment.id,
    messageId: message.id,
    dealId: message.dealId,
    email: message.toEmail,
    detail: { subject: message.subject, step: message.stepIndex, transport: result.transport, providerMessageId: result.messageId ?? null, from: result.from ?? null },
  });
  await store.addDealActivity(message.dealId, `Outreach email ${message.stepIndex + 1} sent: "${message.subject}"`);
  return "sent";
}

// ── Signals ──────────────────────────────────────────────────────────────────

export async function handleUnsubscribe(deps: OutreachDeps, token: string, via: "link" | "one_click"): Promise<{ ok: boolean }> {
  const enrollment = await deps.store.findEnrollmentByToken(token);
  if (!enrollment) return { ok: false };
  await deps.store.suppress(enrollment.email, "unsubscribe", via === "one_click" ? "List-Unsubscribe one-click" : "unsubscribe link");
  if (enrollment.status !== "unsubscribed") {
    await stopEnrollment(deps, enrollment, "unsubscribed", `unsubscribed via ${via === "one_click" ? "mail app" : "link"}`);
    await deps.store.addDealActivity(enrollment.dealId, "Unsubscribed from outreach emails.");
  }
  await deps.store.logEvent({ eventType: "unsubscribed", enrollmentId: enrollment.id, dealId: enrollment.dealId, email: enrollment.email, detail: { via } });
  return { ok: true };
}

export async function handleClick(deps: OutreachDeps, token: string, messageId: number, key: string): Promise<string> {
  const path = OUTREACH_LINK_TARGETS[(key in OUTREACH_LINK_TARGETS ? key : "home") as OutreachLinkKey];
  const target = `${deps.env.publicBaseUrl}${path}`;
  const enrollment = await deps.store.findEnrollmentByToken(token);
  if (!enrollment) return target;
  await deps.store.logEvent({ eventType: "clicked", enrollmentId: enrollment.id, messageId: Number.isFinite(messageId) ? messageId : null, dealId: enrollment.dealId, email: enrollment.email, detail: { link: key } });
  const stage = await deps.store.advanceDealStage(enrollment.dealId, "click");
  if (stage) await deps.store.addDealActivity(enrollment.dealId, `Clicked the outreach email link. Stage moved to ${stage}.`);
  return target;
}

/** Called when a guest or customer enters their email to start a design. Never throws. */
export async function noteDesignStart(deps: OutreachDeps, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const enrollments = await deps.store.findEnrollmentsByEmail(normalized);
  for (const enrollment of enrollments) {
    await deps.store.logEvent({ eventType: "design_started", enrollmentId: enrollment.id, dealId: enrollment.dealId, email: normalized });
    const stage = await deps.store.advanceDealStage(enrollment.dealId, "design_start");
    if (stage) await deps.store.addDealActivity(enrollment.dealId, `Started a design after outreach. Stage moved to ${stage}.`);
  }
}

export type InboundReply = { from: string; subject: string; text: string };

const AUTOMATION_QUESTION_NOTE = "They asked whether they are talking to a real person or an automated system. Please answer them yourself. The follow-up emails were drafted and sent by the CabinetDealz outreach system, so do not tell them otherwise. Their sequence is paused and nothing further will be sent automatically.";

export async function handleInboundReply(deps: OutreachDeps, reply: InboundReply): Promise<{ kind: string; matched: number }> {
  const email = bareAddress(reply.from);
  const fresh = latestReplyText(reply.text);
  const kind = classifyReply(reply.subject, fresh);
  const enrollments = (await deps.store.findEnrollmentsByEmail(email)).filter((e) => !["unsubscribed", "bounced"].includes(e.status));
  const excerpt = fresh.slice(0, 2000);

  if (kind === "auto_reply") {
    for (const e of enrollments) await deps.store.logEvent({ eventType: "auto_reply", enrollmentId: e.id, dealId: e.dealId, email, detail: { subject: reply.subject.slice(0, 200) } });
    return { kind, matched: enrollments.length };
  }

  if (kind === "unsubscribe") {
    await deps.store.suppress(email, "reply_stop", "asked by reply");
    for (const e of enrollments) {
      await stopEnrollment(deps, e, "unsubscribed", "asked by reply to stop");
      await deps.store.addDealActivity(e.dealId, "Replied asking to stop outreach emails. Unsubscribed.");
    }
  } else {
    const status: EnrollmentStatus = kind === "asks_if_automated" ? "needs_owner" : "replied";
    for (const e of enrollments) {
      await stopEnrollment(deps, e, status, kind === "asks_if_automated" ? "asked if this is automated" : "customer replied");
      const stage = await deps.store.advanceDealStage(e.dealId, "reply");
      await deps.store.addDealActivity(e.dealId, `Replied to outreach email${stage ? ` (stage moved to ${stage})` : ""}: ${excerpt.slice(0, 500)}`);
    }
  }
  for (const e of enrollments) {
    await deps.store.logEvent({ eventType: `reply_${kind}`, enrollmentId: e.id, dealId: e.dealId, email, detail: { subject: reply.subject.slice(0, 200) } });
  }
  if (!enrollments.length) await deps.store.logEvent({ eventType: `reply_unmatched`, email, detail: { kind, subject: reply.subject.slice(0, 200) } });

  const title = kind === "asks_if_automated"
    ? `Answer personally: ${email} asked if they're talking to a person`
    : kind === "unsubscribe"
      ? `Unsubscribed by reply: ${email}`
      : `Outreach reply from ${email}`;
  const content = [
    kind === "asks_if_automated" ? AUTOMATION_QUESTION_NOTE : kind === "unsubscribe" ? "They asked to stop. They are on the suppression list and will not get more outreach email." : "Their outreach sequence is stopped so you can answer them yourself. Nothing was sent back automatically.",
    "",
    `Subject: ${reply.subject}`,
    "",
    excerpt || "(no text)",
  ].join("\n");
  try { await deps.notifyOwner(title, content); } catch { /* alert is best-effort; the event is logged */ }
  return { kind, matched: enrollments.length };
}

export async function handleDeliveryEvent(deps: OutreachDeps, event: { type: string; providerMessageId: string | null; email: string | null }): Promise<void> {
  const message = event.providerMessageId ? await deps.store.findMessageByProviderId(event.providerMessageId) : null;
  const email = (message?.toEmail ?? event.email ?? "").trim().toLowerCase();
  const enrollment = message ? await deps.store.getEnrollment(message.enrollmentId) : null;
  const type = event.type.replace(/^email\./, "");
  await deps.store.logEvent({ eventType: `delivery_${type}`, enrollmentId: enrollment?.id ?? null, messageId: message?.id ?? null, dealId: message?.dealId ?? null, email: email || null });
  if (!email) return;
  if (type === "bounced") {
    await deps.store.suppress(email, "bounce", "provider bounce event");
    if (enrollment) await stopEnrollment(deps, enrollment, "bounced", "email bounced");
  } else if (type === "complained") {
    await deps.store.suppress(email, "complaint", "marked as spam");
    if (enrollment) await stopEnrollment(deps, enrollment, "unsubscribed", "marked the email as spam");
  }
}
