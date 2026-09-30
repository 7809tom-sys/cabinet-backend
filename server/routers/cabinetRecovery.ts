import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { cabinets } from "../../drizzle/schema";
import {
  diffSnapshotAgainstRow,
  loggedChangesForCabinet,
  reapplyLoggedEdits,
  restoreCabinetFromSnapshot,
  restoreCabinetImage,
  scanRecoverableCabinets,
  snapshotCabinet,
  snapshotMany,
  snapshotsForCabinet,
} from "../lib/cabinetRecovery";

const actorOf = (ctx: { user?: { id?: number | null; name?: string | null } | null }) => ({
  id: ctx.user?.id ?? null,
  name: ctx.user?.name ?? null,
});

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

/**
 * Admin → Data Recovery. Finds every trace of recent cabinet edits that still
 * exists in the database and restores them: revert/replay logged field changes,
 * restore a whole cabinet from a snapshot, re-attach an uploaded image, and
 * protect cabinets with manual snapshots. Prices are never touched here.
 */
export const cabinetRecoveryRouter = router({
  scan: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7), cabinetId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      return scanRecoverableCabinets(db, { days: input?.days ?? 7, cabinetId: input?.cabinetId });
    }),

  cabinetDetail: adminProcedure
    .input(z.object({ cabinetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [live] = await db.select().from(cabinets).where(eq(cabinets.id, input.cabinetId)).limit(1);
      if (!live) throw new Error("Cabinet not found");
      const snapshots = await snapshotsForCabinet(db, input.cabinetId);
      const changes = await loggedChangesForCabinet(db, input.cabinetId, 30);
      return {
        live,
        changes,
        snapshots: snapshots.map((s) => ({
          ...s,
          diff: s.row ? diffSnapshotAgainstRow(s.row, live as unknown as Record<string, unknown>) : [],
        })),
      };
    }),

  snapshot: adminProcedure
    .input(z.object({ cabinetId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const id = await snapshotCabinet(db, { cabinetId: input.cabinetId, reason: "manual", actor: actorOf(ctx) });
      if (!id) throw new Error("Cabinet not found");
      return { ok: true, snapshotId: id };
    }),

  snapshotMany: adminProcedure
    .input(z.object({ cabinetIds: z.array(z.number().int().positive()).min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      return snapshotMany(db, { cabinetIds: input.cabinetIds, actor: actorOf(ctx), reason: "manual" });
    }),

  restoreSnapshot: adminProcedure
    .input(z.object({
      snapshotId: z.number().int().positive(),
      fields: z.array(z.string().min(1)).optional(),
      restoreOverrides: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      return restoreCabinetFromSnapshot(db, { ...input, actor: actorOf(ctx) });
    }),

  reapplyLoggedEdits: adminProcedure
    .input(z.object({ cabinetId: z.number().int().positive(), days: z.number().int().min(1).max(90).default(30) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      return reapplyLoggedEdits(db, { cabinetId: input.cabinetId, days: input.days, actor: actorOf(ctx) });
    }),

  restoreImage: adminProcedure
    .input(z.object({ cabinetId: z.number().int().positive(), url: z.string().min(1).max(512) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      return restoreCabinetImage(db, { cabinetId: input.cabinetId, url: input.url, actor: actorOf(ctx) });
    }),
});
