import { and, eq, inArray, sql } from "drizzle-orm";
import { doorModelAuditAttempts, doorModelAuditEvents, doorModelAudits, doorStyles } from "../drizzle/schema";
import {
  doorModelSourceFingerprint,
  type DoorModelAuditStatus,
} from "../shared/doorModelAudit";
import { getDb } from "./db";
import {
  enqueueDoorModelAudit,
  runDoorModelAudit,
  type AuditRunResult,
  type DoorModelAuditStore,
  type DoorModelChecker,
} from "./doorModelAuditCore";
import { checkDoorModelAgainstSample } from "./lib/doorModelAuditCheck";
import { httpDoorModelRenderer } from "./lib/doorModelRenderer";

const LOG_PREFIX = "[door-model-audit]";

function message(error: unknown): string {
  return (error instanceof Error ? error.message : "3D door audit failed").slice(0, 480);
}

export * from "./doorModelAuditCore";

// ─── drizzle store ───────────────────────────────────────

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const STATUS_TIME_COLUMN: Partial<Record<DoorModelAuditStatus, keyof typeof doorModelAudits.$inferInsert>> = {
  queued: "queuedAt", generating: "generatingAt", checking: "checkingAt", flagged: "flaggedAt",
  awaiting_tom: "awaitingTomAt", approved: "decidedAt", rejected: "decidedAt",
};

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

export function createDrizzleDoorModelAuditStore(db: Db): DoorModelAuditStore {
  const auditColumns = {
    id: doorModelAudits.id, styleId: doorModelAudits.styleId, status: doorModelAudits.status,
    sourceFingerprint: doorModelAudits.sourceFingerprint, doorSampleUrl: doorModelAudits.doorSampleUrl,
    drawerSampleUrl: doorModelAudits.drawerSampleUrl, attemptCount: doorModelAudits.attemptCount,
    maxAttempts: doorModelAudits.maxAttempts, claimToken: doorModelAudits.claimToken,
    currentAttemptId: doorModelAudits.currentAttemptId, approvedAttemptId: doorModelAudits.approvedAttemptId,
    approvedModelSpec: doorModelAudits.approvedModelSpec, tomFeedback: doorModelAudits.tomFeedback,
    flaggedReasons: doorModelAudits.flaggedReasons, errorMessage: doorModelAudits.errorMessage,
  };
  return {
    async loadStyle(styleId) {
      const [row] = await db.select({
        id: doorStyles.id, ourName: doorStyles.ourName, doorStyle: doorStyles.doorStyle, finish: doorStyles.finish,
        color: doorStyles.color, renderHex: doorStyles.renderHex,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl, drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
      }).from(doorStyles).where(eq(doorStyles.id, styleId)).limit(1);
      return row ?? null;
    },
    async loadAudit(styleId) {
      const [row] = await db.select(auditColumns).from(doorModelAudits).where(eq(doorModelAudits.styleId, styleId)).limit(1);
      return row ? { ...row, status: row.status as DoorModelAuditStatus } : null;
    },
    async upsertQueued({ styleId, source, maxAttempts, withdrawApproval }) {
      const values = {
        sourceFingerprint: doorModelSourceFingerprint(source),
        doorSampleUrl: source.doorSampleImageUrl!.trim(),
        drawerSampleUrl: source.drawerSampleImageUrl?.trim() || null,
        maxAttempts,
      };
      const reset = {
        ...values, status: "queued" as const, attemptCount: 0, claimToken: null, currentAttemptId: null,
        tomFeedback: null, flaggedReasons: null, errorMessage: null, queuedAt: new Date(),
        ...(withdrawApproval ? { approvedAttemptId: null, approvedModelSpec: null } : {}),
      };
      const existing = await db.select({ id: doorModelAudits.id }).from(doorModelAudits).where(eq(doorModelAudits.styleId, styleId)).limit(1);
      if (existing.length) {
        await db.update(doorModelAudits).set(reset).where(eq(doorModelAudits.styleId, styleId));
      } else {
        await db.insert(doorModelAudits).values({ styleId, ...reset });
      }
    },
    async claim(styleId, token) {
      const result = await db.update(doorModelAudits)
        .set({ status: "generating", claimToken: token, generatingAt: new Date() })
        .where(and(eq(doorModelAudits.styleId, styleId), inArray(doorModelAudits.status, ["queued", "rejected"])));
      return affected(result) > 0;
    },
    async updateAudit(styleId, patch) {
      const { stampStatusTime, ...fields } = patch;
      const set: Record<string, unknown> = { ...fields };
      if (stampStatusTime && patch.status) {
        const column = STATUS_TIME_COLUMN[patch.status];
        if (column) set[column] = new Date();
      }
      await db.update(doorModelAudits).set(set).where(eq(doorModelAudits.styleId, styleId));
    },
    async insertAttempt(input) {
      const [result] = await db.insert(doorModelAuditAttempts).values(input);
      return Number((result as { insertId?: number }).insertId ?? 0);
    },
    async updateAttempt(id, patch) {
      const { scores, notes, ...rest } = patch;
      await db.update(doorModelAuditAttempts).set({
        ...rest,
        ...(scores ? {
          colorScore: scores.color, grainScore: scores.grain, profileScore: scores.profile,
          proportionsScore: scores.proportions, drawerFrontScore: scores.drawerFront,
        } : {}),
        ...(notes ? { checkNotes: JSON.stringify(notes) } : {}),
      }).where(eq(doorModelAuditAttempts.id, id));
    },
    async loadAttempt(id) {
      const [row] = await db.select({
        id: doorModelAuditAttempts.id, auditId: doorModelAuditAttempts.auditId, attemptNo: doorModelAuditAttempts.attemptNo,
        modelSpec: doorModelAuditAttempts.modelSpec, straightPreviewUrl: doorModelAuditAttempts.straightPreviewUrl,
        threeQuarterPreviewUrl: doorModelAuditAttempts.threeQuarterPreviewUrl, runPreviewUrl: doorModelAuditAttempts.runPreviewUrl,
        passed: doorModelAuditAttempts.passed, reasons: doorModelAuditAttempts.reasons,
      }).from(doorModelAuditAttempts).where(eq(doorModelAuditAttempts.id, id)).limit(1);
      return row ?? null;
    },
    async attemptCount(auditId) {
      const [row] = await db.select({ n: sql<number>`count(*)` }).from(doorModelAuditAttempts).where(eq(doorModelAuditAttempts.auditId, auditId));
      return Number(row?.n ?? 0);
    },
    async recordEvent(input) {
      await db.insert(doorModelAuditEvents).values({
        auditId: input.auditId, styleId: input.styleId, fromStatus: input.fromStatus, toStatus: input.toStatus,
        attemptNo: input.attemptNo ?? null, actorUserId: input.actorUserId ?? null, note: input.note?.slice(0, 1000) ?? null,
      });
    },
  };
}

export const defaultDoorModelAuditDeps = {
  renderer: httpDoorModelRenderer,
  checker: ((input) => checkDoorModelAgainstSample(input)) as DoorModelChecker,
};

export async function runQueuedDoorModelAudit(styleId: number, options?: { force?: boolean }): Promise<AuditRunResult> {
  const db = await getDb();
  if (!db) return { outcome: "skipped", reason: "database-unavailable" };
  const store = createDrizzleDoorModelAuditStore(db);
  const queued = await enqueueDoorModelAudit(store, styleId, { force: options?.force });
  const audit = await store.loadAudit(styleId);
  // A rejection or manual retry may already have queued the job.
  if (!queued.queued && audit?.status !== "queued") return { outcome: "skipped", reason: queued.reason };
  return runDoorModelAudit(store, defaultDoorModelAuditDeps, styleId);
}

/** Fire-and-forget after a door/drawer sample photo save or new model/render. */
export function scheduleDoorModelAudit(styleId: number, options?: { force?: boolean }): void {
  setImmediate(() => {
    void runQueuedDoorModelAudit(styleId, options).catch((error) => {
      console.error(`${LOG_PREFIX} style ${styleId} background run failed:`, message(error));
    });
  });
}

export function scheduleDoorModelAuditForStyles(styleIds: number[]): void {
  for (const styleId of Array.from(new Set(styleIds))) scheduleDoorModelAudit(styleId);
}

