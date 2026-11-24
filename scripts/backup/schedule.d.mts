export const DEFAULT_SCHEDULE: Readonly<{ dailyTime: string; timezone: string; retentionDays: number }>;
export const MIN_RETENTION_DAYS: number;
export const MAX_RETENTION_DAYS: number;
export function isValidDailyTime(value: unknown): boolean;
export function isValidTimezone(value: unknown): boolean;
export function isValidRetentionDays(value: unknown): boolean;
export function localParts(now: Date, timezone: string): { date: string; minutes: number };
export function isBackupDue(args: { now?: Date; dailyTime: string; timezone: string; doneDates?: string[] }): {
  due: boolean;
  reason: "invalid-schedule" | "already-done-today" | "before-scheduled-time" | "scheduled-time-passed";
  today: string | null;
};
