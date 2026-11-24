import crypto from "node:crypto";
import { z } from "zod";
import { desc, eq, and, sql } from "drizzle-orm";
import { backupRuns, backupSettings, users } from "../../drizzle/schema";
import {
  DEFAULT_SCHEDULE,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  isValidDailyTime,
  isValidTimezone,
} from "../../scripts/backup/schedule.mjs";

export const BACKUP_STATUSES = ["running", "success", "partial", "failed"] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];
export const BACKUP_SCOPES = ["supabase_storage", "database", "code"] as const;
/** A run still "running" after this long is shown as failed (the PC script died). */
export const STALE_RUNNING_HOURS = 8;
export const WARN_AFTER_HOURS = 26;
export const RED_AFTER_HOURS = 50;

/** Constant-time check of the shared secret. Both sides are hashed so lengths never leak. */
export function tokenMatches(provided: unknown, expected: string | undefined): boolean {
  if (!expected || typeof provided !== "string" || provided.length === 0) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** The tables come from SQL Tom runs by hand. Until then, answer with a friendly state, not a raw failed query. */
export function isMissingBackupTable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = error;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { message?: unknown; cause?: unknown; code?: unknown; errno?: unknown };
    const message = typeof e.message === "string" ? e.message : "";
    if (/backup_(runs|settings)/i.test(message) && /doesn't exist|does not exist|unknown table|no such table/i.test(message)) return true;
    if ((e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146) && /backup_/i.test(message)) return true;
    cur = e.cause;
  }
  return false;
}

export const settingsInput = z.object({
  dailyTime: z.string().refine(isValidDailyTime, "Use 24-hour HH:MM, for example 03:00."),
  timezone: z.string().refine(isValidTimezone, "Use a time zone name such as America/New_York."),
  retentionDays: z.number().int().min(MIN_RETENTION_DAYS, `Keep at least ${MIN_RETENTION_DAYS} days.`).max(MAX_RETENTION_DAYS, `Keep at most ${MAX_RETENTION_DAYS} days.`),
});

const isoDate = z.string().datetime({ offset: true });
export const reportInput = z.object({
  event: z.enum(["start", "finish"]),
  runId: z.number().int().positive().optional(),
  machineName: z.string().trim().max(128).default(""),
  destination: z.string().trim().max(512).default(""),
  scope: z.array(z.enum(BACKUP_SCOPES)).max(3).default([]),
  startedAt: isoDate.optional(),
  finishedAt: isoDate.optional(),
  status: z.enum(BACKUP_STATUSES).optional(),
  fileCount: z.number().int().min(0).max(2_000_000_000).optional(),
  totalBytes: z.number().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  snapshotFolder: z.string().trim().max(512).default(""),
  errorSummary: z.string().max(5000).default(""),
});
export type ReportInput = z.infer<typeof reportInput>;

export function effectiveStatus(row: { status: BackupStatus; startedAt: Date; finishedAt: Date | null }, now = new Date()): BackupStatus {
  if (row.status === "running" && now.getTime() - row.startedAt.getTime() > STALE_RUNNING_HOURS * 3_600_000) return "failed";
  return row.status;
}

export type BackupHealth = { level: "ok" | "amber" | "red"; hoursSinceSuccess: number | null; message: string };
export function backupHealth(lastSuccessAt: Date | null, now = new Date()): BackupHealth {
  if (!lastSuccessAt) return { level: "amber", hoursSinceSuccess: null, message: "No successful backup has been recorded yet." };
  const hours = (now.getTime() - lastSuccessAt.getTime()) / 3_600_000;
  const rounded = Math.floor(hours);
  if (hours > RED_AFTER_HOURS) return { level: "red", hoursSinceSuccess: rounded, message: `No successful backup in ${rounded} hours.` };
  if (hours > WARN_AFTER_HOURS) return { level: "amber", hoursSinceSuccess: rounded, message: `No successful backup in ${rounded} hours.` };
  return { level: "ok", hoursSinceSuccess: rounded, message: "Backups are current." };
}

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export async function readSettings(db: Db) {
  const [row] = await db
    .select({
      dailyTime: backupSettings.dailyTime,
      timezone: backupSettings.timezone,
      retentionDays: backupSettings.retentionDays,
      updatedAt: backupSettings.updatedAt,
      updatedByName: users.name,
    })
    .from(backupSettings)
    .leftJoin(users, eq(backupSettings.updatedBy, users.id))
    .where(eq(backupSettings.id, 1))
    .limit(1);
  if (!row) return { ...DEFAULT_SCHEDULE, updatedAt: null as Date | null, updatedByName: null as string | null };
  return row;
}

export async function writeSettings(db: Db, input: z.infer<typeof settingsInput>, userId: number) {
  await db
    .insert(backupSettings)
    .values({ id: 1, ...input, updatedBy: userId })
    .onDuplicateKeyUpdate({ set: { ...input, updatedBy: userId } });
}

export async function lastSuccessAt(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(coalesce(${backupRuns.finishedAt}, ${backupRuns.startedAt}))` })
    .from(backupRuns)
    .where(eq(backupRuns.status, "success"));
  return row?.at ? new Date(row.at as unknown as string) : null;
}

export async function listRunRows(db: Db, opts: { page: number; pageSize: number; status?: BackupStatus }) {
  const where = opts.status ? and(eq(backupRuns.status, opts.status)) : undefined;
  const rows = await db.select().from(backupRuns).where(where).orderBy(desc(backupRuns.startedAt), desc(backupRuns.id)).limit(opts.pageSize).offset((opts.page - 1) * opts.pageSize);
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(backupRuns).where(where);
  const now = new Date();
  return {
    total: Number(n),
    rows: rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      machineName: r.machineName,
      destination: r.destination,
      scope: r.scope ? r.scope.split(",").filter(Boolean) : [],
      status: effectiveStatus({ status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt }, now),
      fileCount: r.fileCount,
      totalBytes: Number(r.totalBytes),
      snapshotFolder: r.snapshotFolder,
      errorSummary: r.errorSummary,
    })),
  };
}

/** Start inserts a row. Finish updates it by runId (or inserts a finished row if the start was never reported). */
export async function upsertRun(db: Db, input: ReportInput): Promise<number> {
  const scope = input.scope.join(",");
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  if (input.event === "start") {
    const [res] = await db.insert(backupRuns).values({
      startedAt, machineName: input.machineName, destination: input.destination, scope, status: "running",
    });
    return Number((res as { insertId?: number }).insertId);
  }
  const finished = {
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : new Date(),
    machineName: input.machineName, destination: input.destination, scope,
    status: input.status ?? "failed",
    fileCount: input.fileCount ?? 0, totalBytes: Math.round(input.totalBytes ?? 0),
    snapshotFolder: input.snapshotFolder, errorSummary: input.errorSummary.slice(0, 2000),
  };
  if (input.runId) {
    const [res] = await db.update(backupRuns).set(finished).where(eq(backupRuns.id, input.runId));
    if (Number((res as { affectedRows?: number }).affectedRows ?? 1) > 0) return input.runId;
  }
  const [res] = await db.insert(backupRuns).values({ startedAt, ...finished });
  return Number((res as { insertId?: number }).insertId);
}
