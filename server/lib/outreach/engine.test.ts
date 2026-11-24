import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OUTREACH_SETTINGS, outreachStageAdvance, type OutreachSettings } from "@shared/crmOutreach";
import { readOutreachEnv, type OutreachEnv } from "./config";
import {
  handleClick,
  handleDeliveryEvent,
  handleInboundReply,
  handleUnsubscribe,
  noteDesignStart,
  runOutreachTick,
  type EnrollmentRecord,
  type MessageRecord,
  type OutreachDeps,
  type OutreachEventInput,
  type OutreachStore,
} from "./engine";

const GOOD = { subject: "Checking in from CabinetDealz", body: "Hi Jane,\n\nIt has been a while and I wanted to say hello. CabinetDealz now has an online kitchen designer where you can try door styles and colors.\n\nIf a kitchen or bath project is on your mind, just reply and let me know." };

type Fake = OutreachStore & {
  settings: OutreachSettings;
  enrollments: EnrollmentRecord[];
  messages: Array<MessageRecord & { draftSource?: string; error?: string | null; sentAt?: Date | null }>;
  suppressed: Map<string, string>;
  events: OutreachEventInput[];
  activities: Array<{ dealId: number; body: string }>;
  stages: Map<number, string>;
  affiliateOf: Map<number, number | null>;
};

function fakeStore(): Fake {
  const s: Fake = {
    settings: { ...DEFAULT_OUTREACH_SETTINGS, sequence: DEFAULT_OUTREACH_SETTINGS.sequence.map((x) => ({ ...x })) },
    enrollments: [],
    messages: [],
    suppressed: new Map(),
    events: [],
    activities: [],
    stages: new Map(),
    affiliateOf: new Map(),
    async getSettings() { return s.settings; },
    async isSuppressed(email) { return s.suppressed.has(email); },
    async suppress(email, reason) { if (!s.suppressed.has(email)) s.suppressed.set(email, reason); },
    async countSentSince(since) { return s.messages.filter((m) => m.status === "sent" && m.sentAt && m.sentAt >= since).length; },
    async listDueEnrollments(now, limit) { return s.enrollments.filter((e) => e.status === "active" && e.nextSendAt && e.nextSendAt <= now).slice(0, limit); },
    async claimEnrollment() { return true; },
    async releaseEnrollment() {},
    async hasOpenMessage(id, step) { return s.messages.some((m) => m.enrollmentId === id && m.stepIndex === step && ["preview", "pending_approval", "approved", "sending", "sent"].includes(m.status)); },
    async loadContactContext(e) {
      return { dealStage: s.stages.get(e.dealId) ?? "new", affiliateId: s.affiliateOf.get(e.dealId) ?? null, facts: { firstName: "Jane", city: "Concord", state: "NH", lastPurchaseDate: null, customerListName: "New Hampshire legacy", notesFromList: null, savedDesignCount: 0, previousSubjects: [] } };
    },
    async blockedNames() { return ["US Cabinet Depot", "Pelican"]; },
    async insertMessage(row) { const id = s.messages.length + 1; s.messages.push({ ...row, id }); return id; },
    async updateMessage(id, patch) { Object.assign(s.messages.find((m) => m.id === id)!, patch); },
    async claimMessageForSend(id) { const m = s.messages.find((x) => x.id === id); if (m?.status !== "approved") return false; m.status = "sending"; return true; },
    async listApprovedMessages(limit) { return s.messages.filter((m) => m.status === "approved").slice(0, limit); },
    async getEnrollment(id) { return s.enrollments.find((e) => e.id === id) ?? null; },
    async findEnrollmentByToken(token) { return s.enrollments.find((e) => e.unsubscribeToken === token) ?? null; },
    async findEnrollmentsByEmail(email) { return s.enrollments.filter((e) => e.email === email); },
    async findMessageByProviderId(pid) { return s.messages.find((m) => m.providerMessageId === pid) ?? null; },
    async updateEnrollment(id, patch) { Object.assign(s.enrollments.find((e) => e.id === id)!, patch); },
    async rejectOpenMessages(id) { for (const m of s.messages) if (m.enrollmentId === id && ["preview", "pending_approval", "approved"].includes(m.status)) m.status = "rejected"; },
    async logEvent(event) { s.events.push(event); },
    async addDealActivity(dealId, body) { s.activities.push({ dealId, body }); },
    async advanceDealStage(dealId, signal) {
      const next = outreachStageAdvance(s.stages.get(dealId) ?? "new", signal);
      if (next) s.stages.set(dealId, next);
      return next;
    },
  };
  return s;
}

const NOW = new Date("2026-11-23T15:00:00Z");
const LIVE_ENV: OutreachEnv = {
  ...readOutreachEnv({}),
  envEnabled: true,
  mailingAddress: "PO Box 1, Example, NH 03000",
  replyTo: "replies@in.example.com",
  inboundSecretSet: true,
};

function enroll(store: Fake, id: number, email = `c${id}@example.com`): EnrollmentRecord {
  const e: EnrollmentRecord = { id, dealId: 100 + id, email, status: "active", currentStep: 0, nextSendAt: new Date(NOW.getTime() - 1000), sentCount: 0, lastSentAt: null, unsubscribeToken: `${String(id).padStart(2, "0")}${"a".repeat(46)}` };
  store.enrollments.push(e);
  return e;
}

let store: Fake;
let sendEmail: ReturnType<typeof vi.fn>;
let llm: ReturnType<typeof vi.fn>;
let notifyOwner: ReturnType<typeof vi.fn>;
let deps: OutreachDeps;

beforeEach(() => {
  store = fakeStore();
  sendEmail = vi.fn().mockResolvedValue({ success: true, messageId: "re_123", transport: "resend", from: "orders@cabinetdealz.com" });
  llm = vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(GOOD) } }] });
  notifyOwner = vi.fn().mockResolvedValue(true);
  deps = { store, env: LIVE_ENV, sendEmail, llm, notifyOwner, now: () => NOW };
});

describe("master switches", () => {
  it("does nothing while OUTREACH_ENABLED is off, even with the admin switch on", async () => {
    store.settings.enabled = true; store.settings.mode = "auto"; enroll(store, 1);
    const report = await runOutreachTick({ ...deps, env: { ...LIVE_ENV, envEnabled: false } });
    expect(report.ran).toBe(false);
    expect(llm).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does nothing while the admin switch is off (the default)", async () => {
    enroll(store, 1);
    expect(DEFAULT_OUTREACH_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_OUTREACH_SETTINGS.mode).toBe("preview");
    const report = await runOutreachTick(deps);
    expect(report.ran).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("modes", () => {
  it("preview mode drafts but never sends", async () => {
    store.settings.enabled = true; store.settings.mode = "preview"; enroll(store, 1);
    const report = await runOutreachTick(deps);
    expect(report.drafted).toBe(1);
    expect(store.messages[0].status).toBe("preview");
    expect(sendEmail).not.toHaveBeenCalled();
    await runOutreachTick(deps);
    expect(store.messages).toHaveLength(1); // no duplicate draft for the same step
  });

  it("approval mode waits for approval, then sends", async () => {
    store.settings.enabled = true; store.settings.mode = "approval"; enroll(store, 1);
    await runOutreachTick(deps);
    expect(store.messages[0].status).toBe("pending_approval");
    expect(sendEmail).not.toHaveBeenCalled();
    store.messages[0].status = "approved"; // Tom clicks Approve
    const report = await runOutreachTick(deps);
    expect(report.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(store.enrollments[0]).toMatchObject({ currentStep: 1, sentCount: 1, status: "active" });
    expect(store.enrollments[0].nextSendAt!.getTime() - NOW.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("auto mode falls back to approval when reply detection is not configured", async () => {
    store.settings.enabled = true; store.settings.mode = "auto"; enroll(store, 1);
    const report = await runOutreachTick({ ...deps, env: { ...LIVE_ENV, inboundSecretSet: false } });
    expect(report.mode).toBe("approval");
    expect(store.messages[0].status).toBe("pending_approval");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses to send without a postal mailing address", async () => {
    store.settings.enabled = true; store.settings.mode = "auto"; enroll(store, 1);
    await runOutreachTick({ ...deps, env: { ...LIVE_ENV, mailingAddress: "" } });
    expect(store.messages[0].status).toBe("approved");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("caps and suppression", () => {
  beforeEach(() => { store.settings.enabled = true; store.settings.mode = "auto"; });

  it("honors the daily cap", async () => {
    store.settings.dailyCap = 2;
    for (let i = 1; i <= 5; i += 1) enroll(store, i);
    const report = await runOutreachTick(deps);
    expect(report.drafted).toBe(5);
    expect(report.sent).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(store.messages.filter((m) => m.status === "approved")).toHaveLength(3);
  });

  it("honors the per-contact cap and finishes the sequence", async () => {
    store.settings.perContactCap = 1;
    enroll(store, 1);
    await runOutreachTick(deps);
    expect(store.enrollments[0].status).toBe("completed");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("never sends to a suppressed address, even with an approved draft", async () => {
    const e = enroll(store, 1);
    store.messages.push({ id: 1, enrollmentId: e.id, dealId: e.dealId, stepIndex: 0, toEmail: e.email, subject: GOOD.subject, bodyText: GOOD.body, status: "approved" });
    store.suppressed.set(e.email, "unsubscribe");
    await runOutreachTick(deps);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.enrollments[0].status).toBe("unsubscribed");
  });

  it("never sends to an affiliate's contact", async () => {
    const e = enroll(store, 1);
    store.affiliateOf.set(e.dealId, 7);
    await runOutreachTick(deps);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.enrollments[0].status).toBe("stopped");
  });

  it("suppresses the address on a permanent delivery failure", async () => {
    sendEmail.mockResolvedValueOnce({ success: false, error: "550 5.1.1 mailbox does not exist" });
    enroll(store, 1);
    const report = await runOutreachTick(deps);
    expect(report.failed).toBe(1);
    expect(store.suppressed.get("c1@example.com")).toBe("bounce");
    expect(store.enrollments[0].status).toBe("bounced");
  });
});

describe("the email that goes out", () => {
  it("has the footer, the postal address, a working unsubscribe link and one-click headers", async () => {
    store.settings.enabled = true; store.settings.mode = "auto"; enroll(store, 1);
    await runOutreachTick(deps);
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.to).toBe("c1@example.com");
    expect(sent.subject).toBe(GOOD.subject);
    expect(sent.replyTo).toBe("replies@in.example.com");
    expect(sent.text).toContain("PO Box 1, Example, NH 03000");
    expect(sent.text).toContain("https://www.cabinetdealz.com/api/outreach/unsubscribe/01");
    expect(sent.html).toContain("Unsubscribe</a>");
    expect(sent.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/www\.cabinetdealz\.com\/api\/outreach\/unsubscribe\/01a+>$/);
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.text).not.toMatch(/US Cabinet Depot|Pelican/);
    expect(store.events.some((e) => e.eventType === "sent")).toBe(true);
  });
});

describe("signals", () => {
  it("unsubscribe suppresses, stops the sequence and rejects queued drafts", async () => {
    const e = enroll(store, 1);
    store.messages.push({ id: 1, enrollmentId: e.id, dealId: e.dealId, stepIndex: 0, toEmail: e.email, subject: "s", bodyText: "b", status: "pending_approval" });
    expect(await handleUnsubscribe(deps, e.unsubscribeToken, "one_click")).toEqual({ ok: true });
    expect(store.suppressed.get(e.email)).toBe("unsubscribe");
    expect(store.enrollments[0].status).toBe("unsubscribed");
    expect(store.messages[0].status).toBe("rejected");
  });

  it("a reply asking 'are you a bot?' goes to Tom, pauses the contact and is never auto-answered", async () => {
    const e = enroll(store, 1);
    const result = await handleInboundReply(deps, { from: `Jane <${e.email}>`, subject: "Re: Checking in", text: "Is this a real person or a bot?" });
    expect(result.kind).toBe("asks_if_automated");
    expect(store.enrollments[0].status).toBe("needs_owner");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    const [title, content] = notifyOwner.mock.calls[0];
    expect(title).toMatch(/asked if they're talking to a person/);
    expect(content).toMatch(/do not tell them otherwise/);
  });

  it("any other reply stops the sequence, moves the stage forward and alerts Tom", async () => {
    const e = enroll(store, 1);
    await handleInboundReply(deps, { from: e.email, subject: "Re: hi", text: "We might redo the kitchen." });
    expect(store.enrollments[0].status).toBe("replied");
    expect(store.stages.get(e.dealId)).toBe("contacted");
    expect(notifyOwner).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a reply saying stop unsubscribes", async () => {
    const e = enroll(store, 1);
    await handleInboundReply(deps, { from: e.email, subject: "Re: hi", text: "Please remove me from your list" });
    expect(store.suppressed.get(e.email)).toBe("reply_stop");
    expect(store.enrollments[0].status).toBe("unsubscribed");
  });

  it("bounce and complaint events suppress the address", async () => {
    const e = enroll(store, 1);
    store.messages.push({ id: 9, enrollmentId: e.id, dealId: e.dealId, stepIndex: 0, toEmail: e.email, subject: "s", bodyText: "b", status: "sent", providerMessageId: "re_9" });
    await handleDeliveryEvent(deps, { type: "email.bounced", providerMessageId: "re_9", email: null });
    expect(store.suppressed.get(e.email)).toBe("bounce");
    expect(store.enrollments[0].status).toBe("bounced");
    await handleDeliveryEvent(deps, { type: "email.complained", providerMessageId: null, email: "other@example.com" });
    expect(store.suppressed.get("other@example.com")).toBe("complaint");
  });

  it("a click moves new → contacted and redirects only to a fixed site path", async () => {
    const e = enroll(store, 1);
    expect(await handleClick(deps, e.unsubscribeToken, 1, "design")).toBe("https://www.cabinetdealz.com/design");
    expect(store.stages.get(e.dealId)).toBe("contacted");
    expect(await handleClick(deps, e.unsubscribeToken, 1, "https://evil.example")).toBe("https://www.cabinetdealz.com/");
  });

  it("a design start moves the contact to qualified, but never moves a won deal", async () => {
    const e = enroll(store, 1);
    await noteDesignStart(deps, e.email.toUpperCase());
    expect(store.stages.get(e.dealId)).toBe("qualified");
    store.stages.set(e.dealId, "won");
    await noteDesignStart(deps, e.email);
    expect(store.stages.get(e.dealId)).toBe("won");
  });
});
