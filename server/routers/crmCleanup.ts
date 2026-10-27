import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { crmCleanupAudit, crmCleanupBackupRows, crmCleanupPreviews } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { planToCsv } from "../crmCleanup/csv";
import { executeCleanup, finishCleanupAudit } from "../crmCleanup/execute";
import { loadCleanupDataset } from "../crmCleanup/load";
import { CleanupPlanError, buildCleanupPlan, type BuildPlanInput } from "../crmCleanup/plan";
import { summarizePlan } from "../crmCleanup/summary";
import { deleteSupabaseAuthUsers } from "../crmCleanup/supabaseAuth";
import { assertSnapshotMatch, canonicalSnapshot, hashSnapshot, type CanonicalSnapshot, SnapshotMismatchError } from "../crmCleanup/snapshot";

const previewInput = z.object({
  keepUserIds: z.array(z.number().int().positive()).max(30).optional(),
  alsoDeleteUserIds: z.array(z.number().int().positive()).max(20000).optional(),
  deleteSupabaseAuth: z.boolean().optional(),
});

const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

function database() {
  return getDb();
}

async function buildForActor(args: {
  actorUserId: number;
  keepUserIds?: number[];
  alsoDeleteUserIds?: number[];
  deleteSupabaseAuth?: boolean;
}) {
  const db = await database();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  let dataset: Omit<BuildPlanInput, "actorUserId" | "keepUserIds" | "alsoDeleteUserIds" | "deleteSupabaseAuth" | "ownerEmail" | "ownerOpenId">;
  try {
    dataset = await loadCleanupDataset(db);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read CRM tables";
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  }
  try {
    const plan = buildCleanupPlan({
      ...dataset,
      actorUserId: args.actorUserId,
      keepUserIds: args.keepUserIds,
      alsoDeleteUserIds: args.alsoDeleteUserIds,
      deleteSupabaseAuth: args.deleteSupabaseAuth,
      ownerEmail: ENV.ownerEmail,
      ownerOpenId: ENV.ownerOpenId,
    });
    return { db, plan };
  } catch (error) {
    if (error instanceof CleanupPlanError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}

export const crmCleanupRouter = router({
  /** Read-only. Stores a snapshot and deletes nothing. */
  preview: adminProcedure.input(previewInput).mutation(async ({ ctx, input }) => {
    const { db, plan } = await buildForActor({
      actorUserId: ctx.user.id,
      keepUserIds: input.keepUserIds,
      alsoDeleteUserIds: input.alsoDeleteUserIds,
      deleteSupabaseAuth: input.deleteSupabaseAuth,
    });
    const snapshot = canonicalSnapshot(plan);
    const planHash = hashSnapshot(snapshot);
    const summary = summarizePlan(plan);
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
    const [inserted] = await db.insert(crmCleanupPreviews).values({
      actorUserId: ctx.user.id,
      planHash,
      keepUserIdsJson: plan.keepUserIds,
      alsoDeleteUserIdsJson: plan.alsoDeleteUserIds,
      deleteSupabaseAuth: plan.deleteSupabaseAuth,
      snapshotJson: snapshot as unknown as Record<string, unknown>,
      countsJson: summary.totals as unknown as Record<string, unknown>,
      expiresAt,
    });
    return {
      snapshotId: Number(inserted.insertId),
      planHash,
      expiresAt: expiresAt.toISOString(),
      deleteSupabaseAuth: plan.deleteSupabaseAuth,
      ...summary,
    };
  }),

  /** Read-only CSV of every keep and delete row in a preview that still matches the database. */
  csv: adminProcedure.input(z.object({ snapshotId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await database();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const preview = await loadOwnedPreview(db, input.snapshotId, ctx.user.id);
    const { plan } = await buildForActor({
      actorUserId: ctx.user.id,
      keepUserIds: preview.keepUserIdsJson ?? [],
      alsoDeleteUserIds: preview.alsoDeleteUserIdsJson ?? [],
      deleteSupabaseAuth: preview.deleteSupabaseAuth,
    });
    try {
      assertSnapshotMatch(preview.snapshotJson as CanonicalSnapshot, canonicalSnapshot(plan));
    } catch (error) {
      if (error instanceof SnapshotMismatchError) {
        throw new TRPCError({ code: "CONFLICT", message: error.message });
      }
      throw error;
    }
    return { filename: `crm-cleanup-${input.snapshotId}.csv`, csv: planToCsv(plan) };
  }),

  confirm: adminProcedure
    .input(
      z.object({
        snapshotId: z.number().int().positive(),
        confirmation: z.literal("DELETE"),
        deleteSupabaseAuth: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const preview = await loadOwnedPreview(db, input.snapshotId, ctx.user.id);
      if (preview.deleteSupabaseAuth !== input.deleteSupabaseAuth) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The Supabase option changed. Build a new preview before deleting.",
        });
      }
      const { plan } = await buildForActor({
        actorUserId: ctx.user.id,
        keepUserIds: preview.keepUserIdsJson ?? [],
        alsoDeleteUserIds: preview.alsoDeleteUserIdsJson ?? [],
        deleteSupabaseAuth: preview.deleteSupabaseAuth,
      });
      const recomputed = canonicalSnapshot(plan);
      try {
        assertSnapshotMatch(preview.snapshotJson as CanonicalSnapshot, recomputed);
      } catch (error) {
        if (error instanceof SnapshotMismatchError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
      if (hashSnapshot(recomputed) !== preview.planHash) {
        throw new TRPCError({ code: "CONFLICT", message: "The CRM data changed since this preview. Build a new preview before deleting." });
      }
      try {
        const result = await executeCleanup(db, {
          previewId: preview.id,
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? null,
          actorEmail: ctx.user.email ?? null,
          snapshot: recomputed,
        });
        let supabaseDeleted = 0;
        let supabaseFailed = 0;
        if (recomputed.deleteSupabaseAuth && recomputed.supabaseAuthIds.length > 0) {
          const auth = await deleteSupabaseAuthUsers(recomputed.supabaseAuthIds);
          supabaseDeleted = auth.deleted.length;
          supabaseFailed = auth.failed.length;
        }
        const counts = {
          ...summarizePlan(plan).totals,
          deletedByTable: result.deletedByTable,
          supabaseDeleted,
          supabaseFailed,
        };
        await finishCleanupAudit(db, result.auditId, counts, { deleted: supabaseDeleted, failed: supabaseFailed });
        return { auditId: result.auditId, counts, supabaseDeleted, supabaseFailed };
      } catch (error) {
        const message = error instanceof Error ? error.message : "CRM cleanup failed";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  backup: adminProcedure.input(z.object({ auditId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await database();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [audit] = await db.select().from(crmCleanupAudit).where(eq(crmCleanupAudit.id, input.auditId)).limit(1);
    if (!audit) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cleanup backup not found." });
    }
    const rows = await db
      .select({
        tableName: crmCleanupBackupRows.tableName,
        rowPk: crmCleanupBackupRows.rowPk,
        rowJson: crmCleanupBackupRows.rowJson,
      })
      .from(crmCleanupBackupRows)
      .where(eq(crmCleanupBackupRows.auditId, input.auditId));
    return {
      auditId: audit.id,
      status: audit.status,
      createdAt: audit.createdAt,
      rowCount: rows.length,
      rows,
    };
  }),

  audits: adminProcedure.query(async () => {
    const db = await database();
    if (!db) return [];
    const rows = await db
      .select({
        id: crmCleanupAudit.id,
        previewId: crmCleanupAudit.previewId,
        actorUserId: crmCleanupAudit.actorUserId,
        actorName: crmCleanupAudit.actorName,
        actorEmail: crmCleanupAudit.actorEmail,
        status: crmCleanupAudit.status,
        countsJson: crmCleanupAudit.countsJson,
        supabaseOptIn: crmCleanupAudit.supabaseOptIn,
        supabaseDeleted: crmCleanupAudit.supabaseDeleted,
        supabaseFailed: crmCleanupAudit.supabaseFailed,
        createdAt: crmCleanupAudit.createdAt,
        finishedAt: crmCleanupAudit.finishedAt,
        errorMessage: crmCleanupAudit.errorMessage,
      })
      .from(crmCleanupAudit)
      .orderBy(desc(crmCleanupAudit.id))
      .limit(25);
    return rows;
  }),
});

async function loadOwnedPreview(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  snapshotId: number,
  actorUserId: number,
) {
  const [preview] = await db.select().from(crmCleanupPreviews).where(eq(crmCleanupPreviews.id, snapshotId)).limit(1);
  if (!preview || preview.actorUserId !== actorUserId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Cleanup preview not found." });
  }
  if (new Date(preview.expiresAt).getTime() < Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This preview expired. Build a new preview." });
  }
  return preview;
}
