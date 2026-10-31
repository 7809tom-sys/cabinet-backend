import { describe, expect, it } from "vitest";
import {
  approveDoorModel,
  enqueueDoorModelAudit,
  rejectDoorModel,
  runDoorModelAudit,
  type AttemptPatch,
  type AuditPatch,
  type AuditRow,
  type AuditStyleRow,
  type DoorModelAuditStore,
  type NewAttempt,
} from "./doorModelAuditCore";
import { isLiveInDesigner, type DoorModelAuditStatus } from "../shared/doorModelAudit";

const STYLE: AuditStyleRow = {
  id: 7,
  ourName: "Shaker White",
  doorStyle: "Shaker",
  finish: "Painted",
  color: "White",
  renderHex: "#ffffff",
  doorSampleImageUrl: "/manus-storage/door.jpg",
  drawerSampleImageUrl: "/manus-storage/drawer.jpg",
};

type Attempt = NewAttempt & AttemptPatch & { id: number };

function memoryStore(style: AuditStyleRow = STYLE) {
  let audit: AuditRow | null = null;
  const attempts: Attempt[] = [];
  const events: Array<{ from: DoorModelAuditStatus | null; to: DoorModelAuditStatus; actor: number | null }> = [];
  const store: DoorModelAuditStore = {
    async loadStyle() { return style; },
    async loadAudit() { return audit ? { ...audit } : null; },
    async upsertQueued({ styleId, source, maxAttempts, withdrawApproval }) {
      audit = {
        id: 1, styleId, status: "queued", sourceFingerprint: "fp:" + source.doorSampleImageUrl + source.drawerSampleImageUrl,
        doorSampleUrl: source.doorSampleImageUrl!, drawerSampleUrl: source.drawerSampleImageUrl, attemptCount: 0, maxAttempts,
        claimToken: null, currentAttemptId: null,
        approvedAttemptId: withdrawApproval ? null : audit?.approvedAttemptId ?? null,
        approvedModelSpec: withdrawApproval ? null : audit?.approvedModelSpec ?? null,
        tomFeedback: null, flaggedReasons: null, errorMessage: null,
      };
    },
    async claim(_id, token) {
      if (!audit || !["queued", "rejected"].includes(audit.status)) return false;
      audit = { ...audit, status: "generating", claimToken: token };
      return true;
    },
    async updateAudit(_id, patch: AuditPatch) {
      const { stampStatusTime: _s, ...rest } = patch;
      audit = { ...audit!, ...rest };
    },
    async insertAttempt(input) { attempts.push({ ...input, id: attempts.length + 1 }); return attempts.length; },
    async updateAttempt(id, patch) { Object.assign(attempts[id - 1], patch); },
    async loadAttempt(id) {
      const a = attempts[id - 1];
      return a ? {
        id: a.id, auditId: a.auditId, attemptNo: a.attemptNo, modelSpec: a.modelSpec ?? null,
        straightPreviewUrl: a.straightPreviewUrl ?? null, threeQuarterPreviewUrl: a.threeQuarterPreviewUrl ?? null,
        runPreviewUrl: a.runPreviewUrl ?? null, passed: a.passed ?? null, reasons: a.reasons ?? null,
      } : null;
    },
    async attemptCount() { return attempts.length; },
    async recordEvent(e) { events.push({ from: e.fromStatus, to: e.toStatus, actor: e.actorUserId ?? null }); },
  };
  return { store, attempts, events, audit: () => audit! };
}

const renderer = (configured = true) => ({
  configured: () => configured,
  render: async (req: { attemptNo: number }) => ({
    modelSpec: JSON.stringify({ attempt: req.attemptNo }),
    previews: { straight: "/s.png", threeQuarter: "/t.png", run: "/r.png" },
  }),
});

const scores = (v: number, over: Partial<Record<string, number>> = {}) => ({
  scores: { color: v, grain: v, profile: v, proportions: v, drawerFront: v, ...over } as never,
  notes: { color: "", grain: "", profile: "", proportions: "", drawerFront: "" },
  model: "test",
});

const quiet = { log: () => {}, newToken: () => "tok" };

describe("automatic 3D door audit", () => {
  it("a passing model reaches the approval queue and is NOT live until Tom approves", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7);
    const result = await runDoorModelAudit(m.store, { renderer: renderer(), checker: async () => scores(9) }, 7, quiet);
    expect(result.outcome).toBe("awaiting_tom");
    expect(m.audit().status).toBe("awaiting_tom");
    expect(isLiveInDesigner(m.audit().status)).toBe(false);
    expect(m.audit().approvedModelSpec).toBeNull();
    await approveDoorModel(m.store, 7, 99);
    expect(m.audit().status).toBe("approved");
    expect(m.audit().approvedModelSpec).toBe(JSON.stringify({ attempt: 1 }));
    expect(m.events.at(-1)).toEqual({ from: "awaiting_tom", to: "approved", actor: 99 });
  });

  it("a failing model is revised and re-checked, then reaches the queue on a later pass", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7);
    let n = 0;
    const checker = async () => (++n < 3 ? scores(9, { grain: 4 }) : scores(8));
    const result = await runDoorModelAudit(m.store, { renderer: renderer(), checker }, 7, quiet);
    expect(result.outcome).toBe("awaiting_tom");
    expect(m.attempts).toHaveLength(3);
    expect(m.attempts[1].trigger).toBe("auto_revision");
    expect(m.attempts[1].feedbackUsed).toContain("Grain / texture 4/10");
  });

  it("a model that fails every attempt is flagged with reasons and never reaches the approval queue", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7, { maxAttempts: 2 });
    const result = await runDoorModelAudit(
      m.store, { renderer: renderer(), checker: async () => scores(9, { profile: 3 }) }, 7, quiet,
    );
    expect(result.outcome).toBe("flagged");
    expect(m.attempts).toHaveLength(2);
    expect(m.audit().status).toBe("flagged");
    expect(m.audit().flaggedReasons).toContain("Profile");
    expect(m.audit().status).not.toBe("awaiting_tom");
    await expect(approveDoorModel(m.store, 7, 99)).rejects.toThrow(/awaiting approval/);
  });

  it("defaults to three attempts", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7);
    expect(m.audit().maxAttempts).toBe(3);
  });

  it("is flagged, never queued, when no 3D renderer is configured", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7);
    const result = await runDoorModelAudit(m.store, { renderer: renderer(false), checker: async () => scores(10) }, 7, quiet);
    expect(result.outcome).toBe("flagged");
    expect(m.audit().flaggedReasons).toContain("DOOR_MODEL_RENDERER_URL");
  });

  it("reject needs a reason, goes back to generation, and the reason reaches the renderer", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7);
    await runDoorModelAudit(m.store, { renderer: renderer(), checker: async () => scores(9) }, 7, quiet);
    await expect(rejectDoorModel(m.store, 7, 99, "  ")).rejects.toThrow(/reason/);
    await rejectDoorModel(m.store, 7, 99, "Rails too wide");
    expect(m.audit().status).toBe("queued");
    expect(m.audit().approvedModelSpec).toBeNull();
    const seen: Array<string | null> = [];
    const spy = { configured: () => true, render: async (r: { feedback: string | null; attemptNo: number }) => { seen.push(r.feedback); return renderer().render(r); } };
    await runDoorModelAudit(m.store, { renderer: spy as never, checker: async () => scores(9) }, 7, quiet);
    expect(seen[0]).toBe("Rails too wide");
    expect(m.attempts.at(-1)!.trigger).toBe("tom_rejection");
    expect(m.audit().status).toBe("awaiting_tom");
  });

  it("only approves a model that is awaiting approval", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7);
    await expect(approveDoorModel(m.store, 7, 99)).rejects.toThrow();
    expect(m.audit().approvedModelSpec).toBeNull();
  });

  it("a changed photo withdraws an earlier approval and re-queues", async () => {
    const m = memoryStore();
    await enqueueDoorModelAudit(m.store, 7);
    await runDoorModelAudit(m.store, { renderer: renderer(), checker: async () => scores(9) }, 7, quiet);
    await approveDoorModel(m.store, 7, 99);
    const changed = { ...STYLE, doorSampleImageUrl: "/manus-storage/new-door.jpg" };
    m.store.loadStyle = async () => changed;
    const result = await enqueueDoorModelAudit(m.store, 7);
    expect(result).toEqual({ queued: true, reason: "source-changed" });
    expect(m.audit().status).toBe("queued");
    expect(m.audit().approvedModelSpec).toBeNull();
  });
});
