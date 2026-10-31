/**
 * Automatic 3D door audit (part of the door rendering audit).
 *
 * Admin-only: awaitingTom, needsAttention, counts, history, approve, reject, retry.
 * Public: designerModels, which returns ONLY models an admin approved.
 */
import { TRPCError } from "@trpc/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  doorModelAuditAttempts,
  doorModelAuditEvents,
  doorModelAudits,
  doorStyles,
} from "../../drizzle/schema";
import { DoorModelAuditError, type DoorModelAuditStatus } from "../../shared/doorModelAudit";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  approveDoorModel,
  createDrizzleDoorModelAuditStore,
  enqueueDoorModelAudit,
  rejectDoorModel,
  scheduleDoorModelAudit,
} from "../doorModelAudit";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function asTrpc(error: unknown): never {
  if (error instanceof DoorModelAuditError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  throw error;
}

const styleIdInput = z.object({ styleId: z.number().int().positive() });

async function auditCards(statuses: DoorModelAuditStatus[]) {
  const db = await requireDb();
  const audits = await db.select().from(doorModelAudits)
    .where(inArray(doorModelAudits.status, statuses))
    .orderBy(desc(doorModelAudits.updatedAt)).limit(200);
  if (!audits.length) return [];
  const styles = await db.select({
    id: doorStyles.id, ourName: doorStyles.ourName, distributorId: doorStyles.distributorId,
  }).from(doorStyles).where(inArray(doorStyles.id, audits.map((a) => a.styleId)));
  const styleById = new Map(styles.map((s) => [s.id, s]));
  const attemptIds = audits.map((a) => a.currentAttemptId).filter((id): id is number => id != null);
  const attempts = attemptIds.length
    ? await db.select().from(doorModelAuditAttempts).where(inArray(doorModelAuditAttempts.id, attemptIds))
    : [];
  const attemptById = new Map(attempts.map((a) => [a.id, a]));
  return audits.map((audit) => {
    const attempt = audit.currentAttemptId ? attemptById.get(audit.currentAttemptId) : undefined;
    let notes: Record<string, string> = {};
    try { notes = attempt?.checkNotes ? JSON.parse(attempt.checkNotes) : {}; } catch { notes = {}; }
    return {
      styleId: audit.styleId,
      styleName: styleById.get(audit.styleId)?.ourName ?? `Style ${audit.styleId}`,
      distributorId: styleById.get(audit.styleId)?.distributorId ?? null,
      status: audit.status,
      attemptCount: audit.attemptCount,
      maxAttempts: audit.maxAttempts,
      doorSampleUrl: audit.doorSampleUrl,
      drawerSampleUrl: audit.drawerSampleUrl,
      flaggedReasons: audit.flaggedReasons,
      tomFeedback: audit.tomFeedback,
      queuedAt: audit.queuedAt, generatingAt: audit.generatingAt, checkingAt: audit.checkingAt,
      flaggedAt: audit.flaggedAt, awaitingTomAt: audit.awaitingTomAt, decidedAt: audit.decidedAt,
      attempt: attempt ? {
        attemptNo: attempt.attemptNo,
        previews: {
          straight: attempt.straightPreviewUrl, threeQuarter: attempt.threeQuarterPreviewUrl, run: attempt.runPreviewUrl,
        },
        scores: {
          color: attempt.colorScore, grain: attempt.grainScore, profile: attempt.profileScore,
          proportions: attempt.proportionsScore, drawerFront: attempt.drawerFrontScore,
        },
        notes,
        reasons: attempt.reasons,
      } : null,
    };
  });
}

export const doorModelAuditRouter = router({
  /** Tom's approval queue: only models that passed the AI check. */
  awaitingTom: adminProcedure.query(() => auditCards(["awaiting_tom"])),

  /** Models that still failed after every attempt. Never shown in the approval queue. */
  needsAttention: adminProcedure.query(() => auditCards(["flagged"])),

  counts: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db.select({ status: doorModelAudits.status }).from(doorModelAudits);
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }),

  /** Attempt history and status timeline for one style. */
  history: adminProcedure.input(styleIdInput).query(async ({ input }) => {
    const db = await requireDb();
    const [audit] = await db.select().from(doorModelAudits).where(eq(doorModelAudits.styleId, input.styleId)).limit(1);
    if (!audit) return { audit: null, attempts: [], events: [] };
    const attempts = await db.select().from(doorModelAuditAttempts)
      .where(eq(doorModelAuditAttempts.auditId, audit.id)).orderBy(desc(doorModelAuditAttempts.attemptNo));
    const events = await db.select().from(doorModelAuditEvents)
      .where(eq(doorModelAuditEvents.auditId, audit.id)).orderBy(desc(doorModelAuditEvents.createdAt));
    return {
      audit: { status: audit.status, attemptCount: audit.attemptCount, maxAttempts: audit.maxAttempts, flaggedReasons: audit.flaggedReasons },
      attempts: attempts.map(({ modelSpec: _spec, ...rest }) => rest),
      events,
    };
  }),

  approve: adminProcedure.input(styleIdInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    try {
      return await approveDoorModel(createDrizzleDoorModelAuditStore(db), input.styleId, ctx.user.id);
    } catch (error) {
      return asTrpc(error);
    }
  }),

  reject: adminProcedure
    .input(styleIdInput.extend({ reason: z.string().trim().min(1, { message: "A reason is required." }).max(512) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      try {
        await rejectDoorModel(createDrizzleDoorModelAuditStore(db), input.styleId, ctx.user.id, input.reason);
      } catch (error) {
        return asTrpc(error);
      }
      scheduleDoorModelAudit(input.styleId);
      return { styleId: input.styleId, status: "queued" as const };
    }),

  /** Start a flagged or stale job over (fresh attempt budget). */
  retry: adminProcedure.input(styleIdInput).mutation(async ({ input }) => {
    const db = await requireDb();
    const result = await enqueueDoorModelAudit(createDrizzleDoorModelAuditStore(db), input.styleId, { force: true });
    if (result.queued) scheduleDoorModelAudit(input.styleId);
    return result;
  }),

  /** Designer: ONLY admin-approved models. Queued, checking, flagged, awaiting and rejected models never appear. */
  designerModels: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      styleId: doorModelAudits.styleId, modelSpec: doorModelAudits.approvedModelSpec,
    }).from(doorModelAudits).where(eq(doorModelAudits.status, "approved"));
    return rows.filter((row) => row.modelSpec);
  }),
});
