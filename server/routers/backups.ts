import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  BACKUP_STATUSES,
  backupHealth,
  isMissingBackupTable,
  lastSuccessAt,
  listRunRows,
  readSettings,
  settingsInput,
  writeSettings,
} from "../lib/backups";
import { DEFAULT_SCHEDULE } from "../../scripts/backup/schedule.mjs";

const NEEDS_UPDATE = { needsDatabaseUpdate: true as const, message: "The backup tables are not in the database yet. Run docs/sql/0285_backup_runs.tidb.sql in the TiDB editor, then reload." };

/** Run a read. A missing backup table becomes a friendly state instead of a raw failed query. */
async function guarded<T>(fn: (db: NonNullable<Awaited<ReturnType<typeof getDb>>>) => Promise<T>): Promise<T | typeof NEEDS_UPDATE> {
  const db = await getDb();
  if (!db) return { needsDatabaseUpdate: true as const, message: "The database is not reachable right now." };
  try {
    return await fn(db);
  } catch (error) {
    if (isMissingBackupTable(error)) return NEEDS_UPDATE;
    throw error;
  }
}

export const backupsRouter = router({
  listRuns: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(25),
      status: z.enum(BACKUP_STATUSES).optional(),
    }).default({ page: 1, pageSize: 25 }))
    .query(({ input }) => guarded(async (db) => ({ needsDatabaseUpdate: false as const, ...(await listRunRows(db, input)) }))),

  getSettings: adminProcedure.query(() =>
    guarded(async (db) => ({ needsDatabaseUpdate: false as const, defaults: DEFAULT_SCHEDULE, ...(await readSettings(db)) }))),

  summary: adminProcedure.query(() =>
    guarded(async (db) => {
      const last = await lastSuccessAt(db);
      return { needsDatabaseUpdate: false as const, lastSuccessAt: last, health: backupHealth(last) };
    })),

  updateSettings: adminProcedure.input(settingsInput).mutation(async ({ ctx, input }) => {
    const result = await guarded(async (db) => {
      await writeSettings(db, input, ctx.user.id);
      return { needsDatabaseUpdate: false as const, ...(await readSettings(db)) };
    });
    return result;
  }),
});
